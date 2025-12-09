/**
 * ============================================================================
 * CREATE ADMIN USER SCRIPT
 * Purpose: Safely create admin user with proper password hashing
 * Usage: node scripts/create-admin-user.js
 * ============================================================================
 */

const { query, getRow } = require('../database/connection');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: './config.env' });

const createAdminUser = async () => {
  try {
    const phone = '9999999999';
    const password = 'admin123';
    const email = 'admin@buildxpert.com';
    const fullName = 'Admin User';

    console.log('🔐 Creating admin user...');
    console.log(`Phone: ${phone}`);
    console.log(`Email: ${email}`);

    // Check if admin user already exists
    const existingAdmin = await getRow(
      'SELECT id, phone, role FROM users WHERE phone = $1 AND role = $2',
      [phone, 'admin']
    );

    if (existingAdmin) {
      console.log('⚠️  Admin user already exists!');
      console.log(`User ID: ${existingAdmin.id}`);
      console.log(`Phone: ${existingAdmin.phone}`);
      console.log(`Role: ${existingAdmin.role}`);
      
      // Ask if user wants to update password
      console.log('\n🔄 Updating password for existing admin user...');
      const hashedPassword = await bcrypt.hash(password, 12);
      
      await query(
        'UPDATE users SET password = $1, is_verified = true WHERE id = $2',
        [hashedPassword, existingAdmin.id]
      );
      
      console.log('✅ Admin password updated successfully!');
      console.log('\n📋 Admin Credentials:');
      console.log(`Phone: ${phone}`);
      console.log(`Password: ${password}`);
      console.log(`Role: admin`);
      console.log('\n⚠️  SECURITY WARNING: Change this password immediately in production!');
      
      process.exit(0);
    }

    // Hash password with bcrypt (cost factor 12)
    console.log('🔒 Hashing password...');
    const hashedPassword = await bcrypt.hash(password, 12);

    // Insert admin user
    console.log('📝 Inserting admin user into database...');
    const result = await query(
      `INSERT INTO users (full_name, email, phone, password, role, is_verified, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       RETURNING id, full_name, email, phone, role, is_verified`,
      [fullName, email, phone, hashedPassword, 'admin', true]
    );

    const adminUser = result.rows[0];

    console.log('\n✅ Admin user created successfully!');
    console.log('\n📋 Admin Credentials:');
    console.log(`User ID: ${adminUser.id}`);
    console.log(`Full Name: ${adminUser.full_name}`);
    console.log(`Email: ${adminUser.email}`);
    console.log(`Phone: ${adminUser.phone}`);
    console.log(`Password: ${password}`);
    console.log(`Role: ${adminUser.role}`);
    console.log(`Verified: ${adminUser.is_verified}`);
    console.log('\n⚠️  SECURITY WARNING:');
    console.log('   1. Change this password immediately in production!');
    console.log('   2. Use a strong password (minimum 12 characters, mixed case, numbers, symbols)');
    console.log('   3. Never commit credentials to version control');
    console.log('   4. Store credentials securely (password manager)');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating admin user:', error);
    console.error('Error details:', error.message);
    process.exit(1);
  }
};

// Run if executed directly
if (require.main === module) {
  createAdminUser();
}

module.exports = { createAdminUser };

