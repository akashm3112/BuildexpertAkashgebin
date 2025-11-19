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

const router = express.Router();

// All routes require authentication and provider role
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
router.put('/profile', [
  profileUpdateLimiter,
  body('yearsOfExperience').optional().isInt({ min: 0 }).withMessage('Years of experience must be a positive number'),
  body('serviceDescription').optional().notEmpty().withMessage('Service description cannot be empty'),
  body('isEngineeringProvider').optional().isBoolean().withMessage('isEngineeringProvider must be a boolean'),
  body('engineeringCertificateUrl').optional().isString().withMessage('Engineering certificate URL must be a string')
], asyncHandler(async (req, res) => {
  validateOrThrow(req);

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
  body('serviceChargeValue').optional().isFloat({ min: 0 }).withMessage('Service charge must be a positive number'),
  body('serviceChargeUnit').optional().notEmpty().withMessage('Service charge unit cannot be empty'),
  body('workingProofUrls').optional().isArray().withMessage('Working proof URLs must be an array')
], asyncHandler(async (req, res) => {
  validateOrThrow(req);

  const { id } = req.params;
  const { serviceChargeValue, serviceChargeUnit, workingProofUrls } = req.body;

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

    if (serviceChargeValue !== undefined) {
      updateFields.push(`service_charge_value = $${paramCount}`);
      updateValues.push(serviceChargeValue);
      paramCount++;
    }

    if (serviceChargeUnit) {
      updateFields.push(`service_charge_unit = $${paramCount}`);
      updateValues.push(serviceChargeUnit);
      paramCount++;
    }

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
      const publicIds = existingService.working_proof_urls.map(url => {
        // Extract public ID from Cloudinary URL
        // URL format: https://res.cloudinary.com/cloud_name/image/upload/v1234567890/folder/image_name.jpg
        const urlParts = url.split('/');
        const uploadIndex = urlParts.indexOf('upload');
        if (uploadIndex !== -1 && uploadIndex + 2 < urlParts.length) {
          // Skip version number and get folder + filename
          const folderAndFile = urlParts.slice(uploadIndex + 2).join('/');
          // Remove file extension
          return folderAndFile.replace(/\.[^/.]+$/, '');
        }
        return null;
      }).filter(Boolean);

      if (publicIds.length > 0) {
        const { deleteMultipleImages } = require('../utils/cloudinary');
        const deleteResult = await deleteMultipleImages(publicIds);
        if (deleteResult.success) {
          logger.info('Successfully deleted images from Cloudinary', {
            count: deleteResult.deleted
          });
        } else {
          logger.error('Failed to delete some images from Cloudinary', {
            errors: deleteResult.errors
          });
        }
      }
    }

  await query('DELETE FROM provider_services WHERE id = $1', [id]);

  res.json({
    status: 'success',
    message: 'Service removed successfully'
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
  const booking = await getRow(`
    SELECT b.* FROM bookings b
    JOIN provider_services ps ON b.provider_service_id = ps.id
    JOIN provider_profiles pp ON ps.provider_id = pp.id
    WHERE b.id = $1 AND pp.user_id = $2
  `, [id, req.user.id]);

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

  updateValues.push(id);
  const result = await query(`
    UPDATE bookings 
    SET ${updateFields.join(', ')}
    WHERE id = $${paramCount}
    RETURNING *
  `, updateValues);

  const updatedBooking = result.rows[0];

  // Fetch user_id and service_name for notification
  const bookingDetails = await getRow(`
      SELECT b.user_id, sm.name as service_name, b.appointment_date, b.appointment_time
      FROM bookings b
      JOIN provider_services ps ON b.provider_service_id = ps.id
      JOIN services_master sm ON ps.service_id = sm.id
      WHERE b.id = $1
    `, [id]);
    if (bookingDetails) {
      if (status === 'accepted') {
        // Send in-app notification
        const acceptedNotification = await sendNotification(
          bookingDetails.user_id,
          'Booking Accepted',
          `Your booking for ${bookingDetails.service_name} on ${bookingDetails.appointment_date} at ${bookingDetails.appointment_time} has been accepted.`,
          'user'
        );

        // Send push notification
        const pushNotification = {
          ...NotificationTemplates.BOOKING_CONFIRMED,
          body: `Your ${bookingDetails.service_name} booking has been confirmed for ${bookingDetails.appointment_date}`,
          data: {
            type: 'booking_confirmed',
            bookingId: id,
            screen: 'bookings'
          }
        };
        await pushNotificationService.sendToUser(bookingDetails.user_id, pushNotification);
        logger.booking('Push notification sent for booking acceptance', {
          bookingId: id
        });

      } else if (status === 'rejected') {
        // Send in-app notification
        const rejectedNotification = await sendNotification(
          bookingDetails.user_id,
          'Booking Rejected',
          `Your booking for ${bookingDetails.service_name} on ${bookingDetails.appointment_date} at ${bookingDetails.appointment_time} was rejected.`,
          'user'
        );

        // Send push notification
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
        await pushNotificationService.sendToUser(bookingDetails.user_id, pushNotification);
        logger.booking('Push notification sent for booking rejection', {
          bookingId: id
        });

      } else if (status === 'completed') {
        // Send in-app notification
        const completedNotification = await sendNotification(
          bookingDetails.user_id,
          'Booking Completed',
          `Your booking for ${bookingDetails.service_name} on ${bookingDetails.appointment_date} at ${bookingDetails.appointment_time} has been marked as completed. Please rate your experience.`,
          'user'
        );

        // Send push notification
        const pushNotification = {
          ...NotificationTemplates.SERVICE_COMPLETED,
          body: `Your ${bookingDetails.service_name} service is complete! Please rate your experience.`,
          data: {
            type: 'service_completed',
            bookingId: id,
            screen: 'bookings'
          }
        };
        await pushNotificationService.sendToUser(bookingDetails.user_id, pushNotification);
        logger.booking('Push notification sent for service completion', {
          bookingId: id
        });
      }

      // Notify provider about the status change
      const providerNotification = await sendNotification(
        req.user.id,
        `Booking ${status.charAt(0).toUpperCase() + status.slice(1)}`,
        `You have ${status} a booking for ${bookingDetails.service_name} on ${bookingDetails.appointment_date} at ${bookingDetails.appointment_time}.`,
        'provider'
      );
      // Emit real-time event to both the user's and provider's userId rooms
      getIO().to(bookingDetails.user_id).emit('booking_updated', {
        booking: updatedBooking
      });
      getIO().to(req.user.id).emit('booking_updated', {
        booking: updatedBooking
      });

      // Emit earnings update to provider when booking is completed
      if (status === 'completed') {
        await emitEarningsUpdate(req.user.id);
      }
    }

  res.json({
    status: 'success',
    message: `Booking ${status} successfully`,
    data: { booking: updatedBooking }
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

// @route   GET /api/providers/reports
// @desc    Get provider's reports (for admin)
// @access  Private (Admin only)
router.get('/reports', requireRole(['admin']), asyncHandler(async (req, res) => {
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
      pr.*,
      u.full_name as provider_name,
      u.phone as provider_phone
    FROM provider_reports_users pr
    JOIN users u ON pr.provider_id = u.id
    ${whereClause}
    ORDER BY pr.created_at DESC
    LIMIT $${paramCount} OFFSET $${paramCount + 1}
  `, [...queryParams, limit, offset]);

  // Get total count
  const countResult = await getRow(`
    SELECT COUNT(*) as total
    FROM provider_reports_users pr
    ${whereClause}
  `, queryParams);

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

// @route   PUT /api/providers/reports/:id/status
// @desc    Update report status (for admin)
// @access  Private (Admin only)
router.put('/reports/:id/status', [
  body('status').isIn(['open', 'resolved', 'closed']).withMessage('Invalid status')
], requireRole(['admin']), asyncHandler(async (req, res) => {
  validateOrThrow(req);

  const { id } = req.params;
  const { status } = req.body;

  const result = await query(`
    UPDATE provider_reports_users 
    SET status = $1
    WHERE id = $2
    RETURNING *
  `, [status, id]);

  if (result.rows.length === 0) {
    throw new NotFoundError('Report', id);
  }

  res.json({
    status: 'success',
    message: 'Report status updated successfully',
    data: { report: result.rows[0] }
  });
}));

module.exports = router; 