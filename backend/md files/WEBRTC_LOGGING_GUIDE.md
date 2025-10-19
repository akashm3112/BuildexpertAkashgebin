# WebRTC Comprehensive Logging Guide

## 📊 **Complete Logging System Overview**

Your WebRTC implementation now has **comprehensive logging** that captures every aspect of the calling system for debugging, analytics, and monitoring.

## 🗄️ **Database Tables**

### 1. **call_logs** (Enhanced)
```sql
- id (UUID, Primary Key)
- booking_id (UUID, Foreign Key)
- session_id (TEXT) - For Twilio integration
- call_sid (TEXT) - Twilio call ID
- caller_type (TEXT) - 'user' or 'provider'
- caller_phone (TEXT) - Phone number
- call_status (TEXT) - 'initiated', 'ringing', 'answered', 'completed', 'failed'
- call_duration (INTEGER) - Duration in seconds
- connection_quality (JSONB) - Connection quality metrics
- error_details (JSONB) - Error information
- end_reason (TEXT) - Why call ended
- metrics (JSONB) - Performance metrics
- call_started_at (TIMESTAMP)
- call_ended_at (TIMESTAMP)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
```

### 2. **call_events** (New)
```sql
- id (UUID, Primary Key)
- call_log_id (UUID, Foreign Key to call_logs)
- event_type (TEXT) - Event type
- event_data (JSONB) - Event details
- timestamp (TIMESTAMP)
```

## 📝 **Console Logging**

### **Socket.io Events**
```javascript
// Connection Events
🔌 New client connected: socket_id
🔌 Socket socket_id joined room user_id
❌ Client disconnected: { socketId, userId, reason, timestamp }

// Call Lifecycle
📞 Call initiated: { bookingId, from, to, timestamp }
📞 Call accepted: bookingId
📞 Call rejected: bookingId
📞 Call ended: bookingId

// WebRTC Signaling
📞 WebRTC Offer sent: { bookingId, from, to, offerType, timestamp }
📞 WebRTC Answer sent: { bookingId, from, to, answerType, timestamp }
📞 ICE Candidate sent: { bookingId, from, to, candidateType, timestamp }

// Connection States
📞 Connection state change: { bookingId, userId, state, details, timestamp }
📞 Call quality metrics: { bookingId, userId, metrics, timestamp }

// Errors
❌ Socket error: { socketId, userId, error, timestamp }
📞 WebRTC Error: { bookingId, userId, error, details, timestamp }
```

### **API Endpoints**
```javascript
// Call Logging
📞 Call logged with details: { bookingId, duration, callerType, status, connectionQuality, endReason, timestamp }
📞 Call event logged: { callLogId, eventType, eventData, timestamp }

// Errors
Error logging call: error_details
Error logging call event: error_details
Error getting call history: error_details
```

## 🔧 **API Endpoints**

### **1. Log Call Completion**
```http
POST /api/calls/log
Content-Type: application/json
Authorization: Bearer <token>

{
  "bookingId": "uuid",
  "duration": 120,
  "callerType": "user",
  "status": "completed",
  "connectionQuality": {
    "audioLevel": 0.8,
    "packetLoss": 0.02,
    "latency": 150
  },
  "errorDetails": null,
  "endReason": "user_ended",
  "metrics": {
    "connectionTime": 2.5,
    "iceGatheringTime": 1.2
  }
}
```

### **2. Log Call Events**
```http
POST /api/calls/event
Content-Type: application/json
Authorization: Bearer <token>

{
  "callLogId": "uuid",
  "eventType": "connection_state_change",
  "eventData": {
    "state": "connected",
    "previousState": "connecting",
    "timestamp": "2024-01-01T12:00:00Z"
  }
}
```

### **3. Get Call History**
```http
GET /api/calls/history/:bookingId
Authorization: Bearer <token>

Response:
{
  "status": "success",
  "data": {
    "calls": [
      {
        "id": "uuid",
        "booking_id": "uuid",
        "caller_type": "user",
        "call_status": "completed",
        "duration": 120,
        "connection_quality": {...},
        "error_details": null,
        "end_reason": "user_ended",
        "metrics": {...},
        "events": [
          {
            "id": "uuid",
            "event_type": "connection_state_change",
            "event_data": {...},
            "timestamp": "2024-01-01T12:00:00Z"
          }
        ]
      }
    ]
  }
}
```

## 📊 **Event Types to Log**

### **Call Lifecycle Events**
- `call_initiated` - Call started
- `call_ringing` - Receiver notified
- `call_accepted` - Call accepted
- `call_rejected` - Call rejected
- `call_connected` - WebRTC connection established
- `call_ended` - Call terminated

