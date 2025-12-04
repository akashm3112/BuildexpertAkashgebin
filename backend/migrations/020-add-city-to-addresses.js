const { query } = require('../database/connection');

/**
 * Migration: Add city column to addresses table
 * 
 * This migration:
 * 1. Checks if city column exists in addresses table
 * 2. Adds city column if it doesn't exist
 * 3. Ensures the column is properly configured
 */
const addCityToAddresses = async () => {
  try {
    console.log('🔄 Starting city column migration for addresses table...');

    // Check if city column already exists
    const columnExists = await query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'addresses' 
      AND column_name = 'city'
    `);

    if (columnExists.rows.length === 0) {
      console.log('📝 Adding city column to addresses table...');
      
      // Add city column
      await query(`
        ALTER TABLE addresses 
        ADD COLUMN city TEXT
      `);
      
      console.log('✅ Successfully added city column to addresses table');
    } else {
      console.log('ℹ️  City column already exists in addresses table');
    }

    console.log('✅ City column migration completed successfully');
    return { success: true };
  } catch (error) {
    console.error('❌ Error in city column migration:', error);
    return { success: false, error: error.message };
  }
};

module.exports = addCityToAddresses;

// Run if called directly
if (require.main === module) {
  addCityToAddresses()
    .then(result => {
      if (result.success) {
        console.log('✅ Migration completed successfully');
        process.exit(0);
      } else {
        console.error('❌ Migration failed:', result.error);
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('❌ Migration error:', error);
      process.exit(1);
    });
}

