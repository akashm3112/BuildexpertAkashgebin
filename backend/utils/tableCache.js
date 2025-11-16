const { query } = require('../database/connection');
const logger = require('./logger');

/**
 * Table existence cache to reduce repeated database queries
 * Cache TTL: 15 minutes (900000ms)
 */
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes
const tableCache = new Map();

/**
 * Check if a table exists (with caching)
 * @param {string} tableName - Full table name (e.g., 'public.users')
 * @returns {Promise<boolean>}
 */
const tableExists = async (tableName) => {
  const cacheKey = tableName.toLowerCase();
  const cached = tableCache.get(cacheKey);
  
  // Return cached result if still valid
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.exists;
  }
  
  try {
    const result = await query(`SELECT to_regclass($1) as table_name`, [tableName]);
    const exists = !!result.rows[0]?.table_name;
    
    // Cache the result
    tableCache.set(cacheKey, {
      exists,
      timestamp: Date.now()
    });
    
    return exists;
  } catch (error) {
    logger.warn('Failed to check table existence', { tableName, error: error.message });
    return false;
  }
};

/**
 * Clear the table cache (useful for testing or after schema changes)
 */
const clearTableCache = () => {
  tableCache.clear();
};

/**
 * Preload table existence checks for common tables
 * Call this on application startup
 */
const preloadTableCache = async () => {
  const commonTables = [
    'public.users',
    'public.provider_profiles',
    'public.bookings',
    'public.user_reports_providers',
    'public.provider_reports_users',
    'public.provider_reports',
    'public.payment_transactions'
  ];
  
  await Promise.all(commonTables.map(table => tableExists(table)));
  logger.info('Table cache preloaded', { tables: commonTables.length });
};

module.exports = {
  tableExists,
  clearTableCache,
  preloadTableCache
};

