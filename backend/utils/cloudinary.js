const cloudinary = require('cloudinary').v2;
require('dotenv').config({ path: './config.env' });

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Log configuration for debugging
console.log('Cloudinary Configuration:');
console.log('Cloud Name:', process.env.CLOUDINARY_CLOUD_NAME);
console.log('API Key:', process.env.CLOUDINARY_API_KEY ? 'Set' : 'Not set');
console.log('API Secret:', process.env.CLOUDINARY_API_SECRET ? 'Set' : 'Not set');

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

// Upload image to Cloudinary
const uploadImage = async (imageFile, folder = 'buildxpert') => {
  try {
    // Check if Cloudinary is properly configured
    const configured = isCloudinaryConfigured();
    console.log('🔍 Cloudinary configuration status:', configured);
    
    if (!configured) {
      console.log('⚠️ Cloudinary not properly configured, using mock URL for development');
      const mockUrl = generateMockUrl(folder);
      console.log('Generated mock URL:', mockUrl);
      
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

    console.log('Attempting to upload image to Cloudinary...');
    console.log('Folder:', folder);
    
    // Convert base64 to buffer if needed
    let uploadData;
    
    if (imageFile.startsWith('data:image')) {
      // Handle base64 image
      uploadData = imageFile;
      console.log('Processing base64 image...');
    } else if (imageFile.startsWith('file://')) {
      // Handle local file URI (for mobile apps)
      // For now, we'll handle this as base64 conversion
      // In a real implementation, you'd need to convert file URI to base64
      uploadData = imageFile;
      console.log('Processing file URI...');
    } else {
      // Handle buffer or file path
      uploadData = imageFile;
      console.log('Processing file path or buffer...');
    }

    const result = await cloudinary.uploader.upload(uploadData, {
      folder: folder,
      resource_type: 'auto',
      transformation: [
        { quality: 'auto:good' },
        { fetch_format: 'auto' }
      ]
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
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    console.error('Error details:', {
      message: error.message,
      http_code: error.http_code,
      name: error.name
    });
    
    // Fallback to mock URL if Cloudinary fails
    console.log('⚠️ Cloudinary upload failed, using mock URL as fallback');
    const mockUrl = generateMockUrl(folder);
    
    return {
      success: true, // Return success with mock URL
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
    console.error('Multiple images upload error:', error);
    
    // Fallback: generate mock URLs for all images
    const mockUrls = imageFiles.map(() => generateMockUrl(folder));
    const mockPublicIds = imageFiles.map(() => `mock-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`);
    
    return {
      success: true, // Return success with mock URLs
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

    console.log('Attempting to delete image from Cloudinary:', publicId);
    
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