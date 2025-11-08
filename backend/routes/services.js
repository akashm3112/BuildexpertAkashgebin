const express = require('express');
const { body, validationResult } = require('express-validator');
const { query, getRow, getRows } = require('../database/connection');
const { auth, requireRole } = require('../middleware/auth');
const { uploadMultipleImages, deleteMultipleImages } = require('../utils/cloudinary');
const { formatNotificationTimestamp } = require('../utils/timezone');
const { sendNotification, sendAutoNotification } = require('../utils/notifications');
const logger = require('../utils/logger');
const getIO = () => require('../server').io;
const { serviceRegistrationLimiter, standardLimiter, searchLimiter } = require('../middleware/rateLimiting');
const { sanitizeBody, sanitizeQuery } = require('../middleware/inputSanitization');

const router = express.Router();

// Apply input sanitization to all routes
router.use(sanitizeBody());
router.use(sanitizeQuery());



// Mapping from frontend category IDs to database service names
const categoryToServiceMap = {
  'labor': 'labors',
  'plumber': 'plumber',
  'mason-mastri': 'mason-mastri',
  'painting-cleaning': 'painting-cleaning',
  'granite-tiles': 'granite-tiles',
  'engineer-interior': 'engineer-interior',
  'electrician': 'electrician',
  'carpenter': 'carpenter',
  'painter': 'painter',
  'interiors-building': 'interiors-building',
  'stainless-steel': 'stainless-steel',
  'contact-building': 'contact-building',
  'glass-mirror': 'glass-mirror'
};

