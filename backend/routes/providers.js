const express = require('express');
const { body, validationResult } = require('express-validator');
const { query, getRow, getRows } = require('../database/connection');
const { auth, requireRole } = require('../middleware/auth');
const { uploadImage } = require('../utils/cloudinary');
const { formatNotificationTimestamp } = require('../utils/timezone');
const { sendNotification, sendAutoNotification } = require('../utils/notifications');
const { emitEarningsUpdate } = require('../utils/earnings');
const { pushNotificationService, NotificationTemplates } = require('../utils/pushNotifications');
const DatabaseOptimizer = require('../utils/databaseOptimization');
const logger = require('../utils/logger');
const getIO = () => require('../server').io;
const { serviceRegistrationLimiter, profileUpdateLimiter, standardLimiter, searchLimiter } = require('../middleware/rateLimiting');
const { sanitizeBody, sanitizeQuery } = require('../middleware/inputSanitization');
const { asyncHandler } = require('../middleware/errorHandler');
const { NotFoundError, ValidationError, AuthorizationError } = require('../utils/errorTypes');
const { validateOrThrow, throwIfMissing } = require('../utils/errorHelpers');
const {
  validateUpdateProviderProfile
} = require('../middleware/validators');

const router = express.Router();

// PRODUCTION SECURITY: Admin routes must be defined BEFORE provider role middleware
// Admin routes override the provider role requirement

// Admin-only routes (must be before provider role middleware)
// @route   GET /api/providers/reports
// @desc    Get provider's reports (for admin)
// @access  Private (Admin only)
router.get('/reports', auth, requireRole(['admin']), asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, status } = req.query;
  const offset = (page - 1) * limit;

  let whereClause = '';
  let queryParams = [];
  let paramCount = 1;

  if (status) {
    whereClause = `WHERE pr.status = $${paramCount}`;
    queryParams.push(status);
    paramCount++;
  }

  const reports = await getRows(`
    SELECT 
      pr.*
    FROM provider_reports_users pr
    ${whereClause}
    ORDER BY pr.created_at DESC
    LIMIT $${paramCount} OFFSET $${paramCount + 1}
  `, [...queryParams, limit, offset]);

  // Get total count
  const countResult = await getRow(`
    SELECT COUNT(*) as total
    FROM provider_reports_users pr
    ${whereClause ? whereClause.replace(/\$\d+/g, (match, offset, string) => {
      const num = parseInt(match.substring(1));
      return `$${num}`;
    }) : ''}
  `, queryParams);

  const total = parseInt(countResult?.total || 0, 10);

  res.json({
    status: 'success',
    data: {
      reports,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalCount: total,
        limit: parseInt(limit)
      }
    }
  });
}));

// @route   PUT /api/providers/reports/:id/status
// @desc    Update report status (for admin)
// @access  Private (Admin only)
router.put('/reports/:id/status', [
  body('status').isIn(['open', 'resolved', 'closed']).withMessage('Invalid status')
], auth, requireRole(['admin']), asyncHandler(async (req, res) => {
  validateOrThrow(req);

  const { id } = req.params;
  const { status } = req.body;

  const report = await getRow(`
    SELECT * FROM provider_reports_users WHERE id = $1
  `, [id]);

  if (!report) {
    throw new NotFoundError('Report', id);
  }

  await query(`
    UPDATE provider_reports_users
    SET status = $1, updated_at = NOW()
    WHERE id = $2
  `, [status, id]);

  res.json({
    status: 'success',
    message: 'Report status updated successfully',
    data: {
      ...report,
      status
    }
  });
}));

// All other routes require authentication and provider role
router.use(auth);
router.use(requireRole(['provider']));

// Apply input sanitization to all routes
router.use(sanitizeBody());
router.use(sanitizeQuery());

// @route   GET /api/providers/profile
// @desc    Get provider profile
// @access  Private
router.get('/profile', asyncHandler(async (req, res) => {
  const profile = await getRow(`
    SELECT 
      pp.*,
      u.full_name,
      u.email,
      u.phone,
      u.profile_pic_url
    FROM provider_profiles pp
    JOIN users u ON pp.user_id = u.id
    WHERE pp.user_id = $1
  `, [req.user.id]);

  if (!profile) {
    throw new NotFoundError('Provider profile');
  }

  res.json({
    status: 'success',
    data: { profile }
  });
}));

