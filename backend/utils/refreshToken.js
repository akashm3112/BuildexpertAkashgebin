const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { query, getRow, withTransaction } = require('../database/connection');
const { blacklistToken } = require('./tokenBlacklist');
const logger = require('./logger');
const config = require('./config');
const UAParser = require('ua-parser-js');

/**
 * Refresh Token Utility
 * Implements secure refresh token mechanism with token rotation
 */

// Token expiration times
const ACCESS_TOKEN_EXPIRY = '15m'; // 15 minutes
const REFRESH_TOKEN_EXPIRY = '30d'; // 30 days (users stay logged in for 30 days)
const REFRESH_TOKEN_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds

/**
 * Parse user agent to get device info
 */
const parseUserAgent = (userAgent) => {
  if (!userAgent) {
    return { deviceName: 'Unknown Device', deviceType: 'unknown' };
  }
  
  const parser = new UAParser(userAgent);
  const result = parser.getResult();
  
  const deviceType = result.device.type || 'desktop';
  const deviceModel = result.device.model || '';
  const deviceVendor = result.device.vendor || '';
  const browser = result.browser.name || 'Unknown';
  const os = result.os.name || 'Unknown';
  
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
  
  return { deviceName, deviceType };
};

/**
 * Generate a secure random refresh token
 */
const generateRefreshToken = () => {
  return crypto.randomBytes(64).toString('hex');
};

/**
 * Hash refresh token for storage
 */
const hashRefreshToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

/**
 * Generate access token and refresh token pair
 */
const generateTokenPair = async (userId, userRole, ipAddress, userAgent) => {
  const accessTokenJti = crypto.randomUUID();
  const refreshTokenJti = crypto.randomUUID();
  const familyId = crypto.randomUUID(); // Token family for rotation
  
  // Generate random refresh token (plain text, sent to client)
  const refreshToken = generateRefreshToken();
  const refreshTokenHash = hashRefreshToken(refreshToken);
  
  // Calculate expiration times
  const accessTokenExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
  const refreshTokenExpiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS); // 7 days
  
  // Generate access token JWT
  const accessToken = jwt.sign(
    {
      userId,
      role: userRole,
      jti: accessTokenJti,
      type: 'access'
    },
    config.get('jwt.secret'),
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
  
  // Get device info
  const deviceInfo = parseUserAgent(userAgent);
  
  // Store refresh token hash in database (store jti for tracking, but lookup by hash)
  await query(`
    INSERT INTO refresh_tokens 
    (user_id, token_hash, token_jti, access_token_jti, device_name, device_type, 
     ip_address, user_agent, expires_at, family_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
  `, [
    userId,
    refreshTokenHash,
    refreshTokenJti,
    accessTokenJti,
    deviceInfo.deviceName,
    deviceInfo.deviceType,
    ipAddress,
    userAgent,
    refreshTokenExpiresAt,
    familyId
  ]);
  
  return {
    userId,
    role: userRole,
    accessToken,
    refreshToken: refreshToken, // Return the random token, not JWT
    accessTokenExpiresAt,
    refreshTokenExpiresAt,
    accessTokenJti,
    refreshTokenJti,
    familyId
  };
};

/**
 * Verify and refresh access token
 * Implements token rotation for security
 * Uses random token hash lookup instead of JWT verification
 */
const refreshAccessToken = async (refreshToken, ipAddress, userAgent) => {
  try {
    // Hash the provided refresh token
    const refreshTokenHash = hashRefreshToken(refreshToken);
    
    // Look up refresh token by hash
    const refreshTokenRecord = await getRow(`
      SELECT * FROM refresh_tokens 
      WHERE token_hash = $1 
        AND is_revoked = FALSE 
        AND expires_at > CURRENT_TIMESTAMP
    `, [refreshTokenHash]);
    
    if (!refreshTokenRecord) {
      throw new Error('Refresh token not found, expired, or revoked');
    }
    
    const { user_id: userId, token_jti: refreshTokenJti, family_id: familyId, access_token_jti: oldAccessTokenJti } = refreshTokenRecord;
    
    // Get user role
    const user = await getRow('SELECT role FROM users WHERE id = $1', [userId]);
    if (!user) {
      throw new Error('User not found');
    }
    const role = user.role;
    
    // Token rotation: Revoke old access token and refresh token
    return await withTransaction(async (client) => {
      // Blacklist old access token
      await blacklistToken(
        oldAccessTokenJti,
        userId,
        'token_refresh',
        new Date(Date.now() + 15 * 60 * 1000), // Access token expiry
        ipAddress,
        userAgent
      );
      
      // Revoke old refresh token by hash (token rotation)
      await client.query(`
        UPDATE refresh_tokens 
        SET is_revoked = TRUE,
            revoked_at = CURRENT_TIMESTAMP,
            revoked_reason = 'token_rotation'
        WHERE token_hash = $1
      `, [refreshTokenHash]);
      
      // Generate new token pair
      const newAccessTokenJti = crypto.randomUUID();
      const newRefreshTokenJti = crypto.randomUUID();
      
      // Generate new random refresh token
      const newRefreshToken = generateRefreshToken();
      const newRefreshTokenHash = hashRefreshToken(newRefreshToken);
      
      // Calculate expiration times
      const newAccessTokenExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
      const newRefreshTokenExpiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS);
      
      // Generate new access token
      const newAccessToken = jwt.sign(
        {
          userId,
          role,
          jti: newAccessTokenJti,
          type: 'access'
        },
        config.get('jwt.secret'),
        { expiresIn: ACCESS_TOKEN_EXPIRY }
      );
      
      // Get device info
      const deviceInfo = parseUserAgent(userAgent);
      
      // Store new refresh token hash
      await client.query(`
        INSERT INTO refresh_tokens 
        (user_id, token_hash, token_jti, access_token_jti, device_name, device_type,
         ip_address, user_agent, expires_at, family_id, last_used_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
      `, [
        userId,
        newRefreshTokenHash,
        newRefreshTokenJti,
        newAccessTokenJti,
        deviceInfo.deviceName,
        deviceInfo.deviceType,
        ipAddress,
        userAgent,
        newRefreshTokenExpiresAt,
        familyId
      ]);
      
      return {
        userId,
        role,
        accessToken: newAccessToken,
        refreshToken: newRefreshToken, // Return the random token, not JWT
        accessTokenExpiresAt: newAccessTokenExpiresAt,
        refreshTokenExpiresAt: newRefreshTokenExpiresAt,
        accessTokenJti: newAccessTokenJti,
        refreshTokenJti: newRefreshTokenJti
      };
    }, { name: 'refresh-token-rotation' });
    
  } catch (error) {
    logger.error('Refresh token error', {
      error: error.message,
      ipAddress
    });
    throw error;
  }
};

