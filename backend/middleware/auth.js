const jwt = require('jsonwebtoken');
const { getRow } = require('../database/connection');
const config = require('../utils/config');
const { isTokenBlacklisted } = require('../utils/tokenBlacklist');
const { updateSessionActivity, getSession } = require('../utils/sessionManager');
const logger = require('../utils/logger');

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      logger.warn('Authentication failed: No token provided', {
        ip: req.ip,
        url: req.url,
        method: req.method
      });
      return res.status(401).json({
        status: 'error',
        message: 'Access denied. No token provided.'
      });
    }
    
    let decoded;
    try {
      decoded = jwt.verify(token, config.get('jwt.secret'));
    } catch (err) {
      logger.warn('Authentication failed: Invalid or expired token', {
        ip: req.ip,
        url: req.url,
        method: req.method,
        error: err.name
      });
      return res.status(401).json({
        status: 'error',
        message: 'Invalid token. Token has expired or is malformed.'
      });
    }
    
    // Check if token has JTI (JWT ID) - required for session tracking
    if (!decoded.jti) {
      logger.warn('Authentication failed: Missing token identifier', {
        ip: req.ip,
        url: req.url,
        method: req.method
      });
      return res.status(401).json({
        status: 'error',
        message: 'Invalid token. Missing token identifier.'
      });
    }
    
    // Check if token is an access token (not a refresh token)
    if (decoded.type && decoded.type !== 'access') {
      logger.warn('Authentication failed: Invalid token type', {
        ip: req.ip,
        url: req.url,
        method: req.method,
        tokenType: decoded.type
      });
      return res.status(401).json({
        status: 'error',
        message: 'Invalid token type. Access token required.'
      });
    }
    
    // Check if token is blacklisted
    const isBlacklisted = await isTokenBlacklisted(decoded.jti);
    if (isBlacklisted) {
      logger.warn('Authentication failed: Token blacklisted', {
        ip: req.ip,
        url: req.url,
        method: req.method,
        jti: decoded.jti
      });
      return res.status(401).json({
        status: 'error',
        message: 'Token has been revoked. Please login again.'
      });
    }
    
    // Verify session exists and is active
    const session = await getSession(decoded.jti);
    if (!session || !session.is_active) {
      logger.warn('Authentication failed: Session expired or invalid', {
        ip: req.ip,
        url: req.url,
        method: req.method,
        jti: decoded.jti
      });
      return res.status(401).json({
        status: 'error',
        message: 'Session expired or invalid. Please login again.'
      });
    }
    
    const user = await getRow('SELECT * FROM users WHERE id = $1', [decoded.userId]);
    
    if (!user) {
      logger.warn('Authentication failed: User not found', {
        ip: req.ip,
        url: req.url,
        method: req.method,
        userId: decoded.userId
      });
      return res.status(401).json({
        status: 'error',
        message: 'Invalid token. User not found.'
      });
    }
    
    // Update session activity (fire and forget - don't wait for it)
    updateSessionActivity(decoded.jti).catch((err) => {
      logger.error('Failed to update session activity', {
        jti: decoded.jti,
        error: err.message
      });
    });
    
    req.user = user;
    req.tokenJti = decoded.jti; // Store JTI for logout/session management
    req.session = session; // Store session data for reference
    next();
  } catch (error) {
    logger.error('Authentication error', {
      ip: req.ip,
      url: req.url,
      method: req.method,
      error: error.message,
      stack: error.stack
    });
    res.status(401).json({
      status: 'error',
      message: 'Authentication failed. Please login again.'
    });
  }
};

const requireRole = (roles) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        logger.warn('Authorization failed: No user in request', {
          ip: req.ip,
          url: req.url,
          method: req.method
        });
        return res.status(401).json({
          status: 'error',
          message: 'Authentication required.'
        });
      }

      if (!roles.includes(req.user.role)) {
        logger.warn('Authorization failed: Insufficient permissions', {
          ip: req.ip,
          url: req.url,
          method: req.method,
          userId: req.user.id,
          userRole: req.user.role,
          requiredRoles: roles
        });
        return res.status(403).json({
          status: 'error',
          message: 'Access denied. Insufficient permissions.'
        });
      }

      next();
    } catch (error) {
      logger.error('Authorization error', {
        ip: req.ip,
        url: req.url,
        method: req.method,
        error: error.message,
        stack: error.stack
      });
      return res.status(500).json({
        status: 'error',
        message: 'Internal server error.'
      });
    }
  };
};

module.exports = { auth, requireRole }; 