const { webhookSignatureVerification } = require('../utils/webhookVerification');
const config = require('../utils/config');

const paytmWebhookVerification = webhookSignatureVerification('paytm', {
  merchantKey: config.get('paytm.merchantKey')
});

const twilioWebhookVerification = webhookSignatureVerification('twilio', {
  authToken: config.get('twilio.authToken')
});

const stripeWebhookVerification = webhookSignatureVerification('stripe', {
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  tolerance: 300 // 5 minutes
});

const genericWebhookVerification = (options) => {
  return webhookSignatureVerification('generic', options);
};

module.exports = {
  paytmWebhookVerification,
  twilioWebhookVerification,
  stripeWebhookVerification,
  genericWebhookVerification
};

