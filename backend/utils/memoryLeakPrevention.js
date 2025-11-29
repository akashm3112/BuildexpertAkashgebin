
const logger = require('./logger');

class ResourceRegistry {
  constructor() {
    this.timers = new Map(); // Track all intervals and timeouts
    this.listeners = new Map(); // Track all event listeners
    this.cleanupFunctions = new Set(); // Track cleanup functions
    this.maps = new Map(); // Track Map objects for size monitoring
  }

  /**
   * Register a timer (setInterval or setTimeout)
   * @param {string} name - Timer identifier
   * @param {NodeJS.Timer} timer - Timer object
   * @param {string} type - 'interval' or 'timeout'
   */
  registerTimer(name, timer, type = 'interval') {
    this.timers.set(name, { timer, type, createdAt: Date.now() });
    logger.info(`Timer registered: ${name} (${type})`);
  }

  /**
   * Unregister and clear a timer
   * @param {string} name - Timer identifier
   */
  clearTimer(name) {
    const timerData = this.timers.get(name);
    if (timerData) {
      if (timerData.type === 'interval') {
        clearInterval(timerData.timer);
      } else {
        clearTimeout(timerData.timer);
      }
      this.timers.delete(name);
      logger.info(`Timer cleared: ${name}`);
      return true;
    }
    return false;
  }

  /**
   * Register an event listener
   * @param {string} name - Listener identifier
   * @param {Object} emitter - Event emitter
   * @param {string} event - Event name
   * @param {Function} handler - Event handler function
   */
  registerListener(name, emitter, event, handler) {
    this.listeners.set(name, { emitter, event, handler, createdAt: Date.now() });
    logger.info(`Listener registered: ${name} for event ${event}`);
  }

  /**
   * Unregister and remove an event listener
   * @param {string} name - Listener identifier
   */
  removeListener(name) {
    const listenerData = this.listeners.get(name);
    if (listenerData) {
      listenerData.emitter.removeListener(listenerData.event, listenerData.handler);
      this.listeners.delete(name);
      logger.info(`Listener removed: ${name}`);
      return true;
    }
    return false;
  }

  /**
   * Register a cleanup function to be called on shutdown
   * @param {Function} cleanupFn - Cleanup function
   */
  registerCleanup(cleanupFn) {
    this.cleanupFunctions.add(cleanupFn);
  }

  /**
   * Register a Map for size monitoring
   * @param {string} name - Map identifier
   * @param {Map} map - Map object
   * @param {number} maxSize - Maximum allowed size (optional)
   */
  registerMap(name, map, maxSize = null) {
    this.maps.set(name, { map, maxSize, createdAt: Date.now() });
    logger.info(`Map registered for monitoring: ${name}${maxSize ? ` (max size: ${maxSize})` : ''}`);
  }

  /**
   * Get all registered resources
   */
  getResources() {
    return {
      timers: Array.from(this.timers.keys()),
      listeners: Array.from(this.listeners.keys()),
      maps: Array.from(this.maps.keys()),
      cleanupFunctions: this.cleanupFunctions.size
    };
  }

  /**
   * Get Map statistics
   */
  getMapStats() {
    const stats = {};
    for (const [name, data] of this.maps.entries()) {
      const size = data.map.size;
      const maxSize = data.maxSize;
      const utilizationPercent = maxSize ? Math.round((size / maxSize) * 100) : null;
      
      stats[name] = {
        size,
        maxSize,
        utilizationPercent,
        isOverLimit: maxSize ? size > maxSize : false,
        age: Math.floor((Date.now() - data.createdAt) / 1000) // seconds
      };
    }
    return stats;
  }

  /**
   * Check for Map size violations
   */
  checkMapSizes() {
    const violations = [];
    for (const [name, data] of this.maps.entries()) {
      if (data.maxSize && data.map.size > data.maxSize) {
        violations.push({
          name,
          size: data.map.size,
          maxSize: data.maxSize,
          overage: data.map.size - data.maxSize
        });
      }
    }
    return violations;
  }

