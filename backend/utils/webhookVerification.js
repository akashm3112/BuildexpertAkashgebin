/**
 * ============================================================================
 * WEBHOOK SIGNATURE VERIFICATION UTILITY
 * Purpose: Verify webhook signatures from external services to prevent spoofing
 * Supports: Paytm, Twilio, Stripe, and other HMAC-based webhook signatures
 * ============================================================================
 */

const crypto = require('crypto');
const logger = require('./logger');
const config = require('./config');

/**
 * Verify Paytm webhook checksum
 * @param {Object} payload - Paytm webhook payload
 * @param {string} receivedChecksum - Checksum received from Paytm
 * @param {string} merchantKey - Paytm merchant key
 * @returns {boolean} True if checksum is valid
 */
function verifyPaytmChecksum(payload, receivedChecksum, merchantKey) {
  try {
    // Create a copy of payload without CHECKSUMHASH for verification
    const payloadForChecksum = { ...payload };
    delete payloadForChecksum.CHECKSUMHASH;

    // Generate checksum using Paytm's algorithm
    const paramString = Object.keys(payloadForChecksum)
      .sort()
      .map(key => `${key}=${payloadForChecksum[key]}`)
      .join('&');

    const calculatedChecksum = crypto
      .createHmac('sha256', merchantKey)
      .update(paramString)
      .digest('hex');

    return calculatedChecksum === receivedChecksum;
  } catch (error) {
    logger.error('Paytm checksum verification error', {
      error: error.message
    });
    return false;
  }
}

/**
 * Verify Twilio webhook signature
 * @param {string} url - Full URL of the webhook endpoint
 * @param {Object} params - Webhook parameters (req.body)
 * @param {string} signature - X-Twilio-Signature header value
 * @param {string} authToken - Twilio auth token
 * @returns {boolean} True if signature is valid
 */
