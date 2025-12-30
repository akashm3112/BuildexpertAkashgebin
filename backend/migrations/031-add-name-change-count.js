/**
 * Migration: Add name_change_count column to users table
 * Purpose: Track number of name changes per user (limit: 2)
 */

const { query } = require('../database/connection');

async function addNameChangeCount() {
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
    return { success: true };
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

module.exports = addNameChangeCount;

