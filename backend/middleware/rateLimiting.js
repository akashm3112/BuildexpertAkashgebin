const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');
const { RateLimitError } = require('../utils/errorTypes');
const { formatErrorResponse } = require('./errorHandler');

/**
 * Standard API rate limiter - general endpoints
 * Limit: 100 requests per 15 minutes per IP
 */
const standardLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { status: 'error', message: 'Too many requests. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Rate limit exceeded - standard', {
      ip: req.ip,
      url: req.url,
      userId: req.user?.id
    });
    const error = new RateLimitError('Too many requests. Please try again in 15 minutes.', 900000);
    const response = formatErrorResponse(error, req);
    res.status(429).json(response);
  }
});

/**
 * Strict limiter for sensitive operations
 * Limit: 10 requests per 15 minutes per IP
 */
const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { status: 'error', message: 'Too many requests for this operation. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Rate limit exceeded - strict', {
      ip: req.ip,
      url: req.url,
      userId: req.user?.id
    });
    const error = new RateLimitError('Too many requests for this operation. Please try again in 15 minutes.', 900000);
    const response = formatErrorResponse(error, req);
    res.status(429).json(response);
  }
});

/**
 * Booking creation limiter
 * Limit: 20 bookings per hour per user (long-term quota)
 */
const bookingCreationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  message: { status: 'error', message: 'Too many booking requests in a short period. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Rate limit by user ID if authenticated, otherwise by IP
    return req.user?.id?.toString() || req.ip;
  },
  handler: (req, res) => {
    logger.warn('Rate limit exceeded - booking creation', {
      ip: req.ip,
      userId: req.user?.id
    });
    const error = new RateLimitError('Too many booking requests in a short period. Please try again later.', 3600000);
    const response = formatErrorResponse(error, req);
    res.status(429).json(response);
  }
});

/**
 * Service registration limiter
 * Limit: 10 service registrations per day per provider
 */
const serviceRegistrationLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 10,
  message: { status: 'error', message: 'Too many service registrations. Please try again tomorrow.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user?.id?.toString() || req.ip;
  },
  handler: (req, res) => {
    logger.warn('Rate limit exceeded - service registration', {
      ip: req.ip,
      userId: req.user?.id
    });
    const error = new RateLimitError('Too many service registrations. Please try again tomorrow.', 86400000);
    const response = formatErrorResponse(error, req);
    res.status(429).json(response);
  }
});

/**
 * Profile update limiter
 * Limit: 20 updates per hour per user
 */
const profileUpdateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  message: { status: 'error', message: 'Too many profile updates. Please try again in 1 hour.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user?.id?.toString() || req.ip;
  }
});

/**
 * File upload limiter
 * Limit: 20 uploads per hour per user
 */
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  message: { status: 'error', message: 'Too many file uploads. Please try again in 1 hour.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user?.id?.toString() || req.ip;
  }
});

/**
 * Search/Query limiter
 * Limit: 60 requests per minute per IP
 */
const searchLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  message: { status: 'error', message: 'Too many search requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true // Only count failed searches
});

/**
 * Admin action limiter
 * Limit: 100 requests per 15 minutes per admin (increased for admin dashboard usage)
 */
const adminActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Increased from 50 to 100 for admin dashboard
  message: { status: 'error', message: 'Too many admin actions. Please wait.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user?.id?.toString() || req.ip;
  },
  skipSuccessfulRequests: false, // Count all requests
  skipFailedRequests: false
});

/**
 * Notification send limiter
 * Limit: 100 notifications per hour per user
 */
const notificationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100,
  message: { status: 'error', message: 'Too many notification requests.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user?.id?.toString() || req.ip;
  }
});

/**
 * Report submission limiter
 * Limit: 5 reports per day per user
 */
const reportLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 5,
  message: { status: 'error', message: 'Too many reports submitted. Please try again tomorrow.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user?.id?.toString() || req.ip;
  },
  handler: (req, res) => {
    logger.warn('Rate limit exceeded - report submission', {
      ip: req.ip,
      userId: req.user?.id
    });
    const error = new RateLimitError('Too many reports submitted. Please try again tomorrow.', 86400000);
    const response = formatErrorResponse(error, req);
    res.status(429).json(response);
  }
});

/**
 * WebRTC call initiation limiter
 * Limit: 5 call attempts per minute per user
 */
const callInitiationLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  message: { status: 'error', message: 'Too many call attempts. Please wait before trying again.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id?.toString() || req.ip,
  handler: (req, res) => {
    logger.warn('Rate limit exceeded - call initiation', {
      ip: req.ip,
      userId: req.user?.id
    });
    const error = new RateLimitError('Too many call attempts. Please wait before trying again.', 60000);
    const response = formatErrorResponse(error, req);
    res.status(429).json(response);
  }
});

/**
 * WebRTC call logging limiter
 * Limit: 30 log events per 10 minutes per user
 */
const callLogLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 30,
  message: { status: 'error', message: 'Too many call log requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id?.toString() || req.ip
});

/**
 * WebRTC call event limiter
 * Limit: 120 signaling events per minute per user
 */
const callEventLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120,
  message: { status: 'error', message: 'Too many call events sent. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id?.toString() || req.ip
});

/**
 * Call history limiter
 * Limit: 10 history lookups per hour per user
 */
const callHistoryLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: { status: 'error', message: 'Too many call history requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id?.toString() || req.ip
});

/**
 * Account deletion limiter
 * Limit: 3 attempts per day per IP (prevent abuse)
 */
const accountDeletionLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 3,
  message: { status: 'error', message: 'Too many account deletion requests. Please contact support.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.ip;
  },
  handler: (req, res) => {
    logger.warn('Rate limit exceeded - account deletion', {
      ip: req.ip,
      userId: req.user?.id
    });
    const error = new RateLimitError('Too many account deletion requests. Please contact support if you need assistance.', 86400000);
    const response = formatErrorResponse(error, req);
    res.status(429).json(response);
  }
});

module.exports = {
  standardLimiter,
  strictLimiter,
  bookingCreationLimiter,
  serviceRegistrationLimiter,
  profileUpdateLimiter,
  uploadLimiter,
  searchLimiter,
  adminActionLimiter,
  notificationLimiter,
  reportLimiter,
  accountDeletionLimiter,
  callInitiationLimiter,
  callLogLimiter,
  callEventLimiter,
  callHistoryLimiter
};

