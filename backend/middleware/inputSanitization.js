const logger = require('../utils/logger');

const htmlEntities = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;'
};

/**
 * Escape HTML entities to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
const escapeHtml = (text) => {
  if (typeof text !== 'string') return text;
  return text.replace(/[&<>"'\/]/g, (char) => htmlEntities[char]);
};

/**
 * Remove potentially dangerous HTML tags
 * @param {string} text - Text to clean
 * @returns {string} Cleaned text
 */
const stripHtmlTags = (text) => {
  if (typeof text !== 'string') return text;
  // Remove all HTML tags
  return text.replace(/<[^>]*>/g, '');
};

/**
 * Detect potentially malicious SQL patterns (for logging/monitoring only)
 * 
 * ⚠️ SECURITY NOTE: This function is for monitoring/logging purposes ONLY.
 * It does NOT provide SQL injection protection. Pattern matching is unreliable:
 * - Can have false positives (blocking legitimate input)
 * - Can have false negatives (missing actual attacks)
 * 
 * REAL SQL INJECTION PROTECTION comes from:
 * - Using parameterized queries (already implemented throughout codebase)
 * - Never concatenating user input into SQL strings
 * - Using the query() function from database/connection.js which uses parameterized queries
 * 
 * @param {string} text - Text to check
 * @returns {boolean} True if suspicious patterns found (for logging only)
 * @deprecated This function should not be used to block requests. 
 *             SQL injection protection is provided by parameterized queries.
 */
