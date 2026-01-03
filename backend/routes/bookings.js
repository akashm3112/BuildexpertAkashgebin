const express = require('express');
const { body, validationResult } = require('express-validator');
const { query, getRow, getRows, withTransaction } = require('../database/connection');
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
const { invalidateUserCache } = require('../utils/cacheIntegration');
const { caches } = require('../utils/cacheManager');
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

    const { providerServiceId, selectedService, selectedServices, appointmentDate, appointmentTime } = req.body;

    // Check if provider service exists and is active
    // PRODUCTION ROOT FIX: Fetch provider details (name, phone, profile pic) to store in booking
    const providerService = await getRow(`
      SELECT 
        ps.*, 
        sm.name as service_name, 
        u.full_name as provider_name, 
        u.phone as provider_phone,
        u.profile_pic_url as provider_profile_pic_url,
        u.id as provider_user_id
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

  // PRODUCTION ROOT FIX: Calculate service charge BEFORE transaction to avoid long transaction
  // Get service charge from sub-services
  // Support both single selectedService (backward compatibility) and multiple selectedServices
  let serviceChargeValue = 0;
  const servicesToProcess = selectedServices && Array.isArray(selectedServices) && selectedServices.length > 0
    ? selectedServices
    : selectedService
      ? [selectedService]
      : [];
  
  if (servicesToProcess.length > 0) {
    try {
      // Use sub-service IDs directly (frontend identifiers like 'room-painting', etc.)
      const subServiceRecords = await getRows(`
        SELECT pss.price
        FROM provider_sub_services pss
        WHERE pss.provider_service_id = $1
          AND pss.sub_service_id = ANY($2::text[])
      `, [providerServiceId, servicesToProcess]);
      
      // Sum all prices for multiple services
      if (subServiceRecords && subServiceRecords.length > 0) {
        serviceChargeValue = subServiceRecords.reduce((total, record) => {
          const price = parseFloat(record.price) || 0;
          return total + price;
        }, 0);
      }
    } catch (error) {
      logger.warn('Could not find sub-service prices, using 0', {
        selectedServices: servicesToProcess,
        providerServiceId,
        error: error.message
      });
      serviceChargeValue = 0;
    }
  }

  // Store selected services as comma-separated string for backward compatibility
  const selectedServiceToStore = selectedServices && Array.isArray(selectedServices) && selectedServices.length > 0
    ? selectedServices.join(',')
    : selectedService || '';

  // Extract provider ID for booking creation
  const providerId = providerService.provider_id;

  // PRODUCTION ROOT FIX: Fetch customer details to store in booking
  // This ensures customer information persists even after account deletion
  const customerUser = await getRow('SELECT full_name, phone FROM users WHERE id = $1', [req.user.id]);

  // PRODUCTION ROOT FIX: Use transaction with row-level locking to prevent race conditions
  // This ensures atomic duplicate check + booking creation, preventing false duplicates
  // The transaction ensures that if two requests come in simultaneously, only one succeeds
  const bookingResult = await withTransaction(async (client) => {
    // CRITICAL: Use FOR UPDATE to lock rows and prevent race conditions
    // This ensures that concurrent requests wait for each other
    // PRODUCTION ROOT FIX: Use explicit date casting and ensure timezone consistency
    // Compare dates as strings (YYYY-MM-DD) to ensure exact match regardless of timezone
    const appointmentDateStr = appointmentDate; // Already in YYYY-MM-DD format from frontend
    
    // PRODUCTION ROOT FIX: Validate date format before query
    if (!/^\d{4}-\d{2}-\d{2}$/.test(appointmentDateStr)) {
      throw new ValidationError('Invalid appointment date format');
    }
    
    // PRODUCTION ROOT FIX: More strict duplicate check - only check for ACTIVE bookings
    // Exclude cancelled, rejected, and completed bookings explicitly
    // Also ensure we're comparing dates correctly without timezone issues
    // CRITICAL: Use explicit DATE() casting to avoid timezone issues
    // CRITICAL: Ensure user_id is NOT NULL (migration 034 sets user_id to NULL when user deletes account)
    // This prevents matching bookings from deleted users
    const potentialDuplicates = await client.query(`
      SELECT b.id, b.status, b.appointment_date, b.appointment_time, b.provider_service_id
      FROM bookings b
      WHERE b.user_id = $1
        AND b.user_id IS NOT NULL
        AND b.provider_service_id = $2
        AND DATE(b.appointment_date) = DATE($3::date)
        AND b.status IN ('pending', 'accepted')
        AND DATE(b.appointment_date) >= CURRENT_DATE
        AND b.appointment_time IS NOT NULL 
        AND b.appointment_time::text != '' 
        AND b.appointment_time::text != '00:00:00'
      FOR UPDATE
    `, [req.user.id, providerServiceId, appointmentDateStr]);

    // Normalize and compare times - only consider valid normalized times
    let existingBooking = null;
    if (potentialDuplicates.rows && potentialDuplicates.rows.length > 0) {
      // PRODUCTION ROOT FIX: Log detailed information for debugging false positives
      logger.info('Potential duplicates found, checking time matches', {
        userId: req.user.id,
        providerServiceId,
        appointmentDate,
        appointmentTime: normalizedAppointmentTime,
        potentialDuplicatesCount: potentialDuplicates.rows.length,
        potentialDuplicates: potentialDuplicates.rows.map(b => ({
          id: b.id,
          status: b.status,
          appointment_date: b.appointment_date,
          appointment_time: b.appointment_time,
          provider_service_id: b.provider_service_id,
          dateStr: String(b.appointment_date).split('T')[0]
        })),
        queryParams: {
          userId: req.user.id,
          providerServiceId,
          appointmentDateStr
        }
      });

      for (const booking of potentialDuplicates.rows) {
        // PRODUCTION ROOT FIX: Additional defensive checks to prevent false positives
        
        // Verify status is actually pending or accepted (defensive check)
        if (booking.status !== 'pending' && booking.status !== 'accepted') {
          logger.warn('Skipping booking with invalid status in duplicate check', {
            bookingId: booking.id,
            status: booking.status,
            userId: req.user.id
          });
          continue;
        }
        
        // Verify provider_service_id matches (defensive check)
        if (booking.provider_service_id !== providerServiceId) {
          logger.info('Skipping booking with mismatched provider_service_id', {
            bookingId: booking.id,
            expected: providerServiceId,
            actual: booking.provider_service_id
          });
          continue;
        }
        
        // PRODUCTION ROOT FIX: Verify date matches exactly (defensive check)
        const bookingDateStr = String(booking.appointment_date).split('T')[0];
        if (bookingDateStr !== appointmentDateStr) {
          logger.warn('Skipping booking with mismatched date in duplicate check', {
            bookingId: booking.id,
            expected: appointmentDateStr,
            actual: bookingDateStr,
            rawDate: booking.appointment_date
          });
          continue;
        }
        
        // Skip if booking time is null or invalid
        const bookingTimeStr = String(booking.appointment_time || '').trim();
        if (!bookingTimeStr || bookingTimeStr === '' || bookingTimeStr === '00:00:00') {
          logger.info('Skipping booking with invalid appointment_time', {
            bookingId: booking.id,
            appointmentTime: booking.appointment_time
          });
          continue;
        }
        
        const normalizedStoredTime = normalizeAppointmentTime(bookingTimeStr);
        
        // Only compare if both times are successfully normalized
        if (!normalizedStoredTime) {
          logger.info('Skipping booking with unnormalizable appointment_time', {
            bookingId: booking.id,
            appointmentTime: booking.appointment_time
          });
          continue;
        }
        
        logger.info('Comparing normalized times', {
          bookingId: booking.id,
          storedNormalizedTime: normalizedStoredTime,
          requestedNormalizedTime: normalizedAppointmentTime,
          match: normalizedStoredTime === normalizedAppointmentTime
        });
        
        // PRODUCTION ROOT FIX: Only match if times are exactly equal
        if (normalizedStoredTime === normalizedAppointmentTime) {
          existingBooking = booking;
          break;
        }
      }
    } else {
      logger.info('No potential duplicates found', {
        userId: req.user.id,
        providerServiceId,
        appointmentDate,
        appointmentTime: normalizedAppointmentTime
      });
    }

    if (existingBooking) {
      // PRODUCTION ROOT FIX: Additional validation to prevent false positives
      // Double-check that the booking is actually a duplicate before blocking
      const bookingDateStr = String(existingBooking.appointment_date).split('T')[0];
      const isStatusValid = existingBooking.status === 'pending' || existingBooking.status === 'accepted';
      const isDateMatch = bookingDateStr === appointmentDateStr;
      const isProviderMatch = existingBooking.provider_service_id === providerServiceId;
      
      // Only block if all validations pass
      if (isStatusValid && isDateMatch && isProviderMatch) {
        logger.warn('Duplicate booking attempt blocked (within transaction)', {
          userId: req.user.id,
          providerServiceId,
          appointmentDate,
          appointmentTime: normalizedAppointmentTime,
          existingBookingId: existingBooking.id,
          existingStatus: existingBooking.status,
          existingTime: existingBooking.appointment_time,
          existingDate: existingBooking.appointment_date
        });
        throw new ValidationError('You already have a booking with this provider at the same date and time. Please choose a different time or wait for the current booking to be completed or cancelled.');
      } else {
        // Log the false positive for debugging
        logger.error('False duplicate detected - booking should not have matched', {
          userId: req.user.id,
          providerServiceId,
          appointmentDate,
          appointmentTime: normalizedAppointmentTime,
          existingBookingId: existingBooking.id,
          existingStatus: existingBooking.status,
          existingTime: existingBooking.appointment_time,
          existingDate: existingBooking.appointment_date,
          existingProviderServiceId: existingBooking.provider_service_id,
          validationChecks: {
            isStatusValid,
            isDateMatch,
            isProviderMatch,
            bookingDateStr,
            appointmentDateStr
          }
        });
        // Don't block - allow booking to proceed if validation fails
        existingBooking = null;
      }
    }

    // All duplicate checks passed - create booking within the same transaction
    // This ensures atomicity: either the duplicate check AND booking creation both succeed, or both fail
    // PRODUCTION ROOT FIX: Store provider and customer details directly in bookings table
    // This ensures information persists even if provider/customer deletes service/account
    const insertResult = await client.query(`
      INSERT INTO bookings (
        user_id, 
        provider_service_id, 
        provider_id, 
        selected_service, 
        appointment_date, 
        appointment_time, 
        service_charge_value, 
        is_viewed_by_provider,
        provider_name,
        provider_phone,
        provider_profile_pic_url,
        customer_name,
        customer_phone
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE, $8, $9, $10, $11, $12)
      RETURNING *
    `, [
      req.user.id, 
      providerServiceId, 
      providerId, 
      selectedServiceToStore, 
      appointmentDate, 
      normalizedAppointmentTime, 
      serviceChargeValue,
      providerService.provider_name || null,
      providerService.provider_phone || null,
      providerService.provider_profile_pic_url || null,
      customerUser?.full_name || null,
      customerUser?.phone || null
    ]);

    return { newBooking: insertResult.rows[0] };
  }, { name: 'booking-creation', retries: 1 });

  // Extract booking from transaction result
  const newBooking = bookingResult.newBooking;

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

      // Format appointment date for push notification
      const { formatDate } = require('../utils/timezone');
      const formattedAppointmentDate = formatDate(new Date(appointmentDate));
      
      // Send push notification to provider
      const providerNotification = {
        ...NotificationTemplates.NEW_BOOKING_REQUEST,
        body: `New booking request for ${providerService.service_name} on ${formattedAppointmentDate}`,
        data: {
          type: 'booking_request',
          bookingId: newBooking.id,
          screen: 'bookings',
          scheduledDate: formattedAppointmentDate,
          appointmentDate: appointmentDate,
          appointmentTime: appointmentTime
        }
      };
      
      await pushNotificationService.sendToUser(providerUserId, providerNotification);
      logger.booking('Push notification sent to provider', {
        bookingId: newBooking.id,
        providerId: providerUserId
    });
      
      // Emit booking_unread_count_update event to provider for real-time badge update
      getIO().to(providerUserId).emit('booking_unread_count_update');
  }
  
  if (customerUserId) {
    getIO().to(customerUserId).emit('booking_created', {
      booking: {
        ...newBooking,
        providerName: providerService.provider_name,
        serviceName: providerService.service_name
      }
    });

    // Format appointment date for user notification
    const formattedUserAppointmentDate = formatDate(new Date(appointmentDate));
    
    // Send push notification to user confirming booking creation
    const userNotification = {
      ...NotificationTemplates.BOOKING_CREATED,
      body: `Your booking request for ${providerService.service_name} on ${formattedUserAppointmentDate} has been submitted. Waiting for provider confirmation.`,
      data: {
        type: 'booking_created',
        bookingId: newBooking.id,
        screen: 'bookings',
        scheduledDate: formattedUserAppointmentDate,
        appointmentDate: appointmentDate,
        appointmentTime: appointmentTime
      }
    };
    
    pushNotificationService.sendToUser(customerUserId, userNotification)
      .catch(err => logger.error('Failed to send booking creation notification to user', {
        error: err.message,
        bookingId: newBooking.id,
        userId: customerUserId
      }));
    
    logger.booking('Push notification sent to user for booking creation', {
      bookingId: newBooking.id,
      userId: customerUserId
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

// @route   GET /api/bookings/unread-count
// @desc    Get unread booking updates count for the logged-in user
// @access  Private
router.get('/unread-count', auth, asyncHandler(async (req, res) => {
  const result = await getRows(
    `SELECT COUNT(*) as count 
     FROM bookings 
     WHERE user_id = $1 
       AND status IN ('accepted', 'cancelled', 'completed') 
       AND is_viewed_by_user = FALSE`,
    [req.user.id]
  );

  const unreadCount = parseInt(result[0]?.count || 0);

  res.json({
    status: 'success',
    data: { unreadCount }
  });
}));

// @route   GET /api/bookings
// @desc    Get user's bookings
// @access  Private
router.get('/', auth, asyncHandler(async (req, res) => {
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
router.get('/:id', auth, asyncHandler(async (req, res) => {
  const { id } = req.params;

  // PRODUCTION ROOT FIX: Use stored provider details as primary source, JOIN as fallback
  // This ensures provider information persists even after service/account deletion
  const booking = await getRow(`
      SELECT 
        b.*,
        COALESCE(b.provider_name, u.full_name, 'Provider') as provider_name,
        COALESCE(b.provider_phone, u.phone, '') as provider_phone,
        COALESCE(b.provider_profile_pic_url, u.profile_pic_url) as provider_profile_pic_url,
        COALESCE(sm.name, b.selected_service, 'Service') as service_name,
        ps.working_proof_urls
      FROM bookings b
      LEFT JOIN provider_services ps ON b.provider_service_id = ps.id
      LEFT JOIN provider_profiles pp ON ps.provider_id = pp.id
      LEFT JOIN users u ON pp.user_id = u.id
      LEFT JOIN services_master sm ON ps.service_id = sm.id
      WHERE b.id = $1 AND b.user_id = $2
    `, [id, req.user.id]);

  if (!booking) {
    throw new NotFoundError('Booking not found');
  }

  // Mark booking as viewed when user opens it
  // Only mark as viewed if status is one of the tracked statuses (accepted, cancelled, completed)
  if (booking.status && ['accepted', 'cancelled', 'completed'].includes(booking.status)) {
    await query(
      `UPDATE bookings SET is_viewed_by_user = TRUE WHERE id = $1 AND user_id = $2`,
      [id, req.user.id]
    );
    
    // Emit socket event to update unread count in real-time
    getIO().to(req.user.id).emit('booking_viewed', { bookingId: id });
  }

  // PRODUCTION FIX: Get rating if exists - ensure it belongs to this specific booking
  // Add explicit validation to prevent rating from other bookings being returned
  // PRODUCTION ROOT FIX: Fetch user's rating for this booking (not provider's rating)
  // This ensures users see their own rating, not the provider's rating of them
  const rating = await getRow(`
    SELECT r.* 
    FROM ratings r
    WHERE r.booking_id = $1 AND r.rater_type = 'user'
    LIMIT 1
  `, [id]);

  // PRODUCTION FIX: Validate rating belongs to this booking (defensive check)
  const validatedRating = rating && rating.booking_id === id ? rating : null;

  res.json({
    status: 'success',
    data: {
      booking: {
        ...booking,
        rating: validatedRating || null
      }
    }
  });
}));

// @route   PUT /api/bookings/mark-all-viewed
// @desc    Mark all unread bookings as viewed (when user opens bookings tab)
// @access  Private
router.put('/mark-all-viewed', auth, asyncHandler(async (req, res) => {
  // Optimized: Check if there are any unread bookings first (avoid unnecessary UPDATE)
  const unreadCheck = await getRow(
    `SELECT COUNT(*) as count 
     FROM bookings 
     WHERE user_id = $1 
       AND status IN ('accepted', 'cancelled', 'completed') 
       AND is_viewed_by_user = FALSE`,
    [req.user.id]
  );

  const unreadCount = parseInt(unreadCheck?.count || 0);

  // If no unread bookings, return early (optimization)
  if (unreadCount === 0) {
    return res.json({
      status: 'success',
      message: 'All bookings already viewed',
      data: { updatedCount: 0 }
    });
  }

  // Mark all unread bookings with tracked statuses as viewed
  const result = await query(
    `UPDATE bookings 
     SET is_viewed_by_user = TRUE 
     WHERE user_id = $1 
       AND status IN ('accepted', 'cancelled', 'completed') 
       AND is_viewed_by_user = FALSE`,
    [req.user.id]
  );

  // Emit socket event to update unread count in real-time
  getIO().to(req.user.id).emit('booking_unread_count_update');

  res.json({
    status: 'success',
    message: 'All bookings marked as viewed',
    data: { updatedCount: result.rowCount || 0 }
  });
}));

// @route   PUT /api/bookings/:id/cancel
// @desc    Cancel booking
// @access  Private
router.put('/:id/cancel', auth, [
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

  // Mark booking as unread when cancelled (user cancelled their own booking)
  // This allows user to see their cancelled booking in the unread count
  updateFields.push(`is_viewed_by_user = FALSE`);
  
  // Also mark as unread for provider (cancellation notification)
  updateFields.push(`is_viewed_by_provider = FALSE`);

  updateValues.push(id);
  const result = await query(`
      UPDATE bookings 
      SET ${updateFields.join(', ')}, updated_at = NOW()
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
    
    // Emit booking_unread_count_update event to provider for real-time badge update
    // This triggers the frontend to refresh the unread count when booking is cancelled
    getIO().to(providerService.provider_user_id).emit('booking_unread_count_update');
  }
  
  // Emit booking_unread_count_update event to user for real-time badge update
  // This triggers the frontend to refresh the unread count when user cancels their booking
  getIO().to(req.user.id).emit('booking_unread_count_update');

  // Get booking details for notifications (use LEFT JOIN to handle deleted services)
  const bookingDetails = await getRow(`
      SELECT b.*, COALESCE(sm.name, b.selected_service, 'Service') as service_name
      FROM bookings b
      LEFT JOIN provider_services ps ON b.provider_service_id = ps.id
      LEFT JOIN services_master sm ON ps.service_id = sm.id
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
router.post('/:id/rate', auth, [
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

  // PRODUCTION ROOT FIX: Check if user has already rated this booking
  // Use rater_type to distinguish user ratings from provider ratings
  // This allows both user and provider to rate the same booking separately
  const existingRating = await getRow(`
    SELECT r.* 
    FROM ratings r
    WHERE r.booking_id = $1 AND r.rater_type = 'user'
    LIMIT 1
  `, [id]);
  
  if (existingRating) {
    // PRODUCTION FIX: Double-check that rating belongs to this booking and is user type
    if (existingRating.booking_id !== id || existingRating.rater_type !== 'user') {
      logger.error('Rating data mismatch detected', {
        ratingId: existingRating.id,
        expectedBookingId: id,
        actualBookingId: existingRating.booking_id,
        expectedRaterType: 'user',
        actualRaterType: existingRating.rater_type,
        userId: req.user.id
      });
      throw new ValidationError('Rating data inconsistency detected. Please contact support.');
    }
    
    logger.warn('User already rated this booking', {
      bookingId: id,
      ratingId: existingRating.id,
      userId: req.user.id,
      existingRating: existingRating.rating
    });
    throw new ValidationError('You have already rated this booking. Each booking can only be rated once.');
  }

  // PRODUCTION ROOT FIX: Use transaction to ensure atomic rating creation
  // This prevents race conditions where multiple ratings might be created for the same booking
  const { withTransaction } = require('../database/connection');
  const ratingResult = await withTransaction(async (client) => {
    // PRODUCTION ROOT FIX: Re-check rating existence within transaction (prevent race condition)
    // Check only for user ratings (rater_type = 'user')
    const recheckRating = await client.query(`
      SELECT r.* 
      FROM ratings r
      WHERE r.booking_id = $1 AND r.rater_type = 'user'
      FOR UPDATE
      LIMIT 1
    `, [id]);
    
    if (recheckRating.rows.length > 0) {
      const existing = recheckRating.rows[0];
      if (existing.booking_id === id && existing.rater_type === 'user') {
        throw new ValidationError('You have already rated this booking. Each booking can only be rated once.');
      }
    }
    
    // PRODUCTION ROOT FIX: Create rating with rater_type = 'user'
    // This allows both user and provider to rate the same booking separately
    const result = await client.query(`
      INSERT INTO ratings (booking_id, rating, review, rater_type, created_at)
      VALUES ($1, $2, $3, 'user', NOW())
      RETURNING *
    `, [id, rating, review || null]);
    
    return result.rows[0];
  }, { name: 'rating-creation', retries: 1 });

  const newRating = ratingResult;

  // PRODUCTION FIX: Validate that the created rating belongs to the correct booking
  if (newRating.booking_id !== id) {
    logger.error('CRITICAL: Created rating has wrong booking_id', {
      ratingId: newRating.id,
      expectedBookingId: id,
      actualBookingId: newRating.booking_id,
      userId: req.user.id
    });
    throw new ValidationError('Rating creation error. Please try again.');
  }

  // Fetch provider user_id and service_name (use LEFT JOIN to handle deleted services)
  const ratingBooking = await getRow(`
      SELECT ps.provider_id, COALESCE(sm.name, b.selected_service, 'Service') as service_name, ps.id as provider_service_id
      FROM bookings b
      LEFT JOIN provider_services ps ON b.provider_service_id = ps.id
      LEFT JOIN services_master sm ON ps.service_id = sm.id
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
router.post('/:id/report', auth, [
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
