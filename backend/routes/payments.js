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
const { PaymentGatewayError, PaymentVerificationError, NotFoundError, ValidationError, RateLimitError } = require('../utils/errorTypes');
const { asyncHandler } = require('../middleware/errorHandler');
const { validateOrThrow, throwIfMissing } = require('../utils/errorHelpers');

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
    // Rate limiter middleware must respond directly, but use standardized error format
    const { RateLimitError } = require('../utils/errorTypes');
    const { formatErrorResponse } = require('../middleware/errorHandler');
    const error = new RateLimitError('Too many payment attempts. Please try again in 15 minutes.', 900000);
    const response = formatErrorResponse(error, req);
    res.status(429).json(response);
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
 * Note: CHECKSUMHASH field should be excluded from checksum calculation
 */
function generateChecksum(params, merchantKey) {
  // Create a copy and exclude CHECKSUMHASH from calculation
  const paramsForChecksum = { ...params };
  delete paramsForChecksum.CHECKSUMHASH;
  
  const paramString = Object.keys(paramsForChecksum)
    .sort()
    .map(key => `${key}=${paramsForChecksum[key]}`)
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

  // Check if this is a labour payment and we're in development/test mode
  // For testing, bypass actual Paytm verification for labour payments
  const isLabourPayment = transactionId ? await (async () => {
    try {
      const { getRow } = require('../database/connection');
      const result = await getRow(`
        SELECT id FROM labour_payment_transactions WHERE id = $1
      `, [transactionId]);
      return !!result;
    } catch {
      return false;
    }
  })() : false;

  // In development, bypass Paytm verification for labour payments (testing mode)
  if (isLabourPayment && process.env.NODE_ENV !== 'production') {
    logger.payment('Bypassing Paytm verification for labour payment (test mode)', { orderId });
    
    // Simulate successful payment for testing
    const responseTime = Date.now() - startTime;
    
    if (transactionId) {
      await PaymentLogger.logPaymentEvent(transactionId, 'paytm_verification_bypassed_test_mode', {
        orderId,
        testMode: true,
        responseTime
      });
    }

    return {
      success: true,
      transactionId: `TEST_TXN_${Date.now()}`,
      amount: '99.00',
      responseCode: '01',
      responseMessage: 'Txn Success',
      paytmResponse: {
        STATUS: 'TXN_SUCCESS',
        TXNID: `TEST_TXN_${Date.now()}`,
        TXNAMOUNT: '99.00',
        RESPCODE: '01',
        RESPMSG: 'Txn Success'
      },
      responseTime
    };
  }

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
router.post('/initiate-paytm', paymentInitiationLimiter, auth, requireRole(['provider']), asyncHandler(async (req, res) => {
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

    throwIfMissing({ providerServiceId, amount }, 'Provider service ID and amount are required');

    // SECURITY CHECK 1: Check for duplicate payments (Idempotency)
    const duplicate = await PaymentSecurity.checkDuplicatePayment(providerServiceId, req.user.id);
    if (duplicate) {
      logger.payment('Duplicate payment attempt blocked', {
        userId: req.user.id,
        providerServiceId,
        existingOrderId: duplicate.order_id,
        existingStatus: duplicate.status
      });
      throw new ValidationError('A payment for this service is already in progress or completed', {
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
      throw new ValidationError(amountValidation.message, {
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
      throw new ValidationError(lock.message);
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
      
      throw new NotFoundError('Provider service not found or you do not have permission');
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
  } finally {
    // Release payment lock on error or success
    if (lockKey) {
      await PaymentSecurity.releasePaymentLock(lockKey);
    }
  }
}));

/**
 * @route   POST /api/payments/verify-paytm
 * @desc    Verify Paytm payment and activate service
 * @access  Private (Provider only)
 */
router.post('/verify-paytm', auth, requireRole(['provider']), asyncHandler(async (req, res) => {
  const { orderId, providerServiceId } = req.body;

  throwIfMissing({ orderId, providerServiceId }, 'Order ID and provider service ID are required');

  // Get transaction first to check status (before expensive API call)
  const transaction = await getRow(`
    SELECT * FROM payment_transactions
    WHERE order_id = $1 AND user_id = $2
  `, [orderId, req.user.id]);

  if (!transaction) {
    throw new NotFoundError('Transaction not found');
  }

  // Check if transaction is already processed (before making API call)
  if (transaction.status === 'completed') {
    throw new ValidationError('Payment already processed');
  }

  if (transaction.status === 'failed') {
    throw new ValidationError('Payment has already failed');
  }

  // Verify payment with Paytm API OUTSIDE transaction to avoid long-held locks
  // This is safe because we'll re-check status after acquiring the lock
  const paymentVerification = await verifyPaytmPayment(orderId, transaction.id);

  // Use transaction with row-level locking to prevent race conditions
  const result = await withTransaction(async (client) => {
    // Lock the transaction row to prevent concurrent updates
    const transactionResult = await client.query(`
      SELECT * FROM payment_transactions
      WHERE order_id = $1 AND user_id = $2
      FOR UPDATE
    `, [orderId, req.user.id]);

    const lockedTransaction = transactionResult.rows[0];

    if (!lockedTransaction) {
      throw new NotFoundError('Transaction not found');
    }

    // Re-check status after acquiring lock (critical for race condition prevention)
    if (lockedTransaction.status === 'completed') {
      throw new ValidationError('Payment already processed by another request');
    }

    if (lockedTransaction.status === 'failed' && paymentVerification.success) {
      // Allow retry if verification says success but we marked as failed
      logger.payment('Verification indicates success for previously failed transaction', { orderId });
    } else if (lockedTransaction.status === 'failed') {
      throw new ValidationError('Payment has already failed');
    }

    if (paymentVerification.success) {
      // Lock provider service row
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

      // Update provider service
      await client.query(
        `
          UPDATE provider_services
             SET payment_status = 'active',
                 payment_start_date = $1,
                 payment_end_date = $2,
                 updated_at = NOW()
           WHERE id = $3
        `,
        [startDate, endDate, providerServiceId]
      );

      // Update payment transaction with optimistic locking (only if still pending)
      const updateResult = await client.query(
        `
          UPDATE payment_transactions
             SET status = 'completed',
                 payment_gateway_response = $1,
                 completed_at = NOW(),
                 transaction_id = $2,
                 updated_at = NOW()
           WHERE order_id = $3
             AND status = 'pending'
          RETURNING id
        `,
        [
          JSON.stringify(paymentVerification.paytmResponse),
          paymentVerification.transactionId,
          orderId
        ]
      );

      // Check if update actually happened (prevent overwriting if already processed)
      if (updateResult.rowCount === 0) {
        throw new ValidationError('Transaction was already processed by another request');
      }

      return { 
        startDate, 
        endDate, 
        existingService: existing,
        transaction: lockedTransaction,
        paymentVerification: paymentVerification
      };
    } else {
      // Payment failed - update transaction with optimistic locking
      const updateResult = await client.query(
        `
          UPDATE payment_transactions
             SET status = 'failed',
                 payment_gateway_response = $1,
                 completed_at = NOW(),
                 error_details = $2,
                 updated_at = NOW()
           WHERE order_id = $3
             AND status = 'pending'
          RETURNING id
        `,
        [
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
        ]
      );

      if (updateResult.rowCount === 0) {
        throw new ValidationError('Transaction was already processed by another request');
      }

      return { 
        transaction: lockedTransaction,
        paymentVerification: paymentVerification
      };
    }
  }, { name: 'verify_paytm_payment', retries: 2 });

  // Extract result after transaction commits
  const finalPaymentVerification = result.paymentVerification;
  
  if (finalPaymentVerification.success) {
    const { startDate, endDate, existingService, transaction } = result;

    logger.payment('Payment completed successfully with transaction', {
      orderId,
      transactionId: finalPaymentVerification.transactionId,
      userId: req.user.id
    });

    // Log payment success event (with error handling - don't fail if logging fails)
    try {
      await PaymentLogger.logPaymentEvent(result.transaction.id, 'payment_completed', {
      orderId,
      paytmTransactionId: finalPaymentVerification.transactionId,
      amount: finalPaymentVerification.amount,
      responseCode: finalPaymentVerification.responseCode,
      responseMessage: finalPaymentVerification.responseMessage,
      serviceActivated: true,
      startDate,
      endDate,
      responseTime: finalPaymentVerification.responseTime
    }, req.user.id, req);
    } catch (logError) {
      logger.error('Failed to log payment completion event', {
        error: logError.message,
        transactionId: result.transaction.id,
        orderId
      });
    }

    // Log service activation (with error handling)
    try {
      await PaymentLogger.logPaymentEvent(result.transaction.id, 'service_activated', {
      providerServiceId,
      startDate,
      endDate,
      validityDays: 30,
      isRenewal: existingService && existingService.payment_status === 'active'
    }, req.user.id, req);
    } catch (logError) {
      logger.error('Failed to log service activation event', {
        error: logError.message,
        transactionId: result.transaction.id,
        orderId
      });
    }

    // Send success notification (with error handling - don't fail if notification fails)
    try {
      await sendNotification(
      req.user.id,
      'Payment Successful',
      `Your service registration is now active until ${endDate.toLocaleDateString()}. You will receive a reminder before expiry.`,
      'provider'
      );
    } catch (notifError) {
      logger.error('Failed to send payment success notification', {
        error: notifError.message,
        userId: req.user.id,
        orderId
      });
    }

    logger.payment('Payment successful and service activated', {
      orderId,
      transactionId: result.transaction.id,
      paytmTransactionId: finalPaymentVerification.transactionId,
      amount: finalPaymentVerification.amount,
      userId: req.user.id
    });

    res.json({
      status: 'success',
      message: 'Payment verified and service activated',
      data: {
        startDate,
        endDate,
        validity: 30,
        transactionId: finalPaymentVerification.transactionId,
        amount: finalPaymentVerification.amount
      }
    });

  } else {
    // Payment failed - transaction already updated in the withTransaction block
    const { transaction } = result;

    // Log payment failure event (with error handling)
    try {
      await PaymentLogger.logPaymentEvent(transaction.id, 'payment_failed', {
      orderId,
      error: finalPaymentVerification.error,
      responseCode: finalPaymentVerification.responseCode,
      responseMessage: finalPaymentVerification.responseMessage,
      paytmResponse: finalPaymentVerification.paytmResponse,
      responseTime: finalPaymentVerification.responseTime
    }, req.user.id, req);
    } catch (logError) {
      logger.error('Failed to log payment failure event', {
        error: logError.message,
        transactionId: transaction.id,
        orderId
      });
    }

    // Send failure notification (with error handling)
    try {
      await sendNotification(
      req.user.id,
      'Payment Failed ❌',
      `Your payment could not be processed. Please try again or contact support if the issue persists.`,
      'provider'
      );
    } catch (notifError) {
      logger.error('Failed to send payment failure notification', {
        error: notifError.message,
        userId: req.user.id,
        orderId
      });
    }

    logger.payment('Payment failed', {
      orderId,
      transactionId: transaction.id,
      error: finalPaymentVerification.error,
      responseCode: finalPaymentVerification.responseCode,
      userId: req.user.id
    });

    // Throw error to be handled by error middleware
    const paymentError = new PaymentVerificationError(
      finalPaymentVerification.error || 'Payment gateway unavailable. Please try again in a few minutes.'
    );
    paymentError.details = finalPaymentVerification.responseMessage || 'Payment gateway is currently unavailable.';
    paymentError.retryAfter = 120;
    throw paymentError;
  }
}));

/**
 * @route   POST /api/payments/paytm-callback
 * @desc    Paytm callback handler
 * @access  Public (called by Paytm)
 */
router.post('/paytm-callback', webhookLimiter, asyncHandler(async (req, res) => {
  const startTime = Date.now();
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
    throw new ValidationError('Unauthorized');
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
    throw new ValidationError('Invalid callback data');
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
    throw new ValidationError('Replay detected');
  }

  // SECURITY CHECK 3: Verify checksum from Paytm
  const { verifyPaytmChecksum } = require('../utils/webhookVerification');
  const receivedChecksum = paytmResponse.CHECKSUMHASH;

  if (!verifyPaytmChecksum(paytmResponse, receivedChecksum, PAYTM_CONFIG.MERCHANT_KEY)) {
    logger.error('Checksum verification failed', {
      orderId,
      ip: clientIP
    });
    throw new ValidationError('Checksum verification failed');
  }

  // Use transaction with row-level locking to prevent race conditions
  const result = await withTransaction(async (client) => {
    // Lock the transaction row to prevent concurrent updates
    const transactionResult = await client.query(`
      SELECT * FROM payment_transactions
      WHERE order_id = $1
      FOR UPDATE
    `, [orderId]);

    const transaction = transactionResult.rows[0];

    if (!transaction) {
      logger.error('Transaction not found for order', { orderId });
      throw new NotFoundError('Transaction not found');
    }

    // Re-check status after acquiring lock (critical for race condition prevention)
    if (transaction.status === 'completed') {
      logger.payment('Callback received for already completed transaction', { orderId });
      return { transaction, alreadyProcessed: true };
    }

    if (transaction.status === 'failed' && status === 'TXN_SUCCESS') {
      // Allow retry if callback says success but we marked as failed
      logger.payment('Callback indicates success for previously failed transaction', { orderId });
    } else if (transaction.status === 'failed') {
      logger.payment('Callback received for already failed transaction', { orderId });
      return { transaction, alreadyProcessed: true };
    }

    // Update transaction based on Paytm response with optimistic locking
    if (status === 'TXN_SUCCESS') {
      // Payment successful - update only if still pending
      const updateResult = await client.query(`
        UPDATE payment_transactions
        SET status = 'completed',
            payment_gateway_response = $1,
            completed_at = NOW(),
            transaction_id = $2,
            updated_at = NOW()
        WHERE order_id = $3
          AND status IN ('pending', 'failed')
        RETURNING id, provider_service_id, user_id
      `, [
        JSON.stringify(paytmResponse),
        transactionId,
        orderId
      ]);

      if (updateResult.rowCount === 0) {
        // Transaction was already processed by another request
        logger.payment('Transaction already processed by another request', { orderId });
        return { transaction, alreadyProcessed: true };
      }

      const updatedTransaction = updateResult.rows[0];

      // Lock and activate the service
      if (updatedTransaction.provider_service_id) {
        const serviceResult = await client.query(`
          SELECT payment_start_date, payment_end_date, payment_status
          FROM provider_services
          WHERE id = $1
          FOR UPDATE
        `, [updatedTransaction.provider_service_id]);

        const existing = serviceResult.rows[0];
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

        await client.query(`
          UPDATE provider_services
          SET payment_status = 'active',
              payment_start_date = $1,
              payment_end_date = $2,
              updated_at = NOW()
          WHERE id = $3
        `, [startDate, endDate, updatedTransaction.provider_service_id]);
      }

      return { 
        transaction: updatedTransaction, 
        status: 'success',
        startDate: startDate || new Date(),
        endDate: endDate || (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d; })()
      };

    } else {
      // Payment failed - update only if still pending
      const updateResult = await client.query(`
        UPDATE payment_transactions
        SET status = 'failed',
            payment_gateway_response = $1,
            completed_at = NOW(),
            updated_at = NOW()
        WHERE order_id = $2
          AND status = 'pending'
        RETURNING id, user_id
      `, [JSON.stringify(paytmResponse), orderId]);

      if (updateResult.rowCount === 0) {
        // Transaction was already processed by another request
        logger.payment('Transaction already processed by another request', { orderId });
        return { transaction, alreadyProcessed: true };
      }

      return { 
        transaction: updateResult.rows[0], 
        status: 'failed' 
      };
    }
  }, { name: 'paytm_callback_processing', retries: 2 });

  // Send notifications after transaction commits (with error handling)
  if (result.alreadyProcessed) {
    // Transaction was already processed, just return success to Paytm
    logger.payment('Callback processed for already handled transaction', { orderId });
  } else if (result.status === 'success') {
    // Send success notification (with error handling - don't fail if notification fails)
    try {
      await sendNotification(
        result.transaction.user_id,
        'Payment Successful! 🎉',
        `Your service registration is now active for 30 days. You will receive a reminder 2 days before expiry.`,
        'provider'
      );
    } catch (notifError) {
      logger.error('Failed to send payment success notification in callback', {
        error: notifError.message,
        userId: result.transaction.user_id,
        orderId
      });
    }

    logger.payment('Payment successful via callback', { orderId });
  } else if (result.status === 'failed') {
    // Send failure notification (with error handling)
    try {
      await sendNotification(
        result.transaction.user_id,
        'Payment Failed ❌',
        `Your payment could not be processed. Please try again or contact support if the issue persists.`,
        'provider'
      );
    } catch (notifError) {
      logger.error('Failed to send payment failure notification in callback', {
        error: notifError.message,
        userId: result.transaction.user_id,
        orderId
      });
    }

    logger.payment('Payment failed via callback', {
      orderId,
      responseMessage
    });
  }

  // Return success response to Paytm
  res.send('<html><body><h1>Payment processed successfully</h1></body></html>');
}));

/**
 * @route   GET /api/payments/transaction-history
 * @desc    Get payment transaction history for provider
 * @access  Private (Provider only)
 */
router.get('/transaction-history', auth, requireRole(['provider']), asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;

  // Validate pagination
  if (isNaN(pageNum) || pageNum < 1) {
    throw new ValidationError('page must be a positive integer');
  }
  if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
    throw new ValidationError('limit must be a positive integer between 1 and 100');
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
}));

/**
 * @route   POST /api/payments/retry-payment
 * @desc    Retry failed payment
 * @access  Private (Provider only)
 */
router.post('/retry-payment', auth, requireRole(['provider']), asyncHandler(async (req, res) => {
  const { orderId } = req.body;

  throwIfMissing({ orderId }, 'Order ID is required');

    // Get the failed transaction
    const transaction = await getRow(`
      SELECT * FROM payment_transactions
      WHERE order_id = $1 AND user_id = $2 AND status = 'failed'
    `, [orderId, req.user.id]);

  if (!transaction) {
    throw new NotFoundError('Failed transaction not found');
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
}));

/**
 * @route   GET /api/payments/payment-status/:orderId
 * @desc    Get payment status for an order
 * @access  Private (Provider only)
 */
router.get('/payment-status/:orderId', auth, requireRole(['provider']), asyncHandler(async (req, res) => {
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
    throw new NotFoundError('Transaction not found');
  }

  res.json({
    status: 'success',
    data: { transaction }
  });
}));

/**
 * @route   POST /api/payments/event
 * @desc    Log payment event
 * @access  Private
 */
router.post('/event', auth, asyncHandler(async (req, res) => {
  const { transactionId, eventType, eventData } = req.body;

  throwIfMissing({ transactionId, eventType }, 'Transaction ID and event type are required');

  // Verify user owns this transaction
  const transaction = await getRow(`
    SELECT id FROM payment_transactions
    WHERE id = $1 AND user_id = $2
  `, [transactionId, req.user.id]);

  if (!transaction) {
    throw new NotFoundError('Transaction not found or access denied');
  }

  await PaymentLogger.logPaymentEvent(transactionId, eventType, eventData, req.user.id, req);

  res.json({
    status: 'success',
    message: 'Payment event logged successfully'
  });
}));

/**
 * @route   GET /api/payments/analytics
 * @desc    Get payment analytics for provider
 * @access  Private (Provider only)
 */
router.get('/analytics', auth, requireRole(['provider']), asyncHandler(async (req, res) => {
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
}));

/**
 * @route   GET /api/payments/events/:transactionId
 * @desc    Get payment events for a transaction
 * @access  Private
 */
router.get('/events/:transactionId', auth, asyncHandler(async (req, res) => {
  const { transactionId } = req.params;

  // Verify user owns this transaction
  const transaction = await getRow(`
      SELECT id FROM payment_transactions
      WHERE id = $1 AND user_id = $2
    `, [transactionId, req.user.id]);

  if (!transaction) {
    throw new NotFoundError('Transaction not found or access denied');
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
}));

/**
 * @route   POST /api/payments/initiate-labour-payment
 * @desc    Initiate Paytm payment for labour service access (User)
 * @access  Private (User only)
 */
router.post('/initiate-labour-payment', paymentInitiationLimiter, auth, requireRole(['user']), asyncHandler(async (req, res) => {
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
      
      throw new ValidationError('Invalid amount. Labour service access costs ₹99 for 7 days.');
    }

    // SECURITY CHECK 1: Check for duplicate payments (Idempotency)
    const duplicate = await PaymentSecurity.checkDuplicateLabourPayment(req.user.id);
    if (duplicate) {
      logger.payment('Duplicate labour payment attempt blocked', {
        userId: req.user.id,
        existingOrderId: duplicate.order_id,
        existingStatus: duplicate.status
      });
      throw new ValidationError('A labour service payment is already in progress or completed', {
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
      throw new ValidationError(lock.message);
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
  } finally {
    // Release payment lock on error or success
    if (lockKey) {
      await PaymentSecurity.releasePaymentLock(lockKey);
    }
  }
}));

/**
 * @route   POST /api/payments/verify-labour-payment
 * @desc    Verify Paytm payment and activate labour service access
 * @access  Private (User only)
 */
router.post('/verify-labour-payment', auth, requireRole(['user']), asyncHandler(async (req, res) => {
  const { orderId } = req.body;

  throwIfMissing({ orderId }, 'Order ID is required');

    // Get payment transaction
    const transaction = await getRow(`
      SELECT * FROM labour_payment_transactions
      WHERE order_id = $1 AND user_id = $2
    `, [orderId, req.user.id]);

  if (!transaction) {
    throw new NotFoundError('Transaction not found');
  }

  // Check if transaction is already processed (before making API call)
  if (transaction.status === 'completed') {
    throw new ValidationError('Payment already processed');
  }

  if (transaction.status === 'failed') {
    throw new ValidationError('Payment has already failed');
  }

  // Verify payment with Paytm API OUTSIDE transaction to avoid long-held locks
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
                   labour_access_end_date = $2
             WHERE id = $3
          `,
          [startDate, endDate, req.user.id]
        );

        // Update payment transaction with optimistic locking (only if still pending)
        const updateResult = await client.query(
          `
            UPDATE labour_payment_transactions
               SET status = 'completed',
                   payment_gateway_response = $1,
                   completed_at = NOW(),
                   transaction_id = $2,
                   updated_at = NOW()
             WHERE order_id = $3
               AND status = 'pending'
            RETURNING id
          `,
          [
            JSON.stringify(paymentVerification.paytmResponse),
            paymentVerification.transactionId,
            orderId
          ]
        );

        // Check if update actually happened (prevent overwriting if already processed)
        if (updateResult.rowCount === 0) {
          throw new ValidationError('Transaction was already processed by another request');
        }

      return { startDate, endDate, existingAccess: existing };
    }, { name: 'labour_access_activation' });

    logger.payment('Labour payment completed successfully with transaction', {
      orderId,
      transactionId: paymentVerification.transactionId,
      userId: req.user.id
    });

    // Log payment success event (with error handling)
    try {
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
    } catch (logError) {
      logger.error('Failed to log labour payment completion event', {
        error: logError.message,
        transactionId: transaction.id,
        orderId
      });
    }

    // Log service activation (with error handling)
    try {
      await PaymentLogger.logPaymentEvent(transaction.id, 'labour_service_activated', {
      userId: req.user.id,
      startDate,
      endDate,
      validityDays: 7,
      isRenewal: existingAccess && existingAccess.labour_access_status === 'active'
    }, req.user.id, req);
    } catch (logError) {
      logger.error('Failed to log labour service activation event', {
        error: logError.message,
        transactionId: transaction.id,
        orderId
      });
    }

    // Send success notification (with error handling)
    try {
      await sendNotification(
        req.user.id,
        'Labour Service Access Activated! 🎉',
        `Your labour service access is now active until ${endDate.toLocaleDateString()}. You will receive a reminder before expiry.`,
        'user'
      );
    } catch (notifError) {
      logger.error('Failed to send labour payment success notification', {
        error: notifError.message,
        userId: req.user.id,
        orderId
      });
    }

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
    // Payment failed - use transaction to ensure atomicity
    await withTransaction(async (client) => {
      // Lock the transaction row
      const transactionResult = await client.query(`
        SELECT * FROM labour_payment_transactions
        WHERE order_id = $1 AND user_id = $2
        FOR UPDATE
      `, [orderId, req.user.id]);

      const lockedTransaction = transactionResult.rows[0];

      if (!lockedTransaction) {
        throw new NotFoundError('Transaction not found');
      }

      // Re-check status after acquiring lock
      if (lockedTransaction.status === 'completed') {
        throw new ValidationError('Payment already processed by another request');
      }

      // Update payment transaction with failure details (only if still pending)
      const updateResult = await client.query(`
        UPDATE labour_payment_transactions
        SET status = 'failed',
            payment_gateway_response = $1,
            completed_at = NOW(),
            error_details = $2,
            updated_at = NOW()
        WHERE order_id = $3
          AND status = 'pending'
        RETURNING id
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

      if (updateResult.rowCount === 0) {
        throw new ValidationError('Transaction was already processed by another request');
      }

      return { transaction: lockedTransaction };
    }, { name: 'labour_payment_failure', retries: 2 });

    // Log payment failure event (with error handling)
    try {
      await PaymentLogger.logPaymentEvent(transaction.id, 'labour_payment_failed', {
        orderId,
        error: paymentVerification.error,
        responseCode: paymentVerification.responseCode,
        responseMessage: paymentVerification.responseMessage,
        paytmResponse: paymentVerification.paytmResponse,
      responseTime: paymentVerification.responseTime
    }, req.user.id, req);
    } catch (logError) {
      logger.error('Failed to log labour payment failure event', {
        error: logError.message,
        transactionId: transaction.id,
        orderId
      });
    }

    // Send failure notification (with error handling)
    try {
      await sendNotification(
        req.user.id,
        'Labour Payment Failed ❌',
        `Your labour service payment could not be processed. Please try again or contact support if the issue persists.`,
        'user'
      );
    } catch (notifError) {
      logger.error('Failed to send labour payment failure notification', {
        error: notifError.message,
        userId: req.user.id,
        orderId
      });
    }

    logger.payment('Labour payment failed', {
        orderId,
        transactionId: transaction.id,
        error: paymentVerification.error,
        responseCode: paymentVerification.responseCode,
        userId: req.user.id
      });

      // Throw error to be handled by error middleware
      const paymentError = new PaymentVerificationError(
        paymentVerification.error || 'Payment gateway unavailable. Please try again in a few minutes.'
      );
      paymentError.details = paymentVerification.responseMessage || 'Payment gateway is currently unavailable.';
      paymentError.retryAfter = 120;
      throw paymentError;
  }
}));

