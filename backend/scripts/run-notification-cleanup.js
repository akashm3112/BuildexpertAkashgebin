/**
 * Manual script to run notification cleanup
 * Usage: node scripts/run-notification-cleanup.js
 * 
 * This script can be used for:
 * - Testing the cleanup service
 * - Manually triggering cleanup outside of scheduled time
 * - Debugging cleanup issues
 */

require('dotenv').config({ path: './config.env' });
const { notificationCleanupService } = require('../services/notificationCleanupService');

async function runCleanup() {
  try {
    console.log('🧹 Starting manual notification cleanup...');
    const result = await notificationCleanupService.runCleanup();
    
    if (result.success) {
      console.log('✅ Cleanup completed successfully:', {
        deleted: result.deleted,
        expected: result.expected,
        remaining: result.remaining,
        duration: `${result.duration}ms`
      });
      process.exit(0);
    } else {
      console.error('❌ Cleanup failed:', result.error);
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error running cleanup:', error);
    process.exit(1);
  }
}

// Run cleanup
runCleanup();

