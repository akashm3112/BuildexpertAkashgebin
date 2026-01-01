/**
 * Migration: Add rater_type to ratings table
 * Purpose: Allow both user and provider to rate the same booking separately
 * 
 * This migration:
 * - Adds rater_type column to distinguish between user and provider ratings
 * - Removes UNIQUE constraint on booking_id
 * - Adds composite UNIQUE constraint on (booking_id, rater_type) to prevent duplicate ratings of same type
 * - Backfills existing ratings as 'user' type (assuming existing ratings are from users)
 * 
 * This fixes the critical bug where provider's rating was blocking user's rating.
 */

const { query } = require('../database/connection');

async function addRaterTypeToRatings() {
  console.log('🔄 Running migration: Add rater_type to ratings table...');
  
  try {
    // Step 1: Remove the UNIQUE constraint on booking_id
    // First, find the constraint name
    const constraintResult = await query(`
      SELECT constraint_name
      FROM information_schema.table_constraints
      WHERE table_name = 'ratings'
        AND constraint_type = 'UNIQUE'
        AND constraint_name LIKE '%booking_id%'
    `);
    
    if (constraintResult.rows.length > 0) {
      const constraintName = constraintResult.rows[0].constraint_name;
      await query(`
        ALTER TABLE ratings 
        DROP CONSTRAINT IF EXISTS ${constraintName}
      `);
      console.log(`  ✅ Dropped UNIQUE constraint: ${constraintName}`);
    } else {
      console.log('  ℹ️  No UNIQUE constraint on booking_id found (may have been removed already)');
    }

    // Step 2: Add rater_type column
    await query(`
      ALTER TABLE ratings 
      ADD COLUMN IF NOT EXISTS rater_type TEXT CHECK (rater_type IN ('user', 'provider'))
    `);
    console.log('  ✅ Added rater_type column to ratings table');

    // Step 3: Backfill existing ratings as 'user' type
    // This assumes all existing ratings are from users (historical data)
    const backfillResult = await query(`
      UPDATE ratings 
      SET rater_type = 'user'
      WHERE rater_type IS NULL
    `);
    console.log(`  ✅ Backfilled ${backfillResult.rowCount || 0} existing ratings as 'user' type`);

    // Step 4: Set NOT NULL after backfilling
    await query(`
      ALTER TABLE ratings 
      ALTER COLUMN rater_type SET NOT NULL
    `);
    console.log('  ✅ Set rater_type to NOT NULL');

    // Step 5: Add composite UNIQUE constraint on (booking_id, rater_type)
    // This allows one user rating AND one provider rating per booking
    await query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_ratings_booking_rater_unique 
      ON ratings(booking_id, rater_type)
    `);
    console.log('  ✅ Added composite UNIQUE constraint on (booking_id, rater_type)');

    // Step 6: Add index on rater_type for faster queries
    await query(`
      CREATE INDEX IF NOT EXISTS idx_ratings_rater_type 
      ON ratings(rater_type)
    `);
    console.log('  ✅ Added index on rater_type');

    console.log('✅ Migration completed: Add rater_type to ratings table');
    return { success: true };
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

module.exports = addRaterTypeToRatings;