/**
 * @route   GET /api/payments/labour-access-status
 * @desc    Get labour service access status for user
 * @access  Private (User only)
 */
router.get('/labour-access-status', auth, requireRole(['user']), asyncHandler(async (req, res) => {
  // Optimized query: Calculate expiry and days remaining in SQL to avoid multiple queries
  // This is much faster than doing date calculations in JavaScript and separate UPDATE queries
  const user = await getRow(`
      SELECT 
        labour_access_status,
        labour_access_start_date,
        labour_access_end_date,
        created_at,
        CASE 
          WHEN labour_access_end_date IS NOT NULL AND labour_access_end_date < NOW() THEN true
          ELSE false
        END as is_expired,
        CASE 
          WHEN labour_access_end_date IS NOT NULL AND labour_access_end_date >= NOW() THEN 
            EXTRACT(DAY FROM (labour_access_end_date - NOW()))::INTEGER
          ELSE 0
        END as days_remaining
      FROM users
      WHERE id = $1
    `, [req.user.id]);

  if (!user) {
    throw new NotFoundError('User not found');
  }

  // Update status to expired in background if needed (non-blocking)
  // Only update if status is still 'active' to avoid race conditions
  if (user.is_expired && user.labour_access_status === 'active') {
    // Fire and forget - don't wait for this to complete
    query(`
      UPDATE users 
      SET labour_access_status = 'expired'
      WHERE id = $1 AND labour_access_status = 'active'
    `, [req.user.id]).catch((error) => {
      // Log error but don't fail the request
      logger.error('Failed to update expired labour access status', {
        error: error.message,
        userId: req.user.id
      });
    });
  }

  // Use calculated values from SQL
  const isExpired = user.is_expired || false;
  const daysRemaining = user.days_remaining || 0;
  const accessStatus = isExpired && user.labour_access_status === 'active' 
    ? 'expired' 
    : user.labour_access_status;

  res.json({
    status: 'success',
    data: {
      accessStatus: accessStatus,
      startDate: user.labour_access_start_date,
      endDate: user.labour_access_end_date,
      isExpired: isExpired,
      daysRemaining: daysRemaining,
      hasAccess: accessStatus === 'active' && !isExpired
    }
  });
}));

