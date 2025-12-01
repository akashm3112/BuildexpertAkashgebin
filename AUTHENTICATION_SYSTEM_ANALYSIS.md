# 🔐 COMPREHENSIVE AUTHENTICATION SYSTEM ANALYSIS
**Date:** January 2025  
**Scope:** userApp, providerApp, Backend  
**Perspective:** Production-Ready Assessment

---

## 📋 EXECUTIVE SUMMARY

This document provides a detailed analysis of the authentication system across both frontend applications (userApp, providerApp) and the backend, focusing on:
1. **Refresh Token Logic** - Token rotation, refresh mechanisms
2. **Cache Management** - In-memory and persistent storage
3. **Auto-login using Cache** - Session persistence
4. **Token & IP Blacklisting** - Security mechanisms
5. **Connection Retry Logic** - Network resilience

**Overall Assessment:** ✅ **PRODUCTION-READY** with minor recommendations

---

## 1. 🔄 REFRESH TOKEN LOGIC

### 1.1 Backend Implementation (`backend/utils/refreshToken.js`)

#### ✅ **STRENGTHS:**
1. **Token Rotation Implemented**
   - Old access token is blacklisted when refresh occurs
   - Old refresh token is revoked (marked `is_revoked = TRUE`)
   - New token pair is generated with new JTIs
   - Uses `family_id` for token family tracking

2. **Session Management Integration**
   - ✅ **FIXED:** New session is created for new token's JTI after refresh
   - Old session is invalidated (optional, but implemented)
   - Prevents "Session expired" errors after token refresh

3. **Security Features**
   - Refresh tokens stored as SHA-256 hashes (not plaintext)
   - Random 64-byte refresh tokens (128 hex characters)
   - Token expiration: Access (15min), Refresh (30 days)
   - Database transaction ensures atomicity

4. **Error Handling**
   - Database connection errors are distinguished from token errors
   - Proper error logging with context
   - Graceful failure handling

#### ⚠️ **POTENTIAL ISSUES:**
1. **Refresh Token Expiry Calculation**
   - Line 79: `refreshTokenExpiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS)`
   - But `REFRESH_TOKEN_EXPIRY_MS` is calculated as `30 * 24 * 60 * 60 * 1000` (30 days)
   - ✅ **CORRECT:** Matches `REFRESH_TOKEN_EXPIRY = '30d'`

2. **Token Family Tracking**
   - `family_id` is created but not actively used for security checks
   - Could be used to detect token reuse attacks (replay detection)
   - ⚠️ **RECOMMENDATION:** Consider implementing family-based replay detection

3. **Concurrent Refresh Handling**
   - No explicit locking mechanism for concurrent refresh requests
   - ⚠️ **RISK:** Multiple simultaneous refresh requests could cause race conditions
   - ✅ **MITIGATION:** Frontend queues refresh requests (see Frontend section)

### 1.2 Frontend Implementation (`userApp/providerApp/utils/tokenManager.ts`)

#### ✅ **STRENGTHS:**
1. **Proactive Token Refresh**
   - Refreshes 2 minutes before expiration (`DEFAULT_BUFFER_TIME = 2 * 60 * 1000`)
   - Prevents 401 errors during active usage
   - Checks both access token expiry and refresh token expiry

2. **Cache Invalidation Strategy**
   - ✅ **CRITICAL FIX:** Cache invalidated IMMEDIATELY when refresh starts
   - Prevents concurrent requests from using stale (blacklisted) tokens
   - Public `invalidateCache()` method for apiClient integration

3. **Error Handling**
   - Distinguishes between network errors (503) and token errors (401)
   - Network errors: Don't clear tokens, allow retry
   - Token errors (401): Clear tokens, logout user
   - Refresh token expired (30 days): Clear all data, logout

4. **User Data Preservation**
   - `clearTokensOnly()`: Clears tokens but keeps user data
   - `clearStoredData()`: Clears everything (only on 30-day expiry)
   - Prevents premature logout on temporary network issues

5. **Signup/Login Flow Protection**
   - Checks for user data before attempting refresh
   - Skips refresh during signup/login flows
   - Prevents errors during authentication

#### ⚠️ **POTENTIAL ISSUES:**
1. **userApp vs providerApp Differences**
   - **userApp:** Has user data check before refresh (lines 124-136)
   - **providerApp:** Missing user data check (lines 116-130)
   - ⚠️ **INCONSISTENCY:** providerApp might attempt refresh during signup
   - ✅ **RECOMMENDATION:** Add user data check to providerApp

