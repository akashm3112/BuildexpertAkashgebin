const winston = require('winston');
const config = require('./config');

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
      msg += ` ${JSON.stringify(meta)}`;
    }
    return msg;
  })
);

// Create logger instance
const logger = winston.createLogger({
  level: config.get('log.level') || 'info',
  format: logFormat,
  defaultMeta: { service: 'buildxpert-api' },
  transports: [
    // Write all logs to console in development
    new winston.transports.Console({
      format: config.isDevelopment() ? consoleFormat : logFormat
    }),
    // Write all logs with level 'error' and below to error.log
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    // Write all logs to combined.log
    new winston.transports.File({ 
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 10
    })
  ],
  // Don't exit on error
  exitOnError: false
});

// Create a stream object for Morgan HTTP logging
logger.stream = {
  write: (message) => {
    logger.info(message.trim());
  }
};

// Helper methods for common logging patterns
logger.payment = (action, data) => {
  logger.info(`💰 Payment: ${action}`, data);
};

logger.booking = (action, data) => {
  logger.info(`📅 Booking: ${action}`, data);
};

logger.auth = (action, data) => {
  logger.info(`🔐 Auth: ${action}`, data);
};

logger.socket = (action, data) => {
  logger.info(`🔌 Socket: ${action}`, data);
};

logger.database = (action, data) => {
  logger.info(`💾 Database: ${action}`, data);
};

logger.resilience = (action, data = {}) => {
  logger.warn(`🛡️ Resilience: ${action}`, { ...data, category: 'resilience' });
};

logger.logic = (action, data = {}) => {
  logger.info(`🧠 Logic: ${action}`, { ...data, category: 'logic' });
};

// OTP logging (keep visible in console for development)
logger.otp = (phone, otp) => {
  const message = `📱 OTP for ${phone}: ${otp}`;
  console.log(`\n${'='.repeat(50)}\n${message}\n${'='.repeat(50)}\n`);
  logger.info(message, { phone, category: 'otp' });
};

module.exports = logger;

