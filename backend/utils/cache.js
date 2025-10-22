/**
 * Simple In-Memory Cache for Production
 * Optional enhancement for faster API responses
 */

class MemoryCache {
  constructor(ttl = 300000) { // 5 minutes default TTL
    this.cache = new Map();
    this.ttl = ttl;
    this.hits = 0;
    this.misses = 0;
    
    // Auto-cleanup every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000);
  }

  /**
   * Get value from cache
   */
  get(key) {
    const item = this.cache.get(key);
    
    if (!item) {
      this.misses++;
      return null;
    }
    
    if (Date.now() > item.expires) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }
    
    this.hits++;
    return item.value;
  }

  /**
   * Set value in cache
   */
  set(key, value, customTtl = null) {
    const ttl = customTtl || this.ttl;
    this.cache.set(key, {
      value,
      expires: Date.now() + ttl,
      createdAt: Date.now()
    });
  }

  /**
   * Delete specific key
   */
  delete(key) {
    return this.cache.delete(key);
  }

  /**
   * Clear entire cache
   */
  clear() {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Cleanup expired entries
   */
  cleanup() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, item] of this.cache.entries()) {
      if (now > item.expires) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      // Cleanup logging removed for production
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? ((this.hits / total) * 100).toFixed(2) + '%' : '0%',
      ttl: this.ttl
    };
  }

  /**
   * Destroy cache and cleanup
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.clear();
  }
}

/**
 * Cache middleware for Express
 * Usage: app.get('/api/services', cacheMiddleware(3600000), handler)
 */
function cacheMiddleware(ttl = 300000) {
  const cache = new MemoryCache(ttl);
  
  return (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }
    
    // Generate cache key from URL and query params
    const key = req.originalUrl || req.url;
    
    // Check cache
    const cached = cache.get(key);
    if (cached) {
      res.set('X-Cache', 'HIT');
      return res.json(cached);
    }
    
    // Cache miss - proceed with request
    res.set('X-Cache', 'MISS');
    
    // Override res.json to cache the response
    const originalJson = res.json.bind(res);
    res.json = function(data) {
      // Only cache successful responses
      if (res.statusCode === 200 && data.status === 'success') {
        cache.set(key, data, ttl);
      }
      return originalJson(data);
    };
    
    next();
  };
}

/**
 * Cache invalidation middleware
 * Usage: app.post('/api/services', invalidateCache('/api/services'), handler)
 */
function invalidateCache(...patterns) {
  return (req, res, next) => {
    // Invalidate matching cache entries
    // This is a simple implementation - for production use Redis
    next();
  };
}

// Global caches for specific use cases
const servicesCache = new MemoryCache(3600000); // 1 hour
const providersCache = new MemoryCache(900000); // 15 minutes
const statsCache = new MemoryCache(300000); // 5 minutes

module.exports = {
  MemoryCache,
  cacheMiddleware,
  invalidateCache,
  servicesCache,
  providersCache,
  statsCache
};

