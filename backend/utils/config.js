const path = require('path');
const fs = require('fs');

/**
 * Secure configuration loader with validation
 * This ensures all required environment variables are present and valid
 */

class Config {
  constructor() {
    this.config = {};
    this.loadConfig();
    this.validateConfig();
  }

  loadConfig() {
    // Load environment variables from config.env
    const configPath = path.join(__dirname, '..', 'config.env');
    
    if (fs.existsSync(configPath)) {
      require('dotenv').config({ path: configPath });
    } else {
      console.warn('⚠️  config.env file not found. Using system environment variables only.');
    }

    // Load configuration with defaults
    this.config = {
      // Server Configuration
      port: process.env.PORT || 5000,
      nodeEnv: process.env.NODE_ENV || 'development',
      
      // Database Configuration
      database: {
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT) || 5432,
        name: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        url: process.env.DATABASE_URL
      },
      
      // JWT Configuration
      jwt: {
        secret: process.env.JWT_SECRET,
        expire: process.env.JWT_EXPIRE || '7d'
      },
      
      // OTP Configuration
      otp: {
        expire: parseInt(process.env.OTP_EXPIRE) || 300000
      },
      
      // Twilio Configuration
      twilio: {
        accountSid: process.env.TWILIO_ACCOUNT_SID,
        authToken: process.env.TWILIO_AUTH_TOKEN,
        phoneNumber: process.env.TWILIO_PHONE_NUMBER,
        proxyServiceSid: process.env.TWILIO_PROXY_SERVICE_SID,
        defaultCountryCode: process.env.DEFAULT_COUNTRY_CODE || '1'
      },
      
      // Email Configuration
      email: {
        host: process.env.EMAIL_HOST,
        port: parseInt(process.env.EMAIL_PORT) || 587,
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      },
      
      // File Upload Configuration
      upload: {
        maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 5242880,
        uploadPath: process.env.UPLOAD_PATH || './uploads'
      },
      
      // Cloudinary Configuration
      cloudinary: {
        cloudName: process.env.CLOUDINARY_CLOUD_NAME,
        apiKey: process.env.CLOUDINARY_API_KEY,
        apiSecret: process.env.CLOUDINARY_API_SECRET
      },
      
      // Rate Limiting
      rateLimit: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000,
        maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100
      },
      
      // Paytm Configuration
      paytm: {
        mid: process.env.PAYTM_MID,
        merchantKey: process.env.PAYTM_MERCHANT_KEY,
        website: process.env.PAYTM_WEBSITE || 'WEBSTAGING',
        channelId: process.env.PAYTM_CHANNEL_ID || 'WAP',
        industryType: process.env.PAYTM_INDUSTRY_TYPE || 'Retail',
        callbackUrl: process.env.PAYTM_CALLBACK_URL
      },
      
      // Security Configuration
      security: {
        enableDebugLogging: process.env.ENABLE_DEBUG_LOGGING === 'true',
        enableQueryLogging: process.env.ENABLE_QUERY_LOGGING === 'true',
        enableCorsDebug: process.env.ENABLE_CORS_DEBUG === 'true',
        forceHttps: process.env.FORCE_HTTPS === 'true',
        secureCookies: process.env.SECURE_COOKIES === 'true',
        trustProxy: process.env.TRUST_PROXY === 'true'
      }
    };
  }

  validateConfig() {
    const errors = [];
    const warnings = [];

    // Required configurations
    const required = [
      { key: 'database.url', name: 'DATABASE_URL' },
      { key: 'jwt.secret', name: 'JWT_SECRET' },
      { key: 'twilio.accountSid', name: 'TWILIO_ACCOUNT_SID' },
      { key: 'twilio.authToken', name: 'TWILIO_AUTH_TOKEN' },
      { key: 'twilio.phoneNumber', name: 'TWILIO_PHONE_NUMBER' }
    ];

    // Check required configurations
    required.forEach(({ key, name }) => {
      const value = this.get(key);
      if (!value) {
        errors.push(`Missing required configuration: ${name}`);
      }
    });

    // Security warnings
    if (this.config.jwt.secret === 'buildxpert_2024_secret_key') {
      warnings.push('⚠️  Using default JWT secret. Change JWT_SECRET in production!');
    }

    if (this.config.nodeEnv === 'development') {
      warnings.push('⚠️  Running in development mode. Set NODE_ENV=production for production deployment.');
    }

    if (this.config.paytm.mid === 'YOUR_MERCHANT_ID') {
      warnings.push('⚠️  Using placeholder Paytm credentials. Update PAYTM_MID and PAYTM_MERCHANT_KEY for production.');
    }

    if (this.config.cloudinary.cloudName === 'dqoizs0fu') {
      warnings.push('⚠️  Using placeholder Cloudinary credentials. Update CLOUDINARY_* variables for production.');
    }

    // Log warnings
    if (warnings.length > 0) {
      console.log('\n🔔 Configuration Warnings:');
      warnings.forEach(warning => console.log(warning));
    }

    // Throw errors for missing required configs
    if (errors.length > 0) {
      console.error('\n❌ Configuration Errors:');
      errors.forEach(error => console.error(error));
      throw new Error('Missing required configuration. Please check your config.env file.');
    }

    // Log successful configuration
    console.log('✅ Configuration loaded successfully');
    if (this.config.nodeEnv === 'development') {
      console.log('🔧 Development mode enabled');
    }
  }

  get(key) {
    const keys = key.split('.');
    let value = this.config;
    
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return undefined;
      }
    }
    
    return value;
  }

  isProduction() {
    return this.config.nodeEnv === 'production';
  }

  isDevelopment() {
    return this.config.nodeEnv === 'development';
  }

  getDatabaseConfig() {
    return this.config.database;
  }

  getJWTConfig() {
    return this.config.jwt;
  }

  getTwilioConfig() {
    return this.config.twilio;
  }

  getPaytmConfig() {
    return this.config.paytm;
  }

  getCloudinaryConfig() {
    return this.config.cloudinary;
  }

  getSecurityConfig() {
    return this.config.security;
  }

  // Mask sensitive values for logging
  getMaskedConfig() {
    const masked = { ...this.config };
    
    // Mask sensitive values
    if (masked.database.password) {
      masked.database.password = '***';
    }
    if (masked.database.url) {
      masked.database.url = masked.database.url.replace(/:[^:@]+@/, ':***@');
    }
    if (masked.jwt.secret) {
      masked.jwt.secret = '***';
    }
    if (masked.twilio.authToken) {
      masked.twilio.authToken = '***';
    }
    if (masked.email.pass) {
      masked.email.pass = '***';
    }
    if (masked.cloudinary.apiSecret) {
      masked.cloudinary.apiSecret = '***';
    }
    if (masked.paytm.merchantKey) {
      masked.paytm.merchantKey = '***';
    }
    
    return masked;
  }
}

// Create singleton instance
const config = new Config();

module.exports = config;
