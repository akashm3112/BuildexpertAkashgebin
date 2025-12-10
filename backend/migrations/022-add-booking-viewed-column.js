const { query } = require('../database/connection');

/**
 * Migration 022: Add is_viewed_by_user column to bookings table
 * Purpose: Track which booking status updates have been viewed by users
 * - Enables unread booking updates badge feature
 * - Tracks when bookings are confirmed, cancelled, or completed
 */
const addBookingViewedColumn = async () => {
  try {
    // Add is_viewed_by_user column to bookings table
    await query(`
      ALTER TABLE bookings 
      ADD COLUMN IF NOT EXISTS is_viewed_by_user BOOLEAN DEFAULT TRUE;
    `);

    // Create index for efficient queries on unread bookings
    await query(`
      CREATE INDEX IF NOT EXISTS idx_bookings_user_viewed 
      ON bookings(user_id, is_viewed_by_user) 
      WHERE is_viewed_by_user = FALSE;
    `);

    // Create composite index for status-based queries
    await query(`
      CREATE INDEX IF NOT EXISTS idx_bookings_user_status_viewed 
      ON bookings(user_id, status, is_viewed_by_user) 
      WHERE status IN ('accepted', 'cancelled', 'completed') AND is_viewed_by_user = FALSE;
    `);

    // Set all existing bookings as viewed (backward compatibility)
    // Only bookings with status changes (accepted, cancelled, completed) should be unread
    await query(`
      UPDATE bookings 
      SET is_viewed_by_user = TRUE 
      WHERE is_viewed_by_user IS NULL;
    `);

    console.log('✅ Booking viewed column added successfully');

  } catch (error) {
    console.error('❌ Error adding booking viewed column:', error);
    throw error;
  }
};

module.exports = addBookingViewedColumn;

// Run directly if executed as main module
if (require.main === module) {
  addBookingViewedColumn()
    .then(() => {
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    });
}

