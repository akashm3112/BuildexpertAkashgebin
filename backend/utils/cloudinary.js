const cloudinary = require('cloudinary').v2;
require('dotenv').config({ path: './config.env' });
const logger = require('./logger');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});


// Check if Cloudinary credentials are valid
const isCloudinaryConfigured = () => {
  const isConfigured = process.env.CLOUDINARY_CLOUD_NAME && 
         process.env.CLOUDINARY_API_KEY && 
         process.env.CLOUDINARY_API_SECRET &&
         process.env.CLOUDINARY_CLOUD_NAME !== 'dxqjqjqjq'; // Check if it's not the placeholder
  
  // Log configuration status only if not configured (for troubleshooting)
  if (!isConfigured) {
    logger.warn('Cloudinary not configured', {
      cloudName: process.env.CLOUDINARY_CLOUD_NAME ? 'Set' : 'Not set',
      apiKey: process.env.CLOUDINARY_API_KEY ? 'Set' : 'Not set',
      apiSecret: process.env.CLOUDINARY_API_SECRET ? 'Set' : 'Not set'
    });
  }
  
  return isConfigured;
};

// Upload image to Cloudinary with circuit breaker and retry logic
const uploadImage = async (imageFile, folder = 'buildxpert') => {
  const { breakers } = require('./circuitBreaker');
  const { withUploadRetry } = require('./retryLogic');
  const { CloudinaryError, FileUploadError } = require('./errorTypes');
  
  try {
    // PRODUCTION: Cloudinary configuration is required
    const configured = isCloudinaryConfigured();
    
    if (!configured) {
      logger.error('Cloudinary not configured - upload cannot proceed', {
        folder,
        cloudName: process.env.CLOUDINARY_CLOUD_NAME ? 'Set' : 'Not set',
        apiKey: process.env.CLOUDINARY_API_KEY ? 'Set' : 'Not set',
        apiSecret: process.env.CLOUDINARY_API_SECRET ? 'Set' : 'Not set'
      });
      throw new Error('Cloudinary is not configured. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET environment variables.');
    }
    
    // PRODUCTION: Only accept base64 data URLs or Cloudinary URLs
    // Reject file:// URIs as they cannot be uploaded to Cloudinary from the server
    let uploadData;
    
    if (imageFile.startsWith('data:image')) {
      uploadData = imageFile;
    } else if (imageFile.startsWith('file://')) {
      // PRODUCTION FIX: Reject file:// URIs - they should have been converted to base64 by the frontend
      logger.error('File URI received - should have been converted to base64 by frontend', {
        imagePreview: imageFile.substring(0, 100)
      });
      throw new Error('File URIs cannot be uploaded directly. Images must be converted to base64 before sending to backend.');
    } else if (imageFile.startsWith('http://') || imageFile.startsWith('https://')) {
      // Already a Cloudinary URL - return as is (for edit mode)
      uploadData = imageFile;
    } else {
      // Unknown format - try to use as-is but log warning
      logger.warn('Unknown image format, attempting upload', {
        imagePreview: imageFile.substring(0, 100)
      });
      uploadData = imageFile;
    }

    // Determine optimization profile based on folder
    let optimizationProfile = 'general';
    if (folder.includes('profile') || folder.includes('profile-pictures')) {
      optimizationProfile = 'profile';
    } else if (folder.includes('working-proof') || folder.includes('working-proofs')) {
      optimizationProfile = 'workingProof';
    } else if (folder.includes('certificate') || folder.includes('certificates')) {
      optimizationProfile = 'certificate';
    }
    
    // Get optimized transformations based on profile
    const { getCloudinaryTransformations } = require('./imageOptimization');
    const transformations = getCloudinaryTransformations(optimizationProfile);
    
    // Upload with circuit breaker and retry logic
    const uploadWithProtection = async () => {
      return await breakers.cloudinary.execute(
        async () => {
          const result = await cloudinary.uploader.upload(uploadData, {
            folder: folder,
            resource_type: 'auto',
            transformation: transformations,
            timeout: 60000, // 60 second timeout
            // Enable automatic format optimization (use fetch_format, not format)
            fetch_format: 'auto',
            // Enable automatic quality optimization
            quality: 'auto:good',
            // Generate optimized versions for common sizes (eager transformations)
            eager: [
              { width: 400, crop: 'limit', quality: 'auto:good' },
              { width: 800, crop: 'limit', quality: 'auto:good' },
              { width: 1280, crop: 'limit', quality: 'auto:good' }
            ],
            eager_async: false
          });
          
          return {
            success: true,
            url: result.secure_url,
            public_id: result.public_id,
            width: result.width,
            height: result.height,
            format: result.format,
            size: result.bytes
          };
        },
        // PRODUCTION: No fallback - throw error if circuit breaker is open
        async () => {
          logger.error('Cloudinary circuit breaker is open - upload cannot proceed', {
            folder
          });
          throw new Error('Cloudinary service is temporarily unavailable. Please try again later.');
        }
      );
    };
    
    // Execute with retry logic
    return await withUploadRetry(uploadWithProtection, `upload to Cloudinary (${folder})`);
    
  } catch (error) {
    logger.error('Cloudinary upload error', {
      message: error.message,
      http_code: error.http_code,
      name: error.name,
      stack: error.stack,
      folder
    });
    
    // PRODUCTION: Always throw error - no mock URL fallback
    throw new CloudinaryError(`Failed to upload image to Cloudinary: ${error.message || 'Unknown error'}`, {
      originalError: error,
      folder
    });
  }
};

