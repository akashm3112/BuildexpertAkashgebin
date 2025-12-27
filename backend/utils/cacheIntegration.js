/**
 * Cache Integration Utilities
 * 
 * Provides easy-to-use caching functions for routes and services
 */

const { caches, CacheHelpers } = require('./cacheManager');
const logger = require('./logger');

/**
 * Cache keys generator
 */
const CacheKeys = {
  // Services
  servicesList: (page, limit) => `services:list:${page}:${limit}`,
  servicesCount: () => `services:count`,
  serviceById: (id) => `services:id:${id}`,
  serviceByName: (name) => `services:name:${name}`,
  
  // Providers
  providersByService: (serviceId, state, city, page, limit, userState) => 
    `providers:service:${serviceId}:state:${state || 'all'}:city:${city || 'all'}:userState:${userState || 'all'}:page:${page}:limit:${limit}`,
  providerDetails: (serviceId, providerId) => `providers:details:${serviceId}:${providerId}`,
  providerRegistrations: (userId) => `providers:registrations:${userId}`,
  
  // Sub-services
  subServicesByProvider: (providerServiceId) => `subservices:provider:${providerServiceId}`,
  subServicesByService: (serviceId) => `subservices:service:${serviceId}`,
  
  // Admin stats
  adminStats: () => `admin:stats`,
  adminReportStats: () => `admin:reportStats`,
  
  // Earnings
  earnings: (providerId) => `earnings:provider:${providerId}`,
  
  // Ratings
  ratingsByProvider: (providerServiceId) => `ratings:provider:${providerServiceId}`,
  
  // Static data
  serviceMappings: () => `static:serviceMappings`,
  serviceDescriptions: () => `static:serviceDescriptions`,
};

/**
 * Cache middleware for routes
 */
function cacheRoute(cacheType = 'semiStatic', ttl = null) {
  return async (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }
    
    // Generate cache key from route and query params
    const cacheKey = `${req.path}:${JSON.stringify(req.query)}`;
    const cache = caches[cacheType] || caches.semiStatic;
    
    // Check cache
    const cached = cache.get(cacheKey, { ttl });
    if (cached !== null) {
      res.set('X-Cache', 'HIT');
      res.set('X-Cache-Type', cacheType);
      return res.json(cached);
    }
    
    // Cache miss - proceed with request
    res.set('X-Cache', 'MISS');
    res.set('X-Cache-Type', cacheType);
    
    // Override res.json to cache the response
    const originalJson = res.json.bind(res);
    res.json = function(data) {
      // Only cache successful responses
      if (res.statusCode === 200 && data && data.status === 'success') {
        const options = ttl ? { ttl } : {};
        cache.set(cacheKey, data, options);
      }
      return originalJson(data);
    };
    
    next();
  };
}

/**
 * Cache helper for database queries
 */
async function cacheQuery(key, queryFn, options = {}) {
  const cacheType = options.cacheType || 'semiStatic';
  const ttl = options.ttl;
  const cache = caches[cacheType];
  
  return CacheHelpers.cached(key, queryFn, { cache, ttl });
}

/**
 * Invalidate cache by pattern
 */
function invalidateCache(pattern, cacheType = null) {
  const cacheTypes = cacheType ? [caches[cacheType]] : Object.values(caches);
  let totalDeleted = 0;
  
  cacheTypes.forEach(cache => {
    if (cache && typeof cache.deletePattern === 'function') {
      totalDeleted += cache.deletePattern(pattern);
    }
  });
  
  logger.info('Cache invalidated', { pattern, totalDeleted });
  return totalDeleted;
}

/**
 * Invalidate user-specific cache
 */
function invalidateUserCache(userId) {
  const patterns = [
    `.*:${userId}.*`,
    `.*registrations:${userId}.*`,
    `.*earnings:provider:${userId}.*`
  ];
  
  let totalDeleted = 0;
  patterns.forEach(pattern => {
    totalDeleted += invalidateCache(pattern, 'user');
    totalDeleted += invalidateCache(pattern, 'semiStatic');
  });
  
  return totalDeleted;
}

/**
 * Invalidate service-related cache
 */
function invalidateServiceCache(serviceId) {
  const patterns = [
    `.*service:${serviceId}.*`,
    `.*services:id:${serviceId}.*`,
    `.*providers:service:${serviceId}.*`
  ];
  
  let totalDeleted = 0;
  patterns.forEach(pattern => {
    totalDeleted += invalidateCache(pattern);
  });
  
  return totalDeleted;
}

/**
 * Invalidate provider cache
 */
function invalidateProviderCache(providerId) {
  const patterns = [
    `.*provider:${providerId}.*`,
    `.*providers:details:.*:${providerId}.*`
  ];
  
  let totalDeleted = 0;
  patterns.forEach(pattern => {
    totalDeleted += invalidateCache(pattern);
  });
  
  return totalDeleted;
}

module.exports = {
  CacheKeys,
  cacheRoute,
  cacheQuery,
  invalidateCache,
  invalidateUserCache,
  invalidateServiceCache,
  invalidateProviderCache
};

