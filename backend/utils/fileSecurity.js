/**
 * ============================================================================
 * COMPREHENSIVE FILE SECURITY UTILITY
 * Purpose: Centralized file security validation with whitelist and virus scanning
 * ============================================================================
 */

const { validateFileBuffer, validateMulterFile, validateMulterFiles, ALLOWED_MIME_TYPES, MAX_FILE_SIZE } = require('./fileValidation');
const { scanFile, scanFiles, VIRUS_SCAN_ENABLED } = require('./virusScanner');
const logger = require('./logger');
const { ValidationError } = require('./errorTypes');

/**
 * Comprehensive file security validation
 * Combines file type whitelist validation and virus scanning
 */
async function validateFileSecurity(file, options = {}) {
  const {
    requireVirusScan = true,
    allowedMimeTypes = ALLOWED_MIME_TYPES,
    maxFileSize = MAX_FILE_SIZE,
    scanTimeout = 10000
  } = options;

  // Step 1: Validate file structure and type using magic bytes
  const fileValidation = validateMulterFile(file);
  
  if (!fileValidation.valid) {
    return {
      valid: false,
      errors: fileValidation.errors,
      reasonCodes: fileValidation.reasonCodes,
      stage: 'file_validation'
    };
  }

  // Step 2: Verify MIME type is in whitelist (STRICT CHECK)
  const detectedMimeType = fileValidation.mimeType;
  const normalizedDetectedType = detectedMimeType?.toLowerCase().trim();
  
  if (!normalizedDetectedType || !allowedMimeTypes.includes(normalizedDetectedType)) {
    logger.warn('File type not in whitelist', {
      detectedMimeType: normalizedDetectedType,
      declaredMimeType: file.mimetype,
      allowedTypes: allowedMimeTypes,
      filename: file.originalname,
      size: file.size
    });
    
    return {
      valid: false,
      errors: [`File type ${normalizedDetectedType || 'unknown'} is not allowed. Allowed types: ${allowedMimeTypes.join(', ')}`],
      reasonCodes: ['INVALID_FILE_TYPE', 'WHITELIST_VIOLATION'],
      stage: 'whitelist_check',
      detectedMimeType: normalizedDetectedType
    };
  }

  // Step 2.5: Verify declared MIME type matches detected type (prevent MIME type spoofing)
  const declaredMimeType = file.mimetype?.toLowerCase().trim();
  if (declaredMimeType && declaredMimeType !== normalizedDetectedType) {
    logger.warn('MIME type mismatch detected (possible spoofing attempt)', {
      declaredMimeType: declaredMimeType,
      detectedMimeType: normalizedDetectedType,
      filename: file.originalname,
      size: file.size
    });
    
    return {
      valid: false,
      errors: [`MIME type mismatch: declared as ${declaredMimeType} but detected as ${normalizedDetectedType}. This may indicate a security risk.`],
      reasonCodes: ['MIME_MISMATCH', 'POSSIBLE_SPOOFING'],
      stage: 'mime_verification',
      declaredMimeType,
      detectedMimeType: normalizedDetectedType
    };
  }

  // Step 3: Verify file size
  if (file.size > maxFileSize) {
    return {
      valid: false,
      errors: [`File size ${(file.size / 1024 / 1024).toFixed(2)}MB exceeds maximum allowed size of ${(maxFileSize / 1024 / 1024).toFixed(2)}MB`],
      reasonCodes: ['SIZE_LIMIT'],
      stage: 'size_check',
      size: file.size,
      maxSize: maxFileSize
    };
  }

  // Step 4: Virus scanning (if enabled)
  if (requireVirusScan && VIRUS_SCAN_ENABLED) {
    try {
      const scanResult = await scanFile(file.buffer, file.originalname, { timeout: scanTimeout });
      
      if (!scanResult.clean) {
        logger.warn('File failed virus scan', {
          filename: file.originalname,
          reason: scanResult.reason,
          pattern: scanResult.pattern,
          source: scanResult.source
        });
        
        return {
          valid: false,
          errors: [`File security check failed: ${scanResult.reason}`],
          reasonCodes: ['VIRUS_DETECTED', 'SECURITY_THREAT'],
          stage: 'virus_scan',
          scanResult
        };
      }
      
      // Log successful scan (for audit trail)
      if (scanResult.source === 'virustotal') {
        logger.info('File passed VirusTotal scan', {
          filename: file.originalname,
          stats: scanResult.stats
        });
      }
    } catch (scanError) {
      // If virus scanning fails, we can either:
      // Option 1: Reject the file (more secure)
      // Option 2: Allow with warning (less secure but more resilient)
      // Using Option 1 for production security
      logger.error('Virus scanning error', {
        filename: file.originalname,
        error: scanError.message
      });
      
      return {
        valid: false,
        errors: ['File security check could not be completed. Please try again.'],
        reasonCodes: ['SCAN_ERROR'],
        stage: 'virus_scan',
        scanError: scanError.message
      };
    }
  }

  // All checks passed
  return {
    valid: true,
    mimeType: normalizedDetectedType,
    size: file.size,
    filename: file.originalname,
    stage: 'complete',
    scanned: requireVirusScan && VIRUS_SCAN_ENABLED
  };
}

