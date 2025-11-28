# 🔒 Webhook Security Guide

## Overview

All webhook endpoints must verify signatures to prevent spoofing and ensure requests are from legitimate sources. This guide explains how to implement webhook signature verification for different providers.

## Current Implementation

### ✅ Paytm Webhook (`/api/payments/paytm-callback`)

**Status:** ✅ **Fully Secured**

The Paytm callback endpoint implements three layers of security:

1. **IP Whitelist Verification** - Only accepts requests from Paytm IP ranges
2. **Replay Attack Prevention** - Prevents duplicate webhook processing
3. **Checksum Verification** - Verifies HMAC-SHA256 checksum using merchant key

**Implementation:**
```javascript
// Already implemented in backend/routes/payments.js
router.post('/paytm-callback', webhookLimiter, asyncHandler(async (req, res) => {
  // 1. IP verification
  if (!PaymentSecurity.verifyPaytmIP(clientIP)) {
    throw new ValidationError('Unauthorized');
  }

  // 2. Replay attack prevention
  const replayCheck = await PaymentSecurity.checkWebhookReplay(...);
  if (replayCheck.isReplay) {
    throw new ValidationError('Replay detected');
  }

  // 3. Checksum verification
  if (!verifyPaytmChecksum(paytmResponse, receivedChecksum, merchantKey)) {
    throw new ValidationError('Checksum verification failed');
  }
  
  // Process webhook...
}));
```

## Webhook Verification Utility

A comprehensive webhook verification utility is available at `backend/utils/webhookVerification.js` that supports:

- **Paytm** - HMAC-SHA256 checksum verification
- **Twilio** - HMAC-SHA1 signature verification
- **Stripe** - HMAC-SHA256 signature with timestamp validation
- **Generic** - Custom HMAC signature verification

## Adding Signature Verification to New Webhooks

### Option 1: Using Middleware (Recommended)

Use the pre-configured middleware from `backend/middleware/webhookSecurity.js`:

```javascript
const { twilioWebhookVerification } = require('../middleware/webhookSecurity');
const { webhookLimiter } = require('../middleware/rateLimiting');

// Twilio webhook example
router.post('/twilio/webhook/status',
  webhookLimiter,
  twilioWebhookVerification, // ✅ Signature verification
  asyncHandler(async (req, res) => {
    // Webhook is verified, safe to process
    const callStatus = req.body.CallStatus;
    // ... process webhook
  })
);
```

### Option 2: Manual Verification

For custom verification logic:

```javascript
const { verifyTwilioSignature } = require('../utils/webhookVerification');
const config = require('../utils/config');

router.post('/twilio/webhook/status',
  webhookLimiter,
  asyncHandler(async (req, res) => {
    const signature = req.headers['x-twilio-signature'];
    const authToken = config.get('twilio.authToken');
    const fullUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

    if (!verifyTwilioSignature(fullUrl, req.body, signature, authToken)) {
      throw new ValidationError('Invalid webhook signature');
    }

    // Webhook is verified, safe to process
    // ... process webhook
  })
);
```

### Option 3: Generic HMAC Verification

For custom webhook providers:

```javascript
const { genericWebhookVerification } = require('../middleware/webhookSecurity');

const customWebhookVerification = genericWebhookVerification({
  secret: process.env.CUSTOM_WEBHOOK_SECRET,
  signatureHeader: 'x-custom-signature',
  algorithm: 'sha256', // or 'sha1', 'sha512', etc.
  encoding: 'hex' // or 'base64'
});

router.post('/custom/webhook',
  webhookLimiter,
  customWebhookVerification,
  asyncHandler(async (req, res) => {
    // Webhook is verified, safe to process
    // ... process webhook
  })
);
```

## Security Best Practices

### 1. Always Verify Signatures

**❌ BAD:**
```javascript
router.post('/webhook', async (req, res) => {
  // No signature verification - VULNERABLE!
  processWebhook(req.body);
});
```

**✅ GOOD:**
```javascript
router.post('/webhook',
  webhookLimiter,
  webhookSignatureVerification, // ✅ Always verify
  asyncHandler(async (req, res) => {
    processWebhook(req.body);
  })
);
```

### 2. Use Rate Limiting

All webhook endpoints should have rate limiting to prevent abuse:

```javascript
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Max 10 requests per minute
  message: 'Too many webhook requests'
});

router.post('/webhook', webhookLimiter, ...);
```

### 3. Log Security Events

Log all webhook verification failures for security monitoring:

```javascript
if (!verifySignature(...)) {
  logger.warn('Webhook signature verification failed', {
    provider: 'twilio',
    ip: req.ip,
    url: req.originalUrl
  });
  throw new ValidationError('Invalid webhook signature');
}
```

### 4. Prevent Replay Attacks

For critical webhooks, implement replay attack prevention:

```javascript
// Check if webhook has been processed before
const existingWebhook = await getRow(`
  SELECT * FROM webhook_logs
  WHERE provider = $1 AND webhook_id = $2
`, [provider, webhookId]);

if (existingWebhook) {
  throw new ValidationError('Webhook already processed');
}
```

### 5. Validate Timestamps

For webhooks with timestamps, validate they're recent:

```javascript
const webhookTime = new Date(req.body.timestamp);
const now = new Date();
const diffMinutes = (now - webhookTime) / (1000 * 60);

if (diffMinutes > 5) {
  throw new ValidationError('Webhook timestamp too old');
}
```

## Provider-Specific Requirements

### Paytm

- **Algorithm:** HMAC-SHA256
- **Key:** Merchant Key (from Paytm dashboard)
- **Checksum Field:** `CHECKSUMHASH` (excluded from calculation)
- **Additional Security:** IP whitelist + replay prevention

### Twilio

- **Algorithm:** HMAC-SHA1
- **Key:** Auth Token (from Twilio console)
- **Signature Header:** `X-Twilio-Signature`
- **Signature String:** `URL + sorted(params)`

### Stripe

- **Algorithm:** HMAC-SHA256
- **Key:** Webhook Secret (from Stripe dashboard)
- **Signature Header:** `Stripe-Signature`
- **Timestamp Validation:** 5 minutes tolerance (configurable)

## Testing Webhook Verification

### Test Paytm Webhook

```javascript
// Test checksum generation
const { verifyPaytmChecksum } = require('../utils/webhookVerification');
const payload = { ORDERID: 'ORDER123', STATUS: 'TXN_SUCCESS' };
const checksum = generateChecksum(payload, merchantKey);
payload.CHECKSUMHASH = checksum;

// Verify
const isValid = verifyPaytmChecksum(payload, checksum, merchantKey);
console.log('Checksum valid:', isValid); // Should be true
```

### Test Twilio Webhook

```javascript
// Test signature verification
const { verifyTwilioSignature } = require('../utils/webhookVerification');
const url = 'https://example.com/webhook';
const params = { CallSid: 'CA123', CallStatus: 'completed' };
const signature = req.headers['x-twilio-signature'];

const isValid = verifyTwilioSignature(url, params, signature, authToken);
console.log('Signature valid:', isValid); // Should be true
```

## Checklist for New Webhooks

When adding a new webhook endpoint, ensure:

- [ ] Signature verification middleware is applied
- [ ] Rate limiting is configured
- [ ] Security events are logged
- [ ] Replay attack prevention is implemented (if applicable)
- [ ] Timestamp validation is implemented (if applicable)
- [ ] IP whitelist is configured (if applicable)
- [ ] Error handling is proper (don't leak sensitive info)
- [ ] Webhook is idempotent (safe to process multiple times)

## Common Mistakes to Avoid

1. **Not verifying signatures** - Always verify webhook signatures
2. **Using wrong secret/key** - Ensure you're using the correct secret for verification
3. **Including signature in calculation** - Exclude signature field from HMAC calculation
4. **Not handling verification errors** - Always handle verification failures gracefully
5. **Leaking secrets in logs** - Never log webhook secrets or keys
6. **Not rate limiting** - Always apply rate limiting to webhook endpoints
7. **Trusting IP addresses alone** - IP whitelisting is not sufficient, always verify signatures

## References

- [Paytm Webhook Documentation](https://developer.paytm.com/docs/v1/payment-gateway/)
- [Twilio Webhook Security](https://www.twilio.com/docs/usage/webhooks/webhooks-security)
- [Stripe Webhook Security](https://stripe.com/docs/webhooks/signatures)