// @route   PUT /api/providers/profile
// @desc    Update provider profile
// @access  Private
router.put('/profile', [profileUpdateLimiter, ...validateUpdateProviderProfile], asyncHandler(async (req, res) => {

  const {
    yearsOfExperience,
    serviceDescription,
    isEngineeringProvider,
    engineeringCertificateUrl
  } = req.body;

  const updateFields = [];
  const updateValues = [];
  let paramCount = 1;

  if (yearsOfExperience !== undefined) {
    updateFields.push(`years_of_experience = $${paramCount}`);
    updateValues.push(yearsOfExperience);
    paramCount++;
  }

  if (serviceDescription) {
    updateFields.push(`service_description = $${paramCount}`);
    updateValues.push(serviceDescription);
    paramCount++;
  }

  if (isEngineeringProvider !== undefined) {
    updateFields.push(`is_engineering_provider = $${paramCount}`);
    updateValues.push(isEngineeringProvider);
    paramCount++;
  }

  // Handle engineering certificate upload to Cloudinary
  if (engineeringCertificateUrl) {
    let cloudinaryUrl = engineeringCertificateUrl;
    
    // Check if it's a new image that needs to be uploaded (base64 or file URI)
    if (engineeringCertificateUrl.startsWith('data:image/') || engineeringCertificateUrl.startsWith('file://')) {
      logger.info('Uploading engineering certificate to Cloudinary');
      const uploadResult = await uploadImage(engineeringCertificateUrl, 'buildxpert/certificates');
      
      if (uploadResult.success) {
        cloudinaryUrl = uploadResult.url;
        logger.info('Successfully uploaded engineering certificate to Cloudinary');
      } else {
        logger.error('Failed to upload engineering certificate to Cloudinary', {
          error: uploadResult.error
        });
        throw new Error('Failed to upload engineering certificate');
      }
    }
    
    updateFields.push(`engineering_certificate_url = $${paramCount}`);
    updateValues.push(cloudinaryUrl);
    paramCount++;
  }

  if (updateFields.length === 0) {
    throw new ValidationError('No fields to update');
  }

  updateValues.push(req.user.id);
  const result = await query(`
    UPDATE provider_profiles 
    SET ${updateFields.join(', ')}
    WHERE user_id = $${paramCount}
    RETURNING *
  `, updateValues);

  const updatedProfile = result.rows[0];

  res.json({
    status: 'success',
    message: 'Provider profile updated successfully',
    data: { profile: updatedProfile }
  });
}));

// @route   GET /api/providers/services
// @desc    Get provider's registered services with pagination
// @access  Private
router.get('/services', asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;

  // Validate pagination
  if (isNaN(pageNum) || pageNum < 1) {
    throw new ValidationError('page must be a positive integer');
  }
  if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
    throw new ValidationError('limit must be a positive integer between 1 and 100');
  }

  // Get total count
  const countResult = await getRow(`
    SELECT COUNT(*) as total
    FROM provider_services ps
    JOIN provider_profiles pp ON ps.provider_id = pp.id
    WHERE pp.user_id = $1
  `, [req.user.id]);
  const total = parseInt(countResult?.total || 0, 10);
  const totalPages = Math.ceil(total / limitNum);

  // Get paginated services
  const services = await getRows(`
    SELECT 
      ps.*,
      sm.name as service_name,
      sm.is_paid
    FROM provider_services ps
    JOIN services_master sm ON ps.service_id = sm.id
    JOIN provider_profiles pp ON ps.provider_id = pp.id
    WHERE pp.user_id = $1
    ORDER BY ps.created_at DESC
    LIMIT $2 OFFSET $3
  `, [req.user.id, limitNum, offset]);

  res.json({
    status: 'success',
    data: { 
      services,
      pagination: {
        currentPage: pageNum,
        totalPages,
        total,
        limit: limitNum,
        hasMore: pageNum < totalPages
      }
    }
  });
}));

