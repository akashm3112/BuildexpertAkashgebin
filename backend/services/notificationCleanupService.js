const cron = require('node-cron');
const { query, getRow } = require('../database/connection');
const logger = require('../utils/logger');
const { registry } = require('../utils/memoryLeakPrevention');

/**
 * Notification Cleanup Service
 * Automatically deletes notifications older than 90 days
 * Runs weekly on Sundays at 2 AM (off-peak hours)
 * Uses batch deletion with retry mechanism for production reliability
 */
class NotificationCleanupService {
  constructor() {
    this.isRunning = false;
    this.cleanupJob = null;
    this.RETENTION_DAYS = 90; // Hardcoded 90 days retention
    this.BATCH_SIZE = 1000; // Delete in batches of 1000
    this.MAX_RETRIES = 3; // Maximum retry attempts
    this.RETRY_DELAY_MS = 5000; // 5 seconds between retries
  }

  /**
   * Start the cleanup service
   */
  start() {
    if (this.isRunning) {
      logger.warn('⚠️  Notification cleanup service is already running');
      return;
    }

    // Schedule cleanup to run weekly on Sundays at 2 AM (off-peak hours)
    // Cron format: 'minute hour day-of-month month day-of-week'
    // '0 2 * * 0' = Every Sunday at 2:00 AM
    this.cleanupJob = cron.schedule('0 2 * * 0', async () => {
      await this.cleanupOldNotifications();
    }, {
      scheduled: true,
      timezone: 'UTC' // Use UTC for consistency across servers
    });

    // Register with memory leak prevention registry
    registry.registerCleanup(() => this.stop());

    this.isRunning = true;
    logger.info('🕐 Notification cleanup service initialized (runs weekly on Sundays at 2 AM UTC)');
  }

  /**
   * Stop the cleanup service
   */
  stop() {
    if (this.cleanupJob) {
      this.cleanupJob.stop();
      this.cleanupJob = null;
    }
    this.isRunning = false;
    logger.info('🛑 Notification cleanup service stopped');
  }

  /**
   * Get count of notifications to be deleted (for logging)
   */
  async getNotificationCountToDelete() {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.RETENTION_DAYS);

      const result = await getRow(
        `SELECT COUNT(*) as count 
         FROM notifications 
         WHERE created_at < $1`,
        [cutoffDate]
      );

      return parseInt(result?.count || 0);
    } catch (error) {
      logger.error('❌ Error counting notifications to delete:', error);
      throw error;
    }
  }

  /**
   * Delete notifications in batches with retry mechanism
   * @param {Date} cutoffDate - Date before which notifications should be deleted
   * @returns {Promise<number>} Total number of notifications deleted
   */
  async deleteNotificationsInBatches(cutoffDate) {
    let totalDeleted = 0;
    let hasMore = true;
    let batchNumber = 0;

    while (hasMore) {
      let attempt = 0;
      let batchDeleted = 0;
      let batchSuccess = false;

      // Retry logic for each batch
      while (attempt < this.MAX_RETRIES && !batchSuccess) {
        try {
          // Delete a batch of notifications
          // Using CTID (PostgreSQL row identifier) for efficient deletion
          const result = await query(
            `DELETE FROM notifications 
             WHERE ctid IN (
               SELECT ctid 
               FROM notifications 
               WHERE created_at < $1 
               LIMIT $2
             )`,
            [cutoffDate, this.BATCH_SIZE]
          );

          batchDeleted = result.rowCount || 0;
          totalDeleted += batchDeleted;
          hasMore = batchDeleted === this.BATCH_SIZE;
          batchSuccess = true;
          batchNumber++;

          if (batchDeleted > 0) {
            logger.info(`📦 Deleted batch #${batchNumber}: ${batchDeleted} notifications (total: ${totalDeleted})`);
          }

          // Small delay between batches to avoid overwhelming the database
          if (hasMore) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } catch (error) {
          attempt++;
          logger.error(`❌ Error deleting notification batch #${batchNumber} (attempt ${attempt}/${this.MAX_RETRIES}):`, {
            error: error.message,
            totalDeleted,
            hasMore
          });

          if (attempt >= this.MAX_RETRIES) {
            // Log error but continue with next batch instead of failing completely
            logger.error(`❌ Failed to delete batch #${batchNumber} after ${this.MAX_RETRIES} attempts. Continuing with next batch...`);
            batchSuccess = true; // Mark as "handled" to continue
            hasMore = false; // Stop processing to prevent infinite loop
          } else {
            // Wait before retrying with exponential backoff
            const backoffDelay = this.RETRY_DELAY_MS * Math.pow(2, attempt - 1);
            await new Promise(resolve => setTimeout(resolve, backoffDelay));
          }
        }
      }
    }

    return totalDeleted;
  }

  /**
   * Main cleanup function
   * Deletes all notifications older than 90 days
   */
  async cleanupOldNotifications() {
    const startTime = Date.now();
    let totalDeleted = 0;
    let notificationCount = 0;

    try {
      logger.info('🧹 Starting notification cleanup job...');

      // Calculate cutoff date (90 days ago)
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.RETENTION_DAYS);
      cutoffDate.setHours(0, 0, 0, 0); // Set to start of day for consistency

      // Get count of notifications to be deleted (for logging)
      notificationCount = await this.getNotificationCountToDelete();

      if (notificationCount === 0) {
        const duration = Date.now() - startTime;
        logger.info('✅ Notification cleanup completed (no notifications to delete)', {
          duration: `${duration}ms`,
          timestamp: new Date().toISOString()
        });
        return {
          success: true,
          deleted: 0,
          duration: duration
        };
      }

      logger.info(`📊 Found ${notificationCount} notifications older than ${this.RETENTION_DAYS} days to delete`);

      // Delete notifications in batches with retry mechanism
      totalDeleted = await this.deleteNotificationsInBatches(cutoffDate);

      const duration = Date.now() - startTime;

      // Verify deletion (optional - for production monitoring)
      const remainingCount = await this.getNotificationCountToDelete();
      if (remainingCount > 0) {
        logger.warn(`⚠️  Notification cleanup completed but ${remainingCount} notifications still remain`, {
          expected: notificationCount,
          deleted: totalDeleted,
          remaining: remainingCount,
          duration: `${duration}ms`
        });
      }

      logger.info('✅ Notification cleanup completed successfully', {
        expected: notificationCount,
        deleted: totalDeleted,
        remaining: remainingCount,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString()
      });

      return {
        success: true,
        expected: notificationCount,
        deleted: totalDeleted,
        remaining: remainingCount,
        duration: duration
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('❌ Notification cleanup failed', {
        error: error.message,
        stack: error.stack,
        deleted: totalDeleted,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString()
      });

      return {
        success: false,
        error: error.message,
        deleted: totalDeleted,
        duration: duration
      };
    }
  }

  /**
   * Manually trigger cleanup (for testing or manual execution)
   */
  async runCleanup() {
    return await this.cleanupOldNotifications();
  }
}

// Create singleton instance
const notificationCleanupService = new NotificationCleanupService();

module.exports = {
  notificationCleanupService,
  NotificationCleanupService
};

