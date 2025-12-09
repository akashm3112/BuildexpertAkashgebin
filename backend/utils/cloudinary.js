const cloudinary = require('cloudinary').v2;
require('dotenv').config({ path: './config.env' });

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
  
  console.log('Cloudinary Configuration Check:', {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY ? 'Set' : 'Not set',
    apiSecret: process.env.CLOUDINARY_API_SECRET ? 'Set' : 'Not set',
    isConfigured: isConfigured
  });
  
  return isConfigured;
};

// Generate mock Cloudinary URL for development
const generateMockUrl = (folder = 'buildxpert') => {
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 15);
  return `https://res.cloudinary.com/mock-cloud/image/upload/v${timestamp}/${folder}/mock-image-${randomId}.jpg`;
};

// Upload image to Cloudinary with circuit breaker and retry logic
const uploadImage = async (imageFile, folder = 'buildxpert') => {
  const { breakers } = require('./circuitBreaker');
  const { withUploadRetry } = require('./retryLogic');
  const { CloudinaryError, FileUploadError } = require('./errorTypes');
  
  try {
    // Check if Cloudinary is properly configured
    const configured = isCloudinaryConfigured();
    console.log('🔍 Cloudinary configuration status:', configured);
    
    if (!configured) {
      const mockUrl = generateMockUrl(folder);
      
      return {
        success: true,
        url: mockUrl,
        public_id: `mock-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`,
        width: 800,
        height: 600,
        format: 'jpg',
        size: 102400,
        isMock: true
      };
    }
    
    // PRODUCTION FIX: Only accept base64 data URLs or Cloudinary URLs
    // Reject file:// URIs as they cannot be uploaded to Cloudinary from the server
    let uploadData;
    
    if (imageFile.startsWith('data:image')) {
      uploadData = imageFile;
      console.log('Processing base64 image...');
    } else if (imageFile.startsWith('file://')) {
      // PRODUCTION FIX: Reject file:// URIs - they should have been converted to base64 by the frontend
      console.error('❌ File URI received - should have been converted to base64 by frontend:', imageFile.substring(0, 100));
      throw new Error('File URIs cannot be uploaded directly. Images must be converted to base64 before sending to backend.');
    } else if (imageFile.startsWith('http://') || imageFile.startsWith('https://')) {
      // Already a Cloudinary URL - return as is (for edit mode)
      uploadData = imageFile;
      console.log('Processing Cloudinary URL (already uploaded)...');
    } else {
      // Unknown format - try to use as-is but log warning
      console.warn('⚠️ Unknown image format, attempting upload:', imageFile.substring(0, 100));
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
          
          console.log('Upload successful:', result.secure_url);
          
          return {
            success: true,
            url: result.secure_url,
            public_id: result.public_id,
            width: result.width,
            height: result.height,
            format: result.format,
            size: result.bytes,
            isMock: false
          };
        },
        // Fallback: return mock URL
        async () => {
          console.log('⚠️ Using fallback mock URL (circuit breaker open)');
          const mockUrl = generateMockUrl(folder);
          return {
            success: true,
            url: mockUrl,
            public_id: `mock-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`,
            width: 800,
            height: 600,
            format: 'jpg',
            size: 102400,
            isMock: true,
            fallback: true
          };
        }
      );
    };
    
    // Execute with retry logic
    return await withUploadRetry(uploadWithProtection, `upload to Cloudinary (${folder})`);
    
  } catch (error) {
    console.error('❌ Cloudinary upload error:', {
      message: error.message,
      http_code: error.http_code,
      name: error.name,
      stack: error.stack
    });
    
    // PRODUCTION FIX: If Cloudinary is configured, don't fall back to mock URLs - throw error instead
    const configured = isCloudinaryConfigured();
    if (configured) {
      // Cloudinary is configured but upload failed - throw error instead of returning mock URL
      throw new Error(`Failed to upload image to Cloudinary: ${error.message || 'Unknown error'}`);
    }
    
    // Only use mock URL if Cloudinary is not configured (development/fallback)
    console.warn('⚠️ Cloudinary not configured, using mock URL (development mode only)');
    const mockUrl = generateMockUrl(folder);
    
    return {
      success: true, // Return success with mock URL (graceful degradation for development)
      url: mockUrl,
      public_id: `mock-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`,
      width: 800,
      height: 600,
      format: 'jpg',
      size: 102400,
      isMock: true,
      originalError: error.message
    };
  }
};

