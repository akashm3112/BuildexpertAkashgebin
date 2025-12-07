/**
 * ============================================================================
 * COMPREHENSIVE VALIDATION MIDDLEWARE
 * Purpose: Centralized validation schemas for all API endpoints
 * ============================================================================
 */

const { body, param, query, validationResult } = require('express-validator');
const { ValidationError } = require('../utils/errorTypes');

/**
 * Helper function to validate phone numbers (supports both US and Indian formats)
 */
const validatePhoneNumber = (value) => {
  if (!value) return false;
  const cleanNumber = value.replace(/^\+/, '').replace(/^1/, '').replace(/^91/, '');
  if (!/^\d{10}$/.test(cleanNumber)) return false;
  if (/^[6-9]/.test(cleanNumber)) return true; // Indian numbers
  if (/^[2-9]/.test(cleanNumber)) return true; // US numbers
  return false;
};

/**
 * Helper function to validate UUID format
 */
const validateUUID = (value) => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
};

/**
 * Helper function to validate date format (YYYY-MM-DD)
 */
const validateDate = (value) => {
  if (!value) return false;
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(value)) return false;
  const date = new Date(value);
  return date instanceof Date && !isNaN(date);
};

/**
 * Helper function to validate time format (HH:MM AM/PM or HH:MM)
 */
const validateTime = (value) => {
  if (!value) return false;
  const time12Hour = /^(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)$/i;
  const time24Hour = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
  return time12Hour.test(value) || time24Hour.test(value);
};

/**
 * Helper function to validate base64 image
 */
const validateBase64Image = (value) => {
  if (!value || typeof value !== 'string') return false;
  return value.startsWith('data:image/') && value.includes('base64,');
};

