const express = require('express');
const { getRow, getRows } = require('../database/connection');
const DatabaseOptimizer = require('../utils/databaseOptimization');
const logger = require('../utils/logger');
const { asyncHandler } = require('../middleware/errorHandler');
const { NotFoundError, ValidationError } = require('../utils/errorTypes');
const config = require('../utils/config');
const { getFrontendCategoryId } = require('../utils/serviceMapping');
const { CacheKeys, cacheQuery, invalidateServiceCache } = require('../utils/cacheIntegration');
const { caches } = require('../utils/cacheManager');

// Use node-fetch if global fetch is not available (Node.js < 18)
let fetch;
if (typeof globalThis.fetch !== 'undefined') {
  fetch = globalThis.fetch;
} else {
  fetch = require('node-fetch');
}

const router = express.Router();

// @route   GET /api/public/services
// @desc    Get all services (public) with pagination
// @access  Public
router.get('/services', asyncHandler(async (req, res) => {
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

  // Cache services list (static data - 1 hour TTL)
  const cacheKey = CacheKeys.servicesList(pageNum, limitNum);
  const result = await cacheQuery(cacheKey, async () => {
    // Get total count
    const countResult = await getRows(`
      SELECT COUNT(*) as total
      FROM services_master
    `);
    const total = parseInt(countResult[0]?.total || 0, 10);
    const totalPages = Math.ceil(total / limitNum);

    // Get paginated services
    const services = await getRows(`
      SELECT id, name, is_paid, created_at
      FROM services_master 
      ORDER BY name
      LIMIT $1 OFFSET $2
    `, [limitNum, offset]);

    return {
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
    };
  }, { cacheType: 'static', ttl: 3600000 }); // 1 hour

  res.json(result);
}));

