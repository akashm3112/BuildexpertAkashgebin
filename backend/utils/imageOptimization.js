/**
 * ============================================================================
 * IMAGE OPTIMIZATION UTILITIES
 * Purpose: Optimize images for web performance, storage efficiency, and user experience
 * Features: Compression, resizing, format conversion, quality optimization
 * ============================================================================
 */

const sharp = require('sharp');

/**
 * Image optimization profiles for different use cases
 */
const OPTIMIZATION_PROFILES = {
  // Profile pictures - small, square, high quality
  profile: {
    maxWidth: 400,
    maxHeight: 400,
    quality: 85,
    format: 'webp',
    fallbackFormat: 'jpg',
    fit: 'cover',
    position: 'center'
  },
  
  // Working proof images - medium size, good quality
  workingProof: {
    maxWidth: 1280,
    maxHeight: 1280,
    quality: 80,
    format: 'webp',
    fallbackFormat: 'jpg',
    fit: 'inside',
    withoutEnlargement: true
  },
  
  // Certificates - high quality, preserve aspect ratio
  certificate: {
    maxWidth: 1920,
    maxHeight: 1920,
    quality: 90,
    format: 'webp',
    fallbackFormat: 'jpg',
    fit: 'inside',
    withoutEnlargement: true
  },
  
  // Thumbnails - very small, fast loading
  thumbnail: {
    maxWidth: 200,
    maxHeight: 200,
    quality: 75,
    format: 'webp',
    fallbackFormat: 'jpg',
    fit: 'cover',
    position: 'center'
  },
  
  // General images - balanced optimization
  general: {
    maxWidth: 1280,
    maxHeight: 1280,
    quality: 80,
    format: 'webp',
    fallbackFormat: 'jpg',
    fit: 'inside',
    withoutEnlargement: true
  }
};

/**
 * Optimize image buffer using Sharp
 * @param {Buffer} imageBuffer - Image buffer to optimize
 * @param {string} profile - Optimization profile name
 * @returns {Promise<Buffer>} - Optimized image buffer
 */
const optimizeImageBuffer = async (imageBuffer, profile = 'general') => {
  try {
    const config = OPTIMIZATION_PROFILES[profile] || OPTIMIZATION_PROFILES.general;
    
    // Get image metadata
    const metadata = await sharp(imageBuffer).metadata();
    
    // Determine if we need to resize
    const needsResize = metadata.width > config.maxWidth || metadata.height > config.maxHeight;
    
    let sharpInstance = sharp(imageBuffer);
    
    // Resize if needed
    if (needsResize) {
      sharpInstance = sharpInstance.resize({
        width: config.maxWidth,
        height: config.maxHeight,
        fit: config.fit,
        position: config.position,
        withoutEnlargement: config.withoutEnlargement !== false
      });
    }
    
    // Apply format conversion and quality optimization
    if (config.format === 'webp') {
      sharpInstance = sharpInstance.webp({ 
        quality: config.quality,
        effort: 4 // Balance between compression and speed (0-6)
      });
    } else if (config.format === 'jpg' || config.format === 'jpeg') {
      sharpInstance = sharpInstance.jpeg({ 
        quality: config.quality,
        mozjpeg: true // Use mozjpeg for better compression
      });
    } else if (config.format === 'png') {
      sharpInstance = sharpInstance.png({ 
        quality: config.quality,
        compressionLevel: 9 // Maximum compression
      });
    }
    
    // Optimize the image
    const optimizedBuffer = await sharpInstance.toBuffer();
    
    // Calculate compression ratio
    const originalSize = imageBuffer.length;
    const optimizedSize = optimizedBuffer.length;
    const compressionRatio = ((originalSize - optimizedSize) / originalSize * 100).toFixed(2);
    
    return {
      buffer: optimizedBuffer,
      originalSize,
      optimizedSize,
      compressionRatio: parseFloat(compressionRatio),
      format: config.format,
      width: needsResize ? Math.min(metadata.width, config.maxWidth) : metadata.width,
      height: needsResize ? Math.min(metadata.height, config.maxHeight) : metadata.height
    };
  } catch (error) {
    console.error('Image optimization error:', error);
    // Return original buffer if optimization fails
    return {
      buffer: imageBuffer,
      originalSize: imageBuffer.length,
      optimizedSize: imageBuffer.length,
      compressionRatio: 0,
      format: 'original',
      error: error.message
    };
  }
};

