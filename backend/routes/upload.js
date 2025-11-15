const express = require('express');
const multer = require('multer');
const { body, validationResult } = require('express-validator');
const { auth } = require('../middleware/auth');
const { uploadImage, uploadMultipleImages } = require('../utils/cloudinary');
const logger = require('../utils/logger');
const { uploadLimiter } = require('../middleware/rateLimiting');

const router = express.Router();

// Configure multer for memory storage (for Cloudinary upload)
const imageFileFilter = (req, file, cb) => {
  if (file && file.mimetype && file.mimetype.startsWith('image/')) {
    return cb(null, true);
  }
  const error = new Error('Only image files are allowed');
  error.name = 'ValidationError';
  error.statusCode = 400;
  error.errorCode = 'INVALID_FILE_TYPE';
  return cb(error);
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit per file
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
router.post('/single', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        status: 'error',
        message: 'No image file provided'
      });
    }

    // Convert buffer to base64 for Cloudinary
    const base64Image = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    
    // Upload to Cloudinary
    const result = await uploadImage(base64Image, 'buildxpert');
    
    if (!result.success) {
      return res.status(500).json({
        status: 'error',
        message: 'Failed to upload image to Cloudinary',
        error: result.error
      });
    }

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

  } catch (error) {
    logger.error('Single image upload error', { 
      error: error, // Pass full error object for stack trace enhancement
      req: req // Pass req for automatic context capture
    });
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/upload/multiple
// @desc    Upload multiple images to Cloudinary
// @access  Private
router.post('/multiple', upload.array('images', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'No image files provided'
      });
    }

    // Convert buffers to base64 for Cloudinary
    const base64Images = req.files.map(file => 
      `data:${file.mimetype};base64,${file.buffer.toString('base64')}`
    );
    
    // Upload to Cloudinary
    const result = await uploadMultipleImages(base64Images, 'buildxpert');
    
    if (!result.success) {
      return res.status(500).json({
        status: 'error',
        message: 'Failed to upload some images to Cloudinary',
        data: {
          uploaded: result.urls.length,
          failed: result.failed,
          errors: result.errors
        }
      });
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

  } catch (error) {
    logger.error('Multiple images upload error', { 
      error: error, // Pass full error object for stack trace enhancement
      req: req // Pass req for automatic context capture
    });
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/upload/base64
// @desc    Upload base64 image to Cloudinary
// @access  Private
router.post('/base64', [
  body('image').notEmpty().withMessage('Base64 image data is required'),
  body('folder').optional().isString().withMessage('Folder must be a string')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { image, folder = 'buildxpert' } = req.body;

    // Validate base64 format
    if (!image.startsWith('data:image/')) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid base64 image format'
      });
    }

    // Upload to Cloudinary
    const result = await uploadImage(image, folder);
    
    if (!result.success) {
      return res.status(500).json({
        status: 'error',
        message: 'Failed to upload image to Cloudinary',
        error: result.error
      });
    }

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

  } catch (error) {
    logger.error('Base64 image upload error', { 
      error: error, // Pass full error object for stack trace enhancement
      req: req // Pass req for automatic context capture
    });
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/upload/multiple-base64
// @desc    Upload multiple base64 images to Cloudinary
// @access  Private
router.post('/multiple-base64', [
  body('images').isArray().withMessage('Images must be an array'),
  body('images.*').isString().withMessage('Each image must be a base64 string'),
  body('folder').optional().isString().withMessage('Folder must be a string')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { images, folder = 'buildxpert' } = req.body;

    // Validate base64 format for all images
    const invalidImages = images.filter(img => !img.startsWith('data:image/'));
    if (invalidImages.length > 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid base64 image format detected'
      });
    }

    // Upload to Cloudinary
    const result = await uploadMultipleImages(images, folder);
    
    if (!result.success) {
      return res.status(500).json({
        status: 'error',
        message: 'Failed to upload some images to Cloudinary',
        data: {
          uploaded: result.urls.length,
          failed: result.failed,
          errors: result.errors
        }
      });
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

  } catch (error) {
    logger.error('Multiple base64 images upload error', { 
      error: error, // Pass full error object for stack trace enhancement
      req: req // Pass req for automatic context capture
    });
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

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