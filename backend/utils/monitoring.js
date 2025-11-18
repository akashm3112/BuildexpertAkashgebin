const logger = require('./logger');
const { pool } = require('../database/connection');
const os = require('os');
const process = require('process');
const onFinished = require('on-finished');
const CircularBuffer = require('./circularBuffer');
const { IncrementalPercentiles } = require('./approximatePercentiles');


class MetricsCollector {
  constructor() {
    this.metrics = {
      // Request metrics
      requests: {
        total: 0,
        byMethod: {},
        byRoute: {},
        byStatus: {},
        errors: 0,
        timeouts: 0
      },
      // Performance metrics
      performance: {
        averageResponseTime: 0,
        p95ResponseTime: 0,
        p99ResponseTime: 0
      },
      // Error metrics
      errors: {
        total: 0,
        byType: {},
        byRoute: {},
        recent: []
      },
      // Database metrics
      database: {
        totalQueries: 0,
        slowQueries: 0,
        errors: 0,
        poolSize: 0,
        activeConnections: 0,
        idleConnections: 0,
        waitingConnections: 0
      },
      // System metrics
      system: {
        memory: {
          used: 0,
          total: 0,
          percentage: 0
        },
        cpu: {
          usage: 0,
          loadAverage: []
        },
        uptime: 0
      },
      // Timestamps
      lastUpdated: Date.now(),
      startTime: Date.now()
    };

    // Use circular buffers for O(1) operations
    this.maxResponseTimes = 1000;
    this.maxRecentErrors = 100;
    this.maxSlowQueries = 100;
    
    // Circular buffers instead of arrays
    this.responseTimesBuffer = new CircularBuffer(this.maxResponseTimes);
    this.slowQueriesBuffer = new CircularBuffer(this.maxSlowQueries);
    
    // Use incremental percentiles for fast updates
    this.responseTimePercentiles = new IncrementalPercentiles();
    
    // Calculate percentiles periodically instead of on every request
    this.percentileCalculationInterval = null;
    this.lastPercentileCalculation = Date.now();
    this.percentileCalculationDelay = 5000; // Calculate every 5 seconds

    // Start periodic metrics collection
    this.startCollection();
  }

  /**
   * Record API request
   */
  recordRequest(method, route, statusCode, responseTime) {
    this.metrics.requests.total++;
    
    // Track by method
    this.metrics.requests.byMethod[method] = (this.metrics.requests.byMethod[method] || 0) + 1;
    
    // Track by route (normalize route)
    const normalizedRoute = this.normalizeRoute(route);
    this.metrics.requests.byRoute[normalizedRoute] = (this.metrics.requests.byRoute[normalizedRoute] || 0) + 1;
    
    // Track by status
    const statusGroup = `${Math.floor(statusCode / 100)}xx`;
    this.metrics.requests.byStatus[statusGroup] = (this.metrics.requests.byStatus[statusGroup] || 0) + 1;
    
    // Track errors
    if (statusCode >= 400) {
      this.metrics.requests.errors++;
    }
    
    // Track timeouts
    if (statusCode === 408 || responseTime > 30000) {
      this.metrics.requests.timeouts++;
    }
    
    // Record response time (O(1) operation)
    this.recordResponseTime(responseTime);
    
    this.metrics.lastUpdated = Date.now();
  }

  /**
   * Record response time (O(1) using circular buffer)
   */
  recordResponseTime(responseTime) {
    // Add to circular buffer (O(1))
    this.responseTimesBuffer.push(responseTime);
    
    // Update incremental percentiles (O(1))
    this.responseTimePercentiles.add(responseTime);
    
    // Update percentiles periodically (not on every request)
    const now = Date.now();
    if (now - this.lastPercentileCalculation > this.percentileCalculationDelay) {
      this.updatePercentiles();
      this.lastPercentileCalculation = now;
    }
  }

  /**
   * Update percentiles from incremental calculator
   */
  updatePercentiles() {
    const stats = this.responseTimePercentiles.getPercentiles();
    this.metrics.performance.averageResponseTime = Math.round(stats.average);
    this.metrics.performance.p95ResponseTime = Math.round(stats.p95);
    this.metrics.performance.p99ResponseTime = Math.round(stats.p99);
  }

  /**
   * Record database query
   */
  recordDatabaseQuery(queryTime, isSlow = false, error = null) {
    this.metrics.database.totalQueries++;
    
    if (isSlow) {
      this.metrics.database.slowQueries++;
      // Use circular buffer for slow queries (O(1))
      this.slowQueriesBuffer.push({
        queryTime,
        timestamp: Date.now()
      });
    }
    
    if (error) {
      this.metrics.database.errors++;
    }
    
    this.metrics.lastUpdated = Date.now();
  }

