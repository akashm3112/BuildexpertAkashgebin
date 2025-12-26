const express = require('express');
const { body, validationResult } = require('express-validator');
const { query, getRow, getRows, withTransaction } = require('../database/connection');
const { auth, requireRole } = require('../middleware/auth');
const { uploadMultipleImages, deleteMultipleImages } = require('../utils/cloudinary');
const { formatNotificationTimestamp } = require('../utils/timezone');
const { sendNotification, sendAutoNotification } = require('../utils/notifications');
const logger = require('../utils/logger');
const getIO = () => require('../server').io;
const { serviceRegistrationLimiter, standardLimiter, searchLimiter } = require('../middleware/rateLimiting');
const { sanitizeBody, sanitizeQuery } = require('../middleware/inputSanitization');
const { DatabaseConnectionError, NotFoundError, ValidationError, AuthorizationError } = require('../utils/errorTypes');
const { asyncHandler } = require('../middleware/errorHandler');
const { validateOrThrow, throwIfMissing } = require('../utils/errorHelpers');
const { validateSubServices, getDatabaseServiceName } = require('../utils/subServicesValidation');
const { getFrontendCategoryId } = require('../utils/serviceMapping');

const router = express.Router();

// Apply input sanitization to all routes
router.use(sanitizeBody());
router.use(sanitizeQuery());



// Mapping from frontend category IDs to database service names
const categoryToServiceMap = {
  'labor': 'labors',
  'plumber': 'plumber',
  'mason-mastri': 'mason-mastri',
  'painting-cleaning': 'painting', // Backward compatibility: map old ID to new service
  'painting': 'painting',
  'cleaning': 'cleaning',
  'granite-tiles': 'granite-tiles',
  'engineer-interior': 'engineer-interior',
  'electrician': 'electrician',
  'carpenter': 'carpenter',
  'painter': 'painting', // Map 'painter' to 'painting' service
  'interiors-building': 'interiors-building',
  'stainless-steel': 'stainless-steel',
  'contact-building': 'contact-building',
  'glass-mirror': 'glass-mirror',
  'borewell': 'borewell'
};