2. **Token Refresh Retry Configuration**
   - **userApp:** `maxRetries: 1, timeout: 10000` (10s)
   - **providerApp:** `maxRetries: 2, timeout: 15000` (15s)
   - ⚠️ **INCONSISTENCY:** Different retry strategies
   - ✅ **RECOMMENDATION:** Standardize to same values

3. **Network Error Detection**
   - **userApp:** Comprehensive network error detection (lines 417-434)
   - **providerApp:** Basic network error detection (lines 385-405)
   - ⚠️ **INCONSISTENCY:** Different error handling approaches
   - ✅ **RECOMMENDATION:** Align error detection logic

### 1.3 API Client Integration (`userApp/providerApp/utils/apiClient.ts`)

#### ✅ **STRENGTHS:**
1. **Token Refresh Queue**
   - Prevents multiple simultaneous refresh calls
   - Queues requests during refresh (even `forceRefresh`)
   - All queued requests receive the same refreshed token

2. **Cache Invalidation Before Refresh**
   - ✅ **CRITICAL FIX:** `tokenManager.invalidateCache()` called before refresh
   - Ensures no stale tokens are used during refresh

3. **Direct Token Usage in Retry**
   - ✅ **CRITICAL FIX:** Refreshed token passed directly to `retryWithRefresh()`
   - Prevents using stale cached token after refresh
   - Old token is already blacklisted, so new token MUST be used

4. **Error Suppression**
   - "Session expired" errors are suppressed from React Native logs
   - Prevents noisy console logs for expected behavior
   - Multiple layers of catch handlers prevent unhandled rejections

#### ⚠️ **POTENTIAL ISSUES:**
1. **userApp vs providerApp Differences**
   - **userApp:** Has comprehensive promise wrapping and error suppression (lines 725-789)
   - **providerApp:** Missing promise wrapping (lines 667-700)
   - ⚠️ **INCONSISTENCY:** providerApp might have unhandled rejections
   - ✅ **RECOMMENDATION:** Add promise wrapping to providerApp

2. **Network Error Handling**
   - **userApp:** Comprehensive network error detection and handling (lines 617-641)
   - **providerApp:** Basic network error handling (lines 592-616)
   - ⚠️ **INCONSISTENCY:** Different approaches
   - ✅ **RECOMMENDATION:** Align error handling

---

## 2. 💾 CACHE MANAGEMENT

### 2.1 In-Memory Cache (`tokenManager.ts`)

#### ✅ **STRENGTHS:**
1. **Cache TTL**
   - 1-second TTL prevents excessive AsyncStorage reads
   - Reduces I/O operations significantly
   - Cache timestamp tracks age

2. **Cache Invalidation**
   - Public `invalidateCache()` method
   - Called immediately before token refresh
   - Called after token storage operations
   - Prevents stale data issues

3. **Cache Update Strategy**
   - Cache updated after successful token storage
   - Cache cleared on errors
   - Atomic cache operations (no race conditions)

#### ⚠️ **POTENTIAL ISSUES:**
1. **Cache TTL Too Short?**
   - 1-second TTL might cause frequent AsyncStorage reads
   - ⚠️ **CONSIDERATION:** Could increase to 5-10 seconds for better performance
   - ✅ **CURRENT:** Works correctly, but could be optimized

2. **No Cache Warming**
   - Cache is only populated on first read
   - ⚠️ **CONSIDERATION:** Could pre-populate cache on app startup
   - ✅ **CURRENT:** Lazy loading is acceptable

### 2.2 Persistent Storage (`AsyncStorage`)

#### ✅ **STRENGTHS:**
1. **Retry Mechanism**
   - All storage operations have `maxRetries: 2-3`
   - Handles transient storage errors
   - Prevents data loss

2. **Backward Compatibility**
   - Supports old token format (`token` key)
   - Migrates to new format automatically
   - Prevents breaking changes

3. **Data Structure**
   - Separate keys for access token, refresh token, expiry times
   - Allows independent management
   - Clear data structure

#### ⚠️ **POTENTIAL ISSUES:**
1. **No Encryption**
   - Tokens stored in plaintext in AsyncStorage
   - ⚠️ **SECURITY RISK:** If device is compromised, tokens are accessible
   - ✅ **RECOMMENDATION:** Consider using encrypted storage (e.g., `react-native-keychain`)

