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
const getIO = () => require('../server').io;

const router = express.Router();

// All routes require authentication and provider role
router.use(auth);
router.use(requireRole(['provider']));

// @route   GET /api/providers/profile
// @desc    Get provider profile
// @access  Private
router.get('/profile', async (req, res) => {
  try {
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
      return res.status(404).json({
        status: 'error',
        message: 'Provider profile not found'
      });
    }

    res.json({
      status: 'success',
      data: { profile }
    });

  } catch (error) {
    console.error('Get provider profile error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

// @route   PUT /api/providers/profile
// @desc    Update provider profile
// @access  Private
router.put('/profile', [
  body('yearsOfExperience').optional().isInt({ min: 0 }).withMessage('Years of experience must be a positive number'),
  body('serviceDescription').optional().notEmpty().withMessage('Service description cannot be empty'),
  body('isEngineeringProvider').optional().isBoolean().withMessage('isEngineeringProvider must be a boolean'),
  body('engineeringCertificateUrl').optional().isString().withMessage('Engineering certificate URL must be a string')
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
        console.log('Uploading engineering certificate to Cloudinary...');
        const uploadResult = await uploadImage(engineeringCertificateUrl, 'buildxpert/certificates');
        
        if (uploadResult.success) {
          cloudinaryUrl = uploadResult.url;
          console.log('Successfully uploaded engineering certificate to Cloudinary');
        } else {
          console.error('Failed to upload engineering certificate to Cloudinary:', uploadResult.error);
          return res.status(500).json({
            status: 'error',
            message: 'Failed to upload engineering certificate'
          });
        }
      }
      
      updateFields.push(`engineering_certificate_url = $${paramCount}`);
      updateValues.push(cloudinaryUrl);
      paramCount++;
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'No fields to update'
      });
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

  } catch (error) {
    console.error('Update provider profile error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/providers/services
// @desc    Get provider's registered services
// @access  Private
router.get('/services', async (req, res) => {
  try {
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
    `, [req.user.id]);

    res.json({
      status: 'success',
      data: { services }
    });

  } catch (error) {
    console.error('Get provider services error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

// @route   PUT /api/providers/services/:id
// @desc    Update provider service details
// @access  Private
router.put('/services/:id', [
  body('serviceChargeValue').optional().isFloat({ min: 0 }).withMessage('Service charge must be a positive number'),
  body('serviceChargeUnit').optional().notEmpty().withMessage('Service charge unit cannot be empty'),
  body('workingProofUrls').optional().isArray().withMessage('Working proof URLs must be an array')
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
    const { serviceChargeValue, serviceChargeUnit, workingProofUrls } = req.body;

    // Check if service belongs to provider
    const existingService = await getRow(`
      SELECT ps.* FROM provider_services ps
      JOIN provider_profiles pp ON ps.provider_id = pp.id
      WHERE ps.id = $1 AND pp.user_id = $2
    `, [id, req.user.id]);

    if (!existingService) {
      return res.status(404).json({
        status: 'error',
        message: 'Service not found'
      });
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
          console.log('Uploading working proof images to Cloudinary...');
          const { uploadMultipleImages } = require('../utils/cloudinary');
          const uploadResult = await uploadMultipleImages(workingProofUrls, 'buildxpert/working-proofs');
          
          if (uploadResult.success) {
            cloudinaryUrls = uploadResult.urls;
            console.log('Successfully uploaded', cloudinaryUrls.length, 'images to Cloudinary');
          } else {
            console.error('Failed to upload images to Cloudinary:', uploadResult.errors);
            return res.status(500).json({
              status: 'error',
              message: 'Failed to upload working proof images'
            });
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
      return res.status(400).json({
        status: 'error',
        message: 'No fields to update'
      });
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

  } catch (error) {
    console.error('Update provider service error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

// @route   DELETE /api/providers/services/:id
// @desc    Remove provider service
// @access  Private
router.delete('/services/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Check if service belongs to provider
    const existingService = await getRow(`
      SELECT ps.* FROM provider_services ps
      JOIN provider_profiles pp ON ps.provider_id = pp.id
      WHERE ps.id = $1 AND pp.user_id = $2
    `, [id, req.user.id]);

    if (!existingService) {
      return res.status(404).json({
        status: 'error',
        message: 'Service not found'
      });
    }

    // Delete images from Cloudinary if they exist
    if (existingService.working_proof_urls && existingService.working_proof_urls.length > 0) {
      console.log('Deleting images from Cloudinary...');
      
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
          console.log('Successfully deleted', deleteResult.deleted, 'images from Cloudinary');
        } else {
          console.error('Failed to delete some images from Cloudinary:', deleteResult.errors);
        }
      }
    }

    await query('DELETE FROM provider_services WHERE id = $1', [id]);

    res.json({
      status: 'success',
      message: 'Service removed successfully'
    });

  } catch (error) {
    console.error('Remove provider service error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/providers/bookings
// @desc    Get provider's bookings
// @access  Private
router.get('/bookings', async (req, res) => {
  try {
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

  } catch (error) {
    console.error('Get provider bookings error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});



// @route   PUT /api/providers/bookings/:id/status
// @desc    Update booking status (accept/reject/complete)
// @access  Private
router.put('/bookings/:id/status', [
  body('status').isIn(['accepted', 'rejected', 'completed']).withMessage('Status must be accepted, rejected, or completed'),
  body('rejectionReason').optional().notEmpty().withMessage('Rejection reason is required when rejecting')
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
    const { status, rejectionReason } = req.body;

    // Check if booking belongs to provider
    const booking = await getRow(`
      SELECT b.* FROM bookings b
      JOIN provider_services ps ON b.provider_service_id = ps.id
      JOIN provider_profiles pp ON ps.provider_id = pp.id
      WHERE b.id = $1 AND pp.user_id = $2
    `, [id, req.user.id]);

    if (!booking) {
      return res.status(404).json({
        status: 'error',
        message: 'Booking not found'
      });
    }

    // Validate status transition
    if (booking.status === 'completed' && status !== 'completed') {
      return res.status(400).json({
        status: 'error',
        message: 'Cannot change status of completed booking'
      });
    }

    if (booking.status === 'cancelled') {
      return res.status(400).json({
        status: 'error',
        message: 'Cannot change status of cancelled booking'
      });
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
        console.log('📱 Push notification sent for booking acceptance');

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
        console.log('📱 Push notification sent for booking rejection');

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
        console.log('📱 Push notification sent for service completion');
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

  } catch (error) {
    console.error('Update booking status error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/providers/report-customer
// @desc    Report a customer (for providers)
// @access  Private (Providers only)
router.post('/report-customer', [
  body('customerName').notEmpty().withMessage('Customer name is required'),
  body('incidentDate').notEmpty().withMessage('Incident date is required'),
  body('incidentType').notEmpty().withMessage('Incident type is required'),
  body('description').notEmpty().withMessage('Description is required')
], async (req, res) => {
  try {
    console.log('🔍 Report customer request received:', {
      user: req.user.id,
      body: req.body
    });

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ Validation errors:', errors.array());
      return res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { 
      customerName, 
      incidentDate, 
      incidentTime, 
      incidentType, 
      description, 
      evidence = [] 
    } = req.body;

    console.log('📝 Processing report data:', {
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
      console.log('❌ Provider profile not found for user:', req.user.id);
      return res.status(404).json({
        status: 'error',
        message: 'Provider profile not found'
      });
    }

    console.log('✅ Provider profile found:', providerProfile.id);

    // Create the report in the database
    const result = await query(`
      INSERT INTO provider_reports (
        provider_id,
        customer_name,
        incident_date,
        incident_time,
        incident_type,
        description,
        evidence,
        status,
        created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, 'open', NOW()
      ) RETURNING *
    `, [
      providerProfile.id,
      customerName,
      incidentDate,
      incidentTime || null,
      incidentType,
      description,
      JSON.stringify(evidence)
    ]);

    const newReport = result.rows[0];
    console.log('✅ Report created successfully:', newReport.id);

    // Notify the provider that their report was submitted
    try {
      const providerNotification = await sendNotification(
        req.user.id,
        'Report Submitted',
        `Your customer report has been submitted successfully. Our team will review it and take appropriate action.`,
        'provider'
      );
      console.log('✅ Notification sent:', providerNotification.id);
    } catch (notificationError) {
      console.error('⚠️ Failed to send notification:', notificationError);
      // Don't fail the request if notification fails
    }

    res.status(201).json({
      status: 'success',
      message: 'Customer report submitted successfully',
      data: { report: newReport }
    });

  } catch (error) {
    console.error('❌ Report customer error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error',
      details: error.message
    });
  }
});

// @route   GET /api/providers/reports
// @desc    Get provider's reports (for admin)
// @access  Private (Admin only)
router.get('/reports', requireRole(['admin']), async (req, res) => {
  try {
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
      FROM provider_reports pr
      JOIN provider_profiles pp ON pr.provider_id = pp.id
      JOIN users u ON pp.user_id = u.id
      ${whereClause}
      ORDER BY pr.created_at DESC
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `, [...queryParams, limit, offset]);

    // Get total count
    const countResult = await getRow(`
      SELECT COUNT(*) as total
      FROM provider_reports pr
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

  } catch (error) {
    console.error('Get provider reports error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/providers/my-reports
// @desc    Get provider's own reports
// @access  Private (Providers only)
router.get('/my-reports', async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE pr.provider_id = (SELECT id FROM provider_profiles WHERE user_id = $1)';
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
      FROM provider_reports pr
      ${whereClause}
      ORDER BY pr.created_at DESC
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `, [...queryParams, limit, offset]);

    // Get total count
    const countResult = await getRow(`
      SELECT COUNT(*) as total
      FROM provider_reports pr
      WHERE pr.provider_id = (SELECT id FROM provider_profiles WHERE user_id = $1)
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

  } catch (error) {
    console.error('Get my reports error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

// @route   PUT /api/providers/reports/:id/status
// @desc    Update report status (for admin)
// @access  Private (Admin only)
router.put('/reports/:id/status', [
  body('status').isIn(['open', 'resolved', 'closed']).withMessage('Invalid status')
], requireRole(['admin']), async (req, res) => {
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
    const { status } = req.body;

    const result = await query(`
      UPDATE provider_reports 
      SET status = $1
      WHERE id = $2
      RETURNING *
    `, [status, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Report not found'
      });
    }

    res.json({
      status: 'success',
      message: 'Report status updated successfully',
      data: { report: result.rows[0] }
    });

  } catch (error) {
    console.error('Update report status error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

module.exports = router; 