/**
 * @route   GET /api/payments/labour-transaction-history
 * @desc    Get labour payment transaction history for user
 * @access  Private (User only)
 */
router.get('/labour-transaction-history', auth, requireRole(['user']), asyncHandler(async (req, res) => {
  const { page = 1, limit = 50 } = req.query; // Increased default limit to show more transactions
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;

  // Validate pagination
  if (isNaN(pageNum) || pageNum < 1) {
    throw new ValidationError('page must be a positive integer');
  }
  if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
    throw new ValidationError('limit must be a positive integer between 1 and 100');
  }

  // Optimized: Get total count and transactions in parallel for better performance
  // Removed unnecessary LEFT JOIN to users table - we don't need access_expiry and access_status
  const [countResult, transactions] = await Promise.all([
    getRow(`
      SELECT COUNT(*) as total
      FROM labour_payment_transactions
      WHERE user_id = $1
    `, [req.user.id]),
    getRows(`
      SELECT 
        id,
        order_id,
        amount,
        status,
        created_at,
        completed_at,
        transaction_id,
        payment_method,
        service_name
      FROM labour_payment_transactions
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `, [req.user.id, limitNum, offset])
  ]);

  const total = parseInt(countResult?.total || 0, 10);
  const totalPages = Math.ceil(total / limitNum);

  res.json({
    status: 'success',
    data: { 
      transactions: transactions || [],
      pagination: {
        currentPage: pageNum,
        totalPages,
        total,
        limit: limitNum,
        hasMore: pageNum < totalPages
      }
    }
  });
}));

/**
 * @route   POST /api/payments/check-labour-access
 * @desc    Manually trigger labour access checks (Admin only)
 * @access  Private (Admin only)
 */
router.post('/check-labour-access', auth, requireRole(['admin']), asyncHandler(async (req, res) => {
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
}));

/**
 * @route   GET /api/payments/labour-access-stats
 * @desc    Get labour access statistics (Admin only)
 * @access  Private (Admin only)
 */
router.get('/labour-access-stats', auth, requireRole(['admin']), asyncHandler(async (req, res) => {
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
}));

module.exports = router;

