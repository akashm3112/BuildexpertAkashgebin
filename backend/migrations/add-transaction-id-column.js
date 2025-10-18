const { query } = require('../database/connection');

async function addTransactionIdColumn() {
  try {
    console.log('🚀 Adding transaction_id column to payment_transactions table...');

    // Add transaction_id column if it doesn't exist
    await query(`
      ALTER TABLE payment_transactions 
      ADD COLUMN IF NOT EXISTS transaction_id VARCHAR(255);
    `);

    // Create index for transaction_id
    await query(`
      CREATE INDEX IF NOT EXISTS idx_payment_transactions_transaction_id 
      ON payment_transactions(transaction_id);
    `);

    console.log('✅ transaction_id column added successfully');

  } catch (error) {
    console.error('❌ Error adding transaction_id column:', error);
    throw error;
  }
}

// Run migration if called directly
if (require.main === module) {
  addTransactionIdColumn()
    .then(() => {
      console.log('✅ Migration completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { addTransactionIdColumn };
