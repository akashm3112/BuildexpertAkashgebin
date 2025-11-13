const fs = require('fs');
const path = require('path');
const { pool } = require('../database/connection');

async function runMigration() {
  let client;
  
  try {
    
    // Read migration file
    const migrationPath = path.join(__dirname, '../database/migrations/001_auth_security.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Get a client from the pool
    client = await pool.connect();
    
    
    // Execute migration in a transaction
    await client.query('BEGIN');
    
    // Execute the entire migration
    await client.query(migrationSQL);
    
    await client.query('COMMIT');
    
   
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('   Error details:', error);
    
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('❌ Rollback failed:', rollbackError.message);
      }
    }
    
    process.exit(1);
  } finally {
    if (client) {
      client.release();
    }
    // Close pool to allow process to exit
    await pool.end();
  }
}

// Run migration
runMigration();

