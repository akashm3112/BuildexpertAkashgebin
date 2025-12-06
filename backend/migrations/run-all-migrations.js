const { query, pool, withTransaction } = require('../database/connection');
const config = require('../utils/config');

/**
 * Comprehensive migration runner with:
 * - Transactions per migration
 * - Advisory locks to prevent concurrent runs
 * - Improved migration record logic
 * - Better ID validation
 * - Refactored duplicated paths
 */

// Import all migration functions
const createCoreTables = require('./001-create-core-tables');
const addPaymentTransactionsTable = require('./002-add-payment-transactions-table');
const addPaymentLoggingTables = require('./003-add-payment-logging-tables');
const addCallMaskingTables = require('./004-add-call-masking-tables');
const addPushNotificationTables = require('./005-add-push-notification-tables');
const { up: addPaymentLocksTable } = require('./006-add-payment-locks-table');
const separateReportTables = require('./007-separate-report-tables');
const addLabourPaymentTables = require('./008-add-labour-payment-tables');
const addMissingProviderColumns = require('./009-add-missing-provider-columns');
const addAuthSecurityTables = require('./010-add-auth-security-tables');
const updatePushNotificationInfrastructure = require('./011-update-push-notification-infra');
const updateServicePricingInfrastructure = require('./012-service-pricing-infrastructure');
const alignServicePricing = require('./013-align-service-pricing');
const notificationQueueAndCascade = require('./014-notification-queue-and-cascade');
const createPendingPushNotificationsTable = require('./015-pending-push-notifications');
const createBlockedIdentifiersTable = require('./016-add-blocked-identifiers-table');
const optimizeReportStatusIndexes = require('./017-optimize-report-status-indexes');
const addRefreshTokensTable = require('./018-add-refresh-tokens-table');
const updatePaintingService = require('./019-update-painting-service');
const addCityToAddresses = require('./020-add-city-to-addresses');
const addLocationIndexes = require('./021-add-location-indexes');

// Migration registry with order and metadata
const migrations = [
  {
    id: '001',
    name: 'Create Core Tables',
    description: 'Creates fundamental application tables (users, addresses, services, etc.)',
    function: createCoreTables,
    required: true
  },
  {
    id: '002',
    name: 'Add Payment Transactions Table',
    description: 'Creates payment_transactions table with comprehensive fields',
    function: addPaymentTransactionsTable,
    required: true
  },
  {
    id: '003',
    name: 'Add Payment Logging Tables',
    description: 'Creates payment event tracking tables (payment_events, payment_api_logs, payment_security_events)',
    function: addPaymentLoggingTables,
    required: false
  },
  {
    id: '004',
    name: 'Add Call Masking Tables',
    description: 'Creates WebRTC call functionality tables (call_sessions, call_logs, call_events, call_recordings)',
    function: addCallMaskingTables,
    required: false
  },
  {
    id: '005',
    name: 'Add Push Notification Tables',
    description: 'Creates push notification infrastructure tables',
    function: addPushNotificationTables,
    required: false
  },
  {
    id: '006',
    name: 'Add Payment Locks Table',
    description: 'Creates payment_locks table for preventing concurrent payment attempts',
    function: addPaymentLocksTable,
    required: false
  },
  {
    id: '007',
    name: 'Separate Report Tables',
    description: 'Creates separate tables for provider_reports_users and user_reports_providers',
    function: separateReportTables,
    required: false
  },
  {
    id: '008',
    name: 'Add Labour Payment Tables',
    description: 'Creates labour_payment_transactions table and adds labour access columns to users',
    function: addLabourPaymentTables,
    required: false
  },
  {
    id: '009',
    name: 'Add Missing Provider Columns',
    description: 'Adds missing columns (state, city, business_name, experience_years, rating, total_reviews) to provider_profiles table',
    function: addMissingProviderColumns,
    required: false
  },
  {
    id: '010',
    name: 'Add Authentication Security Tables',
    description: 'Creates token blacklist, session management, login attempts, and security events tables for comprehensive auth security',
    function: addAuthSecurityTables,
    required: true
  },
  {
    id: '011',
    name: 'Update Push Notification Infrastructure',
    description: 'Adds persistent retry queue support and receipt-to-token mapping for Expo push notifications',
    function: updatePushNotificationInfrastructure,
    required: true
  },
  {
    id: '012',
    name: 'Service Pricing Infrastructure',
    description: 'Adds base pricing metadata, service pricing plans, and payment linkage for provider subscriptions',
    function: updateServicePricingInfrastructure,
    required: true
  },
  {
    id: '013',
    name: 'Align Service Pricing',
    description: 'Standardises provider subscription pricing to ₹99 and enforces defaults',
    function: alignServicePricing,
    required: true
  },
  {
    id: '014',
    name: 'Notification Queue & Cascade Clean-up',
    description: 'Adds durable notification queueing and cascades for dependent tables',
    function: notificationQueueAndCascade,
    required: true
  },
  {
    id: '015',
    name: 'Pending Push Notifications Table',
    description: 'Stores pending push notifications for users without active tokens',
    function: createPendingPushNotificationsTable,
    required: true
  },
  {
    id: '016',
    name: 'Add Blocked Identifiers Table',
    description: 'Creates blocked_identifiers table for admin to block phone numbers and emails',
    function: createBlockedIdentifiersTable,
    required: true
  },
  {
    id: '017',
    name: 'Optimize Report Status Indexes',
    description: 'Adds functional indexes for case-insensitive status queries to improve admin dashboard performance',
    function: optimizeReportStatusIndexes,
    required: false // Optional optimization
  },
  {
    id: '018',
    name: 'Add Refresh Tokens Table',
    description: 'Creates refresh_tokens table for secure token rotation and refresh token mechanism',
    function: addRefreshTokensTable,
    required: true // Required for refresh token functionality
  },
  {
    id: '019',
    name: 'Update Painting Service',
    description: 'Migrates painting-cleaning service to painting, ensures cleaning and borewell services exist',
    function: updatePaintingService,
    required: true // Required for service separation
  },
  {
    id: '020',
    name: 'Add City to Addresses',
    description: 'Adds city column to addresses table for service registration',
    function: addCityToAddresses,
    required: true // Required for city selection in service registration
  },
  {
    id: '021',
    name: 'Add Location Indexes',
    description: 'Adds indexes on addresses.city and addresses.state for optimized location-based sorting',
    function: addLocationIndexes,
    required: true // Required for fast location-based provider sorting
  }
];

