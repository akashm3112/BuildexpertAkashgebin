/**
 * Service Mapping Utility
 * Maps between frontend category IDs and database service names
 */

// Map frontend category IDs to database service names
const categoryToServiceMap = {
  'labor': 'labors',
  'plumber': 'plumber',
  'mason-mastri': 'mason-mastri',
  'painting-cleaning': 'painting',
  'painting': 'painting',
  'cleaning': 'cleaning',
  'granite-tiles': 'granite-tiles',
  'engineer-interior': 'engineer-interior',
  'electrician': 'electrician',
  'carpenter': 'carpenter',
  'painter': 'painting',
  'interiors-building': 'interiors-building',
  'stainless-steel': 'stainless-steel',
  'contact-building': 'contact-building',
  'glass-mirror': 'glass-mirror',
  'borewell': 'borewell'
};

// Reverse map: database service names to frontend category IDs
const serviceToCategoryMap = Object.entries(categoryToServiceMap).reduce((acc, [categoryId, serviceName]) => {
  // Handle multiple category IDs mapping to same service name
  if (!acc[serviceName] || categoryId === serviceName) {
    acc[serviceName] = categoryId;
  }
  return acc;
}, {});

/**
 * Convert frontend category ID to database service name
 * @param {string} categoryId - Frontend category ID
 * @returns {string} Database service name
 */
const getDatabaseServiceName = (categoryId) => {
  return categoryToServiceMap[categoryId] || categoryId;
};

/**
 * Convert database service name to frontend category ID
 * @param {string} serviceName - Database service name
 * @returns {string} Frontend category ID
 */
const getFrontendCategoryId = (serviceName) => {
  return serviceToCategoryMap[serviceName] || serviceName;
};

module.exports = {
  categoryToServiceMap,
  serviceToCategoryMap,
  getDatabaseServiceName,
  getFrontendCategoryId
};

