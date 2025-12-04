const express = require('express');
const { getRow, getRows } = require('../database/connection');
const DatabaseOptimizer = require('../utils/databaseOptimization');
const logger = require('../utils/logger');
const { asyncHandler } = require('../middleware/errorHandler');
const { NotFoundError, ValidationError } = require('../utils/errorTypes');
const config = require('../utils/config');

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

// @route   GET /api/public/services/:id/providers
// @desc    Get providers for a specific service (public)
// @access  Public
router.get('/services/:id/providers', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { page = 1, limit = 10, state } = req.query;
  const offset = (page - 1) * limit;

  let whereClause = 'WHERE ps.service_id = $1 AND ps.payment_status = $2';
  let queryParams = [id, 'active'];
  let paramCount = 3;

  if (state) {
    whereClause += ` AND a.state = $${paramCount}`;
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
      a.state as state,
      sm.name as service_name
    FROM provider_services ps
    JOIN provider_profiles pp ON ps.provider_id = pp.id
    JOIN users u ON pp.user_id = u.id
    JOIN services_master sm ON ps.service_id = sm.id
    LEFT JOIN addresses a ON a.user_id = u.id AND a.type = 'home'
    ${whereClause}
    ORDER BY pp.years_of_experience DESC, ps.created_at DESC
    LIMIT $${paramCount} OFFSET $${paramCount + 1}
  `, [...queryParams, limit, offset]);

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

  // Update service descriptions based on service category
  const updatedProviders = providers.map(provider => ({
    ...provider,
    service_description: serviceDescriptions[provider.service_name] || provider.service_description
  }));

  // Get total count
  const countResult = await getRow(`
    SELECT COUNT(*) as total
    FROM provider_services ps
    JOIN provider_profiles pp ON ps.provider_id = pp.id
    JOIN users u ON pp.user_id = u.id
    JOIN services_master sm ON ps.service_id = sm.id
    LEFT JOIN addresses a ON a.user_id = u.id AND a.type = 'home'
    ${whereClause}
  `, queryParams);

  const total = parseInt(countResult.total);
  const totalPages = Math.ceil(total / limit);

  // Log if no providers found for debugging
  if (updatedProviders.length === 0) {
    logger.info('No providers found', { 
      serviceId: id, 
      paymentStatus: 'active',
      state: state || 'all',
      totalInDb: total
    });
  }

  res.json({
    status: 'success',
    data: {
      providers: updatedProviders,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        total,
        limit: parseInt(limit)
      }
    }
  });
}));

// @route   GET /api/public/services/:id/providers/:providerId
// @desc    Get specific provider details for a service (public)
// @access  Public
router.get('/services/:id/providers/:providerId', asyncHandler(async (req, res) => {
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
        ...updatedProvider,
        ratings,
        averageRating: Math.round(avgRating * 10) / 10,
        totalReviews: ratings.length
      }
    }
  });
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
  const providers = await getRows(`
    SELECT 
      ps.id as provider_service_id,
      u.full_name,
      sm.name as service_name,
      ps.working_proof_urls,
      ps.service_charge_value,
      ps.service_charge_unit,
      u.profile_pic_url
    FROM provider_services ps
    JOIN provider_profiles pp ON ps.provider_id = pp.id
    JOIN users u ON pp.user_id = u.id
    JOIN services_master sm ON ps.service_id = sm.id
    WHERE ps.payment_status = 'active'
    ORDER BY RANDOM()
    LIMIT 10
  `);

  // For each provider, fetch ratings and calculate averageRating and totalReviews
  const providersWithRatings = await Promise.all(providers.map(async (provider) => {
    const ratings = await getRows(`
      SELECT r.rating
      FROM ratings r
      JOIN bookings b ON r.booking_id = b.id
      WHERE b.provider_service_id = $1
    `, [provider.provider_service_id]);
    const avgRating = ratings.length > 0
      ? ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length
      : 0;
    return {
      ...provider,
      averageRating: Math.round(avgRating * 10) / 10,
      totalReviews: ratings.length
    };
  }));

  res.json({
    status: 'success',
    data: { providers: providersWithRatings }
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
