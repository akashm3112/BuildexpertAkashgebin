const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const { query, getRow } = require('../database/connection');
const { auth } = require('../middleware/auth');
const { formatNotificationTimestamp } = require('../utils/timezone');
const { sendNotification, sendAutoNotification } = require('../utils/notifications');
const { uploadImage } = require('../utils/cloudinary');
const config = require('../utils/config');
const logger = require('../utils/logger');
const getIO = () => require('../server').io;
const { asyncHandler } = require('../middleware/errorHandler');
const {
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError
} = require('../utils/errorTypes');
const { validateOrThrow, throwIf, throwIfMissing, handleDatabaseError } = require('../utils/errorHelpers');
const {
  generateOTP,
  sendOTP,
  storeOTP,
  verifyOTP,
  resendOTP,
  storePendingSignup,
  getPendingSignup,
  deletePendingSignup,
  createPasswordResetSession,
  validatePasswordResetSession,
  consumePasswordResetSession
} = require('../utils/otp');
const rateLimit = require('express-rate-limit');
const { blacklistToken, blacklistAllUserTokens } = require('../utils/tokenBlacklist');
const { createSession, invalidateSession, invalidateAllUserSessions, invalidateSessionById, getUserSessions } = require('../utils/sessionManager');
const { logSecurityEvent, logLoginAttempt, getRecentFailedAttempts, shouldBlockIP } = require('../utils/securityAudit');
const { generateTokenPair, refreshAccessToken, revokeRefreshToken, revokeAllUserRefreshTokens } = require('../utils/refreshToken');

// Admin bypass only allowed in development mode for testing
// In production, admins must follow normal security checks
// To enable in development: Set ENABLE_ADMIN_BYPASS=true in config.env
// SECURITY: Never enable this in production - it bypasses critical security checks
const ADMIN_BYPASS_ENABLED = config.isDevelopment() && process.env.ENABLE_ADMIN_BYPASS === 'true';
const ADMIN_BYPASS_PHONE = process.env.DEFAULT_ADMIN_PHONE || '9999999999';
const ADMIN_BYPASS_PASSWORD = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';

// SECURITY WARNING: Default credentials are weak - change in production!
// In production, ensure:
// 1. Strong admin passwords (minimum 12 characters, mixed case, numbers, symbols)
// 2. ENABLE_ADMIN_BYPASS is NOT set (or set to false)
// 3. Admin accounts are created manually, not auto-created
const {
  normalizePhoneNumber,
  normalizeEmail,
  isIdentifierBlocked,
  isAnyIdentifierBlocked
} = require('../utils/blocklist');

const router = express.Router();

// Helper function to validate phone numbers (supports both US and Indian formats)
const validatePhoneNumber = (value) => {
  // Remove any existing country code or special characters
  const cleanNumber = value.replace(/^\+/, '').replace(/^1/, '').replace(/^91/, '');
  
  // Check if it's a valid 10-digit number
  if (!/^\d{10}$/.test(cleanNumber)) {
    return false;
  }
  
  // For Indian numbers: should start with 6, 7, 8, or 9
  if (/^[6-9]/.test(cleanNumber)) {
    return true;
  }
  
  // For US numbers: should start with 2-9 (area codes don't start with 0 or 1)
  if (/^[2-9]/.test(cleanNumber)) {
    return true;
  }
  
  return false;
};

// Validation middleware
const validateSignup = [
  body('fullName').trim().isLength({ min: 2 }).withMessage('Full name must be at least 2 characters'),
  body('email').isEmail().withMessage('Please enter a valid email'),
  body('phone').custom(validatePhoneNumber).withMessage('Please enter a valid 10-digit mobile number'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').isIn(['user', 'provider']).withMessage('Role must be either user or provider'),
  body('profilePicUrl').optional({ nullable: true, checkFalsy: true }).isString().withMessage('Profile picture URL must be a string')
];

const validateLogin = [
  body('phone').custom(validatePhoneNumber).withMessage('Please enter a valid 10-digit mobile number'),
  body('password').notEmpty().withMessage('Password is required'),
  body('role').isIn(['user', 'provider', 'admin']).withMessage('Role must be either user, provider, or admin')
];

const validateOTP = [
  body('phone').custom(validatePhoneNumber).withMessage('Please enter a valid 10-digit mobile number'),
  body('otp').isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits')
];

// ============================================================================
// COMPREHENSIVE RATE LIMITING
// Purpose: Prevent brute force attacks and API abuse
// ============================================================================

// Login endpoint - strict rate limiting (5 attempts per 15 minutes per IP)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { status: 'error', message: 'Too many login attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  // Remove admin bypass from rate limiting - admins should follow same security rules
  // This prevents abuse if admin phone number is known
  skip: (req) => {
    // No bypass - all users including admins must follow rate limits
    return false;
  },
  keyGenerator: (req) => {
    const normalizedPhone = normalizePhoneNumber(req.body?.phone || '');
    if (normalizedPhone) {
      return `${normalizedPhone}:${req.body?.role || 'unknown'}`;
    }
    return req.ip || req.connection.remoteAddress || 'unknown';
  }
});

