const jwt = require('jsonwebtoken');
const { getRow } = require('../database/connection');
const config = require('../utils/config');

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
      console.error('Auth middleware error: No token provided');
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
      console.error('Auth middleware error: Invalid token', err.message);
      return res.status(401).json({
        status: 'error',
        message: 'Invalid token.'
      });
    }
    
    if (config.isDevelopment() && config.get('security.enableDebugLogging')) {
      console.log('Looking up user with ID:', decoded.userId);
    }
    
    const user = await getRow('SELECT * FROM users WHERE id = $1', [decoded.userId]);
    
    if (!user) {
      console.error('Auth middleware error: User not found for ID:', decoded.userId);
      return res.status(401).json({
        status: 'error',
        message: 'Invalid token. User not found.'
      });
    }

    if (config.isDevelopment() && config.get('security.enableDebugLogging')) {
      console.log('User authenticated successfully, role:', user.role);
    }
    
    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error (catch-all):', error);
    if (config.isDevelopment() && config.get('security.enableDebugLogging')) {
      console.error('Error stack:', error.stack);
    }
    res.status(401).json({
      status: 'error',
      message: 'Invalid token.'
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
        console.error('RequireRole error: req.user missing');
        return res.status(401).json({
          status: 'error',
          message: 'Authentication required.'
        });
      }

      if (!roles.includes(req.user.role)) {
        console.error('RequireRole error: User role mismatch', req.user.role, roles);
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
      console.error('RequireRole middleware error:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Internal server error.'
      });
    }
  };
};

module.exports = { auth, requireRole }; 