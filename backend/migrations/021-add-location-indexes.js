const { query } = require('../database/connection');

/**
 * Add indexes for location-based sorting optimization
 * This migration adds indexes on addresses.city and addresses.state
 * to optimize location-based provider sorting queries
 */
const addLocationIndexes = async () => {
  try {
    console.log('🔄 Starting location indexes migration...');

    // Add indexes for city and state columns (lowercased for case-insensitive matching)
    // These indexes will significantly speed up location-based sorting queries
    
    // Index on state (most common filter)
    await query(`
      CREATE INDEX IF NOT EXISTS idx_addresses_state_lower 
      ON addresses(LOWER(TRIM(COALESCE(state, ''))));
    `);
    console.log('✅ Added index on addresses.state (lowercased)');

    // Index on city (for city-based filtering)
    await query(`
      CREATE INDEX IF NOT EXISTS idx_addresses_city_lower 
      ON addresses(LOWER(TRIM(COALESCE(city, ''))));
    `);
    console.log('✅ Added index on addresses.city (lowercased)');

    // Composite index for city + state lookups (most efficient for same city queries)
    await query(`
      CREATE INDEX IF NOT EXISTS idx_addresses_city_state_lower 
      ON addresses(LOWER(TRIM(COALESCE(city, ''))), LOWER(TRIM(COALESCE(state, ''))));
    `);
    console.log('✅ Added composite index on addresses(city, state) (lowercased)');

    // Index on user_id + type for faster address lookups
    await query(`
      CREATE INDEX IF NOT EXISTS idx_addresses_user_type 
      ON addresses(user_id, type);
    `);
    console.log('✅ Added composite index on addresses(user_id, type)');

    console.log('✅ Location indexes migration completed successfully');
    return { success: true };
  } catch (error) {
    console.error('❌ Error in location indexes migration:', error);
    return { success: false, error: error.message };
  }
};

module.exports = addLocationIndexes;