// @route   GET /api/services
// @desc    Get all services with pagination
// @access  Public
router.get('/', asyncHandler(async (req, res, next) => {
  const { page = 1, limit = 50 } = req.query;
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
    FROM services_master
  `);
  const total = parseInt(countResult?.total || 0, 10);
  const totalPages = Math.ceil(total / limitNum);

  // Get paginated services
  const services = await getRows(`
    SELECT id, name, is_paid, created_at
    FROM services_master 
    ORDER BY name
    LIMIT $1 OFFSET $2
  `, [limitNum, offset]);

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

router.use(auth);

// @route   GET /api/services/my-registrations
// @desc    Get current provider's registered services
// @access  Private
router.get('/my-registrations', auth, requireRole(['provider']), asyncHandler(async (req, res) => {
  logger.info('MY-REGISTRATIONS endpoint called', {
    userId: req.user.id,
    role: req.user.role
  });
  
  // Authentication and role check handled by middleware (auth + requireRole(['provider']))

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

  const registeredServices = await getRows(`
    SELECT 
      ps.id as provider_service_id,
      ps.service_id,
      sm.name as service_name,
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
      a.city,
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
      SELECT state, city, full_address
      FROM addresses
      WHERE user_id = pp.user_id
      ORDER BY created_at DESC
      LIMIT 1
    ) a ON true
    WHERE pp.user_id = $1
    ORDER BY ps.created_at DESC
  `, [req.user.id]);

  // PRODUCTION OPTIMIZATION: Check table existence once instead of in loop
  let tableExists = false;
  try {
    const tableCheck = await getRow(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'provider_sub_services'
      );
    `);
    tableExists = tableCheck && tableCheck.exists;
  } catch (error) {
    logger.warn('Could not check provider_sub_services table existence', { error: error.message });
  }

  // PRODUCTION OPTIMIZATION: Batch fetch all sub-services in one query instead of N queries
  let allSubServices = [];
  if (tableExists && registeredServices.length > 0) {
    try {
      const providerServiceIds = registeredServices.map(s => s.provider_service_id);
      allSubServices = await getRows(`
        SELECT 
          pss.id,
          pss.provider_service_id,
          pss.service_id,
          sm.name as service_name,
          pss.price,
          pss.created_at,
          pss.updated_at
        FROM provider_sub_services pss
        JOIN services_master sm ON pss.service_id = sm.id
        WHERE pss.provider_service_id = ANY($1::uuid[])
        ORDER BY pss.provider_service_id, pss.created_at ASC
      `, [providerServiceIds]);
    } catch (error) {
      logger.warn('Could not fetch sub-services', { error: error.message });
      allSubServices = [];
    }
  }

  // Group sub-services by provider_service_id for O(1) lookup
  const subServicesByProviderServiceId = new Map();
  allSubServices.forEach(ss => {
    if (!subServicesByProviderServiceId.has(ss.provider_service_id)) {
      subServicesByProviderServiceId.set(ss.provider_service_id, []);
    }
    subServicesByProviderServiceId.get(ss.provider_service_id).push(ss);
  });

  // Map services with their sub-services
  const servicesWithSubServices = registeredServices.map((service) => {
    const subServices = subServicesByProviderServiceId.get(service.provider_service_id) || [];

    // Calculate pricing summary from sub-services
    let pricingSummary = {
      minPrice: null,
      maxPrice: null,
      priceRange: null,
      subServiceCount: subServices.length
    };

    if (subServices.length > 0) {
      const prices = subServices.map(ss => parseFloat(ss.price)).filter(p => !isNaN(p) && p > 0);
      if (prices.length > 0) {
        pricingSummary.minPrice = Math.min(...prices);
        pricingSummary.maxPrice = Math.max(...prices);
        
        if (pricingSummary.minPrice === pricingSummary.maxPrice) {
          pricingSummary.priceRange = pricingSummary.minPrice;
        } else {
          pricingSummary.priceRange = `${pricingSummary.minPrice} - ${pricingSummary.maxPrice}`;
        }
      }
    }

    return {
      ...service,
      sub_services: subServices.map(ss => ({
        id: ss.id,
        serviceId: getFrontendCategoryId(ss.service_name), // Map database service name to frontend category ID
        serviceName: ss.service_name,
        price: parseFloat(ss.price),
        createdAt: ss.created_at,
        updatedAt: ss.updated_at
      })),
      // Pricing summary for display
      pricing: pricingSummary
    };
  });

  logger.info('Found registered services', {
    userId: req.user.id,
    count: registeredServices.length
  });

  // PRODUCTION FIX: Ensure working_proof_urls is properly serialized as array
  // PostgreSQL TEXT[] arrays are automatically parsed by pg library, but ensure they're arrays
  const serializedServices = servicesWithSubServices.map(service => ({
    ...service,
    // Ensure working_proof_urls is always an array (pg library should handle this, but be explicit)
    working_proof_urls: Array.isArray(service.working_proof_urls) 
      ? service.working_proof_urls 
      : (service.working_proof_urls ? [service.working_proof_urls] : []),
    // Ensure sub_services is always an array
    sub_services: service.sub_services || []
  }));

  res.json({
    status: 'success',
    data: { registeredServices: serializedServices }
  });
}));

// @route   GET /api/services/:id
// @desc    Get service by ID
// @access  Public
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const service = await getRow('SELECT * FROM services_master WHERE id = $1', [id]);
  if (!service) {
    throw new NotFoundError('Service', id);
  }

  res.json({
    status: 'success',
    data: { service }
  });
}));

