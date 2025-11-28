
const crypto = require('crypto');
const { getRow, query } = require('../database/connection');

class PaymentSecurity {
  /**
   * Check for duplicate payment attempts (Idempotency)
   */
  static async checkDuplicatePayment(providerServiceId, userId) {
    const existingPayment = await getRow(`
      SELECT * FROM payment_transactions 
      WHERE provider_service_id = $1 
        AND user_id = $2 
        AND status IN ('pending', 'completed')
        AND created_at > NOW() - INTERVAL '5 minutes'
      ORDER BY created_at DESC
      LIMIT 1
    `, [providerServiceId, userId]);

    return existingPayment;
  }

  /**
   * Check for duplicate labour payment attempts (Idempotency)
   */
  static async checkDuplicateLabourPayment(userId) {
    const existingPayment = await getRow(`
      SELECT * FROM labour_payment_transactions 
      WHERE user_id = $1 
        AND status IN ('pending', 'completed')
        AND created_at > NOW() - INTERVAL '5 minutes'
      ORDER BY created_at DESC
      LIMIT 1
    `, [userId]);

    return existingPayment;
  }

  /**
   * Validate payment amount against expected service price
   */
  static async validatePaymentAmount(providerServiceId, amount, options = {}) {
    const { pricingPlanId = null, currency = null } = options;

    const service = await getRow(`
      SELECT 
        ps.id AS provider_service_id,
        ps.provider_id,
        ps.service_id,
        sm.name AS service_name,
        sm.base_price,
        sm.currency_code,
        sm.default_pricing_plan_id,
        sm.is_paid
      FROM provider_services ps
      JOIN services_master sm ON ps.service_id = sm.id
      WHERE ps.id = $1
    `, [providerServiceId]);

    if (!service) {
      return { valid: false, message: 'Service not found' };
    }

    const resolvedCurrency = (currency || service.currency_code || 'INR').toUpperCase();

    let pricingPlan = null;

    if (pricingPlanId) {
      pricingPlan = await getRow(`
        SELECT *
        FROM service_pricing
        WHERE id = $1
          AND service_id = $2
          AND is_active = TRUE
          AND (effective_from IS NULL OR effective_from <= NOW())
          AND (effective_to IS NULL OR effective_to >= NOW())
      `, [pricingPlanId, service.service_id]);

      if (!pricingPlan) {
        return {
          valid: false,
          message: 'Invalid or inactive pricing plan selected'
        };
      }
    } else {
      pricingPlan = await getRow(`
        SELECT *
        FROM service_pricing
        WHERE service_id = $1
          AND is_active = TRUE
          AND (effective_from IS NULL OR effective_from <= NOW())
          AND (effective_to IS NULL OR effective_to >= NOW())
        ORDER BY 
          (CASE WHEN id = $2 THEN 0 ELSE 1 END),
          priority DESC,
          effective_from DESC NULLS LAST
        LIMIT 1
      `, [service.service_id, service.default_pricing_plan_id]);
    }

    const expectedAmount = pricingPlan
      ? parseFloat(pricingPlan.price)
      : parseFloat(service.base_price);

    const expectedCurrency = (pricingPlan
      ? pricingPlan.currency_code
      : service.currency_code || resolvedCurrency).toUpperCase();

    if (expectedAmount === null || Number.isNaN(expectedAmount)) {
      return {
        valid: false,
        message: 'Pricing configuration incomplete for this service'
      };
    }

    const actualAmount = parseFloat(amount);
    if (Number.isNaN(actualAmount)) {
      return { valid: false, message: 'Invalid amount' };
    }

    if (expectedCurrency && expectedCurrency.toUpperCase() !== resolvedCurrency) {
      return {
        valid: false,
        message: `Invalid currency. Expected ${expectedCurrency}, received ${resolvedCurrency}`,
        expectedCurrency,
        receivedCurrency: resolvedCurrency,
        expected: expectedAmount
      };
    }

    // Allow 1% tolerance
    const tolerance = expectedAmount * 0.01;

    if (Math.abs(actualAmount - expectedAmount) > tolerance) {
      return {
        valid: false,
        message: 'Payment amount does not match pricing plan',
        expected: expectedAmount,
        expectedCurrency: expectedCurrency,
        received: actualAmount
      };
    }

    return {
      valid: true,
      service,
      pricingPlan,
      expectedAmount,
      currency: expectedCurrency || resolvedCurrency
    };
  }

  /**
   * Verify Paytm webhook source (IP whitelist)
   */
  static verifyPaytmIP(clientIP) {
    // Paytm's official IP ranges
    const PAYTM_IP_RANGES = [
      '203.192.240.0/24',
      '203.192.241.0/24',
      '202.164.37.0/24'
    ];

    // In development, allow localhost
    if (process.env.NODE_ENV !== 'production') {
      if (clientIP === '127.0.0.1' || clientIP === '::1' || clientIP.includes('192.168')) {
        return true;
      }
    }

    // Check if IP is in whitelist
    // For production, implement proper CIDR matching
    // This is a simplified version
    return PAYTM_IP_RANGES.some(range => {
      const baseIP = range.split('/')[0];
      const subnet = baseIP.split('.').slice(0, 3).join('.');
      return clientIP.startsWith(subnet);
    });
  }