// @route   PUT /api/providers/services/:id
// @desc    Update provider service details
// @access  Private
router.put('/services/:id', [
  body('workingProofUrls').optional().isArray().withMessage('Working proof URLs must be an array')
], asyncHandler(async (req, res) => {
  validateOrThrow(req);

  const { id } = req.params;
  const { workingProofUrls } = req.body;

  // Check if service belongs to provider
  const existingService = await getRow(`
    SELECT ps.* FROM provider_services ps
    JOIN provider_profiles pp ON ps.provider_id = pp.id
    WHERE ps.id = $1 AND pp.user_id = $2
  `, [id, req.user.id]);

  if (!existingService) {
    throw new NotFoundError('Service', id);
  }

    const updateFields = [];
    const updateValues = [];
    let paramCount = 1;

    // Note: service_charge_value and service_charge_unit have been removed
    // Sub-services are now managed through the service registration endpoints

    // Handle working proof images upload to Cloudinary
    if (workingProofUrls !== undefined) {
      let cloudinaryUrls = [];
      
      if (workingProofUrls.length > 0) {
        // Check if the URLs are already Cloudinary URLs or need to be uploaded
        const needsUpload = workingProofUrls.some(url => 
          url.startsWith('file://') || url.startsWith('data:image/')
        );

        if (needsUpload) {
          logger.info('Uploading working proof images to Cloudinary', {
            count: workingProofUrls.length
          });
          const { uploadMultipleImages } = require('../utils/cloudinary');
          const uploadResult = await uploadMultipleImages(workingProofUrls, 'buildxpert/working-proofs');
          
          if (uploadResult.success) {
            cloudinaryUrls = uploadResult.urls;
            logger.info('Successfully uploaded images to Cloudinary', {
              count: cloudinaryUrls.length
            });
          } else {
            logger.error('Failed to upload images to Cloudinary', {
              errors: uploadResult.errors
            });
            throw new Error('Failed to upload working proof images');
          }
        } else {
          // URLs are already Cloudinary URLs
          cloudinaryUrls = workingProofUrls;
        }
      }
      
      updateFields.push(`working_proof_urls = $${paramCount}`);
      updateValues.push(cloudinaryUrls);
      paramCount++;
    }

    if (updateFields.length === 0) {
      throw new ValidationError('No fields to update');
    }

    updateValues.push(id);
    const result = await query(`
      UPDATE provider_services 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `, updateValues);

    const updatedService = result.rows[0];

    res.json({
      status: 'success',
      message: 'Service updated successfully',
      data: { service: updatedService }
    });
}));