const containsSqlInjectionPatterns = (text) => {
  if (typeof text !== 'string') return false;

  const normalized = text.toUpperCase();

  const highRiskPatterns = [
    /(?:'|"|`)\s*OR\s+(?:'|"|`)?\d+\s*=\s*\d+/i,          // ' OR 1=1 style payloads
    /\bOR\s+1\s*=\s*1\b/i,                               // OR 1=1 without quotes
    /\bAND\s+1\s*=\s*1\b/i,                              // AND 1=1
    /;?\s*(DROP|TRUNCATE|ALTER)\s+(TABLE|DATABASE)\b/i,  // destructive statements
    /\bUNION\b\s+ALL?\s+\bSELECT\b/i,                    // UNION SELECT
    /\bINSERT\b\s+INTO\b\s+\w+/i,                        // INSERT INTO table
    /\bUPDATE\b\s+\w+\s+\bSET\b/i,                       // UPDATE table SET
    /\bDELETE\b\s+\bFROM\b\s+\w+/i,                      // DELETE FROM table
    /\bEXEC(?:UTE)?\b\s*\(/i,                            // EXEC(), EXECUTE(
    /\bINFORMATION_SCHEMA\b/i,                           // metadata access
    /\bLOAD_FILE\b|\bOUTFILE\b/i,                        // file system access
    /--/,                                                // inline SQL comment
    /\/\*/,                                              // block comment start
    /;.*(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER)\b/i     // stacked queries
  ];

  if (highRiskPatterns.some(pattern => pattern.test(normalized))) {
    return true;
  }

  // Check for suspicious combinations like SELECT ... FROM ... WHERE within short range
  const selectIndex = normalized.indexOf('SELECT ');
  if (selectIndex !== -1) {
    const fromIndex = normalized.indexOf(' FROM ', selectIndex);
    if (fromIndex !== -1) {
      const whereIndex = normalized.indexOf(' WHERE ', fromIndex);
      const substring = normalized.substring(selectIndex, Math.min(normalized.length, selectIndex + 120));
      const looksLikeQuery = /\bSELECT\b.+\bFROM\b/.test(substring) && (whereIndex !== -1 || /JOIN\s+\w+/i.test(substring));
      if (looksLikeQuery) {
        return true;
      }
    }
  }

  return false;
};

/**
 * Detect XSS patterns
 * @param {string} text - Text to check
 * @returns {boolean} True if XSS patterns found
 */
const containsXssPatterns = (text) => {
  if (typeof text !== 'string') return false;
  
  const xssPatterns = [
    /<script[^>]*>.*<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi, // Event handlers like onclick=
    /<iframe[^>]*>/gi,
    /<object[^>]*>/gi,
    /<embed[^>]*>/gi,
    /<img[^>]*onerror/gi,
    /eval\(/gi,
    /expression\(/gi
  ];
  
  return xssPatterns.some(pattern => pattern.test(text));
};

/**
 * Sanitize a single value
 * @param {any} value - Value to sanitize
 * @param {Object} options - Sanitization options
 * @returns {any} Sanitized value
 */
const sanitizeValue = (value, options = {}) => {
  const {
    stripHtml = true,
    escapeHtml: shouldEscapeHtml = false,
    checkSqlInjection = false, // DISABLED BY DEFAULT - SQL injection protection comes from parameterized queries, not pattern matching
    checkXss = true,
    maxLength = null,
    trim = true
  } = options;
  
  // Handle non-string values
  if (value === null || value === undefined) return value;
  if (typeof value !== 'string') return value;
  
  let sanitized = value;
  
  // Trim whitespace
  if (trim) {
    sanitized = sanitized.trim();
  }
  
  // SQL injection pattern detection (for logging/monitoring only - NOT a security control)
  // ⚠️ IMPORTANT: Pattern matching does NOT provide SQL injection protection.
  // Real protection comes from using parameterized queries (already implemented).
  // Pattern matching can have false positives and false negatives.
  // Only enable for logging/monitoring purposes, not for blocking requests.
  if (checkSqlInjection && containsSqlInjectionPatterns(sanitized)) {
    // Log for monitoring but don't block - parameterized queries provide the real protection
    logger.warn('SQL injection pattern detected (logged for monitoring - not blocked)', {
      value: sanitized.substring(0, 100),
      note: 'SQL injection protection is provided by parameterized queries, not pattern matching'
    });
    // DO NOT throw error - pattern matching is unreliable and can block legitimate input
    // If you need to block, use proper input validation (e.g., express-validator)
  }
  
  // XSS pattern detection (still useful for output sanitization)
  if (checkXss && containsXssPatterns(sanitized)) {
    logger.warn('XSS pattern detected', {
      value: sanitized.substring(0, 100)
    });
    throw new Error('Invalid input: Potential XSS detected');
  }
  
  // Strip HTML tags
  if (stripHtml) {
    sanitized = stripHtmlTags(sanitized);
  }
  
  // Escape HTML entities
  if (shouldEscapeHtml) {
    sanitized = escapeHtml(sanitized);
  }
  
  // Enforce max length
  if (maxLength && sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }
  
  return sanitized;
};

/**
 * Sanitize an object recursively
 * @param {Object} obj - Object to sanitize
 * @param {Object} options - Sanitization options
 * @returns {Object} Sanitized object
 */
const sanitizeObject = (obj, options = {}) => {
  if (!obj || typeof obj !== 'object') return obj;
  
  const sanitized = Array.isArray(obj) ? [] : {};
  
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const value = obj[key];
      
      if (value === null || value === undefined) {
        sanitized[key] = value;
      } else if (typeof value === 'object') {
        // Recursively sanitize nested objects
        sanitized[key] = sanitizeObject(value, options);
      } else {
        // Sanitize primitive values
        try {
          sanitized[key] = sanitizeValue(value, options);
        } catch (error) {
          // If sanitization fails, log and reject the entire request
          throw error;
        }
      }
    }
  }
  
  return sanitized;
};

/**
 * Express middleware to sanitize request body
 * @param {Object} options - Sanitization options
 */
const sanitizeBody = (options = {}) => {
  return (req, res, next) => {
    try {
      if (req.body && typeof req.body === 'object') {
        req.body = sanitizeObject(req.body, options);
      }
      next();
    } catch (error) {
      logger.warn('Input sanitization failed', {
        error: error.message,
        ip: req.ip,
        url: req.url,
        userId: req.user?.id
      });
      
      return res.status(400).json({
        status: 'error',
        message: error.message || 'Invalid input detected'
      });
    }
  };
};

/**
 * Express middleware to sanitize query parameters
 * @param {Object} options - Sanitization options
 */
const sanitizeQuery = (options = {}) => {
  return (req, res, next) => {
    try {
      if (req.query && typeof req.query === 'object') {
        req.query = sanitizeObject(req.query, options);
      }
      next();
    } catch (error) {
      logger.warn('Query sanitization failed', {
        error: error.message,
        ip: req.ip,
        url: req.url,
        userId: req.user?.id
      });
      
      return res.status(400).json({
        status: 'error',
        message: error.message || 'Invalid query parameters'
      });
    }
  };
};

/**
 * Express middleware to sanitize request params
 * @param {Object} options - Sanitization options
 */
const sanitizeParams = (options = {}) => {
  return (req, res, next) => {
    try {
      if (req.params && typeof req.params === 'object') {
        req.params = sanitizeObject(req.params, options);
      }
      next();
    } catch (error) {
      logger.warn('Params sanitization failed', {
        error: error.message,
        ip: req.ip,
        url: req.url,
        userId: req.user?.id
      });
      
      return res.status(400).json({
        status: 'error',
        message: error.message || 'Invalid parameters'
      });
    }
  };
};

/**
 * Combined sanitization middleware for body, query, and params
 * @param {Object} options - Sanitization options
 */
const sanitizeAll = (options = {}) => {
  return (req, res, next) => {
    try {
      if (req.body && typeof req.body === 'object') {
        req.body = sanitizeObject(req.body, options);
      }
      if (req.query && typeof req.query === 'object') {
        req.query = sanitizeObject(req.query, options);
      }
      if (req.params && typeof req.params === 'object') {
        req.params = sanitizeObject(req.params, options);
      }
      next();
    } catch (error) {
      logger.warn('Input sanitization failed', {
        error: error.message,
        ip: req.ip,
        url: req.url,
        userId: req.user?.id
      });
      
      return res.status(400).json({
        status: 'error',
        message: error.message || 'Invalid input detected'
      });
    }
  };
};

/**
 * Sanitize specific fields with custom options
 * @param {Object} fieldOptions - Field-specific sanitization options
 * Example: { description: { maxLength: 500 }, name: { maxLength: 100 } }
 */
const sanitizeFields = (fieldOptions) => {
  return (req, res, next) => {
    try {
      for (const field in fieldOptions) {
        if (req.body && req.body[field] !== undefined) {
          req.body[field] = sanitizeValue(req.body[field], fieldOptions[field]);
        }
      }
      next();
    } catch (error) {
      logger.warn('Field sanitization failed', {
        error: error.message,
        ip: req.ip,
        url: req.url,
        userId: req.user?.id
      });
      
      return res.status(400).json({
        status: 'error',
        message: error.message || 'Invalid input in one or more fields'
      });
    }
  };
};

module.exports = {
  sanitizeValue,
  sanitizeObject,
  sanitizeBody,
  sanitizeQuery,
  sanitizeParams,
  sanitizeAll,
  sanitizeFields,
  escapeHtml,
  stripHtmlTags,
  containsSqlInjectionPatterns,
  containsXssPatterns
};