// @route   GET /api/public/services/:id/providers
// @desc    Get providers for a specific service (public) - sorted by location priority
// @access  Public
router.get('/services/:id/providers', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { page = 1, limit = 10, state, userCity, userState } = req.query;
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;

  // Generate cache key with all relevant parameters
  // Normalize empty strings to 'all' for consistent caching
  const normalizedState = (state && state.trim()) ? state.trim().toLowerCase() : 'all';
  const normalizedCity = (userCity && userCity.trim()) ? userCity.trim().toLowerCase() : 'all';
  const normalizedUserState = (userState && userState.trim()) ? userState.trim().toLowerCase() : 'all';
  
  // Cache key includes all parameters that affect the result (state, city, userState for sorting)
  const cacheKey = CacheKeys.providersByService(id, normalizedState, normalizedCity, pageNum, limitNum, normalizedUserState);
  
  // Wrap ENTIRE query execution in cache - this is critical for performance
  const result = await cacheQuery(cacheKey, async () => {
    let whereClause = 'WHERE ps.service_id = $1 AND ps.payment_status = $2';
    let queryParams = [id, 'active'];
    let paramCount = 3;

    if (normalizedState !== 'all') {
      whereClause += ` AND LOWER(TRIM(COALESCE(a.state, ''))) = LOWER(TRIM($${paramCount}))`;
      queryParams.push(normalizedState);
      paramCount++;
    }

    // Helper function to normalize city names (handles common variations)
    const normalizeCityName = (cityName) => {
      if (!cityName) return null;
      const normalized = (cityName || '').trim().toLowerCase();
      
      // Map common variations to standard names for consistent matching
      const cityVariations = {
        'bangalore': 'bengaluru',
        'bombay': 'mumbai',
        'calcutta': 'kolkata',
        'madras': 'chennai',
        'puna': 'pune',
      };
      
      return cityVariations[normalized] || normalized;
    };

    // Build location-based sorting with case-insensitive matching and variation handling
    // Priority: 1. Same city (and same state), 2. Same state (different city), 3. Others
    // Within each group: Sort by experience DESC, then created_at DESC
    let orderByClause = '';
    if (normalizedCity !== 'all' && normalizedUserState !== 'all') {
      // Normalize user city/state for comparison
      const normalizedUserCity = normalizeCityName(normalizedCity);
      
      // Use CASE statement for location-based sorting
      // Priority 0 = same city AND same state, 1 = same state (different city), 2 = others
      // Handle city variations: check both normalized and original names
      orderByClause = `
        ORDER BY 
          CASE 
            WHEN (
              LOWER(TRIM(COALESCE(a.city, ''))) = $${paramCount}
              OR (LOWER(TRIM(COALESCE(a.city, ''))) = 'bengaluru' AND $${paramCount} = 'bangalore')
              OR (LOWER(TRIM(COALESCE(a.city, ''))) = 'bangalore' AND $${paramCount} = 'bengaluru')
              OR (LOWER(TRIM(COALESCE(a.city, ''))) = 'bombay' AND $${paramCount} = 'mumbai')
              OR (LOWER(TRIM(COALESCE(a.city, ''))) = 'mumbai' AND $${paramCount} = 'bombay')
              OR (LOWER(TRIM(COALESCE(a.city, ''))) = 'calcutta' AND $${paramCount} = 'kolkata')
              OR (LOWER(TRIM(COALESCE(a.city, ''))) = 'kolkata' AND $${paramCount} = 'calcutta')
              OR (LOWER(TRIM(COALESCE(a.city, ''))) = 'madras' AND $${paramCount} = 'chennai')
              OR (LOWER(TRIM(COALESCE(a.city, ''))) = 'chennai' AND $${paramCount} = 'madras')
              OR (LOWER(TRIM(COALESCE(a.city, ''))) = 'puna' AND $${paramCount} = 'pune')
              OR (LOWER(TRIM(COALESCE(a.city, ''))) = 'pune' AND $${paramCount} = 'puna')
            )
            AND LOWER(TRIM(COALESCE(a.state, ''))) = $${paramCount + 1} THEN 0
            WHEN LOWER(TRIM(COALESCE(a.state, ''))) = $${paramCount + 1} THEN 1
            ELSE 2
          END,
          pp.years_of_experience DESC,
          ps.created_at DESC
      `;
      queryParams.push(normalizedUserCity, normalizedUserState);
      paramCount += 2;
    } else if (normalizedUserState !== 'all') {
      // Only state available, sort by same state first
      orderByClause = `
        ORDER BY 
          CASE 
            WHEN LOWER(TRIM(COALESCE(a.state, ''))) = $${paramCount} THEN 0
            ELSE 1
          END,
          pp.years_of_experience DESC,
          ps.created_at DESC
      `;
      queryParams.push(normalizedUserState);
      paramCount++;
    } else {
      // No location info, use default sorting
      orderByClause = 'ORDER BY pp.years_of_experience DESC, ps.created_at DESC';
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
      a.state as state,
      a.city as city,
      sm.name as service_name,
      COALESCE(ROUND(AVG(r.rating)::numeric, 1), 0) as average_rating,
      COUNT(r.id) as total_reviews
    FROM provider_services ps
    JOIN provider_profiles pp ON ps.provider_id = pp.id
    JOIN users u ON pp.user_id = u.id
    JOIN services_master sm ON ps.service_id = sm.id
    LEFT JOIN addresses a ON a.user_id = u.id AND a.type = 'home'
    LEFT JOIN bookings b ON b.provider_service_id = ps.id
    -- PRODUCTION ROOT FIX: Only count user ratings (customers rating providers), not provider ratings
    LEFT JOIN ratings r ON r.booking_id = b.id AND r.rater_type = 'user'
    ${whereClause}
    GROUP BY 
      u.id, u.full_name, u.phone, u.profile_pic_url,
      pp.years_of_experience, pp.service_description,
      ps.id, ps.working_proof_urls, ps.payment_start_date, ps.payment_end_date,
      ps.created_at, a.state, a.city, sm.name
      ${orderByClause}
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `, [...queryParams, limitNum, offset]);

    // Service descriptions mapping based on service category
    const serviceDescriptions = {
    'labors': 'Construction Labor, Brick Loading, Cement Mixing, Site Preparation, Foundation Work',
    'plumber': 'Tap Repair, Pipe Leakage, Bathroom Fitting, Water Tank Installation, Drainage Work',
    'electrician': 'Wiring Installation, Switch & Socket Installation, Fan Installation, MCB Installation',
    'carpenter': 'Door Installation, Window Installation, Furniture Making, Wood Work',
    'painter': 'Interior Painting, Exterior Painting, Wall Texture, Color Consultation',
    'painting': 'Interior Painting, Exterior Painting, Wall Texture, Color Consultation',
    'cleaning': 'House Cleaning, Office Cleaning, Deep Cleaning, Post Construction Cleaning',
    'mason-mastri': 'Brick Work, Cement Work, Wall Construction, Foundation Work',
    'granite-tiles': 'Floor Tiling, Wall Tiling, Granite Installation, Marble Work',
    'painting-cleaning': 'Interior Painting, Exterior Painting, Wall Texture, Color Consultation', // Backward compatibility
    'engineer-interior': 'Interior Design, Space Planning, 3D Visualization, Project Management',
    'interiors-building': 'Interior Design, Furniture Arrangement, Lighting Design, Color Schemes',
    'stainless-steel': 'Kitchen Sink Installation, Railing Work, Gate Installation, Fabrication',
    'contact-building': 'Complete Construction, Building Work, Project Management, Quality Control',
    'borewell': 'Borewell Drilling, Pump Installation, Maintenance, Water Testing'
  };

    // PRODUCTION OPTIMIZATION: Batch fetch all sub-services for pricing
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
              pss.provider_service_id,
              pss.price
            FROM provider_sub_services pss
            WHERE pss.provider_service_id = ANY($1::uuid[])
            ORDER BY pss.provider_service_id, pss.price ASC
          `, [providerServiceIds]);
        }
      } catch (error) {
        logger.warn('Could not fetch sub-services for pricing', { error: error.message });
        allSubServices = [];
      }
    }

    // Group sub-services by provider_service_id and calculate pricing summary
    const pricingByProviderServiceId = new Map();
    allSubServices.forEach(ss => {
      if (!pricingByProviderServiceId.has(ss.provider_service_id)) {
        pricingByProviderServiceId.set(ss.provider_service_id, []);
      }
      pricingByProviderServiceId.get(ss.provider_service_id).push(parseFloat(ss.price));
    });

    // Calculate pricing summary for each provider
    const calculatePricingSummary = (prices) => {
    if (!prices || prices.length === 0) {
      return {
        minPrice: null,
        maxPrice: null,
        priceRange: null,
        displayPrice: 'Price on request',
        subServiceCount: 0
      };
    }

    const validPrices = prices.filter(p => !isNaN(p) && p > 0);
    if (validPrices.length === 0) {
      return {
        minPrice: null,
        maxPrice: null,
        priceRange: null,
        displayPrice: 'Price on request',
        subServiceCount: 0
      };
    }

    const minPrice = Math.min(...validPrices);
    const maxPrice = Math.max(...validPrices);
    const subServiceCount = validPrices.length;

    let displayPrice;
    if (subServiceCount === 1) {
      displayPrice = `₹${minPrice}`;
    } else if (minPrice === maxPrice) {
      displayPrice = `₹${minPrice}`;
    } else {
      displayPrice = `Starting from ₹${minPrice}`;
    }

      return {
        minPrice,
        maxPrice,
        priceRange: minPrice === maxPrice ? minPrice : `${minPrice} - ${maxPrice}`,
        displayPrice,
        subServiceCount
      };
    };

    // Update service descriptions based on service category and normalize rating fields
    const updatedProviders = providers.map(provider => {
    const prices = pricingByProviderServiceId.get(provider.provider_service_id) || [];
    const pricing = calculatePricingSummary(prices);

    return {
      ...provider,
      service_description: serviceDescriptions[provider.service_name] || provider.service_description,
      averageRating: parseFloat(provider.average_rating) || 0,
      totalReviews: parseInt(provider.total_reviews) || 0,
      // Pricing information from sub-services
        pricing: pricing
      };
    });

    // Get total count - use only WHERE clause parameters (not ORDER BY parameters)
    // Create a separate params array for count query that excludes location sorting params
    const countQueryParams = [id, 'active'];
    if (normalizedState !== 'all') {
      countQueryParams.push(normalizedState);
    }
    
    const countResult = await getRow(`
      SELECT COUNT(*) as total
      FROM provider_services ps
      JOIN provider_profiles pp ON ps.provider_id = pp.id
      JOIN users u ON pp.user_id = u.id
      JOIN services_master sm ON ps.service_id = sm.id
      LEFT JOIN addresses a ON a.user_id = u.id AND a.type = 'home'
      ${whereClause}
    `, countQueryParams);

    const total = parseInt(countResult.total);
    const totalPages = Math.ceil(total / limitNum);

    // Log if no providers found for debugging
    if (updatedProviders.length === 0) {
      logger.info('No providers found', { 
        serviceId: id, 
        paymentStatus: 'active',
        state: normalizedState,
        totalInDb: total
      });
    }

    return {
      status: 'success',
      data: {
        providers: updatedProviders,
        pagination: {
          currentPage: pageNum,
          totalPages,
          total,
          limit: limitNum
        }
      }
    };
  }, { cacheType: 'semiStatic', ttl: 900000 }); // 15 minutes - Critical: This wraps ALL database queries

  res.json(result);
}));

