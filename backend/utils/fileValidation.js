/**
 * File Validation Utility
 * Production-ready file validation with magic bytes checking
 */

const logger = require('./logger');

// Error reason codes for programmatic handling
const ERROR_REASONS = {
  EMPTY_FILE: 'EMPTY_FILE',
  SIZE_LIMIT: 'SIZE_LIMIT',
  INVALID_TYPE: 'INVALID_TYPE',
  MIME_MISMATCH: 'MIME_MISMATCH',
  SUSPICIOUS_CONTENT: 'SUSPICIOUS_CONTENT',
  NO_FILE: 'NO_FILE',
};

// Magic bytes (file signatures) for common image formats
const IMAGE_SIGNATURES = {
  'image/jpeg': [
    [0xFF, 0xD8, 0xFF], // JPEG
  ],
  'image/png': [
    [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], // PNG
  ],
  'image/gif': [
    [0x47, 0x49, 0x46, 0x38, 0x37, 0x61], // GIF87a
    [0x47, 0x49, 0x46, 0x38, 0x39, 0x61], // GIF89a
  ],
  'image/webp': [
    [0x52, 0x49, 0x46, 0x46], // RIFF (WebP starts with RIFF)
  ],
  'image/bmp': [
    [0x42, 0x4D], // BM
  ],
  'image/tiff': [
    [0x49, 0x49, 0x2A, 0x00], // TIFF (little-endian)
    [0x4D, 0x4D, 0x00, 0x2A], // TIFF (big-endian)
  ],
};

// Allowed MIME types
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/tiff',
];

// Maximum file size (5MB)
const MAX_FILE_SIZE = 5 * 1024 * 1024;

// Suspicious content patterns
const SUSPICIOUS_PATTERNS = [
  /<script/i,
  /javascript:/i,
  /onerror=/i,
  /onload=/i,
  /<?php/i,
  /<%/i,
];

/**
 * Check if buffer matches a signature
 */
function matchesSignature(buffer, signature) {
  if (buffer.length < signature.length) {
    return false;
  }
  
  for (let i = 0; i < signature.length; i++) {
    if (buffer[i] !== signature[i]) {
      return false;
    }
  }
  
  return true;
}

/**
 * Safely decode buffer to string for pattern matching (handles binary data)
 */
function safeBufferToString(buffer, maxLength = 1024) {
  try {
    // Use latin1 encoding which safely handles binary data
    // latin1 maps each byte to a character (0x00-0xFF)
    const length = Math.min(maxLength, buffer.length);
    return buffer.toString('latin1', 0, length);
  } catch (error) {
    // Fallback: try TextDecoder if available
    try {
      const decoder = new TextDecoder('latin1', { fatal: false });
      const length = Math.min(maxLength, buffer.length);
      return decoder.decode(buffer.slice(0, length));
    } catch {
      // Last resort: return empty string
      return '';
    }
  }
}

/**
 * Detect file type from magic bytes
 */
function detectFileType(buffer) {
  if (!buffer || buffer.length === 0) {
    return null;
  }

  // Check each image type
  for (const [mimeType, signatures] of Object.entries(IMAGE_SIGNATURES)) {
    for (const signature of signatures) {
      if (matchesSignature(buffer, signature)) {
        // Special handling for WebP (needs to check for WEBP string, case-insensitive)
        if (mimeType === 'image/webp' && buffer.length >= 12) {
          const webpCheck = buffer.slice(8, 12).toString('ascii').toUpperCase();
          if (webpCheck === 'WEBP') {
            return mimeType;
          }
        } else if (mimeType !== 'image/webp') {
          return mimeType;
        }
      }
    }
  }

  return null;
}

/**
 * Check for suspicious content patterns (single pass, optimized)
 */
function checkSuspiciousContent(buffer) {
  if (!buffer || buffer.length === 0) {
    return null;
  }

  // Safely decode buffer for pattern matching
  const bufferString = safeBufferToString(buffer, 1024);
  
  if (!bufferString) {
    return null; // Could not decode, skip pattern check
  }

  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (pattern.test(bufferString)) {
      return pattern.toString();
    }
  }

  return null;
}

/**
 * Validate file buffer (unified validation with single-pass checks)
 */