// Upload multiple images to Cloudinary
const uploadMultipleImages = async (imageFiles, folder = 'buildxpert') => {
  try {
    console.log('Attempting to upload', imageFiles.length, 'images to Cloudinary...');
    
    const uploadPromises = imageFiles.map((imageFile, index) => {
      console.log(`Uploading image ${index + 1}/${imageFiles.length}...`);
      return uploadImage(imageFile, folder);
    });
    
    const results = await Promise.all(uploadPromises);
    
    const successfulUploads = results.filter(result => result.success);
    const failedUploads = results.filter(result => !result.success);
    
    console.log('Upload results:', {
      successful: successfulUploads.length,
      failed: failedUploads.length
    });
    
    return {
      success: true, // Always return success since we have fallback
      urls: successfulUploads.map(result => result.url),
      public_ids: successfulUploads.map(result => result.public_id),
      failed: failedUploads.length,
      errors: failedUploads.map(result => result.error),
      mockCount: successfulUploads.filter(result => result.isMock).length
    };
  } catch (error) {
    console.error('❌ Multiple images upload error:', {
      message: error.message,
      stack: error.stack
    });
    
    // PRODUCTION FIX: If Cloudinary is configured, don't fall back to mock URLs - throw error instead
    const configured = isCloudinaryConfigured();
    if (configured) {
      // Cloudinary is configured but upload failed - throw error instead of returning mock URLs
      throw new Error(`Failed to upload images to Cloudinary: ${error.message || 'Unknown error'}`);
    }
    
    // Only use mock URLs if Cloudinary is not configured (development/fallback)
    console.warn('⚠️ Cloudinary not configured, using mock URLs (development mode only)');
    const mockUrls = imageFiles.map(() => generateMockUrl(folder));
    const mockPublicIds = imageFiles.map(() => `mock-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`);
    
    return {
      success: true, // Return success with mock URLs (graceful degradation for development)
      urls: mockUrls,
      public_ids: mockPublicIds,
      failed: 0,
      errors: [],
      mockCount: imageFiles.length,
      originalError: error.message
    };
  }
};

// Delete image from Cloudinary
const deleteImage = async (publicId) => {
  try {
    // If it's a mock image, just return success
    if (publicId.startsWith('mock-')) {
      console.log('Mock image deletion (no-op):', publicId);
      return {
        success: true,
        message: 'Mock image deleted',
        isMock: true
      };
    }
    
    const result = await cloudinary.uploader.destroy(publicId);
    console.log('Delete result:', result);
    
    return {
      success: result.result === 'ok',
      message: result.result,
      isMock: false
    };
  } catch (error) {
    console.error('Cloudinary delete error:', error);
    return {
      success: false,
      error: error.message,
      isMock: false
    };
  }
};

// Delete multiple images from Cloudinary
const deleteMultipleImages = async (publicIds) => {
  try {
    console.log('Attempting to delete', publicIds.length, 'images from Cloudinary...');
    
    const deletePromises = publicIds.map(publicId => deleteImage(publicId));
    const results = await Promise.all(deletePromises);
    
    const successfulDeletes = results.filter(result => result.success);
    const failedDeletes = results.filter(result => !result.success);
    const mockDeletes = results.filter(result => result.isMock);
    
    console.log('Delete results:', {
      successful: successfulDeletes.length,
      failed: failedDeletes.length,
      mock: mockDeletes.length
    });
    
    return {
      success: failedDeletes.length === 0,
      deleted: successfulDeletes.length,
      failed: failedDeletes.length,
      mock: mockDeletes.length,
      errors: failedDeletes.map(result => result.error)
    };
  } catch (error) {
    console.error('Multiple images delete error:', error);
    return {
      success: false,
      error: error.message
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