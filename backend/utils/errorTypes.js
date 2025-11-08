
class ApplicationError extends Error {
  constructor(message, statusCode = 500, errorCode = 'INTERNAL_ERROR', isOperational = true) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.isOperational = isOperational; // Operational errors can be handled gracefully
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      status: 'error',
      message: this.message,
      errorCode: this.errorCode,
      ...(process.env.NODE_ENV === 'development' && { stack: this.stack })
    };
  }
}

/**
 * Authentication & Authorization Errors
 */
class AuthenticationError extends ApplicationError {
  constructor(message = 'Authentication failed', errorCode = 'AUTH_FAILED') {
    super(message, 401, errorCode);
  }
}

class AuthorizationError extends ApplicationError {
  constructor(message = 'Access denied', errorCode = 'ACCESS_DENIED') {
    super(message, 403, errorCode);
  }
}

class TokenExpiredError extends ApplicationError {
  constructor(message = 'Token has expired') {
    super(message, 401, 'TOKEN_EXPIRED');
  }
}

class TokenRevokedError extends ApplicationError {
  constructor(message = 'Token has been revoked. Please login again.') {
    super(message, 401, 'TOKEN_REVOKED');
  }
}

class SessionExpiredError extends ApplicationError {
  constructor(message = 'Session expired. Please login again.') {
    super(message, 401, 'SESSION_EXPIRED');
  }
}

/**
 * Validation Errors
 */
class ValidationError extends ApplicationError {
  constructor(message = 'Validation failed', errors = []) {
    super(message, 400, 'VALIDATION_ERROR');
    this.errors = errors;
  }

  toJSON() {
    return {
      status: 'error',
      message: this.message,
      errorCode: this.errorCode,
      errors: this.errors
    };
  }
}

class InvalidInputError extends ApplicationError {
  constructor(message = 'Invalid input provided', field = null) {
    super(message, 400, 'INVALID_INPUT');
    this.field = field;
  }
}

/**
 * Database Errors
 */
class DatabaseError extends ApplicationError {
  constructor(message = 'Database operation failed', originalError = null) {
    super(message, 500, 'DATABASE_ERROR');
    this.originalError = originalError;
  }
}

class DatabaseConnectionError extends ApplicationError {
  constructor(message = 'Failed to connect to database') {
    super(message, 503, 'DATABASE_CONNECTION_ERROR');
    this.retryable = true;
  }
}

class DatabaseTimeoutError extends ApplicationError {
  constructor(message = 'Database query timeout') {
    super(message, 504, 'DATABASE_TIMEOUT');
    this.retryable = true;
  }
}

class DatabaseConstraintError extends ApplicationError {
  constructor(message = 'Database constraint violation', constraint = null) {
    super(message, 409, 'DATABASE_CONSTRAINT_ERROR');
    this.constraint = constraint;
  }
}

/**
 * Resource Errors
 */
class NotFoundError extends ApplicationError {
  constructor(resource = 'Resource', resourceId = null) {
    super(`${resource} not found`, 404, 'NOT_FOUND');
    this.resource = resource;
    this.resourceId = resourceId;
  }
}

class AlreadyExistsError extends ApplicationError {
  constructor(resource = 'Resource') {
    super(`${resource} already exists`, 409, 'ALREADY_EXISTS');
    this.resource = resource;
  }
}

class ResourceConflictError extends ApplicationError {
  constructor(message = 'Resource conflict') {
    super(message, 409, 'RESOURCE_CONFLICT');
  }
}

/**
 * Network & External Service Errors
 */
class NetworkError extends ApplicationError {
  constructor(message = 'Network request failed', service = 'external service') {
    super(message, 503, 'NETWORK_ERROR');
    this.service = service;
    this.retryable = true;
  }
}

class ServiceUnavailableError extends ApplicationError {
  constructor(service = 'External service', message = null) {
    super(message || `${service} is currently unavailable`, 503, 'SERVICE_UNAVAILABLE');
    this.service = service;
    this.retryable = true;
  }
}

class ExternalServiceError extends ApplicationError {
  constructor(service, message = 'External service error', originalError = null) {
    super(`${service}: ${message}`, 502, 'EXTERNAL_SERVICE_ERROR');
    this.service = service;
    this.originalError = originalError;
    this.retryable = true;
  }
}

class TimeoutError extends ApplicationError {
  constructor(operation = 'Operation', timeout = null) {
    super(`${operation} timed out${timeout ? ` after ${timeout}ms` : ''}`, 504, 'TIMEOUT_ERROR');
    this.operation = operation;
    this.timeout = timeout;
    this.retryable = true;
  }
}

