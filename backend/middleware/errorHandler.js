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
const formatErrorResponse = (error, req) => {
  const isDevelopment = config.isDevelopment();
  
  // Base response
  const response = {
    status: 'error',
    message: error.message || 'An error occurred',
    errorCode: error.errorCode || 'INTERNAL_ERROR'
  };
  
  // Add additional info for specific error types
  if (error.errors) {
    response.errors = error.errors; // Validation errors
  }
  
  if (error.retryable) {
    response.retryable = true;
    response.retryAfter = error.retryAfter || 5000; // milliseconds
  }
  
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
  // Don't log expected operational errors
  if (error.statusCode === 400 || error.statusCode === 404) {
    return false;
  }
  
  // Don't log auth errors (they're tracked in security_events)
  if (error.statusCode === 401 || error.statusCode === 403) {
    return false;
  }
  
  // Don't log rate limit errors (they're tracked separately)
  if (error.statusCode === 429) {
    return false;
  }
  
  // Log all server errors
  return true;
};

/**
 * Main error handler middleware
 */
const errorHandler = (err, req, res, next) => {
  let error = err;
  
  // Convert non-ApplicationError to ApplicationError
  if (!(error instanceof ApplicationError)) {
    // Database errors
    if (error.code && error.code.match(/^[0-9A-Z]{5}$/)) {
      error = classifyDatabaseError(error);
    }
    // Network errors
    else if (error.code && error.code.match(/^E[A-Z]+$/)) {
      error = classifyNetworkError(error);
    }
    // Generic error
    else {
      const { ApplicationError } = require('../utils/errorTypes');
      error = new ApplicationError(
        config.isProduction() ? 'An unexpected error occurred' : err.message,
        500,
        'INTERNAL_ERROR',
        false // Non-operational (unexpected)
      );
    }
  }
  
  // Log error if needed
  if (shouldLogError(error)) {
    logger.error('Request error', {
      message: error.message,
      errorCode: error.errorCode,
      statusCode: error.statusCode,
      url: req.url,
      method: req.method,
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      stack: error.stack,
      originalError: error.originalError?.message
    });
  }
  
  // Format and send response
  const response = formatErrorResponse(error, req);
  res.status(error.statusCode || 500).json(response);
};

/**
 * Async error wrapper for route handlers
 * Catches async errors and passes them to error handler
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
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

