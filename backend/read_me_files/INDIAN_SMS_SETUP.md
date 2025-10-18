# Indian SMS Setup for BuildXpert

## Current Issue
The app is configured with a US Twilio phone number (`+16318929576`) but is designed for Indian users. This creates a country mismatch when trying to send SMS to Indian phone numbers.

## Current Behavior
- ✅ **Phone number formatting**: All 10-digit numbers are correctly formatted as Indian numbers (`+91XXXXXXXXXX`)
- ✅ **Validation**: Accepts any 10-digit Indian mobile number
- ✅ **OTP generation**: Works correctly
- ⚠️ **SMS delivery**: Currently logs to console due to country mismatch

## Solutions

### Option 1: Get an Indian Twilio Phone Number (Recommended)

1. **Sign up for Twilio India**:
   - Visit: https://www.twilio.com/in
   - Create an account with Indian billing address
   - Verify your identity with Indian documents

2. **Get an Indian phone number**:
   - In Twilio Console, go to Phone Numbers → Manage → Buy a number
   - Select India as the country
   - Choose a number with SMS capabilities

3. **Update configuration**:
   ```env
   TWILIO_PHONE_NUMBER=+91XXXXXXXXXX  # Your new Indian number
   ```

### Option 2: Use Alternative SMS Services

#### A. MSG91 (Popular in India)
```javascript
// Example integration
const msg91 = require('msg91')('YOUR_MSG91_API_KEY', 'YOUR_SENDER_ID', '4');

const sendSMS = async (phone, message) => {
  return new Promise((resolve, reject) => {
    msg91.send(phone, message, function(err, response) {
      if (err) reject(err);
      else resolve(response);
    });
  });
};
```

#### B. TextLocal (Indian SMS Gateway)
```javascript
// Example integration
const axios = require('axios');

const sendSMS = async (phone, message) => {
  const url = 'https://api.textlocal.in/send/';
  const params = {
    apikey: 'YOUR_API_KEY',
    numbers: phone,
    message: message,
    sender: 'TXTLCL'
  };
  
  const response = await axios.post(url, params);
  return response.data;
};
```

### Option 3: Use WhatsApp Business API
- More reliable for Indian users
- Better delivery rates
- Requires business verification

## Current Implementation

The app now handles the country mismatch gracefully:

1. **Detects country mismatch**: Indian numbers with US Twilio number
2. **Falls back to console logging**: OTP is logged for development/testing
3. **Returns success**: User experience is not broken
4. **Provides clear logging**: Shows what's happening and how to fix it

## Testing

Run the test script to see the current behavior:
```bash
cd backend
node test-indian-otp.js
```

## Next Steps

1. **For Development**: Current setup works fine (OTP logged to console)
2. **For Production**: Get an Indian Twilio number or integrate alternative SMS service
3. **For Testing**: Use the console logs to verify OTP functionality

## Environment Variables

Current setup:
```env
TWILIO_ACCOUNT_SID=AC4dde5e595dc4be61cefd995ee8cce6a2
TWILIO_AUTH_TOKEN=956265fc2cd6b82cfd161da7b0a80c68
TWILIO_PHONE_NUMBER=+16318929576  # US number (needs to be changed)
DEFAULT_COUNTRY_CODE=1  # Can be removed since we only support India
```

Recommended setup:
```env
TWILIO_ACCOUNT_SID=AC4dde5e595dc4be61cefd995ee8cce6a2
TWILIO_AUTH_TOKEN=956265fc2cd6b82cfd161da7b0a80c68
TWILIO_PHONE_NUMBER=+91XXXXXXXXXX  # Indian number
# Remove DEFAULT_COUNTRY_CODE since we only support India
```