// @route   DELETE /api/providers/services/:id
// @desc    Remove provider service
// @access  Private
router.delete('/services/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Check if service belongs to provider
  const existingService = await getRow(`
    SELECT ps.* FROM provider_services ps
    JOIN provider_profiles pp ON ps.provider_id = pp.id
    WHERE ps.id = $1 AND pp.user_id = $2
  `, [id, req.user.id]);

  if (!existingService) {
    throw new NotFoundError('Service', id);
  }

    // Delete images from Cloudinary if they exist
    if (existingService.working_proof_urls && existingService.working_proof_urls.length > 0) {
      logger.info('Deleting images from Cloudinary', {
        count: existingService.working_proof_urls.length
      });
      
      // Extract public IDs from Cloudinary URLs
      const publicIds = existingService.working_proof_urls
        .filter(url => {
          // Filter out invalid URLs
          if (!url || typeof url !== 'string') return false;
          return true;
        })
        .map(url => {
          // Extract public ID from Cloudinary URL
          // URL format: https://res.cloudinary.com/cloud_name/image/upload/v1234567890/folder/image_name.jpg
          try {
            const urlParts = url.split('/');
            const uploadIndex = urlParts.indexOf('upload');
            if (uploadIndex !== -1 && uploadIndex + 2 < urlParts.length) {
              // Skip version number and get folder + filename
              const folderAndFile = urlParts.slice(uploadIndex + 2).join('/');
              // Remove file extension
              return folderAndFile.replace(/\.[^/.]+$/, '');
            }
          } catch (error) {
            logger.warn('Failed to extract public ID from URL', { url: url.substring(0, 100), error: error.message });
          }
          return null;
        })
        .filter(Boolean);

      if (publicIds.length > 0) {
        const { deleteMultipleImages } = require('../utils/cloudinary');
        const deleteResult = await deleteMultipleImages(publicIds);
        // Treat deletion as successful even if some images were already deleted (not found)
        // Only log errors for actual failures, not for "already deleted" cases
        if (deleteResult.deleted > 0 || deleteResult.alreadyDeleted > 0) {
          logger.info('Successfully processed image deletions', {
            deleted: deleteResult.deleted,
            alreadyDeleted: deleteResult.alreadyDeleted || 0,
            failed: deleteResult.failed
          });
        }
        // Only log as warning if there were actual failures (not "not found" cases)
        if (deleteResult.failed > 0 && deleteResult.errors && deleteResult.errors.length > 0) {
          const actualErrors = deleteResult.errors.filter(err => err && !err.includes('not found'));
          if (actualErrors.length > 0) {
            logger.warn('Some images failed to delete from Cloudinary', {
              failed: deleteResult.failed,
              errors: actualErrors
            });
          }
        }
      } else {
        logger.info('No valid Cloudinary URLs to delete');
      }
    }

  // Check for existing ACTIVE bookings referencing this provider service
  // Only prevent deletion if there are pending or accepted bookings
  // Cancelled, rejected, and completed bookings should not prevent deletion
  const bookingCount = await getRow(
      `SELECT COUNT(*) as count 
       FROM bookings 
       WHERE provider_service_id = $1 
         AND status IN ('pending', 'accepted')`,
      [id]
    );
  if (parseInt(bookingCount.count) > 0) {
    throw new ValidationError('Cannot delete service registration: there are active bookings (pending or accepted) for this service. Please wait for these bookings to be completed or cancelled before deleting the service.');
  }

  await query('DELETE FROM provider_services WHERE id = $1', [id]);

  res.json({
    status: 'success',
    message: 'Service removed successfully'
  });
}));

// @route   GET /api/providers/bookings/unread-count
// @desc    Get unread booking updates count for the logged-in provider
// @access  Private
router.get('/bookings/unread-count', auth, asyncHandler(async (req, res) => {
  // Get provider's profile ID
  const providerProfile = await getRow(
    'SELECT id FROM provider_profiles WHERE user_id = $1',
    [req.user.id]
  );

  if (!providerProfile) {
    return res.json({
      status: 'success',
      data: { unreadCount: 0 }
    });
  }

  // Count unread bookings (pending or cancelled) for this provider
  // PRODUCTION ROOT FIX: Use b.provider_id instead of JOIN with provider_services
  // This ensures stats remain accurate even after service deletion
  const result = await getRows(
    `SELECT COUNT(*) as count 
     FROM bookings b
     WHERE b.provider_id = $1 
       AND b.status IN ('pending', 'cancelled') 
       AND b.is_viewed_by_provider = FALSE`,
    [providerProfile.id]
  );

  const unreadCount = parseInt(result[0]?.count || 0);

  res.json({
    status: 'success',
    data: { unreadCount }
  });
}));

// @route   GET /api/providers/bookings
// @desc    Get provider's bookings
// @access  Private
router.get('/bookings', asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 10 } = req.query;

  // Use optimized database query
  const result = await DatabaseOptimizer.getBookingsWithDetails(req.user.id, {
    status,
    page: parseInt(page),
    limit: parseInt(limit),
    userType: 'provider'
  });

  res.json({
    status: 'success',
    data: {
      bookings: result.bookings,
      pagination: result.pagination
    }
  });
}));

