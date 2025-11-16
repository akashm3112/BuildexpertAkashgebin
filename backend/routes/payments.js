const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { query, getRow, getRows, withTransaction } = require('../database/connection');
const { auth, requireRole } = require('../middleware/auth');
const { sendNotification } = require('../utils/notifications');
const PaymentLogger = require('../utils/paymentLogging');
const PaymentSecurity = require('../utils/paymentSecurity');
const logger = require('../utils/logger');
const rateLimit = require('express-rate-limit');
const { withPaymentRetry } = require('../utils/retryLogic');
const { registry } = require('../utils/circuitBreaker');
const { PaymentGatewayError } = require('../utils/errorTypes');

// Paytm Configuration
// TODO: Replace with actual Paytm credentials
const PAYTM_CONFIG = {
  MID: process.env.PAYTM_MID || 'YOUR_MERCHANT_ID',
  MERCHANT_KEY: process.env.PAYTM_MERCHANT_KEY || 'YOUR_MERCHANT_KEY',
  WEBSITE: process.env.PAYTM_WEBSITE || 'WEBSTAGING',
  CHANNEL_ID: process.env.PAYTM_CHANNEL_ID || 'WAP',
  INDUSTRY_TYPE_ID: process.env.PAYTM_INDUSTRY_TYPE || 'Retail',
  CALLBACK_URL: process.env.PAYTM_CALLBACK_URL || 'http://localhost:3000/api/payments/paytm-callback'
};

// Rate Limiting Configuration
const paymentInitiationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // Max 3 payment initiations per 15 minutes
  message: {
    status: 'error',
    message: 'Too many payment attempts. Please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.payment('Rate limit exceeded', {
      userId: req.user?.id,
      ip: req.ip
    });
    res.status(429).json({
      status: 'error',
      message: 'Too many payment attempts. Please try again in 15 minutes.'
    });
  }
});

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Max 10 webhook calls per minute
  message: 'Too many webhook requests',
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Generate checksum for Paytm
 */
function generateChecksum(params, merchantKey) {
  const paramString = Object.keys(params)
    .sort()
    .map(key => `${key}=${params[key]}`)
    .join('&');
  
  return crypto
    .createHmac('sha256', merchantKey)
    .update(paramString)
    .digest('hex');
}

/**
 * Verify Paytm payment with Paytm API
 */
const paytmBreaker = registry.getBreaker('paytm-api', {
  failureThreshold: 4,
  successThreshold: 2,
  timeout: 60000
});

async function verifyPaytmPayment(orderId, transactionId = null) {
  const startTime = Date.now();

  logger.payment('Starting Paytm verification', { orderId });

  const verificationParams = {
    MID: PAYTM_CONFIG.MID,
    ORDERID: orderId
  };

  verificationParams.CHECKSUMHASH = generateChecksum(verificationParams, PAYTM_CONFIG.MERCHANT_KEY);

  const verificationUrl = process.env.NODE_ENV === 'production'
    ? 'https://securegw.paytm.in/merchant-status/getTxnStatus'
    : 'https://securegw-stage.paytm.in/merchant-status/getTxnStatus';

  const performVerification = async () => {
    const response = await fetch(verificationUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(verificationParams)
    });

    if (!response.ok) {
      throw new PaymentGatewayError('Paytm', `HTTP ${response.status} ${response.statusText}`);
    }

    return response.json();
  };

  let paytmResponse;
  let responseTime;

  try {
    paytmResponse = await withPaymentRetry(
      () => paytmBreaker.execute(
        performVerification,
        async () => { throw new PaymentGatewayError('Paytm', 'Circuit breaker open'); }
      ),
      'Paytm verification'
    );
    responseTime = Date.now() - startTime;

    logger.payment('Paytm verification response', {
      orderId,
      status: paytmResponse.STATUS,
      responseCode: paytmResponse.RESPCODE,
      responseTime: `${responseTime}ms`
    });

    if (transactionId) {
      await PaymentLogger.logApiInteraction(
        transactionId,
        verificationUrl,
        'POST',
        verificationParams,
        paytmResponse,
        responseTime
      );
    }
  } catch (error) {
    responseTime = Date.now() - startTime;
    if (error instanceof PaymentGatewayError) {
      const retryAfterMs = Math.max(0, (paytmBreaker.nextAttempt || Date.now()) - Date.now());
      const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
      error.statusCode = 503;
      error.errorCode = 'PAYMENT_GATEWAY_UNAVAILABLE';
      error.retryable = true;
      error.retryAfter = retryAfterSeconds;
      error.message = 'Payment gateway unavailable';
      if (transactionId) {
        await PaymentLogger.logPaymentEvent(transactionId, 'paytm_verification_failed', {
          orderId,
          error: error.message,
          responseTime
        });
      }
      throw error;
    }

    logger.resilience('Paytm verification error', {
      orderId,
      error: error.message,
      responseTime: `${responseTime}ms`
    });

    if (transactionId) {
      await PaymentLogger.logPaymentEvent(transactionId, 'paytm_verification_failed', {
        orderId,
        error: error.message,
        responseTime
      });
    }

    return {
      success: false,
      error: error.message,
      paytmResponse: null,
      responseTime
    };
  }

  const isSuccess = paytmResponse.STATUS === 'TXN_SUCCESS';
  const paytmTransactionId = paytmResponse.TXNID;
  const amount = paytmResponse.TXNAMOUNT;
  const responseCode = paytmResponse.RESPCODE;
  const responseMessage = paytmResponse.RESPMSG;

  if (transactionId) {
    await PaymentLogger.logPaymentEvent(transactionId, 'paytm_verification_completed', {
      orderId,
      success: isSuccess,
      paytmTransactionId,
      amount,
      responseCode,
      responseMessage,
      responseTime
    });
  }

  return {
    success: isSuccess,
    transactionId: paytmTransactionId,
    amount,
    responseCode,
    responseMessage,
    paytmResponse,
    responseTime
  };
}

/**
 * @route   POST /api/payments/initiate-paytm
 * @desc    Initiate Paytm payment for service registration
 * @access  Private (Provider only)
 */
