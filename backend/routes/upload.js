const express = require('express');
const multer = require('multer');
const { body, validationResult } = require('express-validator');
const { auth } = require('../middleware/auth');
const { uploadImage, uploadMultipleImages } = require('../utils/cloudinary');
const logger = require('../utils/logger');
const { uploadLimiter } = require('../middleware/rateLimiting');
const { asyncHandler } = require('../middleware/errorHandler');
const { ValidationError } = require('../utils/errorTypes');
const { validateFileSecurity, validateFilesSecurity, validateBase64ImageSecurity, validateBase64ImagesSecurity } = require('../utils/fileSecurity');
const { ALLOWED_MIME_TYPES, MAX_FILE_SIZE } = require('../utils/fileValidation');

const router = express.Router();

// Configure multer for memory storage (for Cloudinary upload)
// Enhanced filter with strict MIME type whitelist - comprehensive validation happens after upload
const imageFileFilter = (req, file, cb) => {
  if (!file || !file.mimetype) {
    const error = new Error('Invalid file or missing MIME type');
    error.name = 'ValidationError';
    error.statusCode = 400;
    error.errorCode = 'INVALID_FILE_TYPE';
    return cb(error);
  }

  // Strict whitelist check (only allowed image types)
  const normalizedMimeType = file.mimetype.toLowerCase().trim();
  if (ALLOWED_MIME_TYPES.includes(normalizedMimeType)) {
    return cb(null, true);
  }

  const error = new Error(`File type ${file.mimetype} is not allowed. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`);
  error.name = 'ValidationError';
  error.statusCode = 400;
  error.errorCode = 'INVALID_FILE_TYPE';
  return cb(error);
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE, // Use centralized constant
  },
  fileFilter: imageFileFilter,
});

// All routes require authentication
router.use(auth);

// Apply rate limiting to prevent upload abuse
router.use(uploadLimiter);

// @route   POST /api/upload/single
// @desc    Upload a single image to Cloudinary
// @access  Private
router.post('/single', upload.single('image'), asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ValidationError('No image file provided');
  }

  // Comprehensive security validation (file type whitelist + virus scanning)
  const securityValidation = await validateFileSecurity(req.file, {
    requireVirusScan: true,
    allowedMimeTypes: ALLOWED_MIME_TYPES,
    maxFileSize: MAX_FILE_SIZE
  });

  if (!securityValidation.valid) {
    logger.warn('File upload rejected by security validation', {
      filename: req.file.originalname,
      errors: securityValidation.errors,
      reasonCodes: securityValidation.reasonCodes,
      stage: securityValidation.stage,
      userId: req.user?.id
    });
    
    throw new ValidationError('File upload failed security validation', {
      errors: securityValidation.errors,
      reasonCodes: securityValidation.reasonCodes
    });
  }

  // Optimize image before uploading (optional - Cloudinary also optimizes)
  // For now, we'll let Cloudinary handle optimization, but we can add client-side optimization here if needed
  const base64Image = `data:${securityValidation.mimeType};base64,${req.file.buffer.toString('base64')}`;
  
  // Upload to Cloudinary (with automatic optimization based on folder)
  const result = await uploadImage(base64Image, 'buildxpert');
  
  if (!result.success) {
    throw new Error(`Failed to upload image to Cloudinary: ${result.error}`);
  }

  logger.info('File uploaded successfully', {
    filename: req.file.originalname,
    mimeType: securityValidation.mimeType,
    size: securityValidation.size,
    userId: req.user?.id
  });

  res.json({
    status: 'success',
    message: 'Image uploaded successfully',
    data: {
      url: result.url,
      public_id: result.public_id,
      width: result.width,
      height: result.height,
      format: result.format,
      size: result.size
    }
  });
}));

