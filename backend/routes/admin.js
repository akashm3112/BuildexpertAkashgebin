const express = require('express');
const { query, getRow } = require('../database/connection');
const { auth, requireRole } = require('../middleware/auth');
const logger = require('../utils/logger');
const router = express.Router();

// @route   GET /api/admin/stats
// @desc    Get admin dashboard statistics
// @access  Private (Admin only)
router.get('/stats', auth, requireRole(['admin']), async (req, res) => {
  try {
    // Get total users count
    const usersResult = await query('SELECT COUNT(*) as count FROM users WHERE role = $1', ['user']);
    const totalUsers = parseInt(usersResult.rows[0].count);

    // Get total providers count
    const providersResult = await query('SELECT COUNT(*) as count FROM users WHERE role = $1', ['provider']);
    const totalProviders = parseInt(providersResult.rows[0].count);

    // Get total bookings count
    const bookingsResult = await query('SELECT COUNT(*) as count FROM bookings');
    const totalBookings = parseInt(bookingsResult.rows[0].count);

    // Get total revenue (sum of all completed payments)
    const revenueResult = await query(`
      SELECT COALESCE(SUM(amount), 0) as total 
      FROM payment_transactions 
      WHERE status = 'completed'
    `);
    const totalRevenue = parseFloat(revenueResult.rows[0].total) || 0;

    // Get reports counts by status from BOTH tables
    let reportsStats = { total: 0, open: 0, resolved: 0, closed: 0 };
    try {
      // Count from user_reports_providers (users reporting providers)
      const userReportsTotal = await query(`SELECT COUNT(*) as count FROM user_reports_providers`);
      const userReportsOpen = await query(`SELECT COUNT(*) as count FROM user_reports_providers WHERE status = 'open'`);
      const userReportsResolved = await query(`SELECT COUNT(*) as count FROM user_reports_providers WHERE status = 'resolved'`);
      const userReportsClosed = await query(`SELECT COUNT(*) as count FROM user_reports_providers WHERE status = 'closed'`);
      
      // Count from provider_reports_users (providers reporting users)
      const providerReportsTotal = await query(`SELECT COUNT(*) as count FROM provider_reports_users`);
      const providerReportsOpen = await query(`SELECT COUNT(*) as count FROM provider_reports_users WHERE status = 'open'`);
      const providerReportsResolved = await query(`SELECT COUNT(*) as count FROM provider_reports_users WHERE status = 'resolved'`);
      const providerReportsClosed = await query(`SELECT COUNT(*) as count FROM provider_reports_users WHERE status = 'closed'`);
      
      // Combine counts
      reportsStats.total = parseInt(userReportsTotal.rows[0].count) + parseInt(providerReportsTotal.rows[0].count);
      reportsStats.open = parseInt(userReportsOpen.rows[0].count) + parseInt(providerReportsOpen.rows[0].count);
      reportsStats.resolved = parseInt(userReportsResolved.rows[0].count) + parseInt(providerReportsResolved.rows[0].count);
      reportsStats.closed = parseInt(userReportsClosed.rows[0].count) + parseInt(providerReportsClosed.rows[0].count);
    } catch (error) {
      logger.warn('Reports tables not found, setting all report stats to 0');
    }

    res.json({
      status: 'success',
      data: {
        totalUsers,
        totalProviders,
        totalBookings,
        totalRevenue,
        pendingReports: reportsStats.open, // For backward compatibility with main dashboard
        reportsStats // For reports tab
      }
    });
  } catch (error) {
    logger.error('Admin stats error', { error: error.message });
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch admin statistics'
    });
  }
});

