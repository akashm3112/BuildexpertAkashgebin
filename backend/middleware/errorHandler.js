/**
 * ============================================================================
 * CENTRALIZED ERROR HANDLER MIDDLEWARE
 * Purpose: Handle all errors consistently with proper logging and responses
 * Features: Error classification, user-friendly messages, retry logic
 * ============================================================================
 */

const logger = require('../utils/logger');
const config = require('../utils/config');
const {
  ApplicationError,
  isRetryableError,
  getUserFriendlyMessage
} = require('../utils/errorTypes');

/**
 * Classify database errors
 */
const classifyDatabaseError = (error) => {
  const { DatabaseError, DatabaseConnectionError, DatabaseTimeoutError, DatabaseConstraintError } = require('../utils/errorTypes');
  
  // Connection errors
  if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
    return new DatabaseConnectionError('Unable to connect to database');
  }
  
  // Timeout errors
  if (error.code === '57014') { // PostgreSQL query timeout
    return new DatabaseTimeoutError('Database query timed out');
  }
  
  // Constraint violations
  if (error.code === '23505') { // Unique violation
    return new DatabaseConstraintError('Duplicate entry found', error.constraint);
  }
  if (error.code === '23503') { // Foreign key violation
    return new DatabaseConstraintError('Related record not found', error.constraint);
  }
  if (error.code === '23502') { // Not null violation
    return new DatabaseConstraintError('Required field missing', error.column);
  }
  
  // General database error
  return new DatabaseError('Database operation failed', error);
};

/**
 * Classify network errors
 */
const classifyNetworkError = (error) => {
  const { NetworkError, TimeoutError } = require('../utils/errorTypes');
  
  // Timeout errors
  if (error.code === 'ETIMEDOUT' || error.code === 'ESOCKETTIMEDOUT') {
    return new TimeoutError('Network request', error.timeout);
  }
  
  // Connection errors
  if (error.code === 'ECONNRESET' || error.code === 'ECONNREFUSED') {
    return new NetworkError('Network connection failed');
  }
  
  // DNS errors
  if (error.code === 'ENOTFOUND') {
    return new NetworkError('Unable to reach service');
  }
  
  return new NetworkError('Network request failed');
};

/**
 * Format error response for client
 */
const isValidationError = (error) => {
  if (!error) return false;
  if (error.name === 'ValidationError') return true;
  if (error.errorCode === 'VALIDATION_ERROR') return true;
  if (Array.isArray(error.errors) && error.errors.length) return true;
  return false;
};

const determineErrorCategory = (error) => {
  if (error.errorCategory) return error.errorCategory;

  const externalCodes = new Set([
    'PAYMENT_GATEWAY_ERROR',
    'PAYMENT_GATEWAY_UNAVAILABLE',
    'EXTERNAL_SERVICE_ERROR',
    'SERVICE_UNAVAILABLE'
  ]);

  const networkCodes = new Set([
    'NETWORK_ERROR',
    'NETWORK_TIMEOUT',
    'TIMEOUT_ERROR'
  ]);

  if (externalCodes.has(error.errorCode)) {
    return 'EXTERNAL_SERVICE_ERROR';
  }

  if (networkCodes.has(error.errorCode) || error.retryable) {
    return 'NETWORK_ERROR';
  }

  if (isValidationError(error) || (error.statusCode >= 400 && error.statusCode < 500)) {
    return 'LOGIC_ERROR';
  }

  return 'LOGIC_ERROR';
};

const formatErrorResponse = (error, req) => {
  const isDevelopment = config.isDevelopment();
  
  const response = {
    status: 'error',
    message: getUserFriendlyMessage(error),
    errorCode: error.errorCode || 'INTERNAL_ERROR'
  };
  
  // Add additional info for specific error types
  if (error.errors) {
    response.errors = error.errors; // Validation errors
  }
  
  // Include details if present (e.g., payment verification details)
  if (error.details) {
    response.details = error.details;
  }
  
  if (error.retryable) {
    response.retryable = true;
    response.retryAfter = error.retryAfter || 5000; // milliseconds
  }

  if (isValidationError(error) && error.errors) {
    response.details = error.errors;
  }

  if (error.retryAfter) {
    response.retryAfter = error.retryAfter;
  }

  response.errorCategory = determineErrorCategory(error);
  
  if (error.resource) {
    response.resource = error.resource;
  }
  
  // Development mode: include stack trace and more details
  if (isDevelopment) {
    response.stack = error.stack;
    response.originalError = error.originalError?.message;
    response.requestId = req.id;
  }
  
  return response;
};

/**
 * Determine if error should be logged
 */
const shouldLogError = (error) => {
  if (error.statusCode === 404) return false;
  if (error.statusCode === 429) return false;
  if (isValidationError(error)) return false;
  if (error.statusCode === 401 || error.statusCode === 403) return false;
  return true;
};

/**
 * Main error handler middleware
 */
const errorHandler = (err, req, res, next) => {
  let error = err;
  
  // Convert non-ApplicationError to ApplicationError with special validation handling
  if (!(error instanceof ApplicationError)) {
    if (isValidationError(error)) {
      const validationError = new ApplicationError(
        error.message || 'Validation failed',
        error.statusCode || 400,
        error.errorCode || 'VALIDATION_ERROR',
        true
      );
      validationError.errors = error.errors;
      error = validationError;
    } else if (error.code && error.code.match(/^[0-9A-Z]{5}$/)) {
      error = classifyDatabaseError(error);
    } else if (error.code && error.code.match(/^E[A-Z]+$/)) {
      error = classifyNetworkError(error);
    } else {
      error = new ApplicationError(
        config.isProduction() ? 'An unexpected error occurred' : err.message,
        error.statusCode || 500,
        error.errorCode || 'INTERNAL_ERROR',
        false
      );
    }
  }

  if (isValidationError(error)) {
    error.statusCode = error.statusCode || 400;
    error.errorCode = error.errorCode || 'VALIDATION_ERROR';
  }

  error.errorCategory = determineErrorCategory(error);
  
  // Log error if needed
  if (shouldLogError(error)) {
    const failureCategory = error.failureCategory
      || (error.retryable || isRetryableError(error) || error.statusCode >= 500 ? 'resilience' : 'logic');

    // Use enhanced logger with request context capture
    const logPayload = {
      message: error.message,
      errorCode: error.errorCode,
      statusCode: error.statusCode,
      errorCategory: error.errorCategory,
      error: error, // Pass full error object for stack trace enhancement
      req: req // Pass req for automatic context capture
    };

    if (failureCategory === 'resilience') {
      logger.resilience('Request error', logPayload);
    } else {
      logger.logic('Request error', logPayload);
    }
  }
  
  // Format and send response
  const response = formatErrorResponse(error, req);
  
  // Special case: health check errors may include health data to return
  if (error.health) {
    // Merge health data with error response for health check endpoints
    Object.assign(response, error.health);
  }
  
  res.status(error.statusCode || 500).json(response);
};

/**
 * Async error wrapper for route handlers
 * Catches async errors and passes them to error handler
 * NEVER swallows errors - always passes to error handler middleware
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((error) => {
      // Always pass error to error handler - never swallow
      // Error handler will log and format the response
      next(error);
    });
  };
};

/**
 * Not found handler
 */
const notFoundHandler = (req, res, next) => {
  const { NotFoundError } = require('../utils/errorTypes');
  next(new NotFoundError('Endpoint', req.url));
};

module.exports = {
  errorHandler,
  asyncHandler,
  notFoundHandler,
  classifyDatabaseError,
  classifyNetworkError,
  formatErrorResponse
};

