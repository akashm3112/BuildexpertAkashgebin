const { query } = require('../database/connection');
require('dotenv').config({ path: './config.env' });

const createTables = async () => {
  try {

    // Set timezone to IST for the session
    await query(`SET timezone = 'Asia/Kolkata';`);

    // 1. Create users table
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        full_name TEXT NOT NULL,
        email TEXT UNIQUE,
        phone TEXT UNIQUE NOT NULL,
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

    // 4. Create provider_profiles table
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

    // 5. Create provider_services table
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

    // 6. Create bookings table
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
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // 6.1. Add missing columns to bookings table if not present
    await query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bookings' AND column_name='description') THEN
          ALTER TABLE bookings ADD COLUMN description TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bookings' AND column_name='estimated_price') THEN
          ALTER TABLE bookings ADD COLUMN estimated_price DECIMAL;
        END IF;
      END$$;
    `);

    // 7. Create ratings table
    await query(`
      CREATE TABLE IF NOT EXISTS ratings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        booking_id UUID UNIQUE REFERENCES bookings(id),
        rating INTEGER CHECK (rating BETWEEN 1 AND 5),
        review TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // 8. Create notifications table
    await query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id),
        title TEXT,
        message TEXT,
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // 9. Create payments table
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

    // 10. Create provider_reports table
    await query(`
      CREATE TABLE IF NOT EXISTS provider_reports (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        provider_id UUID REFERENCES provider_profiles(id) ON DELETE CASCADE,
        customer_name TEXT NOT NULL,
        incident_date DATE NOT NULL,
        incident_time TEXT,
        incident_type TEXT NOT NULL,
        description TEXT NOT NULL,
        evidence TEXT,
        status TEXT CHECK (status IN ('open', 'resolved', 'closed')) DEFAULT 'open',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Create indexes for better performance
    await query(`CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_addresses_user_id ON addresses(user_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_provider_services_provider_id ON provider_services(provider_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings(user_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_bookings_provider_service_id ON bookings(provider_service_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_provider_reports_provider_id ON provider_reports(provider_id);`);

    
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
    

    // Drop the old unique constraint on phone
    await query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_phone_key;`);
    // Add a new unique constraint on (phone, role)
    await query(`ALTER TABLE users ADD CONSTRAINT users_phone_role_key UNIQUE (phone, role);`);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
};

// Run migration if this file is executed directly
if (require.main === module) {
  createTables()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { createTables }; 