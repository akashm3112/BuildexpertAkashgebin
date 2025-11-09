const logger = require('./logger');
const { registry } = require('./memoryLeakPrevention');

/**
 * Create a queued rate limiter that enforces per-key rate limits with optional queueing.
 * Designed for high-traffic endpoints where we prefer shaping traffic over returning 429s.
 *
 * @param {Object} options
 * @param {number} options.windowMs - Rolling window duration in ms
 * @param {number} options.maxRequests - Maximum number of requests allowed per window
 * @param {number} options.concurrency - Maximum number of concurrent in-flight requests allowed
 * @param {number} options.queueLimit - Maximum queued requests per key before we reject
 * @param {function} options.keyGenerator - Function to derive rate-limit key from the request
 * @param {function} [options.onQueue] - Optional callback when a request is queued
 * @param {function} [options.onReject] - Optional callback when a request is rejected
 * @param {string} [options.metricName='queued-rate-limiter'] - Identifier for logging
 * @returns {function} Express middleware
 */
function createQueuedRateLimiter({
  windowMs,
  maxRequests,
  concurrency,
  queueLimit,
  keyGenerator,
  onQueue,
  onReject,
  metricName = 'queued-rate-limiter'
}) {
  if (!windowMs || !maxRequests || !concurrency || !queueLimit || !keyGenerator) {
    throw new Error('Missing configuration for queued rate limiter');
  }

  const state = new Map();
  const cleanupIntervalMs = 5 * 60 * 1000; // 5 minutes

  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of state.entries()) {
      if (
        entry.queue.length === 0 &&
        entry.inProgress === 0 &&
        now >= entry.resetTime &&
        entry.tokens === maxRequests
      ) {
        state.delete(key);
      }
    }
  }, cleanupIntervalMs);

  registry.registerTimer(`${metricName}-cleanup`, cleanupTimer, 'interval');
  registry.registerCleanup(() => clearInterval(cleanupTimer));

  const refillSweepInterval = Math.min(windowMs, 1000);
  const refillTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of state.entries()) {
      if (entry.queue.length > 0 && now >= entry.resetTime) {
        processQueue(key);
      }
    }
  }, refillSweepInterval);

  registry.registerTimer(`${metricName}-refill`, refillTimer, 'interval');
  registry.registerCleanup(() => clearInterval(refillTimer));

  const logContext = (extra = {}) => ({
    service: 'buildxpert-api',
    limiter: metricName,
    ...extra
  });

  const refillTokens = (entry) => {
    const now = Date.now();
    if (now >= entry.resetTime) {
      const windowsPassed = Math.floor((now - entry.resetTime) / windowMs) + 1;
      entry.tokens = maxRequests;
      entry.resetTime += windowsPassed * windowMs;
      entry.processedInWindow = 0;
    }
  };

  const processQueue = (key) => {
    const entry = state.get(key);
    if (!entry) return;

    refillTokens(entry);

    while (
      entry.queue.length > 0 &&
      entry.tokens > 0 &&
      entry.inProgress < concurrency
    ) {
      const nextTick = entry.queue.shift();
      entry.tokens -= 1;
      entry.inProgress += 1;
      entry.processedInWindow += 1;
      nextTick();
    }

    if (
      entry.queue.length === 0 &&
      entry.inProgress === 0 &&
      Date.now() >= entry.resetTime &&
      entry.tokens === maxRequests
    ) {
      state.delete(key);
    }
  };

  return function queuedRateLimiter(req, res, next) {
    const key = keyGenerator(req);
    if (!key) {
      logger.warn('Queued rate limiter: missing key, falling back to next()', logContext({ ip: req.ip }));
      return next();
    }

    let entry = state.get(key);
    if (!entry) {
      entry = {
        tokens: maxRequests,
        resetTime: Date.now() + windowMs,
        queue: [],
        inProgress: 0,
        processedInWindow: 0
      };
      state.set(key, entry);
    } else {
      refillTokens(entry);
    }

    const attempt = () => {
      const release = () => {
        res.removeListener('finish', release);
        res.removeListener('close', release);
        entry.inProgress = Math.max(0, entry.inProgress - 1);
        processQueue(key);
      };

      res.once('finish', release);
      res.once('close', release);
      next();
    };

    if (entry.tokens > 0 && entry.inProgress < concurrency) {
      entry.tokens -= 1;
      entry.inProgress += 1;
      entry.processedInWindow += 1;
      return attempt();
    }

    if (entry.queue.length >= queueLimit) {
      logger.warn('Queued rate limiter: queue limit reached, rejecting request', logContext({ key, queueLength: entry.queue.length }));

      if (typeof onReject === 'function') {
        return onReject(req, res);
      }

      return res.status(429).json({
        status: 'error',
        message: 'Too many requests. Please try again shortly.'
      });
    }

    entry.queue.push(() => {
      attempt();
    });

    if (typeof onQueue === 'function') {
      onQueue(req, entry.queue.length, {
        tokens: entry.tokens,
        inProgress: entry.inProgress
      });
    } else {
      logger.debug('Queued rate limiter: request queued', logContext({
        key,
        queueLength: entry.queue.length,
        tokensRemaining: entry.tokens,
        inProgress: entry.inProgress
      }));
    }
  };
}

module.exports = {
  createQueuedRateLimiter
};

