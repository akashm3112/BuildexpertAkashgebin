/**
 * Migration: Preserve bookings when user deletes account
 * Purpose: Change bookings.user_id foreign key from CASCADE to SET NULL
 * 
 * This migration ensures that:
 * - Bookings remain visible to providers even after customer deletes account
 * - Historical booking data is preserved for earnings, stats, and records
 * - Only user_id is set to NULL (bookings are not deleted)
 * 
 * This is critical for:
 * - Provider earnings calculations
 * - Provider stats (jobs done, ratings)
 * - Historical booking records
 */

const { query } = require('../database/connection');

async function preserveBookingsOnUserDeletion() {
  console.log('🔄 Running migration: Preserve bookings when user deletes account...');
  
  try {
    // Drop the existing CASCADE constraint
    await query(`
      ALTER TABLE bookings 
      DROP CONSTRAINT IF EXISTS bookings_user_id_fkey;
    `);
    console.log('  ✅ Dropped existing CASCADE constraint on bookings.user_id');

    // Add new constraint with SET NULL instead of CASCADE
    // This allows bookings to persist when user deletes account
    // The booking data (appointment, service, etc.) remains intact
    await query(`
      ALTER TABLE bookings
      ADD CONSTRAINT bookings_user_id_fkey
      FOREIGN KEY (user_id) 
      REFERENCES users(id) 
      ON DELETE SET NULL;
    `);
    console.log('  ✅ Added new SET NULL constraint on bookings.user_id');

    console.log('✅ Migration completed: Preserve bookings when user deletes account');
    return { success: true };
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

module.exports = preserveBookingsOnUserDeletion;

