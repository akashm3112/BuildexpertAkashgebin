const { Pool } = require('pg');
const config = require('../utils/config');
const logger = require('../utils/logger');
const { sleep } = require('../utils/retryLogic');

// Enhanced database configuration for production readiness
const pool = new Pool({
  connectionString: config.get('database.url'),
  ssl: { rejectUnauthorized: false },
  // Connection pool settings
  max: 20, // Maximum number of clients in the pool
  min: 2, // Keep minimum connections alive (prevents cold starts)
  idleTimeoutMillis: 60000, // Close idle clients after 60 seconds (increased for cloud DBs)
  connectionTimeoutMillis: 15000, // Return an error after 15 seconds if connection could not be established (increased for reliability)
  // Set timezone to IST (India Standard Time)
  timezone: 'Asia/Kolkata',
  // Allow pool to create connections on demand
  allowExitOnIdle: false
});

// Set timezone for new connections and validate them
pool.on('connect', (client) => {
  // Set timezone for this connection (silently)
  client.query('SET timezone = "Asia/Kolkata"').catch(err => {
    // Only log timezone setting errors, not the connection itself
    logger.error('Failed to set timezone for database connection', {
      message: err.message
    });
  });
  
  // Validate connection is alive
  client.on('error', (err) => {
    // Connection error - pool will handle reconnection
    logger.resilience('Database client connection error', {
      message: err.message,
      code: err.code
    });
  });
});

// Monitor pool acquisition for connection health
pool.on('acquire', (client) => {
  // Validate connection before use (only in production to avoid overhead)
  if (config.isProduction()) {
    // Quick validation - if connection is dead, pool will create new one
    // This is handled automatically by pg-pool
  }
});

pool.on('error', (err) => {
  // Handle connection errors gracefully - don't crash the app
  // This happens when idle connections are terminated by the database server
  logger.resilience('Database pool error (idle connection terminated)', {
    message: err.message,
    code: err.code,
    severity: 'low' // This is expected behavior for idle connections
  });
  
  // Never exit the process - let the pool handle reconnection automatically
  // The pool will create new connections as needed
});

// One-time connection test at startup (only runs once when module is loaded)
let connectionTested = false;
(async () => {
  try {
    const result = await pool.query('SELECT NOW()');
    if (!connectionTested) {
      console.log('✅ Database connection pool initialized successfully');
      connectionTested = true;
    }
  } catch (error) {
    console.error('❌ Failed to connect to PostgreSQL database:', error.message);
    console.error('   Please check your DATABASE_URL in config.env');
    // In production, we might want to retry or exit gracefully
    if (config.isDevelopment()) {
      process.exit(1);
    }
  }
})();

// Helper function to execute queries with enhanced error handling and retry logic
const RETRYABLE_DATABASE_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  '57P01', // admin shutdown
  '57P02', // crash shutdown
  '57P03', // cannot connect now
  '57014', // query cancelled / timeout
  '08003', // connection does not exist
  '08006', // connection failure
  '53300', // too many connections
  '40001', // serialization failure
  '57P04', // database system is starting up
  '57P05', // database system is shutting down
]);

// Check if error message indicates connection termination (for cases where code might not be set)
const isConnectionTerminatedError = (error) => {
  if (!error) return false;
  const message = error.message || '';
  return message.includes('Connection terminated') ||
         message.includes('connection closed') ||
         message.includes('Connection ended') ||
         message.includes('socket hang up') ||
         message.includes('ECONNRESET');
};

const SLEEP_BASE_MS = 100;
const BACKOFF_STEPS = [100, 300, 900];

const isRetryableDatabaseError = (error) => {
  if (!error) return false;
  
  // Check error code first
  if (error.code && RETRYABLE_DATABASE_CODES.has(error.code)) {
    return true;
  }
  
  // Check error message for connection termination patterns
  if (isConnectionTerminatedError(error)) {
    return true;
  }
  
  return false;
};