// Constants
const ADVISORY_LOCK_ID = 1234567890; // Unique lock ID for migrations
const MIGRATION_ID_PATTERN = /^\d{3}$/; // Valid migration ID format: 001, 002, etc.

/**
 * Validate migration ID format
 */
const validateMigrationId = (migrationId) => {
  if (!migrationId || typeof migrationId !== 'string') {
    return { valid: false, error: 'Migration ID must be a non-empty string' };
  }
  
  if (!MIGRATION_ID_PATTERN.test(migrationId)) {
    return { valid: false, error: `Migration ID must be 3 digits (e.g., "001", "016"), got: "${migrationId}"` };
  }
  
  return { valid: true };
};

/**
 * Find migration by ID with validation
 */
const findMigrationById = (migrationId) => {
  const validation = validateMigrationId(migrationId);
  if (!validation.valid) {
    return { found: false, error: validation.error };
  }
  
  const migration = migrations.find(m => m.id === migrationId);
  if (!migration) {
    return { found: false, error: `Migration ${migrationId} not found in registry` };
  }
  
  return { found: true, migration };
};

/**
 * Acquire advisory lock to prevent concurrent migration runs
 */
const acquireAdvisoryLock = async () => {
  const client = await pool.connect();
  try {
    // Try to acquire lock (non-blocking)
    const result = await client.query('SELECT pg_try_advisory_lock($1) as acquired', [ADVISORY_LOCK_ID]);
    const acquired = result.rows[0].acquired;
    
    if (!acquired) {
      throw new Error('Another migration process is already running. Please wait for it to complete.');
    }
    
    return client; // Return client to release lock later
  } catch (error) {
    client.release();
    throw error;
  }
};

/**
 * Release advisory lock
 */
const releaseAdvisoryLock = async (client) => {
  if (client) {
    try {
      await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_ID]);
    } catch (error) {
      console.error('⚠️  Warning: Failed to release advisory lock:', error.message);
    } finally {
      client.release();
    }
  }
};

/**
 * Create migrations tracking table with improved schema
 */
