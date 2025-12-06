const { query, getRow } = require('../database/connection');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: './config.env' });

const addMorePlumberProviders = async () => {
  try {
    console.log('🔧 Starting to add 20 more plumber providers...');
    
    // Get the plumber service ID
    const plumberService = await getRow('SELECT id FROM services_master WHERE name = $1', ['plumber']);
    if (!plumberService) {
      throw new Error('Plumber service not found. Please ensure the service exists in services_master table.');
    }
    
    const serviceId = plumberService.id;
    console.log(`✅ Found plumber service with ID: ${serviceId}`);

    // Define 20 more test providers for plumber service
    // 7 from Bangalore (same city as user)
    // 5 from different cities in Karnataka (same state, different city)
    // 8 from different states
    const testProviders = [
      // 7 more providers from Bangalore, Karnataka (same city)
      {
        full_name: 'Anil Plumbing Works',
        email: 'anil@plumbing.com',
        phone: '9100000021',
        password: 'password123',
        experience_years: 9,
        hourly_rate: 480,
        description: 'Expert in all types of plumbing work. Quick and reliable service in Bangalore.',
        state: 'Karnataka',
        city: 'Bangalore',
        full_address: 'Marathahalli, Bangalore, Karnataka 560037',
        is_verified: true
      },
      {
        full_name: 'Girish Water Solutions',
        email: 'girish@water.com',
        phone: '9100000022',
        password: 'password123',
        experience_years: 11,
        hourly_rate: 540,
        description: 'Professional plumbing services with 11+ years of experience. Specialized in water tank installation.',
        state: 'Karnataka',
        city: 'Bangalore',
        full_address: 'Electronic City, Bangalore, Karnataka 560100',
        is_verified: true
      },
      {
        full_name: 'Naveen Pipe Repair',
        email: 'naveen@pipe.com',
        phone: '9100000023',
        password: 'password123',
        experience_years: 7,
        hourly_rate: 420,
        description: 'Expert in pipe repair and leakage fixing. Quick response time in Bangalore.',
        state: 'Karnataka',
        city: 'Bangalore',
        full_address: 'Bannerghatta Road, Bangalore, Karnataka 560076',
        is_verified: true
      },
      {
        full_name: 'Srinivas Plumbing Experts',
        email: 'srinivas@plumbing.com',
        phone: '9100000024',
        password: 'password123',
        experience_years: 10,
        hourly_rate: 510,
        description: 'Experienced plumber specializing in bathroom and kitchen plumbing. 10+ years in Bangalore.',
        state: 'Karnataka',
        city: 'Bangalore',
        full_address: 'Basavanagudi, Bangalore, Karnataka 560004',
        is_verified: true
      },
      {
        full_name: 'Vikram Tap Services',
        email: 'vikram@tap.com',
        phone: '9100000025',
        password: 'password123',
        experience_years: 8,
        hourly_rate: 440,
        description: 'Professional tap repair and installation services. Reliable and affordable.',
        state: 'Karnataka',
        city: 'Bangalore',
        full_address: 'Malleshwaram, Bangalore, Karnataka 560003',
        is_verified: true
      },
      {
        full_name: 'Arjun Water Works',
        email: 'arjun@water.com',
        phone: '9100000026',
        password: 'password123',
        experience_years: 12,
        hourly_rate: 560,
        description: 'Expert plumber with 12+ years experience. Specialized in commercial and residential projects.',
        state: 'Karnataka',
        city: 'Bangalore',
        full_address: 'Hebbal, Bangalore, Karnataka 560024',
        is_verified: true
      },
      {
        full_name: 'Manjunath Plumbing Solutions',
        email: 'manjunath@plumbing.com',
        phone: '9100000027',
        password: 'password123',
        experience_years: 6,
        hourly_rate: 410,
        description: 'Quick and efficient plumbing services. Expert in drainage work and pipe installation.',
        state: 'Karnataka',
        city: 'Bangalore',
        full_address: 'Yelahanka, Bangalore, Karnataka 560064',
        is_verified: true
      },
      
      // 5 more providers from different cities in Karnataka (same state, different city)
      {
        full_name: 'Davanagere Plumbing Services',
        email: 'davanagere@plumbing.com',
        phone: '9100000028',
        password: 'password123',
        experience_years: 8,
        hourly_rate: 390,
        description: 'Professional plumbing services in Davanagere. Expert in all types of plumbing work.',
        state: 'Karnataka',
        city: 'Davanagere',
        full_address: 'Gandhi Nagar, Davanagere, Karnataka 577001',
        is_verified: true
      },
      {
        full_name: 'Gulbarga Pipe Works',
        email: 'gulbarga@pipes.com',
        phone: '9100000029',
        password: 'password123',
        experience_years: 9,
        hourly_rate: 400,
        description: 'Reliable plumbing services in Gulbarga. Specialized in bathroom and kitchen plumbing.',
        state: 'Karnataka',
        city: 'Gulbarga',
        full_address: 'Super Market, Gulbarga, Karnataka 585101',
        is_verified: true
      },
      {
        full_name: 'Shimoga Water Solutions',
        email: 'shimoga@water.com',
        phone: '9100000030',
        password: 'password123',
        experience_years: 7,
        hourly_rate: 370,
        description: 'Expert plumber in Shimoga. Quick and efficient service for all plumbing needs.',
        state: 'Karnataka',
        city: 'Shimoga',
        full_address: 'Gandhi Bazaar, Shimoga, Karnataka 577201',
        is_verified: true
      },
      {
        full_name: 'Raichur Plumbing Experts',
        email: 'raichur@plumbing.com',
        phone: '9100000031',
        password: 'password123',
        experience_years: 10,
        hourly_rate: 410,
        description: 'Professional plumbing services in Raichur. Experienced in residential and commercial projects.',
        state: 'Karnataka',
        city: 'Raichur',
        full_address: 'Station Road, Raichur, Karnataka 584101',
        is_verified: true
      },
      {
        full_name: 'Bijapur Pipe Services',
        email: 'bijapur@pipes.com',
        phone: '9100000032',
        password: 'password123',
        experience_years: 8,
        hourly_rate: 390,
        description: 'Expert plumber in Bijapur. Specialized in water tank installation and pipe repair.',
        state: 'Karnataka',
        city: 'Bijapur',
        full_address: 'Gandhi Chowk, Bijapur, Karnataka 586101',
        is_verified: true
      },
      
      // 8 more providers from different states
      {
        full_name: 'Surat Plumbing Solutions',
        email: 'surat@plumbing.com',
        phone: '9100000033',
        password: 'password123',
        experience_years: 9,
        hourly_rate: 420,
        description: 'Professional plumbing services in Surat. Expert in all types of plumbing work.',
        state: 'Gujarat',
        city: 'Surat',
        full_address: 'Adajan, Surat, Gujarat 395009',
        is_verified: true
      },
      {
        full_name: 'Coimbatore Water Works',
        email: 'coimbatore@water.com',
        phone: '9100000034',
        password: 'password123',
        experience_years: 10,
        hourly_rate: 450,
        description: 'Reliable plumbing services in Coimbatore. Specialized in bathroom and kitchen plumbing.',
        state: 'Tamil Nadu',
        city: 'Coimbatore',
        full_address: 'RS Puram, Coimbatore, Tamil Nadu 641002',
        is_verified: true
      },
      {
        full_name: 'Vijayawada Pipe Experts',
        email: 'vijayawada@pipes.com',
        phone: '9100000035',
        password: 'password123',
        experience_years: 8,
        hourly_rate: 430,
        description: 'Expert plumber in Vijayawada. Quick and efficient service for all plumbing needs.',
        state: 'Andhra Pradesh',
        city: 'Vijayawada',
        full_address: 'Benz Circle, Vijayawada, Andhra Pradesh 520010',
        is_verified: true
      },
      {
        full_name: 'Lucknow Plumbing Services',
        email: 'lucknow@plumbing.com',
        phone: '9100000036',
        password: 'password123',
        experience_years: 11,
        hourly_rate: 480,
        description: 'Professional plumbing services in Lucknow. Experienced in residential and commercial projects.',
        state: 'Uttar Pradesh',
        city: 'Lucknow',
        full_address: 'Hazratganj, Lucknow, Uttar Pradesh 226001',
        is_verified: true
      },
      {
        full_name: 'Nagpur Water Solutions',
        email: 'nagpur@water.com',
        phone: '9100000037',
        password: 'password123',
        experience_years: 9,
        hourly_rate: 440,
        description: 'Expert plumber in Nagpur. Specialized in water tank installation and pipe repair.',
        state: 'Maharashtra',
        city: 'Nagpur',
        full_address: 'Sitabuldi, Nagpur, Maharashtra 440012',
        is_verified: true
      },
      {
        full_name: 'Indore Pipe Works',
        email: 'indore@pipes.com',
        phone: '9100000038',
        password: 'password123',
        experience_years: 7,
        hourly_rate: 400,
        description: 'Professional plumbing services in Indore. Expert in all types of plumbing work.',
        state: 'Madhya Pradesh',
        city: 'Indore',
        full_address: 'MG Road, Indore, Madhya Pradesh 452001',
        is_verified: true
      },
      {
        full_name: 'Chandigarh Plumbing Experts',
        email: 'chandigarh@plumbing.com',
        phone: '9100000039',
        password: 'password123',
        experience_years: 10,
        hourly_rate: 460,
        description: 'Reliable plumbing services in Chandigarh. Quick response time and quality service.',
        state: 'Chandigarh',
        city: 'Chandigarh',
        full_address: 'Sector 17, Chandigarh, Chandigarh 160017',
        is_verified: true
      },
      {
        full_name: 'Bhopal Water Services',
        email: 'bhopal@water.com',
        phone: '9100000040',
        password: 'password123',
        experience_years: 8,
        hourly_rate: 410,
        description: 'Expert plumber in Bhopal. Specialized in bathroom fitting and drainage work.',
        state: 'Madhya Pradesh',
        city: 'Bhopal',
        full_address: 'MP Nagar, Bhopal, Madhya Pradesh 462011',
        is_verified: true
      }
    ];

    let addedCount = 0;
    let skippedCount = 0;

    for (const provider of testProviders) {
      try {
        // Check if provider already exists
        const existingProvider = await getRow('SELECT id FROM users WHERE phone = $1', [provider.phone]);
        
        if (existingProvider) {
          console.log(`⏭️  Skipping ${provider.full_name} - already exists`);
          skippedCount++;
          continue;
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(provider.password, 12);

        // Insert user
        const userResult = await query(`
          INSERT INTO users (full_name, email, phone, password, role, is_verified)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id
        `, [
          provider.full_name,
          provider.email,
          provider.phone,
          hashedPassword,
          'provider',
          provider.is_verified
        ]);

        const userId = userResult.rows[0].id;

        // Insert provider profile
        const profileResult = await query(`
          INSERT INTO provider_profiles (
            user_id, years_of_experience, service_description, is_engineering_provider
          )
          VALUES ($1, $2, $3, $4)
          RETURNING id
        `, [
          userId,
          provider.experience_years,
          provider.description,
          false
        ]);

        const profileId = profileResult.rows[0].id;

        // Insert provider service
        await query(`
          INSERT INTO provider_services (
            provider_id, service_id, service_charge_value, service_charge_unit, payment_status,
            payment_start_date, payment_end_date
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
          profileId,
          serviceId,
          provider.hourly_rate,
          'hourly',
          'active',
          new Date(),
          new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year from now
        ]);

        // Insert address
        await query(`
          INSERT INTO addresses (user_id, type, state, city, full_address)
          VALUES ($1, $2, $3, $4, $5)
        `, [
          userId,
          'home',
          provider.state,
          provider.city,
          provider.full_address
        ]);

        console.log(`✅ Added provider: ${provider.full_name} (${provider.city}, ${provider.state})`);
        addedCount++;

      } catch (error) {
        console.error(`❌ Error adding provider ${provider.full_name}:`, error.message);
      }
    }

    // Verify providers were added
    const addedProviders = await query(`
      SELECT 
        u.full_name, 
        u.phone, 
        a.city, 
        a.state,
        ps.service_charge_value,
        pp.years_of_experience
      FROM provider_profiles pp
      JOIN users u ON pp.user_id = u.id
      JOIN provider_services ps ON pp.id = ps.provider_id
      JOIN services_master sm ON ps.service_id = sm.id
      LEFT JOIN addresses a ON a.user_id = u.id AND a.type = 'home'
      WHERE sm.name = 'plumber' AND u.phone LIKE '91000000%'
      ORDER BY a.state, a.city, u.full_name
    `);

    console.log('\n📊 Summary:');
    console.log(`✅ Successfully added: ${addedCount} providers`);
    console.log(`⏭️  Skipped (already exists): ${skippedCount} providers`);
    console.log(`\n📋 Total plumber providers in database: ${addedProviders.rows.length}`);
    
    // Group by location
    const byLocation = {};
    addedProviders.rows.forEach(provider => {
      const key = `${provider.city || 'Unknown'}, ${provider.state || 'Unknown'}`;
      if (!byLocation[key]) {
        byLocation[key] = [];
      }
      byLocation[key].push(provider);
    });

    console.log('\n📍 Providers by location:');
    Object.keys(byLocation).sort().forEach(location => {
      console.log(`  ${location}: ${byLocation[location].length} providers`);
    });

  } catch (error) {
    console.error('❌ Failed to add plumber providers:', error);
    throw error;
  }
};

if (require.main === module) {
  addMorePlumberProviders()
    .then(() => {
      console.log('\n✅ Additional plumber providers addition completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Additional plumber providers addition failed:', error);
      process.exit(1);
    });
}

module.exports = { addMorePlumberProviders };

