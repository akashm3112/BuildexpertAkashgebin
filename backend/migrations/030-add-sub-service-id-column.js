const { query } = require('../database/connection');

/**
 * Migration 030: Add sub_service_id column to provider_sub_services table
 * 
 * This migration adds a TEXT column to store frontend sub-service IDs
 * (like 'room-painting', 'fancy-wall-painting', etc.) that don't exist
 * as separate services in services_master.
 * 
 * The service_id column will remain for backward compatibility but
 * will store the main service ID instead of sub-service ID.
 */
const addSubServiceIdColumn = async () => {
  try {
    console.log('🔄 Starting migration: Add sub_service_id column to provider_sub_services...');

    // Check if column already exists
    const columnExists = await query(`
      SELECT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'provider_sub_services' 
        AND column_name = 'sub_service_id'
      );
    `);

    if (columnExists.rows[0].exists) {
      console.log('  ✅ Column sub_service_id already exists, skipping...');
      return { success: true };
    }

    // Add sub_service_id column
    await query(`
      ALTER TABLE provider_sub_services 
      ADD COLUMN sub_service_id TEXT;
    `);
    console.log('  ✅ Added sub_service_id column');

    // Create index on sub_service_id for faster lookups
    await query(`
      CREATE INDEX IF NOT EXISTS idx_provider_sub_services_sub_service_id 
      ON provider_sub_services(sub_service_id);
    `);
    console.log('  ✅ Added index on sub_service_id');

    // Update unique constraint to include sub_service_id
    // First, drop the old unique constraint if it exists
    await query(`
      ALTER TABLE provider_sub_services 
      DROP CONSTRAINT IF EXISTS provider_sub_services_provider_service_id_service_id_key;
    `);
    console.log('  ✅ Dropped old unique constraint');

    // Add new unique constraint on (provider_service_id, sub_service_id)
    await query(`
      ALTER TABLE provider_sub_services 
      ADD CONSTRAINT provider_sub_services_provider_service_id_sub_service_id_key 
      UNIQUE (provider_service_id, sub_service_id);
    `);
    console.log('  ✅ Added new unique constraint on (provider_service_id, sub_service_id)');

    // Make service_id nullable since we're now using sub_service_id
    await query(`
      ALTER TABLE provider_sub_services 
      ALTER COLUMN service_id DROP NOT NULL;
    `);
    console.log('  ✅ Made service_id nullable');

    console.log('');
    console.log('✅ Migration 030 completed: Added sub_service_id column to provider_sub_services');
    console.log('📝 Note: service_id is now nullable and sub_service_id stores the frontend sub-service ID');

    return { success: true };
  } catch (error) {
    console.error('❌ Migration 030 failed:', error);
    throw error;
  }
};

module.exports = addSubServiceIdColumn;

// Run migration if called directly
if (require.main === module) {
  addSubServiceIdColumn()
    .then(() => {
      console.log('✅ Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    });
}