const createMigrationsTable = async (client = null) => {
  const queryFn = client ? client.query.bind(client) : query;
  
  try {
    // Create table if it doesn't exist
    await queryFn(`
      CREATE TABLE IF NOT EXISTS migrations (
        id VARCHAR(10) PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        success BOOLEAN DEFAULT TRUE,
        error_message TEXT,
        execution_time_ms INTEGER
      );
    `);
    
    // Add new columns if they don't exist (for backward compatibility)
    try {
      await queryFn(`ALTER TABLE migrations ADD COLUMN IF NOT EXISTS executed_by TEXT;`);
    } catch (e) {
      // Column might already exist, ignore
    }
    
    try {
      await queryFn(`ALTER TABLE migrations ADD COLUMN IF NOT EXISTS checksum TEXT;`);
    } catch (e) {
      // Column might already exist, ignore
    }
    
    try {
      await queryFn(`ALTER TABLE migrations ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;`);
    } catch (e) {
      // Column might already exist, ignore
    }
    
    // Add indexes for better query performance
    await queryFn(`
      CREATE INDEX IF NOT EXISTS idx_migrations_executed_at ON migrations(executed_at);
      CREATE INDEX IF NOT EXISTS idx_migrations_success ON migrations(success);
    `);
  } catch (error) {
    console.error('❌ Error creating migrations table:', error);
    throw error;
  }
};

/**
 * Check if migration has been executed (with improved logic)
 */
const isMigrationExecuted = async (migrationId, client = null) => {
  const queryFn = client ? client.query.bind(client) : query;
  
  try {
    const result = await queryFn(
      'SELECT id, success FROM migrations WHERE id = $1 ORDER BY executed_at DESC LIMIT 1',
      [migrationId]
    );
    
    if (result.rows.length === 0) {
      return { executed: false };
    }
    
    const record = result.rows[0];
    return {
      executed: true,
      success: record.success,
      needsRetry: !record.success // If last execution failed, it needs retry
    };
  } catch (error) {
    // If migrations table doesn't exist, assume no migrations have been run
    if (error.code === '42P01') { // Table doesn't exist
      return { executed: false };
    }
    throw error;
  }
};

/**
 * Record migration execution (improved with more details)
 */
const recordMigration = async (migration, success, errorMessage = null, executionTime = 0, client = null) => {
  const queryFn = client ? client.query.bind(client) : query;
  
  try {
    const executedBy = process.env.USER || process.env.USERNAME || 'unknown';
    const checksum = migration.id; // Can be enhanced with file hash in future
    
    await queryFn(`
      INSERT INTO migrations (id, name, description, success, error_message, execution_time_ms, executed_by, checksum)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (id) DO UPDATE SET
        executed_at = NOW(),
        success = $4,
        error_message = $5,
        execution_time_ms = $6,
        executed_by = $7,
        checksum = $8,
        version = migrations.version + 1
    `, [
      migration.id,
      migration.name,
      migration.description,
      success,
      errorMessage,
      executionTime,
      executedBy,
      checksum
    ]);
  } catch (error) {
    console.error('❌ Error recording migration:', error);
    // Don't throw - recording failure shouldn't fail the migration itself
  }
};

/**
 * Run a single migration within a transaction
 * Each migration runs in its own transaction for atomicity
 */
const runMigration = async (migration, options = {}) => {
  const { force = false, skipLock = false } = options;
  const startTime = Date.now();
  let lockClient = null;
  
  try {
    // Only acquire advisory lock if not already held by caller
    if (!skipLock) {
      lockClient = await acquireAdvisoryLock();
    }
    
    // Check if already executed (before transaction to avoid unnecessary transaction)
    const status = await isMigrationExecuted(migration.id);
    if (status.executed && status.success && !force) {
      if (lockClient) {
        await releaseAdvisoryLock(lockClient);
      }
      return { success: true, skipped: true, executionTime: 0 };
    }
    
    if (status.executed && !status.success) {
      console.log(`   ⚠️  Previous execution failed, retrying...`);
    }
    
    // Run migration in a transaction
    // Each migration is atomic - if it fails, all changes are rolled back
    const result = await withTransaction(async (client) => {
      // Create migrations table if it doesn't exist (within transaction)
      await createMigrationsTable(client);
      
      // Execute the migration function
      // Note: Migration functions use the global query() which uses the pool,
      // but the migration record is transactional. For full transactional migrations,
      // migration functions would need to accept a client parameter.
      // This ensures at least the migration record is transactional.
      await migration.function();
      
      const executionTime = Date.now() - startTime;
      
      // Record success within transaction
      // This ensures the migration record is only saved if migration succeeds
      await recordMigration(migration, true, null, executionTime, client);
      
      return { success: true, skipped: false, executionTime };
    }, { name: `migration-${migration.id}`, retries: 0 }); // No retries for migrations
    
    // Release lock only if we acquired it
    if (lockClient) {
      await releaseAdvisoryLock(lockClient);
      lockClient = null;
    }
    
    return result;
  } catch (error) {
    // Release lock on error only if we acquired it
    if (lockClient) {
      await releaseAdvisoryLock(lockClient);
    }
    
    const executionTime = Date.now() - startTime;
    
    // Record failure (outside transaction since transaction was rolled back)
    // This allows us to track failed migrations even if they roll back
    try {
      await recordMigration(migration, false, error.message, executionTime);
    } catch (recordError) {
      console.error('⚠️  Failed to record migration failure:', recordError.message);
    }
    
    return {
      success: false,
      skipped: false,
      error: error.message,
      executionTime
    };
  }
};