  /**
   * Record error
   */
  recordError(error, route, errorType = 'UNKNOWN') {
    this.metrics.errors.total++;
    
    // Track by type
    this.metrics.errors.byType[errorType] = (this.metrics.errors.byType[errorType] || 0) + 1;
    
    // Track by route
    const normalizedRoute = this.normalizeRoute(route);
    this.metrics.errors.byRoute[normalizedRoute] = (this.metrics.errors.byRoute[normalizedRoute] || 0) + 1;
    
    // Add to recent errors (use circular buffer approach)
    this.metrics.errors.recent.push({
      error: error.message || String(error),
      type: errorType,
      route: normalizedRoute,
      timestamp: Date.now(),
      stack: error.stack
    });
    
    // Keep only last N errors (use slice instead of shift for better performance)
    if (this.metrics.errors.recent.length > this.maxRecentErrors) {
      this.metrics.errors.recent = this.metrics.errors.recent.slice(-this.maxRecentErrors);
    }
    
    this.metrics.lastUpdated = Date.now();
  }

  /**
   * Normalize route (remove IDs, etc.)
   */
  normalizeRoute(route) {
    if (!route) return 'unknown';
    
    // Replace UUIDs and IDs with placeholders
    return route
      .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
      .replace(/\/\d+/g, '/:id')
      .split('?')[0]; // Remove query params
  }

  /**
   * Update system metrics
   */
  async updateSystemMetrics() {
    try {
      // Memory metrics
      const memUsage = process.memoryUsage();
      const totalMem = os.totalmem();
      const usedMem = totalMem - os.freemem();
      
      this.metrics.system.memory = {
        used: memUsage.heapUsed,
        total: memUsage.heapTotal,
        rss: memUsage.rss,
        external: memUsage.external,
        systemUsed: usedMem,
        systemTotal: totalMem,
        percentage: (memUsage.heapUsed / memUsage.heapTotal) * 100
      };
      
      // CPU metrics
      this.metrics.system.cpu = {
        loadAverage: os.loadavg(),
        cores: os.cpus().length
      };
      
      // Uptime
      this.metrics.system.uptime = process.uptime();
      
      // Database pool metrics
      if (pool && pool.totalCount !== undefined) {
        this.metrics.database.poolSize = pool.totalCount || 0;
        this.metrics.database.idleConnections = pool.idleCount || 0;
        this.metrics.database.activeConnections = (pool.totalCount || 0) - (pool.idleCount || 0);
        this.metrics.database.waitingConnections = pool.waitingCount || 0;
      }
      
      // Update percentiles periodically
      this.updatePercentiles();
      
      this.metrics.lastUpdated = Date.now();
    } catch (error) {
      logger.error('Error updating system metrics', { error: error.message });
    }
  }

  /**
   * Start periodic metrics collection
   */
  startCollection() {
    // Update system metrics every 10 seconds
    setInterval(() => {
      this.updateSystemMetrics();
    }, 10000);
    
    // Initial update
    this.updateSystemMetrics();
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    // Ensure percentiles are up to date
    this.updatePercentiles();
    
    return {
      ...this.metrics,
      // Include slow queries from buffer
      performance: {
        ...this.metrics.performance,
        slowQueries: this.slowQueriesBuffer.toArray()
      },
      // Calculate rates
      rates: {
        requestsPerMinute: this.calculateRequestsPerMinute(),
        errorRate: this.calculateErrorRate(),
        averageResponseTime: this.metrics.performance.averageResponseTime
      },
      // Health status
      health: this.calculateHealthStatus()
    };
  }

  /**
   * Calculate requests per minute
   */
  calculateRequestsPerMinute() {
    const uptimeMinutes = (Date.now() - this.metrics.startTime) / 60000;
    if (uptimeMinutes === 0) return 0;
    return this.metrics.requests.total / uptimeMinutes;
  }

  /**
   * Calculate error rate
   */
  calculateErrorRate() {
    if (this.metrics.requests.total === 0) return 0;
    return (this.metrics.requests.errors / this.metrics.requests.total) * 100;
  }