// @route   GET /api/services/:id/providers
// @desc    Get providers for a specific service
// @access  Public
router.get('/:id/providers', asyncHandler(async (req, res) => {
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

  // PRODUCTION OPTIMIZATION: Batch fetch all sub-services in one query
  let allSubServices = [];
  if (providers.length > 0) {
    try {
      const tableExists = await getRow(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'provider_sub_services'
        );
      `);
      
      if (tableExists && tableExists.exists) {
        const providerServiceIds = providers.map(p => p.provider_service_id);
        allSubServices = await getRows(`
          SELECT 
            pss.id,
            pss.provider_service_id,
            pss.service_id,
            sm.name as service_name,
            pss.price,
            pss.created_at,
            pss.updated_at
          FROM provider_sub_services pss
          JOIN services_master sm ON pss.service_id = sm.id
          WHERE pss.provider_service_id = ANY($1::uuid[])
          ORDER BY pss.provider_service_id, pss.created_at ASC
        `, [providerServiceIds]);
      }
    } catch (error) {
      logger.warn('Could not fetch sub-services for providers', { error: error.message });
      allSubServices = [];
    }
  }

  // Group sub-services by provider_service_id for O(1) lookup
  const subServicesByProviderServiceId = new Map();
  allSubServices.forEach(ss => {
    if (!subServicesByProviderServiceId.has(ss.provider_service_id)) {
      subServicesByProviderServiceId.set(ss.provider_service_id, []);
    }
    subServicesByProviderServiceId.get(ss.provider_service_id).push(ss);
  });

  const providersWithSubServices = providers.map((provider) => {
    const subServices = subServicesByProviderServiceId.get(provider.provider_service_id) || [];
    
    return {
      ...provider,
      sub_services: subServices.map(ss => ({
        id: ss.id,
        serviceId: getFrontendCategoryId(ss.service_name),
        serviceName: ss.service_name,
        price: parseFloat(ss.price),
        createdAt: ss.created_at,
        updatedAt: ss.updated_at
      }))
    };
  });

  res.json({
    status: 'success',
    data: {
      providers: providersWithSubServices,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        total,
        limit: parseInt(limit)
      }
    }
  });
}));

// @route   GET /api/services/:id/providers/:providerId
// @desc    Get specific provider details for a service
// @access  Public
router.get('/:id/providers/:providerId', asyncHandler(async (req, res) => {
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
      ps.working_proof_urls,
      ps.payment_start_date,
      ps.payment_end_date
    FROM provider_services ps
    JOIN provider_profiles pp ON ps.provider_id = pp.id
    JOIN users u ON pp.user_id = u.id
    WHERE ps.service_id = $1 AND ps.id = $2 AND ps.payment_status = 'active'
  `, [id, providerId]);

  if (!provider) {
    throw new NotFoundError('Provider', providerId);
  }

  // Get sub-services for this provider service (if table exists)
  let subServices = [];
  try {
    const tableExists = await getRow(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'provider_sub_services'
      );
    `);
    
    if (tableExists && tableExists.exists) {
      subServices = await getRows(`
        SELECT 
          pss.id,
          pss.service_id,
          sm.name as service_name,
          pss.price,
          pss.created_at,
          pss.updated_at
        FROM provider_sub_services pss
        JOIN services_master sm ON pss.service_id = sm.id
        WHERE pss.provider_service_id = $1
        ORDER BY pss.created_at ASC
      `, [providerId]);
    }
  } catch (error) {
    // Table doesn't exist yet - return empty array
    logger.warn('provider_sub_services table does not exist yet', { error: error.message });
    subServices = [];
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
}));

// @route   PUT /api/services/:id/providers
// @desc    Update provider registration for a service (requires provider role)
// @access  Private
router.put('/:id/providers', auth, requireRole(['provider']), asyncHandler(async (req, res) => {
  const { id } = req.params;
    const {
      yearsOfExperience,
      serviceDescription,
      state,
      city,
      fullAddress,
      subServices = [],
      workingProofUrls = [],
      isEngineeringProvider = false,
      engineeringCertificateUrl
    } = req.body;

    // Validate sub-services
    const subServicesValidation = validateSubServices(subServices, id);
    if (!subServicesValidation.valid) {
      throw new ValidationError(`Sub-services validation failed: ${subServicesValidation.errors.join(', ')}`);
    }

    // Map frontend category ID to database service name
    const serviceName = categoryToServiceMap[id];
    if (!serviceName) {
      throw new NotFoundError('Service category not found');
    }

    // Check if service exists by name
    const service = await getRow('SELECT * FROM services_master WHERE name = $1', [serviceName]);
    if (!service) {
      throw new NotFoundError('Service not found');
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
    throw new NotFoundError('Provider profile');
  }

  // Get existing provider service registration
  const existingService = await getRow(`
    SELECT * FROM provider_services 
    WHERE provider_id = $1 AND service_id = $2
  `, [providerProfile.id, service.id]);

  if (!existingService) {
    throw new NotFoundError('Service registration');
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
          throw new Error('Failed to upload working proof images');
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
        throw new Error('Failed to upload engineering certificate');
      }
  }

  // PRODUCTION OPTIMIZATION: Use transaction for atomic updates
  // All updates (profile, service, sub-services) must succeed or all fail
  await withTransaction(async (client) => {
    // Update provider_profiles fields
    await client.query(`
      UPDATE provider_profiles
      SET years_of_experience = $1,
          service_description = $2,
          is_engineering_provider = $3,
          engineering_certificate_url = $4
      WHERE id = $5
    `, [yearsOfExperience, serviceDescription, isEngineeringProvider, cloudinaryCertificateUrl, providerProfile.id]);

    // Update provider_services fields with Cloudinary URLs (without service_charge columns)
    if (cloudinaryUrls.length > 0) {
      await client.query(`
        UPDATE provider_services
        SET working_proof_urls = $1
        WHERE id = $2
      `, [cloudinaryUrls, existingService.id]);
    } else {
      await client.query(`
        UPDATE provider_services
        SET working_proof_urls = NULL
        WHERE id = $1
      `, [existingService.id]);
    }

    // PRODUCTION OPTIMIZATION: Atomic sub-services update
    // Delete existing sub-services
    await client.query(`
      DELETE FROM provider_sub_services 
      WHERE provider_service_id = $1
    `, [existingService.id]);

    // PRODUCTION OPTIMIZATION: Batch insert new sub-services
    if (subServices && subServices.length > 0) {
      // Pre-validate all sub-services before inserting
      const subServiceRecords = [];
      const subServiceNames = subServices.map(ss => getDatabaseServiceName(ss.serviceId));
      
      // Batch fetch all sub-service records in one query
      if (subServiceNames.length > 0) {
        const subServiceRecordsResult = await client.query(`
          SELECT id, name FROM services_master WHERE name = ANY($1::text[])
        `, [subServiceNames]);
        
        const subServiceMap = new Map(
          subServiceRecordsResult.rows.map(r => [r.name, r.id])
        );

        // Validate and prepare sub-services for batch insert
        for (const subService of subServices) {
          const subServiceName = getDatabaseServiceName(subService.serviceId);
          const subServiceRecordId = subServiceMap.get(subServiceName);
          
          if (!subServiceRecordId) {
            logger.warn(`Sub-service not found in database: ${subServiceName}`, {
              subServiceId: subService.serviceId,
              providerServiceId: existingService.id
            });
            continue;
          }

          const price = parseFloat(subService.price);
          if (isNaN(price) || price <= 0) {
            logger.warn(`Invalid price for sub-service: ${subServiceName}`, {
              price: subService.price,
              providerServiceId: existingService.id
            });
            continue;
          }

          subServiceRecords.push({
            provider_service_id: existingService.id,
            service_id: subServiceRecordId,
            price: price
          });
        }

        // Batch insert all sub-services at once
        if (subServiceRecords.length > 0) {
          const values = subServiceRecords.map((_, index) => {
            const baseIndex = index * 3;
            return `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3})`;
          }).join(', ');
          
          const params = subServiceRecords.flatMap(ss => [
            ss.provider_service_id,
            ss.service_id,
            ss.price
          ]);

          await client.query(`
            INSERT INTO provider_sub_services (provider_service_id, service_id, price)
            VALUES ${values}
          `, params);
        }
      }
    }
  }, { name: 'update-provider-service-with-sub-services' });

  // Optionally update address (insert new address)
  if (state && fullAddress) {
      await query(`
        INSERT INTO addresses (user_id, type, state, city, full_address)
        VALUES ($1, 'home', $2, $3, $4)
        ON CONFLICT DO NOTHING
    `, [req.user.id, state, city || null, fullAddress]);
  }

  res.json({
    status: 'success',
    message: 'Service registration updated successfully'
  });
}));

// @route   POST /api/services/:id/providers
// @desc    Register as provider for a service (requires provider role)
// @access  Private
router.post('/:id/providers', auth, requireRole(['provider']), [
  body('yearsOfExperience').isInt({ min: 0 }).withMessage('Years of experience must be a positive number'),
  body('serviceDescription').notEmpty().withMessage('Service description is required'),
  body('state').notEmpty().withMessage('State is required'),
  body('fullAddress').notEmpty().withMessage('Full address is required'),
  body('subServices').isArray({ min: 1 }).withMessage('At least one sub-service is required'),
  body('subServices.*.serviceId').notEmpty().withMessage('Sub-service service ID is required'),
  body('subServices.*.price').isFloat({ min: 0.01 }).withMessage('Sub-service price must be a positive number'),
  body('workingProofUrls').optional().isArray().withMessage('Working proof URLs must be an array'),
  body('isEngineeringProvider').optional().isBoolean().withMessage('isEngineeringProvider must be a boolean'),
  body('engineeringCertificateUrl').optional().isString().withMessage('Engineering certificate URL must be a string')
], asyncHandler(async (req, res) => {
  validateOrThrow(req);

    const { id } = req.params;
    const {
      yearsOfExperience,
      serviceDescription,
      state,
      fullAddress,
      subServices = [],
      workingProofUrls = [],
      isEngineeringProvider = false,
      engineeringCertificateUrl
    } = req.body;

    // Validate sub-services
    const subServicesValidation = validateSubServices(subServices, id);
    if (!subServicesValidation.valid) {
      throw new ValidationError(`Sub-services validation failed: ${subServicesValidation.errors.join(', ')}`);
    }

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
      throw new NotFoundError('Service category not found');
    }

    // Check if service exists by name
    const service = await getRow('SELECT * FROM services_master WHERE name = $1', [serviceName]);
    if (!service) {
      throw new NotFoundError('Service not found');
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

    // Check if user is already registered for this service
    const existingRegistration = await getRow(`
      SELECT ps.* FROM provider_services ps
      JOIN provider_profiles pp ON ps.provider_id = pp.id
      WHERE pp.user_id = $1 AND ps.service_id = $2
    `, [req.user.id, service.id]);

  if (existingRegistration) {
    throw new ValidationError('You are already registered for this service');
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
        throw new Error('Failed to upload engineering certificate');
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
        throw new Error('Failed to upload working proof images');
      }
  }

  // PRODUCTION OPTIMIZATION: Use transaction to ensure atomicity
  // All database operations (address, provider_service, sub-services) must succeed or all fail
  const { city } = req.body;
  
  const newProviderService = await withTransaction(async (client) => {
    // Insert address
    await client.query(`
      INSERT INTO addresses (user_id, type, state, city, full_address)
      VALUES ($1, 'home', $2, $3, $4)
      ON CONFLICT DO NOTHING
    `, [req.user.id, state, city || null, fullAddress]);

    // Insert provider service with Cloudinary URLs (without service_charge columns)
    let serviceResult;
    if (cloudinaryUrls.length > 0) {
      serviceResult = await client.query(`
        INSERT INTO provider_services (provider_id, service_id, working_proof_urls)
        VALUES ($1, $2, $3)
        RETURNING *
      `, [providerProfile.id, service.id, cloudinaryUrls]);
    } else {
      serviceResult = await client.query(`
        INSERT INTO provider_services (provider_id, service_id, working_proof_urls)
        VALUES ($1, $2, '{}')
        RETURNING *
      `, [providerProfile.id, service.id]);
    }

    const providerService = serviceResult.rows[0];

    // PRODUCTION OPTIMIZATION: Batch insert sub-services for better performance
    if (subServices && subServices.length > 0) {
      // Pre-validate all sub-services before inserting
      const subServiceRecords = [];
      const subServiceNames = subServices.map(ss => getDatabaseServiceName(ss.serviceId));
      
      // Batch fetch all sub-service records in one query
      if (subServiceNames.length > 0) {
        const subServiceRecordsResult = await client.query(`
          SELECT id, name FROM services_master WHERE name = ANY($1::text[])
        `, [subServiceNames]);
        
        const subServiceMap = new Map(
          subServiceRecordsResult.rows.map(r => [r.name, r.id])
        );

        // Validate and prepare sub-services for batch insert
        for (const subService of subServices) {
          const subServiceName = getDatabaseServiceName(subService.serviceId);
          const subServiceRecordId = subServiceMap.get(subServiceName);
          
          if (!subServiceRecordId) {
            logger.warn(`Sub-service not found in database: ${subServiceName}`, {
              subServiceId: subService.serviceId,
              providerServiceId: providerService.id
            });
            continue;
          }

          const price = parseFloat(subService.price);
          if (isNaN(price) || price <= 0) {
            logger.warn(`Invalid price for sub-service: ${subServiceName}`, {
              price: subService.price,
              providerServiceId: providerService.id
            });
            continue;
          }

          subServiceRecords.push({
            provider_service_id: providerService.id,
            service_id: subServiceRecordId,
            price: price
          });
        }

        // Batch insert all sub-services at once
        if (subServiceRecords.length > 0) {
          const values = subServiceRecords.map((_, index) => {
            const baseIndex = index * 3;
            return `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3})`;
          }).join(', ');
          
          const params = subServiceRecords.flatMap(ss => [
            ss.provider_service_id,
            ss.service_id,
            ss.price
          ]);

          await client.query(`
            INSERT INTO provider_sub_services (provider_service_id, service_id, price)
            VALUES ${values}
            ON CONFLICT (provider_service_id, service_id) DO UPDATE
            SET price = EXCLUDED.price, updated_at = NOW()
          `, params);
        }
      }
    }

    return providerService;
  }, { name: 'create-provider-service-with-sub-services' });

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
}));

// @route   DELETE /api/services/my-registrations/:serviceId
// @desc    Cancel a service registration (only for labor services)
// @access  Private
router.delete('/my-registrations/:serviceId', auth, requireRole(['provider']), asyncHandler(async (req, res) => {
  logger.info('Cancel service registration request', {
    userId: req.user.id,
    serviceId: req.params.serviceId
  });

  const { serviceId } = req.params;

  // First check if user has a provider profile
  const providerProfile = await getRow('SELECT * FROM provider_profiles WHERE user_id = $1', [req.user.id]);
  if (!providerProfile) {
    throw new NotFoundError('Provider profile');
  }

  // Get the service registration
  const serviceRegistration = await getRow(`
    SELECT ps.*, sm.name as service_name
    FROM provider_services ps
    JOIN services_master sm ON ps.service_id = sm.id
    WHERE ps.id = $1 AND ps.provider_id = $2
  `, [serviceId, providerProfile.id]);

  if (!serviceRegistration) {
    throw new NotFoundError('Service registration', serviceId);
  }

  // Check if it's a labor service (only allow cancellation for labor services)
  if (serviceRegistration.service_name !== 'labors') {
    throw new AuthorizationError('Service cancellation is only allowed for labor services');
  }

  // Delete images from Cloudinary if they exist
  if (serviceRegistration.working_proof_urls && serviceRegistration.working_proof_urls.length > 0) {
      logger.info('Deleting images from Cloudinary', {
        count: serviceRegistration.working_proof_urls.length
      });
      
      // Extract public IDs from Cloudinary URLs
      const publicIds = serviceRegistration.working_proof_urls
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
      [serviceId]
    );
  if (parseInt(bookingCount.count) > 0) {
    throw new ValidationError('Cannot delete service registration: there are active bookings (pending or accepted) for this service. Please wait for these bookings to be completed or cancelled before deleting the service.');
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
}));

module.exports = router; 