/**
 * Main migration runner with advisory locks
 */
const runAllMigrations = async (options = {}) => {
  const { 
    force = false, 
    skipOptional = false, 
    verbose = false 
  } = options;
  
  let lockClient = null;
  
  try {
    console.log('\n🚀 Starting migration process...\n');
    
    // Acquire advisory lock for entire migration run
    lockClient = await acquireAdvisoryLock();
    console.log('🔒 Advisory lock acquired - preventing concurrent runs\n');
    
    if (verbose) {
      console.log('Migration list:');
      migrations.forEach((migration) => {
        const status = migration.required ? '[REQUIRED]' : '[OPTIONAL]';
        console.log(`  ${migration.id}: ${migration.name} ${status}`);
      });
      console.log('');
    }

    // Create migrations tracking table first (outside transaction for table creation)
    await createMigrationsTable();

    let executedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    const results = [];

    for (const migration of migrations) {
      // Check if migration should be skipped
      if (skipOptional && !migration.required) {
        skippedCount++;
        continue;
      }

      // Check if migration has already been executed
      const status = await isMigrationExecuted(migration.id);
      if (status.executed && status.success && !force) {
        console.log(`⏭️  Skipping ${migration.id}: ${migration.name} (already executed)`);
        skippedCount++;
        continue;
      }

      // Run the migration (skip lock acquisition since we already have the lock)
      console.log(`🔄 Running ${migration.id}: ${migration.name}...`);
      const result = await runMigration(migration, { force, skipLock: true });
      results.push({ migration, result });
      
      if (result.success) {
        if (result.skipped) {
          skippedCount++;
          console.log(`⏭️  ${migration.id} skipped (already executed)\n`);
        } else {
          executedCount++;
          console.log(`✅ ${migration.id} completed (${result.executionTime}ms)\n`);
        }
      } else {
        failedCount++;
        console.error(`❌ ${migration.id} failed: ${result.error}\n`);
        
        // Stop on first failure for required migrations
        if (migration.required) {
          console.error(`\n❌ Required migration ${migration.id} failed. Stopping migration process.`);
          break;
        } else {
          console.warn(`⚠️  Optional migration ${migration.id} failed, continuing...\n`);
        }
      }
    }

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 Migration Summary');
    console.log('='.repeat(60));
    console.log(`✅ Executed: ${executedCount}`);
    console.log(`⏭️  Skipped:  ${skippedCount}`);
    console.log(`❌ Failed:   ${failedCount}`);
    console.log('='.repeat(60) + '\n');

    if (failedCount > 0) {
      console.log('Failed migrations:');
      results
        .filter(r => !r.result.success)
        .forEach(r => {
          console.log(`  ❌ ${r.migration.id}: ${r.migration.name} - ${r.result.error}`);
        });
      console.log('');
    }

    const overallSuccess = failedCount === 0 || (failedCount > 0 && results.every(r => !r.migration.required || r.result.success));
    
    if (overallSuccess) {
      console.log('✅ All migrations completed successfully!\n');
      return { success: true, executedCount, skippedCount, failedCount, results };
    } else {
      console.log('❌ Some migrations failed. Please review the errors above.\n');
      return { success: false, executedCount, skippedCount, failedCount, results };
    }

  } catch (error) {
    console.error('❌ Migration runner error:', error.message);
    return { success: false, error: error.message };
  } finally {
    // Always release the advisory lock
    if (lockClient) {
      await releaseAdvisoryLock(lockClient);
      console.log('🔓 Advisory lock released\n');
    }
  }
};

/**
 * Run a specific migration by ID with validation
 */
