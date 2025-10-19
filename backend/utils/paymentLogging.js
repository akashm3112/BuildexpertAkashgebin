const { query } = require('../database/connection');

/**
 * Payment Logging Utilities
 * Comprehensive logging for payment transactions, events, and API interactions
 */

class PaymentLogger {
  /**
   * Log payment event
   */
  static async logPaymentEvent(transactionId, eventType, eventData, userId, req = null) {
    try {
      const ipAddress = req ? req.ip || req.connection?.remoteAddress : null;
      const userAgent = req ? req.get('User-Agent') : null;

      await query(`
        INSERT INTO payment_events (
          payment_transaction_id, event_type, event_data, user_id, ip_address, user_agent, timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      `, [transactionId, eventType, JSON.stringify(eventData || {}), userId, ipAddress, userAgent]);

      console.log(`💰 Payment Event: ${eventType}`, {
        transactionId,
        eventType,
        eventData,
        userId,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('❌ Error logging payment event:', error);
    }
  }

  /**
   * Log API interaction
   */
  static async logApiInteraction(transactionId, endpoint, method, requestData, responseData, responseTime, error = null) {
    try {
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

      console.log(`💰 API Interaction: ${method} ${endpoint}`, {
        transactionId,
        endpoint,
        method,
        responseTime: `${responseTime}ms`,
        status: responseData?.status || (error ? 500 : 200),
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('❌ Error logging API interaction:', error);
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

      console.log(`🔒 Security Event: ${eventType}`, {
        transactionId,
        eventType,
        riskScore,
        riskFactors,
        actionTaken,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('❌ Error logging security event:', error);
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

        console.log(`💰 Payment Transaction Updated: ${transactionId}`, {
          transactionId,
          updates: updateData,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('❌ Error updating payment transaction:', error);
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

      console.log(`💰 Performance Metrics: ${transactionId}`, {
        transactionId,
        metrics,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('❌ Error logging performance metrics:', error);
    }
  }
}

module.exports = PaymentLogger;
