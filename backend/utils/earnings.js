const { getRows } = require('../database/connection');
const getIO = () => require('../server').io;

/**
 * Calculate earnings for a specific provider
 * @param {string} providerUserId - The provider's user ID
 * @returns {Promise<Object>} Earnings data
 */
const calculateEarnings = async (providerUserId) => {
  try {
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
      return null;
    }

    const providerProfileId = providerProfile[0].id;

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
