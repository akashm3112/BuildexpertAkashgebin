# EXPO_ACCESS_TOKEN Setup Guide

## What is EXPO_ACCESS_TOKEN?

`EXPO_ACCESS_TOKEN` is an optional but **highly recommended** environment variable for the BuildXpert backend. It improves push notification reliability and rate limits when sending notifications through Expo's Push Notification service.

## Why is it needed?

Without `EXPO_ACCESS_TOKEN`:
- Push notifications will still work
- But you'll have stricter rate limits
- May experience delays during high traffic

With `EXPO_ACCESS_TOKEN`:
- Higher rate limits
- Better reliability
- Priority support from Expo

## How to Get Your Token

1. **Go to Expo Dashboard:**
   - Visit: https://expo.dev/accounts/[your-account]/settings/access-tokens
   - Or navigate: Expo Dashboard → Account Settings → Access Tokens

2. **Create a New Token:**
   - Click "Create Token"
   - Give it a name (e.g., "BuildXpert Production")
   - Copy the token immediately (you won't be able to see it again)

3. **Add to Your Backend Environment:**

### For Render (Production):
1. Go to your Render dashboard
2. Select your backend service
3. Go to "Environment" tab
4. Click "Add Environment Variable"
5. Add:
   - **Key:** `EXPO_ACCESS_TOKEN`
   - **Value:** `your_token_here`
6. Save and redeploy

### For Local Development:
Add to your `backend/config.env` file:
```env
EXPO_ACCESS_TOKEN=your_token_here
```

### For Docker:
Add to your `docker-compose.yml` or `.env` file:
```yaml
environment:
  - EXPO_ACCESS_TOKEN=${EXPO_ACCESS_TOKEN}
```

Or in `.env`:
```env
EXPO_ACCESS_TOKEN=your_token_here
```

## Verification

After setting the token, check your backend logs on startup. You should see:

**✅ If token is set:**
```
Expo push notifications configured { hasAccessToken: true, tokenPrefix: 'exp_xxxxx...' }
```

**⚠️ If token is missing:**
```
EXPO_ACCESS_TOKEN not set - push notifications will work but with limited rate limits
```

## Security Notes

- **Never commit** `EXPO_ACCESS_TOKEN` to Git
- Keep it in environment variables only
- Rotate the token if it's ever exposed
- Use different tokens for development and production

## Troubleshooting

### Push notifications not working?
1. Check if token is set: Look for the log message on startup
2. Verify token is valid: Try creating a new token
3. Check Expo account: Ensure your Expo account is active
4. Review backend logs: Look for push notification errors

### Token expired?
- Create a new token in Expo dashboard
- Update the environment variable
- Restart your backend service

## Need Help?

- Expo Documentation: https://docs.expo.dev/push-notifications/overview/
- Expo Support: https://expo.dev/support

