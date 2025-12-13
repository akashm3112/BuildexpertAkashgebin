/**
 * Sub-Services Validation Utility
 * 
 * Validates sub-services based on the main service category
 * Uses the same mapping as frontend to ensure consistency
 */

// Mapping of main service categories to their related sub-services
// This should match the frontend mapping in serviceSubServices.ts
const SERVICE_SUB_SERVICES_MAP = {
  'painting': ['plumber', 'cleaning', 'glass-mirror', 'interiors-building'],
  'engineer-interior': ['plumber', 'granite-tiles', 'painting', 'mason-mastri', 'stainless-steel', 'glass-mirror', 'interiors-building', 'cleaning'],
  'plumber': ['mason-mastri', 'borewell', 'cleaning', 'contact-building'],
  'granite-tiles': ['mason-mastri', 'plumber', 'cleaning', 'interiors-building'],
  'contact-building': ['mason-mastri', 'plumber', 'granite-tiles', 'painting', 'stainless-steel', 'borewell'],
  'labor': ['mason-mastri', 'plumber', 'cleaning', 'contact-building'],
  'mason-mastri': ['plumber', 'granite-tiles', 'painting', 'contact-building', 'stainless-steel'],
  'interiors-building': ['painting', 'glass-mirror', 'granite-tiles', 'cleaning', 'stainless-steel'],
  'stainless-steel': ['mason-mastri', 'plumber', 'contact-building', 'cleaning'],
  'cleaning': ['plumber', 'glass-mirror'],
  'glass-mirror': ['cleaning', 'interiors-building', 'painting'],
  'borewell': ['plumber', 'mason-mastri', 'cleaning'],
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