router.post('/initiate-paytm', paymentInitiationLimiter, auth, requireRole(['provider']), async (req, res) => {
  const startTime = Date.now();
  let transactionId = null;
  let lockKey = null;
  
  try {
    logger.payment('Payment initiation started', {
      userId: req.user.id,
      body: req.body,
      timestamp: new Date().toISOString()
    });

    const { 
      providerServiceId, 
      amount, 
      serviceCategory, 
      serviceName,
      pricingPlanId,
      currencyCode
    } = req.body;

    if (!providerServiceId || !amount) {
      logger.payment('Payment initiation failed - missing parameters', {
        userId: req.user.id,
        providerServiceId,
        amount
      });
      
      return res.status(400).json({
        status: 'error',
        message: 'Provider service ID and amount are required'
      });
    }

    // SECURITY CHECK 1: Check for duplicate payments (Idempotency)
    const duplicate = await PaymentSecurity.checkDuplicatePayment(providerServiceId, req.user.id);
    if (duplicate) {
      logger.payment('Duplicate payment attempt blocked', {
        userId: req.user.id,
        providerServiceId,
        existingOrderId: duplicate.order_id,
        existingStatus: duplicate.status
      });
      return res.status(409).json({
        status: 'error',
        message: 'A payment for this service is already in progress or completed',
        existingOrderId: duplicate.order_id,
        existingStatus: duplicate.status
      });
    }

    // SECURITY CHECK 2: Validate payment amount
    const amountValidation = await PaymentSecurity.validatePaymentAmount(
      providerServiceId,
      amount,
      {
        pricingPlanId,
        currency: currencyCode
      }
    );
    if (!amountValidation.valid) {
      logger.payment('Invalid payment amount', {
        userId: req.user.id,
        providerServiceId,
        expected: amountValidation.expected,
        received: amountValidation.received
      });
      return res.status(400).json({
        status: 'error',
        message: amountValidation.message,
        expectedAmount: amountValidation.expected,
        expectedCurrency: amountValidation.expectedCurrency
      });
    }

    const selectedPricingPlan = amountValidation.pricingPlan;
    const resolvedCurrency = (amountValidation.currency || 'INR').toUpperCase();
    const expectedAmountNumeric = Number.isFinite(amountValidation.expectedAmount)
      ? Number(amountValidation.expectedAmount)
      : Number(amount);
    const normalisedAmountValue = Number(expectedAmountNumeric.toFixed(2));
    const normalisedAmountString = normalisedAmountValue.toFixed(2);

    // SECURITY CHECK 3: Acquire payment lock (prevent concurrent payments)
    const lock = await PaymentSecurity.acquirePaymentLock(req.user.id, providerServiceId);
    if (!lock.acquired) {
      logger.payment('Payment lock acquisition failed', {
        userId: req.user.id,
        providerServiceId
      });
      return res.status(409).json({
        status: 'error',
        message: lock.message
      });
    }
    lockKey = lock.lockKey;

    // Extract client information
    const clientInfo = PaymentLogger.extractClientInfo(req);
    const paymentFlowId = PaymentLogger.generatePaymentFlowId();

    // Verify provider owns this service
    const providerService = await getRow(`
      SELECT ps.*, pp.user_id
      FROM provider_services ps
      JOIN provider_profiles pp ON ps.provider_id = pp.id
      WHERE ps.id = $1 AND pp.user_id = $2
    `, [providerServiceId, req.user.id]);

    if (!providerService) {
      logger.payment('Payment initiation failed - service not found', {
        userId: req.user.id,
        providerServiceId
      });
      
      if (lockKey) await PaymentSecurity.releasePaymentLock(lockKey);
      
      return res.status(404).json({
        status: 'error',
        message: 'Provider service not found or you do not have permission'
      });
    }

    // SECURITY CHECK 4: Calculate risk score
    const riskAssessment = await PaymentSecurity.calculatePaymentRiskScore(
      req.user.id,
      amount,
      clientInfo
    );

    if (riskAssessment.level === 'high') {
      logger.payment('High-risk payment flagged', {
        userId: req.user.id,
        riskScore: riskAssessment.score,
        factors: riskAssessment.factors,
        amount
      });
    }

    // Generate unique order ID
    const orderId = `ORDER_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    // Create payment record with enhanced data
    const result = await query(`
      INSERT INTO payment_transactions 
      (order_id, user_id, provider_service_id, amount, currency_code, status, payment_method, service_name,
       pricing_plan_id, payment_flow_id, user_agent, ip_address, device_info, created_at)
      VALUES ($1, $2, $3, $4, $5, 'pending', 'paytm', $6, $7, $8, $9, $10, $11, NOW())
      RETURNING id
    `, [
      orderId, 
      req.user.id, 
      providerServiceId, 
      normalisedAmountValue, 
      resolvedCurrency,
      serviceName || amountValidation.service.service_name,
      selectedPricingPlan ? selectedPricingPlan.id : amountValidation.service.default_pricing_plan_id,
      paymentFlowId,
      clientInfo.userAgent,
      clientInfo.ipAddress,
      JSON.stringify(clientInfo.deviceInfo)
    ]);

    transactionId = result.rows[0].id;

    // Log security event if high risk
    if (riskAssessment.level === 'high') {
      await PaymentLogger.logSecurityEvent(
        transactionId,
        'high_risk_payment',
        riskAssessment.score,
        riskAssessment.factors,
        'flagged_for_review',
        { message: 'Payment flagged for manual review due to high risk score' }
      );
    }

    // Log payment initiation event
    await PaymentLogger.logPaymentEvent(transactionId, 'payment_initiated', {
      orderId,
      amount: normalisedAmountValue,
      currency: resolvedCurrency,
      pricingPlanId: selectedPricingPlan?.id || amountValidation.service.default_pricing_plan_id,
      pricingPlanName: selectedPricingPlan?.plan_name || 'standard',
      pricingPlanAmount: normalisedAmountValue,
      serviceName,
      serviceCategory,
      paymentFlowId,
      clientInfo
    }, req.user.id, req);

    // Prepare Paytm parameters
    const paytmParams = {
      MID: PAYTM_CONFIG.MID,
      WEBSITE: PAYTM_CONFIG.WEBSITE,
      CHANNEL_ID: PAYTM_CONFIG.CHANNEL_ID,
      INDUSTRY_TYPE_ID: PAYTM_CONFIG.INDUSTRY_TYPE_ID,
      ORDER_ID: orderId,
      CUST_ID: req.user.id,
      TXN_AMOUNT: normalisedAmountString,
      CALLBACK_URL: PAYTM_CONFIG.CALLBACK_URL,
      EMAIL: req.user.email || '',
      MOBILE_NO: req.user.phone || ''
    };

    // Generate checksum
    const checksum = generateChecksum(paytmParams, PAYTM_CONFIG.MERCHANT_KEY);
    paytmParams.CHECKSUMHASH = checksum;

    // In production, return Paytm URL
    const paytmUrl = process.env.NODE_ENV === 'production'
      ? 'https://securegw.paytm.in/order/process'
      : 'https://securegw-stage.paytm.in/order/process';

    const responseTime = Date.now() - startTime;

    // Log successful initiation
    await PaymentLogger.logPaymentEvent(transactionId, 'payment_initiation_completed', {
      orderId,
      paytmUrl,
      responseTime
    }, req.user.id, req);

    // Log performance metrics
    await PaymentLogger.logPerformanceMetrics(transactionId, {
      initiationTime: responseTime,
      timestamp: new Date().toISOString()
    });

    logger.payment('Payment initiated successfully', {
      orderId,
      transactionId,
      amount: normalisedAmountValue,
      currency: resolvedCurrency,
      userId: req.user.id,
      responseTime: `${responseTime}ms`
    });

    // Release payment lock
    if (lockKey) {
      await PaymentSecurity.releasePaymentLock(lockKey);
    }

    res.json({
      status: 'success',
      orderId: orderId,
      paytmUrl: paytmUrl,
      paytmParams: paytmParams,
      message: 'Payment initiated successfully'
    });

  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    logger.error('Payment initiation error', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
      responseTime: `${responseTime}ms`
    });

    // Release payment lock on error
    if (lockKey) {
      await PaymentSecurity.releasePaymentLock(lockKey);
    }

    // Log initiation failure
    if (transactionId) {
      await PaymentLogger.logPaymentEvent(transactionId, 'payment_initiation_failed', {
        error: error.message,
        responseTime
      }, req.user?.id, req);
    }

    res.status(500).json({
      status: 'error',
      message: 'Failed to initiate payment'
    });
  }
});

/**
 * @route   POST /api/payments/verify-paytm
 * @desc    Verify Paytm payment and activate service
 * @access  Private (Provider only)
 */
router.post('/verify-paytm', auth, requireRole(['provider']), async (req, res, next) => {
  try {
    const { orderId, providerServiceId } = req.body;

    if (!orderId || !providerServiceId) {
      return res.status(400).json({
        status: 'error',
        message: 'Order ID and provider service ID are required'
      });
    }

    // Get payment transaction
    const transaction = await getRow(`
      SELECT * FROM payment_transactions
      WHERE order_id = $1 AND user_id = $2
    `, [orderId, req.user.id]);

    if (!transaction) {
      return res.status(404).json({
        status: 'error',
        message: 'Transaction not found'
      });
    }

    // Check if transaction is already processed
    if (transaction.status === 'completed') {
      return res.status(400).json({
        status: 'error',
        message: 'Payment already processed'
      });
    }

    if (transaction.status === 'failed') {
      return res.status(400).json({
        status: 'error',
        message: 'Payment has already failed'
      });
    }

    // Verify payment with Paytm API
    const paymentVerification = await verifyPaytmPayment(orderId, transaction.id);

    if (paymentVerification.success) {
      const { startDate, endDate, existingService } = await withTransaction(async (client) => {
        const existingServiceResult = await client.query(
          `
            SELECT payment_start_date, payment_end_date, payment_status
              FROM provider_services
             WHERE id = $1
             FOR UPDATE
          `,
          [providerServiceId]
        );

        const existing = existingServiceResult.rows[0];
        let startDate;
        let endDate;

        if (existing && existing.payment_status === 'active' && existing.payment_end_date) {
          const currentEndDate = new Date(existing.payment_end_date);
          startDate = currentEndDate;
          endDate = new Date(currentEndDate);
          endDate.setDate(endDate.getDate() + 30);
        } else {
          startDate = new Date();
          endDate = new Date();
          endDate.setDate(endDate.getDate() + 30);
        }

        await client.query(
          `
            UPDATE provider_services
               SET payment_status = 'active',
                   payment_start_date = $1,
                   payment_end_date = $2
             WHERE id = $3
          `,
          [startDate, endDate, providerServiceId]
        );

        await client.query(
          `
            UPDATE payment_transactions
               SET status = 'completed',
                   payment_gateway_response = $1,
                   completed_at = NOW(),
                   transaction_id = $2,
                   updated_at = NOW()
             WHERE order_id = $3
          `,
          [
            JSON.stringify(paymentVerification.paytmResponse),
            paymentVerification.transactionId,
            orderId
          ]
        );

        return { startDate, endDate, existingService: existing };
      }, { name: 'provider_service_activation' });

      logger.payment('Payment completed successfully with transaction', {
        orderId,
        transactionId: paymentVerification.transactionId,
        userId: req.user.id
      });

      // Log payment success event
      await PaymentLogger.logPaymentEvent(transaction.id, 'payment_completed', {
        orderId,
        paytmTransactionId: paymentVerification.transactionId,
        amount: paymentVerification.amount,
        responseCode: paymentVerification.responseCode,
        responseMessage: paymentVerification.responseMessage,
        serviceActivated: true,
        startDate,
        endDate,
        responseTime: paymentVerification.responseTime
      }, req.user.id, req);

      // Log service activation
      await PaymentLogger.logPaymentEvent(transaction.id, 'service_activated', {
        providerServiceId,
        startDate,
        endDate,
        validityDays: 30,
        isRenewal: existingService && existingService.payment_status === 'active'
      }, req.user.id, req);

      // Send success notification
      await sendNotification(
        req.user.id,
        'Payment Successful',
        `Your service registration is now active until ${endDate.toLocaleDateString()}. You will receive a reminder before expiry.`,
        'provider'
      );

      logger.payment('Payment successful and service activated', {
        orderId,
        transactionId: transaction.id,
        paytmTransactionId: paymentVerification.transactionId,
        amount: paymentVerification.amount,
        userId: req.user.id
      });

      res.json({
        status: 'success',
        message: 'Payment verified and service activated',
        data: {
          startDate,
          endDate,
          validity: 30,
          transactionId: paymentVerification.transactionId,
          amount: paymentVerification.amount
        }
      });

    } else {
      // Payment failed
      try {
        // Update payment transaction with failure details
        await query(`
          UPDATE payment_transactions
          SET status = 'failed',
              payment_gateway_response = $1,
              completed_at = NOW(),
              error_details = $2,
              updated_at = NOW()
          WHERE order_id = $3
        `, [
          JSON.stringify({
            verified: false,
            error: paymentVerification.error,
            paytmResponse: paymentVerification.paytmResponse
          }),
          JSON.stringify({
            error: paymentVerification.error,
            responseCode: paymentVerification.responseCode,
            responseMessage: paymentVerification.responseMessage,
            responseTime: paymentVerification.responseTime
          }),
          orderId
        ]);

        // Log payment failure event
        await PaymentLogger.logPaymentEvent(transaction.id, 'payment_failed', {
          orderId,
          error: paymentVerification.error,
          responseCode: paymentVerification.responseCode,
          responseMessage: paymentVerification.responseMessage,
          paytmResponse: paymentVerification.paytmResponse,
          responseTime: paymentVerification.responseTime
        }, req.user.id, req);

        // Send failure notification
        await sendNotification(
          req.user.id,
          'Payment Failed ❌',
          `Your payment could not be processed. Please try again or contact support if the issue persists.`,
          'provider'
        );

        logger.payment('Payment failed', {
          orderId,
          transactionId: transaction.id,
          error: paymentVerification.error,
          responseCode: paymentVerification.responseCode,
          userId: req.user.id
        });

        res.status(400).json({
          status: 'error',
          message: paymentVerification.error || 'Payment gateway unavailable. Please try again in a few minutes.',
          details: paymentVerification.responseMessage || 'Payment gateway is currently unavailable.',
          retryAfter: 120
        });

      } catch (dbError) {
        logger.error('Database error during payment failure', {
          error: dbError.message
        });
        res.status(500).json({
          status: 'error',
          message: 'Payment failed and error recording failed. Please contact support.'
        });
      }
    }

  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/payments/paytm-callback
 * @desc    Paytm callback handler
 * @access  Public (called by Paytm)
 */
router.post('/paytm-callback', webhookLimiter, async (req, res) => {
  const startTime = Date.now();
  
  try {
    const paytmResponse = req.body;
    const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
    
    logger.payment('Paytm callback received', {
      orderId: paytmResponse.ORDERID,
      status: paytmResponse.STATUS,
      ip: clientIP
    });

    // SECURITY CHECK 1: Verify IP is from Paytm
    if (!PaymentSecurity.verifyPaytmIP(clientIP)) {
      logger.payment('Unauthorized webhook attempt - invalid IP', {
        ip: clientIP,
        orderId: paytmResponse.ORDERID
      });
      return res.status(403).send('Unauthorized');
    }

    // Extract order details
    const orderId = paytmResponse.ORDERID;
    const status = paytmResponse.STATUS;
    const transactionId = paytmResponse.TXNID;
    const amount = paytmResponse.TXNAMOUNT;
    const responseCode = paytmResponse.RESPCODE;
    const responseMessage = paytmResponse.RESPMSG;
    const timestamp = paytmResponse.TXNDATE;

    if (!orderId) {
      logger.error('No order ID in Paytm callback', { ip: clientIP });
      return res.status(400).send('Invalid callback data');
    }

    // SECURITY CHECK 2: Check for replay attacks
    const replayCheck = await PaymentSecurity.checkWebhookReplay(
      orderId,
      transactionId,
      timestamp
    );
    
    if (replayCheck.isReplay) {
      logger.payment('Webhook replay attack detected', {
        orderId,
        transactionId,
        reason: replayCheck.message,
        ip: clientIP
      });
      return res.status(400).send('Replay detected');
    }

    // SECURITY CHECK 3: Verify checksum from Paytm
    const receivedChecksum = paytmResponse.CHECKSUMHASH;
    const calculatedChecksum = generateChecksum(paytmResponse, PAYTM_CONFIG.MERCHANT_KEY);

    if (receivedChecksum !== calculatedChecksum) {
      logger.error('Checksum verification failed', {
        orderId,
        ip: clientIP
      });
      return res.status(400).send('Checksum verification failed');
    }

    // Get the payment transaction
    const transaction = await getRow(`
      SELECT * FROM payment_transactions
      WHERE order_id = $1
    `, [orderId]);

    if (!transaction) {
      logger.error('Transaction not found for order', { orderId });
      return res.status(404).send('Transaction not found');
    }

    // Update transaction based on Paytm response
    if (status === 'TXN_SUCCESS') {
      // Payment successful
      await query(`
        UPDATE payment_transactions
        SET status = 'completed',
            payment_gateway_response = $1,
            completed_at = NOW(),
            transaction_id = $2
        WHERE order_id = $3
      `, [
        JSON.stringify(paytmResponse),
        transactionId,
        orderId
      ]);

      // Activate the service
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 30);

      await query(`
        UPDATE provider_services
        SET payment_status = 'active',
            payment_start_date = $1,
            payment_end_date = $2,
            updated_at = NOW()
        WHERE id = $3
      `, [startDate, endDate, transaction.provider_service_id]);

      // Send success notification
      await sendNotification(
        transaction.user_id,
        'Payment Successful! 🎉',
        `Your service registration is now active for 30 days. You will receive a reminder 2 days before expiry.`,
        'provider'
      );

      logger.payment('Payment successful via callback', { orderId });

    } else {
      // Payment failed
      await query(`
        UPDATE payment_transactions
        SET status = 'failed',
            payment_gateway_response = $1,
            completed_at = NOW()
        WHERE order_id = $2
      `, [JSON.stringify(paytmResponse), orderId]);

      // Send failure notification
      await sendNotification(
        transaction.user_id,
        'Payment Failed ❌',
        `Your payment could not be processed. Please try again or contact support if the issue persists.`,
        'provider'
      );

      logger.payment('Payment failed via callback', {
        orderId,
        responseMessage
      });
    }

    // Return success response to Paytm
    res.send('<html><body><h1>Payment processed successfully</h1></body></html>');

  } catch (error) {
    logger.error('Paytm callback error', { error: error.message });
    res.status(500).send('Error processing payment');
  }
});

/**
 * @route   GET /api/payments/transaction-history
 * @desc    Get payment transaction history for provider
 * @access  Private (Provider only)
 */
router.get('/transaction-history', auth, requireRole(['provider']), async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const offset = (pageNum - 1) * limitNum;

    // Validate pagination
    if (isNaN(pageNum) || pageNum < 1) {
      return res.status(400).json({
        status: 'error',
        message: 'page must be a positive integer'
      });
    }
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      return res.status(400).json({
        status: 'error',
        message: 'limit must be a positive integer between 1 and 100'
      });
    }

    // Get total count
    const countResult = await getRow(`
      SELECT COUNT(*) as total
      FROM payment_transactions
      WHERE user_id = $1
    `, [req.user.id]);
    const total = parseInt(countResult?.total || 0, 10);
    const totalPages = Math.ceil(total / limitNum);

    // Get paginated transactions
    const transactions = await getRows(`
      SELECT 
        pt.*,
        ps.payment_end_date as service_expiry,
        ps.payment_status as service_status,
        sm.name as service_name
      FROM payment_transactions pt
      LEFT JOIN provider_services ps ON pt.provider_service_id = ps.id
      LEFT JOIN services_master sm ON ps.service_id = sm.id
      WHERE pt.user_id = $1
      ORDER BY pt.created_at DESC
      LIMIT $2 OFFSET $3
    `, [req.user.id, limitNum, offset]);

    res.json({
      status: 'success',
      data: { 
        transactions,
        pagination: {
          currentPage: pageNum,
          totalPages,
          total,
          limit: limitNum,
          hasMore: pageNum < totalPages
        }
      }
    });

  } catch (error) {
    logger.error('Get transaction history error', { error: error.message });
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch transaction history'
    });
  }
});

/**
 * @route   POST /api/payments/retry-payment
 * @desc    Retry failed payment
 * @access  Private (Provider only)
 */
router.post('/retry-payment', auth, requireRole(['provider']), async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({
        status: 'error',
        message: 'Order ID is required'
      });
    }

    // Get the failed transaction
    const transaction = await getRow(`
      SELECT * FROM payment_transactions
      WHERE order_id = $1 AND user_id = $2 AND status = 'failed'
    `, [orderId, req.user.id]);

    if (!transaction) {
      return res.status(404).json({
        status: 'error',
        message: 'Failed transaction not found'
      });
    }

    // Generate new order ID for retry
    const newOrderId = `ORDER_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // Create new payment record for retry
    await query(`
      INSERT INTO payment_transactions 
      (order_id, user_id, provider_service_id, amount, status, payment_method, service_name)
      VALUES ($1, $2, $3, $4, 'pending', 'paytm', $5)
    `, [newOrderId, req.user.id, transaction.provider_service_id, transaction.amount, transaction.service_name]);

    // Prepare Paytm parameters for retry
    const paytmParams = {
      MID: PAYTM_CONFIG.MID,
      WEBSITE: PAYTM_CONFIG.WEBSITE,
      CHANNEL_ID: PAYTM_CONFIG.CHANNEL_ID,
      INDUSTRY_TYPE_ID: PAYTM_CONFIG.INDUSTRY_TYPE_ID,
      ORDER_ID: newOrderId,
      CUST_ID: req.user.id,
      TXN_AMOUNT: transaction.amount.toString(),
      CALLBACK_URL: PAYTM_CONFIG.CALLBACK_URL,
      EMAIL: req.user.email || '',
      MOBILE_NO: req.user.phone || ''
    };

    // Generate checksum
    const checksum = generateChecksum(paytmParams, PAYTM_CONFIG.MERCHANT_KEY);
    paytmParams.CHECKSUMHASH = checksum;

    // Paytm URL
    const paytmUrl = process.env.NODE_ENV === 'production'
      ? 'https://securegw.paytm.in/order/process'
      : 'https://securegw-stage.paytm.in/order/process';

    res.json({
      status: 'success',
      orderId: newOrderId,
      paytmUrl: paytmUrl,
      paytmParams: paytmParams,
      message: 'Payment retry initiated successfully'
    });

  } catch (error) {
    logger.error('Retry payment error', { error: error.message });
    res.status(500).json({
      status: 'error',
      message: 'Failed to retry payment'
    });
  }
});

