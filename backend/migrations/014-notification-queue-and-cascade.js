const { query } = require('../database/connection');

const setupNotificationQueueAndCascades = async () => {
  try {

    await query(`
      CREATE TABLE IF NOT EXISTS notification_delivery_queue (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        role TEXT,
        metadata JSONB DEFAULT '{}'::jsonb,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','delivered','failed')),
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 5,
        priority INTEGER DEFAULT 0,
        next_attempt_at TIMESTAMPTZ,
        locked_by TEXT,
        processing_started_at TIMESTAMPTZ,
        delivered_at TIMESTAMPTZ,
        last_error TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_notification_delivery_status_next
        ON notification_delivery_queue (status, next_attempt_at);
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_notification_delivery_user
        ON notification_delivery_queue (user_id);
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_notification_delivery_priority
        ON notification_delivery_queue (priority DESC);
    `);

    // Ensure updated_at reflects latest change
    await query(`
      CREATE OR REPLACE FUNCTION set_notification_queue_timestamp()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_trigger WHERE tgname = 'trg_notification_queue_updated_at'
        ) THEN
          CREATE TRIGGER trg_notification_queue_updated_at
            BEFORE UPDATE ON notification_delivery_queue
            FOR EACH ROW EXECUTE FUNCTION set_notification_queue_timestamp();
        END IF;
      END;
      $$;
    `);

    // Enforce cascading deletes for core relationships
    await query('ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_user_id_fkey;');
    await query(`
      ALTER TABLE notifications
        ADD CONSTRAINT notifications_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    `);

    await query('ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_user_id_fkey;');
    await query(`
      ALTER TABLE bookings
        ADD CONSTRAINT bookings_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    `);

    await query('ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_provider_service_id_fkey;');
    await query(`
      ALTER TABLE bookings
        ADD CONSTRAINT bookings_provider_service_id_fkey
        FOREIGN KEY (provider_service_id) REFERENCES provider_services(id) ON DELETE CASCADE;
    `);

    await query('ALTER TABLE ratings DROP CONSTRAINT IF EXISTS ratings_booking_id_fkey;');
    await query(`
      ALTER TABLE ratings
        ADD CONSTRAINT ratings_booking_id_fkey
        FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE;
    `);

  } catch (error) {
    console.error('❌ Error applying notification queue migration:', error);
    throw error;
  }
};

module.exports = setupNotificationQueueAndCascades;

if (require.main === module) {
  setupNotificationQueueAndCascades()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