/**
 * Revoke a refresh token by token hash
 */
const revokeRefreshToken = async (refreshToken, userId, reason = 'user_logout') => {
  try {
    // Hash the token to look it up
    const refreshTokenHash = hashRefreshToken(refreshToken);
    
    const result = await query(`
      UPDATE refresh_tokens 
      SET is_revoked = TRUE,
          revoked_at = CURRENT_TIMESTAMP,
          revoked_reason = $3
      WHERE token_hash = $1 AND user_id = $2 AND is_revoked = FALSE
      RETURNING access_token_jti
    `, [refreshTokenHash, userId, reason]);
    
    if (result.rows.length > 0) {
      // Also blacklist the associated access token
      const accessTokenJti = result.rows[0].access_token_jti;
      await blacklistToken(
        accessTokenJti,
        userId,
        'refresh_token_revoked',
        new Date(Date.now() + 15 * 60 * 1000),
        null,
        null
      );
      
      return true;
    }
    
    return false;
  } catch (error) {
    logger.error('Error revoking refresh token', {
      error: error.message,
      userId
    });
    throw error;
  }
};

/**
 * Revoke all refresh tokens for a user
 */
const revokeAllUserRefreshTokens = async (userId, reason = 'user_logout_all') => {
  try {
    // Get all active refresh tokens
    const tokens = await query(`
      SELECT token_jti, access_token_jti 
      FROM refresh_tokens 
      WHERE user_id = $1 AND is_revoked = FALSE AND expires_at > CURRENT_TIMESTAMP
    `, [userId]);
    
    // Blacklist all associated access tokens
    for (const token of tokens.rows) {
      await blacklistToken(
        token.access_token_jti,
        userId,
        'all_refresh_tokens_revoked',
        new Date(Date.now() + 15 * 60 * 1000),
        null,
        null
      );
    }
    
    // Revoke all refresh tokens
    const result = await query(`
      UPDATE refresh_tokens 
      SET is_revoked = TRUE,
          revoked_at = CURRENT_TIMESTAMP,
          revoked_reason = $2
      WHERE user_id = $1 AND is_revoked = FALSE
    `, [userId, reason]);
    
    return result.rowCount || 0;
  } catch (error) {
    logger.error('Error revoking all user refresh tokens', {
      error: error.message,
      userId
    });
    throw error;
  }
};

/**
 * Get active refresh tokens for a user
 */
const getUserRefreshTokens = async (userId) => {
  try {
    const result = await query(`
      SELECT 
        id,
        token_jti,
        device_name,
        device_type,
        ip_address,
        created_at,
        last_used_at,
        expires_at
      FROM refresh_tokens
      WHERE user_id = $1 
        AND is_revoked = FALSE 
        AND expires_at > CURRENT_TIMESTAMP
      ORDER BY last_used_at DESC NULLS LAST, created_at DESC
    `, [userId]);
    
    return result.rows || [];
  } catch (error) {
    logger.error('Error getting user refresh tokens', {
      error: error.message,
      userId
    });
    return [];
  }
};

/**
 * Clean up expired refresh tokens
 */
const cleanupExpiredRefreshTokens = async () => {
  try {
    const result = await query(`
      DELETE FROM refresh_tokens 
      WHERE expires_at < CURRENT_TIMESTAMP 
         OR (is_revoked = TRUE AND revoked_at < CURRENT_TIMESTAMP - INTERVAL '30 days')
    `);
    
    const count = result.rowCount || 0;
    
    if (count > 0) {
      logger.info('Cleaned up expired refresh tokens', { count });
    }
    
    return count;
  } catch (error) {
    logger.error('Error cleaning up expired refresh tokens', {
      error: error.message
    });
    return 0;
  }
};

module.exports = {
  generateTokenPair,
  refreshAccessToken,
  revokeRefreshToken,
  revokeAllUserRefreshTokens,
  getUserRefreshTokens,
  cleanupExpiredRefreshTokens,
  ACCESS_TOKEN_EXPIRY,
  REFRESH_TOKEN_EXPIRY
};