/**
 * @route   GET /api/payments/payment-status/:orderId
 * @desc    Get payment status for an order
 * @access  Private (Provider only)
 */
router.get('/payment-status/:orderId', auth, requireRole(['provider']), async (req, res) => {
  try {
    const { orderId } = req.params;

    const transaction = await getRow(`
      SELECT 
        pt.*,
        ps.payment_status as service_status,
        ps.payment_end_date as service_expiry,
        sm.name as service_name
      FROM payment_transactions pt
      LEFT JOIN provider_services ps ON pt.provider_service_id = ps.id
      LEFT JOIN services_master sm ON ps.service_id = sm.id
      WHERE pt.order_id = $1 AND pt.user_id = $2
    `, [orderId, req.user.id]);

    if (!transaction) {
      return res.status(404).json({
        status: 'error',
        message: 'Transaction not found'
      });
    }

    res.json({
      status: 'success',
      data: { transaction }
    });

  } catch (error) {
    logger.error('Get payment status error', { error: error.message });
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch payment status'
    });
  }
});

/**
 * @route   POST /api/payments/event
 * @desc    Log payment event
 * @access  Private
 */
router.post('/event', auth, async (req, res) => {
  try {
    const { transactionId, eventType, eventData } = req.body;

    if (!transactionId || !eventType) {
      return res.status(400).json({
        status: 'error',
        message: 'Transaction ID and event type are required'
      });
    }

    // Verify user owns this transaction
    const transaction = await getRow(`
      SELECT id FROM payment_transactions
      WHERE id = $1 AND user_id = $2
    `, [transactionId, req.user.id]);

    if (!transaction) {
      return res.status(404).json({
        status: 'error',
        message: 'Transaction not found or access denied'
      });
    }

    await PaymentLogger.logPaymentEvent(transactionId, eventType, eventData, req.user.id, req);

    res.json({
      status: 'success',
      message: 'Payment event logged successfully'
    });

  } catch (error) {
    logger.error('Error logging payment event', { error: error.message });
    res.status(500).json({
      status: 'error',
      message: 'Failed to log payment event'
    });
  }
});