// Upload multiple images to Cloudinary
const uploadMultipleImages = async (imageFiles, folder = 'buildxpert') => {
  try {
    const uploadPromises = imageFiles.map((imageFile) => {
      return uploadImage(imageFile, folder);
    });
    
    const results = await Promise.all(uploadPromises);
    
    const successfulUploads = results.filter(result => result.success);
    const failedUploads = results.filter(result => !result.success);
    
    if (failedUploads.length > 0) {
      logger.warn('Some images failed to upload', {
        folder,
        total: imageFiles.length,
        successful: successfulUploads.length,
        failed: failedUploads.length
      });
    }
    
    return {
      success: true, // Always return success since we have fallback
      urls: successfulUploads.map(result => result.url),
      public_ids: successfulUploads.map(result => result.public_id),
      failed: failedUploads.length,
      errors: failedUploads.map(result => result.error)
    };
  } catch (error) {
    logger.error('Multiple images upload error', {
      message: error.message,
      stack: error.stack,
      folder,
      imageCount: imageFiles.length
    });
    
    // PRODUCTION: Always throw error - no mock URL fallback
    throw new CloudinaryError(`Failed to upload images to Cloudinary: ${error.message || 'Unknown error'}`, {
      originalError: error,
      folder,
      imageCount: imageFiles.length
    });
  }
};

// Delete image from Cloudinary
const deleteImage = async (publicId) => {
  try {
    // PRODUCTION: Input validation
    if (!publicId || typeof publicId !== 'string' || publicId.trim().length === 0) {
      return {
        success: false,
        error: 'Invalid public ID: must be a non-empty string'
      };
    }
    
    // PRODUCTION: Cloudinary configuration is required
    if (!isCloudinaryConfigured()) {
      logger.error('Cloudinary not configured - deletion cannot proceed', {
        publicId: publicId.substring(0, 50)
      });
      throw new Error('Cloudinary is not configured. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET environment variables.');
    }
    
    const result = await cloudinary.uploader.destroy(publicId);
    
    // PRODUCTION: Handle unexpected response format
    if (!result || typeof result !== 'object') {
      return {
        success: false,
        error: 'Unexpected response format from Cloudinary'
      };
    }
    
    // PRODUCTION FIX: Treat "not found" as success (image already deleted, which is what we want)
    // Only treat actual errors as failures
    // Cloudinary returns: { result: 'ok' } for success, { result: 'not found' } for already deleted
    const resultStatus = result.result || 'unknown';
    const isSuccess = resultStatus === 'ok' || resultStatus === 'not found';
    
    return {
      success: isSuccess,
      message: resultStatus,
      alreadyDeleted: resultStatus === 'not found' // Flag for logging purposes
    };
  } catch (error) {
    // Only log actual errors, not "not found" cases
    const errorMessage = error?.message || 'Unknown error';
    if (!errorMessage.includes('not found')) {
      logger.error('Cloudinary delete error', {
        publicId,
        error: errorMessage,
        stack: error.stack
      });
    }
    return {
      success: false,
      error: errorMessage
    };
  }
};

// Delete multiple images from Cloudinary
const deleteMultipleImages = async (publicIds) => {
  try {
    // PRODUCTION FIX: Input validation
    if (!Array.isArray(publicIds)) {
      return {
        success: false,
        error: 'Invalid input: publicIds must be an array',
        deleted: 0,
        failed: 0,
        errors: ['Invalid input: publicIds must be an array']
      };
    }
    
    // Handle empty array
    if (publicIds.length === 0) {
      return {
        success: true,
        deleted: 0,
        alreadyDeleted: 0,
        failed: 0,
        errors: []
      };
    }
    
    // PRODUCTION FIX: Use Promise.allSettled instead of Promise.all to handle individual failures gracefully
    const deletePromises = publicIds.map(publicId => deleteImage(publicId));
    const settledResults = await Promise.allSettled(deletePromises);
    
    // Extract results, handling both fulfilled and rejected promises
    const results = settledResults.map((settled, index) => {
      if (settled.status === 'fulfilled') {
        return settled.value;
      } else {
        // Handle promise rejection (shouldn't happen with our error handling, but be safe)
        return {
          success: false,
          error: settled.reason?.message || 'Unknown error during deletion'
        };
      }
    });
    
    const successfulDeletes = results.filter(result => result && result.success);
    const failedDeletes = results.filter(result => result && !result.success);
    const alreadyDeleted = results.filter(result => result && result.alreadyDeleted);
    
    if (failedDeletes.length > 0) {
      logger.warn('Some images failed to delete', {
        total: publicIds.length,
        successful: successfulDeletes.length,
        alreadyDeleted: alreadyDeleted.length,
        failed: failedDeletes.length
      });
    }
    
    // PRODUCTION: Consider deletion successful if:
    // 1. All deletions succeeded (including "not found" = already deleted)
    // Only fail if there were actual errors (not "not found" cases)
    const actualFailures = failedDeletes.filter(result => 
      result && result.error && !result.error.includes('not found')
    );
    
    return {
      success: actualFailures.length === 0, // Only fail on actual errors
      deleted: successfulDeletes.length,
      alreadyDeleted: alreadyDeleted.length,
      failed: actualFailures.length,
      errors: actualFailures.map(result => result.error).filter(Boolean)
    };
  } catch (error) {
    const errorMessage = error?.message || 'Unknown error';
    logger.error('Multiple images delete error', {
      error: errorMessage,
      stack: error.stack,
      publicIdsCount: Array.isArray(publicIds) ? publicIds.length : 0
    });
    return {
      success: false,
      error: errorMessage,
      deleted: 0,
      failed: Array.isArray(publicIds) ? publicIds.length : 0,
      errors: [errorMessage]
    };
  }
};

module.exports = {
  uploadImage,
  uploadMultipleImages,
  deleteImage,
  deleteMultipleImages,
  cloudinary,
  isCloudinaryConfigured
}; 