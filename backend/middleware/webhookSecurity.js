/**
 * ============================================================================
 * WEBHOOK SECURITY MIDDLEWARE
 * Purpose: Provide security middleware for webhook endpoints
 * ============================================================================
 */

const { webhookSignatureVerification } = require('../utils/webhookVerification');
const config = require('../utils/config');

/**
 * Paytm webhook signature verification middleware
 * Use this middleware on Paytm webhook endpoints
 * 
 * Example:
 * router.post('/paytm-callback', 
 *   webhookLimiter,
 *   paytmWebhookVerification,
 *   asyncHandler(async (req, res) => { ... })
 * );
 */
const paytmWebhookVerification = webhookSignatureVerification('paytm', {
  merchantKey: config.get('paytm.merchantKey')
});

/**
 * Twilio webhook signature verification middleware
 * Use this middleware on Twilio webhook endpoints
 * 
 * Example:
 * router.post('/twilio/webhook/status',
 *   webhookLimiter,
 *   twilioWebhookVerification,
 *   asyncHandler(async (req, res) => { ... })
 * );
 */
const twilioWebhookVerification = webhookSignatureVerification('twilio', {
  authToken: config.get('twilio.authToken')
});

/**
 * Stripe webhook signature verification middleware
 * Use this middleware on Stripe webhook endpoints
 * 
 * Example:
 * router.post('/stripe/webhook',
 *   webhookLimiter,
 *   stripeWebhookVerification,
 *   asyncHandler(async (req, res) => { ... })
 * );
 */
const stripeWebhookVerification = webhookSignatureVerification('stripe', {
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  tolerance: 300 // 5 minutes
});

/**
 * Generic HMAC webhook signature verification middleware factory
 * Use this for custom webhook providers
 * 
 * Example:
 * const customWebhookVerification = genericWebhookVerification({
 *   secret: process.env.CUSTOM_WEBHOOK_SECRET,
 *   signatureHeader: 'x-custom-signature',
 *   algorithm: 'sha256',
 *   encoding: 'hex'
 * });
 * 
 * router.post('/custom/webhook',
 *   webhookLimiter,
 *   customWebhookVerification,
 *   asyncHandler(async (req, res) => { ... })
 * );
 */
const genericWebhookVerification = (options) => {
  return webhookSignatureVerification('generic', options);
};

module.exports = {
  paytmWebhookVerification,
  twilioWebhookVerification,
  stripeWebhookVerification,
  genericWebhookVerification
};

