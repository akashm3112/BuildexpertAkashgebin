const { Expo } = require('expo-server-sdk');
const { query, getRow, getRows } = require('../database/connection');
const cron = require('node-cron');

// Create a new Expo SDK client
const expo = new Expo({
  accessToken: process.env.EXPO_ACCESS_TOKEN, // Optional: for better rate limiting
});

const RETRYABLE_RECEIPT_ERRORS = new Set([
  'MessageRateExceeded',
  'ProviderError',
  'PushServiceError',
  'UnknownError',
  'InternalServerError',
]);

const RETRYABLE_TICKET_ERRORS = new Set([
  'MessageRateExceeded',
  'ProviderError',
  'PushServiceError',
  'RetryAfterSpecified',
  'UnknownError',
]);

class PushNotificationService {
  constructor() {
    this.isProcessing = false;
    this.isProcessingReceipts = false;
    this.backoffMinutes = attempts => Math.min(Math.pow(attempts, 2) * 5, 60); // capped exponential backoff
    this.schemaReady = false;
    this.schemaReadyPromise = null;

    this.setupScheduledTasks();
    // bootstrap any pending work on startup
    this.bootstrapPendingWork().catch(error => {
      console.error('❌ Error bootstrapping push notification queues:', error);
    });
  }

  async bootstrapPendingWork() {
    await this.ensureSchema();
    await this.processMessageQueue();
    await this.processPendingReceipts();
  }

  async ensureSchema(force = false) {
    if (this.schemaReady && !force) {
      return;
    }

    if (!this.schemaReadyPromise || force) {
      this.schemaReadyPromise = (async () => {
        try {
          console.log('🛠️ Ensuring push notification schema is up to date...');

          await query(`
            ALTER TABLE notification_queue
            DROP CONSTRAINT IF EXISTS notification_queue_status_check;
          `);

          await query(`
            ALTER TABLE notification_receipts
            DROP CONSTRAINT IF EXISTS notification_receipts_status_check;
          `);

          await query(`
            ALTER TABLE notification_queue
            ADD COLUMN IF NOT EXISTS push_token TEXT,
            ADD COLUMN IF NOT EXISTS last_error_code TEXT,
            ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMP,
            ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP,
            ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
          `);

          await query(`
            UPDATE notification_queue
            SET metadata = '{}'::jsonb
            WHERE metadata IS NULL;
          `);

          await query(`
            ALTER TABLE notification_queue
            ADD CONSTRAINT notification_queue_status_check
            CHECK (status IN (
              'pending',
              'sending',
              'waiting_receipt',
              'delivered',
              'failed',
              'retry'
            ));
          `);

          await query(`
            ALTER TABLE notification_receipts
            ADD COLUMN IF NOT EXISTS queue_id UUID REFERENCES notification_queue(id) ON DELETE CASCADE,
            ADD COLUMN IF NOT EXISTS details JSONB DEFAULT '{}'::jsonb,
            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
          `);

          await query(`
            UPDATE notification_receipts
            SET details = '{}'::jsonb,
                updated_at = COALESCE(updated_at, NOW())
            WHERE details IS NULL;
          `);

          await query(`
            ALTER TABLE notification_receipts
            ADD CONSTRAINT notification_receipts_status_check
            CHECK (status IN ('pending', 'delivered', 'failed', 'sent'));
          `);

          await query(`
            CREATE INDEX IF NOT EXISTS idx_notification_queue_push_token ON notification_queue(push_token);
            CREATE INDEX IF NOT EXISTS idx_notification_queue_status_next_attempt ON notification_queue(status, next_attempt_at);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_receipts_receipt_id ON notification_receipts(receipt_id);
            CREATE INDEX IF NOT EXISTS idx_notification_receipts_queue_id ON notification_receipts(queue_id);
          `);

          await query(`
            UPDATE notification_queue
            SET status = 'pending',
                updated_at = NOW()
            WHERE status = 'processing';

            UPDATE notification_queue
            SET status = 'delivered',
                delivered_at = COALESCE(delivered_at, updated_at, created_at)
            WHERE status = 'sent';

            UPDATE notification_receipts
            SET status = CASE WHEN status = 'sent' THEN 'pending' ELSE status END,
                updated_at = NOW()
            WHERE status IN ('sent', 'pending');
          `);

          this.schemaReady = true;
          console.log('✅ Push notification schema verified');
        } catch (error) {
          console.error('❌ Failed to ensure push notification schema:', error);
          throw error;
        }
      })();
    }

    return this.schemaReadyPromise;
  }

