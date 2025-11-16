const express = require('express');
const { auth, requireRole } = require('../middleware/auth');
const logger = require('../utils/logger');
const { adminActionLimiter } = require('../middleware/rateLimiting');
const { sanitizeQuery } = require('../middleware/inputSanitization');
const {
  validatePagination,
  validateUUID,
  validateStatus,
  validateType,
  validateBoolean
} = require('../middleware/validation');
const AdminService = require('../services/adminService');

const router = express.Router();

// ============================================================================
// MIDDLEWARE - MUST BE BEFORE ALL ROUTES
// ============================================================================
// Apply rate limiting and sanitization to ALL admin routes
router.use(adminActionLimiter);
router.use(sanitizeQuery());

// ============================================================================
// ROUTES
// ============================================================================

// @route   GET /api/admin/stats
// @desc    Get admin dashboard statistics
// @access  Private (Admin only)
router.get('/stats', auth, requireRole(['admin']), async (req, res) => {
  try {
    const stats = await AdminService.getDashboardStats();
    res.json({
      status: 'success',
      data: stats
    });
  } catch (error) {
    logger.error('Admin stats error', { error: error.message, stack: error.stack });
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch admin statistics'
    });
  }
});

// @route   GET /api/admin/users
// @desc    Get all users for admin management
// @access  Private (Admin only)
router.get('/users', 
  auth, 
  requireRole(['admin']), 
  validatePagination,
  async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      
      const result = await AdminService.getUsers(page, limit);
      
      res.json({
        status: 'success',
        data: {
          users: result.users,
          pagination: {
            currentPage: page,
            totalPages: Math.ceil(result.totalCount / limit),
            totalCount: result.totalCount,
            limit
          }
        }
      });
    } catch (error) {
      logger.error('Admin users error', { error: error.message });
      res.status(500).json({
        status: 'error',
        message: 'Failed to fetch users'
      });
    }
  }
);

// @route   GET /api/admin/providers
// @desc    Get all providers for admin management
// @access  Private (Admin only)
router.get('/providers',
  auth,
  requireRole(['admin']),
  validatePagination,
  async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      
      const result = await AdminService.getProviders(page, limit);
      
      res.json({
        status: 'success',
        data: {
          providers: result.providers,
          pagination: {
            currentPage: page,
            totalPages: Math.ceil(result.totalCount / limit),
            totalCount: result.totalCount,
            limit
          }
        }
      });
    } catch (error) {
      logger.error('Admin providers error', { error: error.message });
      res.status(500).json({
        status: 'error',
        message: 'Failed to fetch providers'
      });
    }
  }
);

// @route   GET /api/admin/reports
// @desc    Get all reports (user reports about providers AND provider reports about users)
// @access  Private (Admin only)
router.get('/reports',
  auth,
  requireRole(['admin']),
  validatePagination,
  validateStatus(['open', 'resolved', 'closed', 'all']),
  validateType(['all', 'user', 'provider']),
  async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const status = req.query.status || 'all';
      const type = req.query.type || 'all';
      
      const result = await AdminService.getReports(page, limit, status, type);
      
      res.json({
        status: 'success',
        data: {
          reports: result.reports,
          pagination: {
            currentPage: page,
            totalPages: Math.ceil(result.totalCount / limit),
            totalCount: result.totalCount,
            limit
          }
        }
      });
    } catch (error) {
      logger.error('Admin reports error', { error: error.message, stack: error.stack });
      res.status(500).json({
        status: 'error',
        message: 'Failed to fetch reports',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

// @route   PUT /api/admin/reports/:id/status
// @desc    Update report status (open, resolved, closed)
// @access  Private (Admin only)
router.put('/reports/:id/status',
  auth,
  requireRole(['admin']),
  validateUUID('id'),
  validateStatus(['open', 'resolved', 'closed']),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      
      const report = await AdminService.updateReportStatus(id, status);
      
      res.json({
        status: 'success',
        message: 'Report status updated successfully',
        data: report
      });
    } catch (error) {
      if (error.message === 'Report not found') {
        return res.status(404).json({
          status: 'error',
          message: error.message
        });
      }
      
      logger.error('Admin update report error', { error: error.message });
      res.status(500).json({
        status: 'error',
        message: 'Failed to update report status'
      });
    }
  }
);

// @route   DELETE /api/admin/reports/pending
// @desc    Delete all pending reports across all tables
// @access  Private (Admin only)
router.delete('/reports/pending', auth, requireRole(['admin']), async (req, res) => {
  try {
    const result = await AdminService.deletePendingReports();
    
    res.json({
      status: 'success',
      message: 'Pending reports cleared successfully',
      data: {
        totalDeleted: result.totalDeleted,
        deletedUserReports: result.deletedUserReports,
        deletedProviderReports: result.deletedProviderReports,
        deletedLegacyReports: result.deletedLegacyReports
      }
    });
  } catch (error) {
    logger.error('Admin delete pending reports error', { error: error.message });
    res.status(500).json({
      status: 'error',
      message: 'Failed to delete pending reports'
    });
  }
});

// @route   DELETE /api/admin/users/:id
// @desc    Remove a user from the app
// @access  Private (Admin only)
router.delete('/users/:id',
  auth,
  requireRole(['admin']),
  validateUUID('id'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const adminId = req.user?.id;
      
      await AdminService.deleteUser(id, adminId);
      
      res.json({
        status: 'success',
        message: 'User removed successfully'
      });
    } catch (error) {
      if (error.message === 'User not found') {
        return res.status(404).json({
          status: 'error',
          message: error.message
        });
      }
      
      if (error.message.includes('Failed to block')) {
        return res.status(500).json({
          status: 'error',
          message: error.message
        });
      }
      
      logger.error('Admin delete user error', { error: error.message, userId: req.params.id });
      res.status(500).json({
        status: 'error',
        message: 'Failed to remove user'
      });
    }
  }
);

