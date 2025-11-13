const { query } = require('../database/connection');

/**
 * Add payment transactions table
 * This migration creates the payment_transactions table with all necessary fields
 */
const addPaymentTransactionsTable = async () => {
  try {

    // Create payment_transactions table with all fields
    await query(`
      CREATE TABLE IF NOT EXISTS payment_transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id VARCHAR(255) UNIQUE NOT NULL,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        provider_service_id UUID REFERENCES provider_services(id) ON DELETE CASCADE,
        amount DECIMAL(10, 2) NOT NULL,
        status VARCHAR(50) CHECK (status IN ('pending', 'completed', 'failed', 'refunded')) DEFAULT 'pending',
        payment_method VARCHAR(50) DEFAULT 'paytm',
        service_name TEXT,
        transaction_id VARCHAR(255),
        payment_gateway_response JSONB,
        payment_flow_id VARCHAR(255),
        user_agent TEXT,
        ip_address INET,
        device_info JSONB,
        error_details JSONB,
        performance_metrics JSONB,
        security_flags JSONB,
        retry_count INTEGER DEFAULT 0,
        retry_reason TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        completed_at TIMESTAMP,
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Create comprehensive indexes
    await query(`
      CREATE INDEX IF NOT EXISTS idx_payment_transactions_order_id ON payment_transactions(order_id);
      CREATE INDEX IF NOT EXISTS idx_payment_transactions_user_id ON payment_transactions(user_id);
      CREATE INDEX IF NOT EXISTS idx_payment_transactions_provider_service_id ON payment_transactions(provider_service_id);
      CREATE INDEX IF NOT EXISTS idx_payment_transactions_status ON payment_transactions(status);
      CREATE INDEX IF NOT EXISTS idx_payment_transactions_transaction_id ON payment_transactions(transaction_id);
      CREATE INDEX IF NOT EXISTS idx_payment_transactions_payment_flow_id ON payment_transactions(payment_flow_id);
      CREATE INDEX IF NOT EXISTS idx_payment_transactions_ip_address ON payment_transactions(ip_address);
      CREATE INDEX IF NOT EXISTS idx_payment_transactions_retry_count ON payment_transactions(retry_count);
      CREATE INDEX IF NOT EXISTS idx_payment_transactions_updated_at ON payment_transactions(updated_at);
      CREATE INDEX IF NOT EXISTS idx_payment_transactions_created_at ON payment_transactions(created_at);
    `);


    return { success: true };
  } catch (error) {
    console.error('❌ Error creating payment_transactions table:', error);
    return { success: false, error: error.message };
  }
};

module.exports = addPaymentTransactionsTable;

// Run if called directly
if (require.main === module) {
  addPaymentTransactionsTable()
    .then(result => {
      if (result.success) {
        process.exit(0);
      } else {
        console.error('❌ Migration failed:', result.error);
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('❌ Migration error:', error);
      process.exit(1);
    });
}