2. **Storage Errors Not Propagated**
   - Storage errors are caught and logged, but not always propagated
   - ⚠️ **CONSIDERATION:** Some operations might fail silently
   - ✅ **CURRENT:** Most critical operations have error handling

---

## 3. 🔐 AUTO-LOGIN USING CACHE

### 3.1 AuthContext Implementation (`userApp/providerApp/context/AuthContext.tsx`)

#### ✅ **STRENGTHS:**
1. **Token Existence Check**
   - Checks if tokens exist before loading user
   - Only loads user if tokens are present
   - Prevents loading user without authentication

2. **Refresh Token Expiry Check**
   - Checks refresh token expiry (30 days) before loading user
   - Only clears user data if refresh token is expired
   - Access token expiry is ignored (will be refreshed on first API call)

3. **Graceful Error Handling**
   - Storage errors don't prevent user loading
   - Token check errors are handled gracefully
   - User is loaded even if token check fails (will validate on first API call)

4. **Background Token Refresh**
   - Attempts to refresh token in background on user load
   - Non-blocking (wrapped in try-catch)
   - Optimizes for immediate API calls

#### ⚠️ **POTENTIAL ISSUES:**
1. **userApp vs providerApp Differences**
   - **userApp:** Background refresh wrapped in `.catch()` (line 94)
   - **providerApp:** Background refresh wrapped in IIFE with try-catch (lines 102-110)
   - ⚠️ **INCONSISTENCY:** Different approaches, but both work
   - ✅ **RECOMMENDATION:** Standardize to same approach

2. **No Token Validation on Load**
   - Tokens are not validated against backend on app startup
   - ⚠️ **CONSIDERATION:** Could validate tokens on startup to detect revoked tokens
   - ✅ **CURRENT:** Validation happens on first API call (acceptable)

3. **Race Condition Risk**
   - Multiple components might call `loadUser()` simultaneously
   - ⚠️ **CONSIDERATION:** Could add a loading lock
   - ✅ **CURRENT:** React's state management prevents issues

### 3.2 App Entry Point (`userApp/providerApp/app/index.tsx`)

#### ✅ **STRENGTHS:**
1. **Simple Redirect Logic**
   - Redirects to tabs if user exists
   - Redirects to login if no user
   - Clean and straightforward

2. **Loading State**
   - Shows loading spinner while auth is loading
   - Prevents flash of wrong screen

#### ⚠️ **POTENTIAL ISSUES:**
1. **No Error Handling**
   - If `loadUser()` throws an error, app might crash
   - ⚠️ **CONSIDERATION:** Add error boundary
   - ✅ **CURRENT:** AuthContext handles errors internally

---

## 4. 🚫 TOKEN & IP BLACKLISTING

### 4.1 Token Blacklisting (`backend/utils/tokenBlacklist.js`)

#### ✅ **STRENGTHS:**
1. **JTI-Based Blacklisting**
   - Uses JWT ID (jti) for blacklisting
   - Efficient lookup (indexed column)
   - Prevents token reuse after logout/refresh

2. **Expiration Handling**
   - Blacklisted tokens expire naturally
   - Cleanup job removes expired entries
   - Prevents database bloat

3. **Comprehensive Functions**
   - `blacklistToken()`: Blacklist single token
   - `blacklistAllUserTokens()`: Blacklist all user tokens
   - `isTokenBlacklisted()`: Check if token is blacklisted
   - `cleanupExpiredTokens()`: Cleanup expired entries

4. **Security-First Approach**
   - On error, assumes token is blacklisted (fail-closed)
   - Prevents security bypass on database errors

#### ⚠️ **POTENTIAL ISSUES:**
1. **No IP-Based Token Blacklisting**
   - Tokens are blacklisted globally, not per-IP
   - ⚠️ **CONSIDERATION:** Could add IP-based blacklisting for additional security
   - ✅ **CURRENT:** Global blacklisting is sufficient for most use cases

2. **Cleanup Frequency**
   - Cleanup is manual (no automatic cron job mentioned)
   - ⚠️ **CONSIDERATION:** Should run cleanup periodically (e.g., daily)
   - ✅ **RECOMMENDATION:** Add scheduled cleanup job

### 4.2 IP Blacklisting (`backend/utils/securityAudit.js`)