// @route   DELETE /api/admin/providers/:id
// @desc    Remove a provider from the app
// @access  Private (Admin only)
router.delete('/providers/:id',
  auth,
  requireRole(['admin']),
  validateUUID('id'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const adminId = req.user?.id;
      
      await AdminService.deleteProvider(id, adminId);
      
      res.json({
        status: 'success',
        message: 'Provider removed successfully'
      });
    } catch (error) {
      if (error.message === 'Provider not found') {
        return res.status(404).json({
          status: 'error',
          message: error.message
        });
      }
      
      if (error.message.includes('Failed to block')) {
        return res.status(500).json({
          status: 'error',
          message: error.message
        });
      }
      
      logger.error('Admin delete provider error', { error: error.message, providerId: req.params.id });
      res.status(500).json({
        status: 'error',
        message: 'Failed to remove provider'
      });
    }
  }
);

// @route   PUT /api/admin/users/:id/verify
// @desc    Verify or unverify a user
// @access  Private (Admin only)
router.put('/users/:id/verify',
  auth,
  requireRole(['admin']),
  validateUUID('id'),
  validateBoolean('isVerified', 'body'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { isVerified } = req.body;
      
      const user = await AdminService.updateUserVerification(id, 'user', isVerified);
      
      res.json({
        status: 'success',
        message: `User ${isVerified ? 'verified' : 'unverified'} successfully`,
        data: user
      });
    } catch (error) {
      if (error.message === 'User not found') {
        return res.status(404).json({
          status: 'error',
          message: error.message
        });
      }
      
      logger.error('Admin verify user error', { error: error.message });
      res.status(500).json({
        status: 'error',
        message: 'Failed to update user verification status'
      });
    }
  }
);

// @route   PUT /api/admin/providers/:id/verify
// @desc    Verify or unverify a provider
// @access  Private (Admin only)
router.put('/providers/:id/verify',
  auth,
  requireRole(['admin']),
  validateUUID('id'),
  validateBoolean('isVerified', 'body'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { isVerified } = req.body;
      
      const provider = await AdminService.updateUserVerification(id, 'provider', isVerified);
      
      res.json({
        status: 'success',
        message: `Provider ${isVerified ? 'verified' : 'unverified'} successfully`,
        data: provider
      });
    } catch (error) {
      if (error.message === 'Provider not found') {
        return res.status(404).json({
          status: 'error',
          message: error.message
        });
      }
      
      logger.error('Admin verify provider error', { error: error.message });
      res.status(500).json({
        status: 'error',
        message: 'Failed to update provider verification status'
      });
    }
  }
);

// @route   GET /api/admin/all-users
// @desc    Get all users for admin dashboard (alternative endpoint)
// @access  Private (Admin only)
router.get('/all-users', auth, requireRole(['admin']), async (req, res) => {
  try {
    // Get all users without pagination for admin dashboard
    const result = await AdminService.getUsers(1, 10000); // Large limit to get all
    
    res.json({
      status: 'success',
      data: {
        users: result.users
      }
    });
  } catch (error) {
    logger.error('Admin all-users error', { error: error.message });
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch users'
    });
  }
});

// @route   GET /api/admin/all-providers
// @desc    Get all providers for admin dashboard (alternative endpoint)
// @access  Private (Admin only)
router.get('/all-providers', auth, requireRole(['admin']), async (req, res) => {
  try {
    // Get all providers without pagination for admin dashboard
    const result = await AdminService.getProviders(1, 10000); // Large limit to get all
    
    res.json({
      status: 'success',
      data: {
        providers: result.providers
      }
    });
  } catch (error) {
    logger.error('Admin all-providers error', { error: error.message });
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch providers'
    });
  }
});

module.exports = router;
