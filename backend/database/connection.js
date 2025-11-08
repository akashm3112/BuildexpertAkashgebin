const { Pool } = require('pg');
const config = require('../utils/config');

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
const query = async (text, params) => {
  const start = Date.now();
  const maxRetries = 2;
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await pool.query(text, params);
      const duration = Date.now() - start;
      
      // Only log in development mode to avoid performance issues
      if (config.isDevelopment() && config.get('security.enableQueryLogging')) {
        console.log('Executed query', {
          text: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
          duration: `${duration}ms`,
          rows: res.rowCount,
          attempt: attempt > 0 ? attempt + 1 : undefined
        });
      }
      
      return res;
    } catch (error) {
      lastError = error;
      
      // Check if error is retryable
      const isRetryable = error.code === 'ECONNREFUSED' || 
                          error.code === 'ECONNRESET' || 
                          error.code === '57014' || // Query timeout
                          error.code === '08003' || // Connection does not exist
                          error.code === '08006';   // Connection failure
      
      const isLastAttempt = attempt === maxRetries;
      
      if (!isRetryable || isLastAttempt) {
        // Log error with appropriate context
        console.error('Database query error:', {
          message: error.message,
          code: error.code,
          query: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
          params: params ? params.length : 0,
          attempts: attempt + 1
        });
        throw error;
      }
      
      // Log retry
      console.warn(`Database query failed, retrying (attempt ${attempt + 1}/${maxRetries + 1})`, {
        error: error.message,
        code: error.code
      });
      
      // Wait before retrying (exponential backoff)
      const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
      await new Promise(resolve => setTimeout(resolve, delay));
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
  getRows
}; 