// @route   POST /api/upload/multiple
// @desc    Upload multiple images to Cloudinary
// @access  Private
router.post('/multiple', upload.array('images', 10), asyncHandler(async (req, res) => {
  if (!req.files || req.files.length === 0) {
    throw new ValidationError('No image files provided');
  }

  // Comprehensive security validation for all files
  const securityValidation = await validateFilesSecurity(req.files, {
    requireVirusScan: true,
    allowedMimeTypes: ALLOWED_MIME_TYPES,
    maxFileSize: MAX_FILE_SIZE
  });

  if (!securityValidation.valid) {
    logger.warn('File uploads rejected by security validation', {
      total: securityValidation.total,
      invalid: securityValidation.invalidCount,
      errors: securityValidation.errors,
      userId: req.user?.id
    });
    
    throw new ValidationError('One or more files failed security validation', {
      errors: securityValidation.errors,
      invalidFiles: securityValidation.invalidFiles
    });
  }

  // Convert valid files to base64 for Cloudinary
  const base64Images = securityValidation.validFiles.map(file => 
    `data:${file.mimetype};base64,${file.buffer.toString('base64')}`
  );
  
  // Upload to Cloudinary
  const result = await uploadMultipleImages(base64Images, 'buildxpert');
  
  if (!result.success) {
    throw new Error(`Failed to upload some images to Cloudinary: ${result.errors?.join(', ')}`);
  }

  logger.info('Files uploaded successfully', {
    count: securityValidation.validCount,
    userId: req.user?.id
  });

  res.json({
    status: 'success',
    message: 'Images uploaded successfully',
    data: {
      urls: result.urls,
      public_ids: result.public_ids,
      uploaded: result.urls.length
    }
  });
}));

// @route   POST /api/upload/base64
// @desc    Upload base64 image to Cloudinary
// @access  Private
router.post('/base64', [
  body('image').notEmpty().withMessage('Base64 image data is required'),
  body('folder').optional().isString().withMessage('Folder must be a string')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', { errors: errors.array() });
  }

  const { image, folder = 'buildxpert' } = req.body;

  // Comprehensive security validation (file type whitelist + virus scanning)
  const securityValidation = await validateBase64ImageSecurity(image, {
    requireVirusScan: true,
    allowedMimeTypes: ALLOWED_MIME_TYPES,
    maxFileSize: MAX_FILE_SIZE
  });

  if (!securityValidation.valid) {
    logger.warn('Base64 image upload rejected by security validation', {
      errors: securityValidation.errors,
      reasonCodes: securityValidation.reasonCodes,
      stage: securityValidation.stage,
      userId: req.user?.id
    });
    
    throw new ValidationError('Image failed security validation', {
      errors: securityValidation.errors,
      reasonCodes: securityValidation.reasonCodes
    });
  }

  // Upload to Cloudinary
  const result = await uploadImage(image, folder);
  
  if (!result.success) {
    throw new Error(`Failed to upload image to Cloudinary: ${result.error}`);
  }

  logger.info('Base64 image uploaded successfully', {
    mimeType: securityValidation.mimeType,
    size: securityValidation.size,
    userId: req.user?.id
  });

  res.json({
    status: 'success',
    message: 'Image uploaded successfully',
    data: {
      url: result.url,
      public_id: result.public_id,
      width: result.width,
      height: result.height,
      format: result.format,
      size: result.size
    }
  });
}));

// @route   POST /api/upload/multiple-base64
// @desc    Upload multiple base64 images to Cloudinary
// @access  Private
router.post('/multiple-base64', [
  body('images').isArray().withMessage('Images must be an array'),
  body('images.*').isString().withMessage('Each image must be a base64 string'),
  body('folder').optional().isString().withMessage('Folder must be a string')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', { errors: errors.array() });
  }

  const { images, folder = 'buildxpert' } = req.body;

  // Comprehensive security validation for all base64 images
  const securityValidation = await validateBase64ImagesSecurity(images, {
    requireVirusScan: true,
    allowedMimeTypes: ALLOWED_MIME_TYPES,
    maxFileSize: MAX_FILE_SIZE
  });

  if (!securityValidation.valid) {
    logger.warn('Base64 image uploads rejected by security validation', {
      total: securityValidation.total,
      invalid: securityValidation.invalidCount,
      errors: securityValidation.errors,
      userId: req.user?.id
    });
    
    throw new ValidationError('One or more images failed security validation', {
      errors: securityValidation.errors,
      invalidImages: securityValidation.invalidImages
    });
  }

  // Upload only validated images to Cloudinary
  const result = await uploadMultipleImages(securityValidation.validImages, folder);
  
  if (!result.success) {
    throw new Error(`Failed to upload some images to Cloudinary: ${result.errors?.join(', ')}`);
  }

  res.json({
    status: 'success',
    message: 'Images uploaded successfully',
    data: {
      urls: result.urls,
      public_ids: result.public_ids,
      uploaded: result.urls.length
    }
  });
}));

// Upload-specific error normalization
router.use((err, req, res, next) => {
  if (!err) {
    return next();
  }

  if (err instanceof multer.MulterError) {
    err.name = 'ValidationError';
    err.statusCode = 400;
    err.errorCode = 'UPLOAD_ERROR';
    return next(err);
  }

  if (err.name === 'ValidationError' || err.errorCode === 'INVALID_FILE_TYPE') {
    return next(err);
  }

  return next(err);
});

module.exports = router; 