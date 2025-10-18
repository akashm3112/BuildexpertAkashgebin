const { getRows, query } = require('../database/connection');
const { formatNotificationTimestamp } = require('./timezone');
const getIO = () => require('../server').io;

/**
 * Centralized notification utility with role validation
 * This prevents role separation mistakes by ensuring notifications
 * are always created with the correct role
 */

// Valid roles for notifications
const VALID_ROLES = ['user', 'provider', 'admin'];

/**
 * Send notification with automatic role validation
 * @param {string} userId - User ID
 * @param {string} title - Notification title
 * @param {string} message - Notification message
 * @param {string} role - Role (optional, will be auto-detected if not provided)
 * @returns {Promise<Object>} Created notification
 */
async function sendNotification(userId, title, message, role = null) {
  try {
    // Validate required parameters
    if (!userId || !title || !message) {
      console.error('❌ Missing required parameters for notification:', { userId, title, message, role });
      throw new Error('Missing required notification parameters');
    }

    // Get user's actual role from database
    const user = await getRows('SELECT id, role FROM users WHERE id = $1', [userId]);
    if (user.length === 0) {
      console.error(`❌ User with ID ${userId} not found for notification`);
      throw new Error('User not found');
    }

    const actualUserRole = user[0].role;
    
    // ALWAYS use the user's actual role - ignore any provided role parameter
    role = actualUserRole;
    console.log(`🔔 Using actual user role '${role}' for user ${userId} (ignoring provided role parameter)`);

    // Validate role parameter
    if (!VALID_ROLES.includes(role)) {
      console.error(`❌ Invalid role '${role}' for user ${userId}. This should not happen.`);
      throw new Error(`Invalid user role: ${role}`);
    }

    // Log notification creation for debugging
    console.log(`🔔 Creating notification:`, {
      userId,
      userRole: actualUserRole,
      finalRole: role,
      title: title.substring(0, 50) + (title.length > 50 ? '...' : ''),
      messageLength: message.length
    });

    const result = await query(
      'INSERT INTO notifications (user_id, title, message, role) VALUES ($1, $2, $3, $4) RETURNING *',
      [userId, title, message, role]
    );
    
    const notification = result.rows[0];
    
    // Format timestamp for the notification
    const timestampData = formatNotificationTimestamp(notification.created_at);
    
    // Emit socket event to notify the user about the new notification
    getIO().to(userId).emit('notification_created', {
      notification: {
        id: notification.id,
        title: notification.title,
        message: notification.message,
        created_at: notification.created_at,
        is_read: notification.is_read,
        ...timestampData
      }
    });
    
    console.log(`✅ Notification created successfully: ID ${notification.id} for user ${userId} with role ${role}`);
    return notification;
    
  } catch (error) {
    console.error('❌ Error creating notification:', error);
    throw error;
  }
}

/**
 * Send notification for user role (explicit)
 * @param {string} userId - User ID
 * @param {string} title - Notification title
 * @param {string} message - Notification message
 * @returns {Promise<Object>} Created notification
 */
async function sendUserNotification(userId, title, message) {
  return sendNotification(userId, title, message, 'user');
}

/**
 * Send notification for provider role (explicit)
 * @param {string} userId - User ID
 * @param {string} title - Notification title
 * @param {string} message - Notification message
 * @returns {Promise<Object>} Created notification
 */
async function sendProviderNotification(userId, title, message) {
  return sendNotification(userId, title, message, 'provider');
}

/**
 * Send notification with auto-detected role based on user's actual role
 * @param {string} userId - User ID
 * @param {string} title - Notification title
 * @param {string} message - Notification message
 * @returns {Promise<Object>} Created notification
 */
async function sendAutoNotification(userId, title, message) {
  return sendNotification(userId, title, message, null);
}

/**
 * Validate notification role consistency for existing notifications
 * @param {string} userId - User ID
 * @returns {Promise<Array>} Array of notifications that need role correction
 */
async function validateNotificationRoles(userId) {
  try {
    // Get user's actual role
    const user = await getRows('SELECT role FROM users WHERE id = $1', [userId]);
    if (user.length === 0) {
      throw new Error('User not found');
    }

    const actualUserRole = user[0].role;

    // Get notifications with incorrect role
    const incorrectNotifications = await getRows(
      'SELECT id, title, role FROM notifications WHERE user_id = $1 AND role != $2',
      [userId, actualUserRole]
    );

    return incorrectNotifications;
  } catch (error) {
    console.error('❌ Error validating notification roles:', error);
    throw error;
  }
}

/**
 * Fix notification role inconsistencies for a user
 * @param {string} userId - User ID
 * @returns {Promise<number>} Number of notifications fixed
 */
async function fixNotificationRoles(userId) {
  try {
    const incorrectNotifications = await validateNotificationRoles(userId);
    
    if (incorrectNotifications.length === 0) {
      console.log(`✅ No role inconsistencies found for user ${userId}`);
      return 0;
    }

    console.log(`🔧 Fixing ${incorrectNotifications.length} notifications for user ${userId}`);

    // Get user's actual role
    const user = await getRows('SELECT role FROM users WHERE id = $1', [userId]);
    const actualUserRole = user[0].role;

    // Fix each notification
    for (const notification of incorrectNotifications) {
      await query(
        'UPDATE notifications SET role = $1 WHERE id = $2',
        [actualUserRole, notification.id]
      );
      console.log(`✅ Fixed notification ID ${notification.id}: ${notification.role} → ${actualUserRole}`);
    }

    return incorrectNotifications.length;
  } catch (error) {
    console.error('❌ Error fixing notification roles:', error);
    throw error;
  }
}

module.exports = {
  sendNotification,
  sendUserNotification,
  sendProviderNotification,
  sendAutoNotification,
  validateNotificationRoles,
  fixNotificationRoles,
  VALID_ROLES
};






