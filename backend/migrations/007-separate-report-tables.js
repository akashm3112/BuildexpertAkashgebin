const { query, pool } = require('../database/connection');

async function migrateReportTables() {
  try {
    console.log('🔄 Separating report tables migration...\n');

    // Step 1: Create new table for provider reports (providers reporting users)
    console.log('📋 Step 1: Creating provider_reports_users table...');
    await query(`
      CREATE TABLE IF NOT EXISTS provider_reports_users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        provider_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        customer_name TEXT NOT NULL,
        customer_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        incident_date DATE NOT NULL,
        incident_time TIME,
        incident_type TEXT NOT NULL,
        description TEXT NOT NULL,
        evidence JSONB,
        status TEXT CHECK (status IN ('open', 'resolved', 'closed')) DEFAULT 'open',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    console.log('✅ provider_reports_users table created');

    // Create indexes
    console.log('📋 Creating indexes for provider_reports_users...');
    await query(`
      CREATE INDEX IF NOT EXISTS idx_provider_reports_users_provider 
      ON provider_reports_users(provider_id);
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_provider_reports_users_customer 
      ON provider_reports_users(customer_user_id);
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_provider_reports_users_status 
      ON provider_reports_users(status);
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_provider_reports_users_created 
      ON provider_reports_users(created_at DESC);
    `);
    console.log('✅ Indexes created');

    // Step 2: Rename existing provider_reports to user_reports_providers
    console.log('\n📋 Step 2: Renaming provider_reports to user_reports_providers...');
    
    // Check if user_reports_providers already exists
    const tableCheck = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'user_reports_providers'
      );
    `);
    
    if (!tableCheck.rows[0].exists) {
      await query(`ALTER TABLE provider_reports RENAME TO user_reports_providers;`);
      console.log('✅ Table renamed to user_reports_providers');
    } else {
      console.log('⚠️  user_reports_providers already exists, skipping rename');
    }

    // Step 3: Update indexes and constraints for renamed table
    console.log('\n📋 Step 3: Updating indexes for user_reports_providers...');
    
    // Drop old indexes if they exist and create new ones
    await query(`DROP INDEX IF EXISTS idx_provider_reports_status;`);
    await query(`DROP INDEX IF EXISTS idx_provider_reports_created;`);
    
    await query(`
      CREATE INDEX IF NOT EXISTS idx_user_reports_providers_reporter 
      ON user_reports_providers(reported_by_user_id);
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_user_reports_providers_provider 
      ON user_reports_providers(reported_provider_id);
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_user_reports_providers_status 
      ON user_reports_providers(status);
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_user_reports_providers_created 
      ON user_reports_providers(created_at DESC);
    `);
    console.log('✅ Indexes updated');

    // Step 4: Create a view for backward compatibility (optional)
    console.log('\n📋 Step 4: Creating compatibility view...');
    await query(`
      CREATE OR REPLACE VIEW provider_reports AS
      SELECT * FROM user_reports_providers;
    `);
    console.log('✅ Compatibility view created');

    console.log('\n✅ Migration completed successfully!\n');
    console.log('📊 Summary:');
    console.log('   ✅ provider_reports_users - NEW table for providers reporting users');
    console.log('   ✅ user_reports_providers - RENAMED from provider_reports');
    console.log('   ✅ provider_reports - VIEW for backward compatibility');
    console.log('   ✅ All indexes created');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run migration
migrateReportTables()
  .then(() => {
    console.log('\n🎉 Migration script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Migration script failed:', error);
    process.exit(1);
  });

