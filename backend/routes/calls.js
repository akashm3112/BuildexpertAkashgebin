const express = require('express');
const { body, validationResult } = require('express-validator');
const { auth } = require('../middleware/auth');
const { getRow, getRows, query } = require('../database/connection');

const router = express.Router();

// All routes require authentication
router.use(auth);

/**
 * @route   POST /api/calls/initiate
 * @desc    Get call information for WebRTC connection
 * @access  Private
 */
router.post('/initiate', [
  body('bookingId').isUUID().withMessage('Valid booking ID is required'),
  body('callerType').isIn(['user', 'provider']).withMessage('Caller type must be user or provider')
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

    const { bookingId, callerType } = req.body;
    const callerId = req.user.id;

    // Get booking with user and provider details
    const booking = await getRow(`
      SELECT 
        b.*,
        u_customer.id as customer_id,
        u_customer.full_name as customer_name,
        u_provider.id as provider_id,
        u_provider.full_name as provider_name,
        sm.name as service_name
      FROM bookings b
      JOIN users u_customer ON b.user_id = u_customer.id
      JOIN provider_services ps ON b.provider_service_id = ps.id
      JOIN provider_profiles pp ON ps.provider_id = pp.id
      JOIN users u_provider ON pp.user_id = u_provider.id
      JOIN services_master sm ON ps.service_id = sm.id
      WHERE b.id = $1 AND (b.user_id = $2 OR pp.user_id = $2)
    `, [bookingId, callerId]);

    if (!booking) {
      return res.status(404).json({
        status: 'error',
        message: 'Booking not found or access denied'
      });
    }

    // Check if booking allows calling
    if (!['accepted', 'pending', 'in_progress'].includes(booking.status)) {
      return res.status(400).json({
        status: 'error',
        message: 'Calls are only allowed for active bookings'
      });
    }

    // Determine caller and receiver
    const isUserCalling = callerType === 'user';
    const receiverId = isUserCalling ? booking.provider_id : booking.customer_id;
    const receiverName = isUserCalling ? booking.provider_name : booking.customer_name;
    const callerName = isUserCalling ? booking.customer_name : booking.provider_name;

    res.json({
      status: 'success',
      message: 'Call info retrieved',
      data: {
        bookingId,
        callerId,
        callerName,
        receiverId,
        receiverName,
        serviceName: booking.service_name
      }
    });

  } catch (error) {
    console.error('Error initiating call:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

/**
 * @route   POST /api/calls/log
 * @desc    Log WebRTC call details
 * @access  Private
 */
router.post('/log', [
  body('bookingId').isUUID().withMessage('Valid booking ID is required'),
  body('duration').isInt({ min: 0 }).withMessage('Duration must be a positive integer'),
  body('callerType').isIn(['user', 'provider']).withMessage('Caller type must be user or provider')
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

    const { bookingId, duration, callerType, status = 'completed' } = req.body;
    const userId = req.user.id;

    // Log the call
    await query(`
      INSERT INTO call_logs (
        booking_id, caller_type, caller_id, call_status, duration, created_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())
    `, [bookingId, callerType, userId, status, duration]);

    console.log('📞 Call logged:', { bookingId, duration, callerType });

    res.json({
      status: 'success',
      message: 'Call logged successfully'
    });

  } catch (error) {
    console.error('Error logging call:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});


/**
 * @route   GET /api/calls/history/:bookingId
 * @desc    Get call history for a booking
 * @access  Private
 */
router.get('/history/:bookingId', async (req, res) => {
  try {
    const { bookingId } = req.params;

    // Verify user has access to this booking
    const booking = await getRow(`
      SELECT b.* FROM bookings b
      LEFT JOIN provider_services ps ON b.provider_service_id = ps.id
      LEFT JOIN provider_profiles pp ON ps.provider_id = pp.id
      WHERE b.id = $1 AND (b.user_id = $2 OR pp.user_id = $2)
    `, [bookingId, req.user.id]);

    if (!booking) {
      return res.status(404).json({
        status: 'error',
        message: 'Booking not found or access denied'
      });
    }

    const calls = await getRows(`
      SELECT * FROM call_logs 
      WHERE booking_id = $1 
      ORDER BY created_at DESC
    `, [bookingId]);

    res.json({
      status: 'success',
      data: { calls }
    });

  } catch (error) {
    console.error('Error getting call history:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

module.exports = router;



