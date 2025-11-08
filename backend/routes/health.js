const express = require('express');
const { pool } = require('../database/connection');
const { registry } = require('../utils/circuitBreaker');
const { getSessionStats } = require('../utils/sessionManager');
const { getBlacklistStats } = require('../utils/tokenBlacklist');
const { getLoginStats } = require('../utils/securityAudit');
const { auth, requireRole } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * @route   GET /health
 * @desc    Basic health check
 * @access  Public
 */
router.get('/', async (req, res) => {
  const health = {
    status: 'healthy',
    message: 'BuildXpert API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    uptime: Math.floor(process.uptime()),
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + 'MB',
      percentage: Math.round((process.memoryUsage().heapUsed / process.memoryUsage().heapTotal) * 100) + '%'
    }
  };

  // Check database connectivity
  try {
    const result = await pool.query('SELECT NOW() as db_time, version() as db_version');
    health.database = {
      status: 'connected',
      timestamp: result.rows[0].db_time,
      version: result.rows[0].db_version.split(' ')[0] + ' ' + result.rows[0].db_version.split(' ')[1],
      poolSize: pool.totalCount,
      idleConnections: pool.idleCount,
      waitingClients: pool.waitingCount
    };
    
    res.status(200).json(health);
  } catch (error) {
    health.status = 'unhealthy';
    health.database = {
      status: 'disconnected',
      error: error.message
    };
    
    logger.error('Health check failed - database disconnected', { error: error.message });
    res.status(503).json(health);
  }
});

/**
 * @route   GET /health/detailed
 * @desc    Detailed health check with circuit breaker status
 * @access  Private (Admin only)
 */
router.get('/detailed', auth, requireRole(['admin']), async (req, res) => {
  try {
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
  } catch (error) {
    logger.error('Detailed health check error', { error: error.message });
    res.status(500).json({
      status: 'error',
      message: 'Health check failed',
      error: error.message
    });
  }
});

/**
 * @route   GET /health/services
 * @desc    Get status of external services
 * @access  Private (Admin only)
 */
router.get('/services', auth, requireRole(['admin']), async (req, res) => {
  try {
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
  } catch (error) {
    logger.error('Service status check error', { error: error.message });
    res.status(500).json({
      status: 'error',
      message: 'Failed to get service status'
    });
  }
});

/**
 * @route   POST /health/services/:serviceName/reset
 * @desc    Reset a specific circuit breaker
 * @access  Private (Admin only)
 */
router.post('/services/:serviceName/reset', auth, requireRole(['admin']), async (req, res) => {
  try {
    const { serviceName } = req.params;
    const breaker = registry.getBreaker(serviceName);
    
    if (!breaker) {
      return res.status(404).json({
        status: 'error',
        message: 'Service not found'
      });
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
  } catch (error) {
    logger.error('Circuit breaker reset error', { error: error.message });
    res.status(500).json({
      status: 'error',
      message: 'Failed to reset circuit breaker'
    });
  }
});

/**
 * @route   GET /health/memory
 * @desc    Get memory and resource statistics
 * @access  Private (Admin only)
 */
router.get('/memory', auth, requireRole(['admin']), async (req, res) => {
  try {
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
  } catch (error) {
    logger.error('Memory stats error', { error: error.message });
    res.status(500).json({
      status: 'error',
      message: 'Failed to get memory statistics'
    });
  }
});

/**
 * @route   POST /health/gc
 * @desc    Trigger garbage collection (if exposed)
 * @access  Private (Admin only)
 */
router.post('/gc', auth, requireRole(['admin']), async (req, res) => {
  try {
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
      res.status(501).json({
        status: 'error',
        message: 'Garbage collection not exposed. Start with --expose-gc flag.'
      });
    }
  } catch (error) {
    logger.error('Manual GC error', { error: error.message });
    res.status(500).json({
      status: 'error',
      message: 'Failed to trigger garbage collection'
    });
  }
});

module.exports = router;

