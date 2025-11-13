#!/usr/bin/env node

/**
 * Run migrations one by one individually
 * This script allows you to run each migration separately
 */

const { query } = require('../database/connection');
const config = require('../utils/config');

// Import all migration functions
const createCoreTables = require('./001-create-core-tables');
const addPaymentTransactionsTable = require('./002-add-payment-transactions-table');
const addPaymentLoggingTables = require('./003-add-payment-logging-tables');
const addCallMaskingTables = require('./004-add-call-masking-tables');
const addPushNotificationTables = require('./005-add-push-notification-tables');
const { up: addPaymentLocksTable } = require('./006-add-payment-locks-table');
const separateReportTables = require('./007-separate-report-tables');
const addLabourPaymentTables = require('./008-add-labour-payment-tables');

// Migration list in order
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
    description: 'Creates payment event tracking tables',
    function: addPaymentLoggingTables,
    required: false
  },
  {
    id: '004',
    name: 'Add Call Masking Tables',
    description: 'Creates WebRTC call functionality tables',
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
    description: 'Creates labour_payment_transactions table and adds labour access columns',
    function: addLabourPaymentTables,
    required: false
  }
];

// Test database connection
const testConnection = async () => {
  try {
    await query('SELECT NOW()');
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    console.error('   Make sure your database is running and DATABASE_URL is correct in config.env\n');
    return false;
  }
};

// Run a single migration
const runMigration = async (migration) => {
  const startTime = Date.now();
 
  
  try {
    await migration.function();
    const executionTime = Date.now() - startTime;
    return { success: true, executionTime };
  } catch (error) {
    const executionTime = Date.now() - startTime;
    console.error(`\n❌ Migration ${migration.id} failed: ${error.message}`);
    console.error(`   Execution time: ${executionTime}ms`);
    return { success: false, error: error.message, executionTime };
  }
};

// Main function
const main = async () => {
  
  // Test connection first
  const connected = await testConnection();
  if (!connected) {
    process.exit(1);
  }
  
  const args = process.argv.slice(2);
  
  // If specific migration ID is provided, run only that
  if (args.length > 0) {
    const migrationId = args[0];
    const migration = migrations.find(m => m.id === migrationId);
    
    if (!migration) {
      console.error(`❌ Migration ${migrationId} not found`);
      migrations.forEach(m => {
      });
      process.exit(1);
    }
    
    const result = await runMigration(migration);
    process.exit(result.success ? 0 : 1);
  }
  
  // Otherwise, run all migrations one by one
  
  let executedCount = 0;
  let failedCount = 0;
  const results = [];
  
  for (const migration of migrations) {
    const result = await runMigration(migration);
    results.push({ migration, result });
    
    if (result.success) {
      executedCount++;
    } else {
      failedCount++;
      
      // Ask if user wants to continue on failure
      if (migration.required) {
        console.error(`\n❌ Required migration ${migration.id} failed. Stopping.`);
        break;
      } else {
        console.warn(`\n⚠️  Optional migration ${migration.id} failed, continuing...`);
      }
    }
    
    // Small delay between migrations
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // Summary
 
  if (failedCount > 0) {
    results
      .filter(r => !r.result.success)
      .forEach(r => {
        
      });
  }
  
  if (executedCount > 0) {
    results
      .filter(r => r.result.success)
      .forEach(r => {
      });
  }
  
  
  process.exit(failedCount > 0 ? 1 : 0);
};

// Run
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Migration runner failed:', error);
    process.exit(1);
  });
}

module.exports = { runMigration, migrations, testConnection };