/**
 * Validate multiple files with security checks
 */
async function validateFilesSecurity(files, options = {}) {
  if (!files || files.length === 0) {
    return {
      valid: false,
      errors: ['No files provided'],
      validFiles: [],
      invalidFiles: []
    };
  }

  const results = await Promise.all(
    files.map(async (file) => {
      const validation = await validateFileSecurity(file, options);
      return {
        file,
        validation
      };
    })
  );

  const validFiles = results.filter(r => r.validation.valid).map(r => r.file);
  const invalidFiles = results.filter(r => !r.validation.valid).map(r => ({
    filename: r.file.originalname,
    errors: r.validation.errors,
    reasonCodes: r.validation.reasonCodes,
    stage: r.validation.stage
  }));

  return {
    valid: invalidFiles.length === 0,
    validFiles,
    invalidFiles,
    total: files.length,
    validCount: validFiles.length,
    invalidCount: invalidFiles.length,
    errors: invalidFiles.flatMap(f => f.errors)
  };
}

/**
 * Validate base64 image with security checks
 */
async function validateBase64ImageSecurity(base64String, options = {}) {
  const {
    requireVirusScan = true,
    allowedMimeTypes = ALLOWED_MIME_TYPES,
    maxFileSize = MAX_FILE_SIZE
  } = options;

  // Validate base64 format
  if (!base64String || typeof base64String !== 'string') {
    return {
      valid: false,
      errors: ['Invalid base64 string'],
      reasonCodes: ['INVALID_FORMAT']
    };
  }

  // Extract MIME type from data URL
  const mimeMatch = base64String.match(/^data:([^;]+);base64,/);
  if (!mimeMatch) {
    return {
      valid: false,
      errors: ['Invalid base64 image format. Must start with data:image/...;base64,'],
      reasonCodes: ['INVALID_FORMAT']
    };
  }

  const declaredMimeType = mimeMatch[1].toLowerCase().trim();
  
  // Check if MIME type is in whitelist
  if (!allowedMimeTypes.includes(declaredMimeType)) {
    return {
      valid: false,
      errors: [`MIME type ${declaredMimeType} is not allowed. Allowed types: ${allowedMimeTypes.join(', ')}`],
      reasonCodes: ['INVALID_FILE_TYPE'],
      declaredMimeType
    };
  }

  // Extract base64 data
  const base64Data = base64String.split(',')[1];
  if (!base64Data) {
    return {
      valid: false,
      errors: ['Invalid base64 data'],
      reasonCodes: ['INVALID_FORMAT']
    };
  }

  // Convert to buffer
  let buffer;
  try {
    buffer = Buffer.from(base64Data, 'base64');
  } catch (error) {
    return {
      valid: false,
      errors: ['Invalid base64 encoding'],
      reasonCodes: ['INVALID_FORMAT']
    };
  }

  // Check file size
  if (buffer.length > maxFileSize) {
    return {
      valid: false,
      errors: [`File size ${(buffer.length / 1024 / 1024).toFixed(2)}MB exceeds maximum allowed size of ${(maxFileSize / 1024 / 1024).toFixed(2)}MB`],
      reasonCodes: ['SIZE_LIMIT'],
      size: buffer.length,
      maxSize: maxFileSize
    };
  }

  // Validate file type using magic bytes
  const fileValidation = validateFileBuffer(buffer, declaredMimeType, 'base64-image');
  
  if (!fileValidation.valid) {
    return {
      valid: false,
      errors: fileValidation.errors,
      reasonCodes: fileValidation.reasonCodes,
      stage: 'file_validation'
    };
  }

  // Verify detected type matches declared type (prevent MIME type spoofing)
  const normalizedDetectedType = fileValidation.mimeType?.toLowerCase().trim();
  const normalizedDeclaredType = declaredMimeType?.toLowerCase().trim();
  
  if (normalizedDetectedType !== normalizedDeclaredType) {
    logger.warn('Base64 image MIME type mismatch detected (possible spoofing attempt)', {
      declaredMimeType: normalizedDeclaredType,
      detectedMimeType: normalizedDetectedType,
      size: buffer.length
    });
    
    return {
      valid: false,
      errors: [`MIME type mismatch: declared as ${normalizedDeclaredType} but detected as ${normalizedDetectedType}. This may indicate a security risk.`],
      reasonCodes: ['MIME_MISMATCH', 'POSSIBLE_SPOOFING'],
      declaredMimeType: normalizedDeclaredType,
      detectedMimeType: normalizedDetectedType
    };
  }

  // Virus scanning
  if (requireVirusScan && VIRUS_SCAN_ENABLED) {
    try {
      const scanResult = await scanFile(buffer, 'base64-image');
      
      if (!scanResult.clean) {
        return {
          valid: false,
          errors: [`File security check failed: ${scanResult.reason}`],
          reasonCodes: ['VIRUS_DETECTED', 'SECURITY_THREAT'],
          stage: 'virus_scan',
          scanResult
        };
      }
    } catch (scanError) {
      return {
        valid: false,
        errors: ['File security check could not be completed. Please try again.'],
        reasonCodes: ['SCAN_ERROR'],
        stage: 'virus_scan',
        scanError: scanError.message
      };
    }
  }

  return {
    valid: true,
    mimeType: normalizedDetectedType,
    size: buffer.length,
    stage: 'complete',
    scanned: requireVirusScan && VIRUS_SCAN_ENABLED
  };
}

/**
 * Validate multiple base64 images
 */
async function validateBase64ImagesSecurity(base64Strings, options = {}) {
  if (!base64Strings || !Array.isArray(base64Strings) || base64Strings.length === 0) {
    return {
      valid: false,
      errors: ['No images provided'],
      validImages: [],
      invalidImages: []
    };
  }

  const results = await Promise.all(
    base64Strings.map(async (base64String, index) => {
      const validation = await validateBase64ImageSecurity(base64String, options);
      return {
        index,
        base64String,
        validation
      };
    })
  );

  const validImages = results.filter(r => r.validation.valid).map(r => r.base64String);
  const invalidImages = results.filter(r => !r.validation.valid).map(r => ({
    index: r.index,
    errors: r.validation.errors,
    reasonCodes: r.validation.reasonCodes,
    stage: r.validation.stage
  }));

  return {
    valid: invalidImages.length === 0,
    validImages,
    invalidImages,
    total: base64Strings.length,
    validCount: validImages.length,
    invalidCount: invalidImages.length,
    errors: invalidImages.flatMap(f => f.errors)
  };
}

module.exports = {
  validateFileSecurity,
  validateFilesSecurity,
  validateBase64ImageSecurity,
  validateBase64ImagesSecurity,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE
};

