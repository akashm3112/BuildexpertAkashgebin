const logger = require('./logger');
const { isRetryableError } = require('./errorTypes');


const DEFAULT_CONFIG = {
  maxRetries: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  backoffMultiplier: 2,
  retryableErrors: [], // Array of error types to retry
  onRetry: null, // Callback on each retry
  shouldRetry: null // Custom retry logic
};

/**
 * Calculate delay with exponential backoff
 */
const calculateDelay = (retryCount, config) => {
  const delay = config.initialDelay * Math.pow(config.backoffMultiplier, retryCount);
  return Math.min(delay, config.maxDelay);
};

/**
 * Sleep for specified milliseconds
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Determine if error should be retried
 */
const shouldRetryError = (error, config) => {
  // Use custom retry logic if provided
  if (config.shouldRetry) {
    return config.shouldRetry(error);
  }
  
  // Check if error is in retryable errors list
  if (config.retryableErrors.length > 0) {
    return config.retryableErrors.some(ErrorType => error instanceof ErrorType);
  }
  
  // Use built-in retry logic
  return isRetryableError(error);
};

/**
 * Execute function with retry logic
 * @param {Function} fn - Async function to execute
 * @param {Object} config - Retry configuration
 * @param {string} operationName - Name for logging
 * @returns {Promise} Result of function execution
 */
const withRetry = async (fn, config = {}, operationName = 'operation') => {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  let lastError;
  
  for (let attempt = 0; attempt <= fullConfig.maxRetries; attempt++) {
    try {
      // Execute the function
      const result = await fn();
      
      // Success - return result
      if (attempt > 0) {
        logger.info(`${operationName} succeeded after ${attempt} retries`);
      }
      return result;
      
    } catch (error) {
      lastError = error;
      
      // Check if we should retry
      const shouldRetry = shouldRetryError(error, fullConfig);
      const isLastAttempt = attempt === fullConfig.maxRetries;
      
      if (!shouldRetry || isLastAttempt) {
        // Don't retry - throw error
        if (attempt > 0) {
          logger.error(`${operationName} failed after ${attempt} retries`, {
            error: error.message,
            attempts: attempt + 1
          });
        }
        throw error;
      }
      
      // Calculate delay for next retry
      const delay = calculateDelay(attempt, fullConfig);
      
      // Log retry
      logger.warn(`${operationName} failed, retrying in ${delay}ms`, {
        attempt: attempt + 1,
        maxRetries: fullConfig.maxRetries,
        error: error.message,
        errorCode: error.errorCode
      });
      
      // Call retry callback if provided
      if (fullConfig.onRetry) {
        fullConfig.onRetry(attempt + 1, error);
      }
      
      // Wait before retrying
      await sleep(delay);
    }
  }
  
  // Should never reach here, but just in case
  throw lastError;
};

/**
 * Retry with custom backoff strategy
 */
const withExponentialBackoff = async (fn, maxRetries = 3, operationName = 'operation') => {
  return withRetry(fn, {
    maxRetries,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2
  }, operationName);
};

/**
 * Retry with linear backoff
 */
const withLinearBackoff = async (fn, maxRetries = 3, delayMs = 2000, operationName = 'operation') => {
  return withRetry(fn, {
    maxRetries,
    initialDelay: delayMs,
    maxDelay: delayMs,
    backoffMultiplier: 1
  }, operationName);
};

/**
 * Retry specifically for database operations
 */
const withDatabaseRetry = async (fn, operationName = 'database operation') => {
  const { DatabaseConnectionError, DatabaseTimeoutError } = require('./errorTypes');
  
  return withRetry(fn, {
    maxRetries: 3,
    initialDelay: 500,
    maxDelay: 5000,
    backoffMultiplier: 2,
    retryableErrors: [DatabaseConnectionError, DatabaseTimeoutError]
  }, operationName);
};

/**
 * Retry specifically for network/external service calls
 */
const withNetworkRetry = async (fn, operationName = 'network request') => {
  const { NetworkError, ServiceUnavailableError, TimeoutError, ExternalServiceError } = require('./errorTypes');
  
  return withRetry(fn, {
    maxRetries: 3,
    initialDelay: 2000,
    maxDelay: 10000,
    backoffMultiplier: 2,
    retryableErrors: [NetworkError, ServiceUnavailableError, TimeoutError, ExternalServiceError]
  }, operationName);
};

/**
 * Retry for payment gateway operations
 */
const withPaymentRetry = async (fn, operationName = 'payment operation') => {
  const { PaymentGatewayError, PaymentVerificationError } = require('./errorTypes');
  
  return withRetry(fn, {
    maxRetries: 2, // Payment retries should be conservative
    initialDelay: 3000,
    maxDelay: 10000,
    backoffMultiplier: 2,
    retryableErrors: [PaymentGatewayError, PaymentVerificationError]
  }, operationName);
};

/**
 * Retry for SMS operations
 */
const withSmsRetry = async (fn, operationName = 'SMS operation') => {
  const { SmsError, SmsDeliveryError } = require('./errorTypes');
  
  return withRetry(fn, {
    maxRetries: 2,
    initialDelay: 2000,
    maxDelay: 8000,
    backoffMultiplier: 2,
    retryableErrors: [SmsError, SmsDeliveryError]
  }, operationName);
};

/**
 * Retry for file upload operations
 */
const withUploadRetry = async (fn, operationName = 'file upload') => {
  const { FileUploadError, CloudinaryError } = require('./errorTypes');
  
  return withRetry(fn, {
    maxRetries: 2,
    initialDelay: 2000,
    maxDelay: 8000,
    backoffMultiplier: 2,
    retryableErrors: [FileUploadError, CloudinaryError]
  }, operationName);
};

module.exports = {
  withRetry,
  withExponentialBackoff,
  withLinearBackoff,
  withDatabaseRetry,
  withNetworkRetry,
  withPaymentRetry,
  withSmsRetry,
  withUploadRetry,
  calculateDelay,
  sleep
};