#### ✅ **STRENGTHS:**
1. **Failed Login Attempt Tracking**
   - Tracks failed login attempts per IP
   - `getRecentFailedAttemptsFromIP()`: Get attempts in time window
   - `shouldBlockIP()`: Check if IP should be blocked

2. **Configurable Thresholds**
   - Default: 10 failed attempts in 15 minutes
   - Can be customized per call
   - Flexible for different scenarios

3. **Security Event Logging**
   - All security events are logged
   - Includes IP address, user agent, metadata
   - Enables security analysis

#### ⚠️ **POTENTIAL ISSUES:**
1. **No Automatic IP Blocking**
   - `shouldBlockIP()` only checks, doesn't block
   - ⚠️ **CONSIDERATION:** Should implement automatic blocking middleware
   - ✅ **CURRENT:** Used in login route, but not globally

2. **No IP Whitelist**
   - No mechanism to whitelist trusted IPs
   - ⚠️ **CONSIDERATION:** Could add IP whitelist for admin/trusted users
   - ✅ **RECOMMENDATION:** Add IP whitelist feature

3. **No Rate Limiting Integration**
   - IP blacklisting is separate from rate limiting
   - ⚠️ **CONSIDERATION:** Could integrate with rate limiting middleware
   - ✅ **CURRENT:** Rate limiting exists but is separate

### 4.3 Auth Middleware (`backend/middleware/auth.js`)

#### ✅ **STRENGTHS:**
1. **Comprehensive Token Validation**
   - JWT verification
   - JTI existence check
   - Token type check (access token only)
   - Blacklist check
   - Session validation

2. **Session Integration**
   - Verifies session exists and is active
   - Updates session activity (fire-and-forget)
   - Prevents use of invalidated sessions

3. **Error Messages**
   - Clear error messages for different failure scenarios
   - Helps with debugging
   - Doesn't leak sensitive information

#### ⚠️ **POTENTIAL ISSUES:**
1. **No IP Validation**
   - Doesn't check if request IP matches session IP
   - ⚠️ **SECURITY CONSIDERATION:** Could add IP validation for additional security
   - ✅ **CURRENT:** IP is logged but not validated (acceptable for mobile apps)

2. **Session Activity Update is Fire-and-Forget**
   - `updateSessionActivity()` is called but not awaited
   - ⚠️ **CONSIDERATION:** Could cause race conditions if multiple requests arrive simultaneously
   - ✅ **CURRENT:** Fire-and-forget is acceptable for performance

---

## 5. 🔄 CONNECTION RETRY LOGIC

### 5.1 Request Queue (`userApp/providerApp/utils/requestQueue.ts`)

#### ✅ **STRENGTHS:**
1. **Priority Queue**
   - CRITICAL, HIGH, NORMAL, LOW priorities
   - Processes high-priority requests first
   - Adaptive batch size based on network speed

2. **Network Speed Detection**
   - Detects FAST, MODERATE, SLOW network speeds
   - Adapts batch size and retry delays
   - Optimizes for network conditions

3. **Persistence**
   - Queue is persisted to AsyncStorage
   - Survives app restarts
   - Automatic cleanup of old requests (24 hours)

4. **Deduplication**
   - Prevents duplicate requests
   - Updates priority if duplicate found
   - Reduces unnecessary network calls

5. **Token Refresh Integration**
   - Handles 401 errors by refreshing token
   - Retries with new token automatically
   - Removes request if token refresh fails

#### ⚠️ **POTENTIAL ISSUES:**
1. **userApp vs providerApp Differences**
   - **userApp:** Has comprehensive error handling for network speed checks (lines 80-108)
   - **providerApp:** Basic error handling (lines 80-98)
   - ⚠️ **INCONSISTENCY:** Different error handling approaches
   - ✅ **RECOMMENDATION:** Align error handling

2. **Network Speed Check Frequency**
   - Checks every 2 minutes (120 seconds)
   - ⚠️ **CONSIDERATION:** Could be too frequent for battery life
   - ✅ **CURRENT:** Acceptable for most use cases

3. **No Request Timeout in Queue**
   - Queued requests don't have individual timeouts
   - ⚠️ **CONSIDERATION:** Could add timeout to prevent stale requests
   - ✅ **CURRENT:** 24-hour cleanup handles this

### 5.2 Connection Recovery (`userApp/providerApp/utils/connectionRecovery.ts`)

#### ✅ **STRENGTHS:**
1. **App State Monitoring**
   - Monitors app foreground/background state
   - Validates connection when app comes to foreground
   - Ensures tokens are fresh after app resume