// Signup endpoint - moderate rate limiting (100 signups per hour per IP - temporarily increased for testing)
const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100, // Temporarily increased from 3 to 100 to allow testing
  message: { status: 'error', message: 'Too many signup attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// OTP request limiter - prevent OTP spam (5 requests per 15 minutes per phone)
const otpRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: { status: 'error', message: 'Too many OTP requests. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Rate limit by phone number
    return req.body.phone || req.ip;
  }
});

// OTP verification limiter - prevent brute force (10 attempts per 15 minutes per phone)
const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { status: 'error', message: 'Too many verification attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.body.phone || req.ip;
  }
});

// Password reset limiter - prevent password reset abuse (3 attempts per hour per phone)
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  message: { status: 'error', message: 'Too many password reset attempts. Please try again in 1 hour.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.body.phone || req.ip;
  }
});

// Token refresh limiter - prevent token refresh abuse
// Stricter limits: 10 attempts per 15 minutes per refresh token/user
// This prevents brute force attacks on refresh tokens
const tokenRefreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Reduced from 20 to 10 for better security
  message: { status: 'error', message: 'Too many token refresh requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful refreshes against limit
  // Use refresh token hash as key to track per-token attempts
  // This prevents abuse even if multiple users share same IP
  keyGenerator: (req) => {
    const refreshToken = req.body?.refreshToken;
    if (refreshToken) {
      // Create a hash of the refresh token for rate limiting
      // This allows tracking per-token without storing the actual token
      // Using crypto module already imported at top of file
      const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      return `refresh:${tokenHash}`;
    }
    // Fallback to IP if no token provided
    return req.ip || req.connection.remoteAddress || 'unknown';
  },
  // Custom handler to log rate limit violations
  handler: (req, res) => {
    logger.warn('Token refresh rate limit exceeded', {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      hasToken: !!req.body?.refreshToken
    });
    res.status(429).json({
      status: 'error',
      message: 'Too many token refresh requests. Please try again in 15 minutes.'
    });
  }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate JWT token with JTI (JWT ID) for session tracking
 * @param {number} userId - User ID
 * @returns {Object} Token and metadata
 */
const generateToken = (userId) => {
  // Generate unique JWT ID for token tracking and blacklisting
  const jti = crypto.randomBytes(16).toString('hex');
  
  // Calculate expiration time
  const expiresIn = config.get('jwt.expire'); // e.g., '7d', '24h'
  const expiresInMs = parseExpiry(expiresIn);
  const expiresAt = new Date(Date.now() + expiresInMs);
  
  // Generate token with JTI
  const token = jwt.sign(
    { 
      userId,
      jti // JWT ID for session tracking
    }, 
    config.get('jwt.secret'), 
    {
      expiresIn
    }
  );
  
  return {
    token,
    jti,
    expiresAt
  };
};

/**
 * Parse expiry string (e.g., '7d', '24h') to milliseconds
 * @param {string} expiry - Expiry string
 * @returns {number} Milliseconds
 */
const parseExpiry = (expiry) => {
  const match = expiry.match(/^(\d+)([dhms])$/);
  if (!match) return 7 * 24 * 60 * 60 * 1000; // Default 7 days
  
  const value = parseInt(match[1], 10);
  const unit = match[2];
  
  switch (unit) {
    case 'd': return value * 24 * 60 * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'm': return value * 60 * 1000;
    case 's': return value * 1000;
    default: return 7 * 24 * 60 * 60 * 1000;
  }
};

/**
 * Get client IP address from request
 * @param {Object} req - Express request object
 * @returns {string} IP address
 */
const getClientIP = (req) => {
  return req.ip || 
         req.headers['x-forwarded-for']?.split(',')[0].trim() || 
         req.headers['x-real-ip'] || 
         req.connection.remoteAddress || 
         'unknown';
};

// @route   POST /api/auth/signup
// @desc    Register a new user
// @access  Public
router.post('/signup', [signupLimiter, ...validateSignup], asyncHandler(async (req, res) => {
  // Validate input - throws ValidationError if invalid
  validateOrThrow(req);

  const { fullName, email, password, role, profilePicUrl } = req.body;

  // Clean and normalize identifiers
  const phone = normalizePhoneNumber(req.body.phone);
  let normalizedEmail = null;
  try {
    normalizedEmail = normalizeEmail(email);
  } catch (emailError) {
    logger.error('Email normalization error', { error: emailError.message, email });
    throw new ValidationError('Invalid email format provided.');
  }

  if (!phone) {
    throw new ValidationError('Invalid phone number provided.');
  }

  // Default profile picture URL (the generic user icon you provided)
  const DEFAULT_PROFILE_PIC = 'https://res.cloudinary.com/dqoizs0fu/raw/upload/v1756189484/profile-pictures/m3szbez4bzvwh76j1fle';
  
  // Use provided profile picture URL or default
  const finalProfilePicUrl = profilePicUrl || DEFAULT_PROFILE_PIC;

  // Validate role
  if (role !== 'provider' && role !== 'user') {
    throw new ValidationError('Invalid role. Must be either provider or user.');
  }

  // Check if identifiers are blocked for this role
  const blockedPhone = await isIdentifierBlocked({
    identifierType: 'phone',
    identifierValue: phone,
    role
  });

  if (blockedPhone) {
    throw new AuthorizationError('This phone number has been blocked by the BuildXpert admin. Please contact support for assistance.');
  }

  if (normalizedEmail) {
    const blockedEmail = await isIdentifierBlocked({
      identifierType: 'email',
      identifierValue: normalizedEmail,
      role
    });

    if (blockedEmail) {
      throw new AuthorizationError('This email address has been blocked by the BuildXpert admin. Please contact support for assistance.');
    }
  }

  // Check if user already exists with the same phone and role
  const existingUser = await getRow(
    'SELECT * FROM users WHERE (phone = $1 AND role = $2) OR lower(email) = $3',
    [phone, role, normalizedEmail]
  );
  
  if (existingUser) {
    const message = (existingUser.phone === phone && existingUser.role === role)
      ? `Phone number already registered as a ${role}`
      : 'Email already registered';
    throw new ValidationError(message);
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 12);

  // Generate and send OTP
  const otp = generateOTP();
  const otpResult = await sendOTP(phone, otp);
  if (otpResult.success) {
    storeOTP(phone, otp);
    // Store pending signup data (do not insert into DB yet)
    logger.auth('Storing pending signup data', {
      phone,
      role,
      hasProfilePic: !!finalProfilePicUrl
    });
    storePendingSignup(phone, {
      fullName,
      email: normalizedEmail,
      phone,
      password: hashedPassword,
      role,
      profilePicUrl: finalProfilePicUrl
    });
    return res.json({
      status: 'success',
      message: 'OTP sent successfully to your mobile number. Please verify to complete signup.'
    });
  } else {
    throw new Error('Failed to send OTP. Please try again.');
  }
}));

// @route   POST /api/auth/send-otp
// @desc    Send OTP to phone number
// @access  Public
router.post('/send-otp', [otpRequestLimiter,
  body('phone').custom(validatePhoneNumber).withMessage('Please enter a valid 10-digit mobile number')
], asyncHandler(async (req, res) => {
  validateOrThrow(req);

  // Clean phone number by removing any country code prefix
  const phone = normalizePhoneNumber(req.body.phone);

  if (!phone) {
    throw new ValidationError('Invalid phone number provided.');
  }

  // Check if user exists
  const user = await getRow('SELECT * FROM users WHERE phone = $1', [phone]);
  if (!user) {
    throw new NotFoundError('User not found. Please register first.');
  }

  const blockedAccount = await isAnyIdentifierBlocked({
    phone,
    email: user.email,
    role: user.role
  });

  if (blockedAccount) {
    throw new AuthorizationError('This account has been blocked by the BuildXpert admin. Please contact support for assistance.');
  }

  // Generate and send OTP
  const otp = generateOTP();
  const otpResult = await sendOTP(phone, otp);
  
  if (otpResult.success) {
    storeOTP(phone, otp);
    
    res.json({
      status: 'success',
      message: 'OTP sent successfully to your mobile number.'
    });
  } else {
    throw new ValidationError(otpResult.error || 'Failed to send OTP. Please try again.');
  }
}));

// @route   POST /api/auth/verify-otp
// @desc    Verify OTP and complete signup
// @access  Public
router.post('/verify-otp', [...validateOTP, otpVerifyLimiter], asyncHandler(async (req, res) => {
  validateOrThrow(req);

  const { otp } = req.body;
  // Clean phone number by removing any country code prefix
  const phone = normalizePhoneNumber(req.body.phone);

  if (!phone) {
    throw new ValidationError('Invalid phone number provided.');
  }

  // Verify OTP
  const otpResult = verifyOTP(phone, otp);
  if (!otpResult.valid) {
    const error = new ValidationError(otpResult.message);
    // Add additional info for frontend
    if (otpResult.locked) {
      error.locked = true;
      error.lockoutTimeRemaining = otpResult.lockoutTimeRemaining;
    } else if (otpResult.remainingAttempts !== undefined) {
      error.remainingAttempts = otpResult.remainingAttempts;
    }
    throw error;
  }

  // Get pending signup data
  const userPendingSignup = getPendingSignup(phone, 'user'); // Try user role first
  const providerPendingSignup = getPendingSignup(phone, 'provider'); // Try provider role
  
  const pendingSignup = userPendingSignup || providerPendingSignup;
  if (!pendingSignup) {
    throw new ValidationError('No pending signup found for this phone number.');
  }

  // Ensure identifiers are still allowed before proceeding (admin might have blocked after OTP request)
  const pendingEmail = normalizeEmail(pendingSignup.email);

  const blockedPhone = await isIdentifierBlocked({
      identifierType: 'phone',
      identifierValue: phone,
      role: pendingSignup.role
    });

  if (blockedPhone) {
    deletePendingSignup(phone, pendingSignup.role);
    throw new AuthorizationError('This phone number has been blocked by the BuildXpert admin. Please contact support.');
  }

  if (pendingEmail) {
    const blockedEmail = await isIdentifierBlocked({
      identifierType: 'email',
      identifierValue: pendingEmail,
      role: pendingSignup.role
    });

    if (blockedEmail) {
      deletePendingSignup(phone, pendingSignup.role);
      throw new AuthorizationError('This email address has been blocked by the BuildXpert admin. Please contact support.');
    }
  }

  // Handle profile picture upload to Cloudinary if it's not the default
  let finalProfilePicUrl = pendingSignup.profilePicUrl;
  
  // Profile picture debug logging removed for production
  
  if (pendingSignup.profilePicUrl && 
      !pendingSignup.profilePicUrl.includes('dqoizs0fu') && 
      (pendingSignup.profilePicUrl.startsWith('data:image') || pendingSignup.profilePicUrl.startsWith('file://'))) {
    try {
      logger.info('Uploading profile picture to Cloudinary');
      const uploadResult = await uploadImage(pendingSignup.profilePicUrl, 'profile-pictures');
      
      if (uploadResult.success) {
        finalProfilePicUrl = uploadResult.url;
        logger.info('Successfully uploaded profile picture to Cloudinary');
      } else {
        logger.error('Failed to upload profile picture to Cloudinary', {
          error: uploadResult.error
        });
        // Use default profile picture if upload fails
        finalProfilePicUrl = 'https://res.cloudinary.com/dqoizs0fu/raw/upload/v1756189484/profile-pictures/m3szbez4bzvwh76j1fle';
      }
    } catch (uploadError) {
      logger.error('Profile picture upload error', {
        error: uploadError.message
      });
      // Use default profile picture if upload fails
      finalProfilePicUrl = 'https://res.cloudinary.com/dqoizs0fu/raw/upload/v1756189484/profile-pictures/m3szbez4bzvwh76j1fle';
    }
  }

  // Insert user into DB
  logger.auth('Inserting user into database', {
    phone,
    role: pendingSignup.role,
    hasProfilePic: !!finalProfilePicUrl
  });
  
  const result = await query(`
    INSERT INTO users (full_name, email, phone, password, role, profile_pic_url)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id, full_name, email, phone, role, is_verified, profile_pic_url
  `, [
    pendingSignup.fullName,
    pendingEmail,
    pendingSignup.phone,
    pendingSignup.password,
    pendingSignup.role,
    finalProfilePicUrl
  ]);
  const user = result.rows[0];
  
  logger.auth('User created successfully', {
    userId: user.id,
    role: user.role
  });

  // Mark user as verified
  await query('UPDATE users SET is_verified = true WHERE id = $1', [user.id]);

  // Clean up pending signup
  deletePendingSignup(phone, pendingSignup.role);

  // Add welcome notification for new users and providers
  try {
      if (user.role === 'user') {
        const userNotification = await query(`
          INSERT INTO notifications (user_id, title, message, role)
          VALUES ($1, $2, $3, $4)
          RETURNING *
        `, [
          user.id,
          'Welcome to BuildXpert! 🎉',
          'Congratulations on creating your account! You can now book construction services, track your bookings, and connect with skilled professionals. Start exploring our services today!',
          'user'
        ]);
        
        // Format timestamp for the notification
        const timestampData = formatNotificationTimestamp(userNotification.rows[0].created_at);
        
        // Emit socket event for welcome notification
        getIO().to(user.id).emit('notification_created', {
          notification: {
            id: userNotification.rows[0].id,
            title: userNotification.rows[0].title,
            message: userNotification.rows[0].message,
            created_at: userNotification.rows[0].created_at,
            is_read: userNotification.rows[0].is_read,
            ...timestampData
          }
        });
      } else if (user.role === 'provider') {
        const providerNotification = await query(`
          INSERT INTO notifications (user_id, title, message, role)
          VALUES ($1, $2, $3, $4)
          RETURNING *
        `, [
          user.id,
          'Welcome to BuildXpert Provider! 🎉',
          'Congratulations on registering as a service provider! Complete your profile and register for services to start receiving bookings. Grow your business with us!',
          'provider'
        ]);
        
        // Format timestamp for the notification
        const timestampData = formatNotificationTimestamp(providerNotification.rows[0].created_at);
        
        // Emit socket event for welcome notification
        getIO().to(user.id).emit('notification_created', {
          notification: {
            id: providerNotification.rows[0].id,
            title: providerNotification.rows[0].title,
            message: providerNotification.rows[0].message,
            created_at: providerNotification.rows[0].created_at,
            is_read: providerNotification.rows[0].is_read,
            ...timestampData
          }
        });
      }
  } catch (notificationError) {
    logger.error('Failed to create welcome notification', {
      error: notificationError.message
    });
    // Don't fail the signup process if notification creation fails
  }

  // Generate access token and refresh token pair
  const ipAddress = req.ip || req.headers['x-forwarded-for']?.split(',')[0].trim() || 'unknown';
  const userAgent = req.headers['user-agent'] || '';
  
  const tokenPair = await generateTokenPair(
    user.id,
    user.role,
    ipAddress,
    userAgent
  );
  
  // Create session in database (for backward compatibility)
  await createSession(
    user.id,
    tokenPair.accessTokenJti,
    tokenPair.accessTokenExpiresAt,
    ipAddress,
    userAgent
  );
  
  // Log security event
  await logSecurityEvent(
    user.id,
    'signup',
    `New user registered from ${ipAddress}`,
    ipAddress,
    userAgent,
    'info'
  );

  res.json({
    status: 'success',
    message: 'OTP verified and signup completed successfully',
    data: {
      accessToken: tokenPair.accessToken,
      refreshToken: tokenPair.refreshToken,
      accessTokenExpiresAt: tokenPair.accessTokenExpiresAt,
      refreshTokenExpiresAt: tokenPair.refreshTokenExpiresAt,
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        profilePicUrl: user.profile_pic_url,
        isVerified: true
      }
    }
  });
}));

