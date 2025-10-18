const { Expo } = require('expo-server-sdk');
const { query, getRow, getRows } = require('../database/connection');
const cron = require('node-cron');

// Create a new Expo SDK client
const expo = new Expo({
  accessToken: process.env.EXPO_ACCESS_TOKEN, // Optional: for better rate limiting
});

/**
 * Production-grade push notification service
 * Handles token management, message queuing, retry logic, and scheduling
 */
class PushNotificationService {
  constructor() {
    this.messageQueue = [];
    this.retryQueue = [];
    this.isProcessing = false;
    this.setupScheduledTasks();
  }

  /**
   * Register/Update push token for a user
   */
  async registerPushToken(userId, pushToken, deviceInfo = {}) {
    try {
      console.log('📱 Registering push token for user:', userId);
      
      // Validate the push token
      if (!Expo.isExpoPushToken(pushToken)) {
        console.error('❌ Invalid Expo push token:', pushToken);
        return { success: false, error: 'Invalid push token' };
      }

      // Check if token already exists
      const existingToken = await getRow(
        'SELECT * FROM user_push_tokens WHERE user_id = $1 AND push_token = $2',
        [userId, pushToken]
      );

      if (existingToken) {
        // Update last seen
        await query(
          'UPDATE user_push_tokens SET last_seen = NOW(), is_active = true WHERE id = $1',
          [existingToken.id]
        );
        console.log('✅ Updated existing push token');
      } else {
        // Deactivate old tokens for this user
        await query(
          'UPDATE user_push_tokens SET is_active = false WHERE user_id = $1',
          [userId]
        );

        // Insert new token
        await query(`
          INSERT INTO user_push_tokens (user_id, push_token, device_info, is_active, created_at, last_seen)
          VALUES ($1, $2, $3, true, NOW(), NOW())
        `, [userId, pushToken, JSON.stringify(deviceInfo)]);
        
        console.log('✅ Registered new push token');
      }

      return { success: true };
    } catch (error) {
      console.error('❌ Error registering push token:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get active push tokens for a user
   */
  async getUserPushTokens(userId) {
    try {
      const tokens = await getRows(
        'SELECT push_token FROM user_push_tokens WHERE user_id = $1 AND is_active = true',
        [userId]
      );
      return tokens.map(t => t.push_token);
    } catch (error) {
      console.error('❌ Error getting user push tokens:', error);
      return [];
    }
  }

  /**
   * Send push notification to specific user
   */
  async sendToUser(userId, notification) {
    try {
      const tokens = await this.getUserPushTokens(userId);
      if (tokens.length === 0) {
        console.log('📱 No active push tokens for user:', userId);
        return { success: false, error: 'No active push tokens' };
      }

      return await this.sendToTokens(tokens, notification);
    } catch (error) {
      console.error('❌ Error sending notification to user:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send push notification to multiple tokens
   */
  async sendToTokens(tokens, notification) {
    try {
      const messages = tokens.map(token => ({
        to: token,
        sound: notification.sound || 'default',
        title: notification.title,
        body: notification.body,
        data: notification.data || {},
        badge: notification.badge,
        priority: notification.priority || 'high',
        ttl: notification.ttl || 3600, // 1 hour default
        expiration: notification.expiration,
        channelId: notification.channelId || 'default',
      }));

      // Add to queue for batch processing
      this.messageQueue.push(...messages);
      
      // Process queue if not already processing
      if (!this.isProcessing) {
        this.processMessageQueue();
      }

      return { success: true, messageCount: messages.length };
    } catch (error) {
      console.error('❌ Error preparing messages:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Process message queue with batching and retry logic
   */
  async processMessageQueue() {
    if (this.isProcessing || this.messageQueue.length === 0) {
      return;
    }

    this.isProcessing = true;
    console.log('📤 Processing push notification queue:', this.messageQueue.length, 'messages');

    try {
      // Process in batches of 100 (Expo recommendation)
      const batchSize = 100;
      while (this.messageQueue.length > 0) {
        const batch = this.messageQueue.splice(0, batchSize);
        await this.sendBatch(batch);
        
        // Small delay between batches to avoid rate limiting
        if (this.messageQueue.length > 0) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    } catch (error) {
      console.error('❌ Error processing message queue:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Send a batch of messages
   */
  async sendBatch(messages) {
    try {
      const chunks = expo.chunkPushNotifications(messages);
      const tickets = [];

      for (const chunk of chunks) {
        try {
          const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
          tickets.push(...ticketChunk);
          console.log('✅ Sent batch of', chunk.length, 'notifications');
        } catch (error) {
          console.error('❌ Error sending batch:', error);
          // Add failed messages to retry queue
          this.retryQueue.push(...chunk.map(msg => ({ message: msg, attempts: 1 })));
        }
      }

      // Handle receipts after a delay
      setTimeout(() => this.handleReceipts(tickets), 15 * 60 * 1000); // 15 minutes

    } catch (error) {
      console.error('❌ Error in sendBatch:', error);
    }
  }

  /**
   * Handle push notification receipts
   */
  async handleReceipts(tickets) {
    try {
      const receiptIds = tickets.map(ticket => ticket.id).filter(id => id);
      if (receiptIds.length === 0) return;

      const receiptIdChunks = expo.chunkPushNotificationReceiptIds(receiptIds);
      
      for (const chunk of receiptIdChunks) {
        try {
          const receipts = await expo.getPushNotificationReceiptsAsync(chunk);
          
          for (const receiptId in receipts) {
            const receipt = receipts[receiptId];
            
            if (receipt.status === 'error') {
              console.error('❌ Push notification error:', receipt.message);
              
              // Handle invalid tokens
              if (receipt.details && receipt.details.error === 'DeviceNotRegistered') {
                await this.deactivateToken(receiptId);
              }
            } else if (receipt.status === 'ok') {
              console.log('✅ Push notification delivered successfully');
            }
          }
        } catch (error) {
          console.error('❌ Error handling receipts:', error);
        }
      }
    } catch (error) {
      console.error('❌ Error in handleReceipts:', error);
    }
  }

  /**
   * Deactivate invalid push tokens
   */
  async deactivateToken(tokenOrReceiptId) {
    try {
      await query(
        'UPDATE user_push_tokens SET is_active = false WHERE push_token = $1',
        [tokenOrReceiptId]
      );
      console.log('🗑️ Deactivated invalid push token');
    } catch (error) {
      console.error('❌ Error deactivating token:', error);
    }
  }

  /**
   * Schedule notification for later delivery
   */
  async scheduleNotification(userId, notification, scheduledTime) {
    try {
      await query(`
        INSERT INTO scheduled_notifications (user_id, notification_data, scheduled_time, created_at)
        VALUES ($1, $2, $3, NOW())
      `, [userId, JSON.stringify(notification), scheduledTime]);
      
      console.log('⏰ Scheduled notification for:', scheduledTime);
      return { success: true };
    } catch (error) {
      console.error('❌ Error scheduling notification:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Setup scheduled tasks (reminders, cleanup, etc.)
   */
  setupScheduledTasks() {
    // Process scheduled notifications every minute
    cron.schedule('* * * * *', async () => {
      await this.processScheduledNotifications();
    });

    // Process retry queue every 5 minutes
    cron.schedule('*/5 * * * *', async () => {
      await this.processRetryQueue();
    });

    // Clean up old tokens and notifications daily at 2 AM
    cron.schedule('0 2 * * *', async () => {
      await this.cleanup();
    });

    console.log('⏰ Scheduled tasks initialized');
  }

  /**
   * Process scheduled notifications
   */
  async processScheduledNotifications() {
    try {
      const scheduledNotifications = await getRows(`
        SELECT * FROM scheduled_notifications 
        WHERE scheduled_time <= NOW() AND sent = false
        ORDER BY scheduled_time ASC
        LIMIT 100
      `);

      for (const scheduled of scheduledNotifications) {
        try {
          const notification = JSON.parse(scheduled.notification_data);
          await this.sendToUser(scheduled.user_id, notification);
          
          // Mark as sent
          await query(
            'UPDATE scheduled_notifications SET sent = true, sent_at = NOW() WHERE id = $1',
            [scheduled.id]
          );
          
          console.log('📤 Sent scheduled notification:', scheduled.id);
        } catch (error) {
          console.error('❌ Error sending scheduled notification:', error);
        }
      }
    } catch (error) {
      console.error('❌ Error processing scheduled notifications:', error);
    }
  }

  /**
   * Process retry queue
   */
  async processRetryQueue() {
    if (this.retryQueue.length === 0) return;

    console.log('🔄 Processing retry queue:', this.retryQueue.length, 'messages');
    
    const retryMessages = this.retryQueue.splice(0, 50); // Process 50 at a time
    
    for (const item of retryMessages) {
      if (item.attempts < 3) {
        try {
          const ticket = await expo.sendPushNotificationsAsync([item.message]);
          console.log('✅ Retry successful for message');
        } catch (error) {
          console.error('❌ Retry failed:', error);
          if (item.attempts < 3) {
            this.retryQueue.push({ ...item, attempts: item.attempts + 1 });
          }
        }
      }
    }
  }

  /**
   * Cleanup old data
   */
  async cleanup() {
    try {
      console.log('🧹 Starting notification cleanup...');
      
      // Remove inactive tokens older than 30 days
      await query(
        'DELETE FROM user_push_tokens WHERE is_active = false AND last_seen < NOW() - INTERVAL \'30 days\''
      );
      
      // Remove old scheduled notifications
      await query(
        'DELETE FROM scheduled_notifications WHERE sent = true AND sent_at < NOW() - INTERVAL \'7 days\''
      );
      
      console.log('✅ Notification cleanup completed');
    } catch (error) {
      console.error('❌ Error in cleanup:', error);
    }
  }
}

// Notification templates for different events
const NotificationTemplates = {
  BOOKING_CONFIRMED: {
    title: '✅ Booking Confirmed',
    body: 'Your booking has been confirmed by the provider.',
    sound: 'default',
    channelId: 'booking-updates',
    priority: 'high',
  },
  
  BOOKING_CANCELLED: {
    title: '❌ Booking Cancelled',
    body: 'Your booking has been cancelled.',
    sound: 'default',
    channelId: 'booking-updates',
    priority: 'high',
  },
  
  SERVICE_COMPLETED: {
    title: '🎉 Service Completed',
    body: 'Your service has been marked as completed. Please rate your experience.',
    sound: 'default',
    channelId: 'booking-updates',
    priority: 'high',
  },
  
  BOOKING_REMINDER: {
    title: '⏰ Booking Reminder',
    body: 'You have an upcoming appointment tomorrow.',
    sound: 'default',
    channelId: 'reminders',
    priority: 'normal',
  },
  
  NEW_BOOKING_REQUEST: {
    title: '📋 New Booking Request',
    body: 'You have received a new booking request.',
    sound: 'default',
    channelId: 'provider-updates',
    priority: 'high',
  },
  
  PAYMENT_RECEIVED: {
    title: '💰 Payment Received',
    body: 'Payment has been received for your service.',
    sound: 'default',
    channelId: 'payments',
    priority: 'normal',
  }
};

// Create singleton instance
const pushNotificationService = new PushNotificationService();

module.exports = {
  pushNotificationService,
  NotificationTemplates,
  PushNotificationService
};
