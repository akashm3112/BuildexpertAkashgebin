const { query, getRows, getRow } = require('../database/connection');
const { sendNotification } = require('../utils/notifications');
const logger = require('../utils/logger');

class LabourAccessManager {
  /**
   * Check and update expired labour access
   */
  static async checkExpiredAccess() {
    try {
      logger.info('Checking expired labour access...');
      
      // Get users with expired labour access
      const expiredUsers = await getRows(`
        SELECT id, full_name, phone, labour_access_end_date
        FROM users 
        WHERE labour_access_status = 'active' 
          AND labour_access_end_date IS NOT NULL 
          AND labour_access_end_date < NOW()
      `);

      if (expiredUsers.length > 0) {
        logger.info(`Found ${expiredUsers.length} users with expired labour access`);
        
        // Update expired users
        await query(`
          UPDATE users 
          SET labour_access_status = 'expired', updated_at = NOW()
          WHERE labour_access_status = 'active' 
            AND labour_access_end_date IS NOT NULL 
            AND labour_access_end_date < NOW()
        `);

        // Send expiry notifications
        for (const user of expiredUsers) {
          await sendNotification(
            user.id,
            'Labour Service Access Expired',
            `Your labour service access has expired. Pay ₹99 to reactivate for 7 more days.`,
            'user'
          );
        }

        logger.info(`Updated ${expiredUsers.length} users with expired labour access`);
      }

      return expiredUsers.length;
    } catch (error) {
      logger.error('Error checking expired labour access:', error);
      throw error;
    }
  }

  /**
   * Check and send expiry reminder notifications
   */
  static async checkExpiryReminders() {
    try {
      logger.info('Checking labour access expiry reminders...');
      
      // Get users whose access expires in 1 day
      const reminderUsers = await getRows(`
        SELECT id, full_name, phone, labour_access_end_date
        FROM users 
        WHERE labour_access_status = 'active' 
          AND labour_access_end_date IS NOT NULL 
          AND labour_access_end_date BETWEEN NOW() AND NOW() + INTERVAL '1 day'
      `);

      if (reminderUsers.length > 0) {
        logger.info(`Found ${reminderUsers.length} users needing expiry reminders`);
        
        // Send reminder notifications
        for (const user of reminderUsers) {
          const endDate = new Date(user.labour_access_end_date);
          const hoursRemaining = Math.ceil((endDate.getTime() - Date.now()) / (1000 * 60 * 60));
          
          await sendNotification(
            user.id,
            'Labour Service Access Expiring Soon',
            `Your labour service access expires in ${hoursRemaining} hours. Pay ₹99 to extend for 7 more days.`,
            'user'
          );
        }

        logger.info(`Sent expiry reminders to ${reminderUsers.length} users`);
      }

      return reminderUsers.length;
    } catch (error) {
      logger.error('Error checking expiry reminders:', error);
      throw error;
    }
  }

  /**
   * Check and send early warning notifications (2 days before expiry)
   */
  static async checkEarlyWarnings() {
    try {
      logger.info('Checking labour access early warnings...');
      
      // Get users whose access expires in 2 days
      const warningUsers = await getRows(`
        SELECT id, full_name, phone, labour_access_end_date
        FROM users 
        WHERE labour_access_status = 'active' 
          AND labour_access_end_date IS NOT NULL 
          AND labour_access_end_date BETWEEN NOW() + INTERVAL '1 day' AND NOW() + INTERVAL '2 days'
      `);

      if (warningUsers.length > 0) {
        logger.info(`Found ${warningUsers.length} users needing early warnings`);
        
        // Send early warning notifications
        for (const user of warningUsers) {
          await sendNotification(
            user.id,
            'Labour Service Access Expiring in 2 Days',
            `Your labour service access expires in 2 days. Consider renewing to avoid interruption.`,
            'user'
          );
        }

        logger.info(`Sent early warnings to ${warningUsers.length} users`);
      }

      return warningUsers.length;
    } catch (error) {
      logger.error('Error checking early warnings:', error);
      throw error;
    }
  }

  /**
   * Get labour access statistics
   */
  static async getAccessStatistics() {
    try {
      const stats = await getRow(`
        SELECT 
          COUNT(*) as total_users,
          COUNT(CASE WHEN labour_access_status = 'active' THEN 1 END) as active_users,
          COUNT(CASE WHEN labour_access_status = 'expired' THEN 1 END) as expired_users,
          COUNT(CASE WHEN labour_access_status = 'inactive' THEN 1 END) as inactive_users,
          COUNT(CASE WHEN labour_access_status = 'active' AND labour_access_end_date < NOW() + INTERVAL '1 day' THEN 1 END) as expiring_soon
        FROM users
        WHERE labour_access_status IS NOT NULL
      `);

      return stats;
    } catch (error) {
      logger.error('Error getting labour access statistics:', error);
      throw error;
    }
  }

  /**
   * Get users with expiring access
   */
  static async getExpiringUsers(days = 1) {
    try {
      const users = await getRows(`
        SELECT 
          id, full_name, phone, email, labour_access_end_date,
          EXTRACT(EPOCH FROM (labour_access_end_date - NOW())) / 3600 as hours_remaining
        FROM users 
        WHERE labour_access_status = 'active' 
          AND labour_access_end_date IS NOT NULL 
          AND labour_access_end_date BETWEEN NOW() AND NOW() + INTERVAL '${days} day'
        ORDER BY labour_access_end_date ASC
      `);

      return users;
    } catch (error) {
      logger.error('Error getting expiring users:', error);
      throw error;
    }
  }

  /**
   * Run all labour access checks
   */
  static async runAllChecks() {
    try {
      logger.info('Running all labour access checks...');
      
      const results = {
        expired: 0,
        reminders: 0,
        warnings: 0
      };

      // Check for expired access
      results.expired = await this.checkExpiredAccess();
      
      // Check for expiry reminders
      results.reminders = await this.checkExpiryReminders();
      
      // Check for early warnings
      results.warnings = await this.checkEarlyWarnings();

      logger.info('Labour access checks completed:', results);
      return results;
    } catch (error) {
      logger.error('Error running labour access checks:', error);
      throw error;
    }
  }
}

module.exports = LabourAccessManager;
