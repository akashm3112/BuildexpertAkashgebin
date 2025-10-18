const { query, getRow } = require('../database/connection');
require('dotenv').config({ path: './config.env' });

const addGlassMirrorService = async () => {
  try {
    console.log('🔧 Adding Glass & Mirror service to database...');

    // Check if glass-mirror service already exists
    const existingService = await getRow('SELECT * FROM services_master WHERE name = $1', ['glass-mirror']);
    
    if (existingService) {
      console.log('✅ Glass & Mirror service already exists in database');
      console.log(`   Service ID: ${existingService.id}`);
      console.log(`   Service Name: ${existingService.name}`);
      console.log(`   Is Paid: ${existingService.is_paid}`);
      return existingService;
    }

    // Insert the glass-mirror service
    const result = await query(`
      INSERT INTO services_master (name, is_paid)
      VALUES ($1, $2)
      RETURNING *
    `, ['glass-mirror', true]);

    const newService = result.rows[0];
    console.log('✅ Glass & Mirror service added successfully!');
    console.log(`   Service ID: ${newService.id}`);
    console.log(`   Service Name: ${newService.name}`);
    console.log(`   Is Paid: ${newService.is_paid}`);
    console.log(`   Created At: ${newService.created_at}`);

    // Verify the service was added
    const verification = await getRow('SELECT * FROM services_master WHERE name = $1', ['glass-mirror']);
    if (verification) {
      console.log('✅ Verification successful: Service is now available in database');
    } else {
      console.log('❌ Verification failed: Service not found after insertion');
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
      console.log('🎉 Glass & Mirror service migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Glass & Mirror service migration failed:', error);
      process.exit(1);
    });
}

module.exports = { addGlassMirrorService };
