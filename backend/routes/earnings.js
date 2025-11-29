const express = require('express');
const { getRows } = require('../database/connection');
const { auth, requireRole } = require('../middleware/auth');
const logger = require('../utils/logger');
const { standardLimiter } = require('../middleware/rateLimiting');
const { asyncHandler } = require('../middleware/errorHandler');
const { NotFoundError } = require('../utils/errorTypes');

const router = express.Router();

// All routes require authentication
router.use(auth);

// Apply rate limiting
router.use(standardLimiter);

// @route   GET /api/earnings
// @desc    Get provider's earnings data
// @access  Private (Providers only)
router.get('/', requireRole('provider'), asyncHandler(async (req, res) => {
  const providerUserId = req.user.id;

  // Use IST timezone for date calculations (database is configured for Asia/Kolkata)
  // PostgreSQL will handle timezone conversions automatically with NOW() and date comparisons

  // Get provider's profile ID
  const providerProfile = await getRows(`
    SELECT id FROM provider_profiles WHERE user_id = $1
  `, [providerUserId]);

  if (!providerProfile || providerProfile.length === 0) {
    throw new NotFoundError('Provider profile not found');
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
    // Use updated_at to filter by when the booking was completed, not when it was created
    // Database is in IST timezone, so we compare dates directly
    const thisMonthEarnings = await getRows(`
      SELECT COALESCE(SUM(ps.service_charge_value), 0) as total_earnings
      FROM bookings b
      JOIN provider_services ps ON b.provider_service_id = ps.id
      WHERE ps.provider_id = $1 
        AND b.status = 'completed'
        AND DATE(b.updated_at) >= DATE_TRUNC('month', CURRENT_DATE)::date
        AND DATE(b.updated_at) < (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month')::date
    `, [providerProfileId]);

    // Calculate earnings for today (completed bookings only)
    // Use updated_at to filter by when the booking was completed today
    const todayEarnings = await getRows(`
      SELECT COALESCE(SUM(ps.service_charge_value), 0) as total_earnings
      FROM bookings b
      JOIN provider_services ps ON b.provider_service_id = ps.id
      WHERE ps.provider_id = $1 
        AND b.status = 'completed'
        AND DATE(b.updated_at) = CURRENT_DATE
    `, [providerProfileId]);

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
}));

module.exports = router;
