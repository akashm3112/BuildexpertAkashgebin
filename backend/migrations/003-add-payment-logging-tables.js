const { query } = require('../database/connection');

/**
 * Add comprehensive payment logging tables
 * This migration creates tables for detailed payment event tracking
 */
const addPaymentLoggingTables = async () => {
  try {
    console.log('📊 Creating payment logging tables...');

    // Create payment_events table for granular event tracking
    await query(`
      CREATE TABLE IF NOT EXISTS payment_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        payment_transaction_id UUID REFERENCES payment_transactions(id) ON DELETE CASCADE,
        event_type TEXT NOT NULL,
        event_data JSONB,
        timestamp TIMESTAMP DEFAULT NOW(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        ip_address INET,
        user_agent TEXT
      );
    `);

    // Create indexes for payment_events
    await query(`
      CREATE INDEX IF NOT EXISTS idx_payment_events_transaction_id ON payment_events(payment_transaction_id);
      CREATE INDEX IF NOT EXISTS idx_payment_events_event_type ON payment_events(event_type);
      CREATE INDEX IF NOT EXISTS idx_payment_events_timestamp ON payment_events(timestamp);
      CREATE INDEX IF NOT EXISTS idx_payment_events_user_id ON payment_events(user_id);
    `);

    console.log('✅ payment_events table created successfully');

    // Create payment_api_logs table for API interaction tracking
    await query(`
      CREATE TABLE IF NOT EXISTS payment_api_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        payment_transaction_id UUID REFERENCES payment_transactions(id) ON DELETE CASCADE,
        api_endpoint TEXT NOT NULL,
        request_method TEXT NOT NULL,
        request_headers JSONB,
        request_body JSONB,
        response_status INTEGER,
        response_headers JSONB,
        response_body JSONB,
        response_time_ms INTEGER,
        error_message TEXT,
        timestamp TIMESTAMP DEFAULT NOW()
      );
    `);

    // Create indexes for payment_api_logs
    await query(`
      CREATE INDEX IF NOT EXISTS idx_payment_api_logs_transaction_id ON payment_api_logs(payment_transaction_id);
      CREATE INDEX IF NOT EXISTS idx_payment_api_logs_endpoint ON payment_api_logs(api_endpoint);
      CREATE INDEX IF NOT EXISTS idx_payment_api_logs_timestamp ON payment_api_logs(timestamp);
      CREATE INDEX IF NOT EXISTS idx_payment_api_logs_response_status ON payment_api_logs(response_status);
    `);

    console.log('✅ payment_api_logs table created successfully');

    // Create payment_security_events table for fraud detection
    await query(`
      CREATE TABLE IF NOT EXISTS payment_security_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        payment_transaction_id UUID REFERENCES payment_transactions(id) ON DELETE CASCADE,
        event_type TEXT NOT NULL,
        risk_score DECIMAL(3,2) DEFAULT 0.00,
        risk_factors JSONB,
        action_taken TEXT,
        details JSONB,
        timestamp TIMESTAMP DEFAULT NOW()
      );
    `);

    // Create indexes for payment_security_events
    await query(`
      CREATE INDEX IF NOT EXISTS idx_payment_security_events_transaction_id ON payment_security_events(payment_transaction_id);
      CREATE INDEX IF NOT EXISTS idx_payment_security_events_event_type ON payment_security_events(event_type);
      CREATE INDEX IF NOT EXISTS idx_payment_security_events_risk_score ON payment_security_events(risk_score);
      CREATE INDEX IF NOT EXISTS idx_payment_security_events_timestamp ON payment_security_events(timestamp);
    `);

    console.log('✅ payment_security_events table created successfully');

    console.log('🎉 Payment logging tables creation completed!');
    return { success: true };
  } catch (error) {
    console.error('❌ Error creating payment logging tables:', error);
    return { success: false, error: error.message };
  }
};

module.exports = addPaymentLoggingTables;

// Run if called directly
if (require.main === module) {
  addPaymentLoggingTables()
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
      console.error('❌ Migration error:', error);
      process.exit(1);
    });
}
