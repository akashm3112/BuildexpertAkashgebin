const cron = require('node-cron');
const { query, getRows } = require('../database/connection');
const { sendNotification } = require('../utils/notifications');
const { pushNotificationService } = require('../utils/pushNotifications');
const { registry } = require('../utils/memoryLeakPrevention');

class ServiceExpiryManager {
  constructor() {
    this.isRunning = false;
  }

  start() {
    if (this.isRunning) {
      return;
    }


    // Run expiry warning check daily at 9 AM
    this.expiryWarningJob = cron.schedule('0 9 * * *', async () => {
      await this.sendExpiryWarnings();
    });

    // Run service deactivation check daily at 10 AM
    this.deactivationJob = cron.schedule('0 10 * * *', async () => {
      await this.deactivateExpiredServices();
    });

    // Run immediately on startup (for testing)
    this.startupTimeout = setTimeout(() => {
      this.sendExpiryWarnings();
      this.deactivateExpiredServices();
    }, 5000); // Wait 5 seconds after startup
    
    // Register with memory leak prevention registry
    registry.registerCleanup(() => this.stop());

    this.isRunning = true;
  }

  /**
   * Send expiry warning notifications 2 days before expiry
   */
  async sendExpiryWarnings() {
    try {

      // Find services expiring in exactly 2 days
      const expiringServices = await getRows(`
        SELECT 
          ps.id as provider_service_id,
          ps.payment_end_date,
          ps.payment_start_date,
          pp.user_id,
          u.full_name,
          u.phone,
          sm.name as service_name
        FROM provider_services ps
        JOIN provider_profiles pp ON ps.provider_id = pp.id
        JOIN users u ON pp.user_id = u.id
        JOIN services_master sm ON ps.service_id = sm.id
        WHERE ps.payment_status = 'active'
        AND ps.payment_end_date IS NOT NULL
        AND ps.payment_end_date::date = (CURRENT_DATE + INTERVAL '2 days')::date
        AND NOT EXISTS (
          SELECT 1 FROM notifications n
          WHERE n.user_id = pp.user_id
          AND n.title LIKE '%Service Expiring Soon%'
          AND n.created_at > (CURRENT_DATE - INTERVAL '3 days')
        )
      `);


      for (const service of expiringServices) {
        const expiryDate = new Date(service.payment_end_date);
        const formattedDate = expiryDate.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });

        // Send in-app notification
        await sendNotification(
          service.user_id,
          '⚠️ Service Expiring Soon',
          `Your ${service.service_name} service will expire on ${formattedDate}. Please renew to continue receiving bookings.`,
          'provider'
        );

        // Send push notification
        try {
          await pushNotificationService.sendToUser(service.user_id, {
            title: '⚠️ Service Expiring Soon',
            body: `Your ${service.service_name} service expires in 2 days. Renew now to avoid service interruption.`,
            data: {
              type: 'service_expiry_warning',
              providerServiceId: service.provider_service_id,
              expiryDate: service.payment_end_date,
              serviceName: service.service_name
            },
            priority: 'high',
            sound: 'default'
          });
        } catch (pushError) {
          console.error('Failed to send push notification:', pushError);
        }

      }


    } catch (error) {
      console.error('❌ Error sending expiry warnings:', error);
    }
  }

  /**
   * Deactivate services that have expired (past 30 days)
   */
  async deactivateExpiredServices() {
    try {

      // Find services that have expired
      const expiredServices = await getRows(`
        SELECT 
          ps.id as provider_service_id,
          ps.payment_end_date,
          pp.user_id,
          u.full_name,
          sm.name as service_name
        FROM provider_services ps
        JOIN provider_profiles pp ON ps.provider_id = pp.id
        JOIN users u ON pp.user_id = u.id
        JOIN services_master sm ON ps.service_id = sm.id
        WHERE ps.payment_status = 'active'
        AND ps.payment_end_date IS NOT NULL
        AND ps.payment_end_date::date < CURRENT_DATE
      `);


      for (const service of expiredServices) {
        // Update service status to expired
        await query(`
          UPDATE provider_services
          SET payment_status = 'expired'
          WHERE id = $1
        `, [service.provider_service_id]);

        // Send notification to provider
        await sendNotification(
          service.user_id,
          '🔴 Service Expired',
          `Your ${service.service_name} service has expired. You will not receive new bookings until you renew your subscription.`,
          'provider'
        );

        // Send push notification
        try {
          await pushNotificationService.sendToUser(service.user_id, {
            title: '🔴 Service Expired',
            body: `Your ${service.service_name} service has expired. Renew now to start receiving bookings again.`,
            data: {
              type: 'service_expired',
              providerServiceId: service.provider_service_id,
              serviceName: service.service_name
            },
            priority: 'high',
            sound: 'default'
          });
        } catch (pushError) {
          console.error('Failed to send push notification:', pushError);
        }

      }


    } catch (error) {
      console.error('❌ Error deactivating expired services:', error);
    }
  }

  /**
   * Stop all cron jobs and timers
   */
  stop() {
    if (this.expiryWarningJob) {
      this.expiryWarningJob.stop();
      this.expiryWarningJob = null;
    }
    if (this.deactivationJob) {
      this.deactivationJob.stop();
      this.deactivationJob = null;
    }
    if (this.startupTimeout) {
      clearTimeout(this.startupTimeout);
      this.startupTimeout = null;
    }
    this.isRunning = false;
  }

  /**
   * Get status of expiry manager
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      expiryWarningJobActive: this.expiryWarningJob ? true : false,
      deactivationJobActive: this.deactivationJob ? true : false
    };
  }
}

// Create singleton instance
const serviceExpiryManager = new ServiceExpiryManager();

module.exports = {
  serviceExpiryManager,
  ServiceExpiryManager
};

