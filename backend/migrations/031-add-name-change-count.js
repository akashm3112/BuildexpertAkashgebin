/**
 * Migration: Add name_change_count column to users table
 * Purpose: Track number of name changes per user (limit: 2)
 */

const { query } = require('../database/connection');

async function up() {
  console.log('🔄 Running migration: Add name_change_count to users table...');
  
  try {
    // Check if column already exists
    const columnExists = await query(`
      SELECT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'users' 
        AND column_name = 'name_change_count'
      );
    `);

    if (!columnExists.rows[0].exists) {
      // Add name_change_count column with default 0
      await query(`
        ALTER TABLE users 
        ADD COLUMN name_change_count INTEGER DEFAULT 0 NOT NULL;
      `);
      console.log('  ✅ Added name_change_count column to users table');
    } else {
      console.log('  ⏭️  name_change_count column already exists, skipping');
    }

    // Add index for performance (if needed for queries)
    await query(`
      CREATE INDEX IF NOT EXISTS idx_users_name_change_count 
      ON users(name_change_count);
    `);
    console.log('  ✅ Added index on users.name_change_count');

    console.log('✅ Migration completed: Add name_change_count to users table');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

async function down() {
  console.log('🔄 Rolling back migration: Remove name_change_count from users table...');
  
  try {
    // Remove index first
    await query(`
      DROP INDEX IF EXISTS idx_users_name_change_count;
    `);
    console.log('  ✅ Removed index on users.name_change_count');

    // Remove column
    await query(`
      ALTER TABLE users 
      DROP COLUMN IF EXISTS name_change_count;
    `);
    console.log('  ✅ Removed name_change_count column from users table');

    console.log('✅ Rollback completed: Remove name_change_count from users table');
  } catch (error) {
    console.error('❌ Rollback failed:', error);
    throw error;
  }
}

module.exports = { up, down };