// @route   GET /api/services
// @desc    Get all services
// @access  Public
router.get('/', async (req, res) => {
  try {
    const services = await getRows(`
      SELECT id, name, is_paid, created_at
      FROM services_master 
      ORDER BY name
    `);

    res.json({
      status: 'success',
      data: { services }
    });

  } catch (error) {
    logger.error('Get services error', { error: error.message });
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

router.use(auth);

// @route   GET /api/services/my-registrations
// @desc    Get current provider's registered services
// @access  Private
router.get('/my-registrations', async (req, res) => {
  try {
    logger.info('MY-REGISTRATIONS endpoint called', {
      userId: req.user.id,
      role: req.user.role
    });

    if (req.user.role !== 'provider') {
      logger.warn('User is not a provider', { userId: req.user.id, role: req.user.role });
      return res.status(403).json({
        status: 'error',
        message: 'Access denied. Only providers can access this endpoint.'
      });
    }

    // First check if user has a provider profile
    const providerProfile = await getRow('SELECT * FROM provider_profiles WHERE user_id = $1', [req.user.id]);
    logger.info('Provider profile lookup', {
      userId: req.user.id,
      found: !!providerProfile
    });

    if (!providerProfile) {
      logger.info('No provider profile found', { userId: req.user.id });
      return res.json({
        status: 'success',
        data: { registeredServices: [] }
      });
    }

    let registeredServices = [];
    try {
      registeredServices = await getRows(`
        SELECT 
          ps.id as provider_service_id,
          ps.service_id,
          sm.name as service_name,
          ps.service_charge_value,
          ps.service_charge_unit,
          ps.payment_status,
          ps.payment_start_date,
          ps.payment_end_date,
          ps.created_at,
          pp.years_of_experience,
          pp.service_description,
          pp.is_engineering_provider,
          pp.engineering_certificate_url,
          ps.working_proof_urls,
          a.state,
          a.full_address,
          CASE 
            WHEN ps.payment_status = 'active' AND ps.payment_end_date IS NOT NULL 
            THEN (ps.payment_end_date - CURRENT_DATE)
            ELSE NULL
          END as days_until_expiry
        FROM provider_services ps
        JOIN services_master sm ON ps.service_id = sm.id
        JOIN provider_profiles pp ON ps.provider_id = pp.id
        LEFT JOIN LATERAL (
          SELECT state, full_address
          FROM addresses
          WHERE user_id = pp.user_id
          ORDER BY created_at DESC
          LIMIT 1
        ) a ON true
        WHERE pp.user_id = $1
        ORDER BY ps.created_at DESC
      `, [req.user.id]);
    } catch (dbErr) {
      logger.error('Database error in my-registrations', { error: dbErr.message });
      return res.status(500).json({
        status: 'error',
        message: 'Database error',
        details: dbErr.message
      });
    }

    logger.info('Found registered services', {
      userId: req.user.id,
      count: registeredServices.length
    });

    res.json({
      status: 'success',
      data: { registeredServices }
    });

  } catch (error) {
    logger.error('Get my registrations error', {
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({
      status: 'error',
      message: 'Internal server error',
      details: error.message
    });
  }
});

// @route   GET /api/services/:id
// @desc    Get service by ID
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const service = await getRow('SELECT * FROM services_master WHERE id = $1', [id]);
    if (!service) {
      return res.status(404).json({
        status: 'error',
        message: 'Service not found'
      });
    }

    res.json({
      status: 'success',
      data: { service }
    });

  } catch (error) {
    logger.error('Get service error', { error: error.message });
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/services/:id/providers
// @desc    Get providers for a specific service
// @access  Public
router.get('/:id/providers', async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 10, state } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE ps.service_id = $1 AND ps.payment_status = $2';
    let queryParams = [id, 'active'];
    let paramCount = 3;

    if (state) {
      whereClause += ` AND EXISTS (
        SELECT 1 FROM addresses a 
        WHERE a.user_id = u.id AND a.type = 'home' AND a.state = $${paramCount}
      )`;
      queryParams.push(state);
      paramCount++;
    }

    const providers = await getRows(`
      SELECT 
        u.id as user_id,
        u.full_name,
        u.phone,
        u.profile_pic_url,
        pp.years_of_experience,
        pp.service_description,
        ps.id as provider_service_id,
        ps.service_charge_value,
        ps.service_charge_unit,
        ps.working_proof_urls,
        ps.payment_start_date,
        ps.payment_end_date,
        a.state as state
      FROM provider_services ps
      JOIN provider_profiles pp ON ps.provider_id = pp.id
      JOIN users u ON pp.user_id = u.id
      LEFT JOIN addresses a ON a.user_id = u.id AND a.type = 'home'
      ${whereClause}
      ORDER BY pp.years_of_experience DESC, ps.created_at DESC
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `, [...queryParams, limit, offset]);

    // Get total count
    const countResult = await getRow(`
      SELECT COUNT(*) as total
      FROM provider_services ps
      JOIN provider_profiles pp ON ps.provider_id = pp.id
      JOIN users u ON pp.user_id = u.id
      LEFT JOIN addresses a ON a.user_id = u.id AND a.type = 'home'
      ${whereClause}
    `, queryParams);

    const total = parseInt(countResult.total);
    const totalPages = Math.ceil(total / limit);

    res.json({
      status: 'success',
      data: {
        providers,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          total,
          limit: parseInt(limit)
        }
      }
    });

  } catch (error) {
    logger.error('Get service providers error', { error: error.message });
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/services/:id/providers/:providerId
// @desc    Get specific provider details for a service
// @access  Public
router.get('/:id/providers/:providerId', async (req, res) => {
  try {
    const { id, providerId } = req.params;

    const provider = await getRow(`
      SELECT 
        u.id as user_id,
        u.full_name,
        u.phone,
        u.profile_pic_url,
        pp.years_of_experience,
        pp.service_description,
        pp.is_engineering_provider,
        pp.engineering_certificate_url,
        ps.id as provider_service_id,
        ps.service_charge_value,
        ps.service_charge_unit,
        ps.working_proof_urls,
        ps.payment_start_date,
        ps.payment_end_date
      FROM provider_services ps
      JOIN provider_profiles pp ON ps.provider_id = pp.id
      JOIN users u ON pp.user_id = u.id
      WHERE ps.service_id = $1 AND ps.id = $2 AND ps.payment_status = 'active'
    `, [id, providerId]);

    if (!provider) {
      return res.status(404).json({
        status: 'error',
        message: 'Provider not found'
      });
    }

    // Get provider's ratings
    const ratings = await getRows(`
      SELECT r.rating, r.review, r.created_at, u.full_name as customer_name
      FROM ratings r
      JOIN bookings b ON r.booking_id = b.id
      JOIN users u ON b.user_id = u.id
      WHERE b.provider_service_id = $1
      ORDER BY r.created_at DESC
      LIMIT 10
    `, [providerId]);

    // Calculate average rating
    const avgRating = ratings.length > 0 
      ? ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length 
      : 0;

    res.json({
      status: 'success',
      data: {
        provider: {
          ...provider,
          ratings,
          averageRating: Math.round(avgRating * 10) / 10,
          totalReviews: ratings.length
        }
      }
    });

  } catch (error) {
    logger.error('Get provider details error', { error: error.message });
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

// @route   PUT /api/services/:id/providers
// @desc    Update provider registration for a service (requires provider role)
// @access  Private
router.put('/:id/providers', requireRole(['provider']), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      yearsOfExperience,
      serviceDescription,
      serviceChargeValue,
      serviceChargeUnit,
      state,
      fullAddress,
      workingProofUrls = [],
      isEngineeringProvider = false,
      engineeringCertificateUrl
    } = req.body;

    // Map frontend category ID to database service name
    const serviceName = categoryToServiceMap[id];
    if (!serviceName) {
      return res.status(404).json({
        status: 'error',
        message: 'Service category not found'
      });
    }

    // Check if service exists by name
    const service = await getRow('SELECT * FROM services_master WHERE name = $1', [serviceName]);
    if (!service) {
      return res.status(404).json({
        status: 'error',
        message: 'Service not found'
      });
    }

    const defaultPricingPlan = await getRow(`
      SELECT id, plan_name, description, price, currency_code, billing_period, billing_interval
      FROM service_pricing
      WHERE service_id = $1
        AND is_active = TRUE
        AND (effective_from IS NULL OR effective_from <= NOW())
        AND (effective_to IS NULL OR effective_to >= NOW())
      ORDER BY 
        (CASE WHEN id = $2 THEN 0 ELSE 1 END),
        priority DESC,
        effective_from DESC NULLS LAST
      LIMIT 1
    `, [service.id, service.default_pricing_plan_id]);

    // Get provider profile
    let providerProfile = await getRow('SELECT * FROM provider_profiles WHERE user_id = $1', [req.user.id]);
    if (!providerProfile) {
      return res.status(404).json({
        status: 'error',
        message: 'Provider profile not found'
      });
    }

    // Get existing provider service registration
    const existingService = await getRow(`
      SELECT * FROM provider_services 
      WHERE provider_id = $1 AND service_id = $2
    `, [providerProfile.id, service.id]);

    if (!existingService) {
      return res.status(404).json({
        status: 'error',
        message: 'Not registered for this service'
      });
    }

    // Handle working proof images
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

    // Handle engineering certificate upload to Cloudinary
    let cloudinaryCertificateUrl = engineeringCertificateUrl;
    if (engineeringCertificateUrl && (engineeringCertificateUrl.startsWith('data:image/') || engineeringCertificateUrl.startsWith('file://'))) {
      logger.info('Uploading engineering certificate to Cloudinary');
      const { uploadImage } = require('../utils/cloudinary');
      const uploadResult = await uploadImage(engineeringCertificateUrl, 'buildxpert/certificates');
      
      if (uploadResult.success) {
        cloudinaryCertificateUrl = uploadResult.url;
        logger.info('Successfully uploaded engineering certificate to Cloudinary');
      } else {
        logger.error('Failed to upload engineering certificate to Cloudinary', {
          error: uploadResult.error
        });
        return res.status(500).json({
          status: 'error',
          message: 'Failed to upload engineering certificate'
        });
      }
    }

    // Update provider_profiles fields
    await query(`
      UPDATE provider_profiles
      SET years_of_experience = $1,
          service_description = $2,
          is_engineering_provider = $3,
          engineering_certificate_url = $4
      WHERE id = $5
    `, [yearsOfExperience, serviceDescription, isEngineeringProvider, cloudinaryCertificateUrl, providerProfile.id]);

    // Update provider_services fields with Cloudinary URLs
    if (cloudinaryUrls.length > 0) {
      await query(`
        UPDATE provider_services
        SET service_charge_value = $1,
            service_charge_unit = $2,
            working_proof_urls = $3
        WHERE id = $4
      `, [serviceChargeValue, serviceChargeUnit, cloudinaryUrls, existingService.id]);
    } else {
      await query(`
        UPDATE provider_services
        SET service_charge_value = $1,
            service_charge_unit = $2,
            working_proof_urls = NULL
        WHERE id = $3
      `, [serviceChargeValue, serviceChargeUnit, existingService.id]);
    }

    // Optionally update address (insert new address)
    if (state && fullAddress) {
      await query(`
        INSERT INTO addresses (user_id, type, state, full_address)
        VALUES ($1, 'home', $2, $3)
        ON CONFLICT DO NOTHING
      `, [req.user.id, state, fullAddress]);
    }

    res.json({
      status: 'success',
      message: 'Service registration updated successfully'
    });
  } catch (error) {
    logger.error('Update provider service error', { error: error.message, stack: error.stack });
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/services/:id/providers
// @desc    Register as provider for a service (requires provider role)
// @access  Private
router.post('/:id/providers', requireRole(['provider']), [
  body('yearsOfExperience').isInt({ min: 0 }).withMessage('Years of experience must be a positive number'),
  body('serviceDescription').notEmpty().withMessage('Service description is required'),
  body('serviceChargeValue').isFloat({ min: 0 }).withMessage('Service charge must be a positive number'),
  body('serviceChargeUnit').notEmpty().withMessage('Service charge unit is required'),
  body('state').notEmpty().withMessage('State is required'),
  body('fullAddress').notEmpty().withMessage('Full address is required'),
  body('workingProofUrls').optional().isArray().withMessage('Working proof URLs must be an array'),
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

    const { id } = req.params;
    const {
      yearsOfExperience,
      serviceDescription,
      serviceChargeValue,
      serviceChargeUnit,
      state,
      fullAddress,
      workingProofUrls = [],
      isEngineeringProvider = false,
      engineeringCertificateUrl
    } = req.body;

    // Ensure workingProofUrls is always a valid array
    let validWorkingProofUrls = [];
    if (Array.isArray(workingProofUrls)) {
      validWorkingProofUrls = workingProofUrls;
    } else if (typeof workingProofUrls === 'string') {
      try {
        validWorkingProofUrls = JSON.parse(workingProofUrls);
      } catch (e) {
        validWorkingProofUrls = [];
      }
    }
    
    // Debug logging removed for production

    // Map frontend category ID to database service name
    const serviceName = categoryToServiceMap[id];
    if (!serviceName) {
      return res.status(404).json({
        status: 'error',
        message: 'Service category not found'
      });
    }

    // Check if service exists by name
    const service = await getRow('SELECT * FROM services_master WHERE name = $1', [serviceName]);
    if (!service) {
      return res.status(404).json({
        status: 'error',
        message: 'Service not found'
      });
    }

    // Check if user is already registered for this service
    const existingRegistration = await getRow(`
      SELECT ps.* FROM provider_services ps
      JOIN provider_profiles pp ON ps.provider_id = pp.id
      WHERE pp.user_id = $1 AND ps.service_id = $2
    `, [req.user.id, service.id]);

    if (existingRegistration) {
      return res.status(400).json({
        status: 'error',
        message: 'You are already registered for this service'
      });
    }

    // Get or create provider profile
    let providerProfile = await getRow('SELECT * FROM provider_profiles WHERE user_id = $1', [req.user.id]);
    
    // Handle engineering certificate upload to Cloudinary
    let cloudinaryCertificateUrl = engineeringCertificateUrl;
    if (engineeringCertificateUrl && (engineeringCertificateUrl.startsWith('data:image/') || engineeringCertificateUrl.startsWith('file://'))) {
      logger.info('Uploading engineering certificate to Cloudinary');
      const { uploadImage } = require('../utils/cloudinary');
      const uploadResult = await uploadImage(engineeringCertificateUrl, 'buildxpert/certificates');
      
      if (uploadResult.success) {
        cloudinaryCertificateUrl = uploadResult.url;
        logger.info('Successfully uploaded engineering certificate to Cloudinary');
      } else {
        logger.error('Failed to upload engineering certificate to Cloudinary', {
          error: uploadResult.error
        });
        return res.status(500).json({
          status: 'error',
          message: 'Failed to upload engineering certificate'
        });
      }
    }
    
    if (!providerProfile) {
      const profileResult = await query(`
        INSERT INTO provider_profiles (user_id, years_of_experience, service_description, is_engineering_provider, engineering_certificate_url)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `, [req.user.id, yearsOfExperience, serviceDescription, isEngineeringProvider, cloudinaryCertificateUrl]);
      providerProfile = profileResult.rows[0];
    } else {
      // Update existing profile
      await query(`
        UPDATE provider_profiles
        SET years_of_experience = $1,
            service_description = $2,
            is_engineering_provider = $3,
            engineering_certificate_url = $4
        WHERE id = $5
      `, [yearsOfExperience, serviceDescription, isEngineeringProvider, cloudinaryCertificateUrl, providerProfile.id]);
    }

    // Upload working proof images to Cloudinary if provided
    let cloudinaryUrls = [];
    if (validWorkingProofUrls.length > 0) {
      logger.info('Uploading working proof images to Cloudinary', {
        count: validWorkingProofUrls.length
      });
      const uploadResult = await uploadMultipleImages(validWorkingProofUrls, 'buildxpert/working-proofs');
      
      if (uploadResult.success) {
        cloudinaryUrls = uploadResult.urls;
          logger.info('Successfully uploaded images to Cloudinary', {
            count: cloudinaryUrls.length
          });
      } else {
          logger.error('Failed to upload images to Cloudinary', {
            errors: uploadResult.errors
          });
        return res.status(500).json({
          status: 'error',
          message: 'Failed to upload working proof images'
        });
      }
    }

    // Insert address
    await query(`
      INSERT INTO addresses (user_id, type, state, full_address)
      VALUES ($1, 'home', $2, $3)
      ON CONFLICT DO NOTHING
    `, [req.user.id, state, fullAddress]);

    // Insert provider service with Cloudinary URLs
    let serviceResult;
    if (cloudinaryUrls.length > 0) {
      // Debug logging removed for production
      serviceResult = await query(`
        INSERT INTO provider_services (provider_id, service_id, service_charge_value, service_charge_unit, working_proof_urls)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `, [providerProfile.id, service.id, serviceChargeValue, serviceChargeUnit, cloudinaryUrls]);
    } else {
      // Debug logging removed for production
      serviceResult = await query(`
        INSERT INTO provider_services (provider_id, service_id, service_charge_value, service_charge_unit, working_proof_urls)
        VALUES ($1, $2, $3, $4, '{}')
        RETURNING *
      `, [providerProfile.id, service.id, serviceChargeValue, serviceChargeUnit]);
    }

    const newProviderService = serviceResult.rows[0];
    const serviceBasePrice = parseFloat(defaultPricingPlan?.price ?? service.base_price ?? 0);

    // Check if this is a labor service (free registration)
    const isLaborService = serviceName === 'labors' || serviceName === 'labor';
    
    if (isLaborService) {
      // Labor services are free - activate immediately
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 365); // 1 year validity for free services
      
      await query(`
        UPDATE provider_services
        SET payment_status = 'active',
            payment_start_date = $1,
            payment_end_date = $2
        WHERE id = $3
      `, [startDate, endDate, newProviderService.id]);
      
      newProviderService.payment_status = 'active';
      newProviderService.payment_start_date = startDate;
      newProviderService.payment_end_date = endDate;
      
      logger.info('Labor service registered for free - activated immediately', {
        providerServiceId: newProviderService.id
      });
    } else {
      // Paid services require payment
      newProviderService.payment_status = 'pending';
      logger.info('Paid service registered - payment required', {
        providerServiceId: newProviderService.id,
        expectedAmount: serviceBasePrice,
        pricingPlanId: defaultPricingPlan?.id || service.default_pricing_plan_id,
        currency: defaultPricingPlan?.currency_code || service.currency_code
      });
    }

    // Add welcome notification for new providers (only on first service registration)
    try {
      const existingNotifications = await getRow(`
        SELECT COUNT(*) as count FROM notifications 
        WHERE user_id = $1 AND title LIKE '%Welcome%'
      `, [req.user.id]);
      
      if (parseInt(existingNotifications.count) === 0) {
        const welcomeNotification = await query(`
          INSERT INTO notifications (user_id, title, message, role)
          VALUES ($1, $2, $3, $4)
          RETURNING *
        `, [
          req.user.id,
          'Welcome to BuildXpert Provider! 🎉',
          'Congratulations on registering as a service provider! Your profile is now active and customers can book your services. Start receiving bookings and grow your business with us!',
          'provider'
        ]);
        
        // Format timestamp for the notification
        const timestampData = formatNotificationTimestamp(welcomeNotification.rows[0].created_at);
        
        // Emit socket event for welcome notification
        getIO().to(req.user.id).emit('notification_created', {
          notification: {
            id: welcomeNotification.rows[0].id,
            title: welcomeNotification.rows[0].title,
            message: welcomeNotification.rows[0].message,
            created_at: welcomeNotification.rows[0].created_at,
            is_read: welcomeNotification.rows[0].is_read,
            ...timestampData
          }
        });
      }

      // Notify users who might be interested in this service
      // This could be enhanced to notify users who have searched for this service recently
      try {
        const interestedUsers = await getRows(`
          SELECT DISTINCT u.id 
          FROM users u 
          WHERE u.role = 'user' 
          AND u.id NOT IN (
            SELECT DISTINCT user_id 
            FROM notifications 
            WHERE title LIKE '%New Provider%' 
            AND created_at > NOW() - INTERVAL '1 hour'
          )
          LIMIT 10
        `);

        for (const user of interestedUsers) {
          const serviceNotification = await sendNotification(
            user.id,
            'New Provider Available',
            `A new ${serviceName} provider is now available in your area!`,
            'user'
          );
        }
      } catch (notificationError) {
        logger.error('Failed to notify interested users', {
          error: notificationError.message
        });
        // Don't fail the registration process if notification creation fails
      }
    } catch (notificationError) {
      logger.error('Failed to create welcome notification for provider', {
        error: notificationError.message
      });
      // Don't fail the registration process if notification creation fails
    }

    const responseMessage = isLaborService 
      ? 'Successfully registered as labor provider - service activated for free!'
      : 'Successfully registered as provider for this service - payment required to activate';

    res.status(201).json({
      status: 'success',
      message: responseMessage,
      data: {
        providerService: {
          ...newProviderService,
          defaultPricingPlanId: defaultPricingPlan?.id || service.default_pricing_plan_id,
          pricingPlan: defaultPricingPlan
            ? {
                id: defaultPricingPlan.id,
                name: defaultPricingPlan.plan_name,
                description: defaultPricingPlan.description,
                price: parseFloat(defaultPricingPlan.price),
                currency: defaultPricingPlan.currency_code,
                billingPeriod: defaultPricingPlan.billing_period,
                billingInterval: defaultPricingPlan.billing_interval
              }
            : null
        },
        isFreeService: isLaborService
      }
    });

  } catch (error) {
    logger.error('Register as provider error', {
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

// @route   DELETE /api/services/my-registrations/:serviceId
// @desc    Cancel a service registration (only for labor services)
// @access  Private
router.delete('/my-registrations/:serviceId', requireRole(['provider']), async (req, res) => {
  try {
    logger.info('Cancel service registration request', {
      userId: req.user.id,
      serviceId: req.params.serviceId
    });

    const { serviceId } = req.params;

    // First check if user has a provider profile
    const providerProfile = await getRow('SELECT * FROM provider_profiles WHERE user_id = $1', [req.user.id]);
    if (!providerProfile) {
      return res.status(404).json({
        status: 'error',
        message: 'Provider profile not found'
      });
    }

    // Get the service registration
    const serviceRegistration = await getRow(`
      SELECT ps.*, sm.name as service_name
      FROM provider_services ps
      JOIN services_master sm ON ps.service_id = sm.id
      WHERE ps.id = $1 AND ps.provider_id = $2
    `, [serviceId, providerProfile.id]);

    if (!serviceRegistration) {
      return res.status(404).json({
        status: 'error',
        message: 'Service registration not found'
      });
    }

    // Check if it's a labor service (only allow cancellation for labor services)
    if (serviceRegistration.service_name !== 'labors') {
      return res.status(403).json({
        status: 'error',
        message: 'Service cancellation is only allowed for labor services'
      });
    }

    // Delete images from Cloudinary if they exist
    if (serviceRegistration.working_proof_urls && serviceRegistration.working_proof_urls.length > 0) {
      logger.info('Deleting images from Cloudinary', {
        count: serviceRegistration.working_proof_urls.length
      });
      
      // Extract public IDs from Cloudinary URLs
      const publicIds = serviceRegistration.working_proof_urls.map(url => {
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

    // Check for existing bookings referencing this provider service
    const bookingCount = await getRow(
      'SELECT COUNT(*) FROM bookings WHERE provider_service_id = $1',
      [serviceId]
    );
    if (parseInt(bookingCount.count) > 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Cannot delete service registration: there are existing bookings referencing this service.'
      });
    }

    // Delete the service registration
    await query('DELETE FROM provider_services WHERE id = $1', [serviceId]);

    logger.info('Service registration cancelled successfully', {
      serviceId: req.params.serviceId,
      userId: req.user.id
    });

    res.json({
      status: 'success',
      message: 'Service registration cancelled successfully'
    });

  } catch (error) {
    logger.error('Cancel service registration error', {
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

module.exports = router; 