// @route   POST /api/auth/resend-otp
// @desc    Resend OTP to phone number
// @access  Public
router.post('/resend-otp', [otpRequestLimiter,
  body('phone').custom(validatePhoneNumber).withMessage('Please enter a valid 10-digit mobile number')
], asyncHandler(async (req, res) => {
  validateOrThrow(req);

  const phone = normalizePhoneNumber(req.body.phone);

  if (!phone) {
    throw new ValidationError('Invalid phone number provided.');
  }

  const result = await resendOTP(phone);
  
  if (result.success) {
    res.json({
      status: 'success',
      message: result.message
    });
  } else {
    throw new ValidationError(result.message);
  }
}));

// @route   POST /api/auth/forgot-password
// @desc    Start forgot password - send OTP to phone
// @access  Public
router.post('/forgot-password', [passwordResetLimiter, otpRequestLimiter,
  body('phone').custom(validatePhoneNumber).withMessage('Please enter a valid 10-digit mobile number'),
  body('role').optional().isIn(['user', 'provider', 'admin']).withMessage('Role must be either user, provider, or admin')
], asyncHandler(async (req, res) => {
  validateOrThrow(req);
  
  // Clean phone number by removing any country code prefix
  const phone = normalizePhoneNumber(req.body.phone);
  // Default to 'user' role if not provided (for backward compatibility)
  const role = req.body.role || 'user';
  
  if (!phone) {
    throw new ValidationError('Invalid phone number provided');
  }
  
  // Check if user exists with the specified role
  const user = await getRow('SELECT * FROM users WHERE phone = $1 AND role = $2', [phone, role]);
  if (!user) {
    throw new NotFoundError(`${role === 'user' ? 'User' : role === 'provider' ? 'Provider' : 'Admin'}`);
  }

  const blockedAccount = await isAnyIdentifierBlocked({
    phone,
    email: user.email,
    role: user.role
  });

  if (blockedAccount) {
    throw new AuthorizationError('This account has been blocked by the BuildXpert admin. Please contact support for assistance.');
  }
  
  const otp = generateOTP();
  const result = await sendOTP(phone, otp);
  if (!result.success) {
    throw new Error('Failed to send OTP');
  }
  storeOTP(phone, otp);
  res.json({ status: 'success', message: 'OTP sent to your mobile number' });
}));

