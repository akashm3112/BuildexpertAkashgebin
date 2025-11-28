const express = require('express');
const { body, validationResult } = require('express-validator');
const { auth } = require('../middleware/auth');
const { pushNotificationService, NotificationTemplates } = require('../utils/pushNotifications');
const { query, getRow, getRows } = require('../database/connection');
const logger = require('../utils/logger');
const { asyncHandler } = require('../middleware/errorHandler');
const { ValidationError, AuthorizationError } = require('../utils/errorTypes');

const router = express.Router();

// All routes require authentication
router.use(auth);

/**
 * @route   POST /api/push-notifications/register-token
 * @desc    Register/Update push notification token for user
 * @access  Private
 */
router.post('/register-token', [
  body('pushToken').notEmpty().withMessage('Push token is required'),
  body('deviceInfo').optional().isObject().withMessage('Device info must be an object')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', { errors: errors.array() });
  }

  const { pushToken, deviceInfo = {} } = req.body;
  const userId = req.user.id;

  const result = await pushNotificationService.registerPushToken(userId, pushToken, deviceInfo);
  
  if (result.success) {
    res.json({
      status: 'success',
      message: 'Push token registered successfully'
    });
  } else {
    throw new ValidationError(result.error);
  }
}));

/**
 * @route   POST /api/push-notifications/send-test
 * @desc    Send test notification (development only)
 * @access  Private
 */
router.post('/send-test', [
  body('title').notEmpty().withMessage('Title is required'),
  body('body').notEmpty().withMessage('Body is required'),
  body('data').optional().isObject().withMessage('Data must be an object')
], asyncHandler(async (req, res) => {
  // Only allow in development
  if (process.env.NODE_ENV === 'production') {
    throw new AuthorizationError('Test notifications not allowed in production');
  }

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', { errors: errors.array() });
  }

  const { title, body, data = {} } = req.body;
  const userId = req.user.id;

  const notification = {
      title,
      body,
      data: { ...data, type: 'test' },
      sound: 'default',
      priority: 'high'
    };

  const result = await pushNotificationService.sendToUser(userId, notification);
  
  if (result.success) {
    res.json({
      status: 'success',
      message: 'Test notification sent successfully'
    });
  } else {
    throw new ValidationError(result.error);
  }
}));

/**
 * @route   GET /api/push-notifications/settings
 * @desc    Get user notification settings
 * @access  Private
 */
router.get('/settings', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  
  // Get user notification preferences (if table exists)
  let settings = {
      booking_updates: true,
      reminders: true,
      promotional: false,
      sound_enabled: true,
      vibration_enabled: true
    };

    try {
      const userSettings = await getRow(
        'SELECT * FROM user_notification_settings WHERE user_id = $1',
        [userId]
      );
      if (userSettings) {
        settings = { ...settings, ...userSettings.settings };
      }
    } catch (error) {
      // Table might not exist yet, use defaults
      logger.info('Using default notification settings', { userId: req.user.id });
    }

    res.json({
      status: 'success',
      data: { settings }
    });
}));

/**
 * @route   PUT /api/push-notifications/settings
 * @desc    Update user notification settings
 * @access  Private
 */
router.put('/settings', [
  body('settings').isObject().withMessage('Settings must be an object')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', { errors: errors.array() });
  }

  const { settings } = req.body;
  const userId = req.user.id;

  // Create table if it doesn't exist
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS user_notification_settings (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
          settings JSONB NOT NULL DEFAULT '{}',
          updated_at TIMESTAMP DEFAULT NOW(),
          created_at TIMESTAMP DEFAULT NOW()
        );
      `);
    } catch (error) {
      // Table might already exist
    }

    // Upsert user settings
    await query(`
      INSERT INTO user_notification_settings (user_id, settings)
      VALUES ($1, $2)
      ON CONFLICT (user_id) 
      DO UPDATE SET settings = $2, updated_at = NOW()
    `, [userId, JSON.stringify(settings)]);

    res.json({
      status: 'success',
      message: 'Notification settings updated successfully'
    });
}));

/**
 * @route   GET /api/push-notifications/history
 * @desc    Get notification history for user
 * @access  Private
 */
router.get('/history', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  const notifications = await getRows(`
      SELECT 
        notification_type,
        title,
        body,
        data,
        status,
        created_at
      FROM notification_logs
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `, [userId, limit, offset]);

    const totalResult = await getRow(
      'SELECT COUNT(*) as total FROM notification_logs WHERE user_id = $1',
      [userId]
    );
    
    const total = parseInt(totalResult.total);
    const totalPages = Math.ceil(total / limit);

    res.json({
      status: 'success',
      data: {
        notifications,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages,
          hasMore: page < totalPages
        }
      }
    });
}));

/**
 * @route   DELETE /api/push-notifications/token
 * @desc    Remove push token (logout)
 * @access  Private
 */
router.delete('/token', [
  body('pushToken').optional().notEmpty().withMessage('Push token cannot be empty')
], asyncHandler(async (req, res) => {
  const { pushToken } = req.body;
  const userId = req.user.id;

  if (pushToken) {
      // Remove specific token
      await query(
        'UPDATE user_push_tokens SET is_active = false WHERE user_id = $1 AND push_token = $2',
        [userId, pushToken]
      );
    } else {
      // Remove all tokens for user (complete logout)
      await query(
        'UPDATE user_push_tokens SET is_active = false WHERE user_id = $1',
        [userId]
      );
    }

    res.json({
      status: 'success',
      message: 'Push token(s) removed successfully'
    });
}));

module.exports = router;