  /**
   * Calculate health status
   */
  calculateHealthStatus() {
    const health = {
      status: 'healthy',
      issues: [],
      score: 100
    };
    
    // Check error rate
    const errorRate = this.calculateErrorRate();
    if (errorRate > 10) {
      health.status = 'unhealthy';
      health.issues.push(`High error rate: ${errorRate.toFixed(2)}%`);
      health.score -= 30;
    } else if (errorRate > 5) {
      health.status = 'degraded';
      health.issues.push(`Elevated error rate: ${errorRate.toFixed(2)}%`);
      health.score -= 15;
    }
    
    // Check response time
    const avgResponseTime = this.metrics.performance.averageResponseTime;
    if (avgResponseTime > 2000) {
      health.status = 'unhealthy';
      health.issues.push(`Slow response time: ${avgResponseTime.toFixed(0)}ms`);
      health.score -= 20;
    } else if (avgResponseTime > 1000) {
      health.status = 'degraded';
      health.issues.push(`Elevated response time: ${avgResponseTime.toFixed(0)}ms`);
      health.score -= 10;
    }
    
    // Check memory usage
    const memPercentage = this.metrics.system.memory.percentage;
    if (memPercentage > 90) {
      health.status = 'unhealthy';
      health.issues.push(`High memory usage: ${memPercentage.toFixed(2)}%`);
      health.score -= 20;
    } else if (memPercentage > 80) {
      health.status = 'degraded';
      health.issues.push(`Elevated memory usage: ${memPercentage.toFixed(2)}%`);
      health.score -= 10;
    }
    
    // Check database pool
    const poolUsage = this.metrics.database.poolSize > 0 
      ? (this.metrics.database.activeConnections / this.metrics.database.poolSize) * 100 
      : 0;
    if (poolUsage > 90) {
      health.status = 'unhealthy';
      health.issues.push(`Database pool nearly exhausted: ${poolUsage.toFixed(2)}%`);
      health.score -= 20;
    } else if (poolUsage > 80) {
      health.status = 'degraded';
      health.issues.push(`High database pool usage: ${poolUsage.toFixed(2)}%`);
      health.score -= 10;
    }
    
    // Ensure score doesn't go below 0
    health.score = Math.max(0, health.score);
    
    return health;
  }

  /**
   * Reset metrics (for testing or periodic reset)
   */
  reset() {
    this.metrics = {
      requests: {
        total: 0,
        byMethod: {},
        byRoute: {},
        byStatus: {},
        errors: 0,
        timeouts: 0
      },
      performance: {
        averageResponseTime: 0,
        p95ResponseTime: 0,
        p99ResponseTime: 0
      },
      errors: {
        total: 0,
        byType: {},
        byRoute: {},
        recent: []
      },
      database: {
        totalQueries: 0,
        slowQueries: 0,
        errors: 0,
        poolSize: 0,
        activeConnections: 0,
        idleConnections: 0,
        waitingConnections: 0
      },
      system: this.metrics.system, // Keep system metrics
      lastUpdated: Date.now(),
      startTime: this.metrics.startTime // Keep start time
    };
    
    // Reset buffers and percentiles
    this.responseTimesBuffer.clear();
    this.slowQueriesBuffer.clear();
    this.responseTimePercentiles.reset();
  }
}


/**
 * Request monitoring middleware using on-finished
 */
const monitoringMiddleware = (req, res, next) => {
  const startTime = Date.now();
  
  // Use on-finished instead of patching res.end
  onFinished(res, (err) => {
    const responseTime = Date.now() - startTime;
    
    // Record metrics
    metricsCollector.recordRequest(
      req.method,
      req.path || req.url,
      res.statusCode || (err ? 500 : 200),
      responseTime
    );
    
    // Log slow requests
    if (responseTime > 1000) {
      logger.warn('Slow request detected', {
        method: req.method,
        path: req.path || req.url,
        statusCode: res.statusCode || (err ? 500 : 200),
        responseTime,
        userId: req.user?.id,
        error: err ? err.message : undefined
      });
    }
  });
  
  next();
};

/**
 * Error monitoring middleware (4-parameter Express error handler)
 * This middleware must be placed after routes but before the final error handler
 */
const errorMonitoringMiddleware = (error, req, res, next) => {
  // Record error in metrics
  const errorType = error.errorCode || error.name || 'UNKNOWN';
  metricsCollector.recordError(error, req.path || req.url, errorType);
  
  // Pass to next error handler
  next(error);
};


/**
 * Comprehensive health check
 */
