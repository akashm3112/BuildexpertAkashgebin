const { query, getRow } = require('../database/connection');
const logger = require('./logger');

/**
 * Log a security event
 * @param {number|null} userId - User ID (null for anonymous events)
 * @param {string} eventType - Event type (e.g., 'login', 'logout', 'password_change')
 * @param {string} eventDescription - Human-readable description
 * @param {string} ipAddress - IP address
 * @param {string} userAgent - User agent string
 * @param {string} severity - Event severity ('info', 'warning', 'critical')
 * @param {Object} metadata - Additional event-specific data
 * @returns {Promise<boolean>} Success status
 */
const logSecurityEvent = async (userId, eventType, eventDescription, ipAddress, userAgent, severity = 'info', metadata = {}) => {
  try {
    await query(
      `INSERT INTO security_events 
       (user_id, event_type, event_description, ip_address, user_agent, severity, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, eventType, eventDescription, ipAddress, userAgent, severity, JSON.stringify(metadata)]
    );
    
    logger.info('Security event logged', {
      userId,
      eventType,
      severity
    });
    
    return true;
  } catch (error) {
    logger.error('Error logging security event', {
      error: error.message,
      userId,
      eventType
    });
    return false;
  }
};

/**
 * Log a login attempt (success or failure)
 * @param {string} phone - Phone number used for login
 * @param {string} ipAddress - IP address
 * @param {string} attemptType - 'success', 'failed', or 'blocked'
 * @param {string|null} failureReason - Reason for failure (if applicable)
 * @param {string} userAgent - User agent string
 * @param {number|null} userId - User ID (if user exists)
 * @returns {Promise<boolean>} Success status
 */
const logLoginAttempt = async (phone, ipAddress, attemptType, failureReason, userAgent, userId = null) => {
  try {
    await query(
      `INSERT INTO login_attempts 
       (phone, ip_address, attempt_type, failure_reason, user_agent, user_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [phone, ipAddress, attemptType, failureReason, userAgent, userId]
    );
    
    return true;
  } catch (error) {
    logger.error('Error logging login attempt', {
      error: error.message,
      phone,
      attemptType
    });
    return false;
  }
};

/**
 * Get failed login attempts for a phone number in the last N minutes
 * @param {string} phone - Phone number
 * @param {number} minutes - Time window in minutes (default: 15)
 * @returns {Promise<number>} Number of failed attempts
 */
const getRecentFailedAttempts = async (phone, minutes = 15) => {
  try {
    // PRODUCTION FIX: Use parameterized query to prevent SQL injection and improve performance
    const result = await getRow(
      `SELECT COUNT(*) as count 
       FROM login_attempts 
       WHERE phone = $1 
         AND attempt_type = 'failed' 
         AND attempted_at > CURRENT_TIMESTAMP - ($2 || ' minutes')::INTERVAL`,
      [phone, minutes.toString()]
    );
    return parseInt(result?.count || 0, 10);
  } catch (error) {
    logger.error('Error getting recent failed attempts', {
      error: error.message,
      phone
    });
    return 0;
  }
};

/**
 * Get failed login attempts from an IP address in the last N minutes
 * @param {string} ipAddress - IP address
 * @param {number} minutes - Time window in minutes (default: 15)
 * @returns {Promise<number>} Number of failed attempts
 */
const getRecentFailedAttemptsFromIP = async (ipAddress, minutes = 15) => {
  try {
    // PRODUCTION FIX: Use parameterized query to prevent SQL injection and improve performance
    const result = await getRow(
      `SELECT COUNT(*) as count 
       FROM login_attempts 
       WHERE ip_address = $1 
         AND attempt_type = 'failed' 
         AND attempted_at > CURRENT_TIMESTAMP - ($2 || ' minutes')::INTERVAL`,
      [ipAddress, minutes.toString()]
    );
    return parseInt(result?.count || 0, 10);
  } catch (error) {
    logger.error('Error getting recent failed attempts from IP', {
      error: error.message,
      ipAddress
    });
    return 0;
  }
};

/**
 * Check if an IP address should be temporarily blocked
 * @param {string} ipAddress - IP address to check
 * @param {number} threshold - Max failed attempts before blocking (default: 10)
 * @param {number} minutes - Time window in minutes (default: 15)
 * @returns {Promise<boolean>} True if should be blocked
 */
const shouldBlockIP = async (ipAddress, threshold = 10, minutes = 15) => {
  const attempts = await getRecentFailedAttemptsFromIP(ipAddress, minutes);
  return attempts >= threshold;
};

/**
 * Get security events for a user
 * @param {number} userId - User ID
 * @param {number} limit - Maximum number of events to return (default: 50)
 * @returns {Promise<Array>} List of security events
 */
const getUserSecurityEvents = async (userId, limit = 50) => {
  try {
    const result = await query(
      `SELECT event_type, event_description, ip_address, severity, metadata, created_at
       FROM security_events
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit]
    );
    return result.rows || [];
  } catch (error) {
    logger.error('Error getting user security events', {
      error: error.message,
      userId
    });
    return [];
  }
};

/**
 * Get critical security events
 * @param {number} hours - Time window in hours (default: 24)
 * @param {number} limit - Maximum number of events to return (default: 100)
 * @returns {Promise<Array>} List of critical events
 */
const getCriticalSecurityEvents = async (hours = 24, limit = 100) => {
  try {
    const result = await query(
      `SELECT user_id, event_type, event_description, ip_address, severity, metadata, created_at
       FROM security_events
       WHERE severity = 'critical'
         AND created_at > CURRENT_TIMESTAMP - INTERVAL '${hours} hours'
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );
    return result.rows || [];
  } catch (error) {
    logger.error('Error getting critical security events', {
      error: error.message
    });
    return [];
  }
};

/**
 * Clean up old security data
 * @returns {Promise<Object>} Cleanup statistics
 */
const cleanupOldSecurityData = async () => {
  try {
    // Remove login attempts older than 90 days
    const loginResult = await query(
      "DELETE FROM login_attempts WHERE attempted_at < CURRENT_TIMESTAMP - INTERVAL '90 days'"
    );
    
    // Remove security events older than 1 year
    const eventsResult = await query(
      "DELETE FROM security_events WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '1 year'"
    );
    
    const stats = {
      loginAttemptsRemoved: loginResult.rowCount || 0,
      securityEventsRemoved: eventsResult.rowCount || 0
    };
    
    logger.info('Security data cleanup completed', stats);
    
    return stats;
  } catch (error) {
    logger.error('Error cleaning up security data', {
      error: error.message
    });
    return {
      loginAttemptsRemoved: 0,
      securityEventsRemoved: 0
    };
  }
};

/**
 * Get login attempt statistics
 * @param {number} hours - Time window in hours (default: 24)
 * @returns {Promise<Object>} Login statistics
 */
const getLoginStats = async (hours = 24) => {
  try {
    const stats = await getRow(`
      SELECT 
        COUNT(*) as total_attempts,
        COUNT(*) FILTER (WHERE attempt_type = 'success') as successful_logins,
        COUNT(*) FILTER (WHERE attempt_type = 'failed') as failed_logins,
        COUNT(*) FILTER (WHERE attempt_type = 'blocked') as blocked_attempts,
        COUNT(DISTINCT phone) as unique_phones,
        COUNT(DISTINCT ip_address) as unique_ips
      FROM login_attempts
      WHERE attempted_at > CURRENT_TIMESTAMP - INTERVAL '${hours} hours'
    `);
    
    return stats || {
      total_attempts: 0,
      successful_logins: 0,
      failed_logins: 0,
      blocked_attempts: 0,
      unique_phones: 0,
      unique_ips: 0
    };
  } catch (error) {
    logger.error('Error getting login stats', {
      error: error.message
    });
    return null;
  }
};

module.exports = {
  logSecurityEvent,
  logLoginAttempt,
  getRecentFailedAttempts,
  getRecentFailedAttemptsFromIP,
  shouldBlockIP,
  getUserSecurityEvents,
  getCriticalSecurityEvents,
  cleanupOldSecurityData,
  getLoginStats
};