/**
 * Convert base64 image to optimized buffer
 * @param {string} base64Image - Base64 encoded image
 * @param {string} profile - Optimization profile name
 * @returns {Promise<Object>} - Optimized image data
 */
const optimizeBase64Image = async (base64Image, profile = 'general') => {
  try {
    // Extract base64 data
    const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');
    
    // Optimize the image
    const optimized = await optimizeImageBuffer(imageBuffer, profile);
    
    // Convert back to base64
    const mimeType = `image/${optimized.format}`;
    const optimizedBase64 = `data:${mimeType};base64,${optimized.buffer.toString('base64')}`;
    
    return {
      ...optimized,
      base64: optimizedBase64,
      mimeType
    };
  } catch (error) {
    console.error('Base64 image optimization error:', error);
    throw error;
  }
};

/**
 * Get Cloudinary transformation options based on profile
 * @param {string} profile - Optimization profile name
 * @returns {Array} - Cloudinary transformation array
 */
const getCloudinaryTransformations = (profile = 'general') => {
  const config = OPTIMIZATION_PROFILES[profile] || OPTIMIZATION_PROFILES.general;
  
  const transformations = [];
  
  // Resize
  if (config.fit === 'cover') {
    transformations.push({
      width: config.maxWidth,
      height: config.maxHeight,
      crop: 'fill',
      gravity: config.position || 'center'
    });
  } else {
    transformations.push({
      width: config.maxWidth,
      height: config.maxHeight,
      crop: 'limit' // Similar to 'inside' in Sharp
    });
  }
  
  // Quality optimization
  transformations.push({
    quality: `auto:${config.quality >= 85 ? 'best' : config.quality >= 75 ? 'good' : 'eco'}`
  });
  
  // Additional optimizations
  transformations.push({
    flags: 'progressive' // Progressive JPEG
  });
  
  return transformations;
};

/**
 * Get optimized Cloudinary URL with transformations
 * @param {string} publicId - Cloudinary public ID
 * @param {string} profile - Optimization profile name
 * @returns {string} - Optimized Cloudinary URL
 */
const getOptimizedCloudinaryUrl = (publicId, profile = 'general') => {
  const transformations = getCloudinaryTransformations(profile);
  const cloudinary = require('cloudinary').v2;
  
  return cloudinary.url(publicId, {
    transformation: transformations,
    secure: true
  });
};

/**
 * Generate responsive image URLs for different sizes
 * @param {string} publicId - Cloudinary public ID
 * @param {string} profile - Optimization profile name
 * @returns {Object} - Object with different size URLs
 */
const getResponsiveImageUrls = (publicId, profile = 'general') => {
  const config = OPTIMIZATION_PROFILES[profile] || OPTIMIZATION_PROFILES.general;
  const cloudinary = require('cloudinary').v2;
  
  const sizes = [
    { width: 400, suffix: 'small' },
    { width: 800, suffix: 'medium' },
    { width: 1280, suffix: 'large' },
    { width: 1920, suffix: 'xlarge' }
  ];
  
  const urls = {};
  
  sizes.forEach(size => {
    if (size.width <= config.maxWidth) {
      urls[size.suffix] = cloudinary.url(publicId, {
        transformation: [
          {
            width: size.width,
            crop: 'limit',
            quality: 'auto:good',
            fetch_format: 'auto'
          }
        ],
        secure: true
      });
    }
  });
  
  return urls;
};

module.exports = {
  OPTIMIZATION_PROFILES,
  optimizeImageBuffer,
  optimizeBase64Image,
  getCloudinaryTransformations,
  getOptimizedCloudinaryUrl,
  getResponsiveImageUrls
};

