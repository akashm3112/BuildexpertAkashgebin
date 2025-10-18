const { query } = require('../database/connection');

async function addPaymentTransactionsTable() {
  try {
    console.log('🚀 Creating payment_transactions table...');

    // Create payment_transactions table
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
        created_at TIMESTAMP DEFAULT NOW(),
        completed_at TIMESTAMP
      );
    `);

    // Create indexes separately
    await query(`CREATE INDEX IF NOT EXISTS idx_payment_transactions_order_id ON payment_transactions(order_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_payment_transactions_user_id ON payment_transactions(user_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_payment_transactions_provider_service_id ON payment_transactions(provider_service_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_payment_transactions_status ON payment_transactions(status);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_payment_transactions_transaction_id ON payment_transactions(transaction_id);`);

    console.log('✅ payment_transactions table created successfully');

  } catch (error) {
    console.error('❌ Error creating payment_transactions table:', error);
    throw error;
  }
}

// Run migration if called directly
if (require.main === module) {
  addPaymentTransactionsTable()
    .then(() => {
      console.log('✅ Migration completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { addPaymentTransactionsTable };