const query = async (text, params) => {
  const start = Date.now();
  const maxRetries = config.isProduction() ? 3 : 2; // More retries in production
  let lastError;
  
  // Get metrics collector if available
  let metricsCollector;
  try {
    metricsCollector = require('../utils/monitoring').metricsCollector;
  } catch (e) {
    // Monitoring not available, continue without it
  }
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // The pool automatically handles connection validation and reconnection
      // If a connection is dead, it will create a new one automatically
      const res = await pool.query(text, params);
      const duration = Date.now() - start;
      
      // Record database query metrics
      if (metricsCollector) {
        const isSlow = duration > 1000; // Queries > 1 second are slow
        metricsCollector.recordDatabaseQuery(duration, isSlow, null);
      }
      
      if (config.isDevelopment() && config.get('security.enableQueryLogging')) {
        console.log('Executed query', {
          text: typeof text === 'string' ? text.substring(0, 100) + (text.length > 100 ? '...' : '') : 'dynamic query',
          duration: `${duration}ms`,
          rows: res.rowCount,
          attempt: attempt > 0 ? attempt + 1 : undefined
        });
      }
      
      if (attempt > 0) {
        logger.resilience('Database query recovered after retry', {
          attempts: attempt + 1,
          duration,
          queryPreview: typeof text === 'string' ? text.substring(0, 80) : 'dynamic query'
        });
      }
      
      return res;
    } catch (error) {
      lastError = error;
      const retryable = isRetryableDatabaseError(error);
      const isLastAttempt = attempt === maxRetries;
      const duration = Date.now() - start;
      
      // Record database error metrics
      if (metricsCollector) {
        metricsCollector.recordDatabaseQuery(duration, false, error);
      }
      
      if (!retryable || isLastAttempt) {
        logger.error('Database query error', {
          message: error.message,
          code: error.code,
          queryPreview: typeof text === 'string' ? text.substring(0, 120) : 'dynamic query',
          paramsCount: Array.isArray(params) ? params.length : 0,
          attempts: attempt + 1,
          duration,
          failureCategory: retryable ? 'resilience' : 'logic',
          error: error // Pass full error for stack trace enhancement
        });
        throw error;
      }
      
      // For connection termination errors, use exponential backoff with jitter
      const isConnectionError = isConnectionTerminatedError(error);
      const baseDelay = isConnectionError 
        ? 200 // Start with 200ms for connection errors
        : BACKOFF_STEPS[Math.min(attempt, BACKOFF_STEPS.length - 1)];
      
      // Exponential backoff: 200ms, 400ms, 800ms for connection errors
      const delay = baseDelay * Math.pow(2, attempt);
      const jitter = Math.floor(Math.random() * 100);
      const backoff = Math.min(delay + jitter, 2000); // Cap at 2 seconds
      
      // Only log retries in production if they're connection errors (expected)
      if (isConnectionError && config.isProduction()) {
        logger.resilience('Database connection retry (expected for idle connections)', {
          attempt: attempt + 1,
          maxRetries,
          delay: backoff,
          error: error.message
        });
      } else if (!config.isProduction()) {
        logger.resilience('Database query retry scheduled', {
          attempt: attempt + 1,
          maxRetries,
          delay: backoff,
          error: error.message,
          code: error.code,
          isConnectionError
        });
      }
      
      await sleep(backoff);
      
      // Pool automatically creates new connections when old ones are terminated
      // No manual reconnection needed - just retry the query
    }
  }
  
  throw lastError;
};

