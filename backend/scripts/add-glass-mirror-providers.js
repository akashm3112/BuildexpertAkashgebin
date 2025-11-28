const { query, getRow } = require('../database/connection');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: './config.env' });

const addGlassMirrorProviders = async () => {
  try {
    
    // Get the glass-mirror service ID
    const glassMirrorService = await getRow('SELECT id FROM services_master WHERE name = $1', ['glass-mirror']);
    if (!glassMirrorService) {
      throw new Error('Glass-mirror service not found. Please run add-glass-mirror-service.js first.');
    }
    
    const serviceId = glassMirrorService.id;

    // Define test providers for glass-mirror service
    const testProviders = [
      {
        full_name: 'Rajesh Glass Works',
        email: 'rajesh@glassworks.com',
        phone: '9876543211',
        password: 'password123',
        service_name: 'glass-mirror',
        experience_years: 8,
        hourly_rate: 450,
        description: 'Expert in mirror installation, glass door fitting, and window glass replacement. 8+ years experience.',
        state: 'Telangana',
        city: 'Hyderabad',
        locality: 'Gachibowli',
        pincode: '500032',
        full_address: 'Gachibowli, Hyderabad, Telangana 500032',
        profile_pic_url: 'https://images.pexels.com/photos/271816/pexels-photo-271816.jpeg?auto=compress&cs=tinysrgb&w=400',
        is_verified: true,
        rating: 4.8,
        total_bookings: 156
      },
      {
        full_name: 'Mirror Master Services',
        email: 'mirror@master.com',
        phone: '9876543212',
        password: 'password123',
        service_name: 'glass-mirror',
        experience_years: 12,
        hourly_rate: 550,
        description: 'Specialized in premium mirror installations and custom glass work. 12+ years of expertise.',
        state: 'Telangana',
        city: 'Hyderabad',
        locality: 'Banjara Hills',
        pincode: '500034',
        full_address: 'Banjara Hills, Hyderabad, Telangana 500034',
        profile_pic_url: 'https://images.pexels.com/photos/271816/pexels-photo-271816.jpeg?auto=compress&cs=tinysrgb&w=400',
        is_verified: true,
        rating: 4.9,
        total_bookings: 203
      },
      {
        full_name: 'Glass Solutions Pro',
        email: 'glass@solutionpro.com',
        phone: '9876543213',
        password: 'password123',
        service_name: 'glass-mirror',
        experience_years: 6,
        hourly_rate: 400,
        description: 'Professional glass door installation and window glass replacement services. Quick and reliable.',
        state: 'Telangana',
        city: 'Hyderabad',
        locality: 'Kondapur',
        pincode: '500084',
        full_address: 'Kondapur, Hyderabad, Telangana 500084',
        profile_pic_url: 'https://images.pexels.com/photos/271816/pexels-photo-271816.jpeg?auto=compress&cs=tinysrgb&w=400',
        is_verified: true,
        rating: 4.7,
        total_bookings: 89
      },
      {
        full_name: 'Crystal Clear Glass',
        email: 'crystal@clearglass.com',
        phone: '9876543214',
        password: 'password123',
        service_name: 'glass-mirror',
        experience_years: 10,
        hourly_rate: 500,
        description: 'Expert in all types of glass and mirror work. Specialized in commercial and residential projects.',
        state: 'Telangana',
        city: 'Hyderabad',
        locality: 'HITEC City',
        pincode: '500081',
        full_address: 'HITEC City, Hyderabad, Telangana 500081',
        profile_pic_url: 'https://images.pexels.com/photos/271816/pexels-photo-271816.jpeg?auto=compress&cs=tinysrgb&w=400',
        is_verified: true,
        rating: 4.6,
        total_bookings: 134
      },
      {
        full_name: 'Perfect Mirror Installations',
        email: 'perfect@mirror.com',
        phone: '9876543215',
        password: 'password123',
        service_name: 'glass-mirror',
        experience_years: 15,
        hourly_rate: 600,
        description: 'Premium mirror and glass installation services. 15+ years of experience in luxury projects.',
        state: 'Telangana',
        city: 'Hyderabad',
        locality: 'Jubilee Hills',
        pincode: '500033',
        full_address: 'Jubilee Hills, Hyderabad, Telangana 500033',
        profile_pic_url: 'https://images.pexels.com/photos/271816/pexels-photo-271816.jpeg?auto=compress&cs=tinysrgb&w=400',
        is_verified: true,
        rating: 4.9,
        total_bookings: 278
      }
    ];


    for (const provider of testProviders) {
      try {
        // Check if provider already exists
        const existingProvider = await getRow('SELECT id FROM users WHERE phone = $1', [provider.phone]);
        
        if (existingProvider) {
          continue;
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(provider.password, 12);

        // Insert user
        const userResult = await query(`
          INSERT INTO users (full_name, email, phone, password, role, is_verified, profile_pic_url)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id
        `, [
          provider.full_name,
          provider.email,
          provider.phone,
          hashedPassword,
          'provider',
          provider.is_verified,
          provider.profile_pic_url
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
            provider_id, service_id, service_charge_value, service_charge_unit, payment_status
          )
          VALUES ($1, $2, $3, $4, $5)
        `, [
          profileId,
          serviceId,
          provider.hourly_rate,
          'hourly',
          'active'
        ]);


      } catch (error) {
        console.error(`❌ Error adding provider ${provider.full_name}:`, error.message);
      }
    }

    // Verify providers were added
    const addedProviders = await query(`
      SELECT pp.*, u.full_name, u.phone, u.email, ps.service_charge_value, sm.name as service_name
      FROM provider_profiles pp
      JOIN users u ON pp.user_id = u.id
      JOIN provider_services ps ON pp.id = ps.provider_id
      JOIN services_master sm ON ps.service_id = sm.id
      WHERE sm.name = 'glass-mirror'
    `);

    addedProviders.rows.forEach((provider, index) => {
    });

  } catch (error) {
    console.error('❌ Failed to add glass-mirror providers:', error);
    throw error;
  }
};

if (require.main === module) {
  addGlassMirrorProviders()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Glass & Mirror test providers addition failed:', error);
      process.exit(1);
    });
}

module.exports = { addGlassMirrorProviders };
