const { query } = require('../database/connection');

const addLabourPaymentTables = async () => {
  try {

    // 1. Add labour access columns to users table
    await query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS labour_access_status TEXT CHECK (labour_access_status IN ('inactive', 'active', 'expired')) DEFAULT 'inactive',
      ADD COLUMN IF NOT EXISTS labour_access_start_date TIMESTAMP,
      ADD COLUMN IF NOT EXISTS labour_access_end_date TIMESTAMP
    `);

    // 2. Create labour_payment_transactions table
    await query(`
      CREATE TABLE IF NOT EXISTS labour_payment_transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id TEXT UNIQUE NOT NULL,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        amount DECIMAL(10,2) NOT NULL,
        status TEXT CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')) DEFAULT 'pending',
        payment_method TEXT NOT NULL DEFAULT 'paytm',
        service_name TEXT NOT NULL,
        payment_flow_id TEXT,
        user_agent TEXT,
        ip_address INET,
        device_info JSONB,
        payment_gateway_response JSONB,
        transaction_id TEXT,
        error_details JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        completed_at TIMESTAMP,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // 3. Create labour_payment_events table for detailed logging
    await query(`
      CREATE TABLE IF NOT EXISTS labour_payment_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        payment_transaction_id UUID REFERENCES labour_payment_transactions(id) ON DELETE CASCADE,
        event_type TEXT NOT NULL,
        event_data JSONB,
        user_id UUID REFERENCES users(id),
        ip_address INET,
        user_agent TEXT,
        timestamp TIMESTAMP DEFAULT NOW()
      )
    `);

    // 4. Create labour_payment_locks table for concurrency control
    await query(`
      CREATE TABLE IF NOT EXISTS labour_payment_locks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        lock_key TEXT UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // 5. Create indexes for better performance
    await query(`CREATE INDEX IF NOT EXISTS idx_labour_payment_transactions_user_id ON labour_payment_transactions(user_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_labour_payment_transactions_order_id ON labour_payment_transactions(order_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_labour_payment_transactions_status ON labour_payment_transactions(status);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_labour_payment_transactions_created_at ON labour_payment_transactions(created_at);`);
    
    await query(`CREATE INDEX IF NOT EXISTS idx_labour_payment_events_transaction_id ON labour_payment_events(payment_transaction_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_labour_payment_events_user_id ON labour_payment_events(user_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_labour_payment_events_timestamp ON labour_payment_events(timestamp);`);
    
    await query(`CREATE INDEX IF NOT EXISTS idx_labour_payment_locks_user_id ON labour_payment_locks(user_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_labour_payment_locks_expires_at ON labour_payment_locks(expires_at);`);
    
    await query(`CREATE INDEX IF NOT EXISTS idx_users_labour_access_status ON users(labour_access_status);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_users_labour_access_end_date ON users(labour_access_end_date);`);
    

    // 6. Create function to clean up expired locks
    await query(`
      CREATE OR REPLACE FUNCTION cleanup_expired_labour_payment_locks()
      RETURNS void AS $$
      BEGIN
        DELETE FROM labour_payment_locks WHERE expires_at < NOW();
      END;
      $$ LANGUAGE plpgsql;
    `);

    // 7. Create function to check labour access expiry
    await query(`
      CREATE OR REPLACE FUNCTION check_labour_access_expiry()
      RETURNS void AS $$
      BEGIN
        UPDATE users 
        SET labour_access_status = 'expired', updated_at = NOW()
        WHERE labour_access_status = 'active' 
          AND labour_access_end_date IS NOT NULL 
          AND labour_access_end_date < NOW();
      END;
      $$ LANGUAGE plpgsql;
    `);

    
  } catch (error) {
    console.error('❌ Error in labour payment tables migration:', error);
    throw error;
  }
};

module.exports = addLabourPaymentTables;

// Run migration if called directly
if (require.main === module) {
  addLabourPaymentTables()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Labour payment tables migration failed:', error);
      process.exit(1);
    });
}
