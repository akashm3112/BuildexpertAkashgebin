const express = require('express');
const { pool } = require('../database/connection');
const { registry } = require('../utils/circuitBreaker');
const { getSessionStats } = require('../utils/sessionManager');
const { getBlacklistStats } = require('../utils/tokenBlacklist');
const { getLoginStats } = require('../utils/securityAudit');
const { auth, requireRole } = require('../middleware/auth');
const logger = require('../utils/logger');
const { asyncHandler } = require('../middleware/errorHandler');
const { NotFoundError, ServiceUnavailableError, ApplicationError } = require('../utils/errorTypes');

const router = express.Router();

// In-memory health state cache (updated periodically, not on each request)
// This allows the health endpoint to be extremely fast (< 1ms)
let cachedHealthState = {
  lastUpdate: 0,
  data: null
};

// Update health state cache every 5 seconds (non-blocking, background update)
const HEALTH_CACHE_TTL = 5000;
setInterval(() => {
  try {
    const memUsage = process.memoryUsage();
    cachedHealthState = {
      lastUpdate: Date.now(),
      data: {
        uptime: Math.floor(process.uptime()),
        memory: {
          heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
          heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
          rss: Math.round(memUsage.rss / 1024 / 1024),
          heapPercentage: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100)
        },
        database: {
          poolSize: pool.totalCount || 0,
          idleConnections: pool.idleCount || 0,
          waitingClients: pool.waitingCount || 0
        }
      }
    };
  } catch (error) {
    // Silent fail - don't break health check
  }
}, HEALTH_CACHE_TTL);

/**
 * @route   GET /health
 * @desc    Basic health check - Fast, in-memory only (no DB/Redis/async checks)
 * @access  Public
 * 
 * PRODUCTION OPTIMIZED: This endpoint is designed for load balancers and monitoring tools.
 * It returns only in-memory state with zero external dependencies for maximum speed.
 * 
 * Performance: < 1ms response time (synchronous, no I/O, no async operations)
 * 
 * ✅ NO database queries
 * ✅ NO Redis checks
 * ✅ NO async operations
 * ✅ Just returns memory state
 */
router.get('/', (req, res) => {
  // Use cached state if available and fresh, otherwise get current state synchronously
  let healthData;
  if (cachedHealthState.data && (Date.now() - cachedHealthState.lastUpdate) < HEALTH_CACHE_TTL) {
    healthData = cachedHealthState.data;
  } else {
    // Fallback: get current state synchronously (still fast, no I/O)
    const memUsage = process.memoryUsage();
    healthData = {
      uptime: Math.floor(process.uptime()),
      memory: {
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        rss: Math.round(memUsage.rss / 1024 / 1024),
        heapPercentage: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100)
      },
      database: {
        poolSize: pool.totalCount || 0,
        idleConnections: pool.idleCount || 0,
        waitingClients: pool.waitingCount || 0
      }
    };
  }
  
  const health = {
    status: 'healthy',
    message: 'BuildXpert API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    uptime: healthData.uptime,
    memory: {
      heapUsed: `${healthData.memory.heapUsed}MB`,
      heapTotal: `${healthData.memory.heapTotal}MB`,
      rss: `${healthData.memory.rss}MB`,
      heapPercentage: `${healthData.memory.heapPercentage}%`
    },
    // Pool stats from memory (no DB query)
    database: {
      poolSize: healthData.database.poolSize,
      idleConnections: healthData.database.idleConnections,
      waitingClients: healthData.database.waitingClients
    }
  };

  res.status(200).json(health);
});

/**
 * @route   GET /health/detailed
 * @desc    Detailed health check with circuit breaker status
 * @access  Private (Admin only)
 */
