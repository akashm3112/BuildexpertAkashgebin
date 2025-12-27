/**
 * Production-Grade Cache Manager
 * 
 * Features:
 * - LRU eviction for memory management
 * - Cache versioning for invalidation
 * - TTL support with automatic cleanup
 * - Cache statistics and monitoring
 * - Graceful degradation on errors
 * - Memory limits and size tracking
 */

const logger = require('./logger');

class CacheManager {
  constructor(options = {}) {
    this.maxSize = options.maxSize || 10000; // Maximum number of entries
    this.defaultTTL = options.defaultTTL || 300000; // 5 minutes default
    this.cleanupInterval = options.cleanupInterval || 60000; // 1 minute
    
    // Cache storage: Map with LRU tracking
    this.cache = new Map();
    this.accessOrder = new Map(); // Track access order for LRU
    this.accessCounter = 0;
    
    // Statistics
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0,
      errors: 0
    };
    
    // Cache version for invalidation
    this.cacheVersion = 1;
    
    // Start cleanup interval
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.cleanupInterval);
  }

  /**
   * Generate cache key with version
   */
  _generateKey(key, version = null) {
    const v = version !== null ? version : this.cacheVersion;
    return `v${v}:${key}`;
  }

  /**
   * Update access order for LRU
   */
  _updateAccessOrder(key) {
    this.accessCounter++;
    this.accessOrder.set(key, this.accessCounter);
  }

  /**
   * Evict least recently used entries
   */
  _evictLRU(count = 1) {
    if (this.cache.size <= this.maxSize) return;
    
    // Sort by access order (oldest first)
    const sortedEntries = Array.from(this.accessOrder.entries())
      .sort((a, b) => a[1] - b[1]);
    
    let evicted = 0;
    for (const [key] of sortedEntries) {
      if (evicted >= count) break;
      if (this.cache.has(key)) {
        this.cache.delete(key);
        this.accessOrder.delete(key);
        this.stats.evictions++;
        evicted++;
      }
    }
  }

  /**
   * Get value from cache
   */
  get(key, options = {}) {
    try {
      const version = options.version !== undefined ? options.version : null;
      const cacheKey = this._generateKey(key, version);
      const item = this.cache.get(cacheKey);
      
      if (!item) {
        this.stats.misses++;
        return null;
      }
      
      // Check expiration
      if (Date.now() > item.expires) {
        this.cache.delete(cacheKey);
        this.accessOrder.delete(cacheKey);
        this.stats.misses++;
        return null;
      }
      
      // Update access order
      this._updateAccessOrder(cacheKey);
      this.stats.hits++;
      
      return item.value;
    } catch (error) {
      this.stats.errors++;
      logger.error('Cache get error', { key, error: error.message });
      return null; // Graceful degradation
    }
  }

  /**
   * Set value in cache
   */
  set(key, value, options = {}) {
    try {
      const ttl = options.ttl !== undefined ? options.ttl : this.defaultTTL;
      const version = options.version !== undefined ? options.version : null;
      const cacheKey = this._generateKey(key, version);
      
      // Evict if needed
      if (this.cache.size >= this.maxSize) {
        this._evictLRU(Math.ceil(this.maxSize * 0.1)); // Evict 10%
      }
      
      this.cache.set(cacheKey, {
        value,
        expires: Date.now() + ttl,
        createdAt: Date.now(),
        ttl
      });
      
      this._updateAccessOrder(cacheKey);
      this.stats.sets++;
      
      return true;
    } catch (error) {
      this.stats.errors++;
      logger.error('Cache set error', { key, error: error.message });
      return false; // Graceful degradation
    }
  }

  /**
   * Delete specific key(s)
   */
  delete(key) {
    try {
      // Delete all versions of the key
      const keysToDelete = [];
      for (const cacheKey of this.cache.keys()) {
        if (cacheKey.endsWith(`:${key}`) || cacheKey === key) {
          keysToDelete.push(cacheKey);
        }
      }
      
      keysToDelete.forEach(k => {
        this.cache.delete(k);
        this.accessOrder.delete(k);
        this.stats.deletes++;
      });
      
      return keysToDelete.length > 0;
    } catch (error) {
      this.stats.errors++;
      logger.error('Cache delete error', { key, error: error.message });
      return false;
    }
  }

  /**
   * Delete by pattern (for invalidation)
   */
  deletePattern(pattern) {
    try {
      const regex = new RegExp(pattern);
      const keysToDelete = [];
      
      for (const key of this.cache.keys()) {
        if (regex.test(key)) {
          keysToDelete.push(key);
        }
      }
      
      keysToDelete.forEach(k => {
        this.cache.delete(k);
        this.accessOrder.delete(k);
        this.stats.deletes++;
      });
      
      return keysToDelete.length;
    } catch (error) {
      this.stats.errors++;
      logger.error('Cache deletePattern error', { pattern, error: error.message });
      return 0;
    }
  }

  /**
   * Clear entire cache
   */
  clear() {
    this.cache.clear();
    this.accessOrder.clear();
    this.cacheVersion++;
    logger.info('Cache cleared', { newVersion: this.cacheVersion });
  }

  /**
   * Invalidate cache (increment version)
   */
  invalidate() {
    this.cacheVersion++;
    logger.info('Cache invalidated', { newVersion: this.cacheVersion });
  }

  /**
   * Cleanup expired entries
   */
  cleanup() {
    try {
      const now = Date.now();
      let cleaned = 0;
      
      for (const [key, item] of this.cache.entries()) {
        if (now > item.expires) {
          this.cache.delete(key);
          this.accessOrder.delete(key);
          cleaned++;
        }
      }
      
      // Also evict if over size limit
      if (this.cache.size > this.maxSize) {
        this._evictLRU(this.cache.size - this.maxSize);
      }
      
      return cleaned;
    } catch (error) {
      this.stats.errors++;
      logger.error('Cache cleanup error', { error: error.message });
      return 0;
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? ((this.stats.hits / total) * 100).toFixed(2) : 0;
    
    // Calculate memory usage (approximate)
    let memorySize = 0;
    for (const [key, item] of this.cache.entries()) {
      memorySize += key.length * 2; // UTF-16
      try {
        memorySize += JSON.stringify(item.value).length * 2;
      } catch (e) {
        memorySize += 100; // Estimate
      }
    }
    
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      memorySize: `${(memorySize / 1024 / 1024).toFixed(2)} MB`,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: `${hitRate}%`,
      sets: this.stats.sets,
      deletes: this.stats.deletes,
      evictions: this.stats.evictions,
      errors: this.stats.errors,
      version: this.cacheVersion,
      utilization: `${((this.cache.size / this.maxSize) * 100).toFixed(2)}%`
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0,
      errors: 0
    };
  }

  /**
   * Destroy cache and cleanup
   */
  destroy() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.clear();
  }
}

