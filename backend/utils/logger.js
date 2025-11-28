const winston = require('winston');
const config = require('./config');
const crypto = require('crypto');

// ============================================================================
// SENSITIVE DATA MASKING
// ============================================================================

// Fields that should be masked in logs
const SENSITIVE_FIELDS = new Set([
  'password',
  'passwd',
  'pwd',
  'secret',
  'token',
  'accessToken',
  'refreshToken',
  'apiKey',
  'apikey',
  'authorization',
  'auth',
  'creditCard',
  'cardNumber',
  'cvv',
  'cvc',
  'ssn',
  'socialSecurityNumber',
  'otp',
  'verificationCode',
  'pin',
  'privateKey',
  'private_key',
  'checksum',
  'checksumhash',
  'hash',
  'signature',
  'sessionId',
  'session_id',
  'cookie',
  'cookies'
]);

// Patterns for detecting sensitive data in strings
const SENSITIVE_PATTERNS = [
  /password[=:]\s*([^\s&"']+)/gi,
  /token[=:]\s*([^\s&"']+)/gi,
  /api[_-]?key[=:]\s*([^\s&"']+)/gi,
  /authorization[=:]\s*([^\s&"']+)/gi,
  /bearer\s+([^\s"']+)/gi,
  /(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14})/g, // Credit card numbers
  /\b\d{3}-\d{2}-\d{4}\b/g, // SSN
];

// Mask sensitive values
const maskValue = (value) => {
  if (typeof value === 'string' && value.length > 0) {
    if (value.length <= 4) {
      return '****';
    }
    // Show first 2 and last 2 characters, mask the rest
    return `${value.substring(0, 2)}${'*'.repeat(Math.min(value.length - 4, 20))}${value.substring(value.length - 2)}`;
  }
  return '****';
};

// Mask sensitive data in objects (recursive)
const maskSensitiveData = (obj, depth = 0, maxDepth = 10) => {
  // Prevent infinite recursion
  if (depth > maxDepth) {
    return '[Max Depth Reached]';
  }

  if (obj === null || obj === undefined) {
    return obj;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(item => maskSensitiveData(item, depth + 1, maxDepth));
  }

  // Handle primitives
  if (typeof obj !== 'object') {
    // Check if string contains sensitive patterns
    if (typeof obj === 'string') {
      let masked = obj;
      for (const pattern of SENSITIVE_PATTERNS) {
        masked = masked.replace(pattern, (match) => maskValue(match));
      }
      return masked;
    }
    return obj;
  }

  // Handle objects
  const masked = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    
    // Check if key is sensitive
    if (SENSITIVE_FIELDS.has(lowerKey) || 
        lowerKey.includes('password') || 
        lowerKey.includes('token') || 
        lowerKey.includes('secret') ||
        lowerKey.includes('key') ||
        lowerKey.includes('auth')) {
      masked[key] = maskValue(String(value));
    } else if (lowerKey === 'email' && typeof value === 'string') {
      // Mask email: show first 3 chars and domain
      const [local, domain] = value.split('@');
      if (domain) {
        masked[key] = `${local.substring(0, 3)}***@${domain}`;
      } else {
        masked[key] = maskValue(value);
      }
    } else if (lowerKey === 'phone' && typeof value === 'string') {
      // Mask phone: show last 4 digits
      const digits = value.replace(/\D/g, '');
      if (digits.length >= 4) {
        masked[key] = `***${digits.substring(digits.length - 4)}`;
      } else {
        masked[key] = '****';
      }
    } else if (lowerKey === 'body' && typeof value === 'object') {
      // Recursively mask body content
      masked[key] = maskSensitiveData(value, depth + 1, maxDepth);
    } else {
      // Recursively process nested objects
      masked[key] = maskSensitiveData(value, depth + 1, maxDepth);
    }
  }

  return masked;
};

// ============================================================================
// LOG DEDUPLICATION
// ============================================================================

// Store recent log signatures to prevent duplicates
const logDeduplicationCache = new Map();
const DEDUP_WINDOW_MS = 60000; // 1 minute
const MAX_DEDUP_CACHE_SIZE = 1000;

// Generate log signature for deduplication
const generateLogSignature = (level, message, meta) => {
  // Create a hash of level + message + key error fields
  const keyFields = {
    message: typeof message === 'string' ? message : JSON.stringify(message),
    errorCode: meta?.errorCode,
    code: meta?.code,
    statusCode: meta?.statusCode,
    url: meta?.url,
    method: meta?.method
  };
  
  const signatureString = `${level}:${JSON.stringify(keyFields)}`;
  return crypto.createHash('sha256').update(signatureString).digest('hex');
};

// Check if log should be deduplicated
const shouldDeduplicate = (signature) => {
  const now = Date.now();
  const entry = logDeduplicationCache.get(signature);
  
  if (entry) {
    // Check if within deduplication window
    if (now - entry.timestamp < DEDUP_WINDOW_MS) {
      entry.count++;
      entry.lastSeen = now;
      return true; // Duplicate, should skip
    } else {
      // Expired, remove
      logDeduplicationCache.delete(signature);
    }
  }
  
  // Cleanup old entries if cache is too large
  if (logDeduplicationCache.size >= MAX_DEDUP_CACHE_SIZE) {
    const entries = Array.from(logDeduplicationCache.entries());
    entries.sort((a, b) => a[1].lastSeen - b[1].lastSeen);
    // Remove oldest 20%
    const toRemove = Math.ceil(MAX_DEDUP_CACHE_SIZE * 0.2);
    for (let i = 0; i < toRemove; i++) {
      logDeduplicationCache.delete(entries[i][0]);
    }
  }
  
  // Add new entry
  logDeduplicationCache.set(signature, {
    timestamp: now,
    lastSeen: now,
    count: 1
  });
  
  return false; // Not a duplicate
};

// Cleanup expired deduplication entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [signature, entry] of logDeduplicationCache.entries()) {
    if (now - entry.lastSeen > DEDUP_WINDOW_MS) {
      logDeduplicationCache.delete(signature);
    }
  }
}, DEDUP_WINDOW_MS);

// ============================================================================
// STACK TRACE ENHANCEMENT
// ============================================================================

// Enhance error stack traces
const enhanceStackTrace = (error) => {
  if (!error) return null;
  
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code,
      // Include additional error properties
      ...(error.statusCode && { statusCode: error.statusCode }),
      ...(error.errorCode && { errorCode: error.errorCode }),
      ...(error.originalError && { 
        originalError: enhanceStackTrace(error.originalError) 
      })
    };
  }
  
  if (typeof error === 'object') {
    return {
      ...error,
      ...(error.stack && { stack: error.stack }),
      ...(error.originalError && { 
        originalError: enhanceStackTrace(error.originalError) 
      })
    };
  }
  
  return error;
};

// ============================================================================
// REQUEST CONTEXT CAPTURE
// ============================================================================

// Capture full request context (sanitized)
const captureRequestContext = (req) => {
  if (!req || typeof req !== 'object') return {};
  
  const context = {
    method: req.method,
    url: req.url,
    path: req.path,
    // Capture full query parameters
    query: req.query ? { ...req.query } : {},
    // Capture route parameters
    params: req.params ? { ...req.params } : {},
    // Capture headers (sanitized) - safely handle undefined headers
    headers: maskSensitiveData({
      'user-agent': req.headers?.['user-agent'],
      'content-type': req.headers?.['content-type'],
      'content-length': req.headers?.['content-length'],
      'accept': req.headers?.['accept'],
      'referer': req.headers?.['referer'],
      'origin': req.headers?.['origin'],
      'x-forwarded-for': req.headers?.['x-forwarded-for'],
      'x-real-ip': req.headers?.['x-real-ip']
    }),
    // IP address
    ip: req.ip || req.connection?.remoteAddress,
    // User info (if available)
    ...(req.user && {
      userId: req.user.id,
      userRole: req.user.role
    })
  };
  
  // Mask sensitive query parameters
  context.query = maskSensitiveData(context.query);
  context.params = maskSensitiveData(context.params);
  
  return context;
};

// ============================================================================
// WINSTON FORMATS
// ============================================================================

// Custom format to mask sensitive data
const maskSensitiveFormat = winston.format((info) => {
  // Mask sensitive data in meta
  if (info.meta || typeof info === 'object') {
    const dataToMask = info.meta || info;
    const masked = maskSensitiveData(dataToMask);
    
    if (info.meta) {
      info.meta = masked;
    } else {
      // Merge masked data back into info
      Object.assign(info, masked);
    }
  }
  
  // Enhance stack traces
  if (info.error || info.stack) {
    const error = info.error || { stack: info.stack, message: info.message };
    const enhanced = enhanceStackTrace(error);
    if (enhanced) {
      info.error = enhanced;
      if (enhanced.stack) info.stack = enhanced.stack;
    }
  }
  
  // Add request context if available (safely handle undefined/null req)
  if (info.req && typeof info.req === 'object') {
    try {
      info.requestContext = captureRequestContext(info.req);
      delete info.req; // Remove original req to avoid duplication
    } catch (error) {
      // If capturing request context fails, just remove req and continue
      delete info.req;
    }
  }
  
  return info;
});

// Define log format with sensitive data masking
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  maskSensitiveFormat(),
  winston.format.splat(),
  winston.format.json()
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  maskSensitiveFormat(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
      // Remove circular references and mask sensitive data
      const sanitized = JSON.parse(JSON.stringify(meta, (key, value) => {
        if (key === 'req' || key === 'res') return '[Object]';
        if (typeof value === 'function') return '[Function]';
        return value;
      }));
      msg += ` ${JSON.stringify(sanitized)}`;
    }
    return msg;
  })
);

