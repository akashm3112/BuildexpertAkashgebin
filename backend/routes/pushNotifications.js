const express = require('express');
const { body, validationResult } = require('express-validator');
const { auth } = require('../middleware/auth');
const { pushNotificationService, NotificationTemplates } = require('../utils/pushNotifications');
const { query, getRow, getRows } = require('../database/connection');
const logger = require('../utils/logger');
const { asyncHandler } = require('../middleware/errorHandler');
const { ValidationError, AuthorizationError } = require('../utils/errorTypes');

const router = express.Router();

/**
 * @route   POST /api/push-notifications/send-by-phone
 * @desc    Send test notification by phone number (no auth required - for testing only)
 * @access  Public (protected by secret key)
 * @note    TEMPORARY ENDPOINT FOR TESTING - Remove in production
 */
router.post('/send-by-phone', [
  body('phone').notEmpty().withMessage('Phone number is required'),
  body('title').optional().isString().withMessage('Title must be a string'),
  body('body').optional().isString().withMessage('Body must be a string'),
  body('secretKey').optional().isString().withMessage('Secret key must be a string')
], asyncHandler(async (req, res) => {
  const validSecretKey = process.env.NOTIFICATION_TEST_SECRET || 'test123';
  const providedSecret = req.body.secretKey || '';
  
  if (providedSecret !== validSecretKey) {
    throw new AuthorizationError('Invalid secret key');
  }

  const { phone, title = '🧪 Test Notification', body = 'Testing background notifications!' } = req.body;

  // Get user's push token from database
  const user = await getRow(
    `SELECT u.id, upt.push_token 
     FROM users u
     LEFT JOIN user_push_tokens upt ON u.id = upt.user_id AND upt.is_active = true
     WHERE u.phone = $1
     ORDER BY upt.created_at DESC
     LIMIT 1`,
    [phone]
  );

  if (!user) {
    throw new ValidationError('User not found with that phone number');
  }

  if (!user.push_token) {
    throw new ValidationError('No active push token found for this user. Please open the app to register a token.');
  }

  const notification = {
    title,
    body,
    data: { type: 'test_direct', timestamp: Date.now() },
    sound: 'default',
    priority: 'high',
    channelId: 'default',
    ttl: 86400,
  };

  const { Expo } = require('expo-server-sdk');
  const expo = new Expo({ accessToken: process.env.EXPO_ACCESS_TOKEN });

  try {
    const messages = [{
      to: user.push_token,
      ...notification
    }];

    const tickets = await expo.sendPushNotificationsAsync(messages);
    const ticket = tickets[0];

    if (ticket.status === 'ok') {
      res.json({
        status: 'success',
        message: 'Notification sent successfully',
        ticketId: ticket.id,
        userId: user.id
      });
    } else {
      throw new ValidationError(`Failed to send: ${ticket.message || 'Unknown error'}`);
    }
  } catch (error) {
    logger.error('Phone-based test notification failed', {
      error: error.message,
      stack: error.stack
    });
    throw new ValidationError(`Failed to send notification: ${error.message}`);
  }
}));

/**
 * @route   POST /api/push-notifications/send-direct-test
 * @desc    Send test notification directly with push token (no auth required - for testing only)
 * @access  Public (protected by secret key)
 * @note    TEMPORARY ENDPOINT FOR TESTING - Remove in production
 */
