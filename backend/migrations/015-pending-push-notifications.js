const { query } = require('../database/connection');

const createPendingPushNotificationsTable = async () => {
  try {
    console.log('🔔 Creating pending push notifications table...');

    await query(`
      CREATE TABLE IF NOT EXISTS pending_push_notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        notification_payload JSONB NOT NULL,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_pending_push_notifications_user_id
        ON pending_push_notifications (user_id, created_at);
    `);

    console.log('✅ Pending push notifications table ready');
  } catch (error) {
    console.error('❌ Error creating pending push notifications table:', error);
    throw error;
  }
};

module.exports = createPendingPushNotificationsTable;

if (require.main === module) {
  createPendingPushNotificationsTable()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

