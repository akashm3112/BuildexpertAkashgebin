# Authentication Strategy: Long-Lived Sessions

## Overview

The app uses a **90-day refresh token expiration** strategy, similar to Instagram and other modern apps. This provides a balance between user convenience and security.

## Token Configuration

- **Access Token**: 15 minutes (short-lived for security)
- **Refresh Token**: 90 days (long-lived for convenience)

## How It Works

1. **User logs in** → Receives access token (15 min) + refresh token (90 days)
2. **Access token expires** → Automatically refreshed using refresh token
3. **User inactive for 90 days** → Must login again
4. **User active within 90 days** → Stays logged in seamlessly

## Security Features

### 1. Token Rotation
- Each refresh generates new tokens
- Old refresh tokens are invalidated
- Prevents token replay attacks

### 2. Device Tracking
- Refresh tokens are tied to specific devices
- Device name and type are stored
- Users can see all logged-in devices

### 3. Token Revocation
- Users can logout from all devices
- Tokens can be revoked on password change
- Admin can revoke tokens if needed

### 4. Short Access Token Lifetime
- Access tokens expire in 15 minutes
- Even if compromised, damage is limited
- Automatic refresh keeps UX smooth

### 5. Secure Storage
- Tokens stored in AsyncStorage (encrypted on iOS/Android)
- Refresh tokens hashed in database
- No plain-text token storage

## User Experience

### Scenario 1: Active User (Daily/Weekly)
- ✅ Stays logged in for 90 days
- ✅ No re-authentication needed
- ✅ Seamless experience

### Scenario 2: Occasional User (Monthly)
- ✅ Stays logged in for 90 days
- ✅ Can use app anytime without login
- ✅ Better retention

### Scenario 3: Inactive User (90+ days)
- ⚠️ Must login again
- ✅ Security: Old sessions expire
- ✅ Prevents unauthorized access

## Comparison with Other Apps

| App | Refresh Token Expiry | Notes |
|-----|---------------------|-------|
| **BuildXpert** | 90 days | Balanced approach |
| Instagram | ~90 days | Similar strategy |
| Facebook | 60-90 days | Similar strategy |
| Gmail | 6 months | Very long |
| Banking Apps | 7-30 days | More strict |

## Best Practices Implemented

1. ✅ **Token Rotation**: New tokens on each refresh
2. ✅ **Device Tracking**: Know which devices are logged in
3. ✅ **Revocation**: Can logout from all devices
4. ✅ **Short Access Tokens**: 15-minute expiry
5. ✅ **Secure Storage**: Encrypted storage on device
6. ✅ **Automatic Refresh**: Seamless token renewal

## Security Considerations

### If Device is Lost/Stolen
- User can logout from all devices via another device
- Tokens expire after 90 days of inactivity
- Access tokens expire in 15 minutes (limited damage window)

### If Token is Compromised
- Token rotation invalidates old tokens
- Short access token lifetime limits exposure
- Device tracking helps identify suspicious activity

## Configuration

To change the refresh token expiration, update:

```javascript
// backend/utils/refreshToken.js
const REFRESH_TOKEN_EXPIRY = '90d'; // Change this value
const REFRESH_TOKEN_EXPIRY_MS = 90 * 24 * 60 * 60 * 1000; // Update accordingly
```

### Recommended Values

- **30 days**: More secure, users login monthly
- **60 days**: Balanced (recommended for most apps)
- **90 days**: Current setting (Instagram-like)
- **180 days**: Very convenient, less secure

## Monitoring

Monitor these metrics:
- Average session duration
- Token refresh frequency
- Logout rate
- Failed refresh attempts

## Future Enhancements

1. **Biometric Re-authentication**: For sensitive actions
2. **Suspicious Activity Detection**: Alert on unusual patterns
3. **Session Management UI**: Let users see/manage active sessions
4. **Remember Me Option**: Let users choose session length