// @route   GET /api/admin/users
// @desc    Get all users for admin management
// @access  Private (Admin only)
router.get('/users', auth, requireRole(['admin']), async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    // Get users with pagination
    const usersResult = await query(`
      SELECT 
        u.id, u.full_name, u.email, u.phone, u.role, u.is_verified, u.created_at,
        COUNT(b.id) as total_bookings
      FROM users u
      LEFT JOIN bookings b ON u.id = b.user_id
      WHERE u.role = 'user'
      GROUP BY u.id, u.full_name, u.email, u.phone, u.role, u.is_verified, u.created_at
      ORDER BY u.created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    // Get total count
    const countResult = await query('SELECT COUNT(*) as count FROM users WHERE role = $1', ['user']);
    const totalCount = parseInt(countResult.rows[0].count);

    res.json({
      status: 'success',
      data: {
        users: usersResult.rows,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalCount / limit),
          totalCount,
          limit: parseInt(limit)
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
});

// @route   GET /api/admin/providers
// @desc    Get all providers for admin management
// @access  Private (Admin only)
router.get('/providers', auth, requireRole(['admin']), async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    // Get providers (check if provider_profiles table exists first)
    let providersResult;
    try {
      // Try with provider_profiles join
      providersResult = await query(`
        SELECT 
          u.id, u.full_name, u.email, u.phone, u.role, u.is_verified, u.created_at,
          pp.business_name, pp.experience_years, pp.rating, pp.total_reviews
        FROM users u
        LEFT JOIN provider_profiles pp ON u.id = pp.user_id
        WHERE u.role = 'provider'
        ORDER BY u.created_at DESC
        LIMIT $1 OFFSET $2
      `, [limit, offset]);
    } catch (error) {
      // Fallback to basic user query if provider_profiles table doesn't exist
      providersResult = await query(`
        SELECT 
          u.id, u.full_name, u.email, u.phone, u.role, u.is_verified, u.created_at,
          NULL as business_name, NULL as experience_years, NULL as rating, NULL as total_reviews
        FROM users u
        WHERE u.role = 'provider'
        ORDER BY u.created_at DESC
        LIMIT $1 OFFSET $2
      `, [limit, offset]);
    }

    // Get total count
    const countResult = await query('SELECT COUNT(*) as count FROM users WHERE role = $1', ['provider']);
    const totalCount = parseInt(countResult.rows[0].count);

    res.json({
      status: 'success',
      data: {
        providers: providersResult.rows,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalCount / limit),
          totalCount,
          limit: parseInt(limit)
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
});

// @route   GET /api/admin/reports
// @desc    Get all reports (user reports about providers AND provider reports about users)
// @access  Private (Admin only)
router.get('/reports', auth, requireRole(['admin']), async (req, res) => {
  try {
    const { page = 1, limit = 20, status = 'all', type = 'all' } = req.query;
    const offset = (page - 1) * limit;

    let allReports = [];
    let totalCount = 0;

    // Fetch user reports (users reporting providers)
    if (type === 'all' || type === 'user') {
      let whereClause = '';
      let queryParams = [];

      if (status !== 'all') {
        whereClause = 'WHERE urp.status = $1';
        queryParams.push(status);
      }

      const userReportsQuery = await query(`
        SELECT 
          urp.id, 
          urp.report_type, 
          urp.description, 
          urp.status, 
          urp.created_at, 
          urp.updated_at,
          urp.reported_by_user_id, 
          urp.reported_provider_id,
          u.full_name as reporter_name, 
          u.phone as reporter_phone,
          p.full_name as reported_provider_name, 
          p.phone as reported_provider_phone,
          pp.service_description as reported_provider_business,
          'user_report' as report_source
        FROM user_reports_providers urp
        LEFT JOIN users u ON urp.reported_by_user_id = u.id
        LEFT JOIN users p ON urp.reported_provider_id = p.id
        LEFT JOIN provider_profiles pp ON p.id = pp.user_id
        ${whereClause}
        ORDER BY urp.created_at DESC
      `, queryParams);

      allReports = allReports.concat(userReportsQuery.rows.map(r => ({
        ...r,
        report_category: 'User Report',
        reporter_type: 'User',
        reported_type: 'Provider'
      })));
    }

    // Fetch provider reports (providers reporting users)
    if (type === 'all' || type === 'provider') {
      let whereClause = '';
      let queryParams = [];

      if (status !== 'all') {
        whereClause = 'WHERE pru.status = $1';
        queryParams.push(status);
      }

      const providerReportsQuery = await query(`
        SELECT 
          pru.id,
          pru.incident_type as report_type,
          pru.description,
          pru.status,
          pru.created_at,
          pru.updated_at,
          pru.provider_id,
          pru.customer_name,
          pru.customer_user_id,
          pru.incident_date,
          pru.incident_time,
          pru.evidence,
          p.full_name as provider_name,
          p.phone as provider_phone,
          u.full_name as customer_user_name,
          u.phone as customer_user_phone,
          'provider_report' as report_source
        FROM provider_reports_users pru
        LEFT JOIN users p ON pru.provider_id = p.id
        LEFT JOIN users u ON pru.customer_user_id = u.id
        ${whereClause}
        ORDER BY pru.created_at DESC
      `, queryParams);

      allReports = allReports.concat(providerReportsQuery.rows.map(r => ({
        ...r,
        report_category: 'Provider Report',
        reporter_type: 'Provider',
        reported_type: 'User',
        reporter_name: r.provider_name,
        reporter_phone: r.provider_phone,
        reported_provider_name: r.customer_user_name || r.customer_name,
        reported_provider_phone: r.customer_user_phone
      })));
    }

    // Sort all reports by created_at
    allReports.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // Apply pagination
    totalCount = allReports.length;
    const paginatedReports = allReports.slice(offset, offset + parseInt(limit));

    res.json({
      status: 'success',
      data: {
        reports: paginatedReports,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalCount / limit),
          totalCount,
          limit: parseInt(limit)
        }
      }
    });
  } catch (error) {
    logger.error('Admin reports error', { error: error.message });
    res.json({
      status: 'error',
      message: 'Failed to fetch reports'
    });
  }
});

// @route   PUT /api/admin/reports/:id/status
// @desc    Update report status (open, resolved, closed)
// @access  Private (Admin only)
router.put('/reports/:id/status', auth, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['open', 'resolved', 'closed'].includes(status)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid status. Must be open, resolved, or closed'
      });
    }

    // Try updating in user_reports_providers first
    let result = await query(
      'UPDATE user_reports_providers SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [status, id]
    );

    // If not found, try provider_reports_users
    if (result.rows.length === 0) {
      result = await query(
        'UPDATE provider_reports_users SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
        [status, id]
      );
    }

    if (result.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Report not found'
      });
    }

    res.json({
      status: 'success',
      message: 'Report status updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    logger.error('Admin update report error', { error: error.message });
    res.status(500).json({
      status: 'error',
      message: 'Failed to update report status'
    });
  }
});

// @route   DELETE /api/admin/users/:id
// @desc    Remove a user from the app
// @access  Private (Admin only)
router.delete('/users/:id', auth, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;

    // Check if user exists
    const user = await getRow('SELECT * FROM users WHERE id = $1 AND role = $2', [id, 'user']);
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Delete related data first to avoid foreign key constraints
    // Delete notifications
    await query('DELETE FROM notifications WHERE user_id = $1', [id]);
    
    // Delete reports made by this user
    await query('DELETE FROM provider_reports WHERE reported_by_user_id = $1', [id]);
    
    // Delete bookings (this will cascade to ratings)
    await query('DELETE FROM bookings WHERE user_id = $1', [id]);
    
    // Delete addresses (this has CASCADE, but being explicit)
    await query('DELETE FROM addresses WHERE user_id = $1', [id]);
    
    // Delete user
    await query('DELETE FROM users WHERE id = $1', [id]);

    res.json({
      status: 'success',
      message: 'User removed successfully'
    });
  } catch (error) {
    logger.error('Admin delete user error', { error: error.message, userId: req.params.id });
    res.status(500).json({
      status: 'error',
      message: 'Failed to remove user'
    });
  }
});

// @route   DELETE /api/admin/providers/:id
// @desc    Remove a provider from the app
// @access  Private (Admin only)
router.delete('/providers/:id', auth, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;

    // Check if provider exists
    const provider = await getRow('SELECT * FROM users WHERE id = $1 AND role = $2', [id, 'provider']);
    if (!provider) {
      return res.status(404).json({
        status: 'error',
        message: 'Provider not found'
      });
    }

    // Get provider profile ID for cascading deletions
    const providerProfile = await getRow('SELECT id FROM provider_profiles WHERE user_id = $1', [id]);
    
    // Delete related data first to avoid foreign key constraints
    // Delete notifications
    await query('DELETE FROM notifications WHERE user_id = $1', [id]);
    
    // Delete provider reports (reports about this provider and reports made by this provider)
    await query('DELETE FROM provider_reports WHERE reported_provider_id = $1 OR reported_by_user_id = $1', [id]);
    
    // Delete bookings first (to avoid foreign key constraint)
    if (providerProfile) {
      await query(`
        DELETE FROM bookings 
        WHERE provider_service_id IN (
          SELECT ps.id FROM provider_services ps 
          WHERE ps.provider_id = $1
        )
      `, [providerProfile.id]);
    }
    
    // Delete provider services after bookings are deleted
    if (providerProfile) {
      await query('DELETE FROM provider_services WHERE provider_id = $1', [providerProfile.id]);
    }
    
    // Delete addresses (this has CASCADE, but being explicit)
    await query('DELETE FROM addresses WHERE user_id = $1', [id]);
    
    // Delete provider profile (this has CASCADE)
    if (providerProfile) {
      await query('DELETE FROM provider_profiles WHERE id = $1', [providerProfile.id]);
    }
    
    // Delete user
    await query('DELETE FROM users WHERE id = $1', [id]);

    res.json({
      status: 'success',
      message: 'Provider removed successfully'
    });
  } catch (error) {
    logger.error('Admin delete provider error', { error: error.message, providerId: req.params.id });
    res.status(500).json({
      status: 'error',
      message: 'Failed to remove provider'
    });
  }
});

// @route   PUT /api/admin/users/:id/verify
// @desc    Verify or unverify a user
// @access  Private (Admin only)
router.put('/users/:id/verify', auth, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { isVerified } = req.body;

    const result = await query(
      'UPDATE users SET is_verified = $1 WHERE id = $2 AND role = $3 RETURNING *',
      [isVerified, id, 'user']
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    res.json({
      status: 'success',
      message: `User ${isVerified ? 'verified' : 'unverified'} successfully`,
      data: result.rows[0]
    });
  } catch (error) {
    logger.error('Admin verify user error', { error: error.message });
    res.status(500).json({
      status: 'error',
      message: 'Failed to update user verification status'
    });
  }
});

// @route   PUT /api/admin/providers/:id/verify
// @desc    Verify or unverify a provider
// @access  Private (Admin only)
router.put('/providers/:id/verify', auth, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { isVerified } = req.body;

    const result = await query(
      'UPDATE users SET is_verified = $1 WHERE id = $2 AND role = $3 RETURNING *',
      [isVerified, id, 'provider']
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Provider not found'
      });
    }

    res.json({
      status: 'success',
      message: `Provider ${isVerified ? 'verified' : 'unverified'} successfully`,
      data: result.rows[0]
    });
  } catch (error) {
    logger.error('Admin verify provider error', { error: error.message });
    res.status(500).json({
      status: 'error',
      message: 'Failed to update provider verification status'
    });
  }
});

// @route   GET /api/admin/all-users
// @desc    Get all users for admin dashboard (alternative endpoint)
// @access  Private (Admin only)
router.get('/all-users', auth, requireRole(['admin']), async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    // Get all users without pagination for admin dashboard
    const usersResult = await query(`
      SELECT 
        u.id, u.full_name, u.email, u.phone, u.role, u.is_verified, u.created_at,
        COUNT(b.id) as total_bookings
      FROM users u
      LEFT JOIN bookings b ON u.id = b.user_id
      WHERE u.role = 'user'
      GROUP BY u.id, u.full_name, u.email, u.phone, u.role, u.is_verified, u.created_at
      ORDER BY u.created_at DESC
    `);

    res.json({
      status: 'success',
      data: {
        users: usersResult.rows
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
    let providersResult;
    try {
      // Try with provider_profiles join
      providersResult = await query(`
        SELECT 
          u.id, u.full_name, u.email, u.phone, u.role, u.is_verified, u.created_at,
          pp.business_name, pp.experience_years, pp.rating, pp.total_reviews
        FROM users u
        LEFT JOIN provider_profiles pp ON u.id = pp.user_id
        WHERE u.role = 'provider'
        ORDER BY u.created_at DESC
      `);
    } catch (error) {
      // Fallback to basic user query if provider_profiles table doesn't exist
      providersResult = await query(`
        SELECT 
          u.id, u.full_name, u.email, u.phone, u.role, u.is_verified, u.created_at,
          NULL as business_name, NULL as experience_years, NULL as rating, NULL as total_reviews
        FROM users u
        WHERE u.role = 'provider'
        ORDER BY u.created_at DESC
      `);
    }

    res.json({
      status: 'success',
      data: {
        providers: providersResult.rows
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
