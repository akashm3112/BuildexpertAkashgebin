const { getRows, query } = require('../database/connection');
const { formatNotificationTimestamp } = require('./timezone');
const notificationQueue = require('./notificationQueue');
const logger = require('./logger');

const VALID_ROLES = ['user', 'provider', 'admin'];

const getIO = () => require('../server').io;

const resolveUserRole = async (userId, preferredRole = null) => {
  if (preferredRole && VALID_ROLES.includes(preferredRole)) return preferredRole;

  const result = await getRows('SELECT role FROM users WHERE id = $1', [userId]);
  if (!result.length) {
    throw new Error(`User ${userId} not found`);
  }

  return result[0].role;
};

const persistNotification = async ({ userId, title, message, role, metadata = {} }) => {
  const result = await query(
    `
      INSERT INTO notifications (user_id, title, message, role, translation_params)
      VALUES ($1, $2, $3, $4, $5::jsonb)
      RETURNING *
    `,
    [userId, title, message, role, JSON.stringify(metadata)]
  );

  const notification = result.rows[0];
  const timestampData = formatNotificationTimestamp(notification.created_at);

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

  logger.logic('Notification delivered', {
    notificationId: notification.id,
    userId,
    role
  });

  return notification;
};

async function deliverQueuedNotification(queueItem) {
  const role = queueItem.role || await resolveUserRole(queueItem.user_id);
  return persistNotification({
    userId: queueItem.user_id,
    title: queueItem.title,
    message: queueItem.message,
    role,
    metadata: queueItem.metadata || {}
  });
}

async function sendNotification(userId, title, message, role = null, metadata = {}) {
  if (!userId || !title || !message) {
    throw new Error('Missing required notification parameters');
  }

  const resolvedRole = await resolveUserRole(userId, role);

  if (notificationQueue.isWarm()) {
    await notificationQueue.enqueueNotification({
      userId,
      title,
      message,
      role: resolvedRole,
      metadata
    });

    logger.resilience('Notification queued', {
      userId,
      role: resolvedRole
    });

    return { status: 'queued' };
  }

  logger.resilience('Notification queue cold, delivering inline', {
    userId,
    role: resolvedRole
  });

  return persistNotification({ userId, title, message, role: resolvedRole, metadata });
}

async function sendUserNotification(userId, title, message, metadata) {
  return sendNotification(userId, title, message, 'user', metadata);
}

async function sendProviderNotification(userId, title, message, metadata) {
  return sendNotification(userId, title, message, 'provider', metadata);
}

async function sendAutoNotification(userId, title, message, metadata) {
  return sendNotification(userId, title, message, null, metadata);
}

async function validateNotificationRoles(userId) {
  const user = await getRows('SELECT role FROM users WHERE id = $1', [userId]);
  if (user.length === 0) {
    throw new Error('User not found');
  }

  const actualUserRole = user[0].role;

  const incorrectNotifications = await getRows(
    'SELECT id, title, role FROM notifications WHERE user_id = $1 AND role != $2',
    [userId, actualUserRole]
  );

  return incorrectNotifications;
}

async function fixNotificationRoles(userId) {
  const incorrectNotifications = await validateNotificationRoles(userId);

  if (incorrectNotifications.length === 0) {
    return 0;
  }

  const user = await getRows('SELECT role FROM users WHERE id = $1', [userId]);
  const actualUserRole = user[0].role;

  for (const notification of incorrectNotifications) {
    await query(
      'UPDATE notifications SET role = $1 WHERE id = $2',
      [actualUserRole, notification.id]
    );
  }

  return incorrectNotifications.length;
}

module.exports = {
  sendNotification,
  sendUserNotification,
  sendProviderNotification,
  sendAutoNotification,
  validateNotificationRoles,
  fixNotificationRoles,
  deliverQueuedNotification,
  VALID_ROLES
};