// ============================================================================
// LOGGER INSTANCE
// ============================================================================

// Create logger instance
const logger = winston.createLogger({
  level: config.get('log.level') || 'info',
  format: logFormat,
  defaultMeta: { service: 'buildxpert-api' },
  transports: [
    // Write all logs to console in development
    new winston.transports.Console({
      format: config.isDevelopment() ? consoleFormat : logFormat
    }),
    // Write all logs with level 'error' and below to error.log
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    // Write all logs to combined.log
    new winston.transports.File({ 
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 10
    })
  ],
  // Don't exit on error
  exitOnError: false
});

// ============================================================================
// ENHANCED LOGGING METHODS
// ============================================================================

// Override winston methods to add deduplication and request context
const originalLog = logger.log.bind(logger);
logger.log = function(level, message, meta = {}) {
  // Generate signature for deduplication (only for error/warn levels)
  if (level === 'error' || level === 'warn') {
    const signature = generateLogSignature(level, message, meta);
    if (shouldDeduplicate(signature)) {
      // Get existing entry to update count
      const entry = logDeduplicationCache.get(signature);
      if (entry && entry.count > 1) {
        // Log deduplication notice every 10 duplicates
        if (entry.count % 10 === 0) {
          originalLog(level, `${message} [DUPLICATE x${entry.count}]`, {
            ...meta,
            _deduplicated: true,
            _duplicateCount: entry.count
          });
        }
      }
      return; // Skip duplicate log
    }
  }
  
  // Enhance meta with request context if req is present (safely handle undefined/null req)
  if (meta.req && typeof meta.req === 'object') {
    try {
      meta.requestContext = captureRequestContext(meta.req);
    } catch (error) {
      // If capturing request context fails, just remove req and continue
      delete meta.req;
    }
  }
  
  // Call original log method
  originalLog(level, message, meta);
};

