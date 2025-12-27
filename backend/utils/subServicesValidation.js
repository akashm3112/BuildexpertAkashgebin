/**
 * Sub-Services Validation Utility
 * 
 * Validates sub-services based on the main service category
 * Uses the same mapping as frontend to ensure consistency
 */

// Mapping of main service categories to their related sub-services
// This MUST match the frontend mapping in serviceSubServices.ts
// Frontend sends sub-service IDs like 'room-painting', 'fancy-wall-painting', etc.
const SERVICE_SUB_SERVICES_MAP = {
  // Painting related sub-services
  'painting': [
    'room-painting',
    'fancy-wall-painting',
    'wall-striking',
    'full-house-painting',
    'wall-panelling',
  ],
  // Engineer/Interior related sub-services
  'engineer-interior': [
    '2d-planning-floor',
    'structural-planning',
    '3d-house-elevation',
    'interior-design',
    'shop-interior-planning',
  ],
  // Plumber related sub-services
  'plumber': [
    'sanitary-pit-construction',
    'bathroom-fixing-cleaning',
    'a-to-z-plumbing-contract',
    'tap-installation',
    'shower-installation',
  ],
  // Granite & Tiles related sub-services
  'granite-tiles': [
    'wall-fitting',
    'floor-fitting',
    'parking-tile-fitting',
    'granite-fitting',
    'broken-tile-fitting',
    'wall-stickering',
    'a-to-z-tiles-contract',
  ],
  // Contact & Building related sub-services
  'contact-building': [
    'general-contractor',
    'prime-contractor',
    'speciality-trade-contractor',
    'design-build-contractor',
    'residential-commercial-contractor',
  ],
  // Labor related sub-services
  'labor': [
    'per-hour-charges',
  ],
  // Mason/Mastri related sub-services
  'mason-mastri': [
    'per-sqft-construction',
  ],
  // Interiors of the Building related sub-services
  'interiors-building': [
    'shop-interior',
    'kitchen-interior',
    'room-interior',
    'top-interior',
    'a-to-z-interior',
  ],
  // Stainless Steel related sub-services
  'stainless-steel': [
    'ss-fitting',
    'ms-fitting',
    'ss-with-glass-fitting',
  ],
  // Cleaning related sub-services
  'cleaning': [
    'sump-cleaning',
    'tank-cleaning',
    'bathroom-cleaning',
    'total-house-cleaning',
  ],
  // Glass & Mirror related sub-services
  'glass-mirror': [
    'glass-fitting',
    'mirror-fitting',
  ],
  // Borewell related sub-services
  'borewell': [
    'regular-borewell-drilling',
    'premium-borewell-drilling',
  ],
};

const { getDatabaseServiceName } = require('./serviceMapping');

/**
 * Get related sub-services for a main service category
 * @param {string} mainServiceCategoryId - Frontend category ID (e.g., 'painting')
 * @returns {string[]} Array of related sub-service category IDs
 */
const getRelatedSubServices = (mainServiceCategoryId) => {
  return SERVICE_SUB_SERVICES_MAP[mainServiceCategoryId] || [];
};

/**
 * Check if a sub-service is valid for a main service
 * @param {string} mainServiceCategoryId - Frontend category ID
 * @param {string} subServiceCategoryId - Sub-service category ID to validate
 * @returns {boolean} True if valid
 */
const isValidSubService = (mainServiceCategoryId, subServiceCategoryId) => {
  const relatedServices = getRelatedSubServices(mainServiceCategoryId);
  return relatedServices.includes(subServiceCategoryId);
};

/**
 * Validate sub-services array
 * @param {Array} subServices - Array of { serviceId: string, price: number|string }
 * @param {string} mainServiceCategoryId - Main service category ID
 * @returns {Object} { valid: boolean, errors: string[] }
 */
const validateSubServices = (subServices, mainServiceCategoryId) => {
  const errors = [];

  // Check if subServices is provided and is an array
  if (!Array.isArray(subServices)) {
    errors.push('Sub-services must be an array');
    return { valid: false, errors };
  }

  // At least one sub-service is required
  if (subServices.length === 0) {
    errors.push('At least one sub-service is required');
    return { valid: false, errors };
  }

  // Validate each sub-service
  const seenServiceIds = new Set();
  
  for (let i = 0; i < subServices.length; i++) {
    const subService = subServices[i];
    const index = i + 1;

    // Check required fields
    if (!subService.serviceId || typeof subService.serviceId !== 'string' || subService.serviceId.trim() === '') {
      errors.push(`Sub-service ${index}: Service ID is required`);
      continue;
    }

    // Check for duplicates
    if (seenServiceIds.has(subService.serviceId)) {
      errors.push(`Sub-service ${index}: Duplicate service "${subService.serviceId}" is not allowed`);
      continue;
    }
    seenServiceIds.add(subService.serviceId);

    // Check if sub-service is related to main service
    if (!isValidSubService(mainServiceCategoryId, subService.serviceId)) {
      errors.push(`Sub-service ${index}: Service "${subService.serviceId}" is not a valid sub-service for "${mainServiceCategoryId}"`);
      continue;
    }

    // Check price
    if (subService.price === undefined || subService.price === null || subService.price === '') {
      errors.push(`Sub-service ${index}: Price is required`);
      continue;
    }

    const price = parseFloat(subService.price);
    if (isNaN(price) || price <= 0) {
      errors.push(`Sub-service ${index}: Price must be a positive number`);
      continue;
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
};

module.exports = {
  getRelatedSubServices,
  isValidSubService,
  validateSubServices,
  getDatabaseServiceName,
  SERVICE_SUB_SERVICES_MAP
};

