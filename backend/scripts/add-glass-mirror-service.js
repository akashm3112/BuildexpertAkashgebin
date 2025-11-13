const { query, getRow } = require('../database/connection');
require('dotenv').config({ path: './config.env' });

const addGlassMirrorService = async () => {
  try {

    // Check if glass-mirror service already exists
    const existingService = await getRow('SELECT * FROM services_master WHERE name = $1', ['glass-mirror']);
    
    if (existingService) {
      
      return existingService;
    }

    // Insert the glass-mirror service
    const result = await query(`
      INSERT INTO services_master (name, is_paid)
      VALUES ($1, $2)
      RETURNING *
    `, ['glass-mirror', true]);

    const newService = result.rows[0];
    
    // Verify the service was added
    const verification = await getRow('SELECT * FROM services_master WHERE name = $1', ['glass-mirror']);
    if (verification) {
    } else {
    }

    return newService;

  } catch (error) {
    console.error('❌ Failed to add Glass & Mirror service:', error);
    throw error;
  }
};

// Run migration if this file is executed directly
if (require.main === module) {
  addGlassMirrorService()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Glass & Mirror service migration failed:', error);
      process.exit(1);
    });
}

module.exports = { addGlassMirrorService };
