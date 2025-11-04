const { query } = require('../database/connection');

/**
 * Migration: Add missing columns to provider_profiles table
 * This migration adds columns that are referenced in queries but missing from the table
 */
const addMissingProviderColumns = async () => {
  try {
    console.log('🚀 Starting migration to add missing provider_profiles columns...');

    // Add state column (used for filtering providers by state)
    await query(`
      ALTER TABLE provider_profiles 
      ADD COLUMN IF NOT EXISTS state TEXT
    `);
    console.log('✅ Added state column to provider_profiles');

    // Add city column (useful for location-based queries)
    await query(`
      ALTER TABLE provider_profiles 
      ADD COLUMN IF NOT EXISTS city TEXT
    `);
    console.log('✅ Added city column to provider_profiles');

    // Add business_name column (used in admin queries)
    await query(`
      ALTER TABLE provider_profiles 
      ADD COLUMN IF NOT EXISTS business_name TEXT
    `);
    console.log('✅ Added business_name column to provider_profiles');

    // Add experience_years column (alias/synonym for years_of_experience, used in admin)
    // Note: We'll keep years_of_experience as the main column, but add experience_years for compatibility
    // Actually, admin queries use experience_years but the table has years_of_experience
    // We'll add a computed column or just note that the query should use years_of_experience
    // For now, let's add experience_years as a separate column that can be synced
    await query(`
      ALTER TABLE provider_profiles 
      ADD COLUMN IF NOT EXISTS experience_years INT
    `);
    console.log('✅ Added experience_years column to provider_profiles');

    // Add rating column (average rating for the provider)
    await query(`
      ALTER TABLE provider_profiles 
      ADD COLUMN IF NOT EXISTS rating DECIMAL(3,2) DEFAULT 0
    `);
    console.log('✅ Added rating column to provider_profiles');

    // Add total_reviews column (count of reviews)
    await query(`
      ALTER TABLE provider_profiles 
      ADD COLUMN IF NOT EXISTS total_reviews INT DEFAULT 0
    `);
    console.log('✅ Added total_reviews column to provider_profiles');

    // Create indexes for better query performance
    await query(`
      CREATE INDEX IF NOT EXISTS idx_provider_profiles_state ON provider_profiles(state);
      CREATE INDEX IF NOT EXISTS idx_provider_profiles_city ON provider_profiles(city);
      CREATE INDEX IF NOT EXISTS idx_provider_profiles_rating ON provider_profiles(rating);
    `);
    console.log('✅ Created indexes for new columns');

    // Sync experience_years with years_of_experience for existing records
    await query(`
      UPDATE provider_profiles 
      SET experience_years = years_of_experience 
      WHERE experience_years IS NULL AND years_of_experience IS NOT NULL
    `);
    console.log('✅ Synced experience_years with years_of_experience');

    // Create a function to automatically sync experience_years when years_of_experience changes
    await query(`
      CREATE OR REPLACE FUNCTION sync_provider_experience()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.years_of_experience IS NOT NULL THEN
          NEW.experience_years := NEW.years_of_experience;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Create trigger to auto-sync experience_years
    await query(`
      DROP TRIGGER IF EXISTS trigger_sync_experience ON provider_profiles;
      CREATE TRIGGER trigger_sync_experience
      BEFORE INSERT OR UPDATE ON provider_profiles
      FOR EACH ROW
      EXECUTE FUNCTION sync_provider_experience();
    `);
    console.log('✅ Created trigger to sync experience_years');

    console.log('🎉 Migration completed successfully!');
    
    return { success: true };
  } catch (error) {
    console.error('❌ Error in migration:', error);
    throw error;
  }
};

module.exports = addMissingProviderColumns;

// Run migration if called directly
if (require.main === module) {
  addMissingProviderColumns()
    .then(() => {
      console.log('✅ Migration completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    });
}