/**
 * Validation result handler middleware
 * Must be used after validation chains
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(err => ({
      field: err.path || err.param,
      message: err.msg,
      value: err.value
    }));
    throw new ValidationError('Validation failed', { errors: errorMessages });
  }
  next();
};

// ============================================================================
// AUTH VALIDATIONS
// ============================================================================

const validateSignup = [
  body('fullName')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Full name must be between 2 and 100 characters')
    .matches(/^[a-zA-Z\s'-]+$/)
    .withMessage('Full name can only contain letters, spaces, hyphens, and apostrophes'),
  body('email')
    .isEmail()
    .withMessage('Please enter a valid email address')
    .normalizeEmail(),
  body('phone')
    .custom(validatePhoneNumber)
    .withMessage('Please enter a valid 10-digit mobile number'),
  body('password')
    .isLength({ min: 6, max: 128 })
    .withMessage('Password must be between 6 and 128 characters'),
  body('role')
    .isIn(['user', 'provider'])
    .withMessage('Role must be either user or provider'),
  body('profilePicUrl')
    .optional({ nullable: true, checkFalsy: true })
    .custom((value) => {
      // Allow empty string, null, undefined, valid URL, or base64 data URL
      if (!value || value === '') return true;
      if (value.startsWith('data:image/')) return true; // Base64 image
      if (value.startsWith('http://') || value.startsWith('https://')) return true; // URL
      return false;
    })
    .withMessage('Profile picture must be a valid URL or base64 image data'),
  handleValidationErrors
];

const validateLogin = [
  body('phone')
    .custom(validatePhoneNumber)
    .withMessage('Please enter a valid 10-digit mobile number'),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
  body('role')
    .isIn(['user', 'provider', 'admin'])
    .withMessage('Role must be either user, provider, or admin'),
  handleValidationErrors
];

const validateOTP = [
  body('phone')
    .custom(validatePhoneNumber)
    .withMessage('Please enter a valid 10-digit mobile number'),
  body('otp')
    .isLength({ min: 6, max: 6 })
    .withMessage('OTP must be exactly 6 digits')
    .isNumeric()
    .withMessage('OTP must contain only numbers'),
  handleValidationErrors
];

const validateResendOTP = [
  body('phone')
    .custom(validatePhoneNumber)
    .withMessage('Please enter a valid 10-digit mobile number'),
  body('role')
    .isIn(['user', 'provider'])
    .withMessage('Role must be either user or provider'),
  handleValidationErrors
];

const validateRefreshToken = [
  body('refreshToken')
    .notEmpty()
    .withMessage('Refresh token is required')
    .isString()
    .withMessage('Refresh token must be a string'),
  handleValidationErrors
];

const validatePasswordReset = [
  body('phone')
    .custom(validatePhoneNumber)
    .withMessage('Please enter a valid 10-digit mobile number'),
  handleValidationErrors
];

const validatePasswordResetConfirm = [
  body('phone')
    .custom(validatePhoneNumber)
    .withMessage('Please enter a valid 10-digit mobile number'),
  body('otp')
    .isLength({ min: 6, max: 6 })
    .withMessage('OTP must be exactly 6 digits')
    .isNumeric()
    .withMessage('OTP must contain only numbers'),
  body('newPassword')
    .isLength({ min: 6, max: 128 })
    .withMessage('Password must be between 6 and 128 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
  handleValidationErrors
];

// ============================================================================
// USER VALIDATIONS
// ============================================================================

const validateUpdateProfile = [
  body('fullName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Full name must be between 2 and 100 characters')
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('Full name can only contain letters and spaces'),
  body('email')
    .optional()
    .isEmail()
    .withMessage('Please enter a valid email address')
    .normalizeEmail(),
  body('profilePicUrl')
    .optional({ nullable: true, checkFalsy: true })
    .isURL()
    .withMessage('Profile picture URL must be a valid URL'),
  handleValidationErrors
];

const validateCreateAddress = [
  body('type')
    .isIn(['home', 'work', 'other'])
    .withMessage('Address type must be home, work, or other'),
  body('fullAddress')
    .trim()
    .isLength({ min: 10, max: 500 })
    .withMessage('Full address must be between 10 and 500 characters'),
  body('state')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('State must be between 2 and 100 characters'),
  body('city')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('City must be between 2 and 100 characters'),
  body('pincode')
    .optional()
    .matches(/^\d{6}$/)
    .withMessage('Pincode must be exactly 6 digits'),
  handleValidationErrors
];

const validateUpdateAddress = [
  param('id')
    .isUUID()
    .withMessage('Address ID must be a valid UUID'),
  body('type')
    .optional()
    .isIn(['home', 'work', 'other'])
    .withMessage('Address type must be home, work, or other'),
  body('fullAddress')
    .optional()
    .trim()
    .isLength({ min: 10, max: 500 })
    .withMessage('Full address must be between 10 and 500 characters'),
  body('state')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('State must be between 2 and 100 characters'),
  body('city')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('City must be between 2 and 100 characters'),
  body('pincode')
    .optional()
    .matches(/^\d{6}$/)
    .withMessage('Pincode must be exactly 6 digits'),
  handleValidationErrors
];

const validateDeleteAddress = [
  param('id')
    .isUUID()
    .withMessage('Address ID must be a valid UUID'),
  handleValidationErrors
];

// ============================================================================
// PROVIDER VALIDATIONS
// ============================================================================

const validateUpdateProviderProfile = [
  body('yearsOfExperience')
    .optional()
    .isInt({ min: 0, max: 100 })
    .withMessage('Years of experience must be between 0 and 100'),
  body('serviceDescription')
    .optional()
    .trim()
    .isLength({ min: 10, max: 1000 })
    .withMessage('Service description must be between 10 and 1000 characters'),
  body('isEngineeringProvider')
    .optional()
    .isBoolean()
    .withMessage('isEngineeringProvider must be a boolean'),
  body('engineeringCertificateUrl')
    .optional({ nullable: true, checkFalsy: true })
    .isURL()
    .withMessage('Engineering certificate URL must be a valid URL'),
  handleValidationErrors
];

// ============================================================================
// SERVICE VALIDATIONS
// ============================================================================

const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer')
    .toInt(),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
    .toInt(),
  handleValidationErrors
];

const validateServiceId = [
  param('id')
    .isUUID()
    .withMessage('Service ID must be a valid UUID'),
  handleValidationErrors
];

const validateProviderServiceId = [
  param('providerId')
    .isUUID()
    .withMessage('Provider service ID must be a valid UUID'),
  handleValidationErrors
];

const validateServiceRegistration = [
  param('id')
    .isUUID()
    .withMessage('Service ID must be a valid UUID'),
  body('yearsOfExperience')
    .isInt({ min: 0, max: 100 })
    .withMessage('Years of experience must be between 0 and 100'),
  body('serviceDescription')
    .trim()
    .isLength({ min: 10, max: 1000 })
    .withMessage('Service description must be between 10 and 1000 characters'),
  body('serviceChargeValue')
    .isFloat({ min: 0 })
    .withMessage('Service charge value must be a positive number'),
  body('serviceChargeUnit')
    .isIn(['hourly', 'daily', 'per_sqft', 'per_project', 'fixed'])
    .withMessage('Service charge unit must be hourly, daily, per_sqft, per_project, or fixed'),
  body('state')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('State must be between 2 and 100 characters'),
  body('city')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('City must be between 2 and 100 characters'),
  body('fullAddress')
    .trim()
    .isLength({ min: 10, max: 500 })
    .withMessage('Full address must be between 10 and 500 characters'),
  body('workingProofUrls')
    .optional()
    .isArray()
    .withMessage('Working proof URLs must be an array'),
  body('workingProofUrls.*')
    .optional()
    .isURL()
    .withMessage('Each working proof URL must be a valid URL'),
  body('isEngineeringProvider')
    .optional()
    .isBoolean()
    .withMessage('isEngineeringProvider must be a boolean'),
  body('engineeringCertificateUrl')
    .optional({ nullable: true, checkFalsy: true })
    .isURL()
    .withMessage('Engineering certificate URL must be a valid URL'),
  handleValidationErrors
];

const validateUpdateServiceRegistration = [
  param('id')
    .isUUID()
    .withMessage('Service ID must be a valid UUID'),
  body('yearsOfExperience')
    .optional()
    .isInt({ min: 0, max: 100 })
    .withMessage('Years of experience must be between 0 and 100'),
  body('serviceDescription')
    .optional()
    .trim()
    .isLength({ min: 10, max: 1000 })
    .withMessage('Service description must be between 10 and 1000 characters'),
  body('serviceChargeValue')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Service charge value must be a positive number'),
  body('serviceChargeUnit')
    .optional()
    .isIn(['hourly', 'daily', 'per_sqft', 'per_project', 'fixed'])
    .withMessage('Service charge unit must be hourly, daily, per_sqft, per_project, or fixed'),
  body('state')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('State must be between 2 and 100 characters'),
  body('city')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('City must be between 2 and 100 characters'),
  body('fullAddress')
    .optional()
    .trim()
    .isLength({ min: 10, max: 500 })
    .withMessage('Full address must be between 10 and 500 characters'),
  body('workingProofUrls')
    .optional()
    .isArray()
    .withMessage('Working proof URLs must be an array'),
  body('workingProofUrls.*')
    .optional()
    .isURL()
    .withMessage('Each working proof URL must be a valid URL'),
  handleValidationErrors
];

const validateDeleteServiceRegistration = [
  param('serviceId')
    .isUUID()
    .withMessage('Service ID must be a valid UUID'),
  handleValidationErrors
];

// ============================================================================
// BOOKING VALIDATIONS
// ============================================================================

const validateCreateBooking = [
  body('providerServiceId')
    .isUUID()
    .withMessage('Provider service ID must be a valid UUID'),
  body('selectedService')
    .optional()
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Selected service must be between 1 and 200 characters'),
  body('appointmentDate')
    .custom(validateDate)
    .withMessage('Appointment date must be in YYYY-MM-DD format'),
  body('appointmentTime')
    .custom(validateTime)
    .withMessage('Appointment time must be in HH:MM AM/PM or HH:MM format'),
  body('address')
    .optional()
    .trim()
    .isLength({ min: 10, max: 500 })
    .withMessage('Address must be between 10 and 500 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Description must not exceed 1000 characters'),
  handleValidationErrors
];

const validateUpdateBooking = [
  param('id')
    .isUUID()
    .withMessage('Booking ID must be a valid UUID'),
  body('status')
    .isIn(['pending', 'accepted', 'rejected', 'completed', 'cancelled'])
    .withMessage('Status must be pending, accepted, rejected, completed, or cancelled'),
  body('appointmentDate')
    .optional()
    .custom(validateDate)
    .withMessage('Appointment date must be in YYYY-MM-DD format'),
  body('appointmentTime')
    .optional()
    .custom(validateTime)
    .withMessage('Appointment time must be in HH:MM AM/PM or HH:MM format'),
  body('rejectionReason')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Rejection reason must not exceed 500 characters'),
  body('cancellationReason')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Cancellation reason must not exceed 500 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Description must not exceed 1000 characters'),
  handleValidationErrors
];

const validateCancelBooking = [
  param('id')
    .isUUID()
    .withMessage('Booking ID must be a valid UUID'),
  body('cancellationReason')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Cancellation reason must not exceed 500 characters'),
  handleValidationErrors
];

const validateReportBooking = [
  param('id')
    .isUUID()
    .withMessage('Booking ID must be a valid UUID'),
  body('reportReason')
    .trim()
    .isLength({ min: 10, max: 500 })
    .withMessage('Report reason must be between 10 and 500 characters'),
  body('reportDescription')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Report description must not exceed 1000 characters'),
  handleValidationErrors
];

const validateRateBooking = [
  param('id')
    .isUUID()
    .withMessage('Booking ID must be a valid UUID'),
  body('rating')
    .isInt({ min: 1, max: 5 })
    .withMessage('Rating must be between 1 and 5'),
  body('review')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Review must not exceed 1000 characters'),
  handleValidationErrors
];

// ============================================================================
// PAYMENT VALIDATIONS
// ============================================================================

const validateInitiatePayment = [
  body('providerServiceId')
    .isUUID()
    .withMessage('Provider service ID must be a valid UUID'),
  body('amount')
    .isFloat({ min: 0.01 })
    .withMessage('Amount must be a positive number'),
  body('serviceCategory')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Service category must be between 1 and 100 characters'),
  body('serviceName')
    .optional()
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Service name must be between 1 and 200 characters'),
  body('pricingPlanId')
    .optional()
    .isUUID()
    .withMessage('Pricing plan ID must be a valid UUID'),
  body('currencyCode')
    .optional()
    .isIn(['INR', 'USD'])
    .withMessage('Currency code must be INR or USD'),
  handleValidationErrors
];

const validateVerifyPayment = [
  body('orderId')
    .notEmpty()
    .withMessage('Order ID is required')
    .isString()
    .withMessage('Order ID must be a string'),
  body('transactionId')
    .optional()
    .isString()
    .withMessage('Transaction ID must be a string'),
  handleValidationErrors
];

// ============================================================================
// NOTIFICATION VALIDATIONS
// ============================================================================

const validateNotificationQuery = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer')
    .toInt(),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
    .toInt(),
  query('type')
    .optional()
    .isIn(['booking', 'payment', 'service', 'message', 'reminder', 'offer'])
    .withMessage('Type must be booking, payment, service, message, reminder, or offer'),
  handleValidationErrors
];

const validateMarkNotificationRead = [
  param('id')
    .isUUID()
    .withMessage('Notification ID must be a valid UUID'),
  handleValidationErrors
];

const validateMarkAllNotificationsRead = [
  body('type')
    .optional()
    .isIn(['booking', 'payment', 'service', 'message', 'reminder', 'offer'])
    .withMessage('Type must be booking, payment, service, message, reminder, or offer'),
  handleValidationErrors
];

// ============================================================================
// UPLOAD VALIDATIONS
// ============================================================================

const validateBase64Upload = [
  body('image')
    .notEmpty()
    .withMessage('Base64 image data is required')
    .custom(validateBase64Image)
    .withMessage('Image must be a valid base64 encoded image'),
  body('folder')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Folder must be between 1 and 100 characters'),
  handleValidationErrors
];

const validateMultipleBase64Upload = [
  body('images')
    .isArray({ min: 1, max: 10 })
    .withMessage('Images must be an array with 1 to 10 items'),
  body('images.*')
    .custom(validateBase64Image)
    .withMessage('Each image must be a valid base64 encoded image'),
  body('folder')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Folder must be between 1 and 100 characters'),
  handleValidationErrors
];

// ============================================================================
// CALL VALIDATIONS
// ============================================================================

const validateInitiateCall = [
  body('bookingId')
    .isUUID()
    .withMessage('Booking ID must be a valid UUID'),
  body('callerType')
    .isIn(['user', 'provider'])
    .withMessage('Caller type must be user or provider'),
  handleValidationErrors
];

const validateLogCall = [
  body('bookingId')
    .isUUID()
    .withMessage('Booking ID must be a valid UUID'),
  body('duration')
    .isInt({ min: 0 })
    .withMessage('Duration must be a non-negative integer'),
  body('callerType')
    .isIn(['user', 'provider'])
    .withMessage('Caller type must be user or provider'),
  body('status')
    .optional()
    .isIn(['completed', 'failed', 'missed', 'rejected'])
    .withMessage('Status must be completed, failed, missed, or rejected'),
  body('connectionQuality')
    .optional()
    .isIn(['excellent', 'good', 'fair', 'poor'])
    .withMessage('Connection quality must be excellent, good, fair, or poor'),
  handleValidationErrors
];

const validateCallHistory = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer')
    .toInt(),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50')
    .toInt(),
  handleValidationErrors
];

// ============================================================================
// PUSH NOTIFICATION VALIDATIONS
// ============================================================================

const validateRegisterToken = [
  body('token')
    .notEmpty()
    .withMessage('Push notification token is required')
    .isString()
    .withMessage('Token must be a string'),
  body('deviceType')
    .isIn(['ios', 'android', 'web'])
    .withMessage('Device type must be ios, android, or web'),
  handleValidationErrors
];

const validateSendTestNotification = [
  body('title')
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Title must be between 1 and 200 characters'),
  body('body')
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage('Body must be between 1 and 500 characters'),
  handleValidationErrors
];

const validateUpdateNotificationSettings = [
  body('enabled')
    .optional()
    .isBoolean()
    .withMessage('Enabled must be a boolean'),
  body('bookingNotifications')
    .optional()
    .isBoolean()
    .withMessage('Booking notifications must be a boolean'),
  body('paymentNotifications')
    .optional()
    .isBoolean()
    .withMessage('Payment notifications must be a boolean'),
  body('serviceNotifications')
    .optional()
    .isBoolean()
    .withMessage('Service notifications must be a boolean'),
  handleValidationErrors
];

// ============================================================================
// ADMIN VALIDATIONS
// ============================================================================

const validateAdminPagination = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer')
    .toInt(),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
    .toInt(),
  handleValidationErrors
];

const validateAdminStatus = [
  query('status')
    .optional()
    .isIn(['open', 'resolved', 'closed', 'all'])
    .withMessage('Status must be open, resolved, closed, or all'),
  handleValidationErrors
];

const validateAdminType = [
  query('type')
    .optional()
    .isIn(['all', 'user', 'provider'])
    .withMessage('Type must be all, user, or provider'),
  handleValidationErrors
];

const validateAdminUUID = [
  param('id')
    .isUUID()
    .withMessage('ID must be a valid UUID'),
  handleValidationErrors
];

// ============================================================================
// PUBLIC ROUTE VALIDATIONS
// ============================================================================

const validatePublicServiceId = [
  param('id')
    .isUUID()
    .withMessage('Service ID must be a valid UUID'),
  handleValidationErrors
];

const validatePublicProviderServiceId = [
  param('providerId')
    .isUUID()
    .withMessage('Provider service ID must be a valid UUID'),
  handleValidationErrors
];

const validatePublicProviderServiceIdParam = [
  param('providerServiceId')
    .isUUID()
    .withMessage('Provider service ID must be a valid UUID'),
  handleValidationErrors
];

const validatePublicProvidersQuery = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer')
    .toInt(),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
    .toInt(),
  query('state')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('State must be between 2 and 100 characters'),
  query('userCity')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('User city must be between 2 and 100 characters'),
  query('userState')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('User state must be between 2 and 100 characters'),
  handleValidationErrors
];

const validateReverseGeocode = [
  query('lat')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be between -90 and 90')
    .toFloat(),
  query('lon')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be between -180 and 180')
    .toFloat(),
  handleValidationErrors
];

// ============================================================================
// EARNINGS VALIDATIONS
// ============================================================================

const validateEarningsQuery = [
  query('startDate')
    .optional()
    .custom(validateDate)
    .withMessage('Start date must be in YYYY-MM-DD format'),
  query('endDate')
    .optional()
    .custom(validateDate)
    .withMessage('End date must be in YYYY-MM-DD format'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer')
    .toInt(),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
    .toInt(),
  handleValidationErrors
];

// ============================================================================
// MONITORING VALIDATIONS
// ============================================================================

const validateMonitoringQuery = [
  query('startDate')
    .optional()
    .custom(validateDate)
    .withMessage('Start date must be in YYYY-MM-DD format'),
  query('endDate')
    .optional()
    .custom(validateDate)
    .withMessage('End date must be in YYYY-MM-DD format'),
  handleValidationErrors
];

module.exports = {
  // Auth
  validateSignup,
  validateLogin,
  validateOTP,
  validateResendOTP,
  validateRefreshToken,
  validatePasswordReset,
  validatePasswordResetConfirm,
  
  // User
  validateUpdateProfile,
  validateCreateAddress,
  validateUpdateAddress,
  validateDeleteAddress,
  
  // Provider
  validateUpdateProviderProfile,
  
  // Service
  validatePagination,
  validateServiceId,
  validateProviderServiceId,
  validateServiceRegistration,
  validateUpdateServiceRegistration,
  validateDeleteServiceRegistration,
  
  // Booking
  validateCreateBooking,
  validateUpdateBooking,
  validateCancelBooking,
  validateReportBooking,
  validateRateBooking,
  
  // Payment
  validateInitiatePayment,
  validateVerifyPayment,
  
  // Notification
  validateNotificationQuery,
  validateMarkNotificationRead,
  validateMarkAllNotificationsRead,
  
  // Upload
  validateBase64Upload,
  validateMultipleBase64Upload,
  
  // Call
  validateInitiateCall,
  validateLogCall,
  validateCallHistory,
  
  // Push Notification
  validateRegisterToken,
  validateSendTestNotification,
  validateUpdateNotificationSettings,
  
  // Admin
  validateAdminPagination,
  validateAdminStatus,
  validateAdminType,
  validateAdminUUID,
  
  // Public
  validatePublicServiceId,
  validatePublicProviderServiceId,
  validatePublicProviderServiceIdParam,
  validatePublicProvidersQuery,
  validateReverseGeocode,
  
  // Earnings
  validateEarningsQuery,
  
  // Monitoring
  validateMonitoringQuery,
  
  // Helper
  handleValidationErrors
};

