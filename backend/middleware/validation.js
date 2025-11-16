/**
 * Input validation middleware for admin routes
 */

/**
 * Validate pagination parameters
 */
const validatePagination = (req, res, next) => {
  const { page, limit } = req.query;
  
  if (page !== undefined) {
    const pageNum = parseInt(page, 10);
    if (isNaN(pageNum) || pageNum < 1) {
      return res.status(400).json({
        status: 'error',
        message: 'page must be a positive integer'
      });
    }
    req.query.page = pageNum;
  }
  
  if (limit !== undefined) {
    const limitNum = parseInt(limit, 10);
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      return res.status(400).json({
        status: 'error',
        message: 'limit must be a positive integer between 1 and 100'
      });
    }
    req.query.limit = limitNum;
  }
  
  next();
};

/**
 * Validate UUID parameter
 */
const validateUUID = (paramName = 'id') => {
  return (req, res, next) => {
    const id = req.params[paramName];
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    
    if (!id || !uuidRegex.test(id)) {
      return res.status(400).json({
        status: 'error',
        message: `${paramName} must be a valid UUID`
      });
    }
    
    next();
  };
};

/**
 * Validate status parameter (whitelist)
 */
const validateStatus = (allowedStatuses = ['open', 'resolved', 'closed', 'all']) => {
  return (req, res, next) => {
    const status = req.query.status || req.body.status;
    
    if (status && !allowedStatuses.includes(status.toLowerCase())) {
      return res.status(400).json({
        status: 'error',
        message: `status must be one of: ${allowedStatuses.join(', ')}`
      });
    }
    
    if (status) {
      // Normalize to lowercase
      if (req.query.status) req.query.status = status.toLowerCase();
      if (req.body.status) req.body.status = status.toLowerCase();
    }
    
    next();
  };
};

/**
 * Validate type parameter (whitelist)
 */
const validateType = (allowedTypes = ['all', 'user', 'provider']) => {
  return (req, res, next) => {
    const type = req.query.type;
    
    if (type && !allowedTypes.includes(type.toLowerCase())) {
      return res.status(400).json({
        status: 'error',
        message: `type must be one of: ${allowedTypes.join(', ')}`
      });
    }
    
    if (type) {
      req.query.type = type.toLowerCase();
    }
    
    next();
  };
};

/**
 * Validate boolean parameter
 */
const validateBoolean = (paramName, source = 'body') => {
  return (req, res, next) => {
    const value = source === 'body' ? req.body[paramName] : req.query[paramName];
    
    if (value !== undefined) {
      if (typeof value === 'boolean') {
        return next();
      }
      
      if (typeof value === 'string') {
        const lower = value.toLowerCase();
        if (lower === 'true' || lower === '1') {
          if (source === 'body') {
            req.body[paramName] = true;
          } else {
            req.query[paramName] = true;
          }
          return next();
        }
        if (lower === 'false' || lower === '0') {
          if (source === 'body') {
            req.body[paramName] = false;
          } else {
            req.query[paramName] = false;
          }
          return next();
        }
      }
      
      return res.status(400).json({
        status: 'error',
        message: `${paramName} must be a boolean`
      });
    }
    
    next();
  };
};

module.exports = {
  validatePagination,
  validateUUID,
  validateStatus,
  validateType,
  validateBoolean
};

