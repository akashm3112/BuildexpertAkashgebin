const { getRows } = require('../database/connection');
const getIO = () => require('../server').io;

/**
 * Calculate earnings for a specific provider
 * @param {string} providerUserId - The provider's user ID
 * @returns {Promise<Object>} Earnings data
 */
const calculateEarnings = async (providerUserId) => {
  try {
    // Use IST timezone for date calculations (database is configured for Asia/Kolkata)
    // PostgreSQL will handle timezone conversions automatically with NOW() and date comparisons

    // Get provider's profile ID
    const providerProfile = await getRows(`
      SELECT id FROM provider_profiles WHERE user_id = $1
    `, [providerUserId]);

    if (!providerProfile || providerProfile.length === 0) {
      return null;
    }

    const providerProfileId = providerProfile[0].id;

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

    return {
      thisMonth: formatAmount(thisMonthEarnings[0]?.total_earnings || 0),
      today: formatAmount(todayEarnings[0]?.total_earnings || 0),
      pending: formatAmount(pendingEarnings[0]?.total_earnings || 0)
    };
  } catch (error) {
    console.error('Error calculating earnings:', error);
    return null;
  }
};

/**
 * Emit earnings update to a specific provider
 * @param {string} providerUserId - The provider's user ID
 */
const emitEarningsUpdate = async (providerUserId) => {
  try {
    const earnings = await calculateEarnings(providerUserId);
    if (earnings) {
      const io = getIO();
      io.to(providerUserId).emit('earnings_updated', {
        status: 'success',
        data: { earnings }
      });
      console.log(`📊 Earnings update emitted to provider ${providerUserId}`);
    }
  } catch (error) {
    console.error('Error emitting earnings update:', error);
  }
};

/**
 * Emit earnings update to multiple providers
 * @param {Array<string>} providerUserIds - Array of provider user IDs
 */
const emitEarningsUpdateToMultiple = async (providerUserIds) => {
  try {
    for (const providerUserId of providerUserIds) {
      await emitEarningsUpdate(providerUserId);
    }
  } catch (error) {
    console.error('Error emitting earnings updates to multiple providers:', error);
  }
};

module.exports = {
  calculateEarnings,
  emitEarningsUpdate,
  emitEarningsUpdateToMultiple
};
