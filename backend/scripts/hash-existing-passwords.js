const { query, getRows } = require('../database/connection');
const bcrypt = require('bcryptjs');

/**
 * Script to hash all existing plain text passwords in the database
 * This ensures all passwords are properly secured
 */
async function hashExistingPasswords() {
  try {
    console.log('🔐 Starting password hashing process...');
    
    // Get all users with plain text passwords (not starting with $2a$ or $2b$)
    const users = await getRows(`
      SELECT id, phone, password, role 
      FROM users 
      WHERE password NOT LIKE '$2a$%' AND password NOT LIKE '$2b$%'
    `);
    
    if (users.length === 0) {
      console.log('✅ All passwords are already hashed!');
      return;
    }
    
    console.log(`📊 Found ${users.length} users with plain text passwords:`);
    users.forEach(user => {
      console.log(`  - ${user.role}: ${user.phone} (ID: ${user.id})`);
    });
    
    console.log('\n🔄 Hashing passwords...');
    
    for (const user of users) {
      try {
        // Hash the plain text password
        const hashedPassword = await bcrypt.hash(user.password, 12);
        
        // Update the user's password in the database
        await query(
          'UPDATE users SET password = $1 WHERE id = $2',
          [hashedPassword, user.id]
        );
        
        console.log(`✅ Hashed password for ${user.role} ${user.phone}`);
      } catch (error) {
        console.error(`❌ Failed to hash password for ${user.role} ${user.phone}:`, error.message);
      }
    }
    
    console.log('\n🎉 Password hashing completed!');
    console.log(`✅ Successfully hashed ${users.length} passwords`);
    
  } catch (error) {
    console.error('❌ Error during password hashing:', error);
    throw error;
  }
}

// Run the script if called directly
if (require.main === module) {
  hashExistingPasswords()
    .then(() => {
      console.log('✅ Password hashing script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Password hashing script failed:', error);
      process.exit(1);
    });
}

module.exports = { hashExistingPasswords };