const withTransaction = async (handler, { retries = config.isProduction() ? 2 : 1, name = 'transaction' } = {}) => {
  let lastError;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await handler(client);
      await client.query('COMMIT');
      
      if (attempt > 0) {
        logger.resilience(`${name} succeeded after retry`, { attempts: attempt });
      }
      
      return result;
    } catch (error) {
      lastError = error;
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        logger.error('Transaction rollback failed', {
          message: rollbackError.message,
          originalError: error.message
        });
      }
      
      const retryable = isRetryableDatabaseError(error);
      const isLastAttempt = attempt === retries;
      
      if (!retryable || isLastAttempt) {
        logger.error(`${name} aborted`, {
          message: error.message,
          code: error.code,
          attempts: attempt + 1,
          failureCategory: retryable ? 'resilience' : 'logic'
        });
        throw error;
      }
      
      const delay = BACKOFF_STEPS[Math.min(attempt, BACKOFF_STEPS.length - 1)];
      const jitter = Math.floor(Math.random() * 60);
      const backoff = delay + jitter;
      
      logger.resilience(`${name} retry scheduled`, {
        attempt: attempt + 1,
        maxRetries: retries,
        delay: backoff,
        error: error.message,
        code: error.code
      });
      
      await sleep(backoff);
    } finally {
      client.release();
    }
  }
  
  throw lastError;
};

// Helper function to get a single row
const getRow = async (text, params) => {
  const result = await query(text, params);
  return result.rows[0];
};

// Helper function to get multiple rows
const getRows = async (text, params) => {
  const result = await query(text, params);
  return result.rows;
};

// Connection health check - keeps connections alive and detects dead connections
// This prevents "Connection terminated unexpectedly" errors when app is idle
// Production-ready: Only runs when there are idle connections, configurable interval
let healthCheckInterval = null;
let lastHealthCheckTime = 0;
const HEALTH_CHECK_INTERVAL_MS = 50000; // Check every 50 seconds (before 60s idle timeout)
const MIN_TIME_BETWEEN_CHECKS = 30000; // Minimum 30 seconds between checks

const startConnectionHealthCheck = () => {
  // Only start if not already running
  if (healthCheckInterval) return;
  
  // Run health check at configured interval
  healthCheckInterval = setInterval(async () => {
    const now = Date.now();
    
    // Skip if checked recently (throttle)
    if (now - lastHealthCheckTime < MIN_TIME_BETWEEN_CHECKS) {
      return;
    }
    
    // Only check if there are idle connections to keep alive
    const idleCount = pool.idleCount || 0;
    const totalCount = pool.totalCount || 0;
    
    // If no idle connections, skip health check (connections are in use)
    if (idleCount === 0 && totalCount < pool.options.max) {
      return;
    }
    
    lastHealthCheckTime = now;
    
    try {
      // Simple query to keep connections alive and detect dead ones
      // This validates the connection pool is healthy
      await pool.query('SELECT 1');
    } catch (error) {
      // Log but don't throw - the pool will handle reconnection automatically
      // This is expected when connections are terminated by the database server
      logger.resilience('Connection health check failed (pool will auto-recover)', {
        message: error.message,
        code: error.code,
        idleConnections: idleCount,
        totalConnections: totalCount
      });
    }
  }, HEALTH_CHECK_INTERVAL_MS);
  
  if (config.isDevelopment()) {
    logger.info('Database connection health check started', {
      interval: HEALTH_CHECK_INTERVAL_MS
    });
  }
};

const stopConnectionHealthCheck = () => {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
    if (config.isDevelopment()) {
      logger.info('Database connection health check stopped');
    }
  }
};

// Start health check automatically (only in production or if enabled)
if (config.isProduction() || config.get('database.enableHealthCheck') !== false) {
  startConnectionHealthCheck();
}

// Cleanup on process exit
process.on('SIGINT', () => {
  stopConnectionHealthCheck();
  pool.end();
});

process.on('SIGTERM', () => {
  stopConnectionHealthCheck();
  pool.end();
});

module.exports = {
  pool,
  query,
  getRow,
  getRows,
  withTransaction,
  isRetryableDatabaseError,
  startConnectionHealthCheck,
  stopConnectionHealthCheck
}; 