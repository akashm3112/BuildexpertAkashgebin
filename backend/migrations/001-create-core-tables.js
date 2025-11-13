const { query } = require('../database/connection');

/**
 * Create core application tables
 * This migration creates the fundamental tables needed for the application
 */
const createCoreTables = async () => {
  try {

    // Set timezone to IST for the session
    await query(`SET timezone = 'Asia/Kolkata';`);

    // 1. Create users table
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
        city TEXT,
        full_address TEXT,
        pincode TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // 3. Create services_master table
    await query(`
      CREATE TABLE IF NOT EXISTS services_master (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT UNIQUE NOT NULL,
        category TEXT,
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
        address TEXT,
        description TEXT,
        status TEXT CHECK (status IN ('pending', 'accepted', 'rejected', 'completed', 'cancelled')) DEFAULT 'pending',
        rejection_reason TEXT,
        cancellation_reason TEXT,
        report_reason TEXT,
        report_description TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
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
        role TEXT CHECK (role IN ('user', 'provider', 'admin')) DEFAULT 'user',
        translation_key TEXT,
        translation_params JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // 9. Create indexes for better performance
    await query(`
      CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
      CREATE INDEX IF NOT EXISTS idx_addresses_user_id ON addresses(user_id);
      CREATE INDEX IF NOT EXISTS idx_addresses_type ON addresses(type);
      CREATE INDEX IF NOT EXISTS idx_services_master_name ON services_master(name);
      CREATE INDEX IF NOT EXISTS idx_services_master_category ON services_master(category);
      CREATE INDEX IF NOT EXISTS idx_provider_profiles_user_id ON provider_profiles(user_id);
      CREATE INDEX IF NOT EXISTS idx_provider_services_provider_id ON provider_services(provider_id);
      CREATE INDEX IF NOT EXISTS idx_provider_services_service_id ON provider_services(service_id);
      CREATE INDEX IF NOT EXISTS idx_provider_services_payment_status ON provider_services(payment_status);
      CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings(user_id);
      CREATE INDEX IF NOT EXISTS idx_bookings_provider_service_id ON bookings(provider_service_id);
      CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
      CREATE INDEX IF NOT EXISTS idx_bookings_appointment_date ON bookings(appointment_date);
      CREATE INDEX IF NOT EXISTS idx_ratings_booking_id ON ratings(booking_id);
      CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
      CREATE INDEX IF NOT EXISTS idx_notifications_role ON notifications(role);
      CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
    `);

    return { success: true };
  } catch (error) {
    console.error('❌ Error creating core tables:', error);
    return { success: false, error: error.message };
  }
};

module.exports = createCoreTables;

// Run if called directly
if (require.main === module) {
  createCoreTables()
    .then(result => {
      if (result.success) {
        process.exit(0);
      } else {
        console.error('❌ Migration failed:', result.error);
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('❌ Migration error:', error);
      process.exit(1);
    });
}
