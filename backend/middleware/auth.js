const jwt = require('jsonwebtoken');
const { getRow } = require('../database/connection');
const config = require('../utils/config');
const { isTokenBlacklisted } = require('../utils/tokenBlacklist');
const { updateSessionActivity, getSession } = require('../utils/sessionManager');

const auth = async (req, res, next) => {
  try {
    // Only log in development mode to avoid security issues
    if (config.isDevelopment() && config.get('security.enableDebugLogging')) {
      console.log('=== AUTH MIDDLEWARE ===');
      console.log('Request URL:', req.url);
      console.log('Request method:', req.method);
    }
    
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      // Error logged - no token provided (error response sent to client)
      return res.status(401).json({
        status: 'error',
        message: 'Access denied. No token provided.'
      });
    }

    if (config.isDevelopment() && config.get('security.enableDebugLogging')) {
      console.log('Token found, length:', token.length);
    }
    
    let decoded;
    try {
      decoded = jwt.verify(token, config.get('jwt.secret'));
      if (config.isDevelopment() && config.get('security.enableDebugLogging')) {
        console.log('Token decoded successfully for user:', decoded.userId);
      }
    } catch (err) {
      // Error logged - invalid token (error response sent to client)
      return res.status(401).json({
        status: 'error',
        message: 'Invalid token. Token has expired or is malformed.'
      });
    }
    
    // Check if token has JTI (JWT ID) - required for session tracking
    if (!decoded.jti) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid token. Missing token identifier.'
      });
    }
    
    // Check if token is blacklisted
    const isBlacklisted = await isTokenBlacklisted(decoded.jti);
    if (isBlacklisted) {
      return res.status(401).json({
        status: 'error',
        message: 'Token has been revoked. Please login again.'
      });
    }
    
    // Verify session exists and is active
    const session = await getSession(decoded.jti);
    if (!session || !session.is_active) {
      return res.status(401).json({
        status: 'error',
        message: 'Session expired or invalid. Please login again.'
      });
    }
    
    if (config.isDevelopment() && config.get('security.enableDebugLogging')) {
      console.log('Looking up user with ID:', decoded.userId);
    }
    
    const user = await getRow('SELECT * FROM users WHERE id = $1', [decoded.userId]);
    
    if (!user) {
      // Error logged - user not found (error response sent to client)
      return res.status(401).json({
        status: 'error',
        message: 'Invalid token. User not found.'
      });
    }

    if (config.isDevelopment() && config.get('security.enableDebugLogging')) {
      console.log('User authenticated successfully, role:', user.role);
    }
    
    // Update session activity (fire and forget - don't wait for it)
    updateSessionActivity(decoded.jti).catch(err => {
      // Log error but don't fail the request
      if (config.isDevelopment()) {
        console.error('Failed to update session activity:', err);
      }
    });
    
    req.user = user;
    req.tokenJti = decoded.jti; // Store JTI for logout/session management
    req.session = session; // Store session data for reference
    next();
  } catch (error) {
    // Error logged - authentication failed (error response sent to client)
    if (config.isDevelopment() && config.get('security.enableDebugLogging')) {
      console.error('Error stack:', error.stack);
    }
    res.status(401).json({
      status: 'error',
      message: 'Authentication failed. Please login again.'
    });
  }
};

const requireRole = (roles) => {
  return (req, res, next) => {
    try {
      // Only log in development mode to avoid security issues
      if (config.isDevelopment() && config.get('security.enableDebugLogging')) {
        console.log('=== REQUIRE ROLE MIDDLEWARE ===');
        console.log('Required roles:', roles);
        console.log('User:', req.user ? { id: req.user.id, role: req.user.role } : 'No user');
      }
      
      if (!req.user) {
        // Error - user missing in requireRole
        return res.status(401).json({
          status: 'error',
          message: 'Authentication required.'
        });
      }

      if (!roles.includes(req.user.role)) {
        // Error - user role mismatch (access denied)
        return res.status(403).json({
          status: 'error',
          message: 'Access denied. Insufficient permissions.'
        });
      }

      if (config.isDevelopment() && config.get('security.enableDebugLogging')) {
        console.log('Role check passed, proceeding to route');
      }
      next();
    } catch (error) {
      // Error in requireRole middleware
      return res.status(500).json({
        status: 'error',
        message: 'Internal server error.'
      });
    }
  };
};

module.exports = { auth, requireRole }; 