/**
 * Cache helper functions for common patterns
 */
class CacheHelpers {
  /**
   * Cache wrapper for async functions
   */
  static async cached(key, fn, options = {}) {
    const cache = options.cache || globalCache;
    const cached = cache.get(key, options);
    
    if (cached !== null) {
      return cached;
    }
    
    try {
      const result = await fn();
      cache.set(key, result, options);
      return result;
    } catch (error) {
      // Don't cache errors
      throw error;
    }
  }

  /**
   * Cache with automatic key generation from function and args
   */
  static async cachedFn(fn, args = [], options = {}) {
    const key = `${fn.name}:${JSON.stringify(args)}`;
    return this.cached(key, () => fn(...args), options);
  }

  /**
   * Batch cache get (returns map of key -> value or null)
   */
  static batchGet(keys, cache = globalCache) {
    const results = new Map();
    keys.forEach(key => {
      results.set(key, cache.get(key));
    });
    return results;
  }

  /**
   * Batch cache set
   */
  static batchSet(entries, options = {}, cache = globalCache) {
    entries.forEach(([key, value]) => {
      cache.set(key, value, options);
    });
  }
}

// Global cache instance
const globalCache = new CacheManager({
  maxSize: 10000,
  defaultTTL: 300000, // 5 minutes
  cleanupInterval: 60000 // 1 minute
});

// Specialized caches for different data types
const caches = {
  // Static data - 1 hour TTL
  static: new CacheManager({
    maxSize: 1000,
    defaultTTL: 3600000, // 1 hour
    cleanupInterval: 300000 // 5 minutes
  }),
  
  // Semi-static data - 15 minutes TTL
  semiStatic: new CacheManager({
    maxSize: 5000,
    defaultTTL: 900000, // 15 minutes
    cleanupInterval: 60000 // 1 minute
  }),
  
  // Dynamic data - 2 minutes TTL
  dynamic: new CacheManager({
    maxSize: 3000,
    defaultTTL: 120000, // 2 minutes
    cleanupInterval: 30000 // 30 seconds
  }),
  
  // User-specific data - 1 minute TTL
  user: new CacheManager({
    maxSize: 5000,
    defaultTTL: 60000, // 1 minute
    cleanupInterval: 30000 // 30 seconds
  })
};

module.exports = {
  CacheManager,
  CacheHelpers,
  globalCache,
  caches
};