// @route   PUT /api/providers/bookings/mark-all-viewed
// @desc    Mark all unread bookings as viewed (when provider opens bookings tab)
// @access  Private
router.put('/bookings/mark-all-viewed', auth, asyncHandler(async (req, res) => {
  // Get provider's profile ID
  const providerProfile = await getRow(
    'SELECT id FROM provider_profiles WHERE user_id = $1',
    [req.user.id]
  );

  if (!providerProfile) {
    return res.json({
      status: 'success',
      message: 'Provider profile not found',
      data: { updatedCount: 0 }
    });
  }

  // Optimized: Check if there are any unread bookings first (avoid unnecessary UPDATE)
  const unreadCheck = await getRow(
    `SELECT COUNT(*) as count 
     FROM bookings b
     JOIN provider_services ps ON b.provider_service_id = ps.id
     WHERE ps.provider_id = $1 
       AND b.status IN ('pending', 'cancelled') 
       AND b.is_viewed_by_provider = FALSE`,
    [providerProfile.id]
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
  // PRODUCTION ROOT FIX: Use b.provider_id instead of JOIN with provider_services
  // This ensures updates work even after service deletion
  const result = await query(
    `UPDATE bookings 
     SET is_viewed_by_provider = TRUE 
     WHERE bookings.provider_id = $1
       AND bookings.status IN ('pending', 'cancelled') 
       AND bookings.is_viewed_by_provider = FALSE`,
    [providerProfile.id]
  );

  // Emit socket event to update unread count in real-time
  getIO().to(req.user.id).emit('booking_unread_count_update');

  res.json({
    status: 'success',
    message: 'All bookings marked as viewed',
    data: { updatedCount: result.rowCount || 0 }
  });
}));

// @route   PUT /api/providers/bookings/:id/status
// @desc    Update booking status (accept/reject/complete)
// @access  Private
router.put('/bookings/:id/status', [
  body('status').isIn(['accepted', 'rejected', 'completed']).withMessage('Status must be accepted, rejected, or completed'),
  body('rejectionReason').optional().notEmpty().withMessage('Rejection reason is required when rejecting')
], asyncHandler(async (req, res) => {
  validateOrThrow(req);

  const { id } = req.params;
  const { status, rejectionReason } = req.body;

  // Check if booking belongs to provider
  // PRODUCTION ROOT FIX: Use b.provider_id instead of JOIN with provider_services
  // This ensures bookings remain accessible even after service deletion
  const providerProfile = await getRow('SELECT id FROM provider_profiles WHERE user_id = $1', [req.user.id]);
  if (!providerProfile) {
    throw new NotFoundError('Provider profile');
  }
  
  const booking = await getRow(`
    SELECT b.* FROM bookings b
    WHERE b.id = $1 AND b.provider_id = $2
  `, [id, providerProfile.id]);

  if (!booking) {
    throw new NotFoundError('Booking', id);
  }

  // Validate status transition
  if (booking.status === 'completed' && status !== 'completed') {
    throw new ValidationError('Cannot change status of completed booking');
  }

  if (booking.status === 'cancelled') {
    throw new ValidationError('Cannot change status of cancelled booking');
  }

  // Update booking status
  const updateFields = [`status = $1`];
  const updateValues = [status];
  let paramCount = 2;

  if (status === 'rejected' && rejectionReason) {
    updateFields.push(`rejection_reason = $${paramCount}`);
    updateValues.push(rejectionReason);
    paramCount++;
  }

  // Always update updated_at when status changes
  updateFields.push(`updated_at = NOW()`);
  
  // Mark booking as unread when status changes to accepted, cancelled, or completed
  // This triggers the unread badge for the user
  if (['accepted', 'cancelled', 'completed'].includes(status)) {
    updateFields.push(`is_viewed_by_user = FALSE`);
  }
  
  updateValues.push(id);
  const result = await query(`
    UPDATE bookings 
    SET ${updateFields.join(', ')}
    WHERE id = $${paramCount}
    RETURNING *
  `, updateValues);

  const updatedBooking = result.rows[0];

  // Fetch user_id and service_name for notification (async - don't block response)
  setImmediate(async () => {
    try {
      const bookingDetails = await getRow(`
        SELECT b.user_id, COALESCE(sm.name, b.selected_service, 'Service') as service_name, b.appointment_date, b.appointment_time
        FROM bookings b
        LEFT JOIN provider_services ps ON b.provider_service_id = ps.id
        LEFT JOIN services_master sm ON ps.service_id = sm.id
        WHERE b.id = $1
      `, [id]);
      
      if (!bookingDetails) return;
      
      // Import time formatting utility
      const { formatAppointmentTime, formatDate } = require('../utils/timezone');
      
      // Format appointment date and time for display
      const formattedDate = bookingDetails.appointment_date 
        ? formatDate(new Date(bookingDetails.appointment_date)) 
        : bookingDetails.appointment_date;
      const formattedTime = formatAppointmentTime(bookingDetails.appointment_time);
      const timeDisplay = formattedTime ? ` at ${formattedTime}` : '';
      
      if (status === 'accepted') {
        // Send in-app notification (async)
        sendNotification(
          bookingDetails.user_id,
          'Booking Accepted',
          `Your booking for ${bookingDetails.service_name} on ${formattedDate}${timeDisplay} has been accepted.`,
          'user'
        ).catch(err => logger.error('Failed to send acceptance notification', { error: err.message }));

        // Send push notification (async)
        const pushNotification = {
          ...NotificationTemplates.BOOKING_CONFIRMED,
          body: `Your ${bookingDetails.service_name} booking has been confirmed for ${formattedDate}${timeDisplay}`,
          data: {
            type: 'booking_confirmed',
            bookingId: id,
            screen: 'bookings',
            scheduledDate: formattedDate + (timeDisplay || ''),
            appointmentDate: bookingDetails.appointment_date,
            appointmentTime: bookingDetails.appointment_time
          }
        };
        pushNotificationService.sendToUser(bookingDetails.user_id, pushNotification)
          .catch(err => logger.error('Failed to send push notification', { error: err.message }));

      } else if (status === 'rejected') {
        // Send in-app notification (async)
        sendNotification(
          bookingDetails.user_id,
          'Booking Rejected',
          `Your booking for ${bookingDetails.service_name} on ${formattedDate}${timeDisplay} was rejected.`,
          'user'
        ).catch(err => logger.error('Failed to send rejection notification', { error: err.message }));

        // Send push notification (async)
        const pushNotification = {
          ...NotificationTemplates.BOOKING_CANCELLED,
          title: '❌ Booking Rejected',
          body: `Your ${bookingDetails.service_name} booking was rejected by the provider`,
          data: {
            type: 'booking_rejected',
            bookingId: id,
            screen: 'bookings'
          }
        };
        pushNotificationService.sendToUser(bookingDetails.user_id, pushNotification)
          .catch(err => logger.error('Failed to send push notification', { error: err.message }));

      } else if (status === 'completed') {
        // Send in-app notification (async)
        sendNotification(
          bookingDetails.user_id,
          'Booking Completed',
          `Your booking for ${bookingDetails.service_name} on ${formattedDate}${timeDisplay} has been marked as completed. Please rate your experience.`,
          'user'
        ).catch(err => logger.error('Failed to send completion notification', { error: err.message }));

        // Send push notification (async)
        const pushNotification = {
          ...NotificationTemplates.SERVICE_COMPLETED,
          body: `Your ${bookingDetails.service_name} service is complete! Please rate your experience.`,
          data: {
            type: 'service_completed',
            bookingId: id,
            screen: 'bookings'
          }
        };
        pushNotificationService.sendToUser(bookingDetails.user_id, pushNotification)
          .catch(err => logger.error('Failed to send push notification', { error: err.message }));
      }

      // Emit real-time events (non-blocking)
      getIO().to(bookingDetails.user_id).emit('booking_updated', {
        booking: updatedBooking
      });
      getIO().to(req.user.id).emit('booking_updated', {
        booking: updatedBooking
      });
      
      // Emit booking_unread_count_update event to user for real-time badge update
      if (['accepted', 'cancelled', 'completed'].includes(status)) {
        getIO().to(bookingDetails.user_id).emit('booking_unread_count_update');
      }
      
      // When provider accepts/rejects/completes a booking, mark it as viewed for provider
      query(
        `UPDATE bookings SET is_viewed_by_provider = TRUE WHERE id = $1`,
        [id]
      ).catch(err => logger.error('Failed to mark booking as viewed', { error: err.message }));
      
      // Emit booking_unread_count_update event to provider for real-time badge update
      getIO().to(req.user.id).emit('booking_unread_count_update');

      // Emit earnings update to provider when booking is completed (async)
      if (status === 'completed') {
        emitEarningsUpdate(req.user.id).catch(err => logger.error('Failed to emit earnings update', { error: err.message }));
        
        // Invalidate earnings cache when booking is completed (async)
        getRow('SELECT id FROM provider_profiles WHERE user_id = $1', [req.user.id])
          .then(providerProfile => {
            if (providerProfile) {
              const caches = require('../utils/cache');
              const CacheKeys = require('../utils/cacheKeys');
              caches.user.delete(CacheKeys.earnings(providerProfile.id));
            }
          })
          .catch(err => logger.error('Failed to invalidate earnings cache', { error: err.message }));
      }
      
      // Invalidate user cache for both user and provider when booking status changes (async)
      const { invalidateUserCache } = require('../utils/cache');
      invalidateUserCache(bookingDetails.user_id);
      invalidateUserCache(req.user.id);
    } catch (err) {
      logger.error('Error in async booking status update', { error: err.message, bookingId: id });
    }
  });

  res.json({
    status: 'success',
    message: `Booking ${status} successfully`,
    data: { booking: updatedBooking }
  });
}));

// @route   POST /api/providers/bookings/:id/rate-customer
// @desc    Rate a customer (for providers)
// @access  Private (Provider only)
router.post('/bookings/:id/rate-customer', [
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
  body('review').optional().isLength({ max: 500 }).withMessage('Review must be less than 500 characters')
], asyncHandler(async (req, res) => {
  validateOrThrow(req);

  const { id } = req.params;
  const { rating, review } = req.body;

  throwIfMissing({ rating }, 'Rating is required');

  // Check if booking belongs to provider
  const booking = await getRow(`
    SELECT b.*, b.user_id as customer_user_id
    FROM bookings b
    JOIN provider_services ps ON b.provider_service_id = ps.id
    JOIN provider_profiles pp ON ps.provider_id = pp.id
    WHERE b.id = $1 AND pp.user_id = $2
  `, [id, req.user.id]);

  if (!booking) {
    throw new NotFoundError('Booking not found');
  }

  // PRODUCTION ROOT FIX: Check if provider has already rated this customer for this booking
  // Use rater_type to distinguish provider ratings from user ratings
  const existingRating = await getRow(`
    SELECT * FROM ratings 
    WHERE booking_id = $1 AND rater_type = 'provider'
  `, [id]);
  if (existingRating) {
    throw new ValidationError('You have already rated this customer for this booking');
  }

  // PRODUCTION ROOT FIX: Create rating with rater_type = 'provider'
  // This allows both provider and user to rate the same booking separately
  const result = await query(`
    INSERT INTO ratings (booking_id, rating, review, rater_type, created_at)
    VALUES ($1, $2, $3, 'provider', NOW())
    RETURNING *
  `, [id, rating, review || null]);

  const newRating = result.rows[0];

  // Get service name for notification (async - don't block response)
  setImmediate(async () => {
    try {
      const ratingBooking = await getRow(`
        SELECT COALESCE(sm.name, b.selected_service, 'Service') as service_name
        FROM bookings b
        LEFT JOIN provider_services ps ON b.provider_service_id = ps.id
        LEFT JOIN services_master sm ON ps.service_id = sm.id
        WHERE b.id = $1
      `, [id]);
      
      if (ratingBooking && booking.customer_user_id) {
        // Notify customer about the rating (async - non-blocking)
        await sendNotification(
          booking.customer_user_id,
          'New Rating',
          `You received a ${rating} star rating for ${ratingBooking.service_name}`,
          'user'
        ).catch(err => logger.error('Failed to send rating notification', { error: err.message }));
      }
    } catch (err) {
      logger.error('Error in rating notification', { error: err.message });
    }
  });

  res.status(201).json({
    status: 'success',
    message: 'Rating submitted successfully',
    data: { rating: newRating }
  });
}));

// @route   POST /api/providers/report-customer
// @desc    Report a customer (for providers)
// @access  Private (Providers only)
router.post('/report-customer', [
  require('../middleware/rateLimiting').reportLimiter,
  body('customerName').notEmpty().withMessage('Customer name is required'),
  body('incidentDate').notEmpty().withMessage('Incident date is required'),
  body('incidentType').notEmpty().withMessage('Incident type is required'),
  body('description').notEmpty().withMessage('Description is required')
], asyncHandler(async (req, res) => {
  logger.info('Report customer request received', {
    user: req.user.id,
    body: req.body
  });

  validateOrThrow(req);

  const { 
    customerName, 
    incidentDate, 
    incidentTime, 
    incidentType, 
    description, 
    evidence = [] 
  } = req.body;

  logger.info('Processing report data', {
    customerName,
    incidentDate,
    incidentTime,
    incidentType,
    description,
    evidenceCount: evidence.length
  });

  // Check if provider profile exists
  const providerProfile = await getRow('SELECT id FROM provider_profiles WHERE user_id = $1', [req.user.id]);
  if (!providerProfile) {
    throw new NotFoundError('Provider profile');
  }

  logger.info('Provider profile found', { profileId: providerProfile.id });

  // Try to find the user ID based on customer name (optional)
  let customerUserId = null;
  try {
    const customerUser = await getRow(
      'SELECT id FROM users WHERE full_name ILIKE $1 AND role = $2 LIMIT 1',
      [customerName, 'user']
    );
    if (customerUser) {
      customerUserId = customerUser.id;
    }
  } catch (err) {
    // Ignore if user not found - we'll just store the name
    logger.info('Customer user not found by name', { customerName });
  }

  // Create the report in the new table
  const result = await query(`
    INSERT INTO provider_reports_users (
      provider_id,
      customer_name,
      customer_user_id,
      incident_date,
      incident_time,
      incident_type,
      description,
      evidence,
      status,
      created_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, 'open', NOW()
    ) RETURNING *
  `, [
    req.user.id,
    customerName,
    customerUserId,
    incidentDate,
    incidentTime || null,
    incidentType,
    description,
    JSON.stringify(evidence)
  ]);

  const newReport = result.rows[0];
  logger.info('Report created successfully', { reportId: newReport.id });

  // Notify the provider that their report was submitted
  try {
    const providerNotification = await sendNotification(
      req.user.id,
      'Report Submitted',
      `Your customer report has been submitted successfully. Our team will review it and take appropriate action.`,
      'provider'
    );
    logger.info('Report notification sent', { notificationId: providerNotification.id });
  } catch (notificationError) {
    logger.error('Failed to send report notification', {
      error: notificationError.message
    });
    // Don't fail the request if notification fails
  }

  res.status(201).json({
    status: 'success',
    message: 'Customer report submitted successfully',
    data: { report: newReport }
  });
}));

// @route   GET /api/providers/my-reports
// @desc    Get provider's own reports
// @access  Private (Providers only)
router.get('/my-reports', asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, status } = req.query;
  const offset = (page - 1) * limit;

  let whereClause = 'WHERE pr.provider_id = $1';
  let queryParams = [req.user.id];
  let paramCount = 2;

  if (status) {
    whereClause += ` AND pr.status = $${paramCount}`;
    queryParams.push(status);
    paramCount++;
  }

  const reports = await getRows(`
    SELECT 
      pr.*
    FROM provider_reports_users pr
    ${whereClause}
    ORDER BY pr.created_at DESC
    LIMIT $${paramCount} OFFSET $${paramCount + 1}
  `, [...queryParams, limit, offset]);

  // Get total count
  const countResult = await getRow(`
    SELECT COUNT(*) as total
    FROM provider_reports_users pr
    WHERE pr.provider_id = $1
    ${status ? 'AND pr.status = $2' : ''}
  `, status ? [req.user.id, status] : [req.user.id]);

  const total = parseInt(countResult.total);
  const totalPages = Math.ceil(total / limit);

  res.json({
    status: 'success',
    data: {
      reports,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        total,
        limit: parseInt(limit)
      }
    }
  });
}));

module.exports = router; 