  async waitForSchema() {
    if (this.schemaReady) return;
    await this.ensureSchema();
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
        await query(
          'UPDATE user_push_tokens SET last_seen = NOW(), is_active = true WHERE id = $1',
          [existingToken.id]
        );
        console.log('✅ Updated existing push token');
      } else {
        await query(
          'UPDATE user_push_tokens SET is_active = false WHERE user_id = $1',
          [userId]
        );

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

  buildMessagePayload(notification) {
    return {
      sound: notification.sound || 'default',
      title: notification.title,
      body: notification.body,
      data: notification.data || {},
      badge: notification.badge,
      priority: notification.priority || 'high',
      ttl: notification.ttl || 3600, // 1 hour default
      expiration: notification.expiration || null,
      channelId: notification.channelId || 'default',
    };
  }

  /**
   * Persist messages and trigger processing
   */
  async enqueueMessages({ tokens, notification, userId = null, meta = {} }) {
    await this.waitForSchema();

    if (!tokens || tokens.length === 0) {
      return { success: false, error: 'No tokens provided' };
    }

    const payload = this.buildMessagePayload(notification);
    const insertedIds = [];

    for (const pushToken of tokens) {
      try {
        const result = await query(`
          INSERT INTO notification_queue (
            user_id,
            push_token,
            notification_data,
            attempts,
            max_attempts,
            next_attempt_at,
            status,
            error_message,
            last_error_code,
            created_at,
            updated_at,
            last_attempt_at,
            delivered_at,
            metadata
          )
          VALUES ($1, $2, $3::jsonb, 0, 5, NOW(), 'pending', NULL, NULL, NOW(), NOW(), NULL, NULL, $4::jsonb)
          RETURNING id
        `, [
          userId,
          pushToken,
          JSON.stringify({ ...payload, meta }),
          JSON.stringify(meta || {}),
        ]);

        if (result && result.rows && result.rows[0]) {
          insertedIds.push(result.rows[0].id);
        }
      } catch (error) {
        console.error('❌ Failed to enqueue notification:', error);
      }
    }

    if (insertedIds.length > 0) {
      await this.processMessageQueue();
    }

    return { success: insertedIds.length > 0, enqueued: insertedIds.length, queueIds: insertedIds };
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

      return await this.sendToTokens(tokens, notification, { userId });
    } catch (error) {
      console.error('❌ Error sending notification to user:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send push notification to multiple tokens
   */
  async sendToTokens(tokens, notification, context = {}) {
    try {
      const result = await this.enqueueMessages({
        tokens,
        notification,
        userId: context.userId ?? null,
        meta: context.meta ?? {},
      });

      return {
        success: result.success,
        messageCount: result.enqueued || 0,
        queueIds: result.queueIds || [],
      };
    } catch (error) {
      console.error('❌ Error enqueueing notifications:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Process persisted queue with batching and retry logic
   */
  async processMessageQueue() {
    await this.waitForSchema();

    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      while (true) {
        const queueItems = await getRows(`
          SELECT 
            id,
            user_id,
            push_token,
            notification_data,
            attempts,
            max_attempts,
            next_attempt_at,
            status,
            error_message,
            last_error_code,
            metadata
          FROM notification_queue
          WHERE status IN ('pending', 'retry')
            AND next_attempt_at <= NOW()
          ORDER BY created_at ASC
          LIMIT 100
        `);

        if (!queueItems.length) {
          break;
        }

        await this.sendBatch(queueItems);
      }
    } catch (error) {
      console.error('❌ Error processing notification queue:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Send a batch of stored queue messages
   */
  async sendBatch(queueItems) {
    const queueIds = queueItems.map(item => item.id);

    try {
      const updatedAttempts = await query(
        `UPDATE notification_queue
         SET status = 'sending',
             attempts = attempts + 1,
             last_attempt_at = NOW(),
             updated_at = NOW()
         WHERE id = ANY($1::uuid[])
         RETURNING id, attempts, max_attempts`,
        [queueIds]
      );

      const attemptsMap = new Map(
        updatedAttempts.rows.map(row => [row.id, { attempts: row.attempts, maxAttempts: row.max_attempts }])
      );

      const itemsWithAttempts = queueItems.map(item => {
        const attemptInfo = attemptsMap.get(item.id) || { attempts: item.attempts + 1, maxAttempts: item.max_attempts || 3 };
        return {
          ...item,
          attempts: attemptInfo.attempts,
          max_attempts: attemptInfo.maxAttempts,
          payload: typeof item.notification_data === 'object'
            ? item.notification_data
            : JSON.parse(item.notification_data),
        };
      });

      const chunkSize = 100;
      for (let i = 0; i < itemsWithAttempts.length; i += chunkSize) {
        const chunkItems = itemsWithAttempts.slice(i, i + chunkSize);

        const validItems = [];
        for (const entry of chunkItems) {
          if (!entry.push_token) {
            await this.failMessage(entry, 'Missing push token for notification', 'MissingPushToken');
            continue;
          }
          validItems.push(entry);
        }

        if (!validItems.length) {
          continue;
        }

        const messages = validItems.map(entry => ({
          to: entry.push_token,
          sound: entry.payload.sound,
          title: entry.payload.title,
          body: entry.payload.body,
          data: entry.payload.data || {},
          badge: entry.payload.badge,
          priority: entry.payload.priority || 'high',
          ttl: entry.payload.ttl || 3600,
          expiration: entry.payload.expiration || null,
          channelId: entry.payload.channelId || 'default',
        }));

        try {
          const ticketChunk = await expo.sendPushNotificationsAsync(messages);
          await this.handleTicketChunk(validItems, ticketChunk);
        } catch (error) {
          console.error('❌ Error sending notification chunk:', error);
          await this.markChunkForRetry(validItems, error);
        }

        if (i + chunkSize < itemsWithAttempts.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    } catch (error) {
      console.error('❌ Error in sendBatch:', error);
      await this.markChunkForRetry(queueItems, error);
    }
  }

  async handleTicketChunk(chunkItems, tickets) {
    for (let index = 0; index < chunkItems.length; index++) {
      const queueItem = chunkItems[index];
      const ticket = tickets[index];

      if (!ticket) {
        await this.markMessageForRetry(queueItem, 'Missing ticket response', 'MissingTicket');
        continue;
      }

      if (ticket.status === 'ok') {
        if (ticket.id) {
          await this.storePendingReceipt(queueItem, ticket);
        } else {
          await this.markMessageDelivered(queueItem.id);
        }
        continue;
      }

      const errorCode = ticket.details?.error || ticket.message || 'UnknownError';
      const isRetryable = RETRYABLE_TICKET_ERRORS.has(errorCode);

      if (errorCode === 'DeviceNotRegistered') {
        await this.deactivateToken(queueItem.push_token);
      }

      if (isRetryable && queueItem.attempts < (queueItem.max_attempts || 3)) {
        await this.markMessageForRetry(queueItem, ticket.message || errorCode, errorCode, { retry: true });
      } else {
        await this.failMessage(queueItem, ticket.message || errorCode, errorCode);
      }
    }
  }

  async storePendingReceipt(queueItem, ticket) {
    try {
      await query(`
        INSERT INTO notification_receipts (queue_id, push_token, receipt_id, status, error_code, error_message, details, created_at, updated_at)
        VALUES ($1, $2, $3, 'pending', NULL, NULL, $4::jsonb, NOW(), NOW())
        ON CONFLICT (receipt_id) DO UPDATE SET
          queue_id = EXCLUDED.queue_id,
          push_token = EXCLUDED.push_token,
          status = 'pending',
          error_code = NULL,
          error_message = NULL,
          details = EXCLUDED.details,
          updated_at = NOW()
      `, [
        queueItem.id,
        queueItem.push_token,
        ticket.id,
        JSON.stringify(ticket),
      ]);

      await query(
        `UPDATE notification_queue
         SET status = 'waiting_receipt',
             updated_at = NOW()
         WHERE id = $1`,
        [queueItem.id]
      );
    } catch (error) {
      console.error('❌ Error storing pending receipt:', error);
      await this.markMessageForRetry(queueItem, error.message, 'ReceiptPersistError');
    }
  }

  async markChunkForRetry(chunkItems, error) {
    for (const item of chunkItems) {
      await this.markMessageForRetry(item, error.message || 'Chunk send failure', error.code || 'ChunkError');
    }
  }

  async markMessageForRetry(queueItem, errorMessage, errorCode, options = {}) {
    const attempts = queueItem.attempts || 0;
    const maxAttempts = queueItem.max_attempts || 3;

    if (attempts >= maxAttempts || options.forceFail) {
      await this.failMessage(queueItem, errorMessage, errorCode);
      return;
    }

    const delayMinutes = this.backoffMinutes(attempts + 1);
    const nextAttempt = new Date(Date.now() + delayMinutes * 60 * 1000);

    await query(
      `UPDATE notification_queue
       SET status = 'retry',
           next_attempt_at = $2,
           error_message = $3,
           last_error_code = $4,
           updated_at = NOW()
       WHERE id = $1`,
      [queueItem.id, nextAttempt, errorMessage, errorCode]
    );
  }

  async failMessage(queueItem, errorMessage, errorCode) {
    await query(
      `UPDATE notification_queue
       SET status = 'failed',
           error_message = $2,
           last_error_code = $3,
           updated_at = NOW()
       WHERE id = $1`,
      [queueItem.id, errorMessage, errorCode]
    );

    await query(
      `UPDATE notification_receipts
       SET status = 'failed',
           error_code = $3,
           error_message = $2,
           updated_at = NOW()
       WHERE queue_id = $1`,
      [queueItem.id, errorMessage, errorCode]
    );
  }

  async markMessageDelivered(queueId) {
    await query(
      `UPDATE notification_queue
       SET status = 'delivered',
           delivered_at = NOW(),
           updated_at = NOW(),
           error_message = NULL,
           last_error_code = NULL
       WHERE id = $1`,
      [queueId]
    );

    await query(
      `UPDATE notification_receipts
       SET status = 'delivered',
           updated_at = NOW(),
           error_code = NULL,
           error_message = NULL
       WHERE queue_id = $1`,
      [queueId]
    );
  }

  /**
   * Process pending receipts from database (persists across restarts)
   */
  async processPendingReceipts() {
    await this.waitForSchema();

    if (this.isProcessingReceipts) {
      return;
    }

    this.isProcessingReceipts = true;

    try {
      const pendingReceipts = await getRows(`
        SELECT id, queue_id, receipt_id, push_token
        FROM notification_receipts
        WHERE status = 'pending'
          AND receipt_id IS NOT NULL
        ORDER BY created_at ASC
        LIMIT 300
      `);

      if (!pendingReceipts.length) {
        return;
      }

      const receiptIdChunks = expo.chunkPushNotificationReceiptIds(
        pendingReceipts.map(r => r.receipt_id)
      );

      for (const chunk of receiptIdChunks) {
        try {
          const receipts = await expo.getPushNotificationReceiptsAsync(chunk);
          await this.handleReceiptResults(receipts, pendingReceipts);
        } catch (error) {
          console.error('❌ Error fetching receipt chunk:', error);
        }
      }
    } catch (error) {
      console.error('❌ Error processing pending receipts:', error);
    } finally {
      this.isProcessingReceipts = false;
    }
  }

  async handleReceiptResults(receipts, pendingReceipts) {
    for (const receiptId in receipts) {
      const receipt = receipts[receiptId];
      const ticketRecord = pendingReceipts.find(r => r.receipt_id === receiptId);

      if (!ticketRecord) {
        continue;
      }

      if (receipt.status === 'ok') {
        await this.markMessageDelivered(ticketRecord.queue_id);
        continue;
      }

      const errorCode = receipt.details?.error || receipt.message || 'UnknownError';

      if (errorCode === 'DeviceNotRegistered') {
        await this.deactivateToken(ticketRecord.push_token);
        await this.failReceipt(ticketRecord, receipt, errorCode);
        continue;
      }

      if (RETRYABLE_RECEIPT_ERRORS.has(errorCode)) {
        await this.requeueFromReceipt(ticketRecord, receipt, errorCode);
      } else {
        await this.failReceipt(ticketRecord, receipt, errorCode);
      }
    }
  }

  async requeueFromReceipt(ticketRecord, receipt, errorCode) {
    const queueItem = await getRow(
      `SELECT id, attempts, max_attempts
       FROM notification_queue
       WHERE id = $1`,
      [ticketRecord.queue_id]
    );

    if (!queueItem) {
      return;
    }

    await query(
      `UPDATE notification_queue
       SET status = 'retry',
           next_attempt_at = NOW() + INTERVAL '10 minutes',
           error_message = $2,
           last_error_code = $3,
           updated_at = NOW()
       WHERE id = $1`,
      [queueItem.id, receipt.message || errorCode, errorCode]
    );

    await query(
      `UPDATE notification_receipts
       SET status = 'failed',
           error_code = $3,
           error_message = $2,
           details = $4::jsonb,
           updated_at = NOW()
       WHERE receipt_id = $1`,
      [ticketRecord.receipt_id, receipt.message || errorCode, errorCode, JSON.stringify(receipt)]
    );
  }

  async failReceipt(ticketRecord, receipt, errorCode) {
    await query(
      `UPDATE notification_queue
       SET status = 'failed',
           error_message = $2,
           last_error_code = $3,
           updated_at = NOW()
       WHERE id = $1`,
      [ticketRecord.queue_id, receipt.message || errorCode, errorCode]
    );

    await query(
      `UPDATE notification_receipts
       SET status = 'failed',
           error_code = $3,
           error_message = $2,
           details = $4::jsonb,
           updated_at = NOW()
       WHERE receipt_id = $1`,
      [ticketRecord.receipt_id, receipt.message || errorCode, errorCode, JSON.stringify(receipt)]
    );
  }

  /**
   * Deactivate invalid push tokens
   */
  async deactivateToken(pushToken) {
    if (!pushToken) return;

    try {
      await query(
        'UPDATE user_push_tokens SET is_active = false, last_seen = NOW() WHERE push_token = $1',
        [pushToken]
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
    await this.waitForSchema();

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
   * Setup scheduled tasks (reminders, cleanup, retry processing)
   */
  setupScheduledTasks() {
    cron.schedule('* * * * *', async () => {
      await this.processScheduledNotifications();
      await this.processMessageQueue();
    });

    cron.schedule('*/10 * * * *', async () => {
      await this.processPendingReceipts();
    });

    cron.schedule('0 2 * * *', async () => {
      await this.cleanup();
    });

    console.log('⏰ Scheduled tasks initialized for push notifications');
  }

  /**
   * Process scheduled notifications
   */
  async processScheduledNotifications() {
    await this.waitForSchema();

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
   * Cleanup stale data
   */
  async cleanup() {
    try {
      console.log('🧹 Starting notification cleanup...');

      await query(
        'DELETE FROM user_push_tokens WHERE is_active = false AND last_seen < NOW() - INTERVAL \'30 days\''
      );

      await query(
        'DELETE FROM scheduled_notifications WHERE sent = true AND sent_at < NOW() - INTERVAL \'7 days\''
      );

      await query(`
        UPDATE notification_queue
        SET status = 'retry',
            next_attempt_at = NOW() + INTERVAL '10 minutes',
            error_message = 'Stale sending record auto-requeued',
            last_error_code = 'StaleSending',
            updated_at = NOW()
        WHERE status = 'sending' AND updated_at < NOW() - INTERVAL '30 minutes'
      `);

      await query(
        'DELETE FROM notification_receipts WHERE status IN (\'delivered\', \'failed\') AND updated_at < NOW() - INTERVAL \'30 days\''
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