/**
 * @route   GET /api/payments/analytics
 * @desc    Get payment analytics for provider
 * @access  Private (Provider only)
 */
router.get('/analytics', auth, requireRole(['provider']), async (req, res) => {
  try {
    const { period = '30' } = req.query;
    
    // Payment success rate
    const successRate = await getRow(`
      SELECT 
        COUNT(*) as total_payments,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful_payments,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_payments,
        ROUND(
          COUNT(CASE WHEN status = 'completed' THEN 1 END) * 100.0 / COUNT(*), 
          2
        ) as success_rate
      FROM payment_transactions 
      WHERE user_id = $1 
        AND created_at >= NOW() - INTERVAL '${parseInt(period)} days'
    `, [req.user.id]);

    // Average response times
    const avgResponseTime = await getRow(`
      SELECT 
        AVG((performance_metrics->>'initiationTime')::numeric) as avg_initiation_time,
        AVG((performance_metrics->>'verificationTime')::numeric) as avg_verification_time
      FROM payment_transactions 
      WHERE user_id = $1 
        AND performance_metrics IS NOT NULL
        AND created_at >= NOW() - INTERVAL '${parseInt(period)} days'
    `, [req.user.id]);

    // Error analysis
    const errorAnalysis = await getRows(`
      SELECT 
        (error_details->>'error') as error_type,
        COUNT(*) as count,
        MAX(created_at) as last_occurrence
      FROM payment_transactions 
      WHERE user_id = $1 
        AND error_details IS NOT NULL
        AND created_at >= NOW() - INTERVAL '${parseInt(period)} days'
      GROUP BY (error_details->>'error')
      ORDER BY count DESC
    `, [req.user.id]);

    // Recent transactions
    const recentTransactions = await getRows(`
      SELECT 
        pt.*,
        json_agg(
          json_build_object(
            'event_type', pe.event_type,
            'timestamp', pe.timestamp
          ) ORDER BY pe.timestamp
        ) FILTER (WHERE pe.id IS NOT NULL) as events
      FROM payment_transactions pt
      LEFT JOIN payment_events pe ON pt.id = pe.payment_transaction_id
      WHERE pt.user_id = $1
      GROUP BY pt.id
      ORDER BY pt.created_at DESC
      LIMIT 10
    `, [req.user.id]);

    res.json({
      status: 'success',
      data: {
        successRate: successRate,
        avgResponseTime: avgResponseTime,
        errorAnalysis: errorAnalysis,
        recentTransactions: recentTransactions,
        period: `${period} days`
      }
    });

  } catch (error) {
    logger.error('Error getting payment analytics', { error: error.message });
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch payment analytics'
    });
  }
});

