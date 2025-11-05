const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { query, getRow } = require('../database/connection');
const { auth } = require('../middleware/auth');
const { formatNotificationTimestamp } = require('../utils/timezone');
const { sendNotification, sendAutoNotification } = require('../utils/notifications');
const { uploadImage } = require('../utils/cloudinary');
const config = require('../utils/config');
const logger = require('../utils/logger');
const getIO = () => require('../server').io;
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
  body('profilePicUrl').optional().isString().withMessage('Profile picture URL must be a string')
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

// Basic rate limiters for OTP endpoints
const otpRequestLimiter = rateLimit({
  windowMs: config.get('rateLimit.windowMs'),
  max: 5,
  message: { status: 'error', message: 'Too many OTP requests. Please try again later.' }
});
const otpVerifyLimiter = rateLimit({
  windowMs: config.get('rateLimit.windowMs'),
  max: 10,
  message: { status: 'error', message: 'Too many verification attempts. Please try again later.' }
});

// Helper function to generate JWT token
const generateToken = (userId) => {
  return jwt.sign({ userId }, config.get('jwt.secret'), {
    expiresIn: config.get('jwt.expire')
  });
};

// @route   POST /api/auth/signup
// @desc    Register a new user
// @access  Public
router.post('/signup', validateSignup, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { fullName, email, password, role, profilePicUrl } = req.body;
    // Clean phone number by removing any country code prefix
    const phone = req.body.phone.replace(/^\+/, '').replace(/^1/, '').replace(/^91/, '');

    // Default profile picture URL (the generic user icon you provided)
    const DEFAULT_PROFILE_PIC = 'https://res.cloudinary.com/dqoizs0fu/raw/upload/v1756189484/profile-pictures/m3szbez4bzvwh76j1fle';
    
    // Use provided profile picture URL or default
    const finalProfilePicUrl = profilePicUrl || DEFAULT_PROFILE_PIC;

    // Validate role
    if (role !== 'provider' && role !== 'user') {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid role. Must be either provider or user.'
      });
    }

    // Check if user already exists with the same phone and role
    const existingUser = await getRow('SELECT * FROM users WHERE (phone = $1 AND role = $2) OR email = $3', [phone, role, email]);
    if (existingUser) {
      return res.status(400).json({
        status: 'error',
        message: (existingUser.phone === phone && existingUser.role === role)
          ? `Phone number already registered as a ${role}`
          : 'Email already registered'
      });
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
      storePendingSignup(phone, { fullName, email, phone, password: hashedPassword, role, profilePicUrl: finalProfilePicUrl });
      return res.json({
        status: 'success',
        message: 'OTP sent successfully to your mobile number. Please verify to complete signup.'
      });
    } else {
      return res.status(500).json({
        status: 'error',
        message: 'Failed to send OTP. Please try again.'
      });
    }
  } catch (error) {
    logger.error('Signup error', { error: error.message, stack: error.stack });
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/auth/send-otp
// @desc    Send OTP to phone number
// @access  Public
router.post('/send-otp', [otpRequestLimiter,
  body('phone').custom(validatePhoneNumber).withMessage('Please enter a valid 10-digit mobile number')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    // Clean phone number by removing any country code prefix
    const phone = req.body.phone.replace(/^\+/, '').replace(/^1/, '').replace(/^91/, '');

    // Check if user exists
    const user = await getRow('SELECT * FROM users WHERE phone = $1', [phone]);
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found. Please register first.'
      });
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
      res.status(400).json({
        status: 'error',
        message: otpResult.error || 'Failed to send OTP. Please try again.'
      });
    }

  } catch (error) {
    logger.error('Send OTP error', { error: error.message });
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/auth/verify-otp
// @desc    Verify OTP and complete signup
// @access  Public
router.post('/verify-otp', [...validateOTP, otpVerifyLimiter], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { otp } = req.body;
    // Clean phone number by removing any country code prefix
    const phone = req.body.phone.replace(/^\+/, '').replace(/^1/, '').replace(/^91/, '');

    // Verify OTP
    const otpResult = verifyOTP(phone, otp);
    if (!otpResult.valid) {
      const response = {
        status: 'error',
        message: otpResult.message
      };

      // Add additional info for frontend
      if (otpResult.locked) {
        response.locked = true;
        response.lockoutTimeRemaining = otpResult.lockoutTimeRemaining;
      } else if (otpResult.remainingAttempts !== undefined) {
        response.remainingAttempts = otpResult.remainingAttempts;
      }

      return res.status(400).json(response);
    }

    // Get pending signup data
    const userPendingSignup = getPendingSignup(phone, 'user'); // Try user role first
    const providerPendingSignup = getPendingSignup(phone, 'provider'); // Try provider role
    
    const pendingSignup = userPendingSignup || providerPendingSignup;
    if (!pendingSignup) {
      return res.status(400).json({
        status: 'error',
        message: 'No pending signup found for this phone number.'
      });
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
    `, [pendingSignup.fullName, pendingSignup.email, pendingSignup.phone, pendingSignup.password, pendingSignup.role, finalProfilePicUrl]);
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

    // Generate JWT token
    const token = generateToken(user.id);

    res.json({
      status: 'success',
      message: 'OTP verified and signup completed successfully',
      data: {
        token,
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
  } catch (error) {
    logger.error('Verify OTP error', { error: error.message, stack: error.stack });
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/auth/resend-otp
// @desc    Resend OTP to phone number
// @access  Public
router.post('/resend-otp', [otpRequestLimiter,
  body('phone').custom(validatePhoneNumber).withMessage('Please enter a valid 10-digit mobile number')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { phone } = req.body;

    const result = await resendOTP(phone);
    
    if (result.success) {
      res.json({
        status: 'success',
        message: result.message
      });
    } else {
      res.status(400).json({
        status: 'error',
        message: result.message
      });
    }

  } catch (error) {
    logger.error('Resend OTP error', { error: error.message });
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/auth/forgot-password
// @desc    Start forgot password - send OTP to phone
// @access  Public
router.post('/forgot-password', [otpRequestLimiter,
  body('phone').custom(validatePhoneNumber).withMessage('Please enter a valid 10-digit mobile number'),
  body('role').optional().isIn(['user', 'provider', 'admin']).withMessage('Role must be either user, provider, or admin')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ status: 'error', message: 'Validation failed', errors: errors.array() });
    }
    // Clean phone number by removing any country code prefix
    const phone = req.body.phone.replace(/^\+/, '').replace(/^1/, '').replace(/^91/, '');
    // Default to 'user' role if not provided (for backward compatibility)
    const role = req.body.role || 'user';
    
    // Check if user exists with the specified role
    const user = await getRow('SELECT * FROM users WHERE phone = $1 AND role = $2', [phone, role]);
    if (!user) {
      return res.status(404).json({ status: 'error', message: `${role === 'user' ? 'User' : role === 'provider' ? 'Provider' : 'Admin'} not found` });
    }
    const otp = generateOTP();
    const result = await sendOTP(phone, otp);
    if (!result.success) return res.status(500).json({ status: 'error', message: 'Failed to send OTP' });
    storeOTP(phone, otp);
    return res.json({ status: 'success', message: 'OTP sent to your mobile number' });
  } catch (error) {
    logger.error('Forgot password error', { error: error.message });
    return res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
});

// @route   POST /api/auth/forgot-password/verify
// @desc    Verify OTP and create password reset session token
// @access  Public
router.post('/forgot-password/verify', [otpVerifyLimiter, ...validateOTP,
  body('role').optional().isIn(['user', 'provider', 'admin']).withMessage('Role must be either user, provider, or admin')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ status: 'error', message: 'Validation failed', errors: errors.array() });
    }
    const { otp } = req.body;
    // Clean phone number by removing any country code prefix
    const phone = req.body.phone.replace(/^\+/, '').replace(/^1/, '').replace(/^91/, '');
    // Default to 'user' role if not provided (for backward compatibility)
    const role = req.body.role || 'user';
    
    const otpResult = verifyOTP(phone, otp);
    if (!otpResult.valid) {
      return res.status(400).json({ status: 'error', message: otpResult.message });
    }
    const user = await getRow('SELECT * FROM users WHERE phone = $1 AND role = $2', [phone, role]);
    if (!user) {
      return res.status(404).json({ status: 'error', message: `${role === 'user' ? 'User' : role === 'provider' ? 'Provider' : 'Admin'} not found` });
    }
    const session = createPasswordResetSession(phone);
    return res.json({ status: 'success', message: 'OTP verified', data: { resetToken: session.token, expiresAt: session.expiryTime } });
  } catch (error) {
    logger.error('Forgot password verify error', { error: error.message });
    return res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
});

// @route   POST /api/auth/forgot-password/reset
// @desc    Reset password using reset token
// @access  Public
router.post('/forgot-password/reset', [
  body('phone').custom(validatePhoneNumber).withMessage('Please enter a valid 10-digit mobile number'),
  body('resetToken').notEmpty().withMessage('Reset token is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').optional().isIn(['user', 'provider', 'admin']).withMessage('Role must be either user, provider, or admin')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ status: 'error', message: 'Validation failed', errors: errors.array() });
    }
    const { resetToken, newPassword } = req.body;
    // Clean phone number by removing any country code prefix
    const phone = req.body.phone.replace(/^\+/, '').replace(/^1/, '').replace(/^91/, '');
    // Default to 'user' role if not provided (for backward compatibility)
    const role = req.body.role || 'user';
    
    const sessionValid = validatePasswordResetSession(phone, resetToken);
    if (!sessionValid.valid) {
      return res.status(400).json({ status: 'error', message: sessionValid.message });
    }
    const user = await getRow('SELECT * FROM users WHERE phone = $1 AND role = $2', [phone, role]);
    if (!user) {
      return res.status(404).json({ status: 'error', message: `${role === 'user' ? 'User' : role === 'provider' ? 'Provider' : 'Admin'} not found` });
    }
    const hashed = await bcrypt.hash(newPassword, 12);
    await query('UPDATE users SET password = $1 WHERE id = $2', [hashed, user.id]);
    consumePasswordResetSession(phone);
    return res.json({ status: 'success', message: 'Password has been reset successfully' });
  } catch (error) {
    logger.error('Forgot password reset error', { error: error.message });
    return res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
});

// @route   POST /api/auth/refresh
// @desc    Refresh JWT token
// @access  Private
router.post('/refresh', auth, async (req, res) => {
  try {
    // Generate new token
    const newToken = generateToken(req.user.id);
    
    res.json({
      status: 'success',
      message: 'Token refreshed successfully',
      data: {
        token: newToken,
        user: {
          id: req.user.id,
          phone: req.user.phone,
          full_name: req.user.full_name,
          email: req.user.email,
          role: req.user.role,
          is_verified: req.user.is_verified,
          profile_pic_url: req.user.profile_pic_url
        }
      }
    });
  } catch (error) {
    logger.error('Token refresh error', { error: error.message });
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/auth/login
// @desc    Login user with phone and password
// @access  Public
router.post('/login', validateLogin, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { password, role } = req.body;
    // Clean phone number by removing any country code prefix
    const phone = req.body.phone.replace(/^\+/, '').replace(/^1/, '').replace(/^91/, '');

    // Get user with matching phone and role
    const user = await getRow('SELECT * FROM users WHERE phone = $1 AND role = $2', [phone, role]);
    if (!user) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid phone number, password, or role'
      });
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
    
    if (!isPasswordValid) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid phone number or password'
      });
    }

    // Generate JWT token
    const token = generateToken(user.id);

    res.json({
      status: 'success',
      message: 'Login successful',
      data: {
        token,
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
    logger.error('Login error', { error: error.message });
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/auth/me
// @desc    Get current user profile
// @access  Private
router.get('/me', auth, async (req, res) => {
  try {
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

  } catch (error) {
    logger.error('Get profile error', { error: error.message });
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

module.exports = router; 