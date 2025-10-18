const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { query, getRow, getRows } = require('../database/connection');
const { auth, requireRole } = require('../middleware/auth');
const { sendNotification } = require('../utils/notifications');

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
async function verifyPaytmPayment(orderId) {
  try {
    // Prepare verification parameters
    const verificationParams = {
      MID: PAYTM_CONFIG.MID,
      ORDERID: orderId
    };

    // Generate checksum for verification
    const checksum = generateChecksum(verificationParams, PAYTM_CONFIG.MERCHANT_KEY);
    verificationParams.CHECKSUMHASH = checksum;

    // Paytm verification URL
    const verificationUrl = process.env.NODE_ENV === 'production'
      ? 'https://securegw.paytm.in/merchant-status/getTxnStatus'
      : 'https://securegw-stage.paytm.in/merchant-status/getTxnStatus';

    // Make API call to Paytm
    const response = await fetch(verificationUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(verificationParams)
    });

    if (!response.ok) {
      throw new Error(`Paytm API error: ${response.status} ${response.statusText}`);
    }

    const paytmResponse = await response.json();
    
    console.log('Paytm verification response:', paytmResponse);

    // Check if payment was successful
    const isSuccess = paytmResponse.STATUS === 'TXN_SUCCESS';
    const transactionId = paytmResponse.TXNID;
    const amount = paytmResponse.TXNAMOUNT;
    const responseCode = paytmResponse.RESPCODE;
    const responseMessage = paytmResponse.RESPMSG;

    return {
      success: isSuccess,
      transactionId: transactionId,
      amount: amount,
      responseCode: responseCode,
      responseMessage: responseMessage,
      paytmResponse: paytmResponse
    };

  } catch (error) {
    console.error('Paytm verification error:', error);
    return {
      success: false,
      error: error.message,
      paytmResponse: null
    };
  }
}

/**
 * @route   POST /api/payments/initiate-paytm
 * @desc    Initiate Paytm payment for service registration
 * @access  Private (Provider only)
 */
router.post('/initiate-paytm', auth, requireRole(['provider']), async (req, res) => {
  try {
    const { providerServiceId, amount, serviceCategory, serviceName } = req.body;

    if (!providerServiceId || !amount) {
      return res.status(400).json({
        status: 'error',
        message: 'Provider service ID and amount are required'
      });
    }

    // Verify provider owns this service
    const providerService = await getRow(`
      SELECT ps.*, pp.user_id
      FROM provider_services ps
      JOIN provider_profiles pp ON ps.provider_id = pp.id
      WHERE ps.id = $1 AND pp.user_id = $2
    `, [providerServiceId, req.user.id]);

    if (!providerService) {
      return res.status(404).json({
        status: 'error',
        message: 'Provider service not found or you do not have permission'
      });
    }

    // Generate unique order ID
    const orderId = `ORDER_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    // Create payment record
    await query(`
      INSERT INTO payment_transactions 
      (order_id, user_id, provider_service_id, amount, status, payment_method, service_name)
      VALUES ($1, $2, $3, $4, 'pending', 'paytm', $5)
    `, [orderId, req.user.id, providerServiceId, amount, serviceName]);

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

    res.json({
      status: 'success',
      orderId: orderId,
      paytmUrl: paytmUrl,
      paytmParams: paytmParams,
      message: 'Payment initiated successfully'
    });

  } catch (error) {
    console.error('Initiate Paytm payment error:', error);
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
router.post('/verify-paytm', auth, requireRole(['provider']), async (req, res) => {
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
    const paymentVerification = await verifyPaytmPayment(orderId);

    if (paymentVerification.success) {
      // Get existing service to check if it's a renewal
      const existingService = await getRow(`
        SELECT payment_start_date, payment_end_date, payment_status
        FROM provider_services
        WHERE id = $1
      `, [providerServiceId]);

      let startDate, endDate;
      
      if (existingService && existingService.payment_status === 'active' && existingService.payment_end_date) {
        // Renewal: Start new period after current expiry
        const currentEndDate = new Date(existingService.payment_end_date);
        startDate = currentEndDate;
        endDate = new Date(currentEndDate);
        endDate.setDate(endDate.getDate() + 30);
      } else {
        // New activation or expired service: Start immediately
        startDate = new Date();
        endDate = new Date();
        endDate.setDate(endDate.getDate() + 30);
      }

      // Update provider service status
      await query(`
        UPDATE provider_services
        SET payment_status = 'active',
            payment_start_date = $1,
            payment_end_date = $2
        WHERE id = $3
      `, [startDate, endDate, providerServiceId]);

      // Update payment transaction with success details
      await query(`
        UPDATE payment_transactions
        SET status = 'completed',
            payment_gateway_response = $1,
            completed_at = NOW(),
            transaction_id = $2
        WHERE order_id = $3
      `, [
        JSON.stringify(paymentVerification.paytmResponse), 
        paymentVerification.transactionId,
        orderId
      ]);

      // Send success notification
      await sendNotification(
        req.user.id,
        'Payment Successful',
        `Your service registration is now active until ${endDate.toLocaleDateString()}. You will receive a reminder before expiry.`,
        'provider'
      );

      console.log(`✅ Payment successful for order ${orderId}, service activated`);

      res.json({
        status: 'success',
        message: 'Payment verified and service activated',
        data: {
          startDate: startDate,
          endDate: endDate,
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
              completed_at = NOW()
          WHERE order_id = $2
        `, [
          JSON.stringify({
            verified: false,
            error: paymentVerification.error,
            paytmResponse: paymentVerification.paytmResponse
          }), 
          orderId
        ]);

        // Send failure notification
        await sendNotification(
          req.user.id,
          'Payment Failed ❌',
          `Your payment could not be processed. Please try again or contact support if the issue persists.`,
          'provider'
        );

        console.log(`❌ Payment failed for order ${orderId}:`, paymentVerification.error);

        res.status(400).json({
          status: 'error',
          message: paymentVerification.error || 'Payment verification failed',
          details: paymentVerification.responseMessage || 'Unknown error'
        });

      } catch (dbError) {
        console.error('Database error during payment failure:', dbError);
        res.status(500).json({
          status: 'error',
          message: 'Payment failed and error recording failed. Please contact support.'
        });
      }
    }

  } catch (error) {
    console.error('Verify Paytm payment error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to verify payment'
    });
  }
});

