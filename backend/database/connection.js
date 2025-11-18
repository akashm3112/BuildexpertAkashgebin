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
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 10000, // Return an error after 10 seconds if connection could not be established                                                    
  // Set timezone to IST (India Standard Time)
  timezone: 'Asia/Kolkata'
});

// Set timezone for new connections (no logging - this happens frequently)
pool.on('connect', (client) => {
  // Set timezone for this connection (silently)
  client.query('SET timezone = "Asia/Kolkata"').catch(err => {
    // Only log timezone setting errors, not the connection itself
    console.error('❌ Failed to set timezone for database connection:', err.message);
  });
});

pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle client', err);
  // Don't exit the process in production, just log the error
  if (config.isDevelopment()) {
    process.exit(-1);
  }
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
  '57P01', // admin shutdown
  '57P02', // crash shutdown
  '57P03', // cannot connect now
  '57014', // query cancelled / timeout
  '08003', // connection does not exist
  '08006', // connection failure
  '53300', // too many connections
  '40001'  // serialization failure
]);

const SLEEP_BASE_MS = 100;
const BACKOFF_STEPS = [100, 300, 900];

const isRetryableDatabaseError = (error) => {
  if (!error || !error.code) return false;
  return RETRYABLE_DATABASE_CODES.has(error.code);
};

const query = async (text, params) => {
  const start = Date.now();
  const maxRetries = config.isProduction() ? 2 : 2;
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
          attempts: attempt,
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
      
      const delay = BACKOFF_STEPS[Math.min(attempt, BACKOFF_STEPS.length - 1)];
      const jitter = Math.floor(Math.random() * 50);
      const backoff = delay + jitter;
      
      logger.resilience('Database query retry scheduled', {
        attempt: attempt + 1,
        maxRetries,
        delay: backoff,
        error: error.message,
        code: error.code
      });
      
      await sleep(backoff);
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

module.exports = {
  pool,
  query,
  getRow,
  getRows,
  withTransaction,
  isRetryableDatabaseError
}; 