// @route   POST /api/auth/forgot-password/verify
// @desc    Verify OTP and create password reset session token
// @access  Public
router.post('/forgot-password/verify', [otpVerifyLimiter, ...validateOTP,
  body('role').optional().isIn(['user', 'provider', 'admin']).withMessage('Role must be either user, provider, or admin')
], asyncHandler(async (req, res) => {
  validateOrThrow(req);
  
  const { otp } = req.body;
  // Clean phone number by removing any country code prefix
  const phone = normalizePhoneNumber(req.body.phone);
  // Default to 'user' role if not provided (for backward compatibility)
  const role = req.body.role || 'user';

  if (!phone) {
    throw new ValidationError('Invalid phone number provided');
  }
  
  const otpResult = verifyOTP(phone, otp);
  if (!otpResult.valid) {
    throw new ValidationError(otpResult.message);
  }
  
  const user = await getRow('SELECT * FROM users WHERE phone = $1 AND role = $2', [phone, role]);
  if (!user) {
    throw new NotFoundError(`${role === 'user' ? 'User' : role === 'provider' ? 'Provider' : 'Admin'}`);
  }

  const blockedAccount = await isAnyIdentifierBlocked({
    phone,
    email: user.email,
    role: user.role
  });

  if (blockedAccount) {
    throw new AuthorizationError('This account has been blocked by the BuildXpert admin. Please contact support for assistance.');
  }
  
  const session = createPasswordResetSession(phone);
  res.json({ status: 'success', message: 'OTP verified', data: { resetToken: session.token, expiresAt: session.expiryTime } });
}));

