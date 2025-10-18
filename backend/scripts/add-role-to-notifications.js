const { query } = require('../database/connection');

const addRoleToNotifications = async () => {
  try {
    console.log('🔧 Adding role column to notifications table...');

    // Add role column to notifications table
    await query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notifications' AND column_name='role') THEN
          ALTER TABLE notifications ADD COLUMN role TEXT CHECK (role IN ('user', 'provider')) DEFAULT 'user';
        END IF;
      END$$;
    `);

    console.log('✅ Role column added to notifications table');

    // Update existing notifications to have 'user' role by default
    await query(`
      UPDATE notifications 
      SET role = 'user' 
      WHERE role IS NULL
    `);

    console.log('✅ Updated existing notifications with default role');

    console.log('🎉 Migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
};

// Run the migration if this file is executed directly
if (require.main === module) {
  addRoleToNotifications()
    .then(() => {
      console.log('✅ Migration completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { addRoleToNotifications };