2. **Network State Monitoring**
   - Monitors network connectivity changes
   - Triggers recovery when network is restored
   - Integrates with request queue

3. **Cooldown Mechanism**
   - 5-second cooldown between recovery attempts
   - Prevents excessive recovery calls
   - Reduces battery drain

4. **Token Validation**
   - Validates tokens exist and are valid
   - Attempts refresh if needed
   - Handles errors gracefully

#### ⚠️ **POTENTIAL ISSUES:**
1. **userApp vs providerApp Differences**
   - **userApp:** Comprehensive error suppression for "Session expired" (lines 44-51, 69-76, 134-143, 154-170, 191-198)
   - **providerApp:** Basic error handling (lines 44-46, 64-66, 124-128, 137-145, 166-171)
   - ⚠️ **INCONSISTENCY:** Different error handling approaches
   - ✅ **RECOMMENDATION:** Align error handling

2. **Recovery Cooldown**
   - 5-second cooldown might be too long for some scenarios
   - ⚠️ **CONSIDERATION:** Could make cooldown configurable
   - ✅ **CURRENT:** 5 seconds is reasonable

3. **No Exponential Backoff**
   - Recovery attempts use fixed cooldown
   - ⚠️ **CONSIDERATION:** Could add exponential backoff for failed recoveries
   - ✅ **CURRENT:** Fixed cooldown is acceptable

### 5.3 API Client Retry Logic (`userApp/providerApp/utils/apiClient.ts`)

#### ✅ **STRENGTHS:**
1. **Exponential Backoff with Jitter**
   - Retry delays increase exponentially
   - Jitter prevents thundering herd
   - Respects `retry-after` header

2. **Retryable Error Detection**
   - Distinguishes retryable (network, 5xx) from non-retryable (4xx) errors
   - Doesn't retry unsafe methods on client errors
   - Smart retry logic

3. **Request Deduplication**
   - Prevents duplicate requests
   - 5-second TTL for dedup cache
   - LRU eviction for memory management

4. **Rate Limiting**
   - Per-endpoint rate limiting
   - Global rate limiting
   - Prevents API abuse

#### ⚠️ **POTENTIAL ISSUES:**
1. **userApp vs providerApp Differences**
   - **userApp:** Comprehensive promise wrapping and error suppression (lines 725-789)
   - **providerApp:** Missing promise wrapping (lines 667-700)
   - ⚠️ **INCONSISTENCY:** providerApp might have unhandled rejections
   - ✅ **RECOMMENDATION:** Add promise wrapping to providerApp

2. **Rate Limit Store Size**
   - Max 1000 entries with LRU eviction
   - ⚠️ **CONSIDERATION:** Could be too small for high-traffic scenarios
   - ✅ **CURRENT:** Should be sufficient for most use cases

---

## 6. 🔍 CRITICAL FINDINGS & RECOMMENDATIONS

### 6.1 🔴 CRITICAL ISSUES (Must Fix)

1. **providerApp Missing Promise Wrapping**
   - **Location:** `providerApp/utils/apiClient.ts`
   - **Issue:** Missing promise wrapping for "Session expired" error suppression
   - **Impact:** Unhandled promise rejections in React Native
   - **Fix:** Add promise wrapping similar to userApp (lines 725-789)

2. **providerApp Missing User Data Check**
   - **Location:** `providerApp/utils/tokenManager.ts`
   - **Issue:** Missing user data check before token refresh
   - **Impact:** Might attempt refresh during signup/login flows
   - **Fix:** Add user data check similar to userApp (lines 124-136)

### 6.2 🟡 HIGH PRIORITY (Should Fix)

1. **Inconsistent Error Handling**
   - **Issue:** userApp and providerApp have different error handling approaches
   - **Impact:** Inconsistent behavior, harder to maintain
   - **Fix:** Standardize error handling across both apps

2. **Inconsistent Token Refresh Configuration**
   - **Issue:** Different retry counts and timeouts between apps
   - **Impact:** Different behavior in edge cases
   - **Fix:** Standardize to same values

3. **No Automatic IP Blocking Middleware**
   - **Location:** `backend/middleware/auth.js`
   - **Issue:** IP blocking is checked but not enforced globally
   - **Impact:** Security risk if not used in all routes
   - **Fix:** Add global IP blocking middleware

