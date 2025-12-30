/**
 * Migration: Add provider details to bookings table
 * Purpose: Preserve provider information (name, phone, profile pic) even after service/account deletion
 * 
 * This migration adds denormalized provider information to the bookings table:
 * - provider_name: Provider's full name (preserved even if account deleted)
 * - provider_phone: Provider's phone number (preserved even if account deleted)
 * - provider_profile_pic_url: Provider's profile picture URL (preserved even if account deleted)
 * 
 * This ensures that historical bookings remain fully visible with all provider details
 * even if the provider deletes their service or account.
 */

const { query } = require('../database/connection');

async function addProviderDetailsToBookings() {
  console.log('🔄 Running migration: Add provider details to bookings table...');
  
  try {
    // Add provider_name column
    await query(`
      ALTER TABLE bookings 
      ADD COLUMN IF NOT EXISTS provider_name TEXT;
    `);
    console.log('  ✅ Added provider_name column to bookings table');

    // Add provider_phone column
    await query(`
      ALTER TABLE bookings 
      ADD COLUMN IF NOT EXISTS provider_phone TEXT;
    `);
    console.log('  ✅ Added provider_phone column to bookings table');

    // Add provider_profile_pic_url column
    await query(`
      ALTER TABLE bookings 
      ADD COLUMN IF NOT EXISTS provider_profile_pic_url TEXT;
    `);
    console.log('  ✅ Added provider_profile_pic_url column to bookings table');

    // Backfill existing bookings with provider information
    // Only update bookings where provider details are NULL and provider still exists
    const backfillResult = await query(`
      UPDATE bookings b
      SET 
        provider_name = COALESCE(b.provider_name, u.full_name),
        provider_phone = COALESCE(b.provider_phone, u.phone),
        provider_profile_pic_url = COALESCE(b.provider_profile_pic_url, u.profile_pic_url)
      FROM provider_services ps
      JOIN provider_profiles pp ON ps.provider_id = pp.id
      JOIN users u ON pp.user_id = u.id
      WHERE b.provider_service_id = ps.id
        AND (b.provider_name IS NULL OR b.provider_phone IS NULL OR b.provider_profile_pic_url IS NULL)
        AND u.full_name IS NOT NULL;
    `);
    console.log(`  ✅ Backfilled ${backfillResult.rowCount || 0} existing bookings with provider details.`);

    // Create index on provider_name for faster queries (optional, but helpful for admin queries)
    await query(`
      CREATE INDEX IF NOT EXISTS idx_bookings_provider_name 
      ON bookings(provider_name)
      WHERE provider_name IS NOT NULL;
    `);
    console.log('  ✅ Added index on bookings.provider_name');

    console.log('✅ Migration completed: Add provider details to bookings table');
    return { success: true };
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

module.exports = addProviderDetailsToBookings;