### **WebRTC Events**
- `offer_created` - WebRTC offer created
- `offer_sent` - Offer sent to peer
- `offer_received` - Offer received from peer
- `answer_created` - WebRTC answer created
- `answer_sent` - Answer sent to peer
- `answer_received` - Answer received from peer
- `ice_candidate_gathered` - ICE candidate found
- `ice_candidate_sent` - ICE candidate sent
- `ice_candidate_received` - ICE candidate received

### **Connection Events**
- `connection_state_change` - Connection state changed
- `ice_connection_state_change` - ICE connection state changed
- `ice_gathering_state_change` - ICE gathering state changed
- `signaling_state_change` - Signaling state changed

### **Quality Events**
- `audio_level_change` - Audio level changed
- `packet_loss_detected` - Packet loss detected
- `latency_measurement` - Latency measured
- `bandwidth_measurement` - Bandwidth measured

### **Error Events**
- `connection_failed` - Connection failed
- `ice_connection_failed` - ICE connection failed
- `media_access_denied` - Microphone access denied
- `network_error` - Network error occurred
- `timeout_error` - Call timeout

## 🎯 **Frontend Integration**

### **Log Call Events from Frontend**
```typescript
// In your WebRTC service
const logCallEvent = async (eventType: string, eventData: any) => {
  if (callLogId) {
    try {
      await fetch(`${API_BASE_URL}/api/calls/event`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          callLogId,
          eventType,
          eventData
        })
      });
    } catch (error) {
      console.error('Failed to log call event:', error);
    }
  }
};

// Usage examples
logCallEvent('connection_state_change', {
  state: 'connected',
  previousState: 'connecting'
});

logCallEvent('audio_level_change', {
  level: 0.8,
  timestamp: Date.now()
});

logCallEvent('connection_failed', {
  error: 'ICE connection failed',
  details: { reason: 'network_unreachable' }
});
```

## 📈 **Analytics Queries**

### **Call Success Rate**
```sql
SELECT 
  DATE(created_at) as date,
  COUNT(*) as total_calls,
  COUNT(CASE WHEN call_status = 'completed' THEN 1 END) as successful_calls,
  ROUND(
    COUNT(CASE WHEN call_status = 'completed' THEN 1 END) * 100.0 / COUNT(*), 
    2
  ) as success_rate
FROM call_logs 
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date;
```

### **Average Call Duration**
```sql
SELECT 
  caller_type,
  AVG(call_duration) as avg_duration,
  MIN(call_duration) as min_duration,
  MAX(call_duration) as max_duration
FROM call_logs 
WHERE call_status = 'completed'
GROUP BY caller_type;
```

### **Connection Quality Analysis**
```sql
SELECT 
  end_reason,
  COUNT(*) as count,
  AVG((connection_quality->>'latency')::numeric) as avg_latency,
  AVG((connection_quality->>'packetLoss')::numeric) as avg_packet_loss
FROM call_logs 
WHERE connection_quality IS NOT NULL
GROUP BY end_reason;
```

### **Error Analysis**
```sql
SELECT 
  (error_details->>'error') as error_type,
  COUNT(*) as count,
  MAX(created_at) as last_occurrence
FROM call_logs 
WHERE error_details IS NOT NULL
GROUP BY (error_details->>'error')
ORDER BY count DESC;
```

## 🚨 **Monitoring & Alerts**

### **Key Metrics to Monitor**
1. **Call Success Rate** - Should be > 90%
2. **Average Connection Time** - Should be < 5 seconds
3. **Call Drop Rate** - Should be < 5%
4. **Audio Quality** - Packet loss < 2%
5. **Error Rate** - Should be < 1%

### **Alert Conditions**
- Call success rate drops below 85%
- Average connection time exceeds 10 seconds
- High error rate for specific error types
- Multiple connection failures in short time

## 🔍 **Debugging Workflow**

### **1. Check Console Logs**
- Look for error patterns in console output
- Check Socket.io connection logs
- Monitor WebRTC signaling events

### **2. Query Database**
- Check call_logs for failed calls
- Analyze call_events for detailed timeline
- Look for error patterns in error_details

### **3. Analyze Metrics**
- Check connection_quality data
- Review performance metrics
- Identify bottlenecks

## ✅ **Logging Checklist**

- ✅ **Socket.io Events** - All connection and signaling events
- ✅ **WebRTC Events** - Offer/answer/ICE candidate logging
- ✅ **Connection States** - State changes and quality metrics
- ✅ **Error Handling** - Comprehensive error logging
- ✅ **Call Lifecycle** - Complete call flow tracking
- ✅ **Performance Metrics** - Quality and performance data
- ✅ **Database Storage** - Persistent logging with events
- ✅ **API Endpoints** - RESTful logging endpoints
- ✅ **Analytics Ready** - Queryable data structure
- ✅ **Monitoring Ready** - Key metrics for alerts

Your WebRTC system now has **enterprise-grade logging** that captures everything needed for debugging, monitoring, and analytics! 🎉
