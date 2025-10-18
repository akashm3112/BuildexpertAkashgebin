# Comprehensive Logout Functionality

## Overview
Both `userApp` and `providerApp` now have comprehensive logout functionality that clears all cached data and app-related details, just like real-world applications.

## Features Implemented

### 🧹 **Complete Data Clearing**
- **AsyncStorage**: Clears all stored data except language preferences
- **User State**: Resets user context to null
- **Notification State**: Resets notification counts and cached notifications
- **Cached Images**: Removes profile pictures and pending uploads
- **API Cache**: Clears all cached API responses
- **Temporary Data**: Removes all temporary files and data

### 🔐 **Automatic Logout**
- **Token Expiration**: Automatically logs out users when API returns 401 (Unauthorized)
- **Session Management**: Handles expired or invalid tokens gracefully
- **Network Errors**: Maintains logout functionality even with network issues

### 🚪 **Multiple Logout Methods**

#### 1. **Standard Logout** (via AuthContext)
```typescript
const { logout } = useAuth();
await logout(); // Clears all data and resets state
```

#### 2. **Complete Logout Utility** (standalone)
```typescript
import { performCompleteLogout } from '@/utils/logout';
await performCompleteLogout(); // Includes navigation
```

#### 3. **Emergency Logout** (nuclear option)
```typescript
import { performEmergencyLogout } from '@/utils/logout';
await performEmergencyLogout(); // Clears everything including language prefs
```

#### 4. **LogoutButton Component** (UI component)
```typescript
import LogoutButton from '@/components/common/LogoutButton';

<LogoutButton 
  variant="destructive"
  showConfirmation={true}
  onLogoutComplete={() => console.log('Logged out!')}
/>
```

## Implementation Details

### AuthContext Enhancements
- **Comprehensive Data Clearing**: Removes all AsyncStorage keys except language preferences
- **State Reset**: Resets user state and all related contexts
- **Global API Integration**: Sets up automatic logout for expired tokens

### NotificationContext Integration
- **State Reset**: Added `resetNotificationState()` function
- **Automatic Cleanup**: Resets notification counts and cached data
- **Socket Disconnection**: Properly disconnects from real-time notifications

### API Integration
- **Global Logout Handler**: Automatically triggers logout on 401 responses
- **Token Management**: Handles expired tokens gracefully
- **Error Recovery**: Maintains functionality even during network issues

## Data Cleared on Logout

### ✅ **Always Cleared**
- `user` - User profile data
- `token` - Authentication token
- `cached_profile_image` - Cached profile pictures
- `pending_profile_upload` - Pending image uploads
- `cached_*` - All cached API responses
- `temp_*` - All temporary data
- `booking_*` - Booking related cache
- `service_*` - Service related cache
- `notification_*` - Notification cache
- `earnings_*` - Earnings cache
- `stats_*` - Statistics cache
- `recent_*` - Recent data cache
- Any key containing: `profile`, `image`, `provider`, `search`

### ⚠️ **Preserved Data**
- `selectedLanguage` - User's language preference (preserved for UX)

### 🚨 **Emergency Logout**
- Clears **everything** including language preferences
- Use only when app is in an inconsistent state

## Navigation Handling

### **providerApp**
- Redirects to `/auth` (login/signup screen)
- Clears navigation stack completely

### **userApp** 
- Redirects to `/(auth)/login` (login screen)
- Clears navigation stack completely

## Usage Examples

### Basic Logout (from Profile Screen)
```typescript
const handleLogout = async () => {
  try {
    await logout();
    router.replace('/auth'); // or /(auth)/login for userApp
  } catch (error) {
    console.error('Logout failed:', error);
  }
};
```

### Logout with Confirmation
```typescript
<LogoutButton 
  title="Sign Out"
  variant="destructive"
  showConfirmation={true}
  onLogoutStart={() => setLoading(true)}
  onLogoutComplete={() => setLoading(false)}
/>
```

### Emergency Logout (for error recovery)
```typescript
import { performEmergencyLogout } from '@/utils/logout';

// In error boundary or critical error handler
await performEmergencyLogout();
```

## Security Features

### 🔐 **Token Security**
- Immediately removes authentication tokens
- Prevents unauthorized access to user data
- Handles token expiration gracefully

### 🛡️ **Data Privacy**
- Completely clears sensitive user data
- Removes cached images and personal information
- Ensures no data persistence after logout

### 🚫 **Session Invalidation**
- Disconnects from real-time services (Socket.IO)
- Clears all active API sessions
- Resets notification subscriptions

## Error Handling

### Network Errors
- Logout works offline
- Clears local data even without network
- Handles navigation errors gracefully

### Storage Errors
- Continues logout process even if some data can't be cleared
- Logs errors for debugging
- Always resets user state as fallback

### Navigation Errors
- Attempts multiple navigation methods
- Provides fallback navigation paths
- Ensures user reaches login screen

## Testing

### Manual Testing Checklist
- [ ] Standard logout clears all data
- [ ] Profile images are removed
- [ ] Cached API data is cleared
- [ ] Notifications are reset
- [ ] Navigation works correctly
- [ ] Automatic logout on 401 errors
- [ ] Emergency logout works
- [ ] Language preference is preserved
- [ ] Works offline
- [ ] Handles network errors

### Verification Commands
```bash
# Check AsyncStorage contents before/after logout
# All keys except 'selectedLanguage' should be cleared
```

## Files Modified

### **Both Apps**
- `context/AuthContext.tsx` - Enhanced logout functionality
- `context/NotificationContext.tsx` - Added state reset
- `utils/logout.ts` - Standalone logout utilities
- `utils/api.ts` - Automatic logout on 401
- `components/common/LogoutButton.tsx` - Reusable logout component

### **Existing Files Enhanced**
- `app/(tabs)/profile.tsx` - Already had logout buttons
- Profile screens continue to work with enhanced functionality

## Benefits

### 🚀 **User Experience**
- Clean logout experience like professional apps
- Preserves user preferences (language)
- Handles errors gracefully
- Fast and responsive

### 🔒 **Security**
- Complete data clearing prevents data leaks
- Automatic session invalidation
- Proper token management

### 🛠️ **Developer Experience**
- Multiple logout methods for different use cases
- Comprehensive error handling
- Easy to use components and utilities
- Extensive logging for debugging

## Future Enhancements

### Possible Additions
- **Logout Analytics**: Track logout reasons
- **Selective Data Clearing**: Allow users to choose what to clear
- **Logout Scheduling**: Automatic logout after inactivity
- **Multi-Device Logout**: Logout from all devices
- **Data Export**: Allow users to export data before logout

---

## Summary

The logout functionality now provides a comprehensive, secure, and user-friendly experience that matches real-world app standards. All user data, cache, and app state is properly cleared while preserving essential preferences like language settings. The implementation includes multiple logout methods, automatic token handling, and robust error recovery.
