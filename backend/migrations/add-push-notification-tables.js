const { query } = require('../database/connection');

/**
 * Add push notification related tables
 */
const addPushNotificationTables = async () => {
  try {
    console.log('📱 Creating push notification tables...');

    // 1. Create user_push_tokens table
    await query(`
      CREATE TABLE IF NOT EXISTS user_push_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        push_token TEXT NOT NULL,
        device_info JSONB DEFAULT '{}',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        last_seen TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, push_token)
      );
    `);
    console.log('✅ user_push_tokens table created');

    // 2. Create scheduled_notifications table
    await query(`
      CREATE TABLE IF NOT EXISTS scheduled_notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        notification_data JSONB NOT NULL,
        scheduled_time TIMESTAMP NOT NULL,
        sent BOOLEAN DEFAULT false,
        sent_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✅ scheduled_notifications table created');

    // 3. Create notification_logs table for analytics
    await query(`
      CREATE TABLE IF NOT EXISTS notification_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        notification_type TEXT NOT NULL,
        title TEXT,
        body TEXT,
        data JSONB DEFAULT '{}',
        status TEXT CHECK (status IN ('sent', 'failed', 'delivered')) DEFAULT 'sent',
        error_message TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✅ notification_logs table created');

    // 4. Create user_notification_settings table
    await query(`
      CREATE TABLE IF NOT EXISTS user_notification_settings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        settings JSONB NOT NULL DEFAULT '{
          "booking_updates": true,
          "reminders": true,
          "promotional": false,
          "sound_enabled": true,
          "vibration_enabled": true
        }',
        updated_at TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✅ user_notification_settings table created');

    // 5. Create notification_receipts table for delivery tracking
    await query(`
      CREATE TABLE IF NOT EXISTS notification_receipts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        push_token TEXT NOT NULL,
        receipt_id TEXT,
        status TEXT CHECK (status IN ('sent', 'delivered', 'failed')) DEFAULT 'sent',
        error_code TEXT,
        error_message TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✅ notification_receipts table created');

    // 6. Create notification_queue table for failed message retry
    await query(`
      CREATE TABLE IF NOT EXISTS notification_queue (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        notification_data JSONB NOT NULL,
        attempts INTEGER DEFAULT 0,
        max_attempts INTEGER DEFAULT 3,
        next_attempt_at TIMESTAMP DEFAULT NOW(),
        status TEXT CHECK (status IN ('pending', 'processing', 'sent', 'failed')) DEFAULT 'pending',
        error_message TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✅ notification_queue table created');

    // 7. Create indexes for better performance
    await query(`
      CREATE INDEX IF NOT EXISTS idx_user_push_tokens_user_id ON user_push_tokens(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_push_tokens_active ON user_push_tokens(is_active);
      CREATE INDEX IF NOT EXISTS idx_user_push_tokens_token ON user_push_tokens(push_token);
      CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_time ON scheduled_notifications(scheduled_time);
      CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_sent ON scheduled_notifications(sent);
      CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_user_id ON scheduled_notifications(user_id);
      CREATE INDEX IF NOT EXISTS idx_notification_logs_user_id ON notification_logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_notification_logs_type ON notification_logs(notification_type);
      CREATE INDEX IF NOT EXISTS idx_notification_logs_created_at ON notification_logs(created_at);
      CREATE INDEX IF NOT EXISTS idx_notification_settings_user_id ON user_notification_settings(user_id);
      CREATE INDEX IF NOT EXISTS idx_notification_receipts_token ON notification_receipts(push_token);
      CREATE INDEX IF NOT EXISTS idx_notification_receipts_status ON notification_receipts(status);
      CREATE INDEX IF NOT EXISTS idx_notification_queue_status ON notification_queue(status);
      CREATE INDEX IF NOT EXISTS idx_notification_queue_next_attempt ON notification_queue(next_attempt_at);
      CREATE INDEX IF NOT EXISTS idx_notification_queue_user_id ON notification_queue(user_id);
    `);
    console.log('✅ Comprehensive indexes created');

    console.log('🎉 Push notification tables setup completed!');
    return { success: true };
  } catch (error) {
    console.error('❌ Error creating push notification tables:', error);
    return { success: false, error: error.message };
  }
};

module.exports = { addPushNotificationTables };

// Run migration if called directly
if (require.main === module) {
  addPushNotificationTables()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