function validateFileBuffer(buffer, originalMimeType, originalFilename) {
  const errors = [];
  const reasonCodes = [];

  // Check file size
  if (!buffer || buffer.length === 0) {
    errors.push('File is empty');
    reasonCodes.push(ERROR_REASONS.EMPTY_FILE);
    return { 
      valid: false, 
      errors, 
      reasonCodes,
      mimeType: null,
      size: 0
    };
  }

  if (buffer.length > MAX_FILE_SIZE) {
    errors.push(`File size exceeds maximum allowed size of ${MAX_FILE_SIZE / (1024 * 1024)}MB`);
    reasonCodes.push(ERROR_REASONS.SIZE_LIMIT);
    return { 
      valid: false, 
      errors, 
      reasonCodes,
      mimeType: null,
      size: buffer.length
    };
  }

  // Detect actual file type from magic bytes
  const detectedMimeType = detectFileType(buffer);
  
  if (!detectedMimeType) {
    errors.push('File type could not be determined or is not a supported image format');
    reasonCodes.push(ERROR_REASONS.INVALID_TYPE);
    return { 
      valid: false, 
      errors, 
      reasonCodes,
      mimeType: null,
      size: buffer.length
    };
  }

  // Check if detected type is allowed
  if (!ALLOWED_MIME_TYPES.includes(detectedMimeType)) {
    errors.push(`File type ${detectedMimeType} is not allowed`);
    reasonCodes.push(ERROR_REASONS.INVALID_TYPE);
    return { 
      valid: false, 
      errors, 
      reasonCodes,
      mimeType: detectedMimeType,
      size: buffer.length
    };
  }

  // Validate MIME type matches detected type
  const normalizedMimeType = originalMimeType?.toLowerCase().trim();
  if (normalizedMimeType && normalizedMimeType !== detectedMimeType) {
    errors.push(`MIME type mismatch: declared as ${normalizedMimeType} but detected as ${detectedMimeType}`);
    reasonCodes.push(ERROR_REASONS.MIME_MISMATCH);
    // Log security warning (no sensitive data)
    logger.warn('File MIME type mismatch detected', {
      declared: normalizedMimeType,
      detected: detectedMimeType,
      filename: originalFilename || 'unknown',
      size: buffer.length
      // Note: Not logging buffer content to avoid sensitive data leaks
    });
  }

  // Check for suspicious content (single pass)
  const suspiciousPattern = checkSuspiciousContent(buffer);
  if (suspiciousPattern) {
    errors.push('File contains suspicious content');
    reasonCodes.push(ERROR_REASONS.SUSPICIOUS_CONTENT);
    // Log security warning (no sensitive data)
    logger.warn('Suspicious content detected in uploaded file', {
      filename: originalFilename || 'unknown',
      pattern: suspiciousPattern,
      detectedMimeType,
      size: buffer.length
      // Note: Not logging buffer content to avoid sensitive data leaks
    });
    return { 
      valid: false, 
      errors, 
      reasonCodes,
      mimeType: detectedMimeType,
      size: buffer.length
    };
  }

  return {
    valid: true,
    mimeType: detectedMimeType, // Standardized to mimeType
    declaredType: normalizedMimeType,
    size: buffer.length,
    errors: [],
    reasonCodes: []
  };
}

/**
 * Validate file from multer (unified with validateFileBuffer)
 */
function validateMulterFile(file) {
  if (!file) {
    return {
      valid: false,
      errors: ['No file provided'],
      reasonCodes: [ERROR_REASONS.NO_FILE],
      mimeType: null,
      size: 0
    };
  }

  const buffer = file.buffer;
  const mimeType = file.mimetype;
  const originalname = file.originalname;
  const size = file.size || (buffer ? buffer.length : 0);

  // Use unified validation (includes all checks in single pass)
  const validation = validateFileBuffer(buffer, mimeType, originalname);
  
  if (!validation.valid) {
    return {
      valid: false,
      errors: validation.errors,
      reasonCodes: validation.reasonCodes,
      mimeType: validation.mimeType,
      size: validation.size,
      filename: originalname
    };
  }

  // Additional check: validate declared MIME type is allowed
  const normalizedMimeType = mimeType?.toLowerCase().trim();
  if (!normalizedMimeType || !ALLOWED_MIME_TYPES.includes(normalizedMimeType)) {
    return {
      valid: false,
      errors: [`MIME type ${mimeType} is not allowed. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`],
      reasonCodes: [ERROR_REASONS.INVALID_TYPE],
      mimeType: validation.mimeType,
      size: validation.size,
      filename: originalname
    };
  }

  return {
    valid: true,
    mimeType: validation.mimeType, // Standardized to mimeType
    size: validation.size,
    filename: originalname,
    errors: [],
    reasonCodes: []
  };
}

/**
 * Validate multiple files
 */
function validateMulterFiles(files) {
  if (!files || files.length === 0) {
    return {
      valid: false,
      errors: ['No files provided'],
      reasonCodes: [ERROR_REASONS.NO_FILE],
      validFiles: [],
      invalidFiles: []
    };
  }

  const results = files.map((file, index) => ({
    index,
    filename: file.originalname,
    validation: validateMulterFile(file)
  }));

  const validFiles = results.filter(r => r.validation.valid);
  const invalidFiles = results.filter(r => !r.validation.valid);

  return {
    valid: invalidFiles.length === 0,
    validFiles: validFiles.map(r => files[r.index]),
    invalidFiles: invalidFiles.map(r => ({
      filename: r.filename,
      errors: r.validation.errors,
      reasonCodes: r.validation.reasonCodes || [],
      mimeType: r.validation.mimeType
    })),
    errors: invalidFiles.flatMap(r => r.validation.errors),
    reasonCodes: [...new Set(invalidFiles.flatMap(r => r.validation.reasonCodes || []))]
  };
}

module.exports = {
  validateFileBuffer,
  validateMulterFile,
  validateMulterFiles,
  detectFileType,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
  IMAGE_SIGNATURES,
  ERROR_REASONS
};

