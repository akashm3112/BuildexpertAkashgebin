const { query } = require('../database/connection');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: './config.env' });

const seedDatabase = async () => {
  try {

    // Hash password for admin user
    const hashedPassword = await bcrypt.hash('admin123', 12);

    // 1. Create admin user
    const adminExists = await query(`
      SELECT id FROM users WHERE phone = $1
    `, ['9999999999']);
    
    if (adminExists.rows.length === 0) {
      await query(`
        INSERT INTO users (full_name, email, phone, password, role, is_verified)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, ['Admin User', 'admin@buildxpert.com', '9999999999', hashedPassword, 'admin', true]);
    } else {
    }

    // 2. Insert predefined services (now handled by migrate.js)

    // 3. Create some sample users for testing
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
      }
    ];

    for (const user of sampleUsers) {
      const userExists = await query(`
        SELECT id FROM users WHERE phone = $1
      `, [user.phone]);
      
      if (userExists.rows.length === 0) {
        await query(`
          INSERT INTO users (full_name, email, phone, password, role, is_verified)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [user.full_name, user.email, user.phone, user.password, user.role, user.is_verified]);
      } else {
      }
    }

    // 4. Create provider profile for Jane Smith
    const janeUser = await query(`
      SELECT id FROM users WHERE phone = '8765432109'
    `);
    
    if (janeUser.rows[0]) {
      const profileExists = await query(`
        SELECT id FROM provider_profiles WHERE user_id = $1
      `, [janeUser.rows[0].id]);
      
      if (profileExists.rows.length === 0) {
        await query(`
          INSERT INTO provider_profiles (user_id, years_of_experience, service_description, is_engineering_provider)
          VALUES ($1, $2, $3, $4)
        `, [janeUser.rows[0].id, 5, 'Experienced plumber with expertise in residential and commercial plumbing', false]);
      } else {
      }
    }


  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
};

// Ensure test provider exists and has a provider profile
async function ensureTestProvider() {
  const phone = '9999999999';
  const email = 'testprovider@example.com';
  const fullName = 'Test Provider';
  const password = await bcrypt.hash('testpassword', 12);
  let user = await query(`SELECT * FROM users WHERE phone = $1`, [phone]);
  if (!user.rows[0]) {
    await query(`INSERT INTO users (full_name, email, phone, password, role, is_verified) VALUES ($1, $2, $3, $4, $5, $6)`, [fullName, email, phone, password, 'provider', true]);
    user = await query(`SELECT * FROM users WHERE phone = $1`, [phone]);
  }
  const userId = user.rows[0].id;
  let profile = await query(`SELECT * FROM provider_profiles WHERE user_id = $1`, [userId]);
  if (!profile.rows[0]) {
    await query(`INSERT INTO provider_profiles (user_id, years_of_experience, service_description, is_engineering_provider) VALUES ($1, $2, $3, $4)`, [userId, 3, 'Seeded test provider profile', false]);
  }
}

// Run seeding if this file is executed directly
if (require.main === module) {
  seedDatabase()
    .then(() => ensureTestProvider())
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('Seeding failed:', error);
      process.exit(1);
    });
}

module.exports = { seedDatabase }; 