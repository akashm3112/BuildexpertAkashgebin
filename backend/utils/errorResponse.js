/**
 * ============================================================================
 * STANDARDIZED ERROR RESPONSE UTILITY
 * Purpose: Ensure all error responses follow the same format
 * ============================================================================
 */

const { ApplicationError, RateLimitError } = require('./errorTypes');
const { formatErrorResponse } = require('../middleware/errorHandler');

/**
 * Standard error response format
 * All errors should follow this structure
 */
const STANDARD_ERROR_FORMAT = {
  status: 'error',
  message: '', // User-friendly error message
  errorCode: '', // Machine-readable error code
  errorCategory: '', // LOGIC_ERROR, NETWORK_ERROR, EXTERNAL_SERVICE_ERROR
  // Optional fields:
  // errors: [], // Validation errors array
  // details: {}, // Additional error details
  // retryable: false, // Whether the error is retryable
  // retryAfter: 0, // Milliseconds to wait before retry
  // resource: '', // Resource name (for 404 errors)
};

/**
 * Create a standardized error response
 * This should be used by error handler middleware only
 * Route handlers should throw errors, not create responses directly
 */
const createErrorResponse = (error, req) => {
  return formatErrorResponse(error, req);
};

/**
 * Throw error instead of responding directly
 * Use this in rate limiters and middleware that need to pass errors to error handler
 */
const throwError = (error) => {
  // If it's already an ApplicationError, throw it
  if (error instanceof ApplicationError) {
    throw error;
  }
  
  // Otherwise, wrap it
  if (typeof error === 'string') {
    throw new ApplicationError(error, 500, 'INTERNAL_ERROR');
  }
  
  // If it's an Error object, wrap it
  if (error instanceof Error) {
    const appError = new ApplicationError(
      error.message,
      error.statusCode || 500,
      error.errorCode || 'INTERNAL_ERROR'
    );
    // Copy over any additional properties
    if (error.errors) appError.errors = error.errors;
    if (error.details) appError.details = error.details;
    throw appError;
  }
  
  // Fallback
  throw new ApplicationError('An error occurred', 500, 'INTERNAL_ERROR');
};

/**
 * Helper to ensure error response format is consistent
 * Validates that error responses match the standard format
 */
const validateErrorResponse = (response) => {
  if (!response || typeof response !== 'object') {
    return false;
  }
  
  // Required fields
  if (response.status !== 'error') {
    return false;
  }
  
  if (!response.message || typeof response.message !== 'string') {
    return false;
  }
  
  if (!response.errorCode || typeof response.errorCode !== 'string') {
    return false;
  }
  
  return true;
};

module.exports = {
  STANDARD_ERROR_FORMAT,
  createErrorResponse,
  throwError,
  validateErrorResponse
};