  /**
   * Clean up all resources
   */
  async cleanup() {
    logger.info('Starting resource cleanup...');

    // Clear all timers
    for (const [name, data] of this.timers.entries()) {
      if (data.type === 'interval') {
        clearInterval(data.timer);
      } else {
        clearTimeout(data.timer);
      }
      logger.info(`Cleared timer: ${name}`);
    }
    this.timers.clear();

    // Remove all listeners
    for (const [name, data] of this.listeners.entries()) {
      data.emitter.removeListener(data.event, data.handler);
      logger.info(`Removed listener: ${name}`);
    }
    this.listeners.clear();

    // Execute all cleanup functions
    for (const cleanupFn of this.cleanupFunctions) {
      try {
        await cleanupFn();
      } catch (error) {
        logger.error('Cleanup function error', { error: error.message });
      }
    }
    this.cleanupFunctions.clear();

    logger.info('Resource cleanup completed');
  }
}

// Global registry instance
const registry = new ResourceRegistry();

/**
 * Create a managed Map that auto-cleans expired entries
 * @param {Object} options - Configuration options
 */
class ManagedMap {
  constructor(options = {}) {
    this.map = new Map();
    this.name = options.name || 'unnamed';
    this.ttl = options.ttl || 3600000; // Default 1 hour
    this.maxSize = options.maxSize || 10000; // Default max 10k entries
    this.cleanupInterval = options.cleanupInterval || 300000; // Clean every 5 minutes
    this.trackExpiry = options.trackExpiry !== false; // Track expiry by default

    // Start cleanup interval
    this.cleanupTimer = setInterval(() => this.cleanup(), this.cleanupInterval);
    
    // Register with global registry
    registry.registerTimer(`${this.name}-cleanup`, this.cleanupTimer, 'interval');
    registry.registerMap(this.name, this.map, this.maxSize);
    
    logger.info(`ManagedMap created: ${this.name}`, {
      ttl: this.ttl,
      maxSize: this.maxSize,
      cleanupInterval: this.cleanupInterval
    });
  }

  /**
   * Set a value with expiry tracking
   */
  set(key, value) {
    const entry = {
      value,
      createdAt: Date.now(),
      expiresAt: this.trackExpiry ? Date.now() + this.ttl : null
    };
    
    this.map.set(key, entry);
    
    // Check size limit
    if (this.map.size > this.maxSize) {
      logger.warn(`ManagedMap ${this.name} exceeded max size`, {
        size: this.map.size,
        maxSize: this.maxSize
      });
      this.enforceMaxSize();
    }
  }

  /**
   * Get a value (returns null if expired)
   */
  get(key) {
    const entry = this.map.get(key);
    if (!entry) return null;

    // Check if expired
    if (this.trackExpiry && entry.expiresAt && Date.now() > entry.expiresAt) {
      this.map.delete(key);
      return null;
    }

    return entry.value;
  }

  /**
   * Delete a key
   */
  delete(key) {
    return this.map.delete(key);
  }

  /**
   * Check if key exists and is not expired
   */
  has(key) {
    const entry = this.map.get(key);
    if (!entry) return false;

    if (this.trackExpiry && entry.expiresAt && Date.now() > entry.expiresAt) {
      this.map.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Get current size
   */
  get size() {
    return this.map.size;
  }

  /**
   * Clean up expired entries
   */
  cleanup() {
    if (!this.trackExpiry) return;

    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.map.entries()) {
      if (entry.expiresAt && now > entry.expiresAt) {
        this.map.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      logger.info(`ManagedMap ${this.name} cleanup removed ${removed} expired entries`, {
        remaining: this.map.size
      });
    }
  }

  /**
   * Enforce maximum size by removing oldest entries
   */
  enforceMaxSize() {
    if (this.map.size <= this.maxSize) return;

    // Sort by creation time and remove oldest
    const entries = Array.from(this.map.entries())
      .sort((a, b) => a[1].createdAt - b[1].createdAt);

    const toRemove = this.map.size - this.maxSize;
    for (let i = 0; i < toRemove; i++) {
      this.map.delete(entries[i][0]);
    }

    logger.warn(`ManagedMap ${this.name} enforced max size, removed ${toRemove} oldest entries`);
  }

  /**
   * Clear all entries
   */
  clear() {
    const size = this.map.size;
    this.map.clear();
    logger.info(`ManagedMap ${this.name} cleared ${size} entries`);
  }

  /**
   * Destroy the managed map and cleanup
   */
  destroy() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      registry.clearTimer(`${this.name}-cleanup`);
    }
    this.map.clear();
    logger.info(`ManagedMap ${this.name} destroyed`);
  }

