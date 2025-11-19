const express = require('express');
const { body, validationResult } = require('express-validator');
const { auth } = require('../middleware/auth');
const { getRow, getRows, query } = require('../database/connection');
const logger = require('../utils/logger');
const {
  callInitiationLimiter,
  callLogLimiter,
  callEventLimiter,
  callHistoryLimiter
} = require('../middleware/rateLimiting');
const { sanitizeBody } = require('../middleware/inputSanitization');
const { asyncHandler } = require('../middleware/errorHandler');
const { validateCallPermissions } = require('../utils/callPermissions');
const { WebRTCPermissionError, ValidationError } = require('../utils/errorTypes');

const router = express.Router();

// All routes require authentication
router.use(auth);

// Apply input sanitization
router.use(sanitizeBody());

/**
 * @route   POST /api/calls/initiate
 * @desc    Get call information for WebRTC connection
 * @access  Private
 */
router.post('/initiate', [
  callInitiationLimiter,
  body('bookingId').isUUID().withMessage('Valid booking ID is required'),
  body('callerType').isIn(['user', 'provider']).withMessage('Caller type must be user or provider')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', { errors: errors.array() });
  }

  const { bookingId, callerType } = req.body;
  const callerId = req.user.id;

  const { caller, receiver, metadata } = await validateCallPermissions({
    bookingId,
    callerId,
    providedCallerType: callerType
  });

  res.json({
    status: 'success',
    message: 'Call info retrieved',
    data: {
      bookingId,
      callerId: caller.id,
      callerName: caller.name,
      receiverId: receiver.id,
      receiverName: receiver.name,
      serviceName: metadata.serviceName
    }
  });
}));

/**
 * @route   POST /api/calls/log
 * @desc    Log WebRTC call details
 * @access  Private
 */
router.post('/log', [
  callLogLimiter,
  body('bookingId').isUUID().withMessage('Valid booking ID is required'),
  body('duration').isInt({ min: 0 }).withMessage('Duration must be a positive integer'),
  body('callerType').isIn(['user', 'provider']).withMessage('Caller type must be user or provider')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', { errors: errors.array() });
  }

  const { 
    bookingId, 
    duration, 
    callerType, 
    status = 'completed',
    connectionQuality,
    errorDetails,
    endReason,
    metrics,
    sessionId,
    callSid,
    callerPhone
  } = req.body;
  const userId = req.user.id;

  // Get user's phone number if callerPhone not provided
  let userPhone = callerPhone;
  if (!userPhone) {
    const userResult = await query('SELECT phone FROM users WHERE id = $1', [userId]);
    userPhone = userResult.rows[0]?.phone || 'unknown';
  }

  // Generate sessionId and callSid if not provided
  const finalSessionId = sessionId || `SESSION_${Date.now()}_${userId}`;
  const finalCallSid = callSid || `CALL_${Date.now()}_${userId}`;

  // Enhanced call logging with additional details
  await query(`
    INSERT INTO call_logs (
      booking_id, session_id, call_sid, caller_type, caller_phone, call_status, call_duration, 
      connection_quality, error_details, end_reason, metrics, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
  `, [
    bookingId,
    finalSessionId,
    finalCallSid,
    callerType, 
    userPhone,
    status, 
    duration || 0, // call_duration column
    connectionQuality ? JSON.stringify(connectionQuality) : null,
    errorDetails ? JSON.stringify(errorDetails) : null,
    endReason,
    metrics ? JSON.stringify(metrics) : null
  ]);

  logger.info('Call logged with details', { 
    bookingId, 
    duration, 
    callerType, 
    status,
    connectionQuality,
    endReason,
    timestamp: new Date().toISOString()
  });

  res.json({
    status: 'success',
    message: 'Call logged successfully'
  });
}));


/**
 * @route   POST /api/calls/event
 * @desc    Log individual call events
 * @access  Private
 */
router.post('/event', [
  callEventLimiter,
  body('callLogId').isUUID().withMessage('Valid call log ID is required'),
  body('eventType').notEmpty().withMessage('Event type is required'),
  body('eventData').optional().isObject()
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', { errors: errors.array() });
  }

  const { callLogId, eventType, eventData } = req.body;

  await query(`
    INSERT INTO call_events (
      call_log_id, event_type, event_data, timestamp
    ) VALUES ($1, $2, $3, NOW())
  `, [callLogId, eventType, JSON.stringify(eventData || {})]);

  logger.info('Call event logged', { 
    callLogId, 
    eventType, 
    eventData,
    timestamp: new Date().toISOString()
  });

  res.json({
    status: 'success',
    message: 'Call event logged successfully'
  });
}));

/**
 * @route   GET /api/calls/history/:bookingId
 * @desc    Get call history for a booking
 * @access  Private
 */
router.get('/history/:bookingId', callHistoryLimiter, asyncHandler(async (req, res) => {
  const { bookingId } = req.params;

  // Verify user has access to this booking
  const booking = await getRow(`
    SELECT b.* FROM bookings b
    LEFT JOIN provider_services ps ON b.provider_service_id = ps.id
    LEFT JOIN provider_profiles pp ON ps.provider_id = pp.id
    WHERE b.id = $1 AND (b.user_id = $2 OR pp.user_id = $2)
  `, [bookingId, req.user.id]);

  if (!booking) {
    throw new WebRTCPermissionError('Booking not found or access denied', 'CALL_HISTORY_ACCESS_DENIED');
  }

  const calls = await getRows(`
    SELECT 
      cl.*,
      json_agg(
        json_build_object(
          'id', ce.id,
          'event_type', ce.event_type,
          'event_data', ce.event_data,
          'timestamp', ce.timestamp
        ) ORDER BY ce.timestamp
      ) FILTER (WHERE ce.id IS NOT NULL) as events
    FROM call_logs cl
    LEFT JOIN call_events ce ON cl.id = ce.call_log_id
    WHERE cl.booking_id = $1 
    GROUP BY cl.id
    ORDER BY cl.created_at DESC
  `, [bookingId]);

  res.json({
    status: 'success',
    data: { calls }
  });
}));

module.exports = router;



