const jwt = require('jsonwebtoken');
const { getRow } = require('../database/connection');

const auth = async (req, res, next) => {
  try {
    console.log('=== AUTH MIDDLEWARE ===');
    console.log('Request URL:', req.url);
    console.log('Request method:', req.method);
    console.log('Authorization header:', req.header('Authorization'));
    
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      console.error('Auth middleware error: No token provided');
      return res.status(401).json({
        status: 'error',
        message: 'Access denied. No token provided.'
      });
    }

    console.log('Token found, length:', token.length);
    
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log('Token decoded successfully:', decoded);
    } catch (err) {
      console.error('Auth middleware error: Invalid token', err.message);
      return res.status(401).json({
        status: 'error',
        message: 'Invalid token.'
      });
    }
    
    console.log('Looking up user with ID:', decoded.userId);
    const user = await getRow('SELECT * FROM users WHERE id = $1', [decoded.userId]);
    console.log('User from DB:', user ? 'Found' : 'Not found');
    
    if (!user) {
      console.error('Auth middleware error: User not found');
      return res.status(401).json({
        status: 'error',
        message: 'Invalid token. User not found.'
      });
    }

    console.log('User authenticated successfully, role:', user.role);
    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error (catch-all):', error);
    console.error('Error stack:', error.stack);
    res.status(401).json({
      status: 'error',
      message: 'Invalid token.'
    });
  }
};

const requireRole = (roles) => {
  return (req, res, next) => {
    console.log('=== REQUIRE ROLE MIDDLEWARE ===');
    console.log('Required roles:', roles);
    console.log('User:', req.user ? { id: req.user.id, role: req.user.role } : 'No user');
    
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

    console.log('Role check passed, proceeding to route');
    next();
  };
};

module.exports = { auth, requireRole }; 