  /**
   * Get statistics
   */
  getStats() {
    const now = Date.now();
    let expired = 0;

    for (const entry of this.map.values()) {
      if (this.trackExpiry && entry.expiresAt && now > entry.expiresAt) {
        expired++;
      }
    }

    return {
      name: this.name,
      size: this.map.size,
      maxSize: this.maxSize,
      utilizationPercent: Math.round((this.map.size / this.maxSize) * 100),
      expired,
      ttl: this.ttl,
      cleanupInterval: this.cleanupInterval
    };
  }
}

/**
 * Monitor memory usage
 */
class MemoryMonitor {
  constructor(options = {}) {
    this.threshold = options.threshold || 500; // MB
    this.checkInterval = options.checkInterval || 60000; // 1 minute
    this.warningCount = 0;
    this.maxWarnings = options.maxWarnings || 5;
  }

  /**
   * Start monitoring
   */
  start() {
    this.timer = setInterval(() => this.check(), this.checkInterval);
    registry.registerTimer('memory-monitor', this.timer, 'interval');
    logger.info('Memory monitor started', {
      threshold: `${this.threshold}MB`,
      checkInterval: `${this.checkInterval}ms`
    });
  }

  /**
   * Check memory usage
   */
  check() {
    const usage = process.memoryUsage();
    const heapUsedMB = Math.round(usage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(usage.heapTotal / 1024 / 1024);
    const rssMB = Math.round(usage.rss / 1024 / 1024);

    // Check if over threshold
    if (heapUsedMB > this.threshold) {
      this.warningCount++;
      
      logger.warn('High memory usage detected', {
        heapUsed: `${heapUsedMB}MB`,
        heapTotal: `${heapTotalMB}MB`,
        rss: `${rssMB}MB`,
        threshold: `${this.threshold}MB`,
        warningCount: this.warningCount
      });

      // Get Map statistics
      const mapStats = registry.getMapStats();
      logger.info('Map statistics', mapStats);

      // Check for Map size violations
      const violations = registry.checkMapSizes();
      if (violations.length > 0) {
        logger.error('Map size violations detected', { violations });
      }

      // If too many warnings, trigger garbage collection if available
      if (this.warningCount >= this.maxWarnings && global.gc) {
        logger.warn('Triggering garbage collection');
        global.gc();
        this.warningCount = 0;
      }
    } else {
      // Reset warning count if memory is normal
      if (this.warningCount > 0) {
        this.warningCount = 0;
      }
    }
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      registry.clearTimer('memory-monitor');
      logger.info('Memory monitor stopped');
    }
  }

  /**
   * Get current memory stats
   */
  getStats() {
    const usage = process.memoryUsage();
    return {
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024) + 'MB',
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024) + 'MB',
      rss: Math.round(usage.rss / 1024 / 1024) + 'MB',
      external: Math.round(usage.external / 1024 / 1024) + 'MB',
      arrayBuffers: Math.round(usage.arrayBuffers / 1024 / 1024) + 'MB',
      heapUsedPercent: Math.round((usage.heapUsed / usage.heapTotal) * 100) + '%'
    };
  }
}

/**
 * Socket Connection Manager
 * Tracks and manages Socket.IO connections
 */
class SocketConnectionManager {
  constructor(io) {
    this.io = io;
    this.connections = new Map(); // socketId -> connection data
    this.userSockets = new Map(); // userId -> Set of socketIds
    this.maxConnectionsPerUser = 5; // Limit connections per user
    this.connectionTimeout = 24 * 60 * 60 * 1000; // 24 hours
  }

