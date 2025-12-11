const { query } = require('../database/connection');

/**
 * Add service_charge_value column to bookings table
 * This ensures earnings persist even after a service is deleted
 */
const addServiceChargeToBookings = async () => {
  try {
    console.log('🔄 Starting migration: Add service_charge_value column to bookings table...');

    // Add the new columns (nullable initially for existing records)
    await query(`
      ALTER TABLE bookings
      ADD COLUMN IF NOT EXISTS service_charge_value DECIMAL(10, 2);
    `);
    console.log('✅ Added service_charge_value column to bookings table.');

    // Add provider_id column to track which provider the booking belongs to
    // This ensures we can calculate earnings even after service deletion
    await query(`
      ALTER TABLE bookings
      ADD COLUMN IF NOT EXISTS provider_id UUID REFERENCES provider_profiles(id);
    `);
    console.log('✅ Added provider_id column to bookings table.');

    // Backfill existing bookings with service_charge_value and provider_id from provider_services
    // Only update bookings where these values are NULL and provider_service still exists
    const backfillResult = await query(`
      UPDATE bookings b
      SET 
        service_charge_value = COALESCE(b.service_charge_value, ps.service_charge_value),
        provider_id = COALESCE(b.provider_id, ps.provider_id)
      FROM provider_services ps
      WHERE b.provider_service_id = ps.id
        AND (b.service_charge_value IS NULL OR b.provider_id IS NULL)
        AND ps.service_charge_value IS NOT NULL;
    `);
    console.log(`✅ Backfilled ${backfillResult.rowCount || 0} existing bookings with service_charge_value and provider_id.`);

    // Create index for faster earnings queries
    await query(`
      CREATE INDEX IF NOT EXISTS idx_bookings_service_charge_value
      ON bookings(service_charge_value)
      WHERE service_charge_value IS NOT NULL;
    `);
    console.log('✅ Added index on bookings(service_charge_value).');

    // Create composite index for earnings queries (provider_id + status + service_charge_value + updated_at)
    await query(`
      CREATE INDEX IF NOT EXISTS idx_bookings_earnings_query
      ON bookings(provider_id, status, service_charge_value, updated_at)
      WHERE provider_id IS NOT NULL AND service_charge_value IS NOT NULL;
    `);
    console.log('✅ Added composite index for earnings queries.');

    console.log('✅ Migration "Add service_charge_value column to bookings table" completed successfully.');
    return { success: true };
  } catch (error) {
    console.error('❌ Error in migration "Add service_charge_value column to bookings table":', error);
    return { success: false, error: error.message };
  }
};

module.exports = addServiceChargeToBookings;