/**
 * @route   POST /api/payments/paytm-callback
 * @desc    Paytm callback handler
 * @access  Public (called by Paytm)
 */
router.post('/paytm-callback', async (req, res) => {
  try {
    const paytmResponse = req.body;
    
    console.log('Paytm callback received:', paytmResponse);

    // Extract order details
    const orderId = paytmResponse.ORDERID;
    const status = paytmResponse.STATUS;
    const transactionId = paytmResponse.TXNID;
    const amount = paytmResponse.TXNAMOUNT;
    const responseCode = paytmResponse.RESPCODE;
    const responseMessage = paytmResponse.RESPMSG;

    if (!orderId) {
      console.error('No order ID in Paytm callback');
      return res.status(400).send('Invalid callback data');
    }

    // Verify checksum from Paytm
    const receivedChecksum = paytmResponse.CHECKSUMHASH;
    const calculatedChecksum = generateChecksum(paytmResponse, PAYTM_CONFIG.MERCHANT_KEY);

    if (receivedChecksum !== calculatedChecksum) {
      console.error('Checksum verification failed for order:', orderId);
      return res.status(400).send('Checksum verification failed');
    }

    // Get the payment transaction
    const transaction = await getRow(`
      SELECT * FROM payment_transactions
      WHERE order_id = $1
    `, [orderId]);

    if (!transaction) {
      console.error('Transaction not found for order:', orderId);
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

      console.log(`✅ Payment successful via callback for order ${orderId}`);

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

      console.log(`❌ Payment failed via callback for order ${orderId}: ${responseMessage}`);
    }

    // Return success response to Paytm
    res.send('<html><body><h1>Payment processed successfully</h1></body></html>');

  } catch (error) {
    console.error('Paytm callback error:', error);
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
      LIMIT 50
    `, [req.user.id]);

    res.json({
      status: 'success',
      data: { transactions }
    });

  } catch (error) {
    console.error('Get transaction history error:', error);
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
    console.error('Retry payment error:', error);
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
    console.error('Get payment status error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch payment status'
    });
  }
});

module.exports = router;