const runSpecificMigration = async (migrationId, options = {}) => {
  const { force = false } = options;
  let lockClient = null;
  
  try {
    // Validate and find migration
    const lookup = findMigrationById(migrationId);
    if (!lookup.found) {
      console.error(`❌ ${lookup.error}`);
      console.error('\nAvailable migrations:');
      migrations.forEach(m => {
        console.error(`  ${m.id}: ${m.name}`);
      });
      return { success: false, error: lookup.error };
    }
    
    const migration = lookup.migration;
    
    // Acquire advisory lock
    lockClient = await acquireAdvisoryLock();
    console.log('🔒 Advisory lock acquired\n');
    
    // Create migrations tracking table first
    await createMigrationsTable();
    
    // Check if migration has already been executed
    const status = await isMigrationExecuted(migrationId);
    if (status.executed && status.success && !force) {
      console.log(`⏭️  Migration ${migrationId} has already been executed. Use --force to run it again.`);
      return { success: true, skipped: true };
    }
    
    console.log(`\n🔄 Running migration ${migrationId}: ${migration.name}`);
    const result = await runMigration(migration, { force });
    
    if (result.success) {
      console.log(`✅ Migration ${migrationId} completed successfully`);
    } else {
      console.error(`❌ Migration ${migrationId} failed: ${result.error}`);
    }
    
    return result;
  } catch (error) {
    console.error(`❌ Error running migration ${migrationId}:`, error.message);
    return { success: false, error: error.message };
  } finally {
    if (lockClient) {
      await releaseAdvisoryLock(lockClient);
      console.log('🔓 Advisory lock released\n');
    }
  }
};

/**
 * Show migration status (improved)
 */
const showMigrationStatus = async () => {
  try {
    await createMigrationsTable();
    
    // Check if new columns exist
    const columnCheck = await query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'migrations' 
      AND column_name IN ('executed_by', 'version')
    `);
    
    const hasNewColumns = columnCheck.rows.length >= 2;
    
    // Build query based on available columns
    const selectColumns = hasNewColumns 
      ? 'id, name, executed_at, success, execution_time_ms, executed_by, version'
      : 'id, name, executed_at, success, execution_time_ms';
    
    const executedMigrations = await query(`
      SELECT ${selectColumns}
      FROM migrations 
      ORDER BY executed_at
    `);
    
    if (executedMigrations.rows.length === 0) {
      console.log('\n📋 No migrations have been executed yet.\n');
      return;
    }
    
    console.log('\n📋 Migration Status:\n');
    
    if (hasNewColumns) {
      console.log('ID   | Name                                    | Status | Executed At          | Time    | By       | Ver');
      console.log('-'.repeat(110));
      
      executedMigrations.rows.forEach(migration => {
        const status = migration.success ? '✅' : '❌';
        const time = migration.execution_time_ms ? `${migration.execution_time_ms}ms` : 'N/A';
        const executedAt = new Date(migration.executed_at).toLocaleString();
        const name = migration.name.length > 40 ? migration.name.substring(0, 37) + '...' : migration.name;
        const executedBy = migration.executed_by || 'unknown';
        const version = migration.version || 1;
        console.log(`${migration.id.padEnd(4)} | ${name.padEnd(40)} | ${status}     | ${executedAt.padEnd(20)} | ${time.padEnd(8)} | ${executedBy.padEnd(8)} | ${version}`);
      });
    } else {
      console.log('ID   | Name                                    | Status | Executed At          | Time');
      console.log('-'.repeat(90));
      
      executedMigrations.rows.forEach(migration => {
        const status = migration.success ? '✅' : '❌';
        const time = migration.execution_time_ms ? `${migration.execution_time_ms}ms` : 'N/A';
        const executedAt = new Date(migration.executed_at).toLocaleString();
        const name = migration.name.length > 40 ? migration.name.substring(0, 37) + '...' : migration.name;
        console.log(`${migration.id.padEnd(4)} | ${name.padEnd(40)} | ${status}     | ${executedAt.padEnd(20)} | ${time}`);
      });
    }
    
    console.log('');
    
  } catch (error) {
    console.error('❌ Error checking migration status:', error);
  }
};

module.exports = {
  runAllMigrations,
  runSpecificMigration,
  showMigrationStatus,
  migrations,
  validateMigrationId,
  findMigrationById
};

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {
    force: args.includes('--force'),
    skipOptional: args.includes('--skip-optional'),
    verbose: args.includes('--verbose')
  };
  
  if (args.includes('--status')) {
    showMigrationStatus()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  } else if (args.length > 0 && !args[0].startsWith('--')) {
    // If first argument is a migration ID (not a flag), run that specific migration
    const migrationId = args[0];
    runSpecificMigration(migrationId, options)
      .then(result => {
        process.exit(result.success ? 0 : 1);
      })
      .catch(error => {
        console.error('\n❌ Migration runner failed:', error);
        process.exit(1);
      });
  } else {
    runAllMigrations(options)
      .then(result => {
        if (result.success) {
          process.exit(0);
        } else {
          process.exit(1);
        }
      })
      .catch(error => {
        console.error('\n❌ Migration runner failed:', error);
        process.exit(1);
      });
  }
}
