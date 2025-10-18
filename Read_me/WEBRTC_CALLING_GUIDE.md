# WebRTC Calling Feature - Implementation Guide

## Overview
This document describes the WebRTC-based voice calling feature implemented between users and service providers in the BuildXpert app. The feature provides:

- ✅ **Complete Number Privacy**: Phone numbers are never exposed
- ✅ **Bidirectional Calling**: Both users and providers can initiate calls
- ✅ **Direct P2P Connection**: Low latency, no per-minute charges
- ✅ **Call History Tracking**: All calls are logged with duration
- ✅ **In-App Calling UI**: Beautiful native call interface
- ✅ **Socket.io Signaling**: Real-time call notifications

---

## Architecture

### Components

#### 1. **Backend (Node.js + Socket.io)**
- **Location**: `backend/server.js`
- **Features**:
  - WebRTC signaling server using Socket.io
  - Manages call offers, answers, and ICE candidates
  - Tracks active calls and manages call state
  - Provides REST API for call information

#### 2. **WebRTC Service (React Native)**
- **Locations**: 
  - `userApp/services/webrtc.ts`
  - `providerApp/services/webrtc.ts`
- **Features**:
  - Manages RTCPeerConnection
  - Handles audio streams
  - Exchanges SDP offers/answers
  - Manages ICE candidates
  - Uses Google's free STUN servers

#### 3. **Custom Hook (useWebRTCCall)**
- **Locations**:
  - `userApp/hooks/useWebRTCCall.ts`
  - `providerApp/hooks/useWebRTCCall.ts`
- **Features**:
  - React hook for easy call management
  - State management (idle, calling, ringing, connected, ended)
  - Call duration tracking
  - Error handling

#### 4. **UI Components**
- **CallScreen**: Global call UI (incoming/outgoing/active)
  - `userApp/components/calls/CallScreen.tsx`
  - `providerApp/components/calls/CallScreen.tsx`
  
- **WebRTCCallButton**: Call button component
  - `userApp/components/calls/WebRTCCallButton.tsx`
  - `providerApp/components/calls/WebRTCCallButton.tsx`

---

## Call Flow

### User Initiates Call to Provider

```
1. User clicks "Call" button on booking
2. userApp fetches call info from backend (/api/calls/initiate)
3. Backend returns: callerId, receiverId, names
4. userApp creates RTCPeerConnection + gets audio stream
5. Socket.io emits 'call:initiate' to backend
6. Backend notifies provider via 'call:incoming' event
7. providerApp shows incoming call UI
8. Provider accepts → Socket.io signaling begins:
   - Caller creates SDP offer
   - Receiver creates SDP answer
   - Both exchange ICE candidates
9. P2P connection established
10. Call timer starts, audio flows directly
11. Either party can end call
12. Call duration logged to database
```

### Provider Initiates Call to User
Same flow, but roles reversed.

---

## Database Schema

### Call Logs Table
```sql
CREATE TABLE call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id),
  caller_type VARCHAR(50) NOT NULL, -- 'user' or 'provider'
  caller_id UUID NOT NULL REFERENCES users(id),
  call_status VARCHAR(50) NOT NULL, -- 'completed', 'missed', 'failed'
  duration INTEGER DEFAULT 0, -- in seconds
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## API Endpoints

### POST `/api/calls/initiate`
**Purpose**: Get call information for a booking

**Request**:
```json
{
  "bookingId": "uuid",
  "callerType": "user" | "provider"
}
```

**Response**:
```json
{
  "status": "success",
  "data": {
    "bookingId": "uuid",
    "callerId": "uuid",
    "callerName": "John Doe",
    "receiverId": "uuid",
    "receiverName": "Jane Smith",
    "serviceName": "Plumber"
  }
}
```

### POST `/api/calls/log`
**Purpose**: Log call details after completion

**Request**:
```json
{
  "bookingId": "uuid",
  "duration": 120,
  "callerType": "user",
  "status": "completed"
}
```

### GET `/api/calls/history/:bookingId`
**Purpose**: Get call history for a booking

**Response**:
```json
{
  "status": "success",
  "data": {
    "calls": [
      {
        "id": "uuid",
        "caller_type": "user",
        "duration": 120,
        "call_status": "completed",
        "created_at": "2024-01-01T10:00:00Z"
      }
    ]
  }
}
```

---

## Socket.io Events

### Client → Server

| Event | Data | Description |
|-------|------|-------------|
| `join` | `userId` | Join user's personal room |
| `call:initiate` | `{ bookingId, callerId, callerName, receiverId, receiverName }` | Start a call |
| `call:accept` | `{ bookingId, receiverId }` | Accept incoming call |
| `call:reject` | `{ bookingId, reason }` | Reject incoming call |
| `call:offer` | `{ bookingId, offer, to }` | Send SDP offer |
| `call:answer` | `{ bookingId, answer, to }` | Send SDP answer |
| `call:ice-candidate` | `{ bookingId, candidate, to }` | Exchange ICE candidate |
| `call:end` | `{ bookingId, userId }` | End active call |

### Server → Client

| Event | Data | Description |
|-------|------|-------------|
| `call:incoming` | `{ bookingId, callerId, callerName }` | Incoming call notification |
| `call:accepted` | `{ bookingId, receiverId }` | Call was accepted |
| `call:rejected` | `{ bookingId, reason }` | Call was rejected |
| `call:offer` | `{ bookingId, offer, from }` | Receive SDP offer |
| `call:answer` | `{ bookingId, answer, from }` | Receive SDP answer |
| `call:ice-candidate` | `{ bookingId, candidate, from }` | Receive ICE candidate |
| `call:ended` | `{ bookingId, duration, endedBy }` | Call ended |

---

## Configuration

### WebRTC Config (STUN Servers)
```typescript
const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};
```

**Note**: For production, consider adding TURN servers for better NAT traversal.

---

## Usage Example

### In userApp (Booking Screen)
```tsx
import WebRTCCallButton from '@/components/calls/WebRTCCallButton';

