const { query } = require('../database/connection');

const addRoleToNotifications = async () => {
  try {

    // Add role column to notifications table
    await query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notifications' AND column_name='role') THEN
          ALTER TABLE notifications ADD COLUMN role TEXT CHECK (role IN ('user', 'provider')) DEFAULT 'user';
        END IF;
      END$$;
    `);


    // Update existing notifications to have 'user' role by default
    await query(`
      UPDATE notifications 
      SET role = 'user' 
      WHERE role IS NULL
    `);

   
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
};

// Run the migration if this file is executed directly
if (require.main === module) {
  addRoleToNotifications()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { addRoleToNotifications };
