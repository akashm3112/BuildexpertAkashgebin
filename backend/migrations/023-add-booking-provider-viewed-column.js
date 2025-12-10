const { query } = require('../database/connection');

/**
 * Migration 023: Add is_viewed_by_provider column to bookings table
 * Purpose: Track which booking updates have been viewed by providers
 * - Enables unread booking updates badge feature for providers
 * - Tracks when new bookings are created (pending) or cancelled
 */
const addBookingProviderViewedColumn = async () => {
  try {
    // Add is_viewed_by_provider column to bookings table
    await query(`
      ALTER TABLE bookings 
      ADD COLUMN IF NOT EXISTS is_viewed_by_provider BOOLEAN DEFAULT TRUE;
    `);

    // Create index for efficient queries on unread bookings for providers
    await query(`
      CREATE INDEX IF NOT EXISTS idx_bookings_provider_viewed 
      ON bookings(provider_service_id, is_viewed_by_provider) 
      WHERE is_viewed_by_provider = FALSE;
    `);

    // Create composite index for status-based queries (pending and cancelled)
    await query(`
      CREATE INDEX IF NOT EXISTS idx_bookings_provider_status_viewed 
      ON bookings(provider_service_id, status, is_viewed_by_provider) 
      WHERE status IN ('pending', 'cancelled') AND is_viewed_by_provider = FALSE;
    `);

    // Set all existing bookings as viewed (backward compatibility)
    await query(`
      UPDATE bookings 
      SET is_viewed_by_provider = TRUE 
      WHERE is_viewed_by_provider IS NULL;
    `);

    console.log('✅ Booking provider viewed column added successfully');

  } catch (error) {
    console.error('❌ Error adding booking provider viewed column:', error);
    throw error;
  }
};

module.exports = addBookingProviderViewedColumn;

// Run directly if executed as main module
if (require.main === module) {
  addBookingProviderViewedColumn()
    .then(() => {
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    });
}