  /**
   * Register a new socket connection
   */
  registerConnection(socket, userId = null) {
    // Check if socket is already registered to prevent duplicate registrations
    const existingConnection = this.connections.get(socket.id);
    if (existingConnection) {
      // Update existing connection with userId if provided
      if (userId && !existingConnection.userId) {
        existingConnection.userId = userId;
        existingConnection.lastActivity = Date.now();
        
        // Add to userSockets map if userId is provided
        if (!this.userSockets.has(userId)) {
          this.userSockets.set(userId, new Set());
        }
        this.userSockets.get(userId).add(socket.id);
        
        // Check connection limit per user
        const userConnections = this.userSockets.get(userId);
        if (userConnections.size > this.maxConnectionsPerUser) {
          logger.warn('User exceeded max connections', {
            userId,
            count: userConnections.size,
            max: this.maxConnectionsPerUser
          });
        }
        
        logger.info('Socket connection updated with userId', {
          socketId: socket.id,
          userId,
          totalConnections: this.connections.size
        });
      } else {
        // Just update last activity if no userId change
        existingConnection.lastActivity = Date.now();
      }
      // Socket already registered, don't register again
      return;
    }
    
    // New connection - register it
    const connectionData = {
      socketId: socket.id,
      userId,
      connectedAt: Date.now(),
      lastActivity: Date.now()
    };

    this.connections.set(socket.id, connectionData);

    if (userId) {
      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId).add(socket.id);

      // Check connection limit per user
      const userConnections = this.userSockets.get(userId);
      if (userConnections.size > this.maxConnectionsPerUser) {
        logger.warn('User exceeded max connections', {
          userId,
          count: userConnections.size,
          max: this.maxConnectionsPerUser
        });
      }
    }

    logger.info('Socket connection registered', {
      socketId: socket.id,
      userId,
      totalConnections: this.connections.size
    });
  }

  /**
   * Unregister a socket connection
   */
  unregisterConnection(socket) {
    const connectionData = this.connections.get(socket.id);
    
    if (connectionData) {
      // Remove from user sockets
      if (connectionData.userId) {
        const userConnections = this.userSockets.get(connectionData.userId);
        if (userConnections) {
          userConnections.delete(socket.id);
          if (userConnections.size === 0) {
            this.userSockets.delete(connectionData.userId);
          }
        }
      }

      this.connections.delete(socket.id);
      
      logger.info('Socket connection unregistered', {
        socketId: socket.id,
        userId: connectionData.userId,
        duration: Math.floor((Date.now() - connectionData.connectedAt) / 1000) + 's',
        remainingConnections: this.connections.size
      });
    }
  }

  /**
   * Update last activity timestamp
   */
  updateActivity(socketId) {
    const connectionData = this.connections.get(socketId);
    if (connectionData) {
      connectionData.lastActivity = Date.now();
    }
  }

  /**
   * Clean up stale connections
   */
  cleanupStaleConnections() {
    const now = Date.now();
    let cleaned = 0;

    for (const [socketId, data] of this.connections.entries()) {
      const inactiveTime = now - data.lastActivity;
      
      if (inactiveTime > this.connectionTimeout) {
        // Force disconnect stale socket
        const socket = this.io.sockets.sockets.get(socketId);
        if (socket) {
          socket.disconnect(true);
        }
        this.unregisterConnection({ id: socketId });
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info('Cleaned up stale connections', {
        count: cleaned,
        remaining: this.connections.size
      });
    }

    return cleaned;
  }

  /**
   * Get connection statistics
   */
  getStats() {
    return {
      totalConnections: this.connections.size,
      totalUsers: this.userSockets.size,
      averageConnectionsPerUser: this.userSockets.size > 0 ? 
        Math.round((this.connections.size / this.userSockets.size) * 10) / 10 : 0,
      maxConnectionsPerUser: this.maxConnectionsPerUser
    };
  }

  /**
   * Start periodic cleanup
   */
  startCleanup() {
    this.cleanupTimer = setInterval(() => {
      this.cleanupStaleConnections();
    }, 3600000); // Every hour

    registry.registerTimer('socket-cleanup', this.cleanupTimer, 'interval');
    logger.info('Socket cleanup job started');
  }

  /**
   * Stop cleanup
   */
  stopCleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      registry.clearTimer('socket-cleanup');
      logger.info('Socket cleanup job stopped');
    }
  }
}

/**
 * Initialize memory leak prevention
 */
const initialize = () => {
  logger.info('Initializing memory leak prevention...');

  // Register cleanup on process termination
  const gracefulShutdown = async () => {
    logger.info('Graceful shutdown initiated...');
    await registry.cleanup();
    process.exit(0);
  };

  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);

  logger.info('Memory leak prevention initialized');
};

module.exports = {
  ResourceRegistry,
  registry,
  ManagedMap,
  SocketConnectionManager,
  MemoryMonitor,
  initialize
};

