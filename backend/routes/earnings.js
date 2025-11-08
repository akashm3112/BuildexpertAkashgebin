const express = require('express');
const { getRows } = require('../database/connection');
const { auth, requireRole } = require('../middleware/auth');
const logger = require('../utils/logger');
const { standardLimiter } = require('../middleware/rateLimiting');

const router = express.Router();

// All routes require authentication
router.use(auth);

// Apply rate limiting
router.use(standardLimiter);

// @route   GET /api/earnings
// @desc    Get provider's earnings data
// @access  Private (Providers only)
router.get('/', requireRole('provider'), async (req, res) => {
  try {
    const providerUserId = req.user.id;

    // Get current date and month boundaries
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const startOfMonth = new Date(currentYear, currentMonth, 1);
    const endOfMonth = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59);
    
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    // Get provider's profile ID
    const providerProfile = await getRows(`
      SELECT id FROM provider_profiles WHERE user_id = $1
    `, [providerUserId]);

    if (!providerProfile || providerProfile.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Provider profile not found'
      });
    }

    const providerProfileId = providerProfile[0].id;

    // Business Logic for Earnings Calculation:
    // - This Month/Today: Only count bookings with status = 'completed' 
    //   (work has been done and provider should be paid)
    // - Pending: Count bookings with status = 'pending' or 'accepted'
    //   (work is confirmed but not yet completed)
    // - Cancelled bookings are automatically excluded since they have status = 'cancelled'
    // - Rejected bookings are automatically excluded since they have status = 'rejected'

    // Calculate earnings for this month (completed bookings only)
    const thisMonthEarnings = await getRows(`
      SELECT COALESCE(SUM(ps.service_charge_value), 0) as total_earnings
      FROM bookings b
      JOIN provider_services ps ON b.provider_service_id = ps.id
      WHERE ps.provider_id = $1 
        AND b.status = 'completed'
        AND b.created_at >= $2 
        AND b.created_at <= $3
    `, [providerProfileId, startOfMonth, endOfMonth]);

    // Calculate earnings for today (completed bookings only)
    const todayEarnings = await getRows(`
      SELECT COALESCE(SUM(ps.service_charge_value), 0) as total_earnings
      FROM bookings b
      JOIN provider_services ps ON b.provider_service_id = ps.id
      WHERE ps.provider_id = $1 
        AND b.status = 'completed'
        AND b.created_at >= $2 
        AND b.created_at <= $3
    `, [providerProfileId, startOfToday, endOfToday]);

    // Calculate pending earnings (pending and accepted bookings - not yet completed)
    const pendingEarnings = await getRows(`
      SELECT COALESCE(SUM(ps.service_charge_value), 0) as total_earnings
      FROM bookings b
      JOIN provider_services ps ON b.provider_service_id = ps.id
      WHERE ps.provider_id = $1 
        AND b.status IN ('pending', 'accepted')
    `, [providerProfileId]);

    // Format the amounts
    const formatAmount = (amount) => {
      if (!amount || amount === 0) return '₹0';
      return `₹${parseInt(amount).toLocaleString('en-IN')}`;
    };

    const earnings = {
      thisMonth: formatAmount(thisMonthEarnings[0]?.total_earnings || 0),
      today: formatAmount(todayEarnings[0]?.total_earnings || 0),
      pending: formatAmount(pendingEarnings[0]?.total_earnings || 0)
    };

    res.json({
      status: 'success',
      data: {
        earnings
      }
    });

  } catch (error) {
    logger.error('Get earnings error', { error: error.message });
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch earnings data'
    });
  }
});

module.exports = router;
