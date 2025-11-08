const { query } = require('../database/connection');

/**
 * Migration 011
 * Enhances push notification infrastructure by persisting retry queues
 * and mapping Expo receipt IDs to push tokens for reliable cleanup.
 */
const updatePushNotificationInfrastructure = async () => {
  try {
    console.log('📬 Updating push notification infrastructure (retry queue & receipts)...');

    // Normalize existing data
    await query(`
      UPDATE notification_queue SET status = 'pending' WHERE status = 'processing';
      UPDATE notification_queue SET status = 'delivered' WHERE status = 'sent';
      UPDATE notification_receipts SET status = 'pending' WHERE status = 'sent';
    `);

    // Drop old constraints so we can extend allowed status values
    await query(`
      ALTER TABLE notification_queue
      DROP CONSTRAINT IF EXISTS notification_queue_status_check;
    `);

    await query(`
      ALTER TABLE notification_receipts
      DROP CONSTRAINT IF EXISTS notification_receipts_status_check;
    `);

    // Add required columns to notification_queue
    await query(`
      ALTER TABLE notification_queue
      ADD COLUMN IF NOT EXISTS push_token TEXT,
      ADD COLUMN IF NOT EXISTS last_error_code TEXT,
      ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
    `);

    // Ensure metadata column is populated for existing rows
    await query(`
      UPDATE notification_queue
      SET metadata = '{}'::jsonb
      WHERE metadata IS NULL;
    `);

    // Re-create status constraint with new states
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

    // Add/extend columns for notification_receipts
    await query(`
      ALTER TABLE notification_receipts
      ADD COLUMN IF NOT EXISTS queue_id UUID REFERENCES notification_queue(id) ON DELETE CASCADE,
      ADD COLUMN IF NOT EXISTS details JSONB DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
    `);

    await query(`
      UPDATE notification_receipts
      SET details = '{}'::jsonb
      WHERE details IS NULL;
    `);

    // Re-create status constraint (allow legacy 'sent' plus new 'pending')
    await query(`
      ALTER TABLE notification_receipts
      ADD CONSTRAINT notification_receipts_status_check
      CHECK (status IN ('pending', 'delivered', 'failed', 'sent'));
    `);

    // Indexes for faster lookups
    await query(`
      CREATE INDEX IF NOT EXISTS idx_notification_queue_push_token ON notification_queue(push_token);
      CREATE INDEX IF NOT EXISTS idx_notification_queue_status_next_attempt ON notification_queue(status, next_attempt_at);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_receipts_receipt_id ON notification_receipts(receipt_id);
      CREATE INDEX IF NOT EXISTS idx_notification_receipts_queue_id ON notification_receipts(queue_id);
    `);

    console.log('✅ Push notification infrastructure updated successfully');
    return { success: true };
  } catch (error) {
    console.error('❌ Error updating push notification infrastructure:', error);
    return { success: false, error: error.message };
  }
};

module.exports = updatePushNotificationInfrastructure;

if (require.main === module) {
  updatePushNotificationInfrastructure()
    .then(result => {
      if (result.success) {
        console.log('✅ Migration completed successfully');
        process.exit(0);
      } else {
        console.error('❌ Migration failed:', result.error);
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('❌ Migration execution error:', error);
      process.exit(1);
    });
}

