/**
 * Migration: Add payment_locks table
 * For preventing concurrent payment attempts
 */

const { query } = require('../database/connection');

async function up() {
  try {
    console.log('Creating payment_locks table...');

    await query(`
      CREATE TABLE IF NOT EXISTS payment_locks (
        id SERIAL PRIMARY KEY,
        lock_key VARCHAR(255) UNIQUE NOT NULL,
        user_id VARCHAR(255) NOT NULL,
        provider_service_id VARCHAR(255),
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    console.log('✅ payment_locks table created');

    // Create indexes for performance
    await query(`
      CREATE INDEX IF NOT EXISTS idx_payment_locks_key ON payment_locks(lock_key);
      CREATE INDEX IF NOT EXISTS idx_payment_locks_expires ON payment_locks(expires_at);
      CREATE INDEX IF NOT EXISTS idx_payment_locks_user_id ON payment_locks(user_id);
    `);

    console.log('✅ payment_locks indexes created');

    // Clean up expired locks
    await query(`
      DELETE FROM payment_locks WHERE expires_at < NOW()
    `);

    console.log('✅ Migration 006 completed successfully');

  } catch (error) {
    console.error('❌ Migration 006 failed:', error);
    throw error;
  }
}

async function down() {
  try {
    console.log('Dropping payment_locks table...');

    await query(`
      DROP TABLE IF EXISTS payment_locks CASCADE
    `);

    console.log('✅ payment_locks table dropped');

  } catch (error) {
    console.error('❌ Rollback 006 failed:', error);
    throw error;
  }
}

module.exports = { up, down };

// Run migration if executed directly
if (require.main === module) {
  up()
    .then(() => {
      console.log('Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