router.get('/detailed', auth, requireRole(['admin']), asyncHandler(async (req, res) => {
  const health = {
    status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      uptime: Math.floor(process.uptime()),
      memory: {
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
        heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + 'MB',
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024) + 'MB',
        external: Math.round(process.memoryUsage().external / 1024 / 1024) + 'MB'
      }
    };

    // Database health
    try {
      const dbResult = await pool.query('SELECT NOW() as db_time, COUNT(*) as user_count FROM users');
      health.database = {
        status: 'connected',
        timestamp: dbResult.rows[0].db_time,
        totalUsers: parseInt(dbResult.rows[0].user_count),
        poolSize: pool.totalCount,
        idleConnections: pool.idleCount,
        waitingClients: pool.waitingCount
      };
    } catch (error) {
      health.status = 'degraded';
      health.database = {
        status: 'disconnected',
        error: error.message
      };
    }

    // Circuit breaker status
    health.circuitBreakers = registry.getAllStatuses();
    
    // Check for unhealthy services
    const unhealthyServices = registry.getUnhealthyServices();
    if (unhealthyServices.length > 0) {
      health.status = 'degraded';
      health.unhealthyServices = unhealthyServices;
    }

    // Auth security stats
    try {
      const [sessionStats, blacklistStats, loginStats] = await Promise.all([
        getSessionStats(),
        getBlacklistStats(),
        getLoginStats(24)
      ]);
      
      health.security = {
        activeSessions: parseInt(sessionStats?.active_sessions || 0),
        activeUsers: parseInt(sessionStats?.active_users || 0),
        blacklistedTokens: parseInt(blacklistStats?.total_blacklisted || 0),
        loginAttempts24h: parseInt(loginStats?.total_attempts || 0),
        successfulLogins24h: parseInt(loginStats?.successful_logins || 0),
        failedLogins24h: parseInt(loginStats?.failed_logins || 0)
      };
    } catch (error) {
      health.security = {
        status: 'unavailable',
        error: error.message
      };
    }

    // Determine overall status
    if (health.database?.status === 'disconnected') {
      health.status = 'unhealthy';
    }

    const statusCode = health.status === 'healthy' ? 200 : 
                       health.status === 'degraded' ? 200 : 503;

  res.status(statusCode).json(health);
}));

/**
 * @route   GET /health/services
 * @desc    Get status of external services
 * @access  Private (Admin only)
 */
router.get('/services', auth, requireRole(['admin']), asyncHandler(async (req, res) => {
  const services = registry.getAllStatuses();
  const unhealthy = registry.getUnhealthyServices();
  
  res.json({
    status: 'success',
    data: {
      services,
      unhealthyCount: unhealthy.length,
      unhealthyServices: unhealthy,
      overallHealth: unhealthy.length === 0 ? 'healthy' : 'degraded'
    }
  });
}));

/**
 * @route   POST /health/services/:serviceName/reset
 * @desc    Reset a specific circuit breaker
 * @access  Private (Admin only)
 */
router.post('/services/:serviceName/reset', auth, requireRole(['admin']), asyncHandler(async (req, res) => {
  const { serviceName } = req.params;
  const breaker = registry.getBreaker(serviceName);
  
  if (!breaker) {
    throw new NotFoundError('Service not found');
  }
  
  breaker.reset();
  
  logger.info(`Circuit breaker reset for ${serviceName}`, {
    userId: req.user.id
  });
  
  res.json({
    status: 'success',
    message: `Circuit breaker reset for ${serviceName}`,
    data: breaker.getStatus()
  });
}));

/**
 * @route   GET /health/memory
 * @desc    Get memory and resource statistics
 * @access  Private (Admin only)
 */
router.get('/memory', auth, requireRole(['admin']), asyncHandler(async (req, res) => {
  const { registry, MemoryMonitor } = require('../utils/memoryLeakPrevention');
  
  // Get memory stats
  const memoryUsage = process.memoryUsage();
  const memoryStats = {
      heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + 'MB',
      heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + 'MB',
      rss: Math.round(memoryUsage.rss / 1024 / 1024) + 'MB',
      external: Math.round(memoryUsage.external / 1024 / 1024) + 'MB',
      heapUsedPercent: Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100) + '%'
    };

    // Get managed maps statistics
    const mapStats = registry.getMapStats();
    
    // Get registered resources
    const resources = registry.getResources();
    
    // Check for size violations
    const violations = registry.checkMapSizes();
    
    res.json({
      status: 'success',
      data: {
        memory: memoryStats,
        maps: mapStats,
        resources,
        violations,
        hasViolations: violations.length > 0
      }
    });
}));

/**
 * @route   POST /health/gc
 * @desc    Trigger garbage collection (if exposed)
 * @access  Private (Admin only)
 */
router.post('/gc', auth, requireRole(['admin']), asyncHandler(async (req, res) => {
  if (global.gc) {
    const beforeHeap = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    global.gc();
    const afterHeap = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    
    logger.info('Manual garbage collection triggered', {
      userId: req.user.id,
      beforeHeap: `${beforeHeap}MB`,
      afterHeap: `${afterHeap}MB`,
      freed: `${beforeHeap - afterHeap}MB`
    });
    
    res.json({
      status: 'success',
      message: 'Garbage collection triggered',
      data: {
        beforeHeap: `${beforeHeap}MB`,
        afterHeap: `${afterHeap}MB`,
        freed: `${beforeHeap - afterHeap}MB`
      }
    });
  } else {
    throw new ApplicationError('Garbage collection not exposed. Start with --expose-gc flag.', 501, 'FEATURE_NOT_AVAILABLE');
  }
}));

module.exports = router;

