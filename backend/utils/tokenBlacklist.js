const { query, getRow } = require('../database/connection');
const logger = require('./logger');

/**
 * Add a token to the blacklist
 * @param {string} tokenJti - JWT ID (jti claim) from the token
 * @param {number} userId - User ID who owns the token
 * @param {string} reason - Reason for blacklisting ('logout', 'password_change', 'force_logout', 'security_breach')
 * @param {Date} expiresAt - When the token would naturally expire
 * @param {string} ipAddress - IP address of the request (optional)
 * @param {string} userAgent - User agent string (optional)
 * @returns {Promise<boolean>} Success status
 */
const blacklistToken = async (tokenJti, userId, reason, expiresAt, ipAddress = null, userAgent = null) => {
  try {
    await query(
      `INSERT INTO token_blacklist (token_jti, user_id, reason, expires_at, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (token_jti) DO NOTHING`,
      [tokenJti, userId, reason, expiresAt, ipAddress, userAgent]
    );
    
    logger.info('Token blacklisted', {
      tokenJti,
      userId,
      reason,
      ipAddress
    });
    
    return true;
  } catch (error) {
    logger.error('Error blacklisting token', {
      error: error.message,
      tokenJti,
      userId
    });
    return false;
  }
};

/**
 * Check if a token is blacklisted
 * @param {string} tokenJti - JWT ID (jti claim) to check
 * @returns {Promise<boolean>} True if blacklisted, false otherwise
 */
const isTokenBlacklisted = async (tokenJti) => {
  try {
    const result = await getRow(
      'SELECT 1 FROM token_blacklist WHERE token_jti = $1 AND expires_at > CURRENT_TIMESTAMP',
      [tokenJti]
    );
    return !!result;
  } catch (error) {
    logger.error('Error checking token blacklist', {
      error: error.message,
      tokenJti
    });
    // On error, fail closed (assume blacklisted for security)
    return true;
  }
};

/**
 * Blacklist all tokens for a specific user
 * Used when forcing logout of all sessions (e.g., password change, security breach)
 * @param {number} userId - User ID
 * @param {string} reason - Reason for blacklisting
 * @returns {Promise<number>} Number of sessions invalidated
 */
const blacklistAllUserTokens = async (userId, reason) => {
  try {
    // Get all active sessions for the user
    const sessions = await query(
      'SELECT token_jti, expires_at FROM user_sessions WHERE user_id = $1 AND is_active = TRUE',
      [userId]
    );
    
    if (sessions.rows.length === 0) {
      return 0;
    }
    
    // Blacklist all tokens
    for (const session of sessions.rows) {
      await blacklistToken(
        session.token_jti,
        userId,
        reason,
        session.expires_at
      );
    }
    
    // Mark all sessions as inactive
    await query(
      'UPDATE user_sessions SET is_active = FALSE WHERE user_id = $1',
      [userId]
    );
    
    logger.info('All user tokens blacklisted', {
      userId,
      reason,
      count: sessions.rows.length
    });
    
    return sessions.rows.length;
  } catch (error) {
    logger.error('Error blacklisting all user tokens', {
      error: error.message,
      userId
    });
    throw error;
  }
};

/**
 * Remove expired tokens from blacklist
 * Called by cleanup cron job
 * @returns {Promise<number>} Number of tokens removed
 */
const cleanupExpiredTokens = async () => {
  try {
    const result = await query(
      'DELETE FROM token_blacklist WHERE expires_at < CURRENT_TIMESTAMP'
    );
    
    const count = result.rowCount || 0;
    
    if (count > 0) {
      logger.info('Cleaned up expired blacklisted tokens', { count });
    }
    
    return count;
  } catch (error) {
    logger.error('Error cleaning up expired tokens', {
      error: error.message
    });
    return 0;
  }
};

/**
 * Get blacklist statistics for monitoring
 * @returns {Promise<Object>} Statistics about blacklisted tokens
 */
const getBlacklistStats = async () => {
  try {
    const stats = await getRow(`
      SELECT 
        COUNT(*) as total_blacklisted,
        COUNT(CASE WHEN reason = 'logout' THEN 1 END) as logout_count,
        COUNT(CASE WHEN reason = 'password_change' THEN 1 END) as password_change_count,
        COUNT(CASE WHEN reason = 'force_logout' THEN 1 END) as force_logout_count,
        COUNT(CASE WHEN reason = 'security_breach' THEN 1 END) as security_breach_count,
        COUNT(CASE WHEN blacklisted_at > CURRENT_TIMESTAMP - INTERVAL '24 hours' THEN 1 END) as last_24h_count
      FROM token_blacklist
      WHERE expires_at > CURRENT_TIMESTAMP
    `);
    
    return stats || {
      total_blacklisted: 0,
      logout_count: 0,
      password_change_count: 0,
      force_logout_count: 0,
      security_breach_count: 0,
      last_24h_count: 0
    };
  } catch (error) {
    logger.error('Error getting blacklist stats', {
      error: error.message
    });
    return null;
  }
};

/**
 * Get blacklisted tokens for a specific user
 * @param {number} userId - User ID
 * @returns {Promise<Array>} List of blacklisted tokens
 */
const getUserBlacklistedTokens = async (userId) => {
  try {
    const result = await query(
      `SELECT token_jti, reason, blacklisted_at, expires_at 
       FROM token_blacklist 
       WHERE user_id = $1 AND expires_at > CURRENT_TIMESTAMP
       ORDER BY blacklisted_at DESC`,
      [userId]
    );
    return result.rows || [];
  } catch (error) {
    logger.error('Error getting user blacklisted tokens', {
      error: error.message,
      userId
    });
    return [];
  }
};

module.exports = {
  blacklistToken,
  isTokenBlacklisted,
  blacklistAllUserTokens,
  cleanupExpiredTokens,
  getBlacklistStats,
  getUserBlacklistedTokens
};