const performHealthCheck = async () => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    checks: {
      database: { status: 'unknown', responseTime: 0 },
      memory: { status: 'unknown', usage: 0 },
      disk: { status: 'unknown' }
    },
    metrics: metricsCollector.getMetrics()
  };
  
  // Database health check
  try {
    const dbStart = Date.now();
    await pool.query('SELECT 1');
    const dbResponseTime = Date.now() - dbStart;
    
    health.checks.database = {
      status: 'healthy',
      responseTime: dbResponseTime
    };
    
    if (dbResponseTime > 1000) {
      health.checks.database.status = 'degraded';
      health.status = 'degraded';
    }
  } catch (error) {
    health.checks.database = {
      status: 'unhealthy',
      error: error.message
    };
    health.status = 'unhealthy';
  }
  
  // Memory health check
  const memUsage = process.memoryUsage();
  const memPercentage = (memUsage.heapUsed / memUsage.heapTotal) * 100;
  
  health.checks.memory = {
    status: memPercentage > 90 ? 'unhealthy' : memPercentage > 80 ? 'degraded' : 'healthy',
    usage: memPercentage,
    used: memUsage.heapUsed,
    total: memUsage.heapTotal
  };
  
  if (health.checks.memory.status !== 'healthy') {
    health.status = health.checks.memory.status;
  }
  
  // Overall health from metrics
  const metricsHealth = metricsCollector.calculateHealthStatus();
  if (metricsHealth.status !== 'healthy' && health.status === 'healthy') {
    health.status = metricsHealth.status;
  }
  
  return health;
};



class AlertManager {
  constructor() {
    this.alerts = [];
    const config = require('./config');
    const isDevelopment = config.isDevelopment();
    
    // Higher thresholds in development (Node.js uses more memory in dev)
    this.alertThresholds = {
      errorRate: 5, // 5%
      responseTime: 2000, // 2 seconds
      memoryUsage: isDevelopment ? 95 : 85, // 95% in dev, 85% in production
      databasePoolUsage: 80 // 80%
    };
    this.lastAlertTime = {};
  }

  /**
   * Check for alerts
   */
  checkAlerts() {
    const metrics = metricsCollector.getMetrics();
    const now = Date.now();
    
    // Check error rate
    const errorRate = metricsCollector.calculateErrorRate();
    if (errorRate > this.alertThresholds.errorRate) {
      this.triggerAlert('HIGH_ERROR_RATE', {
        errorRate: errorRate.toFixed(2),
        threshold: this.alertThresholds.errorRate
      });
    }
    
    // Check response time
    const avgResponseTime = metrics.performance.averageResponseTime;
    if (avgResponseTime > this.alertThresholds.responseTime) {
      this.triggerAlert('SLOW_RESPONSE_TIME', {
        responseTime: avgResponseTime.toFixed(0),
        threshold: this.alertThresholds.responseTime
      });
    }
    
    // Check memory
    const memPercentage = metrics.system.memory.percentage;
    if (memPercentage > this.alertThresholds.memoryUsage) {
      this.triggerAlert('HIGH_MEMORY_USAGE', {
        memoryUsage: memPercentage.toFixed(2),
        threshold: this.alertThresholds.memoryUsage
      });
    }
    
    // Check database pool
    const poolUsage = metrics.database.poolSize > 0
      ? (metrics.database.activeConnections / metrics.database.poolSize) * 100
      : 0;
    if (poolUsage > this.alertThresholds.databasePoolUsage) {
      this.triggerAlert('HIGH_DATABASE_POOL_USAGE', {
        poolUsage: poolUsage.toFixed(2),
        threshold: this.alertThresholds.databasePoolUsage
      });
    }
  }

  /**
   * Trigger alert (rate-limited)
   */
  triggerAlert(type, data) {
    const now = Date.now();
    const lastAlert = this.lastAlertTime[type] || 0;
    
    // Rate limit: don't alert more than once per 5 minutes
    if (now - lastAlert < 300000) {
      return;
    }
    
    this.lastAlertTime[type] = now;
    
    const alert = {
      type,
      data,
      timestamp: now,
      severity: this.getAlertSeverity(type)
    };
    
    this.alerts.push(alert);
    
    // Keep only last 100 alerts (use slice instead of shift)
    if (this.alerts.length > 100) {
      this.alerts = this.alerts.slice(-100);
    }
    
    // Log alert
    logger.warn(`🚨 Alert: ${type}`, {
      ...data,
      severity: alert.severity
    });
  }

  /**
   * Get alert severity
   */
  getAlertSeverity(type) {
    const severityMap = {
      HIGH_ERROR_RATE: 'high',
      SLOW_RESPONSE_TIME: 'medium',
      HIGH_MEMORY_USAGE: 'high',
      HIGH_DATABASE_POOL_USAGE: 'high'
    };
    return severityMap[type] || 'medium';
  }

  /**
   * Get recent alerts
   */
  getRecentAlerts(limit = 10) {
    return this.alerts.slice(-limit).reverse();
  }
}



const metricsCollector = new MetricsCollector();
const alertManager = new AlertManager();

// Check for alerts every 30 seconds
setInterval(() => {
  alertManager.checkAlerts();
}, 30000);



module.exports = {
  metricsCollector,
  alertManager,
  monitoringMiddleware,
  errorMonitoringMiddleware,
  performHealthCheck,
  MetricsCollector,
  AlertManager
};