/**
 * Payment Errors
 */
class PaymentError extends ApplicationError {
  constructor(message = 'Payment processing failed', errorCode = 'PAYMENT_ERROR') {
    super(message, 402, errorCode);
  }
}

class PaymentGatewayError extends ApplicationError {
  constructor(gateway = 'Payment gateway', message = 'Payment gateway error', originalError = null) {
    super(`${gateway}: ${message}`, 502, 'PAYMENT_GATEWAY_ERROR');
    this.gateway = gateway;
    this.originalError = originalError;
    this.retryable = true;
  }
}

class PaymentVerificationError extends ApplicationError {
  constructor(message = 'Payment verification failed') {
    super(message, 400, 'PAYMENT_VERIFICATION_ERROR');
    this.retryable = true;
  }
}

class InsufficientFundsError extends ApplicationError {
  constructor(message = 'Insufficient funds') {
    super(message, 402, 'INSUFFICIENT_FUNDS');
  }
}

class PaymentDeclinedError extends ApplicationError {
  constructor(message = 'Payment declined', reason = null) {
    super(message, 402, 'PAYMENT_DECLINED');
    this.reason = reason;
  }
}

/**
 * SMS Service Errors
 */
class SmsError extends ApplicationError {
  constructor(message = 'SMS service error', provider = 'SMS provider') {
    super(`${provider}: ${message}`, 500, 'SMS_ERROR');
    this.provider = provider;
    this.retryable = true;
  }
}

class SmsDeliveryError extends ApplicationError {
  constructor(message = 'Failed to deliver SMS', phoneNumber = null) {
    super(message, 500, 'SMS_DELIVERY_ERROR');
    this.phoneNumber = phoneNumber;
    this.retryable = true;
  }
}

class SmsRateLimitError extends ApplicationError {
  constructor(message = 'SMS rate limit exceeded') {
    super(message, 429, 'SMS_RATE_LIMIT');
  }
}

class InvalidPhoneNumberError extends ApplicationError {
  constructor(message = 'Invalid phone number', phoneNumber = null) {
    super(message, 400, 'INVALID_PHONE_NUMBER');
    this.phoneNumber = phoneNumber;
  }
}

/**
 * File Upload Errors
 */
class FileUploadError extends ApplicationError {
  constructor(message = 'File upload failed', fileName = null) {
    super(message, 500, 'FILE_UPLOAD_ERROR');
    this.fileName = fileName;
    this.retryable = true;
  }
}

class FileSizeLimitError extends ApplicationError {
  constructor(maxSize = '5MB', actualSize = null) {
    super(`File size exceeds limit of ${maxSize}`, 413, 'FILE_SIZE_LIMIT');
    this.maxSize = maxSize;
    this.actualSize = actualSize;
  }
}

class InvalidFileTypeError extends ApplicationError {
  constructor(allowedTypes = 'images', receivedType = null) {
    super(`Invalid file type. Only ${allowedTypes} are allowed.`, 400, 'INVALID_FILE_TYPE');
    this.allowedTypes = allowedTypes;
    this.receivedType = receivedType;
  }
}

class CloudinaryError extends ApplicationError {
  constructor(message = 'Cloudinary service error', originalError = null) {
    super(`Cloudinary: ${message}`, 502, 'CLOUDINARY_ERROR');
    this.originalError = originalError;
    this.retryable = true;
  }
}

/**
 * Rate Limiting Errors
 */
class RateLimitError extends ApplicationError {
  constructor(message = 'Rate limit exceeded', retryAfter = null) {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
    this.retryAfter = retryAfter;
  }
}

/**
 * Business Logic Errors
 */
class BusinessLogicError extends ApplicationError {
  constructor(message, errorCode = 'BUSINESS_LOGIC_ERROR') {
    super(message, 400, errorCode);
  }
}

class InvalidStateError extends ApplicationError {
  constructor(message = 'Invalid state for this operation') {
    super(message, 409, 'INVALID_STATE');
  }
}

class DuplicateOperationError extends ApplicationError {
  constructor(message = 'This operation is already in progress') {
    super(message, 409, 'DUPLICATE_OPERATION');
  }
}

/**
 * WebRTC / Call Errors
 */
class CallError extends ApplicationError {
  constructor(message = 'Call failed', statusCode = 500, errorCode = 'CALL_ERROR') {
    super(message, statusCode, errorCode);
  }
}

