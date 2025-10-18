# WebRTC Platform Compatibility Fix

## Issue
`react-native-webrtc` is not compatible with web browsers in Expo. When trying to run the apps on web, it causes:
- Import errors for `event-target-shim`
- ENOENT errors trying to read `<anonymous>` files
- App fails to load on web

## Solution
Made WebRTC conditional to only load on native platforms (iOS/Android).

## Changes Made

### 1. Conditional WebRTC Import
**Files**: 
- `userApp/services/webrtc.ts`
- `providerApp/services/webrtc.ts`

Changed from:
```typescript
import { RTCPeerConnection, ... } from 'react-native-webrtc';
```

To:
```typescript
import { Platform } from 'react-native';

let RTCPeerConnection: any;
// ... other imports

if (Platform.OS !== 'web') {
  const webrtc = require('react-native-webrtc');
  RTCPeerConnection = webrtc.RTCPeerConnection;
  // ... etc
}
```

### 2. Platform Check in WebRTCService
Added `isWebRTCAvailable` flag that checks:
- Platform is not 'web'
- RTCPeerConnection is available

### 3. Guard Methods
Added checks in `startCall()` and `acceptCall()`:
```typescript
if (!this.isWebRTCAvailable) {
  throw new Error('WebRTC not available on web browser. Use mobile app.');
}
```

### 4. Hide Call Buttons on Web
**Files**:
- `userApp/components/calls/WebRTCCallButton.tsx`
- `providerApp/components/calls/WebRTCCallButton.tsx`

```typescript
if (Platform.OS === 'web') {
  return null;
}
```

## Result

✅ **Web**: Apps now work on web browser (no WebRTC)
✅ **iOS**: Full WebRTC calling support
✅ **Android**: Full WebRTC calling support

## Testing

### On Web (Browser)
```bash
cd userApp  # or providerApp
npx expo start
# Press 'w' for web
```
- ✅ App loads successfully
- ✅ No call buttons shown
- ✅ All other features work

### On Mobile (iOS/Android)
```bash
cd userApp  # or providerApp
npx expo start
# Scan QR code with Expo Go app
```
- ✅ App loads successfully
- ✅ Call buttons visible
- ✅ WebRTC calling works

## Important Notes

1. **WebRTC Only Works on Mobile**
   - Call feature requires the mobile app (iOS/Android)
   - Not available on web browsers
   - This is a limitation of `react-native-webrtc`

2. **Production Considerations**
   - For web calling, would need a different solution (e.g., Twilio Voice SDK for web)
   - Or use a cross-platform solution that works on web and mobile
   - Current implementation focuses on native mobile experience

3. **User Communication**
   - If users try to use web version, they won't see call buttons
   - Consider adding a message: "Voice calling available on mobile app"

## Alternative Solutions (If Web Calling Needed)

1. **Use Twilio Voice SDK**
   - Different SDK for web vs mobile
   - More complex but works everywhere
   - Costs per minute

2. **Use Agora.io or similar**
   - Provides web and mobile SDKs
   - More reliable cross-platform
   - May have costs

3. **Build separate web calling**
   - Use WebRTC directly on web
   - Keep react-native-webrtc for mobile
   - More maintenance overhead

## Recommendation

For now, **mobile-only calling is sufficient** because:
- Most users use mobile apps for service bookings
- WebRTC on mobile provides better quality
- No additional costs (unlike Twilio)
- Simpler implementation

If web calling becomes critical, consider Twilio or Agora in the future.

---

**Status**: ✅ Fixed
**Date**: 2025-01-10
**Platform Support**: Mobile Only (iOS/Android)

