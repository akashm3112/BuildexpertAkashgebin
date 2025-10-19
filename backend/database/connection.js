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

// Test the connection
pool.on('connect', (client) => {
  console.log('✅ Connected to PostgreSQL database');
  // Set timezone for this connection
  client.query('SET timezone = "Asia/Kolkata"');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle client', err);
  // Don't exit the process in production, just log the error
  if (config.isDevelopment()) {
    process.exit(-1);
  }
});

// Helper function to execute queries with enhanced error handling
const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    
    // Only log in development mode to avoid performance issues
    if (config.isDevelopment() && config.get('security.enableQueryLogging')) {
      console.log('Executed query', { 
        text: text.substring(0, 100) + (text.length > 100 ? '...' : ''), 
        duration: `${duration}ms`, 
        rows: res.rowCount 
      });
    }
    
    return res;
  } catch (error) {
    console.error('Database query error:', {
      message: error.message,
      code: error.code,
      query: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
      params: params ? params.length : 0
    });
    throw error;
  }
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