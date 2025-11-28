const { query, getRow, getRows } = require('../database/connection');
require('dotenv').config({ path: './config.env' });

/**
 * Script to add registered services for provider "Req"
 * Registers provider for: borewell and cleaning services
 */
const addReqProviderServices = async () => {
  try {
    console.log('🔍 Looking for provider "Req"...');

    // Find provider user with name "Req"
    const providerUser = await getRow(
      `SELECT id, full_name, phone, role 
       FROM users 
       WHERE LOWER(full_name) LIKE '%req%' AND role = 'provider'
       LIMIT 1`
    );

    if (!providerUser) {
      console.error('❌ Provider "Req" not found. Please check the provider name.');
      process.exit(1);
    }

    console.log('✅ Found provider:', {
      id: providerUser.id,
      name: providerUser.full_name,
      phone: providerUser.phone
    });

    // Get or create provider profile
    let providerProfile = await getRow(
      'SELECT * FROM provider_profiles WHERE user_id = $1',
      [providerUser.id]
    );

    if (!providerProfile) {
      console.log('📝 Creating provider profile...');
      const profileResult = await query(
        `INSERT INTO provider_profiles (user_id, years_of_experience, service_description)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [providerUser.id, 5, 'Professional service provider']
      );
      providerProfile = profileResult.rows[0];
      console.log('✅ Created provider profile');
    } else {
      console.log('✅ Provider profile exists');
    }

    // Get service IDs for borewell and cleaning
    const services = await getRows(
      `SELECT id, name FROM services_master 
       WHERE name IN ('borewell', 'cleaning')
       ORDER BY name`
    );

    if (services.length === 0) {
      console.error('❌ Services "borewell" or "cleaning" not found in database');
      process.exit(1);
    }

    console.log('📋 Found services:', services.map(s => s.name).join(', '));

    // Register provider for each service
    for (const service of services) {
      // Check if already registered
      const existingRegistration = await getRow(
        `SELECT id FROM provider_services 
         WHERE provider_id = $1 AND service_id = $2`,
        [providerProfile.id, service.id]
      );

      if (existingRegistration) {
        console.log(`⚠️  Provider already registered for "${service.name}", updating to active...`);
        
        // Update to active status
        await query(
          `UPDATE provider_services
           SET payment_status = 'active',
               payment_start_date = CURRENT_DATE,
               payment_end_date = CURRENT_DATE + INTERVAL '365 days',
               service_charge_value = 500,
               service_charge_unit = 'per service'
           WHERE id = $1`,
          [existingRegistration.id]
        );
        console.log(`✅ Updated registration for "${service.name}" to active`);
      } else {
        console.log(`📝 Registering provider for "${service.name}"...`);
        
        // Create new registration with active status
        const startDate = new Date();
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + 365); // 1 year validity

        await query(
          `INSERT INTO provider_services 
           (provider_id, service_id, service_charge_value, service_charge_unit, 
            payment_status, payment_start_date, payment_end_date, working_proof_urls)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            providerProfile.id,
            service.id,
            500, // service charge value
            'per service', // service charge unit
            'active', // payment status
            startDate, // payment start date
            endDate, // payment end date
            [] // empty working proof URLs array
          ]
        );
        console.log(`✅ Registered provider for "${service.name}"`);
      }
    }

    // Verify registrations
    const registeredServices = await getRows(
      `SELECT sm.name, ps.payment_status, ps.service_charge_value, ps.service_charge_unit
       FROM provider_services ps
       JOIN services_master sm ON ps.service_id = sm.id
       WHERE ps.provider_id = $1 AND sm.name IN ('borewell', 'cleaning')
       ORDER BY sm.name`,
      [providerProfile.id]
    );

    console.log('\n✅ Registration Summary:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    registeredServices.forEach(rs => {
      console.log(`Service: ${rs.name}`);
      console.log(`  Status: ${rs.payment_status}`);
      console.log(`  Charge: ₹${rs.service_charge_value} ${rs.service_charge_unit}`);
      console.log('');
    });

    console.log('✅ Successfully registered provider "Req" for borewell and cleaning services!');
    console.log('👀 You can now see this provider in userApp when browsing these services.');

  } catch (error) {
    console.error('❌ Error adding provider services:', error);
    process.exit(1);
  }
};

// Run if called directly
if (require.main === module) {
  addReqProviderServices()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('Script failed:', error);
      process.exit(1);
    });
}

module.exports = { addReqProviderServices };