router.post('/send-direct-test', [
  body('pushToken').notEmpty().withMessage('Push token is required'),
  body('title').optional().isString().withMessage('Title must be a string'),
  body('body').optional().isString().withMessage('Body must be a string'),
  body('secretKey').optional().isString().withMessage('Secret key must be a string')
], asyncHandler(async (req, res) => {
  // Simple secret key protection (set via env or use default for testing)
  const validSecretKey = process.env.NOTIFICATION_TEST_SECRET || 'test123';
  const providedSecret = req.body.secretKey || '';
  
  if (providedSecret !== validSecretKey) {
    throw new AuthorizationError('Invalid secret key');
  }

  const { pushToken, title = '🧪 Test Notification', body = 'Testing background notifications!' } = req.body;

  const notification = {
    title,
    body,
    data: { type: 'test_direct', timestamp: Date.now() },
    sound: 'default',
    priority: 'high',
    channelId: 'default',
    ttl: 86400, // 24 hours
  };

  // Send directly using Expo SDK
  const { Expo } = require('expo-server-sdk');
  const expo = new Expo({ accessToken: process.env.EXPO_ACCESS_TOKEN });
  
  if (!Expo.isExpoPushToken(pushToken)) {
    throw new ValidationError('Invalid Expo push token format');
  }

  try {
    const messages = [{
      to: pushToken,
      ...notification
    }];

    const tickets = await expo.sendPushNotificationsAsync(messages);
    const ticket = tickets[0];

    if (ticket.status === 'ok') {
      res.json({
        status: 'success',
        message: 'Notification sent successfully',
        ticketId: ticket.id
      });
    } else {
      throw new ValidationError(`Failed to send: ${ticket.message || 'Unknown error'}`);
    }
  } catch (error) {
    logger.error('Direct test notification failed', {
      error: error.message,
      stack: error.stack
    });
    throw new ValidationError(`Failed to send notification: ${error.message}`);
  }
}));

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
 * @route   POST /api/push-notifications/send-background-test
 * @desc    Send test background notification (works in production)
 * @access  Private
 * @note    Use this endpoint to test background notifications when app is closed
 */
router.post('/send-background-test', [
  body('title').optional().isString().withMessage('Title must be a string'),
  body('body').optional().isString().withMessage('Body must be a string'),
  body('template').optional().isIn(['booking', 'reminder', 'payment', 'custom']).withMessage('Invalid template')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', { errors: errors.array() });
  }

  const { title, body, template = 'custom' } = req.body;
  const userId = req.user.id;

  let notification;

  // Use templates or custom notification
  if (template === 'booking') {
    notification = {
      ...NotificationTemplates.BOOKING_CONFIRMED,
      title: title || NotificationTemplates.BOOKING_CONFIRMED.title,
      body: body || NotificationTemplates.BOOKING_CONFIRMED.body,
      data: {
        type: 'test_background_notification',
        template: 'booking',
        timestamp: Date.now()
      }
    };
  } else if (template === 'reminder') {
    notification = {
      ...NotificationTemplates.BOOKING_REMINDER,
      title: title || NotificationTemplates.BOOKING_REMINDER.title,
      body: body || NotificationTemplates.BOOKING_REMINDER.body,
      data: {
        type: 'test_background_notification',
        template: 'reminder',
        timestamp: Date.now()
      }
    };
  } else if (template === 'payment') {
    notification = {
      ...NotificationTemplates.PAYMENT_RECEIVED,
      title: title || NotificationTemplates.PAYMENT_RECEIVED.title,
      body: body || NotificationTemplates.PAYMENT_RECEIVED.body,
      data: {
        type: 'test_background_notification',
        template: 'payment',
        timestamp: Date.now()
      }
    };
  } else {
    // Custom notification
    notification = {
      title: title || '🧪 Test Background Notification',
      body: body || 'This is a test notification to verify background delivery. Close the app to test!',
      sound: 'default',
      channelId: 'default',
      priority: 'high', // High priority for background delivery
      ttl: 86400, // 24 hours - ensures delivery even if device is offline
      data: {
        type: 'test_background_notification',
        template: 'custom',
        timestamp: Date.now(),
        screen: 'notifications'
      }
    };
  }

  logger.info('Sending background test notification', {
    userId,
    template,
    hasTitle: !!title,
    hasBody: !!body
  });

  const result = await pushNotificationService.sendToUser(userId, notification);
  
  if (result.success) {
    res.json({
      status: 'success',
      message: 'Background test notification sent successfully. Close the app to test background delivery.',
      data: {
        notification: {
          title: notification.title,
          body: notification.body,
          template,
          sentAt: new Date().toISOString()
        },
        note: 'If the app is closed, you should receive this notification as a background push notification.'
      }
    });
  } else {
    throw new ValidationError(result.error || 'Failed to send notification');
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