// @route   POST /api/auth/forgot-password/reset
// @desc    Reset password using reset token (revokes all existing sessions)
// @access  Public
router.post('/forgot-password/reset', [passwordResetLimiter,
  body('phone').custom(validatePhoneNumber).withMessage('Please enter a valid 10-digit mobile number'),
  body('resetToken').notEmpty().withMessage('Reset token is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').optional().isIn(['user', 'provider', 'admin']).withMessage('Role must be either user, provider, or admin')
], asyncHandler(async (req, res) => {
  validateOrThrow(req);
  
  const { resetToken, newPassword } = req.body;
  // Clean phone number by removing any country code prefix
  const phone = normalizePhoneNumber(req.body.phone);
  // Default to 'user' role if not provided (for backward compatibility)
  const role = req.body.role || 'user';

  if (!phone) {
    throw new ValidationError('Invalid phone number provided');
  }
  
  const sessionValid = validatePasswordResetSession(phone, resetToken);
  if (!sessionValid.valid) {
    throw new ValidationError(sessionValid.message);
  }
  
  const user = await getRow('SELECT * FROM users WHERE phone = $1 AND role = $2', [phone, role]);
  if (!user) {
    throw new NotFoundError(`${role === 'user' ? 'User' : role === 'provider' ? 'Provider' : 'Admin'}`);
  }

  const blockedAccount = await isAnyIdentifierBlocked({
    phone,
    email: user.email,
    role: user.role
  });

  if (blockedAccount) {
    throw new AuthorizationError('This account has been blocked by the BuildXpert admin. Please contact support for assistance.');
  }
  
  const hashed = await bcrypt.hash(newPassword, 12);
  await query('UPDATE users SET password = $1 WHERE id = $2', [hashed, user.id]);
  consumePasswordResetSession(phone);
  
  // Revoke all existing sessions and refresh tokens for security (user must login again with new password)
  await blacklistAllUserTokens(user.id, 'password_change');
  await revokeAllUserRefreshTokens(user.id, 'password_change');
  await invalidateAllUserSessions(user.id);
  
  // Log security event
  await logSecurityEvent(
    user.id,
    'password_change',
    'Password reset via forgot password flow. All sessions invalidated.',
    req.ip || 'unknown',
    req.headers['user-agent'] || '',
    'warning'
  );
  
  res.json({ status: 'success', message: 'Password has been reset successfully. Please login again with your new password.' });
}));

