const { query } = require('../database/connection');

/**
 * Migration 024: Add index on notifications.created_at
 * Purpose: Optimize notification cleanup queries for efficient date-based filtering
 * - Enables fast queries for notifications older than X days
 * - Critical for notification cleanup service performance
 */
const addNotificationCreatedAtIndex = async () => {
  try {
    console.log('🔄 Starting migration: Add index on notifications.created_at...');

    // Add index on created_at for efficient date-based queries
    await query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_created_at 
      ON notifications(created_at);
    `);
    console.log('✅ Added index on notifications(created_at).');

    // Add composite index for user_id and created_at (for user-specific cleanup queries)
    await query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_user_created_at 
      ON notifications(user_id, created_at);
    `);
    console.log('✅ Added composite index on notifications(user_id, created_at).');

    console.log('✅ Migration "Add index on notifications.created_at" completed successfully.');
    return { success: true };
  } catch (error) {
    console.error('❌ Error in migration "Add index on notifications.created_at":', error);
    return { success: false, error: error.message };
  }
};

module.exports = addNotificationCreatedAtIndex;

// Run directly if executed as main module
if (require.main === module) {
  addNotificationCreatedAtIndex()
    .then(() => {
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    });
}