class PeerConnectionError extends CallError {
  constructor(message = 'Peer connection failed', errorCode = 'PEER_CONNECTION_ERROR') {
    super(message, 503, errorCode);
    this.retryable = true;
  }
}

class WebRTCError extends CallError {
  constructor(message = 'WebRTC operation failed', statusCode = 500, errorCode = 'WEBRTC_ERROR') {
    super(message, statusCode, errorCode);
  }
}

class WebRTCPermissionError extends WebRTCError {
  constructor(message = 'Call not allowed', errorCode = 'WEBRTC_PERMISSION_DENIED') {
    super(message, 403, errorCode);
  }
}

class WebRTCConnectionError extends WebRTCError {
  constructor(message = 'Unable to establish WebRTC connection', errorCode = 'WEBRTC_CONNECTION_FAILED') {
    super(message, 503, errorCode);
    this.retryable = true;
  }
}

class WebRTCMediaError extends WebRTCError {
  constructor(message = 'Media device error occurred', errorCode = 'WEBRTC_MEDIA_ERROR') {
    super(message, 400, errorCode);
  }
}

class WebRTCSignalError extends WebRTCError {
  constructor(message = 'Signaling error occurred', errorCode = 'WEBRTC_SIGNAL_ERROR') {
    super(message, 502, errorCode);
    this.retryable = true;
  }
}

/**
 * Helper function to check if error is retryable
 */
const isRetryableError = (error) => {
  if (error.retryable) return true;
  
  // Network errors are usually retryable
  if (error instanceof NetworkError) return true;
  if (error instanceof ServiceUnavailableError) return true;
  if (error instanceof TimeoutError) return true;
  if (error instanceof DatabaseConnectionError) return true;
  if (error instanceof DatabaseTimeoutError) return true;
  if (error instanceof PaymentGatewayError) return true;
  if (error instanceof SmsDeliveryError) return true;
  if (error instanceof FileUploadError) return true;
  
  return false;
};

/**
 * Helper function to get user-friendly error message
 */
const getUserFriendlyMessage = (error) => {
  // Map technical errors to user-friendly messages
  const errorMessageMap = {
    'DATABASE_CONNECTION_ERROR': 'We\'re experiencing technical difficulties. Please try again in a moment.',
    'DATABASE_TIMEOUT': 'The request took too long to process. Please try again.',
    'NETWORK_ERROR': 'Network connection issue. Please check your internet and try again.',
    'SERVICE_UNAVAILABLE': 'The service is temporarily unavailable. Please try again later.',
    'PAYMENT_GATEWAY_ERROR': 'Payment service is temporarily unavailable. Please try again later.',
    'SMS_ERROR': 'Failed to send SMS. Please try again or contact support.',
    'FILE_UPLOAD_ERROR': 'Failed to upload file. Please try again.',
    'CLOUDINARY_ERROR': 'Image upload service is temporarily unavailable. Please try again.',
    'TIMEOUT_ERROR': 'Request timed out. Please try again.'
  };
  
  return errorMessageMap[error.errorCode] || error.message;
};

module.exports = {
  // Base
  ApplicationError,
  
  // Auth
  AuthenticationError,
  AuthorizationError,
  TokenExpiredError,
  TokenRevokedError,
  SessionExpiredError,
  
  // Validation
  ValidationError,
  InvalidInputError,
  
  // Database
  DatabaseError,
  DatabaseConnectionError,
  DatabaseTimeoutError,
  DatabaseConstraintError,
  
  // Resources
  NotFoundError,
  AlreadyExistsError,
  ResourceConflictError,
  
  // Network & External Services
  NetworkError,
  ServiceUnavailableError,
  ExternalServiceError,
  TimeoutError,
  
  // Payment
  PaymentError,
  PaymentGatewayError,
  PaymentVerificationError,
  InsufficientFundsError,
  PaymentDeclinedError,
  
  // SMS
  SmsError,
  SmsDeliveryError,
  SmsRateLimitError,
  InvalidPhoneNumberError,
  
  // File Upload
  FileUploadError,
  FileSizeLimitError,
  InvalidFileTypeError,
  CloudinaryError,
  
  // Rate Limiting
  RateLimitError,
  
  // Business Logic
  BusinessLogicError,
  InvalidStateError,
  DuplicateOperationError,
  
  // Calls
  CallError,
  PeerConnectionError,
  WebRTCError,
  WebRTCPermissionError,
  WebRTCConnectionError,
  WebRTCMediaError,
  WebRTCSignalError,
  
  // Helpers
  isRetryableError,
  getUserFriendlyMessage
};

