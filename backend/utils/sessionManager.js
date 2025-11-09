const { query, getRow, getRows } = require('../database/connection');
const logger = require('./logger');
const UAParser = require('ua-parser-js');

/**
 * Parse user agent string to extract device information
 * @param {string} userAgent - User agent string
 * @returns {Object} Parsed device information
 */
const parseUserAgent = (userAgent) => {
  if (!userAgent) {
    return {
      deviceName: 'Unknown Device',
      deviceType: 'unknown',
      browser: 'Unknown',
      os: 'Unknown'
    };
  }
  
  const parser = new UAParser(userAgent);
  const result = parser.getResult();
  
  const browser = result.browser.name || 'Unknown';
  const os = result.os.name || 'Unknown';
  const deviceType = result.device.type || 'desktop';
  const deviceModel = result.device.model || '';
  const deviceVendor = result.device.vendor || '';
  
  let deviceName = 'Unknown Device';
  
  if (deviceModel) {
    deviceName = `${deviceVendor ? deviceVendor + ' ' : ''}${deviceModel}`;
  } else if (deviceType === 'mobile') {
    deviceName = `Mobile (${os})`;
  } else if (deviceType === 'tablet') {
    deviceName = `Tablet (${os})`;
  } else {
    deviceName = `${browser} on ${os}`;
  }
  
  return {
    deviceName,
    deviceType,
    browser,
    os
  };
};

/**
 * Create a new session for a user
 * @param {number} userId - User ID
 * @param {string} tokenJti - JWT ID (jti claim)
 * @param {Date} expiresAt - Session expiration time
 * @param {string} ipAddress - IP address
 * @param {string} userAgent - User agent string
 * @param {Object} location - Location data (optional)
 * @returns {Promise<Object>} Created session
 */
const createSession = async (userId, tokenJti, expiresAt, ipAddress, userAgent, location = {}) => {
  try {
    const deviceInfo = parseUserAgent(userAgent);
    
    const result = await query(
      `INSERT INTO user_sessions 
       (user_id, token_jti, device_name, device_type, ip_address, user_agent, 
        location_city, location_country, expires_at, created_at, last_activity)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING *`,
      [
        userId,
        tokenJti,
        deviceInfo.deviceName,
        deviceInfo.deviceType,
        ipAddress,
        userAgent,
        location.city || null,
        location.country || null,
        expiresAt
      ]
    );
    
    logger.info('Session created', {
      userId,
      deviceName: deviceInfo.deviceName,
      ipAddress
    });
    
    return result.rows[0];
  } catch (error) {
    logger.error('Error creating session', {
      error: error.message,
      userId,
      tokenJti
    });
    throw error;
  }
};

/**
 * Update session last activity timestamp
 * @param {string} tokenJti - JWT ID
 * @returns {Promise<boolean>} Success status
 */
const updateSessionActivity = async (tokenJti) => {
  try {
    await query(
      'UPDATE user_sessions SET last_activity = CURRENT_TIMESTAMP WHERE token_jti = $1 AND is_active = TRUE',
      [tokenJti]
    );
    return true;
  } catch (error) {
    logger.error('Error updating session activity', {
      error: error.message,
      tokenJti
    });
    return false;
  }
};

/**
 * Get a session by token JTI
 * @param {string} tokenJti - JWT ID
 * @returns {Promise<Object|null>} Session data or null
 */
const getSession = async (tokenJti) => {
  try {
    const session = await getRow(
      'SELECT * FROM user_sessions WHERE token_jti = $1',
      [tokenJti]
    );
    return session;
  } catch (error) {
    logger.error('Error getting session', {
      error: error.message,
      tokenJti
    });
    return null;
  }
};

/**
 * Get all active sessions for a user
 * @param {number} userId - User ID
 * @returns {Promise<Array>} List of active sessions
 */
const getUserSessions = async (userId) => {
  try {
    const sessions = await query(
      `SELECT 
        id, device_name, device_type, ip_address, 
        location_city, location_country, created_at, last_activity,
        expires_at, is_active
       FROM user_sessions 
       WHERE user_id = $1 AND is_active = TRUE AND expires_at > CURRENT_TIMESTAMP
       ORDER BY last_activity DESC`,
      [userId]
    );
    return sessions.rows || [];
  } catch (error) {
    logger.error('Error getting user sessions', {
      error: error.message,
      userId
    });
    return [];
  }
};

/**
 * Invalidate a specific session
 * @param {string} tokenJti - JWT ID
 * @param {number} userId - User ID (for security verification)
 * @returns {Promise<boolean>} Success status
 */
