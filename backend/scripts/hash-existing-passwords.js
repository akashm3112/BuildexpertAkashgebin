const { query, getRows } = require('../database/connection');
const bcrypt = require('bcryptjs');

/**
 * Script to hash all existing plain text passwords in the database
 * This ensures all passwords are properly secured
 */
async function hashExistingPasswords() {
  try {
    
    // Get all users with plain text passwords (not starting with $2a$ or $2b$)
    const users = await getRows(`
      SELECT id, phone, password, role 
      FROM users 
      WHERE password NOT LIKE '$2a$%' AND password NOT LIKE '$2b$%'
    `);
    
    if (users.length === 0) {
      return;
    }
    
    users.forEach(user => {
    });
    
    
    for (const user of users) {
      try {
        // Hash the plain text password
        const hashedPassword = await bcrypt.hash(user.password, 12);
        
        // Update the user's password in the database
        await query(
          'UPDATE users SET password = $1 WHERE id = $2',
          [hashedPassword, user.id]
        );
        
      } catch (error) {
        console.error(`❌ Failed to hash password for ${user.role} ${user.phone}:`, error.message);
      }
    }
    
  
    
  } catch (error) {
    console.error('❌ Error during password hashing:', error);
    throw error;
  }
}

// Run the script if called directly
if (require.main === module) {
  hashExistingPasswords()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Password hashing script failed:', error);
      process.exit(1);
    });
}

module.exports = { hashExistingPasswords };
