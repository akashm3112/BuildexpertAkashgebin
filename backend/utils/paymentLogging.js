const { query } = require('../database/connection');
const logger = require('./logger');


class PaymentLogger {
  /**
   * Check if transaction is a labour payment by checking if it exists in labour_payment_transactions
   */
  static async isLabourPayment(transactionId) {
    try {
      const result = await query(`
        SELECT id FROM labour_payment_transactions WHERE id = $1
      `, [transactionId]);
      return result.rows.length > 0;
    } catch (error) {
      // If check fails, assume it's not a labour payment
      return false;
    }
  }

  static async logPaymentEvent(transactionId, eventType, eventData, userId, req = null) {
    try {
      const ipAddress = req ? req.ip || req.connection?.remoteAddress : null;
      const userAgent = req ? req.get('User-Agent') : null;

      // Check if this is a labour payment
      const isLabour = await this.isLabourPayment(transactionId);
      
      if (isLabour) {
        // Use labour_payment_events table for labour payments
        await query(`
          INSERT INTO labour_payment_events (
            payment_transaction_id, event_type, event_data, user_id, ip_address, user_agent, timestamp
          ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
        `, [transactionId, eventType, JSON.stringify(eventData || {}), userId, ipAddress, userAgent]);
      } else {
        // Use payment_events table for regular payments
        await query(`
          INSERT INTO payment_events (
            payment_transaction_id, event_type, event_data, user_id, ip_address, user_agent, timestamp
          ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
        `, [transactionId, eventType, JSON.stringify(eventData || {}), userId, ipAddress, userAgent]);
      }

      logger.payment(`Payment Event: ${eventType}`, {
        transactionId,
        eventType,
        eventData,
        userId,
        isLabourPayment: isLabour
      });
    } catch (error) {
      // Foreign key constraint errors are expected when tables don't match
      if (error.code === '23503') {
        logger.warn('Payment event logging skipped (foreign key constraint)', {
          transactionId,
          eventType,
          error: error.message
        });
      } else {
        logger.error('Error logging payment event', {
          transactionId,
          eventType,
          error: error.message,
          stack: error.stack
        });
      }
    }
  }

  /**
   * Log API interaction
   */
  static async logApiInteraction(transactionId, endpoint, method, requestData, responseData, responseTime, error = null) {
    try {
      // Check if this is a labour payment
      const isLabour = await this.isLabourPayment(transactionId);
      
      // For labour payments, skip API logging to payment_api_logs (it references payment_transactions)
      // This prevents foreign key constraint errors
      if (isLabour) {
        // For labour payments, log using payment logger (no separate API logs table for labour)
        logger.payment(`API Interaction (Labour Payment): ${method} ${endpoint}`, {
          transactionId,
          endpoint,
          method,
          responseTime: `${responseTime}ms`,
          status: responseData?.status || (error ? 500 : 200)
        });
        return; // Skip database logging for labour payments
      }

      // Use payment_api_logs table for regular payments
      await query(`
        INSERT INTO payment_api_logs (
          payment_transaction_id, api_endpoint, request_method, request_body, 
          response_status, response_body, response_time_ms, error_message, timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      `, [
        transactionId,
        endpoint,
        method,
        JSON.stringify(requestData || {}),
        responseData?.status || (error ? 500 : 200),
        JSON.stringify(responseData || {}),
        responseTime,
        error?.message || null
      ]);

      logger.payment(`API Interaction: ${method} ${endpoint}`, {
        transactionId,
        endpoint,
        method,
        responseTime: `${responseTime}ms`,
        status: responseData?.status || (error ? 500 : 200)
      });
    } catch (error) {
      // Foreign key constraint errors are expected when tables don't match
      if (error.code === '23503') {
        logger.warn('API interaction logging skipped (foreign key constraint)', {
          transactionId,
          endpoint,
          method,
          error: error.message
        });
      } else {
        logger.error('Error logging API interaction', {
          transactionId,
          endpoint,
          method,
          error: error.message,
          stack: error.stack
        });
      }
    }
  }

  /**
   * Log security event
   */
  static async logSecurityEvent(transactionId, eventType, riskScore, riskFactors, actionTaken, details) {
    try {
      await query(`
        INSERT INTO payment_security_events (
          payment_transaction_id, event_type, risk_score, risk_factors, action_taken, details, timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      `, [
        transactionId,
        eventType,
        riskScore,
        JSON.stringify(riskFactors || {}),
        actionTaken,
        JSON.stringify(details || {})
      ]);

      logger.payment(`Security Event: ${eventType}`, {
        transactionId,
        eventType,
        riskScore,
        riskFactors,
        actionTaken
      });
    } catch (error) {
      logger.error('Error logging security event', {
        transactionId,
        eventType,
        error: error.message,
        stack: error.stack
      });
    }
  }

  /**
   * Update payment transaction with additional data
   */
  static async updatePaymentTransaction(transactionId, updateData) {
    try {
      const fields = [];
      const values = [];
      let paramCount = 1;

      Object.entries(updateData).forEach(([key, value]) => {
        if (value !== undefined) {
          fields.push(`${key} = $${paramCount}`);
          values.push(typeof value === 'object' ? JSON.stringify(value) : value);
          paramCount++;
        }
      });

      if (fields.length > 0) {
        fields.push(`updated_at = NOW()`);
        values.push(transactionId);

        await query(`
          UPDATE payment_transactions 
          SET ${fields.join(', ')}
          WHERE id = $${paramCount}
        `, values);

        logger.payment(`Payment Transaction Updated: ${transactionId}`, {
          transactionId,
          updates: updateData
        });
      }
    } catch (error) {
      logger.error('Error updating payment transaction', {
        transactionId,
        error: error.message,
        stack: error.stack
      });
    }
  }

  /**
   * Extract client information from request
   */
  static extractClientInfo(req) {
    return {
      ipAddress: req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress,
      userAgent: req.get('User-Agent'),
      deviceInfo: {
        platform: req.get('X-Platform') || 'unknown',
        appVersion: req.get('X-App-Version') || 'unknown',
        deviceId: req.get('X-Device-ID') || null
      }
    };
  }

  /**
   * Generate payment flow ID
   */
  static generatePaymentFlowId() {
    return `PAYFLOW_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Calculate risk score based on various factors
   */
  static calculateRiskScore(factors) {
    let score = 0;
    
    // IP-based risk
    if (factors.suspiciousIP) score += 0.3;
    if (factors.newIP) score += 0.1;
    
    // Device-based risk
    if (factors.newDevice) score += 0.2;
    if (factors.suspiciousUserAgent) score += 0.2;
    
    // Behavior-based risk
    if (factors.rapidTransactions) score += 0.3;
    if (factors.unusualAmount) score += 0.2;
    if (factors.unusualTime) score += 0.1;
    
    // Account-based risk
    if (factors.newAccount) score += 0.2;
    if (factors.previousFailures) score += 0.3;
    
    return Math.min(score, 1.0); // Cap at 1.0
  }

  /**
   * Log performance metrics
   */
  static async logPerformanceMetrics(transactionId, metrics) {
    try {
      await this.updatePaymentTransaction(transactionId, {
        performance_metrics: metrics
      });

      logger.payment(`Performance Metrics: ${transactionId}`, {
        transactionId,
        metrics
      });
    } catch (error) {
      logger.error('Error logging performance metrics', {
        transactionId,
        error: error.message,
        stack: error.stack
      });
    }
  }
}

module.exports = PaymentLogger;