function verifyTwilioSignature(url, params, signature, authToken) {
  try {
    if (!signature || !authToken) {
      logger.warn('Twilio signature verification failed: missing signature or auth token');
      return false;
    }

    // Sort parameters alphabetically
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${key}${params[key]}`)
      .join('');

    // Create signature string: URL + sorted parameters
    const signatureString = url + sortedParams;

    // Calculate HMAC-SHA1
    const calculatedSignature = crypto
      .createHmac('sha1', authToken)
      .update(signatureString)
      .digest('base64');

    // Use constant-time comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(calculatedSignature)
    );
  } catch (error) {
    logger.error('Twilio signature verification error', {
      error: error.message
    });
    return false;
  }
}

/**
 * Verify Stripe webhook signature
 * @param {string|Buffer} payload - Raw webhook payload (string or buffer)
 * @param {string} signature - Stripe-Signature header value
 * @param {string} secret - Stripe webhook secret
 * @param {number} tolerance - Time tolerance in seconds (default: 300 = 5 minutes)
 * @returns {boolean} True if signature is valid
 */
function verifyStripeSignature(payload, signature, secret, tolerance = 300) {
  try {
    if (!signature || !secret) {
      logger.warn('Stripe signature verification failed: missing signature or secret');
      return false;
    }

    const elements = signature.split(',');
    const signatures = {};
    
    // Parse signature header
    elements.forEach(element => {
      const [key, value] = element.split('=');
      if (key === 't') {
        signatures.timestamp = parseInt(value, 10);
      } else if (key.startsWith('v')) {
        signatures[key] = value;
      }
    });

    if (!signatures.timestamp) {
      logger.warn('Stripe signature verification failed: missing timestamp');
      return false;
    }

    // Check timestamp (prevent replay attacks)
    const currentTime = Math.floor(Date.now() / 1000);
    if (Math.abs(currentTime - signatures.timestamp) > tolerance) {
      logger.warn('Stripe signature verification failed: timestamp too old or too far in future', {
        timestamp: signatures.timestamp,
        currentTime,
        difference: Math.abs(currentTime - signatures.timestamp)
      });
      return false;
    }

    // Calculate expected signature
    const signedPayload = `${signatures.timestamp}.${payload}`;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(signedPayload)
      .digest('hex');

    // Check all signature versions
    for (const [key, value] of Object.entries(signatures)) {
      if (key.startsWith('v')) {
        const expected = `v1=${expectedSignature}`;
        if (crypto.timingSafeEqual(
          Buffer.from(value),
          Buffer.from(expectedSignature)
        )) {
          return true;
        }
      }
    }

    return false;
  } catch (error) {
    logger.error('Stripe signature verification error', {
      error: error.message
    });
    return false;
  }
}

/**
 * Generic HMAC signature verification
 * @param {string|Buffer} payload - Webhook payload
 * @param {string} receivedSignature - Signature received in header
 * @param {string} secret - Shared secret key
 * @param {string} algorithm - Hash algorithm (default: 'sha256')
 * @param {string} encoding - Output encoding (default: 'hex')
 * @returns {boolean} True if signature is valid
 */
function verifyHMACSignature(payload, receivedSignature, secret, algorithm = 'sha256', encoding = 'hex') {
  try {
    if (!receivedSignature || !secret) {
      logger.warn('HMAC signature verification failed: missing signature or secret');
      return false;
    }

    const calculatedSignature = crypto
      .createHmac(algorithm, secret)
      .update(payload)
      .digest(encoding);

    // Use constant-time comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(receivedSignature, encoding),
      Buffer.from(calculatedSignature, encoding)
    );
  } catch (error) {
    logger.error('HMAC signature verification error', {
      error: error.message,
      algorithm
    });
    return false;
  }
}

/**
 * Middleware factory for webhook signature verification
 * @param {string} provider - Provider name ('paytm', 'twilio', 'stripe', or 'generic')
 * @param {Object} options - Verification options
 * @returns {Function} Express middleware function
 */
function webhookSignatureVerification(provider, options = {}) {
  return (req, res, next) => {
    try {
      let isValid = false;
      const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;

      switch (provider.toLowerCase()) {
        case 'paytm':
          const paytmChecksum = req.body?.CHECKSUMHASH;
          const merchantKey = options.merchantKey || config.get('paytm.merchantKey');
          
          if (!paytmChecksum) {
            logger.warn('Paytm webhook missing checksum', { ip: clientIP });
            return res.status(400).json({
              status: 'error',
              message: 'Missing checksum'
            });
          }

          isValid = verifyPaytmChecksum(req.body, paytmChecksum, merchantKey);
          break;

        case 'twilio':
          const twilioSignature = req.headers['x-twilio-signature'];
          const authToken = options.authToken || config.get('twilio.authToken');
          const fullUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

          if (!twilioSignature) {
            logger.warn('Twilio webhook missing signature', { ip: clientIP });
            return res.status(400).json({
              status: 'error',
              message: 'Missing signature'
            });
          }

          isValid = verifyTwilioSignature(fullUrl, req.body, twilioSignature, authToken);
          break;

        case 'stripe':
          const stripeSignature = req.headers['stripe-signature'];
          const webhookSecret = options.webhookSecret || process.env.STRIPE_WEBHOOK_SECRET;
          
          // Stripe sends raw body, need to get it as string
          const rawBody = typeof req.body === 'string' 
            ? req.body 
            : JSON.stringify(req.body);

          if (!stripeSignature) {
            logger.warn('Stripe webhook missing signature', { ip: clientIP });
            return res.status(400).json({
              status: 'error',
              message: 'Missing signature'
            });
          }

          isValid = verifyStripeSignature(rawBody, stripeSignature, webhookSecret, options.tolerance);
          break;

        case 'generic':
          const signatureHeader = options.signatureHeader || 'x-webhook-signature';
          const secret = options.secret;
          const algorithm = options.algorithm || 'sha256';
          const encoding = options.encoding || 'hex';

          if (!secret) {
            logger.error('Generic webhook verification: secret not provided');
            return res.status(500).json({
              status: 'error',
              message: 'Webhook verification misconfigured'
            });
          }

          const receivedSignature = req.headers[signatureHeader.toLowerCase()];
          const payload = typeof req.body === 'string' 
            ? req.body 
            : JSON.stringify(req.body);

          if (!receivedSignature) {
            logger.warn('Generic webhook missing signature', { 
              ip: clientIP,
              header: signatureHeader
            });
            return res.status(400).json({
              status: 'error',
              message: 'Missing signature'
            });
          }

          isValid = verifyHMACSignature(payload, receivedSignature, secret, algorithm, encoding);
          break;

        default:
          logger.error('Unknown webhook provider', { provider, ip: clientIP });
          return res.status(500).json({
            status: 'error',
            message: 'Unknown webhook provider'
          });
      }

      if (!isValid) {
        logger.warn('Webhook signature verification failed', {
          provider,
          ip: clientIP,
          url: req.originalUrl
        });
        return res.status(401).json({
          status: 'error',
          message: 'Invalid webhook signature'
        });
      }

      // Signature is valid, proceed
      next();
    } catch (error) {
      logger.error('Webhook signature verification error', {
        error: error.message,
        provider,
        stack: error.stack
      });
      return res.status(500).json({
        status: 'error',
        message: 'Webhook verification error'
      });
    }
  };
}

module.exports = {
  verifyPaytmChecksum,
  verifyTwilioSignature,
  verifyStripeSignature,
  verifyHMACSignature,
  webhookSignatureVerification
};