  /**
   * Prevent webhook replay attacks
   */
  static async checkWebhookReplay(orderId, paytmTransactionId, timestamp) {
    // Check if this exact transaction has been processed before
    const existingCallback = await getRow(`
      SELECT * FROM payment_transactions
      WHERE order_id = $1 
        AND transaction_id = $2
        AND status IN ('completed', 'failed')
    `, [orderId, paytmTransactionId]);

    if (existingCallback) {
      return {
        isReplay: true,
        message: 'This webhook has already been processed'
      };
    }

    // Check timestamp is recent (within 5 minutes)
    if (timestamp) {
      const callbackTime = new Date(timestamp);
      const now = new Date();
      const diffMinutes = (now - callbackTime) / (1000 * 60);

      if (diffMinutes > 5) {
        return {
          isReplay: true,
          message: 'Webhook timestamp is too old (possible replay attack)'
        };
      }
    }

    return { isReplay: false };
  }

  /**
   * Generate idempotency key for payment
   */
  static generateIdempotencyKey(userId, providerServiceId) {
    const data = `${userId}-${providerServiceId}-${Date.now()}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Create distributed lock for payment (prevent concurrent payments)
   */
  static async acquirePaymentLock(userId, providerServiceId) {
    const lockKey = `payment_lock_${userId}_${providerServiceId}`;
    const lockTimeout = 30; // 30 seconds

    try {
      // Try to insert a lock record
      const result = await query(`
        INSERT INTO payment_locks (lock_key, user_id, expires_at, created_at)
        VALUES ($1, $2, NOW() + INTERVAL '${lockTimeout} seconds', NOW())
        ON CONFLICT (lock_key) 
        DO NOTHING
        RETURNING id
      `, [lockKey, userId]);

      if (result.rows.length === 0) {
        // Lock already exists
        return { acquired: false, message: 'Payment already in progress' };
      }

      return { acquired: true, lockKey };
    } catch (error) {
      // If payment_locks table doesn't exist, create it
      if (error.code === '42P01') {
        await query(`
          CREATE TABLE IF NOT EXISTS payment_locks (
            id SERIAL PRIMARY KEY,
            lock_key VARCHAR(255) UNIQUE NOT NULL,
            user_id VARCHAR(255) NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            created_at TIMESTAMP DEFAULT NOW()
          )
        `);
        
        // Create index for faster lookups
        await query(`
          CREATE INDEX IF NOT EXISTS idx_payment_locks_key ON payment_locks(lock_key);
          CREATE INDEX IF NOT EXISTS idx_payment_locks_expires ON payment_locks(expires_at);
        `);

        // Retry lock acquisition
        return this.acquirePaymentLock(userId, providerServiceId);
      }
      throw error;
    }
  }

  /**
   * Release payment lock
   */
  static async releasePaymentLock(lockKey) {
    try {
      await query(`
        DELETE FROM payment_locks 
        WHERE lock_key = $1
      `, [lockKey]);
    } catch (error) {
      console.error('Error releasing payment lock:', error);
    }
  }

  /**
   * Cleanup expired locks (should be run periodically)
   */
  static async cleanupExpiredLocks() {
    try {
      const result = await query(`
        DELETE FROM payment_locks 
        WHERE expires_at < NOW()
        RETURNING id
      `);
      
      if (result.rows.length > 0) {
        // Cleanup logging removed for production
      }
    } catch (error) {
      // Silently ignore if table doesn't exist (will be created on first use)
      if (error.code !== '42P01') {
        // Only log non-table-not-found errors
      }
    }
  }

  /**
   * Validate payment transaction state transition
   */
  static isValidStatusTransition(currentStatus, newStatus) {
    const validTransitions = {
      'pending': ['completed', 'failed', 'cancelled'],
      'completed': [], // Completed is final
      'failed': ['pending'], // Can retry
      'cancelled': [] // Cancelled is final
    };

    return validTransitions[currentStatus]?.includes(newStatus) || false;
  }

  /**
   * Calculate risk score for payment
   */
  static async calculatePaymentRiskScore(userId, amount, clientInfo) {
    let riskScore = 0;

    // Check user's payment history
    const userHistory = await getRow(`
      SELECT 
        COUNT(*) as total_payments,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_payments,
        COUNT(CASE WHEN created_at > NOW() - INTERVAL '1 hour' THEN 1 END) as recent_payments
      FROM payment_transactions
      WHERE user_id = $1
    `, [userId]);

    // High failure rate
    if (userHistory && userHistory.total_payments > 0) {
      const failureRate = userHistory.failed_payments / userHistory.total_payments;
      if (failureRate > 0.5) riskScore += 0.3;
    }

    // Too many recent payments (possible fraud)
    if (userHistory && userHistory.recent_payments > 3) {
      riskScore += 0.4;
    }

    // Very high amount (possible fraud)
    if (amount > 50000) {
      riskScore += 0.2;
    }

    // Unusual time (3am-6am)
    const hour = new Date().getHours();
    if (hour >= 3 && hour <= 6) {
      riskScore += 0.1;
    }

    return {
      score: Math.min(riskScore, 1.0),
      level: riskScore > 0.7 ? 'high' : riskScore > 0.4 ? 'medium' : 'low',
      factors: {
        failureRate: userHistory?.failed_payments || 0,
        recentPayments: userHistory?.recent_payments || 0,
        highAmount: amount > 50000,
        unusualTime: hour >= 3 && hour <= 6
      }
    };
  }
}

// Run cleanup every 5 minutes
setInterval(() => {
  PaymentSecurity.cleanupExpiredLocks();
}, 5 * 60 * 1000);

module.exports = PaymentSecurity;

