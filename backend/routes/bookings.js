const express = require('express');
const { body, validationResult } = require('express-validator');
const { query, getRow, getRows } = require('../database/connection');
const { auth, requireRole } = require('../middleware/auth');
const { formatNotificationTimestamp } = require('../utils/timezone');
const { sendNotification, sendAutoNotification } = require('../utils/notifications');
const { emitEarningsUpdate } = require('../utils/earnings');
const { pushNotificationService, NotificationTemplates } = require('../utils/pushNotifications');
const getIO = () => require('../server').io;

const router = express.Router();

// All routes require authentication
router.use(auth);

// @route   POST /api/bookings
// @desc    Create a new booking
// @access  Private
router.post('/', [
  body('providerServiceId').isUUID().withMessage('Valid provider service ID is required'),
  body('selectedService').notEmpty().withMessage('Selected service is required'),
  body('appointmentDate').isDate().withMessage('Valid appointment date is required'),
  body('appointmentTime').notEmpty().withMessage('Appointment time is required')
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
      return res.status(404).json({
        status: 'error',
        message: 'Provider service not found or inactive'
      });
    }

    // Check if appointment date is in the future
    console.log('DEBUG appointmentDate:', appointmentDate);
    console.log('DEBUG appointmentTime:', appointmentTime);
    const appointmentDateTime = new Date(`${appointmentDate} ${appointmentTime}`);
    console.log('DEBUG appointmentDateTime:', appointmentDateTime.toString());
    console.log('DEBUG server now:', new Date().toString());
    if (appointmentDateTime <= new Date()) {
      return res.status(400).json({
        status: 'error',
        message: 'Appointment date and time must be in the future'
      });
    }

    // Create booking
    const result = await query(`
      INSERT INTO bookings (user_id, provider_service_id, selected_service, appointment_date, appointment_time)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [req.user.id, providerServiceId, selectedService, appointmentDate, appointmentTime]);

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
      console.log('📱 Push notification sent to provider for new booking');
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
        console.error('Error formatting appointment date/time:', error);
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

  } catch (error) {
    console.error('Create booking error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/bookings
// @desc    Get user's bookings
// @access  Private
router.get('/', async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE b.user_id = $1';
    let queryParams = [req.user.id];
    let paramCount = 2;

    if (status) {
      whereClause += ` AND b.status = $${paramCount}`;
      queryParams.push(status);
      paramCount++;
    }

    const bookings = await getRows(`
      SELECT 
        b.*,
        u.full_name as provider_name,
        u.phone as provider_phone,
        u.profile_pic_url as provider_profile_pic_url,
        sm.name as service_name,
        ps.service_charge_value,
        ps.service_charge_unit,
        r.rating as rating_value,
        r.review as rating_review,
        r.created_at as rating_created_at
      FROM bookings b
      JOIN provider_services ps ON b.provider_service_id = ps.id
      JOIN provider_profiles pp ON ps.provider_id = pp.id
      JOIN users u ON pp.user_id = u.id
      JOIN services_master sm ON ps.service_id = sm.id
      LEFT JOIN ratings r ON r.booking_id = b.id
      ${whereClause}
      ORDER BY b.created_at DESC
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `, [...queryParams, limit, offset]);

    // Map bookings to include a nested rating object if exists
    const mappedBookings = bookings.map(b => ({
      ...b,
      rating: b.rating_value !== null ? {
        rating: b.rating_value,
        review: b.rating_review,
        created_at: b.rating_created_at
      } : null
    }));

    // Get total count
    const countResult = await getRow(`
      SELECT COUNT(*) as total
      FROM bookings b
      ${whereClause}
    `, queryParams);

    const total = parseInt(countResult.total);
    const totalPages = Math.ceil(total / limit);

    res.json({
      status: 'success',
      data: {
        bookings: mappedBookings,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          total,
          limit: parseInt(limit)
        }
      }
    });

  } catch (error) {
    console.error('Get bookings error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/bookings/:id
// @desc    Get booking details
// @access  Private
router.get('/:id', async (req, res) => {
  try {
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
      return res.status(404).json({
        status: 'error',
        message: 'Booking not found'
      });
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

  } catch (error) {
    console.error('Get booking details error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

// @route   PUT /api/bookings/:id/cancel
// @desc    Cancel booking
// @access  Private
router.put('/:id/cancel', [
  body('cancellationReason').optional().notEmpty().withMessage('Cancellation reason cannot be empty')
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

    const { id } = req.params;
    const { cancellationReason } = req.body;

    // Check if booking belongs to user
    const booking = await getRow('SELECT * FROM bookings WHERE id = $1 AND user_id = $2', [id, req.user.id]);
    if (!booking) {
      return res.status(404).json({
        status: 'error',
        message: 'Booking not found'
      });
    }

    // Check if booking can be cancelled
    if (['completed', 'cancelled', 'confirmed', 'accepted'].includes(booking.status)) {
      return res.status(400).json({
        status: 'error',
        message: 'Cannot cancel completed, confirmed, accepted, or already cancelled booking'
      });
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
      console.log('📱 Push notification sent to user for booking cancellation');
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
        console.log('📱 Push notification sent to provider for booking cancellation');
      }

      // Emit earnings update to provider when booking is cancelled
      await emitEarningsUpdate(providerService.provider_user_id);
    }

    res.json({
      status: 'success',
      message: 'Booking cancelled successfully',
      data: { booking: updatedBooking }
    });

  } catch (error) {
    console.error('Cancel booking error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/bookings/:id/rate
// @desc    Rate a completed booking
// @access  Private
router.post('/:id/rate', [
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
  body('review').optional().isLength({ max: 500 }).withMessage('Review must be less than 500 characters')
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

    const { id } = req.params;
    const { rating, review } = req.body;

    // Check if booking belongs to user and is completed
    const booking = await getRow('SELECT * FROM bookings WHERE id = $1 AND user_id = $2', [id, req.user.id]);
    if (!booking) {
      return res.status(404).json({
        status: 'error',
        message: 'Booking not found'
      });
    }

    if (booking.status !== 'completed') {
      return res.status(400).json({
        status: 'error',
        message: 'Can only rate completed bookings'
      });
    }

    // Check if already rated
    const existingRating = await getRow('SELECT * FROM ratings WHERE booking_id = $1', [id]);
    if (existingRating) {
      return res.status(400).json({
        status: 'error',
        message: 'Booking already rated'
      });
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

  } catch (error) {
    console.error('Rate booking error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/bookings/:id/report
// @desc    Report a booking
// @access  Private
router.post('/:id/report', [
  body('reportReason').notEmpty().withMessage('Report reason is required'),
  body('reportDescription').notEmpty().withMessage('Report description is required')
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

    const { id } = req.params;
    const { reportReason, reportDescription } = req.body;

    // Check if booking belongs to user
    const booking = await getRow('SELECT * FROM bookings WHERE id = $1 AND user_id = $2', [id, req.user.id]);
    if (!booking) {
      return res.status(404).json({
        status: 'error',
        message: 'Booking not found'
      });
    }

    // Check if booking has already been reported
    if (booking.report_reason) {
      return res.status(400).json({
        status: 'error',
        message: 'This booking has already been reported'
      });
    }

    // Update booking with report
    const result = await query(`
      UPDATE bookings 
      SET report_reason = $1, report_description = $2
      WHERE id = $3
      RETURNING *
    `, [reportReason, reportDescription, id]);

    const updatedBooking = result.rows[0];

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

  } catch (error) {
    console.error('Report booking error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

module.exports = router;