// @route   GET /api/public/services/:id/providers/:providerId
// @desc    Get specific provider details for a service (public)
// @access  Public
router.get('/services/:id/providers/:providerId', asyncHandler(async (req, res) => {
  const { id, providerId } = req.params;

  // Cache provider details (semi-static - 10 minutes TTL)
  const cacheKey = CacheKeys.providerDetails(id, providerId);
  const result = await cacheQuery(cacheKey, async () => {
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
      ps.payment_end_date,
      sm.name as service_name
    FROM provider_services ps
    JOIN provider_profiles pp ON ps.provider_id = pp.id
    JOIN users u ON pp.user_id = u.id
    JOIN services_master sm ON ps.service_id = sm.id
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
          pss.sub_service_id,
          pss.price,
          pss.created_at,
          pss.updated_at
        FROM provider_sub_services pss
        WHERE pss.provider_service_id = $1
          AND pss.sub_service_id IS NOT NULL
        ORDER BY pss.created_at ASC
      `, [providerId]);
    }
  } catch (error) {
    // Table doesn't exist yet - return empty array
    logger.warn('provider_sub_services table does not exist yet', { error: error.message });
    subServices = [];
  }

  // Service descriptions mapping based on service category
  const serviceDescriptions = {
    'labors': 'Construction Labor, Brick Loading, Cement Mixing, Site Preparation, Foundation Work',
    'plumber': 'Tap Repair, Pipe Leakage, Bathroom Fitting, Water Tank Installation, Drainage Work',
    'electrician': 'Wiring Installation, Switch & Socket Installation, Fan Installation, MCB Installation',
    'carpenter': 'Door Installation, Window Installation, Furniture Making, Wood Work',
    'painter': 'Interior Painting, Exterior Painting, Wall Texture, Color Consultation',
    'painting': 'Interior Painting, Exterior Painting, Wall Texture, Color Consultation',
    'cleaning': 'House Cleaning, Office Cleaning, Deep Cleaning, Post Construction Cleaning',
    'mason-mastri': 'Brick Work, Cement Work, Wall Construction, Foundation Work',
    'granite-tiles': 'Floor Tiling, Wall Tiling, Granite Installation, Marble Work',
    'painting-cleaning': 'Interior Painting, Exterior Painting, Wall Texture, Color Consultation', // Backward compatibility
    'engineer-interior': 'Interior Design, Space Planning, 3D Visualization, Project Management',
    'interiors-building': 'Interior Design, Furniture Arrangement, Lighting Design, Color Schemes',
    'stainless-steel': 'Kitchen Sink Installation, Railing Work, Gate Installation, Fabrication',
    'contact-building': 'Complete Construction, Building Work, Project Management, Quality Control',
    'borewell': 'Borewell Drilling, Pump Installation, Maintenance, Water Testing'
  };

    // Update service description based on service category
    const updatedProvider = {
      ...provider,
      service_description: serviceDescriptions[provider.service_name] || provider.service_description
    };

    // Get provider's ratings
    // PRODUCTION ROOT FIX: Use b.provider_id instead of b.provider_service_id
    // This ensures ratings remain visible even after service deletion
    // First get the provider_id from provider_service_id
    let providerServiceInfo = await getRow(`
      SELECT provider_id FROM provider_services WHERE id = $1
    `, [providerId]);
    
    let ratings = [];
    if (providerServiceInfo && providerServiceInfo.provider_id) {
        // PRODUCTION ROOT FIX: Use LEFT JOIN and stored customer_name to handle deleted accounts
        // Only show user ratings (customers rating providers), not provider ratings
        ratings = await getRows(`
          SELECT 
            r.rating, 
            r.review, 
            r.created_at, 
            COALESCE(b.customer_name, u.full_name, 'Customer') as customer_name
          FROM ratings r
          JOIN bookings b ON r.booking_id = b.id
          LEFT JOIN users u ON b.user_id = u.id
          WHERE b.provider_id = $1 AND r.rater_type = 'user'
          ORDER BY r.created_at DESC
          LIMIT 10
        `, [providerServiceInfo.provider_id]);
    } else {
      // If service is deleted, try to get provider_id from bookings table
      const bookingInfo = await getRow(`
        SELECT DISTINCT provider_id FROM bookings WHERE provider_service_id = $1 LIMIT 1
      `, [providerId]);
      
      if (bookingInfo && bookingInfo.provider_id) {
        // PRODUCTION ROOT FIX: Use LEFT JOIN and stored customer_name to handle deleted accounts
        // Only show user ratings (customers rating providers), not provider ratings
        ratings = await getRows(`
          SELECT 
            r.rating, 
            r.review, 
            r.created_at, 
            COALESCE(b.customer_name, u.full_name, 'Customer') as customer_name
          FROM ratings r
          JOIN bookings b ON r.booking_id = b.id
          LEFT JOIN users u ON b.user_id = u.id
          WHERE b.provider_id = $1 AND r.rater_type = 'user'
          ORDER BY r.created_at DESC
          LIMIT 10
        `, [bookingInfo.provider_id]);
      }
    }

    // Calculate average rating
    const avgRating = ratings.length > 0 
      ? ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length 
      : 0;

    return {
      status: 'success',
      data: {
        provider: {
          ...updatedProvider,
          serviceDescription: serviceDescriptions[provider.service_name] || provider.service_description,
          averageRating: Math.round(avgRating * 10) / 10,
          totalReviews: ratings.length,
          sub_services: subServices.map(ss => ({
            id: ss.id,
            serviceId: ss.sub_service_id, // Use sub_service_id directly (frontend identifier)
            serviceName: ss.sub_service_id, // For now, use sub_service_id as name
            price: parseFloat(ss.price),
            createdAt: ss.created_at,
            updatedAt: ss.updated_at
          })),
          ratings
        }
      }
    };
  }, { cacheType: 'semiStatic', ttl: 600000 }); // 10 minutes

  res.json(result);
}));

// @route   GET /api/public/provider-service/:providerServiceId
// @desc    Get provider details by provider service ID (public)
// @access  Public
router.get('/provider-service/:providerServiceId', asyncHandler(async (req, res) => {
  const { providerServiceId } = req.params;

  // Use optimized database query
  const provider = await DatabaseOptimizer.getProviderWithRatings(providerServiceId);

  if (!provider) {
    throw new NotFoundError('Provider service', providerServiceId);
  }

  res.json({
    status: 'success',
    data: {
      provider
    }
  });
}));

// @route   GET /api/public/featured-providers
// @desc    Get random featured providers (public)
// @access  Public
router.get('/featured-providers', asyncHandler(async (req, res) => {
  // Cache this endpoint for 5 minutes (public data, changes infrequently)
  const cacheKey = CacheKeys.featuredProviders();
  const result = await cacheQuery(cacheKey, async () => {
    // OPTIMIZATION: Use a more efficient random selection method
    // Instead of ORDER BY RANDOM() on the full table (which scans entire table),
    // we use a CTE to get random IDs first, then join to get full data
    // This is much faster on large tables
    
    const providers = await getRows(`
      WITH random_providers AS (
        SELECT ps.id
        FROM provider_services ps
        JOIN provider_profiles pp ON ps.provider_id = pp.id
        WHERE ps.payment_status = 'active'
        ORDER BY RANDOM()
        LIMIT 10
      )
      SELECT 
        ps.id as provider_service_id,
        u.full_name,
        sm.name as service_name,
        ps.working_proof_urls,
        u.profile_pic_url
      FROM random_providers rp
      JOIN provider_services ps ON rp.id = ps.id
      JOIN provider_profiles pp ON ps.provider_id = pp.id
      JOIN users u ON pp.user_id = u.id
      JOIN services_master sm ON ps.service_id = sm.id
    `);
    
    // OPTIMIZATION: Batch fetch all ratings in a single query instead of N+1 queries
    if (providers.length === 0) {
      return { providers: [] };
    }
    
    const providerServiceIds = providers.map(p => p.provider_service_id);
    
    // PRODUCTION ROOT FIX: Get provider_id for each provider_service_id
    // Then calculate ratings based on provider_id instead of provider_service_id
    // This ensures ratings remain accurate even after service deletion
    const providerServiceMap = await getRows(`
      SELECT id, provider_id FROM provider_services WHERE id = ANY($1::uuid[])
    `, [providerServiceIds]);
    
    const providerIds = [...new Set(providerServiceMap.map(ps => ps.provider_id).filter(Boolean))];
    
    let ratingsData = [];
    if (providerIds.length > 0) {
      ratingsData = await getRows(`
        SELECT 
          b.provider_id,
          COUNT(r.rating) as total_reviews,
          COALESCE(AVG(r.rating), 0) as average_rating
        FROM bookings b
        -- PRODUCTION ROOT FIX: Only count user ratings (customers rating providers)
        LEFT JOIN ratings r ON r.booking_id = b.id AND r.rater_type = 'user'
        WHERE b.provider_id = ANY($1::uuid[])
        GROUP BY b.provider_id
      `, [providerIds]);
    }
    
    // Create a map from provider_service_id to provider_id
    const serviceToProviderMap = {};
    providerServiceMap.forEach(ps => {
      serviceToProviderMap[ps.id] = ps.provider_id;
    });
    
    // Create a map from provider_id to ratings
    const providerRatingsMap = {};
    ratingsData.forEach(rating => {
      providerRatingsMap[rating.provider_id] = {
        total_reviews: rating.total_reviews,
        average_rating: rating.average_rating
      };
    });
    
    // Map ratings back to provider_service_id for compatibility
    const ratingsMap = {};
    providerServiceIds.forEach(serviceId => {
      const providerId = serviceToProviderMap[serviceId];
      const ratingData = providerRatingsMap[providerId] || { total_reviews: 0, average_rating: 0 };
      ratingsMap[serviceId] = {
        totalReviews: parseInt(ratingData.total_reviews || 0, 10),
        averageRating: Math.round(parseFloat(ratingData.average_rating || 0) * 10) / 10
      };
    });
    
    // Combine providers with their ratings
    const providersWithRatings = providers.map(provider => {
      const ratingData = ratingsMap[provider.provider_service_id] || {
        totalReviews: 0,
        averageRating: 0
      };
      return {
        ...provider,
        averageRating: ratingData.averageRating,
        totalReviews: ratingData.totalReviews
      };
    });
    
    return { providers: providersWithRatings };
  }, { cacheType: 'static', ttl: 300000 }); // 5 minutes cache

  res.json({
    status: 'success',
    data: result
  });
}));

// @route   GET /api/public/reverse-geocode
// @desc    Reverse geocode coordinates to get state and city using LocationIQ
// @access  Public
router.get('/reverse-geocode', asyncHandler(async (req, res) => {
  const { latitude, longitude } = req.query;

  // Validate inputs
  if (!latitude || !longitude) {
    throw new ValidationError('Latitude and longitude are required');
  }

  const lat = parseFloat(latitude);
  const lon = parseFloat(longitude);

  if (isNaN(lat) || isNaN(lon)) {
    throw new ValidationError('Latitude and longitude must be valid numbers');
  }

  if (lat < -90 || lat > 90) {
    throw new ValidationError('Latitude must be between -90 and 90');
  }

  if (lon < -180 || lon > 180) {
    throw new ValidationError('Longitude must be between -180 and 180');
  }

  // Get LocationIQ API key from config
  const locationIQConfig = config.getLocationIQConfig();
  const apiKey = locationIQConfig?.apiKey;

  if (!apiKey) {
    logger.error('LocationIQ API key not configured');
    throw new Error('Location service is not configured. Please contact support.');
  }

  try {
    // Call LocationIQ reverse geocoding API
    const locationIQUrl = `https://us1.locationiq.com/v1/reverse.php?key=${apiKey}&lat=${lat}&lon=${lon}&format=json&addressdetails=1`;
    
    const response = await fetch(locationIQUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = 'Failed to fetch location details';
      
      try {
        const errorData = JSON.parse(errorText);
        errorMessage = errorData.error || errorMessage;
      } catch {
        // If parsing fails, use default message
      }

      if (response.status === 429) {
        errorMessage = 'Location service is temporarily unavailable. Please try again later.';
      }

      logger.error('LocationIQ API error', {
        status: response.status,
        statusText: response.statusText,
        error: errorMessage,
      });

      throw new Error(errorMessage);
    }

    const data = await response.json();
    
    // Extract state and city from LocationIQ response
    const address = data.address || {};
    
    // LocationIQ returns different field names for different regions
    // For India: state, city, town, village, district
    const state = 
      address.state || 
      address.region || 
      address.province || 
      address.state_district || 
      '';
    
    const city = 
      address.city || 
      address.town || 
      address.village || 
      address.county || 
      address.district || 
      '';

    if (!state && !city) {
      throw new Error('Could not determine location from coordinates');
    }

    res.json({
      status: 'success',
      data: {
        state: state || 'Unknown',
        city: city || 'Unknown',
        latitude: lat,
        longitude: lon,
      }
    });
  } catch (error) {
    logger.error('Reverse geocoding error', {
      latitude: lat,
      longitude: lon,
      error: error.message,
    });

    // Re-throw validation errors as-is
    if (error instanceof ValidationError) {
      throw error;
    }

    // Wrap other errors
    throw new Error(error.message || 'Failed to fetch location details');
  }
}));

module.exports = router; 