// @route   POST /api/auth/refresh
// @desc    Refresh access token using refresh token (implements token rotation)
// @access  Public (requires refresh token in body)
router.post('/refresh', [tokenRefreshLimiter,
  body('refreshToken').notEmpty().withMessage('Refresh token is required')
], asyncHandler(async (req, res) => {
  const ipAddress = getClientIP(req);
  const userAgent = req.headers['user-agent'] || '';
  
  validateOrThrow(req);

  const { refreshToken } = req.body;
  
  // Refresh access token (implements token rotation)
  const tokenPair = await refreshAccessToken(refreshToken, ipAddress, userAgent);
  
  // Get user data
  const user = await getRow('SELECT * FROM users WHERE id = $1', [tokenPair.userId]);
  if (!user) {
    throw new NotFoundError('User');
  }
  
  // Log token refresh
  await logSecurityEvent(
    user.id,
    'token_refresh',
    `Token refreshed from ${ipAddress}`,
    ipAddress,
    userAgent,
    'info'
  );
  
  res.json({
    status: 'success',
    message: 'Token refreshed successfully',
    data: {
      accessToken: tokenPair.accessToken,
      refreshToken: tokenPair.refreshToken,
      accessTokenExpiresAt: tokenPair.accessTokenExpiresAt,
      refreshTokenExpiresAt: tokenPair.refreshTokenExpiresAt,
      user: {
        id: user.id,
        phone: user.phone,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
        is_verified: user.is_verified,
        profile_pic_url: user.profile_pic_url
      }
    }
  });
}));

