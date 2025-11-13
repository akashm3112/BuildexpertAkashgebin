const LabourAccessManager = require('../services/labourAccessManager');
const logger = require('../utils/logger');

/**
 * Labour Access Cron Job
 * Runs every hour to check for expired access and send notifications
 */
const runLabourAccessCron = async () => {
  try {
    logger.info('🕐 Starting labour access cron job...');
    
    const results = await LabourAccessManager.runAllChecks();
    
    logger.info('✅ Labour access cron job completed:', {
      expired: results.expired,
      reminders: results.reminders,
      warnings: results.warnings,
      timestamp: new Date().toISOString()
    });
    
    return results;
  } catch (error) {
    logger.error('❌ Labour access cron job failed:', error);
    throw error;
  }
};

// Run if called directly
if (require.main === module) {
  runLabourAccessCron()
    .then((results) => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('Labour access cron job failed:', error);
      process.exit(1);
    });
}

module.exports = runLabourAccessCron;
