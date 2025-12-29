/**
 * ============================================================================
 * MONITORING ROUTES
 * Purpose: Expose monitoring endpoints for metrics, health, and alerts
 * Access: Admin only (production) or public (development)
 * ============================================================================
 */

const express = require('express');
const router = express.Router();
const { metricsCollector, alertManager, performHealthCheck } = require('../utils/monitoring');
const { asyncHandler } = require('../middleware/errorHandler');
const { auth, requireRole } = require('../middleware/auth');
const config = require('../utils/config');
const { AuthorizationError } = require('../utils/errorTypes');

/**
 * @route   GET /api/monitoring/metrics
 * @desc    Get current metrics
 * @access  Admin only (production) or public (development)
 */
router.get('/metrics', asyncHandler(async (req, res) => {
  // In production, require admin auth
  if (config.isProduction()) {
    // Use proper middleware for production
    if (!req.user || req.user.role !== 'admin') {
      throw new AuthorizationError('Access denied. Admin role required.');
    }
  }
  // In development, allow public access for testing

  const metrics = metricsCollector.getMetrics();
  
  res.json({
    status: 'success',
    data: metrics
  });
}));

/**
 * @route   GET /api/monitoring/health
 * @desc    Get comprehensive health check
 * @access  Public (for uptime monitoring)
 */
router.get('/health', asyncHandler(async (req, res) => {
  const health = await performHealthCheck();
  
  const statusCode = health.status === 'healthy' ? 200 : 
                     health.status === 'degraded' ? 200 : 503;
  
  res.status(statusCode).json({
    status: 'success',
    data: health
  });
}));

/**
 * @route   GET /api/monitoring/alerts
 * @desc    Get recent alerts
 * @access  Admin only
 */
router.get('/alerts', auth, requireRole(['admin']), asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  const alerts = alertManager.getRecentAlerts(limit);
  
  res.json({
    status: 'success',
    data: {
      alerts,
      count: alerts.length
    }
  });
}));

/**
 * @route   GET /api/monitoring/status
 * @desc    Get quick status overview
 * @access  Public (for status pages)
 */
router.get('/status', asyncHandler(async (req, res) => {
  try {
    const metrics = metricsCollector.getMetrics();
    const health = metricsCollector.calculateHealthStatus();
    
    // Safely extract and format values with defaults
    const errorRate = metricsCollector.calculateErrorRate();
    const avgResponseTime = metrics.performance?.averageResponseTime ?? 0;
    const p95ResponseTime = metrics.performance?.p95ResponseTime ?? 0;
    const memoryPercentage = metrics.system?.memory?.percentage ?? 0;
    const poolSize = metrics.database?.poolSize ?? 0;
    const activeConnections = metrics.database?.activeConnections ?? 0;
    const uptime = metrics.system?.uptime ?? 0;
    const totalRequests = metrics.requests?.total ?? 0;
    const errorCount = metrics.requests?.errors ?? 0;
    
    // Calculate database pool usage safely
    const databasePoolUsage = poolSize > 0 
      ? ((activeConnections / poolSize) * 100)
      : 0;
    
    res.json({
      status: 'success',
      data: {
        status: health?.status || 'unknown',
        score: health?.score ?? 0,
        uptime: Math.floor(uptime),
        requests: {
          total: totalRequests,
          errors: errorCount,
          errorRate: (isNaN(errorRate) ? 0 : errorRate).toFixed(2)
        },
        performance: {
          averageResponseTime: (isNaN(avgResponseTime) ? 0 : avgResponseTime).toFixed(0),
          p95ResponseTime: (isNaN(p95ResponseTime) ? 0 : p95ResponseTime).toFixed(0)
        },
        system: {
          memoryUsage: (isNaN(memoryPercentage) ? 0 : memoryPercentage).toFixed(2),
          databasePoolUsage: (isNaN(databasePoolUsage) ? 0 : databasePoolUsage).toFixed(2)
        }
      }
    });
  } catch (error) {
    // Return safe defaults on error
    res.json({
      status: 'success',
      data: {
        status: 'unknown',
        score: 0,
        uptime: 0,
        requests: {
          total: 0,
          errors: 0,
          errorRate: '0.00'
        },
        performance: {
          averageResponseTime: '0',
          p95ResponseTime: '0'
        },
        system: {
          memoryUsage: '0.00',
          databasePoolUsage: '0.00'
        }
      }
    });
  }
}));

/**
 * @route   POST /api/monitoring/reset
 * @desc    Reset metrics (admin only)
 * @access  Admin only
 */
router.post('/reset', auth, requireRole(['admin']), asyncHandler(async (req, res) => {
  metricsCollector.reset();
  
  res.json({
    status: 'success',
    message: 'Metrics reset successfully'
  });
}));

module.exports = router;

