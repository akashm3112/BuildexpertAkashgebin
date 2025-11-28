const { query, getRows } = require('../database/connection');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: './config.env' });

const completeSeed = async () => {
  try {

    // 1. Create admin user
    const hashedAdminPassword = await bcrypt.hash('admin123', 12);
    const adminExists = await getRows('SELECT id FROM users WHERE phone = $1 AND role = $2', ['9999999999', 'admin']);
    if (adminExists.length === 0) {
      await query(`
        INSERT INTO users (full_name, email, phone, password, role, is_verified)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, ['Admin User', 'admin@buildxpert.com', '9999999999', hashedAdminPassword, 'admin', true]);
    } else {
    }

    // 2. Create sample users for testing
    const sampleUsers = [
      {
        full_name: 'John Doe',
        email: 'john@example.com',
        phone: '9876543210',
        password: await bcrypt.hash('password123', 12),
        role: 'user',
        is_verified: true
      },
      {
        full_name: 'Jane Smith',
        email: 'jane@example.com',
        phone: '8765432109',
        password: await bcrypt.hash('password123', 12),
        role: 'provider',
        is_verified: true
      },
      {
        full_name: 'Test User',
        email: 'test@example.com',
        phone: '9999999999',
        password: await bcrypt.hash('testpassword', 12),
        role: 'user',
        is_verified: true
      },
      {
        full_name: 'Test Provider',
        email: 'testprovider@example.com',
        phone: '8888888888',
        password: await bcrypt.hash('testpassword', 12),
        role: 'provider',
        is_verified: true
      }
    ];

    for (const user of sampleUsers) {
      const userExists = await getRows('SELECT id FROM users WHERE phone = $1', [user.phone]);
      if (userExists.length === 0) {
        await query(`
          INSERT INTO users (full_name, email, phone, password, role, is_verified)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [user.full_name, user.email, user.phone, user.password, user.role, user.is_verified]);
      } else {
      }
    }

    // 3. Create provider profiles for provider users
    const providerUsers = await getRows(`
      SELECT id, full_name FROM users WHERE role = 'provider'
    `);

    for (const provider of providerUsers) {
      const profileExists = await getRows(`
        SELECT id FROM provider_profiles WHERE user_id = $1
      `, [provider.id]);

      if (profileExists.length === 0) {
        await query(`
          INSERT INTO provider_profiles (user_id, years_of_experience, service_description, is_engineering_provider)
          VALUES ($1, $2, $3, $4)
        `, [provider.id, 5, `Experienced ${provider.full_name} with expertise in various construction services`, false]);
      } else {
      }
    }

    // 4. Create sample addresses for users
    const userAddresses = [
      {
        user_phone: '9876543210',
        type: 'home',
        state: 'Karnataka',
        full_address: '123 Main Street, Bangalore, Karnataka 560001'
      },
      {
        user_phone: '8765432109',
        type: 'home',
        state: 'Karnataka',
        full_address: '456 Provider Lane, Bangalore, Karnataka 560002'
      },
      {
        user_phone: '9999999999',
        type: 'home',
        state: 'Karnataka',
        full_address: '789 Test Road, Bangalore, Karnataka 560003'
      }
    ];

    for (const address of userAddresses) {
      const user = await getRows('SELECT id FROM users WHERE phone = $1', [address.user_phone]);
      if (user.length > 0) {
        const addressExists = await getRows(`
          SELECT id FROM addresses WHERE user_id = $1 AND type = $2
        `, [user[0].id, address.type]);

        if (addressExists.length === 0) {
          await query(`
            INSERT INTO addresses (user_id, type, state, full_address)
            VALUES ($1, $2, $3, $4)
          `, [user[0].id, address.type, address.state, address.full_address]);
        } else {
        }
      }
    }

    // 5. Create sample provider services
    const services = await getRows('SELECT id, name FROM services_master');
    const providerProfiles = await getRows(`
      SELECT pp.id, u.full_name 
      FROM provider_profiles pp 
      JOIN users u ON pp.user_id = u.id
    `);

    for (const profile of providerProfiles) {
      // Assign 2-3 random services to each provider
      const randomServices = services.sort(() => 0.5 - Math.random()).slice(0, Math.floor(Math.random() * 3) + 2);
      
      for (const service of randomServices) {
        const serviceExists = await getRows(`
          SELECT id FROM provider_services 
          WHERE provider_id = $1 AND service_id = $2
        `, [profile.id, service.id]);

        if (serviceExists.length === 0) {
          const chargeValue = Math.floor(Math.random() * 5000) + 500; // 500-5500
          const chargeUnit = ['per hour', 'per day', 'per project'][Math.floor(Math.random() * 3)];
          
          await query(`
            INSERT INTO provider_services (provider_id, service_id, service_charge_value, service_charge_unit, payment_status)
            VALUES ($1, $2, $3, $4, $5)
          `, [profile.id, service.id, chargeValue, chargeUnit, 'active']);
        }
      }
    }

    // 6. Create sample bookings
    const users = await getRows('SELECT id, full_name FROM users WHERE role = \'user\'');
    const providerServices = await getRows(`
      SELECT ps.id, ps.service_charge_value, ps.service_charge_unit, u.full_name as provider_name, sm.name as service_name
      FROM provider_services ps
      JOIN provider_profiles pp ON ps.provider_id = pp.id
      JOIN users u ON pp.user_id = u.id
      JOIN services_master sm ON ps.service_id = sm.id
      WHERE ps.payment_status = 'active'
    `);

    if (users.length > 0 && providerServices.length > 0) {
      const sampleBookings = [
        {
          user_id: users[0].id,
          provider_service_id: providerServices[0].id,
          selected_service: providerServices[0].service_name,
          appointment_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 7 days from now
          appointment_time: '10:00 AM',
          status: 'pending',
          description: 'Sample booking for testing purposes'
        },
        {
          user_id: users[0].id,
          provider_service_id: providerServices[0].id,
          selected_service: providerServices[0].service_name,
          appointment_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 7 days ago
          appointment_time: '02:00 PM',
          status: 'completed',
          description: 'Completed sample booking'
        }
      ];

      for (const booking of sampleBookings) {
        const bookingExists = await getRows(`
          SELECT id FROM bookings 
          WHERE user_id = $1 AND provider_service_id = $2 AND appointment_date = $3
        `, [booking.user_id, booking.provider_service_id, booking.appointment_date]);

        if (bookingExists.length === 0) {
          await query(`
            INSERT INTO bookings (user_id, provider_service_id, selected_service, appointment_date, appointment_time, status, description)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
          `, [booking.user_id, booking.provider_service_id, booking.selected_service, booking.appointment_date, booking.appointment_time, booking.status, booking.description]);
        }
      }
    }

    // 7. Create sample notifications
    const sampleNotifications = [
      {
        title: 'Welcome to BuildXpert! 🎉',
        message: 'Congratulations on creating your account! You can now book construction services, track your bookings, and connect with verified service providers.',
        role: 'user'
      },
      {
        title: 'Welcome to BuildXpert Provider! 🎉',
        message: 'Congratulations on registering as a service provider! You can now receive booking requests, manage your services, and grow your business.',
        role: 'provider'
      }
    ];

    for (const notification of sampleNotifications) {
      const usersForRole = await getRows('SELECT id FROM users WHERE role = $1', [notification.role]);
      
      for (const user of usersForRole) {
        const notificationExists = await getRows(`
          SELECT id FROM notifications 
          WHERE user_id = $1 AND title = $2
        `, [user.id, notification.title]);

        if (notificationExists.length === 0) {
          await query(`
            INSERT INTO notifications (user_id, title, message, role, is_read)
            VALUES ($1, $2, $3, $4, $5)
          `, [user.id, notification.title, notification.message, notification.role, false]);
        }
      }
    }

    // 8. Summary
    const finalStats = await getRows(`
      SELECT 
        (SELECT COUNT(*) FROM users) as users_count,
        (SELECT COUNT(*) FROM provider_profiles) as providers_count,
        (SELECT COUNT(*) FROM provider_services) as services_count,
        (SELECT COUNT(*) FROM bookings) as bookings_count,
        (SELECT COUNT(*) FROM notifications) as notifications_count
    `);

    

  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
};

// Run seeding if this file is executed directly
if (require.main === module) {
  completeSeed()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('Complete seeding failed:', error);
      process.exit(1);
    });
}

module.exports = { completeSeed };