### 6.3 🟢 MEDIUM PRIORITY (Nice to Have)

1. **Token Storage Encryption**
   - **Issue:** Tokens stored in plaintext in AsyncStorage
   - **Impact:** Security risk if device is compromised
   - **Fix:** Use encrypted storage (e.g., `react-native-keychain`)

2. **Token Family Replay Detection**
   - **Location:** `backend/utils/refreshToken.js`
   - **Issue:** `family_id` is created but not used for security
   - **Impact:** Could detect token reuse attacks
   - **Fix:** Implement family-based replay detection

3. **Automatic Cleanup Jobs**
   - **Issue:** Cleanup jobs are manual
   - **Impact:** Database bloat over time
   - **Fix:** Add scheduled cleanup jobs (cron)

4. **IP Whitelist Feature**
   - **Issue:** No mechanism to whitelist trusted IPs
   - **Impact:** Legitimate users might be blocked
   - **Fix:** Add IP whitelist for admin/trusted users

### 6.4 🔵 LOW PRIORITY (Optimization)

1. **Cache TTL Optimization**
   - **Issue:** 1-second cache TTL might be too short
   - **Impact:** More AsyncStorage reads than necessary
   - **Fix:** Increase to 5-10 seconds

2. **Network Speed Check Frequency**
   - **Issue:** Checks every 2 minutes
   - **Impact:** Battery drain
   - **Fix:** Make configurable or increase interval

3. **Request Queue Timeout**
   - **Issue:** No individual request timeouts
   - **Impact:** Stale requests might be processed
   - **Fix:** Add timeout to queued requests

---

## 7. ✅ PRODUCTION READINESS CHECKLIST

### Backend
- ✅ Token rotation implemented
- ✅ Session management integrated
- ✅ Token blacklisting functional
- ✅ IP-based rate limiting
- ✅ Security event logging
- ⚠️ Automatic cleanup jobs (manual)
- ⚠️ IP whitelist (not implemented)

### Frontend (userApp)
- ✅ Token refresh queue
- ✅ Cache invalidation
- ✅ Auto-login with cache
- ✅ Connection recovery
- ✅ Request queue with persistence
- ✅ Error suppression
- ✅ Promise wrapping

### Frontend (providerApp)
- ✅ Token refresh queue
- ✅ Cache invalidation
- ✅ Auto-login with cache
- ✅ Connection recovery
- ✅ Request queue with persistence
- ⚠️ Error suppression (incomplete)
- ⚠️ Promise wrapping (missing)
- ⚠️ User data check (missing)

---

## 8. 📊 SUMMARY

### Overall Assessment: ✅ **PRODUCTION-READY** (with minor fixes recommended)

**Strengths:**
- Comprehensive token rotation and refresh logic
- Robust cache management
- Excellent connection recovery mechanisms
- Strong security features (blacklisting, rate limiting)
- Good error handling (mostly)

**Weaknesses:**
- Inconsistencies between userApp and providerApp
- Missing promise wrapping in providerApp
- No automatic cleanup jobs
- No token storage encryption

**Recommendations:**
1. **Immediate:** Fix providerApp promise wrapping and user data check
2. **Short-term:** Standardize error handling across both apps
3. **Medium-term:** Add automatic cleanup jobs, IP whitelist
4. **Long-term:** Consider token storage encryption, token family replay detection

---

## 9. 🔗 RELATED FILES

### Backend
- `backend/utils/refreshToken.js` - Token refresh logic
- `backend/utils/tokenBlacklist.js` - Token blacklisting
- `backend/utils/sessionManager.js` - Session management
- `backend/utils/securityAudit.js` - IP blacklisting
- `backend/middleware/auth.js` - Auth middleware

### Frontend (userApp)
- `userApp/utils/tokenManager.ts` - Token management
- `userApp/utils/apiClient.ts` - API client with retry
- `userApp/utils/connectionRecovery.ts` - Connection recovery
- `userApp/utils/requestQueue.ts` - Request queue
- `userApp/context/AuthContext.tsx` - Auth context

### Frontend (providerApp)
- `providerApp/utils/tokenManager.ts` - Token management
- `providerApp/utils/apiClient.ts` - API client with retry
- `providerApp/utils/connectionRecovery.ts` - Connection recovery
- `providerApp/utils/requestQueue.ts` - Request queue
- `providerApp/context/AuthContext.tsx` - Auth context

---

**End of Analysis**

