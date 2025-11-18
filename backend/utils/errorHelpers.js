const {
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  DatabaseError,
  InvalidInputError
} = require('./errorTypes');

/**
 * Helper to create validation error from express-validator results
 */
const createValidationError = (errors) => {
  if (!errors || !Array.isArray(errors) || errors.length === 0) {
    return new ValidationError('Validation failed');
  }
  
  const formattedErrors = errors.map(err => ({
    field: err.param || err.path,
    message: err.msg || err.message
  }));
  
  return new ValidationError('Validation failed', formattedErrors);
};

/**
 * Helper to check validation results and throw if invalid
 */
const validateOrThrow = (req) => {
  const { validationResult } = require('express-validator');
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw createValidationError(errors.array());
  }
};

/**
 * Helper to throw error if condition is true
 */
const throwIf = (condition, ErrorClass, message, errorCode) => {
  if (condition) {
    if (errorCode) {
      throw new ErrorClass(message, errorCode);
    } else {
      throw new ErrorClass(message);
    }
  }
};

/**
 * Helper to throw error if value is null/undefined
 */
const throwIfMissing = (value, resourceName = 'Resource') => {
  if (!value) {
    throw new NotFoundError(resourceName);
  }
  return value;
};

/**
 * Helper to throw error if user doesn't have permission
 */
const throwIfUnauthorized = (hasPermission, message = 'Access denied') => {
  if (!hasPermission) {
    throw new AuthorizationError(message);
  }
};

/**
 * Helper to throw error if authentication fails
 */
const throwIfNotAuthenticated = (isAuthenticated, message = 'Authentication required') => {
  if (!isAuthenticated) {
    throw new AuthenticationError(message);
  }
};

/**
 * Helper to wrap database operations and handle errors
 * NEVER swallows errors - always throws a standardized error
 */
const handleDatabaseError = (error, operation = 'Database operation') => {
  const logger = require('./logger');
  
  // Always log the original error for debugging
  logger.error(`Database error in ${operation}`, {
    error: error.message,
    code: error.code,
    constraint: error.constraint,
    column: error.column,
    operation
  });
  
  // Check for specific database error codes
  if (error.code === '23505') { // Unique violation
    throw new ValidationError('Duplicate entry found', [{
      field: error.constraint,
      message: 'This value already exists'
    }]);
  }
  
  if (error.code === '23503') { // Foreign key violation
    throw new ValidationError('Related record not found', [{
      field: error.constraint,
      message: 'Referenced record does not exist'
    }]);
  }
  
  if (error.code === '23502') { // Not null violation
    throw new ValidationError('Required field missing', [{
      field: error.column,
      message: 'This field is required'
    }]);
  }
  
  // Generic database error - still throw, never swallow
  throw new DatabaseError(`${operation} failed`, error);
};

/**
 * Safe async wrapper for database operations
 * Ensures errors are always logged and handled
 * Note: This function re-throws errors - use try-catch when calling
 */
const safeDatabaseOperation = async (operation, fn, context = 'Database operation') => {
  const logger = require('./logger');
  
  try {
    return await fn();
  } catch (error) {
    // Always log database errors
    logger.error(`Database operation failed: ${context}`, {
      error: error.message,
      code: error.code,
      stack: error.stack
    });
    
    // handleDatabaseError will throw a standardized error
    // This ensures the error is never swallowed
    handleDatabaseError(error, context);
    // Note: handleDatabaseError throws, so this line is never reached
  }
};

module.exports = {
  createValidationError,
  validateOrThrow,
  throwIf,
  throwIfMissing,
  throwIfUnauthorized,
  throwIfNotAuthenticated,
  handleDatabaseError,
  safeDatabaseOperation
};