// @route   POST /api/auth/login
// @desc    Login user with phone and password
// @access  Public
router.post('/login', [loginLimiter, ...validateLogin], asyncHandler(async (req, res) => {
  const ipAddress = getClientIP(req);
  const userAgent = req.headers['user-agent'] || '';
  let phone, role;
  
  validateOrThrow(req);

  const { password } = req.body;
  role = req.body.role;
  // Clean phone number by removing any country code prefix
  phone = normalizePhoneNumber(req.body.phone);

  try {

  // Check if this is an admin bypass attempt (only allowed in development)
  // Must verify user exists and is actually an admin before allowing bypass
  let isAdminBypass = false;
  if (ADMIN_BYPASS_ENABLED && phone === ADMIN_BYPASS_PHONE && role === 'admin') {
    // Verify user actually exists and is an admin before allowing bypass
    const existingUser = await getRow('SELECT * FROM users WHERE phone = $1 AND role = $2', [phone, role]);
    if (existingUser && existingUser.role === 'admin') {
      isAdminBypass = true;
      logger.warn('Admin bypass used in development mode', {
        phone,
        userId: existingUser.id,
        ip: ipAddress
      });
    }
  }

  if (!phone) {
    await logLoginAttempt(req.body.phone, ipAddress, 'failed', 'invalid_phone', userAgent);
    throw new ValidationError('Invalid phone number provided.');
  }

  // Check if IP should be blocked due to too many failed attempts
  // Admins must follow same security rules (no bypass in production)
  const ipBlocked = await shouldBlockIP(ipAddress, 15, 30);
  if (ipBlocked) {
    await logLoginAttempt(phone, ipAddress, 'blocked', 'ip_blocked', userAgent);
    throw new ValidationError('Too many failed login attempts from this IP. Please try again in 30 minutes.');
  }

  // Check for too many failed attempts from this phone number
  const phoneFailedAttempts = await getRecentFailedAttempts(phone, 30);
  if (phoneFailedAttempts >= 10) {
    await logLoginAttempt(phone, ipAddress, 'blocked', 'phone_blocked', userAgent);
    throw new ValidationError('Too many failed login attempts for this account. Please try again in 30 minutes or use forgot password.');
  }

  // Get user with matching phone and role
  let user = await getRow('SELECT * FROM users WHERE phone = $1 AND role = $2', [phone, role]);

  // Remove auto-creation of admin account - admins must be created manually
  // This prevents unauthorized admin account creation
  if (!user) {
    await logLoginAttempt(phone, ipAddress, 'failed', 'user_not_found', userAgent);
    throw new AuthenticationError('Invalid phone number, password, or role');
  }

  // Check if account is blocked (admins must follow same rules)
  const blockedAccount = await isAnyIdentifierBlocked({
    phone,
    email: user.email,
    role: user.role
  });

  if (blockedAccount) {
    await logLoginAttempt(phone, ipAddress, 'blocked', 'identifier_blocked', userAgent, user.id);
    throw new AuthorizationError('This account has been blocked by the BuildXpert admin. Please contact support for assistance.');
  }

    // Check password using bcrypt (all passwords should be hashed)
    let isPasswordValid = false;
    
    try {
      // Always use bcrypt comparison for security
      isPasswordValid = await bcrypt.compare(password, user.password);
    } catch (bcryptError) {
      logger.error('Bcrypt comparison error', { error: bcryptError.message });
      // If bcrypt comparison fails, the password is invalid
      isPasswordValid = false;
    }
    
    // Admin bypass only works in development mode and only if explicitly enabled
    // In production, admins must use proper passwords
    if (isAdminBypass && password === ADMIN_BYPASS_PASSWORD) {
      isPasswordValid = true;

      // Log admin bypass usage for security auditing
      logger.warn('Admin bypass password used', {
        userId: user.id,
        phone: user.phone,
        ip: ipAddress,
        userAgent
      });

      // Ensure stored password matches the bypass password hash (development only)
      // In production, this should never happen
      if (config.isDevelopment()) {
        try {
          const matches = await bcrypt.compare(ADMIN_BYPASS_PASSWORD, user.password);
          if (!matches) {
            const hashedPassword = await bcrypt.hash(ADMIN_BYPASS_PASSWORD, 12);
            await query('UPDATE users SET password = $1, is_verified = true WHERE id = $2', [hashedPassword, user.id]);
            user.password = hashedPassword;
          }
        } catch (error) {
          logger.warn('Admin bypass password synchronization failed', { error: error.message });
        }
      }
    }

    if (!isPasswordValid) {
      // Log failed attempt - invalid password
      await logLoginAttempt(phone, ipAddress, 'failed', 'invalid_password', userAgent, user.id);
      
      throw new AuthenticationError('Invalid phone number or password');
    }

    // Generate access token and refresh token pair
    const tokenPair = await generateTokenPair(
      user.id,
      user.role,
      ipAddress,
      userAgent
    );

    // Create session in database (for backward compatibility)
    await createSession(
      user.id,
      tokenPair.accessTokenJti,
      tokenPair.accessTokenExpiresAt,
      ipAddress,
      userAgent
    );

    // Log successful login
    await logLoginAttempt(phone, ipAddress, 'success', null, userAgent, user.id);
    await logSecurityEvent(
      user.id,
      'login',
      `User logged in from ${ipAddress}`,
      ipAddress,
      userAgent,
      'info'
    );

    res.json({
      status: 'success',
      message: 'Login successful',
      data: {
        accessToken: tokenPair.accessToken,
        refreshToken: tokenPair.refreshToken,
        accessTokenExpiresAt: tokenPair.accessTokenExpiresAt,
        refreshTokenExpiresAt: tokenPair.refreshTokenExpiresAt,
        user: {
          id: user.id,
          fullName: user.full_name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          profilePicUrl: user.profile_pic_url,
          isVerified: user.is_verified
        }
      }
    });

  } catch (error) {
    logger.error('Login error', { 
      error: error, // Pass full error object for stack trace enhancement
      req: req // Pass req for automatic context capture and sensitive data masking
    });
    
    // Log failed attempt on server error
    if (phone) {
      await logLoginAttempt(phone, ipAddress, 'failed', 'server_error', userAgent).catch(() => {});
    }
    
    // Re-throw error to be handled by error middleware
    throw error;
  }
}));

// @route   GET /api/auth/me
// @desc    Get current user profile
// @access  Private
router.get('/me', auth, asyncHandler(async (req, res) => {
  const user = await getRow('SELECT * FROM users WHERE id = $1', [req.user.id]);
  
  res.json({
    status: 'success',
    data: {
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isVerified: user.is_verified,
        profilePicUrl: user.profile_pic_url,
        createdAt: user.created_at
      }
    }
  });
}));

