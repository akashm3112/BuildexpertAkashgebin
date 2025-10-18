const { query, getRows } = require('../database/connection');
require('dotenv').config({ path: '../config.env' });

const seedServices = async () => {
  try {
    console.log('🌱 Starting service seeding...');

    // Define services to insert
    const services = [
      { name: 'plumber', is_paid: true },
      { name: 'mason-mastri', is_paid: true },
      { name: 'painting-cleaning', is_paid: true },
      { name: 'granite-tiles', is_paid: true },
      { name: 'engineer-interior', is_paid: true },
      { name: 'electrician', is_paid: true },
      { name: 'carpenter', is_paid: true },
      { name: 'labors', is_paid: false },
      { name: 'painter', is_paid: true },
      { name: 'interiors-building', is_paid: true },
      { name: 'stainless-steel', is_paid: true },
      { name: 'contact-building', is_paid: true },
      { name: 'glass-mirror', is_paid: true }
    ];

    // Check existing services
    const existingServices = await getRows('SELECT name FROM services_master');
    console.log(`Found ${existingServices.length} existing services`);

    // Insert services that don't exist
    let insertedCount = 0;
    for (const service of services) {
      const exists = existingServices.some(existing => existing.name === service.name);
      if (!exists) {
        await query(`
          INSERT INTO services_master (name, is_paid)
          VALUES ($1, $2)
        `, [service.name, service.is_paid]);
        console.log(`✅ Inserted: ${service.name}`);
        insertedCount++;
      } else {
        console.log(`⏭️  Already exists: ${service.name}`);
      }
    }

    // Verify final state
    const finalServices = await getRows('SELECT id, name, is_paid FROM services_master ORDER BY name');
    console.log(`\n🎉 Service seeding completed!`);
    console.log(`Total services in database: ${finalServices.length}`);
    console.log(`New services inserted: ${insertedCount}`);

    return finalServices;

  } catch (error) {
    console.error('❌ Service seeding failed:', error);
    throw error;
  }
};

// Run seeding if this file is executed directly
if (require.main === module) {
  seedServices()
    .then(() => {
      console.log('Service seeding completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Service seeding failed:', error);
      process.exit(1);
    });
}

module.exports = { seedServices }; 