const { query } = require('../database/connection');

// Avoid circular dependency - don't require logger in migrations
// Use console.log directly for migration output

/**
 * Migration 029: Add Missing Production Indexes
 * 
 * This migration adds critical indexes that were identified during production code analysis:
 * - Bookings table: provider_id, updated_at, and composite indexes for earnings queries
 * - Payment tables: user_id, order_id, status, created_at indexes
 * - Labour payment tables: user_id, order_id, status, created_at indexes
 * - Reports tables: status, created_at, provider_id indexes
 * - Users table: labour_access_status index
 * 
 * This ensures all frequently queried columns have proper indexes for optimal performance.
 */
const addMissingProductionIndexes = async () => {
  try {
    console.log('🔄 Starting missing production indexes migration...');

    // ============================================================================
    // 1. BOOKINGS TABLE - Additional Indexes for Earnings Queries
    // ============================================================================
    console.log('📊 Adding additional indexes to bookings table...');

    // Index on provider_id (used in earnings queries: WHERE b.provider_id = $1)
    await query(`
      CREATE INDEX IF NOT EXISTS idx_bookings_provider_id 
      ON bookings(provider_id);
    `);
    console.log('  ✅ Added index on bookings.provider_id');

    // Index on updated_at (used in earnings date filtering)
    await query(`
      CREATE INDEX IF NOT EXISTS idx_bookings_updated_at 
      ON bookings(updated_at DESC);
    `);
    console.log('  ✅ Added index on bookings.updated_at');

    // Composite index: (provider_id, status, updated_at) - For earnings queries
    // Used in: WHERE b.provider_id = $1 AND b.status = 'completed' AND DATE(b.updated_at) >= ...
    await query(`
      CREATE INDEX IF NOT EXISTS idx_bookings_provider_status_updated 
      ON bookings(provider_id, status, updated_at DESC);
    `);
    console.log('  ✅ Added composite index on bookings(provider_id, status, updated_at DESC)');

    // Composite index: (provider_id, status) - For pending earnings queries
    await query(`
      CREATE INDEX IF NOT EXISTS idx_bookings_provider_status 
      ON bookings(provider_id, status);
    `);
    console.log('  ✅ Added composite index on bookings(provider_id, status)');

    // ============================================================================
    // 2. PAYMENT_TRANSACTIONS TABLE - Critical for Payment Queries
    // ============================================================================
    console.log('📊 Adding indexes to payment_transactions table...');

    // Index on user_id (used in WHERE pt.user_id = $1)
    await query(`
      CREATE INDEX IF NOT EXISTS idx_payment_transactions_user_id 
      ON payment_transactions(user_id);
    `);
    console.log('  ✅ Added index on payment_transactions.user_id');

    // Index on order_id (used in WHERE order_id = $1 - already unique but needs index for performance)
    await query(`
      CREATE INDEX IF NOT EXISTS idx_payment_transactions_order_id 
      ON payment_transactions(order_id);
    `);
    console.log('  ✅ Added index on payment_transactions.order_id');

    // Index on created_at (used in ORDER BY pt.created_at DESC)
    await query(`
      CREATE INDEX IF NOT EXISTS idx_payment_transactions_created_at 
      ON payment_transactions(created_at DESC);
    `);
    console.log('  ✅ Added index on payment_transactions.created_at');

    // Composite index: (user_id, created_at DESC) - For user transaction history
    await query(`
      CREATE INDEX IF NOT EXISTS idx_payment_transactions_user_created 
      ON payment_transactions(user_id, created_at DESC);
    `);
    console.log('  ✅ Added composite index on payment_transactions(user_id, created_at DESC)');

    // Composite index: (user_id, order_id) - For order verification queries
    await query(`
      CREATE INDEX IF NOT EXISTS idx_payment_transactions_user_order 
      ON payment_transactions(user_id, order_id);
    `);
    console.log('  ✅ Added composite index on payment_transactions(user_id, order_id)');

    // Index on status (used in WHERE status = 'failed' or filtering)
    await query(`
      CREATE INDEX IF NOT EXISTS idx_payment_transactions_status 
      ON payment_transactions(status);
    `);
    console.log('  ✅ Added index on payment_transactions.status');

    // ============================================================================
    // 3. PAYMENT_EVENTS TABLE - For Payment Event Queries
    // ============================================================================
    console.log('📊 Adding indexes to payment_events table...');

    // Index on payment_transaction_id (used in JOINs: LEFT JOIN payment_events pe ON pt.id = pe.payment_transaction_id)
    await query(`
      CREATE INDEX IF NOT EXISTS idx_payment_events_transaction_id 
      ON payment_events(payment_transaction_id);
    `);
    console.log('  ✅ Added index on payment_events.payment_transaction_id');

    // Index on user_id (used in WHERE user_id = $1)
    await query(`
      CREATE INDEX IF NOT EXISTS idx_payment_events_user_id 
      ON payment_events(user_id);
    `);
    console.log('  ✅ Added index on payment_events.user_id');

    // Index on timestamp (used in ORDER BY pe.timestamp)
    await query(`
      CREATE INDEX IF NOT EXISTS idx_payment_events_timestamp 
      ON payment_events(timestamp);
    `);
    console.log('  ✅ Added index on payment_events.timestamp');

    // ============================================================================
    // 4. LABOUR_PAYMENT_TRANSACTIONS TABLE - Critical for Labour Payment Queries
    // ============================================================================
    console.log('📊 Adding indexes to labour_payment_transactions table...');

    // Index on user_id (used in WHERE user_id = $1)
    await query(`
      CREATE INDEX IF NOT EXISTS idx_labour_payment_transactions_user_id 
      ON labour_payment_transactions(user_id);
    `);
    console.log('  ✅ Added index on labour_payment_transactions.user_id');

    // Index on order_id (used in WHERE order_id = $1 - already unique but needs index)
    await query(`
      CREATE INDEX IF NOT EXISTS idx_labour_payment_transactions_order_id 
      ON labour_payment_transactions(order_id);
    `);
    console.log('  ✅ Added index on labour_payment_transactions.order_id');

    // Index on status (used in WHERE status = 'pending' or filtering)
    await query(`
      CREATE INDEX IF NOT EXISTS idx_labour_payment_transactions_status 
      ON labour_payment_transactions(status);
    `);
    console.log('  ✅ Added index on labour_payment_transactions.status');

    // Index on created_at (used in ORDER BY created_at DESC)
    await query(`
      CREATE INDEX IF NOT EXISTS idx_labour_payment_transactions_created_at 
      ON labour_payment_transactions(created_at DESC);
    `);
    console.log('  ✅ Added index on labour_payment_transactions.created_at');

    // Composite index: (user_id, created_at DESC) - For user transaction history
    await query(`
      CREATE INDEX IF NOT EXISTS idx_labour_payment_transactions_user_created 
      ON labour_payment_transactions(user_id, created_at DESC);
    `);
    console.log('  ✅ Added composite index on labour_payment_transactions(user_id, created_at DESC)');

    // Composite index: (user_id, order_id) - For order verification queries
    await query(`
      CREATE INDEX IF NOT EXISTS idx_labour_payment_transactions_user_order 
      ON labour_payment_transactions(user_id, order_id);
    `);
    console.log('  ✅ Added composite index on labour_payment_transactions(user_id, order_id)');

    // ============================================================================
    // 5. LABOUR_PAYMENT_EVENTS TABLE - For Labour Payment Event Queries
    // ============================================================================
    console.log('📊 Adding indexes to labour_payment_events table...');

    // Index on payment_transaction_id (used in JOINs)
    await query(`
      CREATE INDEX IF NOT EXISTS idx_labour_payment_events_transaction_id 
      ON labour_payment_events(payment_transaction_id);
    `);
    console.log('  ✅ Added index on labour_payment_events.payment_transaction_id');

    // Index on user_id (used in WHERE user_id = $1)
    await query(`
      CREATE INDEX IF NOT EXISTS idx_labour_payment_events_user_id 
      ON labour_payment_events(user_id);
    `);
    console.log('  ✅ Added index on labour_payment_events.user_id');

    // Index on timestamp (used in ORDER BY timestamp)
    await query(`
      CREATE INDEX IF NOT EXISTS idx_labour_payment_events_timestamp 
      ON labour_payment_events(timestamp);
    `);
    console.log('  ✅ Added index on labour_payment_events.timestamp');

    // ============================================================================
    // 6. PROVIDER_REPORTS_USERS TABLE - For Report Queries
    // ============================================================================
    console.log('📊 Adding indexes to provider_reports_users table...');

    // Index on status (used in WHERE pr.status = $1)
    await query(`
      CREATE INDEX IF NOT EXISTS idx_provider_reports_users_status 
      ON provider_reports_users(status);
    `);
    console.log('  ✅ Added index on provider_reports_users.status');

    // Index on created_at (used in ORDER BY pr.created_at DESC)
    await query(`
      CREATE INDEX IF NOT EXISTS idx_provider_reports_users_created_at 
      ON provider_reports_users(created_at DESC);
    `);
    console.log('  ✅ Added index on provider_reports_users.created_at');

    // Index on provider_id (used in WHERE pr.provider_id = $1)
    await query(`
      CREATE INDEX IF NOT EXISTS idx_provider_reports_users_provider_id 
      ON provider_reports_users(provider_id);
    `);
    console.log('  ✅ Added index on provider_reports_users.provider_id');

    // Composite index: (provider_id, status) - For provider's reports filtering
    await query(`
      CREATE INDEX IF NOT EXISTS idx_provider_reports_users_provider_status 
      ON provider_reports_users(provider_id, status);
    `);
    console.log('  ✅ Added composite index on provider_reports_users(provider_id, status)');

    // ============================================================================
    // 7. USER_REPORTS_PROVIDERS TABLE - For User Report Queries
    // ============================================================================
    console.log('📊 Adding indexes to user_reports_providers table...');

    // Index on status (used in WHERE status = $1)
    await query(`
      CREATE INDEX IF NOT EXISTS idx_user_reports_providers_status 
      ON user_reports_providers(status);
    `);
    console.log('  ✅ Added index on user_reports_providers.status');

    // Index on created_at (used in ORDER BY created_at DESC)
    await query(`
      CREATE INDEX IF NOT EXISTS idx_user_reports_providers_created_at 
      ON user_reports_providers(created_at DESC);
    `);
    console.log('  ✅ Added index on user_reports_providers.created_at');

    // Index on reported_by_user_id (used in WHERE reported_by_user_id = $1)
    // Note: Column is named reported_by_user_id, not user_id
    await query(`
      CREATE INDEX IF NOT EXISTS idx_user_reports_providers_reported_by_user_id 
      ON user_reports_providers(reported_by_user_id);
    `);
    console.log('  ✅ Added index on user_reports_providers.reported_by_user_id');

    // Index on reported_provider_id (used in WHERE reported_provider_id = $1)
    // Note: Column is named reported_provider_id, not provider_id
    // This index may already exist from migration 007, but IF NOT EXISTS makes it safe
    await query(`
      CREATE INDEX IF NOT EXISTS idx_user_reports_providers_reported_provider_id 
      ON user_reports_providers(reported_provider_id);
    `);
    console.log('  ✅ Added index on user_reports_providers.reported_provider_id');

    // ============================================================================
    // 8. USERS TABLE - Additional Indexes
    // ============================================================================
    console.log('📊 Adding additional indexes to users table...');

    // Index on labour_access_status (used in WHERE labour_access_status = 'active')
    await query(`
      CREATE INDEX IF NOT EXISTS idx_users_labour_access_status 
      ON users(labour_access_status);
    `);
    console.log('  ✅ Added index on users.labour_access_status');

    // Composite index: (labour_access_status, labour_access_end_date) - For access expiry checks
    await query(`
      CREATE INDEX IF NOT EXISTS idx_users_labour_access_status_end_date 
      ON users(labour_access_status, labour_access_end_date);
    `);
    console.log('  ✅ Added composite index on users(labour_access_status, labour_access_end_date)');

    // ============================================================================
    // 9. ANALYZE TABLES - Update Statistics for Query Planner
    // ============================================================================
    console.log('📊 Analyzing tables for optimal query planning...');

    const tablesToAnalyze = [
      'bookings',
      'payment_transactions',
      'payment_events',
      'labour_payment_transactions',
      'labour_payment_events',
      'provider_reports_users',
      'user_reports_providers',
      'users'
    ];

    for (const table of tablesToAnalyze) {
      await query(`ANALYZE ${table};`);
      console.log(`  ✅ Analyzed table: ${table}`);
    }

    console.log('');
    console.log('✅ Missing production indexes migration completed successfully!');
    console.log('📈 All critical indexes have been added for optimal query performance.');
    console.log('🔍 Database statistics have been updated for the query planner.');
    
    return { success: true };
  } catch (error) {
    console.error('❌ Error in missing production indexes migration:', error);
    throw error;
  }
};

module.exports = addMissingProductionIndexes;

// Run migration if called directly
if (require.main === module) {
  addMissingProductionIndexes()
    .then(() => {
      console.log('✅ Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    });
}

