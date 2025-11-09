const { query, withTransaction } = require('../database/connection');
const logger = require('./logger');
const { registry } = require('./memoryLeakPrevention');

const DEFAULT_POLL_INTERVAL = parseInt(process.env.NOTIFICATION_QUEUE_POLL_INTERVAL || '2000', 10);
const DEFAULT_BATCH_SIZE = parseInt(process.env.NOTIFICATION_QUEUE_BATCH_SIZE || '25', 10);
const MAX_ATTEMPTS = parseInt(process.env.NOTIFICATION_QUEUE_MAX_ATTEMPTS || '5', 10);

const workerId = `${process.env.INSTANCE_ID || 'node'}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

let pollIntervalHandle = null;
let pollIntervalMs = DEFAULT_POLL_INTERVAL;
let warm = false;
let processing = false;

const getDelayForAttempt = (attempt) => {
  const baseMinutes = Math.min(15, Math.pow(2, attempt));
  return baseMinutes * 60 * 1000;
};

const enqueueNotification = async ({ userId, title, message, role, metadata = {} }) => {
  await query(`
    INSERT INTO notification_delivery_queue
      (user_id, title, message, role, metadata, status, max_attempts)
    VALUES
      ($1, $2, $3, $4, $5::jsonb, 'pending', $6)
  `, [userId, title, message, role || null, JSON.stringify(metadata || {}), MAX_ATTEMPTS]);
};

const markDelivered = async (id) => {
  await query(`
    UPDATE notification_delivery_queue
       SET status = 'delivered',
           delivered_at = NOW(),
           last_error = NULL,
           locked_by = NULL,
           updated_at = NOW()
     WHERE id = $1
  `, [id]);
};

const markFailedOrRetry = async (queueItem, error) => {
  const attempts = queueItem.attempts + 1;
  const isTerminal = attempts >= queueItem.max_attempts;
  const nextAttempt = new Date(Date.now() + getDelayForAttempt(attempts));

  await query(`
    UPDATE notification_delivery_queue
       SET attempts = attempts + 1,
           status = $2,
           next_attempt_at = $3,
           last_error = $4,
           locked_by = NULL,
           updated_at = NOW()
     WHERE id = $1
  `, [
    queueItem.id,
    isTerminal ? 'failed' : 'pending',
    isTerminal ? null : nextAttempt,
    error?.message || 'Unknown notification delivery error'
  ]);

  logger[isTerminal ? 'logic' : 'resilience']('Notification delivery failure', {
    queueId: queueItem.id,
    userId: queueItem.user_id,
    attempts,
    maxAttempts: queueItem.max_attempts,
    terminal: isTerminal,
    error: error?.message
  });
};

const claimBatch = async () => {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `
        SELECT id, user_id, title, message, role, metadata, attempts, max_attempts
          FROM notification_delivery_queue
         WHERE status = 'pending'
           AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
         ORDER BY priority DESC NULLS LAST, created_at
         FOR UPDATE SKIP LOCKED
         LIMIT $1
      `,
      [DEFAULT_BATCH_SIZE]
    );

    if (!rows.length) {
      return [];
    }

    const ids = rows.map((row) => row.id);
    await client.query(
      `
        UPDATE notification_delivery_queue
           SET status = 'processing',
               locked_by = $2,
               processing_started_at = NOW(),
               updated_at = NOW()
         WHERE id = ANY($1)
      `,
      [ids, workerId]
    );

    return rows;
  }, { name: 'notification_queue_claim' });
};

const deliverItem = async (queueItem) => {
  const notifications = require('./notifications');

  try {
    await notifications.deliverQueuedNotification(queueItem);
    await markDelivered(queueItem.id);
  } catch (error) {
    await markFailedOrRetry(queueItem, error);
  }
};

const processBatch = async () => {
  if (processing) return;
  processing = true;

  try {
    const items = await claimBatch();
    if (!items.length) return;

    logger.resilience('Notification queue batch picked', {
      workerId,
      count: items.length
    });

    for (const item of items) {
      await deliverItem(item);
    }
  } catch (error) {
    logger.resilience('Notification queue processor error', { error: error.message });
  } finally {
    processing = false;
  }
};

const start = (options = {}) => {
  if (pollIntervalHandle) return;

  pollIntervalMs = options.pollInterval || DEFAULT_POLL_INTERVAL;
  warm = true;

  pollIntervalHandle = setInterval(processBatch, pollIntervalMs);
  registry.registerTimer('notification-queue', pollIntervalHandle);

  // Kick off immediately
  processBatch().catch((error) => {
    logger.resilience('Notification queue initial run failed', { error: error.message });
  });

  logger.resilience('Notification queue processor started', {
    workerId,
    interval: pollIntervalMs,
    batchSize: DEFAULT_BATCH_SIZE
  });
};

const stop = () => {
  if (pollIntervalHandle) {
    clearInterval(pollIntervalHandle);
    pollIntervalHandle = null;
  }
  warm = false;
  processing = false;
};

module.exports = {
  enqueueNotification,
  start,
  stop,
  workerId,
  isWarm: () => warm
};

