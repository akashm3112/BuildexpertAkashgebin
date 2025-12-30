/**
 * Migration: Add customer details to bookings table
 * Purpose: Preserve customer information (name, phone) even after account deletion
 * 
 * This migration adds denormalized customer information to the bookings table:
 * - customer_name: Customer's full name (preserved even if account deleted)
 * - customer_phone: Customer's phone number (preserved even if account deleted)
 * 
 * This ensures that:
 * - Provider bookings remain fully visible with customer details even after customer deletes account
 * - Historical booking data is preserved for providers
 * - No data loss when customer deletes account
 */

const { query } = require('../database/connection');

async function addCustomerDetailsToBookings() {
  console.log('🔄 Running migration: Add customer details to bookings table...');
  
  try {
    // Add customer_name column
    await query(`
      ALTER TABLE bookings 
      ADD COLUMN IF NOT EXISTS customer_name TEXT;
    `);
    console.log('  ✅ Added customer_name column to bookings table');

    // Add customer_phone column
    await query(`
      ALTER TABLE bookings 
      ADD COLUMN IF NOT EXISTS customer_phone TEXT;
    `);
    console.log('  ✅ Added customer_phone column to bookings table');

    // Backfill existing bookings with customer information
    // Only update bookings where customer details are NULL and customer still exists
    const backfillResult = await query(`
      UPDATE bookings b
      SET 
        customer_name = COALESCE(b.customer_name, u.full_name),
        customer_phone = COALESCE(b.customer_phone, u.phone)
      FROM users u
      WHERE b.user_id = u.id
        AND (b.customer_name IS NULL OR b.customer_phone IS NULL)
        AND u.full_name IS NOT NULL;
    `);
    console.log(`  ✅ Backfilled ${backfillResult.rowCount || 0} existing bookings with customer details.`);

    // Create index on customer_name for faster queries (optional, but helpful for admin queries)
    await query(`
      CREATE INDEX IF NOT EXISTS idx_bookings_customer_name 
      ON bookings(customer_name)
      WHERE customer_name IS NOT NULL;
    `);
    console.log('  ✅ Added index on bookings.customer_name');

    console.log('✅ Migration completed: Add customer details to bookings table');
    return { success: true };
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

module.exports = addCustomerDetailsToBookings;

