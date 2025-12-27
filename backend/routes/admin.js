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
const { asyncHandler } = require('../middleware/errorHandler');
const { NotFoundError } = require('../utils/errorTypes');

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
router.get('/stats', auth, requireRole(['admin']), asyncHandler(async (req, res) => {
  // Cache admin stats (dynamic - 2 minutes TTL)
  const cacheKey = CacheKeys.adminStats();
  const result = await cacheQuery(cacheKey, async () => {
    const stats = await AdminService.getDashboardStats();
    return {
      status: 'success',
      data: stats
    };
  }, { cacheType: 'dynamic', ttl: 120000 }); // 2 minutes

  res.json(result);
}));

// @route   GET /api/admin/users
// @desc    Get all users for admin management
// @access  Private (Admin only)
router.get('/users', 
  auth, 
  requireRole(['admin']), 
  validatePagination,
  asyncHandler(async (req, res) => {
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
  })
);

// @route   GET /api/admin/providers
// @desc    Get all providers for admin management
// @access  Private (Admin only)
router.get('/providers',
  auth,
  requireRole(['admin']),
  validatePagination,
  asyncHandler(async (req, res) => {
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
  })
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
  asyncHandler(async (req, res) => {
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
  })
);

// @route   PUT /api/admin/reports/:id/status
// @desc    Update report status (open, resolved, closed)
// @access  Private (Admin only)
router.put('/reports/:id/status',
  auth,
  requireRole(['admin']),
  validateUUID('id'),
  validateStatus(['open', 'resolved', 'closed']),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    
    const report = await AdminService.updateReportStatus(id, status);
    
    if (!report) {
      throw new NotFoundError('Report', id);
    }
    
    res.json({
      status: 'success',
      message: 'Report status updated successfully',
      data: report
    });
  })
);

// @route   DELETE /api/admin/reports/pending
// @desc    Delete all pending reports across all tables
// @access  Private (Admin only)
router.delete('/reports/pending', auth, requireRole(['admin']), asyncHandler(async (req, res) => {
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
}));

// @route   DELETE /api/admin/users/:id
// @desc    Remove a user from the app
// @access  Private (Admin only)
router.delete('/users/:id',
  auth,
  requireRole(['admin']),
  validateUUID('id'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const adminId = req.user?.id;
    
    await AdminService.deleteUser(id, adminId);
    
    res.json({
      status: 'success',
      message: 'User removed successfully'
    });
  })
);

// @route   DELETE /api/admin/providers/:id
// @desc    Remove a provider from the app
// @access  Private (Admin only)
router.delete('/providers/:id',
  auth,
  requireRole(['admin']),
  validateUUID('id'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const adminId = req.user?.id;
    
    await AdminService.deleteProvider(id, adminId);
    
    res.json({
      status: 'success',
      message: 'Provider removed successfully'
    });
  })
);

// @route   PUT /api/admin/users/:id/verify
// @desc    Verify or unverify a user
// @access  Private (Admin only)
router.put('/users/:id/verify',
  auth,
  requireRole(['admin']),
  validateUUID('id'),
  validateBoolean('isVerified', 'body'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { isVerified } = req.body;
    
    const user = await AdminService.updateUserVerification(id, 'user', isVerified);
    
    if (!user) {
      throw new NotFoundError('User', id);
    }
    
    res.json({
      status: 'success',
      message: `User ${isVerified ? 'verified' : 'unverified'} successfully`,
      data: user
    });
  })
);

// @route   PUT /api/admin/providers/:id/verify
// @desc    Verify or unverify a provider
// @access  Private (Admin only)
router.put('/providers/:id/verify',
  auth,
  requireRole(['admin']),
  validateUUID('id'),
  validateBoolean('isVerified', 'body'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { isVerified } = req.body;
    
    const provider = await AdminService.updateUserVerification(id, 'provider', isVerified);
    
    if (!provider) {
      throw new NotFoundError('Provider', id);
    }
    
    res.json({
      status: 'success',
      message: `Provider ${isVerified ? 'verified' : 'unverified'} successfully`,
      data: provider
    });
  })
);

// @route   GET /api/admin/all-users
// @desc    Get all users for admin dashboard with pagination
// @access  Private (Admin only)
router.get('/all-users', auth, requireRole(['admin']), validatePagination, asyncHandler(async (req, res) => {
  const { page = 1, limit = 50 } = req.query;
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  
  // Enforce maximum limit for performance
  const finalLimit = Math.min(limitNum, 100);
  
  const result = await AdminService.getUsers(pageNum, finalLimit);
  
  res.json({
    status: 'success',
    data: {
      users: result.users,
      pagination: result.pagination
    }
  });
}));

// @route   GET /api/admin/all-providers
// @desc    Get all providers for admin dashboard with pagination
// @access  Private (Admin only)
router.get('/all-providers', auth, requireRole(['admin']), validatePagination, asyncHandler(async (req, res) => {
  const { page = 1, limit = 50 } = req.query;
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  
  // Enforce maximum limit for performance
  const finalLimit = Math.min(limitNum, 100);
  
  const result = await AdminService.getProviders(pageNum, finalLimit);
  
  res.json({
    status: 'success',
    data: {
      providers: result.providers,
      pagination: result.pagination
    }
  });
}));

module.exports = router;