// ============================================================================
// LOGOUT & SESSION MANAGEMENT ENDPOINTS
// ============================================================================

// @route   POST /api/auth/logout
// @desc    Logout user (revoke current token, refresh token, and invalidate session)
// @access  Private
router.post('/logout', auth, asyncHandler(async (req, res) => {
  const ipAddress = getClientIP(req);
  const userAgent = req.headers['user-agent'] || '';
  
  // Get refresh token from body if provided (for refresh token revocation)
  const { refreshToken } = req.body;
  
  // Blacklist the current access token
  await blacklistToken(
    req.tokenJti,
    req.user.id,
    'logout',
    req.session.expires_at,
    ipAddress,
    userAgent
  );
  
  // Revoke refresh token if provided (now uses random token, not JWT)
  if (refreshToken) {
    try {
      await revokeRefreshToken(refreshToken, req.user.id, 'logout');
    } catch (error) {
      // Ignore errors if refresh token is invalid/expired
      logger.warn('Failed to revoke refresh token on logout', { error: error.message });
    }
  }
  
  // Invalidate the current session
  await invalidateSession(req.tokenJti, req.user.id);
  
  // Log security event
  await logSecurityEvent(
    req.user.id,
    'logout',
    `User logged out from ${ipAddress}`,
    ipAddress,
    userAgent,
    'info'
  );
  
  res.json({
    status: 'success',
    message: 'Logged out successfully'
  });
}));

// @route   POST /api/auth/logout-all
// @desc    Logout from all devices (revoke all tokens, refresh tokens, and sessions)
// @access  Private
router.post('/logout-all', auth, asyncHandler(async (req, res) => {
  const ipAddress = getClientIP(req);
  const userAgent = req.headers['user-agent'] || '';
  
  // Blacklist all user access tokens
  const tokenCount = await blacklistAllUserTokens(req.user.id, 'logout_all');
  
  // Revoke all user refresh tokens
  const refreshTokenCount = await revokeAllUserRefreshTokens(req.user.id, 'logout_all');
  
  // Invalidate all user sessions
  await invalidateAllUserSessions(req.user.id);
  
  // Log security event
  await logSecurityEvent(
    req.user.id,
    'logout_all',
    `User logged out from all devices (${tokenCount} sessions, ${refreshTokenCount} refresh tokens). Initiated from ${ipAddress}`,
    ipAddress,
    userAgent,
    'warning'
  );
  
  res.json({
    status: 'success',
    message: `Successfully logged out from all devices (${tokenCount} sessions, ${refreshTokenCount} refresh tokens)`
  });
}));

// @route   GET /api/auth/sessions
// @desc    Get all active sessions for current user
// @access  Private
router.get('/sessions', auth, asyncHandler(async (req, res) => {
  const sessions = await getUserSessions(req.user.id);
  
  // Format sessions for frontend
  const formattedSessions = sessions.map(session => ({
    id: session.id,
    deviceName: session.device_name,
    deviceType: session.device_type,
    ipAddress: session.ip_address,
    location: {
      city: session.location_city,
      country: session.location_country
    },
    createdAt: session.created_at,
    lastActivity: session.last_activity,
    isCurrent: session.token_jti === req.tokenJti
  }));
  
  res.json({
    status: 'success',
    data: {
      sessions: formattedSessions,
      total: formattedSessions.length
    }
  });
}));

// @route   DELETE /api/auth/sessions/:sessionId
// @desc    Revoke a specific session by ID
// @access  Private
router.delete('/sessions/:sessionId', auth, asyncHandler(async (req, res) => {
  const ipAddress = getClientIP(req);
  const userAgent = req.headers['user-agent'] || '';
  
  const sessionId = parseInt(req.params.sessionId, 10);
  
  if (isNaN(sessionId)) {
    const { ValidationError } = require('../utils/errorTypes');
    throw new ValidationError('Invalid session ID');
  }
  
  // Get session details before invalidating
  const session = await getRow(
    'SELECT * FROM user_sessions WHERE id = $1 AND user_id = $2',
    [sessionId, req.user.id]
  );
  
  if (!session) {
    const { NotFoundError } = require('../utils/errorTypes');
    throw new NotFoundError('Session', sessionId);
  }
  
  // Blacklist the token for this session
  await blacklistToken(
    session.token_jti,
    req.user.id,
    'session_revoked',
    session.expires_at,
    ipAddress,
    userAgent
  );
  
  // Invalidate the session
  const success = await invalidateSessionById(sessionId, req.user.id);
  
  if (!success) {
    const { NotFoundError } = require('../utils/errorTypes');
    throw new NotFoundError('Session', sessionId);
  }
  
  // Log security event
  await logSecurityEvent(
    req.user.id,
    'session_revoked',
    `Session revoked for device: ${session.device_name}. Initiated from ${ipAddress}`,
    ipAddress,
    userAgent,
    'warning'
  );
  
  res.json({
    status: 'success',
    message: 'Session revoked successfully'
  });
}));

module.exports = router; 