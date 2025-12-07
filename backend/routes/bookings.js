const express = require('express');
const { body, validationResult } = require('express-validator');
const { query, getRow, getRows } = require('../database/connection');
const { auth, requireRole } = require('../middleware/auth');
const { formatNotificationTimestamp } = require('../utils/timezone');
const { sendNotification, sendAutoNotification } = require('../utils/notifications');
const { emitEarningsUpdate } = require('../utils/earnings');
const { pushNotificationService, NotificationTemplates } = require('../utils/pushNotifications');
const DatabaseOptimizer = require('../utils/databaseOptimization');
const logger = require('../utils/logger');
const getIO = () => require('../server').io;
const { bookingCreationLimiter, standardLimiter } = require('../middleware/rateLimiting');
const { sanitizeBody } = require('../middleware/inputSanitization');
const { createQueuedRateLimiter } = require('../utils/rateLimiterQueue');
const { ServiceUnavailableError, DatabaseConnectionError, RateLimitError } = require('../utils/errorTypes');
const { asyncHandler } = require('../middleware/errorHandler');
const { ValidationError, NotFoundError } = require('../utils/errorTypes');
const {
  validateCreateBooking,
  validateUpdateBooking,
  validateCancelBooking,
  validateReportBooking,
  validateRateBooking
} = require('../middleware/validators');

/**
 * Normalize appointment time to a standard format for comparison.
 * Converts various time formats (12-hour with AM/PM, 24-hour) to a normalized 12-hour format.
 * @param {string} timeStr - Time string in any format
 * @returns {string|null} - Normalized time string in "H:MM AM/PM" format, or null if invalid
 */
const normalizeAppointmentTime = (timeStr) => {
  if (!timeStr || typeof timeStr !== 'string') return null;
  
  const trimmed = timeStr.trim();
  if (!trimmed || trimmed === '00:00:00' || trimmed === '00:00') return null;
  
  try {
    let hours, minutes;
    
    // Check if it's already in 12-hour format (e.g., "2:00 PM", "03:00 PM")
    const ampmMatch = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)$/i);
    if (ampmMatch) {
      hours = parseInt(ampmMatch[1], 10);
      minutes = parseInt(ampmMatch[2], 10);
      const ampm = ampmMatch[3].toUpperCase();
      
      // Convert to 24-hour for normalization, then back to 12-hour
      if (ampm === 'PM' && hours !== 12) hours += 12;
      if (ampm === 'AM' && hours === 12) hours = 0;
      
      // Convert back to 12-hour format (standardized)
      const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
      const displayAmpm = hours >= 12 ? 'PM' : 'AM';
      const displayMinutes = minutes.toString().padStart(2, '0');
      
      return `${displayHours}:${displayMinutes} ${displayAmpm}`;
    }
    
    // Parse 24-hour format (e.g., "14:00" or "14:00:00")
    const timeParts = trimmed.split(':');
    if (timeParts.length >= 2) {
      hours = parseInt(timeParts[0], 10);
      minutes = parseInt(timeParts[1], 10);
      
      if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        return null;
      }
      
      // Convert to 12-hour format
      const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
      const displayAmpm = hours >= 12 ? 'PM' : 'AM';
      const displayMinutes = minutes.toString().padStart(2, '0');
      
      return `${displayHours}:${displayMinutes} ${displayAmpm}`;
    }
    
    return null;
  } catch (error) {
    logger.error('Error normalizing appointment time', { timeStr, error: error.message });
    return null;
  }
};

const bookingTrafficShaper = createQueuedRateLimiter({
  windowMs: 60 * 1000, // 1 minute burst window
  maxRequests: 8,
  concurrency: 2,
  queueLimit: 25,
  metricName: 'booking-creation',
  keyGenerator: (req) => req.user?.id?.toString() || req.ip,
  onQueue: (req, queueLength, meta) => {
    logger.warn('Booking request queued due to burst rate', {
      service: 'buildxpert-api',
      userId: req.user?.id,
      ip: req.ip,
      queueLength,
      inProgress: meta.inProgress,
      tokensRemaining: meta.tokens
    });
  },
  onReject: (req, res) => {
    logger.error('Booking queue saturated', {
      service: 'buildxpert-api',
      userId: req.user?.id,
      ip: req.ip
    });
    // Rate limiter middleware must respond directly, but use standardized error format
    const { RateLimitError } = require('../utils/errorTypes');
    const { formatErrorResponse } = require('../middleware/errorHandler');
    const error = new RateLimitError('Booking demand is very high right now. Please wait a moment and try again.', 60000);
    const response = formatErrorResponse(error, req);
    return res.status(429).json(response);
  }
});

