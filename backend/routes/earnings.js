const express = require('express');
const { getRows } = require('../database/connection');
const { auth, requireRole } = require('../middleware/auth');
const logger = require('../utils/logger');
const { standardLimiter } = require('../middleware/rateLimiting');
const { asyncHandler } = require('../middleware/errorHandler');
const { NotFoundError } = require('../utils/errorTypes');
const { CacheKeys, cacheQuery } = require('../utils/cacheIntegration');

const router = express.Router();

// All routes require authentication
router.use(auth);

// Apply rate limiting
router.use(standardLimiter);

// @route   GET /api/earnings
// @desc    Get provider's earnings data
// @access  Private (Providers only)
router.get('/', requireRole(['provider']), asyncHandler(async (req, res) => {
  try {
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

    // Format the amounts
    const formatAmount = (amount) => {
      if (!amount || amount === 0) return '₹0';
      const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
      if (isNaN(numAmount)) return '₹0';
      return `₹${Math.floor(numAmount).toLocaleString('en-IN')}`;
    };

    // Cache earnings (user-specific - 1 minute TTL, recalculates frequently)
    const cacheKey = CacheKeys.earnings(providerProfileId);
    const result = await cacheQuery(cacheKey, async () => {
      try {
        // Calculate earnings for this month (completed bookings only)
        // Use updated_at to filter by when the booking was completed, not when it was created
        // Database is in IST timezone, so we compare dates directly
        // PRODUCTION FIX: Use stored service_charge_value from bookings table
        // This ensures earnings persist even after service deletion
        // The service_charge_value is stored in bookings table when booking is created
        const thisMonthEarnings = await getRows(`
          SELECT COALESCE(SUM(COALESCE(b.service_charge_value, 0)), 0) as total_earnings
          FROM bookings b
          WHERE b.provider_id = $1
            AND b.status = 'completed'
            AND DATE(b.updated_at) >= DATE_TRUNC('month', CURRENT_DATE)::date
            AND DATE(b.updated_at) < (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month')::date
        `, [providerProfileId]);

        // Calculate earnings for today (completed bookings only)
        // Use updated_at to filter by when the booking was completed today
        const todayEarnings = await getRows(`
          SELECT COALESCE(SUM(COALESCE(b.service_charge_value, 0)), 0) as total_earnings
          FROM bookings b
          WHERE b.provider_id = $1
            AND b.status = 'completed'
            AND DATE(b.updated_at) = CURRENT_DATE
        `, [providerProfileId]);

        // Calculate pending earnings (pending and accepted bookings - not yet completed)
        const pendingEarnings = await getRows(`
          SELECT COALESCE(SUM(COALESCE(b.service_charge_value, 0)), 0) as total_earnings
          FROM bookings b
          WHERE b.provider_id = $1
            AND b.status IN ('pending', 'accepted')
        `, [providerProfileId]);

        // Safely extract earnings values with proper null checks
        const thisMonthValue = thisMonthEarnings && thisMonthEarnings.length > 0 && thisMonthEarnings[0]?.total_earnings
          ? parseFloat(thisMonthEarnings[0].total_earnings) || 0
          : 0;
        const todayValue = todayEarnings && todayEarnings.length > 0 && todayEarnings[0]?.total_earnings
          ? parseFloat(todayEarnings[0].total_earnings) || 0
          : 0;
        const pendingValue = pendingEarnings && pendingEarnings.length > 0 && pendingEarnings[0]?.total_earnings
          ? parseFloat(pendingEarnings[0].total_earnings) || 0
          : 0;

        const earnings = {
          thisMonth: formatAmount(thisMonthValue),
          today: formatAmount(todayValue),
          pending: formatAmount(pendingValue)
        };

        return {
          status: 'success',
          data: {
            earnings
          }
        };
      } catch (error) {
        logger.error('Error calculating earnings in cacheQuery', {
          providerProfileId,
          error: error.message,
          stack: error.stack
        });
        // Return default values on error
        return {
          status: 'success',
          data: {
            earnings: {
              thisMonth: '₹0',
              today: '₹0',
              pending: '₹0'
            }
          }
        };
      }
    }, { cacheType: 'user', ttl: 60000 }); // 1 minute

    res.json(result);
  } catch (error) {
    logger.error('Error in earnings route', {
      providerUserId: req.user?.id,
      error: error.message,
      stack: error.stack
    });
    throw error; // Let asyncHandler handle it
  }
}));

module.exports = router;