<WebRTCCallButton
  bookingId={booking.id}
  size="small"
  variant="outline"
/>
```

### In providerApp (Booking Screen)
```tsx
import WebRTCCallButton from '@/components/calls/WebRTCCallButton';

<WebRTCCallButton
  bookingId={booking.id}
  size="small"
  variant="primary"
/>
```

### Global Call UI
The `CallScreen` component is automatically rendered in the root layout and shows:
- Incoming call with Accept/Reject buttons
- Outgoing call with calling state
- Active call with timer and End button

---

## Testing

### 1. **Local Testing**
- Run backend: `cd backend && npm start`
- Run userApp: `cd userApp && npm start`
- Run providerApp: `cd providerApp && npm start`
- Create a booking and test calling from both sides

### 2. **Test Checklist**
- [ ] User can call provider after booking accepted
- [ ] Provider can call user after booking accepted
- [ ] Incoming call notification appears
- [ ] Accept call establishes audio connection
- [ ] Reject call works properly
- [ ] Call duration is tracked correctly
- [ ] End call terminates connection
- [ ] Call history is logged to database
- [ ] Multiple calls work without issues
- [ ] Disconnection handling works

---

## Troubleshooting

### Issue: No audio during call
**Solution**: Check microphone permissions on both devices

### Issue: Call doesn't connect (ICE failed)
**Solution**: 
- Check firewall settings
- Add TURN servers to WebRTC config
- Verify network allows WebRTC traffic

### Issue: Socket.io not connecting
**Solution**: 
- Verify `API_BASE_URL` is correct
- Check backend Socket.io server is running
- Verify CORS settings

### Issue: Call button doesn't work
**Solution**:
- Check booking status is 'accepted'
- Verify user authentication token
- Check console logs for errors

---

## Future Enhancements

1. **TURN Servers**: Add production TURN servers for better NAT traversal
2. **Call Recording**: Add server-side call recording
3. **Video Calls**: Extend to support video calls
4. **Call Quality**: Add network quality monitoring
5. **Call Analytics**: Track call success rates, durations
6. **Multiple Devices**: Support receiving calls on multiple devices
7. **Push Notifications**: Add push notifications for incoming calls
8. **Call Queue**: Support multiple simultaneous calls

---

## Security Considerations

1. **Privacy**: Phone numbers are never exposed to other party
2. **Authentication**: All API calls require valid JWT token
3. **Authorization**: Only booking participants can call each other
4. **Encryption**: WebRTC uses DTLS-SRTP for end-to-end encryption
5. **Timeouts**: Call sessions auto-expire if no activity

---

## Dependencies

### Backend
- `socket.io` - ^4.x - Real-time signaling

### Frontend
- `react-native-webrtc` - WebRTC for React Native
- `socket.io-client` - Socket.io client

---

## Migration from Twilio

This implementation replaces the previous Twilio call masking system:

### Removed
- ❌ Twilio SDK (`twilio` package)
- ❌ `backend/utils/callMasking.js`
- ❌ Old `CallMaskingButton` components
- ❌ Twilio environment variables

### Benefits
- ✅ No monthly/per-minute charges
- ✅ Direct P2P connection (lower latency)
- ✅ Complete control over call flow
- ✅ Better user experience
- ✅ Scalable without cost increase

---

## Support

For issues or questions:
1. Check console logs in both apps
2. Verify Socket.io connection status
3. Check network connectivity
4. Review this guide's troubleshooting section

---

## License

This implementation is part of the BuildXpert platform.


