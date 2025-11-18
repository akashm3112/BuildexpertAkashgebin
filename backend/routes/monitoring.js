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
const { auth } = require('../middleware/auth');
const config = require('../utils/config');

/**
 * @route   GET /api/monitoring/metrics
 * @desc    Get current metrics
 * @access  Admin only (production) or public (development)
 */
router.get('/metrics', asyncHandler(async (req, res) => {
  // In production, require admin auth
  if (config.isProduction() && (!req.user || req.user.role !== 'admin')) {
    return res.status(403).json({
      status: 'error',
      message: 'Access denied. Admin role required.'
    });
  }

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
router.get('/alerts', auth, asyncHandler(async (req, res) => {
  // Require admin role
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      status: 'error',
      message: 'Access denied. Admin role required.'
    });
  }

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
  const metrics = metricsCollector.getMetrics();
  const health = metricsCollector.calculateHealthStatus();
  
  res.json({
    status: 'success',
    data: {
      status: health.status,
      score: health.score,
      uptime: metrics.system.uptime,
      requests: {
        total: metrics.requests.total,
        errors: metrics.requests.errors,
        errorRate: metricsCollector.calculateErrorRate().toFixed(2)
      },
      performance: {
        averageResponseTime: metrics.performance.averageResponseTime.toFixed(0),
        p95ResponseTime: metrics.performance.p95ResponseTime.toFixed(0)
      },
      system: {
        memoryUsage: metrics.system.memory.percentage.toFixed(2),
        databasePoolUsage: metrics.database.poolSize > 0
          ? ((metrics.database.activeConnections / metrics.database.poolSize) * 100).toFixed(2)
          : 0
      }
    }
  });
}));

/**
 * @route   POST /api/monitoring/reset
 * @desc    Reset metrics (admin only)
 * @access  Admin only
 */
router.post('/reset', auth, asyncHandler(async (req, res) => {
  // Require admin role
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      status: 'error',
      message: 'Access denied. Admin role required.'
    });
  }

  metricsCollector.reset();
  
  res.json({
    status: 'success',
    message: 'Metrics reset successfully'
  });
}));

module.exports = router;

