const { query, getRow } = require('../database/connection');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: './config.env' });

const addPlumberProviders = async () => {
  try {
    console.log('🔧 Starting to add plumber providers...');
    
    // Get the plumber service ID
    const plumberService = await getRow('SELECT id FROM services_master WHERE name = $1', ['plumber']);
    if (!plumberService) {
      throw new Error('Plumber service not found. Please ensure the service exists in services_master table.');
    }
    
    const serviceId = plumberService.id;
    console.log(`✅ Found plumber service with ID: ${serviceId}`);

    // Define 20 test providers for plumber service
    // 7 from Bangalore (same city as user)
    // 5 from different cities in Karnataka (same state, different city)
    // 8 from different states
    const testProviders = [
      // 7 providers from Bangalore, Karnataka (same city)
      {
        full_name: 'Ramesh Plumbing Services',
        email: 'ramesh@plumbing.com',
        phone: '9100000001',
        password: 'password123',
        experience_years: 8,
        hourly_rate: 450,
        description: 'Expert in tap repair, pipe leakage, and bathroom fitting. 8+ years of experience in Bangalore.',
        state: 'Karnataka',
        city: 'Bangalore',
        full_address: 'Indiranagar, Bangalore, Karnataka 560038',
        is_verified: true
      },
      {
        full_name: 'Kumar Pipe Solutions',
        email: 'kumar@pipes.com',
        phone: '9100000002',
        password: 'password123',
        experience_years: 12,
        hourly_rate: 550,
        description: 'Professional plumbing services including water tank installation and drainage work. 12+ years experience.',
        state: 'Karnataka',
        city: 'Bangalore',
        full_address: 'Koramangala, Bangalore, Karnataka 560095',
        is_verified: true
      },
      {
        full_name: 'Suresh Water Works',
        email: 'suresh@waterworks.com',
        phone: '9100000003',
        password: 'password123',
        experience_years: 6,
        hourly_rate: 400,
        description: 'Quick and reliable plumbing services for residential and commercial properties.',
        state: 'Karnataka',
        city: 'Bangalore',
        full_address: 'Whitefield, Bangalore, Karnataka 560066',
        is_verified: true
      },
      {
        full_name: 'Venkatesh Plumbing Experts',
        email: 'venkatesh@plumbing.com',
        phone: '9100000004',
        password: 'password123',
        experience_years: 10,
        hourly_rate: 500,
        description: 'Specialized in bathroom fitting and kitchen sink installation. Expert plumber with 10+ years.',
        state: 'Karnataka',
        city: 'Bangalore',
        full_address: 'HSR Layout, Bangalore, Karnataka 560102',
        is_verified: true
      },
      {
        full_name: 'Rajesh Tap Repair Services',
        email: 'rajesh@taprepair.com',
        phone: '9100000005',
        password: 'password123',
        experience_years: 7,
        hourly_rate: 425,
        description: 'Expert in tap repair and pipe leakage. Quick response time and quality service.',
        state: 'Karnataka',
        city: 'Bangalore',
        full_address: 'BTM Layout, Bangalore, Karnataka 560076',
        is_verified: true
      },
      {
        full_name: 'Mohan Plumbing Solutions',
        email: 'mohan@plumbing.com',
        phone: '9100000006',
        password: 'password123',
        experience_years: 9,
        hourly_rate: 475,
        description: 'Professional plumbing services for all types of residential and commercial needs.',
        state: 'Karnataka',
        city: 'Bangalore',
        full_address: 'Jayanagar, Bangalore, Karnataka 560011',
        is_verified: true
      },
      {
        full_name: 'Prakash Water Solutions',
        email: 'prakash@water.com',
        phone: '9100000007',
        password: 'password123',
        experience_years: 11,
        hourly_rate: 525,
        description: 'Experienced plumber specializing in water tank installation and drainage systems.',
        state: 'Karnataka',
        city: 'Bangalore',
        full_address: 'Rajajinagar, Bangalore, Karnataka 560010',
        is_verified: true
      },
      
      // 5 providers from different cities in Karnataka (same state, different city)
      {
        full_name: 'Mysore Plumbing Services',
        email: 'mysore@plumbing.com',
        phone: '9100000008',
        password: 'password123',
        experience_years: 8,
        hourly_rate: 400,
        description: 'Professional plumbing services in Mysore. Expert in all types of plumbing work.',
        state: 'Karnataka',
        city: 'Mysore',
        full_address: 'Vijayanagar, Mysore, Karnataka 570017',
        is_verified: true
      },
      {
        full_name: 'Mangalore Pipe Works',
        email: 'mangalore@pipes.com',
        phone: '9100000009',
        password: 'password123',
        experience_years: 10,
        hourly_rate: 450,
        description: 'Reliable plumbing services in Mangalore. Specialized in bathroom and kitchen plumbing.',
        state: 'Karnataka',
        city: 'Mangalore',
        full_address: 'Kadri, Mangalore, Karnataka 575003',
        is_verified: true
      },
      {
        full_name: 'Hubli Water Solutions',
        email: 'hubli@water.com',
        phone: '9100000010',
        password: 'password123',
        experience_years: 7,
        hourly_rate: 380,
        description: 'Expert plumber in Hubli. Quick and efficient service for all plumbing needs.',
        state: 'Karnataka',
        city: 'Hubli',
        full_address: 'Vidyanagar, Hubli, Karnataka 580021',
        is_verified: true
      },
      {
        full_name: 'Tumkur Plumbing Experts',
        email: 'tumkur@plumbing.com',
        phone: '9100000011',
        password: 'password123',
        experience_years: 9,
        hourly_rate: 420,
        description: 'Professional plumbing services in Tumkur. Experienced in residential and commercial projects.',
        state: 'Karnataka',
        city: 'Tumkur',
        full_address: 'B.H. Road, Tumkur, Karnataka 572101',
        is_verified: true
      },
      {
        full_name: 'Belagavi Pipe Services',
        email: 'belagavi@pipes.com',
        phone: '9100000012',
        password: 'password123',
        experience_years: 11,
        hourly_rate: 440,
        description: 'Expert plumber in Belagavi. Specialized in water tank installation and pipe repair.',
        state: 'Karnataka',
        city: 'Belagavi',
        full_address: 'Khanapur Road, Belagavi, Karnataka 590001',
        is_verified: true
      },
      
      // 8 providers from different states
      {
        full_name: 'Mumbai Plumbing Solutions',
        email: 'mumbai@plumbing.com',
        phone: '9100000013',
        password: 'password123',
        experience_years: 12,
        hourly_rate: 600,
        description: 'Professional plumbing services in Mumbai. Expert in all types of plumbing work.',
        state: 'Maharashtra',
        city: 'Mumbai',
        full_address: 'Andheri, Mumbai, Maharashtra 400053',
        is_verified: true
      },
      {
        full_name: 'Chennai Water Works',
        email: 'chennai@water.com',
        phone: '9100000014',
        password: 'password123',
        experience_years: 9,
        hourly_rate: 500,
        description: 'Reliable plumbing services in Chennai. Specialized in bathroom and kitchen plumbing.',
        state: 'Tamil Nadu',
        city: 'Chennai',
        full_address: 'T. Nagar, Chennai, Tamil Nadu 600017',
        is_verified: true
      },
      {
        full_name: 'Hyderabad Pipe Experts',
        email: 'hyderabad@pipes.com',
        phone: '9100000015',
        password: 'password123',
        experience_years: 10,
        hourly_rate: 480,
        description: 'Expert plumber in Hyderabad. Quick and efficient service for all plumbing needs.',
        state: 'Telangana',
        city: 'Hyderabad',
        full_address: 'Gachibowli, Hyderabad, Telangana 500032',
        is_verified: true
      },
      {
        full_name: 'Delhi Plumbing Services',
        email: 'delhi@plumbing.com',
        phone: '9100000016',
        password: 'password123',
        experience_years: 11,
        hourly_rate: 550,
        description: 'Professional plumbing services in Delhi. Experienced in residential and commercial projects.',
        state: 'Delhi',
        city: 'New Delhi',
        full_address: 'Connaught Place, New Delhi, Delhi 110001',
        is_verified: true
      },
      {
        full_name: 'Pune Water Solutions',
        email: 'pune@water.com',
        phone: '9100000017',
        password: 'password123',
        experience_years: 8,
        hourly_rate: 450,
        description: 'Expert plumber in Pune. Specialized in water tank installation and pipe repair.',
        state: 'Maharashtra',
        city: 'Pune',
        full_address: 'Hinjewadi, Pune, Maharashtra 411057',
        is_verified: true
      },
      {
        full_name: 'Kolkata Pipe Works',
        email: 'kolkata@pipes.com',
        phone: '9100000018',
        password: 'password123',
        experience_years: 9,
        hourly_rate: 420,
        description: 'Professional plumbing services in Kolkata. Expert in all types of plumbing work.',
        state: 'West Bengal',
        city: 'Kolkata',
        full_address: 'Salt Lake, Kolkata, West Bengal 700064',
        is_verified: true
      },
      {
        full_name: 'Ahmedabad Plumbing Experts',
        email: 'ahmedabad@plumbing.com',
        phone: '9100000019',
        password: 'password123',
        experience_years: 7,
        hourly_rate: 400,
        description: 'Reliable plumbing services in Ahmedabad. Quick response time and quality service.',
        state: 'Gujarat',
        city: 'Ahmedabad',
        full_address: 'Navrangpura, Ahmedabad, Gujarat 380009',
        is_verified: true
      },
      {
        full_name: 'Jaipur Water Services',
        email: 'jaipur@water.com',
        phone: '9100000020',
        password: 'password123',
        experience_years: 10,
        hourly_rate: 430,
        description: 'Expert plumber in Jaipur. Specialized in bathroom fitting and drainage work.',
        state: 'Rajasthan',
        city: 'Jaipur',
        full_address: 'Malviya Nagar, Jaipur, Rajasthan 302017',
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
  addPlumberProviders()
    .then(() => {
      console.log('\n✅ Plumber providers addition completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Plumber providers addition failed:', error);
      process.exit(1);
    });
}

module.exports = { addPlumberProviders };

