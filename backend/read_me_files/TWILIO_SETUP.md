# Twilio SMS Setup for BuildXpert OTP Notifications

This guide will help you set up Twilio SMS service to send OTP notifications to users in the BuildXpert userApp.

## Prerequisites

1. A Twilio account (sign up at [twilio.com](https://www.twilio.com))
2. A verified phone number in your Twilio account
3. Access to your Twilio Console

## Step 1: Get Your Twilio Credentials

1. **Log in to your Twilio Console**: Go to [console.twilio.com](https://console.twilio.com)
2. **Find your Account SID**: 
   - On the dashboard, you'll see your Account SID
   - It starts with "AC" (e.g., AC1234567890abcdef1234567890abcdef)
3. **Find your Auth Token**:
   - Click on "Settings" → "API Keys & Tokens"
   - Copy your Auth Token (or create a new one)

## Step 2: Get a Twilio Phone Number

1. **Purchase a phone number**:
   - Go to "Phone Numbers" → "Manage" → "Buy a number"
   - Choose a number that supports SMS
   - For India, you might want to get a local number or use a US number
2. **Note down the phone number**: You'll need this for the configuration

## Step 3: Configure Environment Variables

Update your `backend/config.env` file with your Twilio credentials:

```env
# SMS Configuration (Twilio)
TWILIO_ACCOUNT_SID=AC1234567890abcdef1234567890abcdef
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+1234567890
```

**Important Notes:**
- Replace `AC1234567890abcdef1234567890abcdef` with your actual Account SID
- Replace `your_auth_token_here` with your actual Auth Token
- Replace `+1234567890` with your Twilio phone number (include the + and country code)

## Step 4: Test the Setup

1. **Start your backend server**:
   ```bash
   cd backend
   npm run dev
   ```

2. **Check the console output**:
   - You should see: "✅ Twilio SMS service initialized successfully"
   - If you see an error, check your credentials

3. **Test OTP sending**:
   - Use the userApp to register a new user
   - Check if the OTP is sent via SMS
   - In development mode, OTPs will also be logged to the console

## Step 5: Production Deployment

For production deployment:

1. **Set environment variables** on your hosting platform (Heroku, Railway, etc.)
2. **Ensure your Twilio account has sufficient credits**
3. **Monitor SMS delivery** in your Twilio Console

## Troubleshooting

### Common Issues

1. **"Twilio credentials not configured"**
   - Check that all three environment variables are set
   - Ensure Account SID starts with "AC"

2. **"Failed to initialize Twilio client"**
   - Verify your Account SID and Auth Token are correct
   - Check your internet connection

3. **SMS not being sent**
   - Check your Twilio account balance
   - Verify the phone number format (+91 for India)
   - Check Twilio Console for error messages

4. **Invalid phone number errors**
   - Ensure phone numbers are in international format
   - For India: +91XXXXXXXXXX (10 digits after +91)

### Development vs Production

- **Development**: OTPs are logged to console for easy testing
- **Production**: OTPs are sent via actual SMS

### Security Best Practices

1. **Never commit credentials to version control**
2. **Use environment variables for all sensitive data**
3. **Regularly rotate your Auth Token**
4. **Monitor your Twilio usage and costs**

## Cost Considerations

- Twilio charges per SMS sent
- Check current rates at [twilio.com/pricing](https://www.twilio.com/pricing)
- Consider setting up usage alerts in your Twilio Console

## Support

If you encounter issues:
1. Check the Twilio documentation: [twilio.com/docs](https://www.twilio.com/docs)
2. Review your Twilio Console logs
3. Check your backend server logs for error messages
