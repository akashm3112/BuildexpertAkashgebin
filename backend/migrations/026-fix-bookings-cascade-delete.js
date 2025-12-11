const { query } = require('../database/connection');

/**
 * Fix bookings CASCADE DELETE constraint
 * Change from ON DELETE CASCADE to ON DELETE SET NULL
 * This ensures bookings persist even after service deletion, preserving earnings
 */
const fixBookingsCascadeDelete = async () => {
  try {
    console.log('🔄 Starting migration: Fix bookings CASCADE DELETE constraint...');

    // Drop the existing CASCADE constraint
    await query(`
      ALTER TABLE bookings 
      DROP CONSTRAINT IF EXISTS bookings_provider_service_id_fkey;
    `);
    console.log('✅ Dropped existing CASCADE constraint on bookings.provider_service_id');

    // Add new constraint with SET NULL instead of CASCADE
    // This allows bookings to persist when service is deleted
    // The provider_id and service_charge_value are already stored in bookings table
    await query(`
      ALTER TABLE bookings
      ADD CONSTRAINT bookings_provider_service_id_fkey
      FOREIGN KEY (provider_service_id) 
      REFERENCES provider_services(id) 
      ON DELETE SET NULL;
    `);
    console.log('✅ Added new SET NULL constraint on bookings.provider_service_id');

    console.log('✅ Migration "Fix bookings CASCADE DELETE constraint" completed successfully.');
    return { success: true };
  } catch (error) {
    console.error('❌ Error in migration "Fix bookings CASCADE DELETE constraint":', error);
    return { success: false, error: error.message };
  }
};

module.exports = fixBookingsCascadeDelete;