// Override error method
const originalError = logger.error.bind(logger);
logger.error = function(message, meta = {}) {
  // Ensure full stack trace
  if (meta.error && meta.error instanceof Error) {
    meta.stack = meta.error.stack;
    meta.error = enhanceStackTrace(meta.error);
  } else if (meta instanceof Error) {
    meta = { error: enhanceStackTrace(meta), stack: meta.stack };
  }
  
  logger.log('error', message, meta);
};

// Create a stream object for Morgan HTTP logging
logger.stream = {
  write: (message) => {
    logger.info(message.trim());
  }
};

// ============================================================================
// HELPER METHODS FOR COMMON LOGGING PATTERNS
// ============================================================================

logger.payment = (action, data) => {
  logger.info(`💰 Payment: ${action}`, maskSensitiveData(data));
};

logger.booking = (action, data) => {
  logger.info(`📅 Booking: ${action}`, maskSensitiveData(data));
};

logger.auth = (action, data) => {
  logger.info(`🔐 Auth: ${action}`, maskSensitiveData(data));
};

logger.socket = (action, data) => {
  logger.info(`🔌 Socket: ${action}`, maskSensitiveData(data));
};

logger.database = (action, data) => {
  logger.info(`💾 Database: ${action}`, maskSensitiveData(data));
};

logger.resilience = (action, data = {}) => {
  logger.warn(`🛡️ Resilience: ${action}`, { ...maskSensitiveData(data), category: 'resilience' });
};

logger.logic = (action, data = {}) => {
  logger.info(`🧠 Logic: ${action}`, { ...maskSensitiveData(data), category: 'logic' });
};

// OTP logging (keep visible in console for development, but mask in logs)
logger.otp = (phone, otp) => {
  const maskedPhone = phone ? `***${phone.substring(phone.length - 4)}` : '****';
  const message = `📱 OTP for ${maskedPhone}: ${maskValue(String(otp))}`;
  console.log(`\n${'='.repeat(50)}\n📱 OTP for ${phone}: ${otp}\n${'='.repeat(50)}\n`);
  logger.info(message, { phone: maskedPhone, category: 'otp' });
};

// ============================================================================
// EXPORT UTILITIES
// ============================================================================

// Export utilities for use in other modules
logger.maskSensitiveData = maskSensitiveData;
logger.captureRequestContext = captureRequestContext;
logger.enhanceStackTrace = enhanceStackTrace;

module.exports = logger;