const invalidateSession = async (tokenJti, userId) => {
  try {
    const result = await query(
      'UPDATE user_sessions SET is_active = FALSE WHERE token_jti = $1 AND user_id = $2',
      [tokenJti, userId]
    );
    
    if (result.rowCount > 0) {
      logger.info('Session invalidated', {
        tokenJti,
        userId
      });
      return true;
    }
    return false;
  } catch (error) {
    logger.error('Error invalidating session', {
      error: error.message,
      tokenJti,
      userId
    });
    return false;
  }
};

/**
 * Invalidate all sessions for a user
 * @param {number} userId - User ID
 * @returns {Promise<number>} Number of sessions invalidated
 */
const invalidateAllUserSessions = async (userId) => {
  try {
    const result = await query(
      'UPDATE user_sessions SET is_active = FALSE WHERE user_id = $1::uuid AND is_active = TRUE',
      [userId]
    );
    
    const count = result.rowCount || 0;
    
    if (count > 0) {
      logger.info('All user sessions invalidated', {
        userId,
        count
      });
    }
    
    return count;
  } catch (error) {
    logger.error('Error invalidating all user sessions', {
      error: error.message,
      userId
    });
    return 0;
  }
};

/**
 * Invalidate a session by session ID
 * @param {number} sessionId - Session ID
 * @param {number} userId - User ID (for security verification)
 * @returns {Promise<boolean>} Success status
 */
const invalidateSessionById = async (sessionId, userId) => {
  try {
    const result = await query(
      'UPDATE user_sessions SET is_active = FALSE WHERE id = $1 AND user_id = $2::uuid',
      [sessionId, userId]
    );
    
    if (result.rowCount > 0) {
      logger.info('Session invalidated by ID', {
        sessionId,
        userId
      });
      return true;
    }
    return false;
  } catch (error) {
    logger.error('Error invalidating session by ID', {
      error: error.message,
      sessionId,
      userId
    });
    return false;
  }
};

/**
 * Get session count for a user
 * @param {number} userId - User ID
 * @returns {Promise<number>} Number of active sessions
 */
const getActiveSessionCount = async (userId) => {
  try {
    const result = await getRow(
      'SELECT COUNT(*) as count FROM user_sessions WHERE user_id = $1 AND is_active = TRUE AND expires_at > CURRENT_TIMESTAMP',
      [userId]
    );
    return parseInt(result?.count || 0, 10);
  } catch (error) {
    logger.error('Error getting session count', {
      error: error.message,
      userId
    });
    return 0;
  }
};

/**
 * Clean up expired sessions
 * @returns {Promise<number>} Number of sessions cleaned
 */
const cleanupExpiredSessions = async () => {
  try {
    const result = await query(
      `DELETE FROM user_sessions 
       WHERE expires_at < CURRENT_TIMESTAMP 
          OR (is_active = FALSE AND last_activity < CURRENT_TIMESTAMP - INTERVAL '30 days')`
    );
    
    const count = result.rowCount || 0;
    
    if (count > 0) {
      logger.info('Cleaned up expired sessions', { count });
    }
    
    return count;
  } catch (error) {
    logger.error('Error cleaning up expired sessions', {
      error: error.message
    });
    return 0;
  }
};

/**
 * Get session statistics for monitoring
 * @returns {Promise<Object>} Session statistics
 */
const getSessionStats = async () => {
  try {
    const stats = await getRow(`
      SELECT 
        COUNT(*) FILTER (WHERE is_active = TRUE) as active_sessions,
        COUNT(*) FILTER (WHERE is_active = FALSE) as inactive_sessions,
        COUNT(DISTINCT user_id) FILTER (WHERE is_active = TRUE) as active_users,
        COUNT(*) FILTER (WHERE device_type = 'mobile' AND is_active = TRUE) as mobile_sessions,
        COUNT(*) FILTER (WHERE device_type = 'desktop' AND is_active = TRUE) as desktop_sessions,
        COUNT(*) FILTER (WHERE device_type = 'tablet' AND is_active = TRUE) as tablet_sessions,
        COUNT(*) FILTER (WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '24 hours') as last_24h_sessions
      FROM user_sessions
      WHERE expires_at > CURRENT_TIMESTAMP
    `);
    
    return stats || {
      active_sessions: 0,
      inactive_sessions: 0,
      active_users: 0,
      mobile_sessions: 0,
      desktop_sessions: 0,
      tablet_sessions: 0,
      last_24h_sessions: 0
    };
  } catch (error) {
    logger.error('Error getting session stats', {
      error: error.message
    });
    return null;
  }
};

module.exports = {
  parseUserAgent,
  createSession,
  updateSessionActivity,
  getSession,
  getUserSessions,
  invalidateSession,
  invalidateAllUserSessions,
  invalidateSessionById,
  getActiveSessionCount,
  cleanupExpiredSessions,
  getSessionStats
};

