const { query } = require('../database/connection');
const config = require('../utils/config');

/**
 * Comprehensive migration runner
 * Runs all migrations in the correct order with proper error handling
 */

// Import all migration functions
const createCoreTables = require('./001-create-core-tables');
const addPaymentTransactionsTable = require('./002-add-payment-transactions-table');
const addPaymentLoggingTables = require('./003-add-payment-logging-tables');
const addCallMaskingTables = require('./004-add-call-masking-tables');
const addPushNotificationTables = require('./005-add-push-notification-tables');

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
  }
];

// Create migrations tracking table
const createMigrationsTable = async () => {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id VARCHAR(10) PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        executed_at TIMESTAMP DEFAULT NOW(),
        success BOOLEAN DEFAULT TRUE,
        error_message TEXT,
        execution_time_ms INTEGER
      );
    `);
    console.log('✅ Migrations tracking table ready');
  } catch (error) {
    console.error('❌ Error creating migrations table:', error);
    throw error;
  }
};

// Check if migration has been executed
const isMigrationExecuted = async (migrationId) => {
  try {
    const result = await query(
      'SELECT id FROM migrations WHERE id = $1 AND success = TRUE',
      [migrationId]
    );
    return result.rows.length > 0;
  } catch (error) {
    // If migrations table doesn't exist, assume no migrations have been run
    return false;
  }
};

// Record migration execution
const recordMigration = async (migration, success, errorMessage = null, executionTime = 0) => {
  try {
    await query(`
      INSERT INTO migrations (id, name, description, success, error_message, execution_time_ms)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (id) DO UPDATE SET
        executed_at = NOW(),
        success = $4,
        error_message = $5,
        execution_time_ms = $6
    `, [
      migration.id,
      migration.name,
      migration.description,
      success,
      errorMessage,
      executionTime
    ]);
  } catch (error) {
    console.error('❌ Error recording migration:', error);
  }
};

// Run a single migration
const runMigration = async (migration) => {
  const startTime = Date.now();
  console.log(`\n🚀 Running migration ${migration.id}: ${migration.name}`);
  console.log(`📝 Description: ${migration.description}`);
  
  try {
    const result = await migration.function();
    const executionTime = Date.now() - startTime;
    
    if (result.success) {
      await recordMigration(migration, true, null, executionTime);
      console.log(`✅ Migration ${migration.id} completed successfully (${executionTime}ms)`);
      return { success: true, executionTime };
    } else {
      await recordMigration(migration, false, result.error, executionTime);
      console.error(`❌ Migration ${migration.id} failed: ${result.error}`);
      return { success: false, error: result.error, executionTime };
    }
  } catch (error) {
    const executionTime = Date.now() - startTime;
    await recordMigration(migration, false, error.message, executionTime);
    console.error(`❌ Migration ${migration.id} failed with exception: ${error.message}`);
    return { success: false, error: error.message, executionTime };
  }
};

// Main migration runner
const runAllMigrations = async (options = {}) => {
  const { 
    force = false, 
    skipOptional = false, 
    verbose = false 
  } = options;
  
  try {
    console.log('🚀 Starting comprehensive database migration...');
    console.log(`🔧 Environment: ${config.isProduction() ? 'Production' : 'Development'}`);
    console.log(`📊 Total migrations: ${migrations.length}`);
    
    if (verbose) {
      console.log('\n📋 Migration Plan:');
      migrations.forEach((migration, index) => {
        const status = migration.required ? 'Required' : 'Optional';
        console.log(`  ${index + 1}. ${migration.id} - ${migration.name} (${status})`);
      });
    }

    // Create migrations tracking table first
    await createMigrationsTable();

    let executedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    const results = [];

    for (const migration of migrations) {
      // Check if migration should be skipped
      if (skipOptional && !migration.required) {
        console.log(`⏭️  Skipping optional migration ${migration.id}: ${migration.name}`);
        skippedCount++;
        continue;
      }

      // Check if migration has already been executed
      const alreadyExecuted = await isMigrationExecuted(migration.id);
      if (alreadyExecuted && !force) {
        console.log(`✅ Migration ${migration.id} already executed, skipping`);
        skippedCount++;
        continue;
      }

      // Run the migration
      const result = await runMigration(migration);
      results.push({ migration, result });
      
      if (result.success) {
        executedCount++;
      } else {
        failedCount++;
        
        // Stop on first failure for required migrations
        if (migration.required) {
          console.error(`\n❌ Required migration ${migration.id} failed. Stopping migration process.`);
          break;
        } else {
          console.warn(`⚠️  Optional migration ${migration.id} failed, continuing...`);
        }
      }
    }

    // Print summary
    console.log('\n📊 Migration Summary:');
    console.log(`✅ Executed: ${executedCount}`);
    console.log(`⏭️  Skipped: ${skippedCount}`);
    console.log(`❌ Failed: ${failedCount}`);
    console.log(`📊 Total: ${migrations.length}`);

    if (failedCount > 0) {
      console.log('\n❌ Failed Migrations:');
      results
        .filter(r => !r.result.success)
        .forEach(r => {
          console.log(`  - ${r.migration.id}: ${r.migration.name} - ${r.result.error}`);
        });
    }

    if (executedCount > 0) {
      console.log('\n✅ Successfully Executed Migrations:');
      results
        .filter(r => r.result.success)
        .forEach(r => {
          console.log(`  - ${r.migration.id}: ${r.migration.name} (${r.result.executionTime}ms)`);
        });
    }

    const overallSuccess = failedCount === 0 || (failedCount > 0 && results.every(r => !r.migration.required || r.result.success));
    
    if (overallSuccess) {
      console.log('\n🎉 All required migrations completed successfully!');
      return { success: true, executedCount, skippedCount, failedCount, results };
    } else {
      console.log('\n❌ Migration process completed with errors');
      return { success: false, executedCount, skippedCount, failedCount, results };
    }

  } catch (error) {
    console.error('❌ Migration runner error:', error);
    return { success: false, error: error.message };
  }
};

// Show migration status
const showMigrationStatus = async () => {
  try {
    console.log('📊 Migration Status:');
    
    const executedMigrations = await query(`
      SELECT id, name, executed_at, success, execution_time_ms 
      FROM migrations 
      ORDER BY executed_at
    `);
    
    if (executedMigrations.rows.length === 0) {
      console.log('  No migrations have been executed yet.');
      return;
    }
    
    executedMigrations.rows.forEach(migration => {
      const status = migration.success ? '✅' : '❌';
      const time = migration.execution_time_ms ? `(${migration.execution_time_ms}ms)` : '';
      console.log(`  ${status} ${migration.id} - ${migration.name} ${time}`);
    });
    
  } catch (error) {
    console.error('❌ Error checking migration status:', error);
  }
};

module.exports = {
  runAllMigrations,
  showMigrationStatus,
  migrations
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
  } else {
    runAllMigrations(options)
      .then(result => {
        if (result.success) {
          console.log('\n🎉 Migration process completed successfully!');
          process.exit(0);
        } else {
          console.log('\n❌ Migration process completed with errors');
          process.exit(1);
        }
      })
      .catch(error => {
        console.error('\n❌ Migration runner failed:', error);
        process.exit(1);
      });
  }
}
