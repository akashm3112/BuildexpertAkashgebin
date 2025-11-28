const { query, pool } = require('../database/connection');

async function migrateReportTables() {
  try {

    // Step 1: Create new table for provider reports (providers reporting users)
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

    // Create indexes
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

    // Step 2: Create or rename user_reports_providers table
    
    // Check if user_reports_providers already exists
    const userReportsCheck = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'user_reports_providers'
      );
    `);
    
    // Check if provider_reports exists (old table name)
    const providerReportsCheck = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'provider_reports'
      );
    `);
    
    if (!userReportsCheck.rows[0].exists) {
      if (providerReportsCheck.rows[0].exists) {
        // Rename existing table
        await query(`ALTER TABLE provider_reports RENAME TO user_reports_providers;`);
      } else {
        // Create new table if neither exists
        await query(`
          CREATE TABLE IF NOT EXISTS user_reports_providers (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            reported_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            reported_provider_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
      }
    } else {
    }

    // Step 3: Update indexes and constraints for renamed table
    
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

    // Step 4: Create a view for backward compatibility (optional)
    await query(`
      CREATE OR REPLACE VIEW provider_reports AS
      SELECT * FROM user_reports_providers;
    `);
    

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error);
    throw error;
  }
}

module.exports = migrateReportTables;

// Run migration if called directly
if (require.main === module) {
  migrateReportTables()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Migration script failed:', error);
      process.exit(1);
    });
}




