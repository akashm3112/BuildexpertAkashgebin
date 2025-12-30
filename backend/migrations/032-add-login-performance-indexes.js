/**
 * Migration: Add performance indexes for login endpoint
 * Purpose: Optimize login_attempts queries to reduce login response time
 * 
 * This migration adds indexes to support:
 * - IP-based blocking checks (shouldBlockIP)
 * - Phone-based failed attempt checks (getRecentFailedAttempts)
 * - Composite indexes for efficient time-window queries
 */

const { query } = require('../database/connection');

async function addLoginPerformanceIndexes() {
  console.log('  📊 Adding login performance indexes...');
  
  try {
    // Index for IP-based blocking checks (used by shouldBlockIP)
    // Covers: WHERE ip_address = ? AND attempt_type = 'failed' AND attempted_at > timestamp
    await query(`
      CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_type_time 
      ON login_attempts(ip_address, attempt_type, attempted_at DESC)
      WHERE attempt_type = 'failed';
    `);
    console.log('  ✅ Added composite index on login_attempts(ip_address, attempt_type, attempted_at DESC)');

    // Index for phone-based failed attempt checks (used by getRecentFailedAttempts)
    // Covers: WHERE phone = ? AND attempt_type = 'failed' AND attempted_at > timestamp
    await query(`
      CREATE INDEX IF NOT EXISTS idx_login_attempts_phone_type_time 
      ON login_attempts(phone, attempt_type, attempted_at DESC)
      WHERE attempt_type = 'failed';
    `);
    console.log('  ✅ Added composite index on login_attempts(phone, attempt_type, attempted_at DESC)');

    // Index for user lookup optimization (if not exists)
    await query(`
      CREATE INDEX IF NOT EXISTS idx_users_phone_role 
      ON users(phone, role);
    `);
    console.log('  ✅ Added composite index on users(phone, role)');

    // Index for blocked_identifiers lookup optimization
    await query(`
      CREATE INDEX IF NOT EXISTS idx_blocked_identifiers_lookup 
      ON blocked_identifiers(identifier_type, identifier_value, role);
    `);
    console.log('  ✅ Added composite index on blocked_identifiers(identifier_type, identifier_value, role)');

    console.log('  ✅ All login performance indexes added successfully');
    return { success: true };
  } catch (error) {
    console.error('  ❌ Error adding login performance indexes:', error.message);
    throw error;
  }
}

module.exports = addLoginPerformanceIndexes;

