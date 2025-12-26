const { query, getRows, getRow } = require('../database/connection');
const { pushNotificationService, NotificationTemplates } = require('../utils/pushNotifications');
const cron = require('node-cron');
const logger = require('../utils/logger');

/**
 * Booking reminder service
 * Sends reminders for upcoming appointments
 */
class BookingReminderService {
  constructor() {
    this.setupReminderTasks();
  }

  /**
   * Setup scheduled reminder tasks
   */
  setupReminderTasks() {
    // Check for reminders every hour
    cron.schedule('0 * * * *', async () => {
      await this.sendDailyReminders();
      await this.sendHourlyReminders();
    });

    // Send morning reminders at 9 AM
    cron.schedule('0 9 * * *', async () => {
      await this.sendMorningReminders();
    });

  }

  /**
   * Send reminders for bookings happening tomorrow
   */
  async sendDailyReminders() {
    try {
      
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowDate = tomorrow.toISOString().split('T')[0];

      const upcomingBookings = await getRows(`
        SELECT 
          b.id,
          b.user_id,
          b.appointment_date,
          b.appointment_time,
          sm.name as service_name,
          u.full_name as provider_name
        FROM bookings b
        JOIN provider_services ps ON b.provider_service_id = ps.id
        JOIN services_master sm ON ps.service_id = sm.id
        JOIN provider_profiles pp ON ps.provider_id = pp.id
        JOIN users u ON pp.user_id = u.id
        WHERE b.appointment_date = $1 
        AND b.status IN ('pending', 'accepted')
        AND NOT EXISTS (
          SELECT 1 FROM notification_logs nl 
          WHERE nl.user_id = b.user_id 
          AND nl.notification_type = 'daily_reminder'
          AND nl.created_at::date = CURRENT_DATE
          AND (nl.data->>'bookingId')::text = b.id::text
        )
      `, [tomorrowDate]);


      for (const booking of upcomingBookings) {
        const notification = {
          ...NotificationTemplates.BOOKING_REMINDER,
          body: `Reminder: You have a ${booking.service_name} appointment tomorrow at ${booking.appointment_time}`,
          data: {
            type: 'daily_reminder',
            bookingId: booking.id,
            screen: 'bookings'
          }
        };

        await pushNotificationService.sendToUser(booking.user_id, notification);
        
        // Log the reminder
        await this.logNotification(booking.user_id, 'daily_reminder', notification, booking.id);
        
      }

    } catch (error) {
      logger.error('Error sending daily reminders', {
        error: error.message,
        stack: error.stack
      });
    }
  }

  /**
   * Send reminders for bookings happening in 2 hours
   */
  async sendHourlyReminders() {
    try {
      
      const now = new Date();
      const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      
      const todayDate = now.toISOString().split('T')[0];
      const targetHour = twoHoursLater.getHours();

      const upcomingBookings = await getRows(`
        SELECT 
          b.id,
          b.user_id,
          b.appointment_date,
          b.appointment_time,
          sm.name as service_name,
          u.full_name as provider_name
        FROM bookings b
        JOIN provider_services ps ON b.provider_service_id = ps.id
        JOIN services_master sm ON ps.service_id = sm.id
        JOIN provider_profiles pp ON ps.provider_id = pp.id
        JOIN users u ON pp.user_id = u.id
        WHERE b.appointment_date = $1 
        AND b.status IN ('pending', 'accepted')
        AND EXTRACT(HOUR FROM b.appointment_time::time) = $2
        AND NOT EXISTS (
          SELECT 1 FROM notification_logs nl 
          WHERE nl.user_id = b.user_id 
          AND nl.notification_type = 'hourly_reminder'
          AND nl.created_at >= CURRENT_DATE
          AND (nl.data->>'bookingId')::text = b.id::text
        )
      `, [todayDate, targetHour]);


      for (const booking of upcomingBookings) {
        const notification = {
          title: '⏰ Appointment Starting Soon',
          body: `Your ${booking.service_name} appointment starts in 2 hours at ${booking.appointment_time}`,
          sound: 'default',
          priority: 'high',
          data: {
            type: 'hourly_reminder',
            bookingId: booking.id,
            screen: 'bookings'
          }
        };

        await pushNotificationService.sendToUser(booking.user_id, notification);
        
        // Log the reminder
        await this.logNotification(booking.user_id, 'hourly_reminder', notification, booking.id);
        
      }

    } catch (error) {
      logger.error('Error sending hourly reminders', {
        error: error.message,
        stack: error.stack
      });
    }
  }

