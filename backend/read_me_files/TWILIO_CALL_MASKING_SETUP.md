# 📞 Twilio Call Masking Setup Guide

## Overview
This guide helps you set up Twilio call masking for private communication between users and providers in the BuildXpert app.

## 🔧 Twilio Console Setup

### Step 1: Create Proxy Service
1. **Login to Twilio Console**: https://console.twilio.com/
2. **Navigate to Proxy**: https://console.twilio.com/us1/develop/proxy/services
3. **Create Service**:
   - Click "Create new Proxy Service"
   - Name: "BuildXpert Call Masking"
   - Callback URL: `https://your-domain.com/api/calls/webhook/status`
   - Click "Create"
4. **Copy Service SID**: Save the SID (starts with `KS...`)

### Step 2: Add Phone Numbers to Proxy
1. **Buy Phone Number** (if you don't have one):
   - Go to Phone Numbers → Manage → Buy a number
   - Choose a number in your target country
2. **Add to Proxy Service**:
   - In your Proxy Service → Phone Numbers
   - Click "Add Phone Number"
   - Select your purchased number
   - Click "Add"

### Step 3: Configure Environment Variables
Update your `backend/config.env`:

```env
# Existing Twilio Config
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token  
TWILIO_PHONE_NUMBER=your_twilio_number

# New: Call Masking Config
TWILIO_PROXY_SERVICE_SID=KSxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

## 🧪 Testing Setup

### Test Twilio Configuration
```bash
cd backend
node -e "
const { callMaskingService } = require('./utils/callMasking');
require('dotenv').config({ path: './config.env' });

async function test() {
  const result = await callMaskingService.validateConfiguration();
  console.log('Twilio Config:', result);
}
test();
"
```

### Test Call Masking API
```bash
# Test with real booking ID
curl -X POST http://localhost:5000/api/calls/test-config \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 🔄 How Call Masking Works

### 1. User/Provider Clicks Call Button
```
User clicks "Call" → App sends request to backend → 
Backend creates Twilio Proxy session → Twilio calls user's phone →
When user answers, Twilio connects to provider → Private conversation
```

### 2. Privacy Protection
- **User's number**: Hidden from provider
- **Provider's number**: Hidden from user  
- **Proxy number**: Your Twilio number acts as middleman
- **Call logs**: Tracked in your database for analytics

### 3. Session Management
- **Auto-expire**: Sessions end after 1 hour
- **Reusable**: Same session for multiple calls per booking
- **Secure**: Only booking participants can initiate calls

## 📱 Frontend Integration

### UserApp Implementation
```tsx
import CallMaskingButton from '@/components/calls/CallMaskingButton';

// In booking interface
<CallMaskingButton
  bookingId={booking.id}
  callerType="user"
  size="small"
  variant="outline"
/>
```

### ProviderApp Implementation  
```tsx
import CallMaskingButton from '@/components/calls/CallMaskingButton';

// In booking interface
<CallMaskingButton
  bookingId={booking.id}
  callerType="provider"
  size="small"
  variant="primary"
/>
```

## 🗄️ Database Schema

### call_sessions
```sql
- booking_id: Links to booking
- session_id: Twilio proxy session ID
- proxy_number: Your Twilio number used
- customer_phone: User's phone (encrypted)
- provider_phone: Provider's phone (encrypted)
- status: active/ended/expired
```

### call_logs
```sql
- booking_id: Links to booking
- call_sid: Twilio call ID
- caller_type: user/provider
- call_status: initiated/ringing/answered/completed
- call_duration: Call length in seconds
```

## 🔒 Security Features

### Privacy Protection
- ✅ **Number Masking**: Real numbers never exposed
- ✅ **Session Expiry**: Auto-expire after 1 hour
- ✅ **Access Control**: Only booking participants can call
- ✅ **Call Logs**: Comprehensive audit trail

### Data Protection
- ✅ **Encrypted Storage**: Phone numbers encrypted in database
- ✅ **Secure API**: Authentication required for all endpoints
- ✅ **Webhook Validation**: Twilio webhook signature verification
- ✅ **Rate Limiting**: Prevent abuse of calling feature

## 💰 Twilio Pricing

### Proxy Service Costs
- **Proxy Sessions**: $0.05 per session
- **Phone Number**: ~$1-15/month (varies by country)
- **Voice Calls**: Standard Twilio voice rates
- **SMS** (if enabled): Standard SMS rates

### Cost Optimization
- Sessions auto-expire to minimize costs
- Reuse sessions for same booking
- Optional call recording for quality assurance
- Analytics to track usage patterns

## 🚀 Production Deployment

### Webhook Configuration
1. **Set Webhook URL** in Twilio Console:
   ```
   https://your-production-domain.com/api/calls/webhook/status
   ```

2. **Configure HTTPS**: Twilio requires HTTPS for webhooks

3. **Test Webhooks**: Use Twilio's webhook testing tools

### Monitoring
- **Call Success Rate**: Monitor failed calls
- **Session Usage**: Track session creation/expiry
- **Cost Analysis**: Monitor Twilio usage costs
- **User Feedback**: Collect call quality feedback

## 🎯 User Experience

### For Users
1. **Click "Call" button** in booking interface
2. **Receive call** on registered number from your Twilio number
3. **Answer call** → Automatically connected to provider
4. **Private conversation** without exposing numbers

### For Providers
1. **Click "Call" button** in booking interface
2. **Receive call** on registered number from your Twilio number
3. **Answer call** → Automatically connected to customer
4. **Professional communication** with privacy protection

## 🔧 Troubleshooting

### Common Issues
1. **"Call Failed"**: Check Twilio credentials and proxy service setup
2. **"Number not reachable"**: Verify phone number format (+country code)
3. **"Webhook errors"**: Ensure webhook URL is accessible and HTTPS
4. **"Session expired"**: Sessions auto-expire after 1 hour

### Debug Commands
```bash
# Test Twilio connection
node -e "const twilio = require('twilio'); const client = twilio('SID', 'TOKEN'); client.api.accounts.list().then(console.log);"

# Check proxy service
curl -X GET "https://proxy.twilio.com/v1/Services/YOUR_PROXY_SID" \
  -u "YOUR_SID:YOUR_TOKEN"
```

---

## Summary

Call masking provides enterprise-level privacy protection for your marketplace app, ensuring users and providers can communicate safely without exposing personal phone numbers. The implementation is production-ready with comprehensive error handling, security features, and cost optimization.