/**
 * @route   GET /api/payments/events/:transactionId
 * @desc    Get payment events for a transaction
 * @access  Private
 */
router.get('/events/:transactionId', auth, async (req, res) => {
  try {
    const { transactionId } = req.params;

    // Verify user owns this transaction
    const transaction = await getRow(`
      SELECT id FROM payment_transactions
      WHERE id = $1 AND user_id = $2
    `, [transactionId, req.user.id]);

    if (!transaction) {
      return res.status(404).json({
        status: 'error',
        message: 'Transaction not found or access denied'
      });
    }

    const events = await getRows(`
      SELECT * FROM payment_events
      WHERE payment_transaction_id = $1
      ORDER BY timestamp ASC
    `, [transactionId]);

    res.json({
      status: 'success',
      data: { events }
    });

  } catch (error) {
    logger.error('Error getting payment events', { error: error.message });
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch payment events'
    });
  }
});

/**
 * @route   POST /api/payments/initiate-labour-payment
 * @desc    Initiate Paytm payment for labour service access (User)
 * @access  Private (User only)
 */
router.post('/initiate-labour-payment', paymentInitiationLimiter, auth, requireRole(['user']), async (req, res) => {
  const startTime = Date.now();
  let transactionId = null;
  let lockKey = null;
  
  try {
    logger.payment('Labour payment initiation started', {
      userId: req.user.id,
      body: req.body,
      timestamp: new Date().toISOString()
    });

    const { amount, serviceCategory, serviceName } = req.body;

    if (!amount || amount !== 99) {
      logger.payment('Labour payment initiation failed - invalid amount', {
        userId: req.user.id,
        amount
      });
      
      return res.status(400).json({
        status: 'error',
        message: 'Invalid amount. Labour service access costs ₹99 for 7 days.'
      });
    }

    // SECURITY CHECK 1: Check for duplicate payments (Idempotency)
    const duplicate = await PaymentSecurity.checkDuplicateLabourPayment(req.user.id);
    if (duplicate) {
      logger.payment('Duplicate labour payment attempt blocked', {
        userId: req.user.id,
        existingOrderId: duplicate.order_id,
        existingStatus: duplicate.status
      });
      return res.status(409).json({
        status: 'error',
        message: 'A labour service payment is already in progress or completed',
        existingOrderId: duplicate.order_id,
        existingStatus: duplicate.status
      });
    }

    // SECURITY CHECK 2: Acquire payment lock (prevent concurrent payments)
    const lock = await PaymentSecurity.acquirePaymentLock(req.user.id, 'labour-service');
    if (!lock.acquired) {
      logger.payment('Labour payment lock acquisition failed', {
        userId: req.user.id
      });
      return res.status(409).json({
        status: 'error',
        message: lock.message
      });
    }
    lockKey = lock.lockKey;

    // Extract client information
    const clientInfo = PaymentLogger.extractClientInfo(req);
    const paymentFlowId = PaymentLogger.generatePaymentFlowId();

    // Generate unique order ID
    const orderId = `LABOUR_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    // Create payment record with enhanced data
    const result = await query(`
      INSERT INTO labour_payment_transactions 
      (order_id, user_id, amount, status, payment_method, service_name,
       payment_flow_id, user_agent, ip_address, device_info, created_at)
      VALUES ($1, $2, $3, 'pending', 'paytm', $4, $5, $6, $7, $8, NOW())
      RETURNING id
    `, [
      orderId, 
      req.user.id, 
      amount, 
      serviceName,
      paymentFlowId,
      clientInfo.userAgent,
      clientInfo.ipAddress,
      JSON.stringify(clientInfo.deviceInfo)
    ]);

    transactionId = result.rows[0].id;

    // Log payment initiation event
    await PaymentLogger.logPaymentEvent(transactionId, 'labour_payment_initiated', {
      orderId,
      amount,
      serviceName,
      serviceCategory,
      paymentFlowId,
      clientInfo
    }, req.user.id, req);

    // Prepare Paytm parameters
    const paytmParams = {
      MID: PAYTM_CONFIG.MID,
      WEBSITE: PAYTM_CONFIG.WEBSITE,
      CHANNEL_ID: PAYTM_CONFIG.CHANNEL_ID,
      INDUSTRY_TYPE_ID: PAYTM_CONFIG.INDUSTRY_TYPE_ID,
      ORDER_ID: orderId,
      CUST_ID: req.user.id,
      TXN_AMOUNT: amount.toString(),
      CALLBACK_URL: PAYTM_CONFIG.CALLBACK_URL,
      EMAIL: req.user.email || '',
      MOBILE_NO: req.user.phone || ''
    };

    // Generate checksum
    const checksum = generateChecksum(paytmParams, PAYTM_CONFIG.MERCHANT_KEY);
    paytmParams.CHECKSUMHASH = checksum;

    // In production, return Paytm URL
    const paytmUrl = process.env.NODE_ENV === 'production'
      ? 'https://securegw.paytm.in/order/process'
      : 'https://securegw-stage.paytm.in/order/process';

    const responseTime = Date.now() - startTime;

    // Log successful initiation
    await PaymentLogger.logPaymentEvent(transactionId, 'labour_payment_initiation_completed', {
      orderId,
      paytmUrl,
      responseTime
    }, req.user.id, req);

    logger.payment('Labour payment initiated successfully', {
      orderId,
      transactionId,
      amount,
      userId: req.user.id,
      responseTime: `${responseTime}ms`
    });

    // Release payment lock
    if (lockKey) {
      await PaymentSecurity.releasePaymentLock(lockKey);
    }

    res.json({
      status: 'success',
      orderId: orderId,
      paytmUrl: paytmUrl,
      paytmParams: paytmParams,
      message: 'Labour payment initiated successfully'
    });

  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    logger.error('Labour payment initiation error', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
      responseTime: `${responseTime}ms`
    });

    // Release payment lock on error
    if (lockKey) {
      await PaymentSecurity.releasePaymentLock(lockKey);
    }

    // Log initiation failure
    if (transactionId) {
      await PaymentLogger.logPaymentEvent(transactionId, 'labour_payment_initiation_failed', {
        error: error.message,
        responseTime
      }, req.user?.id, req);
    }

    res.status(500).json({
      status: 'error',
      message: 'Failed to initiate labour payment'
    });
  }
});

/**
 * @route   POST /api/payments/verify-labour-payment
 * @desc    Verify Paytm payment and activate labour service access
 * @access  Private (User only)
 */
router.post('/verify-labour-payment', auth, requireRole(['user']), async (req, res, next) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({
        status: 'error',
        message: 'Order ID is required'
      });
    }

    // Get payment transaction
    const transaction = await getRow(`
      SELECT * FROM labour_payment_transactions
      WHERE order_id = $1 AND user_id = $2
    `, [orderId, req.user.id]);

    if (!transaction) {
      return res.status(404).json({
        status: 'error',
        message: 'Transaction not found'
      });
    }

    // Check if transaction is already processed
    if (transaction.status === 'completed') {
      return res.status(400).json({
        status: 'error',
        message: 'Payment already processed'
      });
    }

    if (transaction.status === 'failed') {
      return res.status(400).json({
        status: 'error',
        message: 'Payment has already failed'
      });
    }

    // Verify payment with Paytm API
    const paymentVerification = await verifyPaytmPayment(orderId, transaction.id);

    if (paymentVerification.success) {
      const { startDate, endDate, existingAccess } = await withTransaction(async (client) => {
        const existingAccessResult = await client.query(
          `
            SELECT labour_access_start_date, labour_access_end_date, labour_access_status
              FROM users
             WHERE id = $1
             FOR UPDATE
          `,
          [req.user.id]
        );

        const existing = existingAccessResult.rows[0];
        let startDate;
        let endDate;

        if (existing && existing.labour_access_status === 'active' && existing.labour_access_end_date) {
          const currentEndDate = new Date(existing.labour_access_end_date);
          startDate = currentEndDate;
          endDate = new Date(currentEndDate);
          endDate.setDate(endDate.getDate() + 7);
        } else {
          startDate = new Date();
          endDate = new Date();
          endDate.setDate(endDate.getDate() + 7);
        }

        await client.query(
          `
            UPDATE users
               SET labour_access_status = 'active',
                   labour_access_start_date = $1,
                   labour_access_end_date = $2,
                   updated_at = NOW()
             WHERE id = $3
          `,
          [startDate, endDate, req.user.id]
        );

        await client.query(
          `
            UPDATE labour_payment_transactions
               SET status = 'completed',
                   payment_gateway_response = $1,
                   completed_at = NOW(),
                   transaction_id = $2,
                   updated_at = NOW()
             WHERE order_id = $3
          `,
          [
            JSON.stringify(paymentVerification.paytmResponse),
            paymentVerification.transactionId,
            orderId
          ]
        );

        return { startDate, endDate, existingAccess: existing };
      }, { name: 'labour_access_activation' });

      logger.payment('Labour payment completed successfully with transaction', {
        orderId,
        transactionId: paymentVerification.transactionId,
        userId: req.user.id
      });

      // Log payment success event
      await PaymentLogger.logPaymentEvent(transaction.id, 'labour_payment_completed', {
        orderId,
        paytmTransactionId: paymentVerification.transactionId,
        amount: paymentVerification.amount,
        responseCode: paymentVerification.responseCode,
        responseMessage: paymentVerification.responseMessage,
        serviceActivated: true,
        startDate,
        endDate,
        responseTime: paymentVerification.responseTime
      }, req.user.id, req);

      // Log service activation
      await PaymentLogger.logPaymentEvent(transaction.id, 'labour_service_activated', {
        userId: req.user.id,
        startDate,
        endDate,
        validityDays: 7,
        isRenewal: existingAccess && existingAccess.labour_access_status === 'active'
      }, req.user.id, req);

      // Send success notification
      await sendNotification(
        req.user.id,
        'Labour Service Access Activated! 🎉',
        `Your labour service access is now active until ${endDate.toLocaleDateString()}. You will receive a reminder before expiry.`,
        'user'
      );

      logger.payment('Labour payment successful and service activated', {
        orderId,
        transactionId: transaction.id,
        paytmTransactionId: paymentVerification.transactionId,
        amount: paymentVerification.amount,
        userId: req.user.id
      });

      res.json({
        status: 'success',
        message: 'Payment verified and labour service access activated',
        data: {
          startDate,
          endDate,
          validity: 7,
          transactionId: paymentVerification.transactionId,
          amount: paymentVerification.amount
        }
      });

    } else {
      // Payment failed
      try {
        // Update payment transaction with failure details
        await query(`
          UPDATE labour_payment_transactions
          SET status = 'failed',
              payment_gateway_response = $1,
              completed_at = NOW(),
              error_details = $2,
              updated_at = NOW()
          WHERE order_id = $3
        `, [
          JSON.stringify({
            verified: false,
            error: paymentVerification.error,
            paytmResponse: paymentVerification.paytmResponse
          }),
          JSON.stringify({
            error: paymentVerification.error,
            responseCode: paymentVerification.responseCode,
            responseMessage: paymentVerification.responseMessage,
            responseTime: paymentVerification.responseTime
          }),
          orderId
        ]);

        // Log payment failure event
        await PaymentLogger.logPaymentEvent(transaction.id, 'labour_payment_failed', {
          orderId,
          error: paymentVerification.error,
          responseCode: paymentVerification.responseCode,
          responseMessage: paymentVerification.responseMessage,
          paytmResponse: paymentVerification.paytmResponse,
          responseTime: paymentVerification.responseTime
        }, req.user.id, req);

        // Send failure notification
        await sendNotification(
          req.user.id,
          'Labour Payment Failed ❌',
          `Your labour service payment could not be processed. Please try again or contact support if the issue persists.`,
          'user'
        );

        logger.payment('Labour payment failed', {
          orderId,
          transactionId: transaction.id,
          error: paymentVerification.error,
          responseCode: paymentVerification.responseCode,
          userId: req.user.id
        });

        res.status(400).json({
          status: 'error',
          message: paymentVerification.error || 'Payment gateway unavailable. Please try again in a few minutes.',
          details: paymentVerification.responseMessage || 'Payment gateway is currently unavailable.',
          retryAfter: 120
        });

      } catch (dbError) {
        logger.error('Database error during labour payment failure', {
          error: dbError.message
        });
        res.status(500).json({
          status: 'error',
          message: 'Payment failed and error recording failed. Please contact support.'
        });
      }
    }

  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/payments/labour-access-status
 * @desc    Get labour service access status for user
 * @access  Private (User only)
 */
router.get('/labour-access-status', auth, requireRole(['user']), async (req, res) => {
  try {
    const user = await getRow(`
      SELECT 
        labour_access_status,
        labour_access_start_date,
        labour_access_end_date,
        created_at
      FROM users
      WHERE id = $1
    `, [req.user.id]);

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Check if access is expired
    let isExpired = false;
    let daysRemaining = 0;
    
    if (user.labour_access_status === 'active' && user.labour_access_end_date) {
      const endDate = new Date(user.labour_access_end_date);
      const now = new Date();
      
      if (endDate <= now) {
        isExpired = true;
        // Update status to expired
        await query(`
          UPDATE users 
          SET labour_access_status = 'expired', updated_at = NOW()
          WHERE id = $1
        `, [req.user.id]);
      } else {
        const diffTime = endDate.getTime() - now.getTime();
        daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      }
    }

    res.json({
      status: 'success',
      data: {
        accessStatus: user.labour_access_status,
        startDate: user.labour_access_start_date,
        endDate: user.labour_access_end_date,
        isExpired: isExpired,
        daysRemaining: daysRemaining,
        hasAccess: user.labour_access_status === 'active' && !isExpired
      }
    });

  } catch (error) {
    logger.error('Get labour access status error', { error: error.message });
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch labour access status'
    });
  }
});

/**
 * @route   GET /api/payments/labour-transaction-history
 * @desc    Get labour payment transaction history for user
 * @access  Private (User only)
 */
router.get('/labour-transaction-history', auth, requireRole(['user']), async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const offset = (pageNum - 1) * limitNum;

    // Validate pagination
    if (isNaN(pageNum) || pageNum < 1) {
      return res.status(400).json({
        status: 'error',
        message: 'page must be a positive integer'
      });
    }
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      return res.status(400).json({
        status: 'error',
        message: 'limit must be a positive integer between 1 and 100'
      });
    }

    // Get total count
    const countResult = await getRow(`
      SELECT COUNT(*) as total
      FROM labour_payment_transactions
      WHERE user_id = $1
    `, [req.user.id]);
    const total = parseInt(countResult?.total || 0, 10);
    const totalPages = Math.ceil(total / limitNum);

    // Get paginated transactions
    const transactions = await getRows(`
      SELECT 
        lpt.*,
        u.labour_access_end_date as access_expiry,
        u.labour_access_status as access_status
      FROM labour_payment_transactions lpt
      LEFT JOIN users u ON lpt.user_id = u.id
      WHERE lpt.user_id = $1
      ORDER BY lpt.created_at DESC
      LIMIT $2 OFFSET $3
    `, [req.user.id, limitNum, offset]);

    res.json({
      status: 'success',
      data: { 
        transactions,
        pagination: {
          currentPage: pageNum,
          totalPages,
          total,
          limit: limitNum,
          hasMore: pageNum < totalPages
        }
      }
    });

  } catch (error) {
    logger.error('Get labour transaction history error', { error: error.message });
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch labour transaction history'
    });
  }
});

/**
 * @route   POST /api/payments/check-labour-access
 * @desc    Manually trigger labour access checks (Admin only)
 * @access  Private (Admin only)
 */
router.post('/check-labour-access', auth, requireRole(['admin']), async (req, res) => {
  try {
    const LabourAccessManager = require('../services/labourAccessManager');
    
    const results = await LabourAccessManager.runAllChecks();
    
    logger.info('Manual labour access check completed', {
      adminId: req.user.id,
      results
    });

    res.json({
      status: 'success',
      message: 'Labour access checks completed',
      data: results
    });

  } catch (error) {
    logger.error('Manual labour access check error', { error: error.message });
    res.status(500).json({
      status: 'error',
      message: 'Failed to run labour access checks'
    });
  }
});

/**
 * @route   GET /api/payments/labour-access-stats
 * @desc    Get labour access statistics (Admin only)
 * @access  Private (Admin only)
 */
router.get('/labour-access-stats', auth, requireRole(['admin']), async (req, res) => {
  try {
    const LabourAccessManager = require('../services/labourAccessManager');
    
    const stats = await LabourAccessManager.getAccessStatistics();
    const expiringUsers = await LabourAccessManager.getExpiringUsers(2);
    
    res.json({
      status: 'success',
      data: {
        statistics: stats,
        expiringUsers: expiringUsers
      }
    });

  } catch (error) {
    logger.error('Get labour access stats error', { error: error.message });
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch labour access statistics'
    });
  }
});

module.exports = router;