  /**
   * Send morning summary of today's appointments
   */
  async sendMorningReminders() {
    try {
      
      const today = new Date().toISOString().split('T')[0];

      const todayBookings = await getRows(`
        SELECT 
          b.user_id,
          COUNT(*) as booking_count,
          STRING_AGG(sm.name || ' at ' || b.appointment_time, ', ') as appointments
        FROM bookings b
        JOIN provider_services ps ON b.provider_service_id = ps.id
        JOIN services_master sm ON ps.service_id = sm.id
        WHERE b.appointment_date = $1 
        AND b.status IN ('pending', 'accepted')
        GROUP BY b.user_id
        HAVING COUNT(*) > 0
      `, [today]);

      for (const userBookings of todayBookings) {
        const notification = {
          title: '🌅 Today\'s Appointments',
          body: userBookings.booking_count === 1 
            ? `You have 1 appointment today: ${userBookings.appointments}`
            : `You have ${userBookings.booking_count} appointments today`,
          sound: 'default',
          priority: 'normal',
          data: {
            type: 'morning_summary',
            screen: 'bookings'
          }
        };

        await pushNotificationService.sendToUser(userBookings.user_id, notification);
      }

    } catch (error) {
      logger.error('Error sending morning reminders', {
        error: error.message,
        stack: error.stack
      });
    }
  }

  /**
   * Log notification for tracking
   */
  async logNotification(userId, type, notification, bookingId = null) {
    try {
      const data = { ...notification.data };
      if (bookingId) {
        data.bookingId = bookingId;
      }

      await query(`
        INSERT INTO notification_logs (user_id, notification_type, title, body, data)
        VALUES ($1, $2, $3, $4, $5)
      `, [userId, type, notification.title, notification.body, JSON.stringify(data)]);
    } catch (error) {
      logger.error('Error logging notification', {
        userId,
        notificationType: type,
        error: error.message,
        stack: error.stack
      });
    }
  }

  /**
   * Schedule custom reminder for a booking
   */
  async scheduleCustomReminder(bookingId, reminderTime, customMessage = null) {
    try {
      const booking = await getRow(`
        SELECT 
          b.*,
          sm.name as service_name,
          u.full_name as provider_name
        FROM bookings b
        JOIN provider_services ps ON b.provider_service_id = ps.id
        JOIN services_master sm ON ps.service_id = sm.id
        JOIN provider_profiles pp ON ps.provider_id = pp.id
        JOIN users u ON pp.user_id = u.id
        WHERE b.id = $1
      `, [bookingId]);

      if (!booking) {
        return { success: false, error: 'Booking not found' };
      }

      const notification = {
        title: '⏰ Custom Reminder',
        body: customMessage || `Reminder: You have a ${booking.service_name} appointment`,
        sound: 'default',
        priority: 'normal',
        data: {
          type: 'custom_reminder',
          bookingId: booking.id,
          screen: 'bookings'
        }
      };

      await pushNotificationService.scheduleNotification(booking.user_id, notification, reminderTime);
      
      return { success: true };
    } catch (error) {
      logger.error('Error scheduling custom reminder', {
        bookingId,
        error: error.message,
        stack: error.stack
      });
      return { success: false, error: error.message };
    }
  }
}

// Create singleton instance
const bookingReminderService = new BookingReminderService();

module.exports = { bookingReminderService, BookingReminderService };