const router = express.Router();

// All routes require authentication
router.use(auth);

// Apply input sanitization to all routes
router.use(sanitizeBody());

// @route   POST /api/bookings
// @desc    Create a new booking
// @access  Private
router.post('/', [bookingTrafficShaper, bookingCreationLimiter, ...validateCreateBooking], asyncHandler(async (req, res) => {

    const { providerServiceId, selectedService, appointmentDate, appointmentTime } = req.body;

    // Check if provider service exists and is active
    const providerService = await getRow(`
      SELECT ps.*, sm.name as service_name, u.full_name as provider_name, u.id as provider_user_id
      FROM provider_services ps
      JOIN services_master sm ON ps.service_id = sm.id
      JOIN provider_profiles pp ON ps.provider_id = pp.id
      JOIN users u ON pp.user_id = u.id
      WHERE ps.id = $1 AND ps.payment_status = 'active'
    `, [providerServiceId]);

  if (!providerService) {
    throw new NotFoundError('Provider service not found or inactive');
  }

  // Check if appointment date is in the future
  // Debug logging removed for production
  const appointmentDateTime = new Date(`${appointmentDate} ${appointmentTime}`);
  if (appointmentDateTime <= new Date()) {
    throw new ValidationError('Appointment date and time must be in the future');
  }

  // Normalize appointment time for comparison
  const normalizedAppointmentTime = normalizeAppointmentTime(appointmentTime);
  if (!normalizedAppointmentTime) {
    throw new ValidationError('Invalid appointment time format');
  }

  // Check for duplicate booking: same user cannot book same provider at same date/time
  // Only check for pending or accepted bookings (rejected, completed, cancelled are allowed)
  // Fetch all bookings for this user/provider/date with pending/accepted status
  const potentialDuplicates = await getRows(`
    SELECT b.id, b.status, b.appointment_date, b.appointment_time
    FROM bookings b
    WHERE b.user_id = $1
      AND b.provider_service_id = $2
      AND b.appointment_date = $3
      AND b.status IN ('pending', 'accepted')
  `, [req.user.id, providerServiceId, appointmentDate]);

  // Normalize and compare times
  let existingBooking = null;
  for (const booking of potentialDuplicates) {
    const normalizedStoredTime = normalizeAppointmentTime(booking.appointment_time);
    if (normalizedStoredTime === normalizedAppointmentTime) {
      existingBooking = booking;
      break;
    }
  }

  if (existingBooking) {
    logger.warn('Duplicate booking attempt blocked', {
      userId: req.user.id,
      providerServiceId,
      appointmentDate,
      appointmentTime: normalizedAppointmentTime,
      existingBookingId: existingBooking.id,
      existingStatus: existingBooking.status
    });
    throw new ValidationError('You already have a booking with this provider at the same date and time. Please choose a different time or wait for the current booking to be completed or cancelled.');
  }

  // Create booking (store normalized time for consistency)
  const timeToStore = normalizedAppointmentTime;
  const result = await query(`
      INSERT INTO bookings (user_id, provider_service_id, selected_service, appointment_date, appointment_time)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [req.user.id, providerServiceId, selectedService, appointmentDate, timeToStore]);

  const newBooking = result.rows[0];

  // Emit real-time event to both the provider's and customer's userId rooms
  const providerUserId = providerService.provider_user_id;
  const customerUserId = req.user.id;
  
  if (providerUserId) {
      getIO().to(providerUserId).emit('booking_created', {
        booking: {
          ...newBooking,
          providerName: providerService.provider_name,
          serviceName: providerService.service_name
        }
      });

      // Send push notification to provider
      const providerNotification = {
        ...NotificationTemplates.NEW_BOOKING_REQUEST,
        body: `New booking request for ${providerService.service_name} on ${appointmentDate}`,
        data: {
          type: 'booking_request',
          bookingId: newBooking.id,
          screen: 'bookings'
        }
      };
      
      await pushNotificationService.sendToUser(providerUserId, providerNotification);
      logger.booking('Push notification sent to provider', {
        bookingId: newBooking.id,
        providerId: providerUserId
    });
  }
  
  if (customerUserId) {
    getIO().to(customerUserId).emit('booking_created', {
      booking: {
        ...newBooking,
        providerName: providerService.provider_name,
        serviceName: providerService.service_name
      }
    });
  }

  // Format appointment date and time for better display
  const formatAppointmentDateTime = (dateStr, timeStr) => {
      try {
        const date = new Date(dateStr);
        const formattedDate = date.toLocaleDateString('en-IN', {
          weekday: 'short',
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        });
        
        // Format time (assuming timeStr is in format like "14:00" or "2:00 PM")
        let formattedTime = timeStr;
        if (timeStr && !timeStr.includes('AM') && !timeStr.includes('PM')) {
          // Convert 24-hour format to 12-hour format
          const timeParts = timeStr.split(':');
          if (timeParts.length === 2) {
            let hours = parseInt(timeParts[0]);
            const minutes = timeParts[1];
            const ampm = hours >= 12 ? 'PM' : 'AM';
            hours = hours % 12;
            hours = hours ? hours : 12; // Convert 0 to 12
            formattedTime = `${hours}:${minutes} ${ampm}`;
          }
        }
        
        return { formattedDate, formattedTime };
      } catch (error) {
        logger.error('Error formatting appointment date/time', { error: error.message });
      return { formattedDate: dateStr, formattedTime: timeStr };
    }
  };
  
  const { formattedDate, formattedTime } = formatAppointmentDateTime(appointmentDate, appointmentTime);

  // Notify provider
  const providerNotification = await sendNotification(
      providerService.provider_user_id,
      'New Booking',
      `You have a new booking for ${providerService.service_name} on ${formattedDate} at ${formattedTime}`,
      'provider'
    );

    // Notify user about booking confirmation
    const userNotification = await sendNotification(
      req.user.id,
      'Booking Confirmed',
      `Your booking for ${providerService.service_name} on ${formattedDate} at ${formattedTime} has been confirmed.`,
    'user'
  );

  res.status(201).json({
    status: 'success',
    message: 'Booking created successfully',
    data: {
      booking: {
        ...newBooking,
        providerName: providerService.provider_name,
        serviceName: providerService.service_name
      }
    }
  });
}));

// @route   GET /api/bookings
// @desc    Get user's bookings
// @access  Private
router.get('/', asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 10 } = req.query;

  // Use optimized database query
  const result = await DatabaseOptimizer.getBookingsWithDetails(req.user.id, {
    status,
    page: parseInt(page),
    limit: parseInt(limit),
    userType: 'user'
  });

  res.json({
    status: 'success',
    data: {
      bookings: result.bookings,
      pagination: result.pagination
    }
  });
}));

// @route   GET /api/bookings/:id
// @desc    Get booking details
// @access  Private
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const booking = await getRow(`
      SELECT 
        b.*,
        u.full_name as provider_name,
        u.phone as provider_phone,
        u.profile_pic_url as provider_profile_pic_url,
        sm.name as service_name,
        ps.service_charge_value,
        ps.service_charge_unit,
        ps.working_proof_urls
      FROM bookings b
      JOIN provider_services ps ON b.provider_service_id = ps.id
      JOIN provider_profiles pp ON ps.provider_id = pp.id
      JOIN users u ON pp.user_id = u.id
      JOIN services_master sm ON ps.service_id = sm.id
      WHERE b.id = $1 AND b.user_id = $2
    `, [id, req.user.id]);

  if (!booking) {
    throw new NotFoundError('Booking not found');
  }

  // Get rating if exists
  const rating = await getRow('SELECT * FROM ratings WHERE booking_id = $1', [id]);

  res.json({
    status: 'success',
    data: {
      booking: {
        ...booking,
        rating: rating || null
      }
    }
  });
}));

// @route   PUT /api/bookings/:id/cancel
// @desc    Cancel booking
// @access  Private
router.put('/:id/cancel', [
  body('cancellationReason').optional().notEmpty().withMessage('Cancellation reason cannot be empty')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', { errors: errors.array() });
  }

  const { id } = req.params;
  const { cancellationReason } = req.body;

  // Check if booking belongs to user
  const booking = await getRow('SELECT * FROM bookings WHERE id = $1 AND user_id = $2', [id, req.user.id]);
  if (!booking) {
    throw new NotFoundError('Booking not found');
  }

  // Check if booking can be cancelled
  if (['completed', 'cancelled', 'confirmed', 'accepted'].includes(booking.status)) {
    throw new ValidationError('Cannot cancel completed, confirmed, accepted, or already cancelled booking');
  }

  // Update booking status
  const updateFields = ['status = $1'];
  const updateValues = ['cancelled'];
  let paramCount = 2;

  if (cancellationReason) {
    updateFields.push(`cancellation_reason = $${paramCount}`);
    updateValues.push(cancellationReason);
    paramCount++;
  }

  updateValues.push(id);
  const result = await query(`
      UPDATE bookings 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `, updateValues);

  const updatedBooking = result.rows[0];

  // Fetch provider's user_id for socket event
  const providerService = await getRow('SELECT ps.*, pp.user_id as provider_user_id FROM provider_services ps JOIN provider_profiles pp ON ps.provider_id = pp.id WHERE ps.id = $1', [updatedBooking.provider_service_id]);
  if (providerService && providerService.provider_user_id) {
    getIO().to(providerService.provider_user_id).emit('booking_updated', {
      booking: updatedBooking
    });
  }

  // Get booking details for notifications
  const bookingDetails = await getRow(`
      SELECT b.*, sm.name as service_name
      FROM bookings b
      JOIN provider_services ps ON b.provider_service_id = ps.id
      JOIN services_master sm ON ps.service_id = sm.id
      WHERE b.id = $1
    `, [id]);

  // Notify user
  const userNotification = await sendNotification(
    req.user.id,
    'Booking Cancelled',
    `Your booking has been cancelled.`,
    'user'
  );

  // Send push notification to user
  if (bookingDetails) {
      const userPushNotification = {
        ...NotificationTemplates.BOOKING_CANCELLED,
        body: `Your ${bookingDetails.service_name} booking has been cancelled`,
        data: {
          type: 'booking_cancelled',
          bookingId: id,
          screen: 'bookings'
        }
      };
      await pushNotificationService.sendToUser(req.user.id, userPushNotification);
      logger.booking('Push notification sent to user for cancellation', {
        bookingId: id
    });
  }

  // Notify provider about the cancellation
  if (providerService && providerService.provider_user_id) {
    const providerNotification = await sendNotification(
        providerService.provider_user_id,
        'Booking Cancelled by Customer',
        `A customer has cancelled their booking for ${providerService.service_name}.`,
        'provider'
      );

    // Send push notification to provider
    if (bookingDetails) {
      const providerPushNotification = {
          title: '📋 Booking Cancelled',
          body: `A ${bookingDetails.service_name} booking was cancelled by the customer`,
          sound: 'default',
          priority: 'normal',
          data: {
            type: 'booking_cancelled_by_user',
            bookingId: id,
            screen: 'bookings'
          }
        };
        await pushNotificationService.sendToUser(providerService.provider_user_id, providerPushNotification);
        logger.booking('Push notification sent to provider for cancellation', {
          bookingId: id
      });
    }

    // Emit earnings update to provider when booking is cancelled
    await emitEarningsUpdate(providerService.provider_user_id);
  }

  res.json({
    status: 'success',
    message: 'Booking cancelled successfully',
    data: { booking: updatedBooking }
  });
}));

// @route   POST /api/bookings/:id/rate
// @desc    Rate a completed booking
// @access  Private
router.post('/:id/rate', [
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
  body('review').optional().isLength({ max: 500 }).withMessage('Review must be less than 500 characters')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', { errors: errors.array() });
  }

  const { id } = req.params;
  const { rating, review } = req.body;

  // Check if booking belongs to user and is completed
  const booking = await getRow('SELECT * FROM bookings WHERE id = $1 AND user_id = $2', [id, req.user.id]);
  if (!booking) {
    throw new NotFoundError('Booking not found');
  }

  if (booking.status !== 'completed') {
    throw new ValidationError('Can only rate completed bookings');
  }

  // Check if already rated
  const existingRating = await getRow('SELECT * FROM ratings WHERE booking_id = $1', [id]);
  if (existingRating) {
    throw new ValidationError('Booking already rated');
  }

  // Create rating
  const result = await query(`
    INSERT INTO ratings (booking_id, rating, review)
    VALUES ($1, $2, $3)
    RETURNING *
  `, [id, rating, review]);

  const newRating = result.rows[0];

  // Fetch provider user_id and service_name
  const ratingBooking = await getRow(`
      SELECT ps.provider_id, sm.name as service_name, ps.id as provider_service_id
      FROM bookings b
      JOIN provider_services ps ON b.provider_service_id = ps.id
      JOIN services_master sm ON ps.service_id = sm.id
      WHERE b.id = $1
    `, [id]);
  if (ratingBooking) {
    // Get provider's user_id
    const providerProfile = await getRow('SELECT user_id FROM provider_profiles WHERE id = $1', [ratingBooking.provider_id]);
    if (providerProfile) {
      const ratingNotification = await sendNotification(
          providerProfile.user_id,
          'New Rating',
          `You received a new rating for ${ratingBooking.service_name}`,
          'provider'
        );

        // Also notify the user that their rating was submitted
        const userRatingNotification = await sendNotification(
          req.user.id,
          'Rating Submitted',
          `Thank you for rating your experience with ${ratingBooking.service_name}.`,
        'user'
      );
      // Emit booking_updated event to provider
      // Fetch updated booking for event
      const updatedBooking = await getRow('SELECT * FROM bookings WHERE id = $1', [id]);
      if (updatedBooking) {
        getIO().to(providerProfile.user_id).emit('booking_updated', {
          booking: updatedBooking
        });
      }
    }
  }

  res.status(201).json({
    status: 'success',
    message: 'Rating submitted successfully',
    data: { rating: newRating }
  });
}));

// @route   POST /api/bookings/:id/report
// @desc    Report a booking
// @access  Private
router.post('/:id/report', [
  require('../middleware/rateLimiting').reportLimiter,
  body('reportReason').notEmpty().withMessage('Report reason is required'),
  body('reportDescription').notEmpty().withMessage('Report description is required')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', { errors: errors.array() });
  }

  const { id } = req.params;
  const { reportReason, reportDescription } = req.body;

  // Check if booking belongs to user
  const booking = await getRow('SELECT * FROM bookings WHERE id = $1 AND user_id = $2', [id, req.user.id]);
  if (!booking) {
    throw new NotFoundError('Booking not found');
  }

  // Check if booking has already been reported
  if (booking.report_reason) {
    throw new ValidationError('This booking has already been reported');
  }

  // Update booking with report
  const result = await query(`
    UPDATE bookings 
    SET report_reason = $1, report_description = $2
    WHERE id = $3
    RETURNING *
  `, [reportReason, reportDescription, id]);

  const updatedBooking = result.rows[0];

  // Also create an entry in user_reports_providers table for admin dashboard
  try {
    // Get provider ID from the booking
    const providerService = await getRow(`
        SELECT provider_id FROM provider_services WHERE id = $1
      `, [booking.provider_service_id]);
      
    if (providerService) {
      // Get the provider's user ID
      const providerProfile = await getRow(`
        SELECT user_id FROM provider_profiles WHERE id = $1
      `, [providerService.provider_id]);
      
      if (providerProfile) {
        // Get booking date for incident_date
        const bookingDate = booking.appointment_date || new Date().toISOString().split('T')[0];
        
        await query(`
          INSERT INTO user_reports_providers 
          (reported_by_user_id, reported_provider_id, incident_date, incident_type, description, status)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          req.user.id,
          providerProfile.user_id,
          bookingDate,
          reportReason || 'other', // incident_type (required)
          reportDescription,
          'open'
        ]);
      }
    }
  } catch (reportError) {
    // Log error but don't fail the request
    logger.error('Failed to create user_reports_providers entry', { error: reportError.message });
  }

  // Note: Provider notification removed - providers will not be notified when they are reported

  // Also notify the user that their report was submitted
  const userNotification = await sendNotification(
    req.user.id,
    'Report Submitted',
    `Your report has been submitted successfully. We will review it and take appropriate action.`,
    'user'
  );

  res.json({
    status: 'success',
    message: 'Booking reported successfully',
    data: { booking: updatedBooking }
  });
}));

module.exports = router;
