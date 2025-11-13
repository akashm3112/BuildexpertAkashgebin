const { query } = require('../database/connection');
require('dotenv').config({ path: './config.env' });

const completeMigration = async () => {
  try {

    // Set timezone to IST for the session
    await query(`SET timezone = 'Asia/Kolkata';`);

    // 1. Create users table with profile picture support
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        full_name TEXT NOT NULL,
        email TEXT UNIQUE,
        phone TEXT NOT NULL,
        password TEXT NOT NULL,
        profile_pic_url TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT NOW(),
        role TEXT CHECK (role IN ('user', 'provider', 'admin')) NOT NULL DEFAULT 'user',
        is_verified BOOLEAN DEFAULT FALSE
      );
    `);

    // 2. Create addresses table
    await query(`
      CREATE TABLE IF NOT EXISTS addresses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        type TEXT CHECK (type IN ('home', 'office', 'other')) DEFAULT 'home',
        state TEXT,
        full_address TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // 3. Create services_master table
    await query(`
      CREATE TABLE IF NOT EXISTS services_master (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT UNIQUE NOT NULL,
        is_paid BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // 4. Create provider_profiles table with engineering certificate support
    await query(`
      CREATE TABLE IF NOT EXISTS provider_profiles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        years_of_experience INT,
        service_description TEXT,
        is_engineering_provider BOOLEAN DEFAULT FALSE,
        engineering_certificate_url TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // 5. Create provider_services table with working proof URLs
    await query(`
      CREATE TABLE IF NOT EXISTS provider_services (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        provider_id UUID REFERENCES provider_profiles(id) ON DELETE CASCADE,
        service_id UUID REFERENCES services_master(id),
        service_charge_value DECIMAL,
        service_charge_unit TEXT,
        working_proof_urls TEXT[] DEFAULT '{}',
        payment_status TEXT CHECK (payment_status IN ('active', 'expired', 'pending')) DEFAULT 'pending',
        payment_start_date DATE,
        payment_end_date DATE,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // 6. Create provider_specific_services table
    await query(`
      CREATE TABLE IF NOT EXISTS provider_specific_services (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        provider_service_id UUID REFERENCES provider_services(id) ON DELETE CASCADE,
        service_name TEXT NOT NULL,
        description TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // 7. Create bookings table with comprehensive fields
    await query(`
      CREATE TABLE IF NOT EXISTS bookings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id),
        provider_service_id UUID REFERENCES provider_services(id),
        selected_service TEXT,
        appointment_date DATE,
        appointment_time TEXT,
        status TEXT CHECK (status IN ('pending', 'accepted', 'rejected', 'completed', 'cancelled')) DEFAULT 'pending',
        rejection_reason TEXT,
        cancellation_reason TEXT,
        report_reason TEXT,
        report_description TEXT,
        description TEXT,
        estimated_price DECIMAL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // 8. Create ratings table
    await query(`
      CREATE TABLE IF NOT EXISTS ratings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        booking_id UUID UNIQUE REFERENCES bookings(id),
        rating INTEGER CHECK (rating BETWEEN 1 AND 5),
        review TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // 9. Create notifications table with role and translation support
    await query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id),
        title TEXT,
        message TEXT,
        is_read BOOLEAN DEFAULT FALSE,
        role TEXT CHECK (role IN ('user', 'provider', 'admin')) DEFAULT 'user',
        translation_key TEXT,
        translation_params JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // 10. Create payments table
    await query(`
      CREATE TABLE IF NOT EXISTS payments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id),
        provider_service_id UUID REFERENCES provider_services(id),
        amount DECIMAL,
        status TEXT CHECK (status IN ('success', 'failed', 'pending')) DEFAULT 'pending',
        mode TEXT,
        paid_on TIMESTAMP DEFAULT NOW(),
        next_due_date DATE
      );
    `);

    // 11. Create push_tokens table
    await query(`
      CREATE TABLE IF NOT EXISTS push_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        token TEXT NOT NULL,
        platform TEXT CHECK (platform IN ('ios', 'android', 'web')) DEFAULT 'android',
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, token)
      );
    `);

    // Create indexes for better performance
    await query(`CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_users_profile_pic_url ON users(profile_pic_url);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_addresses_user_id ON addresses(user_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_provider_services_provider_id ON provider_services(provider_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_provider_specific_services_provider_service_id ON provider_specific_services(provider_service_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings(user_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_bookings_provider_service_id ON bookings(provider_service_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_notifications_role ON notifications(role);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id ON push_tokens(user_id);`);

    // Add unique constraint on (phone, role) for users
    try {
      await query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_phone_key;`);
      await query(`ALTER TABLE users ADD CONSTRAINT users_phone_role_key UNIQUE (phone, role);`);
    } catch (error) {
    }

    // Add profile picture URL validation
    try {
      await query(`
        ALTER TABLE users 
        ADD CONSTRAINT users_profile_pic_url_check 
        CHECK (profile_pic_url = '' OR profile_pic_url LIKE 'https://%')
      `);
    } catch (error) {
    }
    
    // Seed services into services_master table
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

    for (const service of services) {
      await query(`
        INSERT INTO services_master (name, is_paid)
        VALUES ($1, $2)
        ON CONFLICT (name) DO NOTHING
      `, [service.name, service.is_paid]);
    }

    // Create admin user if not exists
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash('admin123', 12);
    
    await query(`
      INSERT INTO users (full_name, email, phone, password, role, is_verified)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (phone, role) DO NOTHING
    `, ['Admin User', 'admin@buildxpert.com', '9999999999', hashedPassword, 'admin', true]);

    // Create test users for development
    const testUsers = [
      {
        full_name: 'Sam User',
        email: 'sam@example.com',
        phone: '6344997888',
        password: await bcrypt.hash('password123', 12),
        role: 'user',
        is_verified: true
      },
      {
        full_name: 'Tom Provider',
        email: 'tom@example.com',
        phone: '9876543210',
        password: await bcrypt.hash('password123', 12),
        role: 'provider',
        is_verified: true
      }
    ];

    for (const user of testUsers) {
      await query(`
        INSERT INTO users (full_name, email, phone, password, role, is_verified)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (phone, role) DO NOTHING
      `, [user.full_name, user.email, user.phone, user.password, user.role, user.is_verified]);
    }
    

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
};

// Run migration if this file is executed directly
if (require.main === module) {
  completeMigration()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('Complete migration failed:', error);
      process.exit(1);
    });
}

module.exports = { completeMigration };
