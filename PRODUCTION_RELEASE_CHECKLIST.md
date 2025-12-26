# 🚀 Production Release Checklist - BuildXpert

## Overview
This document provides a comprehensive, step-by-step guide for transitioning your BuildXpert project from development to production.

---

## 📋 Table of Contents
1. [Backend Configuration](#1-backend-configuration)
2. [Frontend Configuration](#2-frontend-configuration)
3. [Environment Variables](#3-environment-variables)
4. [Payment Gateway](#4-payment-gateway)
5. [Database](#5-database)
6. [Security Settings](#6-security-settings)
7. [API Endpoints & CORS](#7-api-endpoints--cors)
8. [WebRTC/TURN Servers](#8-webrtcturn-servers)
9. [Error Handling & Logging](#9-error-handling--logging)
10. [Build Configuration](#10-build-configuration)
11. [Testing & Verification](#11-testing--verification)
12. [Deployment](#12-deployment)

---

## 1. Backend Configuration

### 1.1 Environment File
**File:** `backend/config.env`

**Changes Required:**
- [ ] Change `NODE_ENV=development` to `NODE_ENV=production`
- [ ] Update `ALLOWED_ORIGINS` with production domains (remove localhost)
  ```env
  ALLOWED_ORIGINS=https://yourdomain.com,https://api.yourdomain.com
  ```
- [ ] Update database credentials to production database
- [ ] Update JWT_SECRET to a strong, unique production secret (at least 32 characters)
- [ ] Update all API keys (Twilio, Cloudinary, LocationIQ, Paytm) to production credentials
- [ ] Set `PAYTM_WEBSITE=WEBPROD` (change from WEBSTAGING)
- [ ] Update `PAYTM_CALLBACK_URL` to production URL
  ```env
  PAYTM_CALLBACK_URL=https://yourdomain.com/api/payments/paytm-callback
  ```

### 1.2 Payment Gateway Configuration
**File:** `backend/routes/payments.js`

**Changes Required:**
- [ ] **REMOVE OR DISABLE** payment bypass for labour payments (lines 92-130)
  - Currently bypasses Paytm verification in development
  - **CRITICAL:** Remove this test mode bypass for production
  - Code to remove/modify:
    ```javascript
    // REMOVE THIS ENTIRE BLOCK IN PRODUCTION:
    // Check if this is a labour payment and we're in development/test mode
    // For testing, bypass actual Paytm verification for labour payments
    const isLabourPayment = transactionId ? await (async () => {
      // ... bypass logic
    })() : false;
    
    if (isLabourPayment) {
      // In development, bypass Paytm verification for labour payments (testing mode)
      if (process.env.NODE_ENV !== 'production') {
        logger.payment('Bypassing Paytm verification for labour payment (test mode)', { orderId });
        // ... test mode code
        return { ... };
      }
    }
    ```

### 1.3 Cloudinary Configuration
**File:** `backend/utils/cloudinary.js`

**Changes Required:**
- [ ] Verify Cloudinary credentials are production credentials
- [ ] Remove or disable mock URL generation (lines 29-34, 48-50)
- [ ] Ensure all image uploads use real Cloudinary URLs (not mock URLs)
- [ ] Check that `isCloudinaryConfigured()` returns `true` in production

### 1.4 Server Configuration
**File:** `backend/server.js`

**Changes Required:**
- [ ] Verify `NODE_ENV` is set to `production`
- [ ] Ensure CORS only allows production origins
- [ ] Verify HTTPS is enforced (if using reverse proxy)
- [ ] Check that `TRUST_PROXY` is set correctly for production

---

## 2. Frontend Configuration

### 2.1 UserApp API Configuration
**File:** `userApp/constants/api.ts`

**Current:**
```typescript
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.0.7:5000';
```

**Changes Required:**
- [ ] Update to production API URL:
  ```typescript
  export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://api.yourdomain.com';
  ```
- [ ] Set `EXPO_PUBLIC_API_URL` environment variable in production build

### 2.2 ProviderApp API Configuration
**File:** `providerApp/constants/api.ts`

**Current:**
```typescript
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.0.7:5000';
```

**Changes Required:**
- [ ] Update to production API URL:
  ```typescript
  export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://api.yourdomain.com';
  ```
- [ ] Set `EXPO_PUBLIC_API_URL` environment variable in production build

### 2.3 Remove Development Code
**Files to Check:**
- `userApp/app/service-registration/[category].tsx`
- `providerApp/app/service-registration/[category].tsx`
- `userApp/app/provider/[id].tsx`
- `providerApp/app/(tabs)/bookings.tsx`

**Changes Required:**
- [ ] Remove or wrap all `__DEV__` console.log statements
- [ ] Remove debug logging code
- [ ] Ensure no test data is hardcoded
- [ ] Remove development-only features

**Example:**
```typescript
// REMOVE OR WRAP IN PRODUCTION CHECK:
if (__DEV__) {
  console.log('Debug info:', data);
}
```

### 2.4 App Configuration
**Files:** `userApp/app.json`, `providerApp/app.json`

**Changes Required:**
- [ ] Update app version numbers if needed
- [ ] Verify package names are correct:
  - UserApp: `com.builtxpert.user`
  - ProviderApp: `com.builtxpert.provider`
- [ ] Verify all required permissions are listed
- [ ] Check that `updates.enabled` is set correctly for production

---

## 3. Environment Variables

### 3.1 Backend Environment Variables
**File:** `backend/config.env` (use `config.production.env` as template)

**Required Variables:**
```env
# Server
NODE_ENV=production
PORT=5000

# CORS
ALLOWED_ORIGINS=https://yourdomain.com,https://api.yourdomain.com

# Database
DB_HOST=your_production_db_host
DB_PORT=5432
DB_NAME=your_production_db_name
DB_USER=your_production_db_user
DB_PASSWORD=your_production_db_password
DATABASE_URL=postgresql://user:password@host:port/database

# JWT
JWT_SECRET=your_super_strong_production_jwt_secret_key_at_least_32_characters_long
JWT_EXPIRE=7d

# Twilio
TWILIO_ACCOUNT_SID=your_production_twilio_account_sid
TWILIO_AUTH_TOKEN=your_production_twilio_auth_token
TWILIO_PHONE_NUMBER=your_production_twilio_phone_number
TWILIO_PROXY_SERVICE_SID=your_production_twilio_proxy_service_sid

# Cloudinary
CLOUDINARY_CLOUD_NAME=your_production_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_production_cloudinary_api_key
CLOUDINARY_API_SECRET=your_production_cloudinary_api_secret

# Paytm
PAYTM_MID=your_production_paytm_merchant_id
PAYTM_MERCHANT_KEY=your_production_paytm_merchant_key
PAYTM_WEBSITE=WEBPROD
PAYTM_CHANNEL_ID=WAP
PAYTM_INDUSTRY_TYPE=Retail
PAYTM_CALLBACK_URL=https://yourdomain.com/api/payments/paytm-callback

# LocationIQ
LOCATIONIQ_API_KEY=your_production_locationiq_api_key

# Security
ENABLE_DEBUG_LOGGING=false
ENABLE_QUERY_LOGGING=false
ENABLE_CORS_DEBUG=false
FORCE_HTTPS=true
SECURE_COOKIES=true
TRUST_PROXY=true
```

### 3.2 Frontend Environment Variables
**For EAS Build:**

**userApp:**
```bash
EXPO_PUBLIC_API_URL=https://api.yourdomain.com
```

**providerApp:**
```bash
EXPO_PUBLIC_API_URL=https://api.yourdomain.com
```

**Set during build:**
```bash
eas build --profile production --env EXPO_PUBLIC_API_URL=https://api.yourdomain.com
```

---

## 4. Payment Gateway

### 4.1 Paytm Configuration
**File:** `backend/routes/payments.js`

**Critical Changes:**
- [ ] Change `PAYTM_WEBSITE` from `WEBSTAGING` to `WEBPROD`
- [ ] Update `PAYTM_MID` to production merchant ID
- [ ] Update `PAYTM_MERCHANT_KEY` to production merchant key
- [ ] Update `PAYTM_CALLBACK_URL` to production callback URL
- [ ] **REMOVE** payment bypass logic for labour payments (see section 1.2)

### 4.2 Payment Verification
**File:** `backend/routes/payments.js`

**Changes Required:**
- [ ] Ensure all payments go through Paytm verification
- [ ] Remove test mode bypasses
- [ ] Verify callback URL is accessible from Paytm servers
- [ ] Test payment flow end-to-end

---

## 5. Database

### 5.1 Database Connection
**File:** `backend/config.env`

**Changes Required:**
- [ ] Update to production database credentials
- [ ] Verify database connection string is correct
- [ ] Test database connectivity
- [ ] Ensure database has proper backups configured

### 5.2 Database Migrations
**Action Required:**
- [ ] Run all migrations on production database:
  ```bash
  cd backend
  node migrations/run-all-migrations.js
  ```
- [ ] Verify all migrations completed successfully
- [ ] Check database indexes are created (migration 028)

### 5.3 Database Security
**Action Required:**
- [ ] Ensure database is not publicly accessible
- [ ] Use SSL/TLS for database connections
- [ ] Verify database user has minimal required permissions
- [ ] Enable database connection pooling

---

## 6. Security Settings

### 6.1 Backend Security
**File:** `backend/server.js`

**Changes Required:**
- [ ] Verify Helmet.js is enabled (security headers)
- [ ] Ensure CORS is properly configured (only production origins)
- [ ] Verify rate limiting is enabled
- [ ] Check that HTTPS is enforced
- [ ] Verify `TRUST_PROXY` is set correctly

### 6.2 JWT Configuration
**File:** `backend/config.env`

**Changes Required:**
- [ ] Generate a strong, unique JWT_SECRET (at least 32 characters)
- [ ] Never commit JWT_SECRET to version control
- [ ] Use different JWT_SECRET for production vs development

### 6.3 API Security
**Files:** `backend/middleware/rateLimiting.js`, `backend/middleware/auth.js`

**Changes Required:**
- [ ] Verify rate limiting is properly configured
- [ ] Check authentication middleware is working
- [ ] Ensure sensitive endpoints require authentication
- [ ] Verify input sanitization is enabled

### 6.4 Environment Variables Security
**Action Required:**
- [ ] Never commit `.env` files to version control
- [ ] Use secure secret management (AWS Secrets Manager, Azure Key Vault, etc.)
- [ ] Rotate all API keys and secrets before production
- [ ] Use different credentials for production vs development

---

## 7. API Endpoints & CORS

### 7.1 CORS Configuration
**File:** `backend/server.js`

**Current:**
```javascript
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8081,http://localhost:19006
```

**Changes Required:**
- [ ] Update `ALLOWED_ORIGINS` in `config.env`:
  ```env
  ALLOWED_ORIGINS=https://yourdomain.com,https://api.yourdomain.com
  ```
- [ ] Remove all localhost URLs
- [ ] Only include production domains
- [ ] Test CORS with production domains

### 7.2 API Base URLs
**Files:** `userApp/constants/api.ts`, `providerApp/constants/api.ts`

**Changes Required:**
- [ ] Update API_BASE_URL to production URL
- [ ] Ensure HTTPS is used (not HTTP)
- [ ] Verify API endpoint is accessible

---

## 8. WebRTC/TURN Servers

### 8.1 TURN Server Configuration
**Files:** `userApp/services/webrtc.ts`, `providerApp/services/webrtc.ts`

**Current:**
```typescript
// Note: Add TURN servers here if available
// { urls: 'turn:your-turn-server.com:3478', username: 'user', credential: 'pass' },
```

**Changes Required:**
- [ ] Add production TURN server credentials
- [ ] Configure ephemeral TURN credentials (if using)
- [ ] Test WebRTC calls in production environment
- [ ] Verify NAT traversal is working

**Example:**
```typescript
const RTC_CONFIG_WITH_TURN = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { 
      urls: 'turn:your-turn-server.com:3478', 
      username: 'your-turn-username', 
      credential: 'your-turn-password' 
    },
  ],
  iceCandidatePoolSize: 10,
};
```

---

## 9. Error Handling & Logging

### 9.1 Logging Configuration
**File:** `backend/utils/logger.js`

**Changes Required:**
- [ ] Verify sensitive data masking is enabled
- [ ] Check log levels are appropriate for production
- [ ] Ensure logs are not exposing sensitive information
- [ ] Configure log rotation and retention

### 9.2 Error Handling
**Files:** `backend/middleware/errorHandler.js`, `userApp/utils/globalErrorHandler.ts`, `providerApp/utils/globalErrorHandler.ts`

**Changes Required:**
- [ ] Remove or suppress development-only error messages
- [ ] Ensure user-friendly error messages in production
- [ ] Verify error logging is working
- [ ] Check that sensitive errors are not exposed to clients

### 9.3 Debug Logging
**Action Required:**
- [ ] Remove all `console.log`, `console.warn` statements (or wrap in environment check)
- [ ] Remove `__DEV__` debug code
- [ ] Use proper logging library (Winston) instead of console

---

## 10. Build Configuration

### 10.1 EAS Build Configuration
**Files:** `userApp/eas.json`, `providerApp/eas.json`

**Current Configuration:**
```json
{
  "build": {
    "production": {
      "android": {
        "buildType": "apk"
      }
    }
  }
}
```

**Changes Required:**
- [ ] Verify production build profile is correct
- [ ] Set environment variables during build:
  ```bash
  eas build --profile production --env EXPO_PUBLIC_API_URL=https://api.yourdomain.com
  ```
- [ ] Test production builds before release

### 10.2 App Versioning
**Files:** `userApp/app.json`, `providerApp/app.json`

**Changes Required:**
- [ ] Update version numbers if needed
- [ ] Verify package names are correct
- [ ] Check app icons and splash screens

---

## 11. Testing & Verification

### 11.1 Pre-Production Testing
**Action Required:**
- [ ] Test all payment flows (service registration, labour access)
- [ ] Verify Paytm integration works in production mode
- [ ] Test WebRTC calls
- [ ] Test image uploads (Cloudinary)
- [ ] Test SMS/OTP functionality (Twilio)
- [ ] Test booking creation and management
- [ ] Test service registration with sub-services
- [ ] Test all API endpoints
- [ ] Test authentication and authorization
- [ ] Test error handling

### 11.2 Load Testing
**File:** `backend/load-testing/advanced-load-test.js`

**Action Required:**
- [ ] Run load tests against production API (if staging environment available)
- [ ] Verify system can handle expected load
- [ ] Check database performance under load
- [ ] Monitor memory and CPU usage

### 11.3 Security Testing
**Action Required:**
- [ ] Test authentication and authorization
- [ ] Verify rate limiting is working
- [ ] Test input validation and sanitization
- [ ] Check for SQL injection vulnerabilities
- [ ] Verify CORS is properly configured
- [ ] Test HTTPS enforcement

---

## 12. Deployment

### 12.1 Backend Deployment
**Action Required:**
- [ ] Deploy backend to production server
- [ ] Set all environment variables
- [ ] Run database migrations
- [ ] Start backend server
- [ ] Verify health check endpoint is working
- [ ] Monitor logs for errors

### 12.2 Frontend Deployment
**Action Required:**
- [ ] Build production APKs/IPAs:
  ```bash
  # UserApp
  cd userApp
  eas build --profile production --platform android --env EXPO_PUBLIC_API_URL=https://api.yourdomain.com
  
  # ProviderApp
  cd providerApp
  eas build --profile production --platform android --env EXPO_PUBLIC_API_URL=https://api.yourdomain.com
  ```
- [ ] Test production builds on real devices
- [ ] Submit to app stores (if applicable)

### 12.3 Post-Deployment Verification
**Action Required:**
- [ ] Verify all API endpoints are accessible
- [ ] Test complete user flows
- [ ] Monitor error logs
- [ ] Check database connections
- [ ] Verify payment gateway is working
- [ ] Test push notifications
- [ ] Monitor system performance

---

## 🔴 Critical Items (Must Do Before Production)

1. **Remove Payment Bypass Logic** - `backend/routes/payments.js` (lines 92-130)
2. **Update Paytm to Production** - Change `WEBSTAGING` to `WEBPROD`
3. **Update API URLs** - Change localhost IPs to production domains
4. **Update CORS Origins** - Remove localhost, add production domains
5. **Update Database Credentials** - Use production database
6. **Generate Strong JWT Secret** - At least 32 characters, unique
7. **Remove Debug Code** - Remove all `__DEV__` and `console.log` statements
8. **Update Environment Variables** - All production credentials
9. **Test Payment Flow** - End-to-end payment testing
10. **Run Database Migrations** - On production database

---

## 📝 Additional Notes

### Environment-Specific Files
- Keep `config.env` for development
- Use `config.production.env` as template for production
- Never commit actual credentials to version control

### Monitoring
- Set up error monitoring (Sentry, LogRocket, etc.)
- Set up performance monitoring
- Configure log aggregation
- Set up alerts for critical errors

### Backup Strategy
- Configure database backups
- Set up automated backups
- Test backup restoration process

### SSL/TLS
- Ensure HTTPS is enabled
- Verify SSL certificates are valid
- Configure proper SSL/TLS settings

---

## ✅ Final Checklist

Before going live, verify:

- [ ] All environment variables are set correctly
- [ ] Payment bypass logic is removed
- [ ] All API URLs point to production
- [ ] CORS is configured for production domains only
- [ ] Database migrations are run
- [ ] All credentials are production credentials
- [ ] Debug code is removed or disabled
- [ ] Error handling is production-ready
- [ ] Logging is configured properly
- [ ] Security settings are enabled
- [ ] Load testing is completed
- [ ] All critical features are tested
- [ ] Production builds are tested on real devices
- [ ] Monitoring and alerts are set up

---

## 🆘 Rollback Plan

If issues occur after deployment:

1. **Immediate Actions:**
   - Revert to previous backend version
   - Revert database migrations (if needed)
   - Restore from backup (if needed)

2. **Communication:**
   - Notify users of any issues
   - Provide status updates

3. **Investigation:**
   - Check error logs
   - Review recent changes
   - Identify root cause

---

**Last Updated:** [Current Date]
**Version:** 1.0.0

