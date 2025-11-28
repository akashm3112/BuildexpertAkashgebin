const logger = require('./logger');
const { ServiceUnavailableError } = require('./errorTypes');

/**
 * Circuit Breaker States
 */
const States = {
  CLOSED: 'CLOSED',     // Normal operation
  OPEN: 'OPEN',         // Service is down, fail fast
  HALF_OPEN: 'HALF_OPEN' // Testing if service recovered
};

/**
 * Circuit Breaker Class
 */
class CircuitBreaker {
  constructor(name, options = {}) {
    this.name = name;
    this.state = States.CLOSED;
    
    // Configuration
    this.failureThreshold = options.failureThreshold || 5; // Failures before opening
    this.successThreshold = options.successThreshold || 2; // Successes before closing
    this.timeout = options.timeout || 60000; // Time before trying again (60s)
    this.monitoringPeriod = options.monitoringPeriod || 120000; // Period for counting failures (2min)
    
    // State
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttempt = Date.now();
    this.lastFailureTime = null;
    this.lastSuccessTime = null;
    
    // Stats
    this.totalRequests = 0;
    this.totalFailures = 0;
    this.totalSuccesses = 0;
    this.circuitOpened = 0;
  }
  
  /**
   * Execute function with circuit breaker protection
   */
  async execute(fn, fallback = null) {
    this.totalRequests++;
    
    // Check if circuit is OPEN
    if (this.state === States.OPEN) {
      // Check if timeout has elapsed
      if (Date.now() < this.nextAttempt) {
        logger.warn(`Circuit breaker OPEN for ${this.name}`, {
          nextAttempt: new Date(this.nextAttempt).toISOString(),
          failureCount: this.failureCount
        });
        
        // Return fallback if provided
        if (fallback) {
          return await fallback();
        }
        
        throw new ServiceUnavailableError(
          this.name,
          `Service temporarily unavailable. Try again after ${new Date(this.nextAttempt).toISOString()}`
        );
      }
      
      // Transition to HALF_OPEN to test service
      this.state = States.HALF_OPEN;
      this.successCount = 0;
      logger.info(`Circuit breaker HALF_OPEN for ${this.name} (testing recovery)`);
    }
    
    try {
      // Execute the function
      const result = await fn();
      
      // Success
      this.onSuccess();
      return result;
      
    } catch (error) {
      // Failure
      this.onFailure(error);
      
      // Return fallback if provided
      if (fallback) {
        try {
          return await fallback();
        } catch (fallbackError) {
          // Fallback also failed
          logger.error(`Fallback failed for ${this.name}`, {
            error: fallbackError.message
          });
          throw error; // Throw original error
        }
      }
      
      throw error;
    }
  }
  
  /**
   * Handle successful execution
   */
  onSuccess() {
    this.totalSuccesses++;
    this.lastSuccessTime = Date.now();
    
    if (this.state === States.HALF_OPEN) {
      this.successCount++;
      
      // If enough successes in HALF_OPEN, close circuit
      if (this.successCount >= this.successThreshold) {
        this.close();
      }
    } else {
      // Reset failure count on success
      this.failureCount = 0;
    }
  }
  
  /**
   * Handle failed execution
   */
  onFailure(error) {
    this.totalFailures++;
    this.lastFailureTime = Date.now();
    this.failureCount++;
    
    logger.warn(`Circuit breaker failure for ${this.name}`, {
      error: error.message,
      failureCount: this.failureCount,
      threshold: this.failureThreshold,
      state: this.state
    });
    
    // Check if threshold exceeded
    if (this.failureCount >= this.failureThreshold) {
      this.open();
    }
    
    // If HALF_OPEN test fails, re-open circuit
    if (this.state === States.HALF_OPEN) {
      this.open();
    }
  }
  
  /**
   * Open the circuit (fail fast)
   */
  open() {
    this.state = States.OPEN;
    this.nextAttempt = Date.now() + this.timeout;
    this.circuitOpened++;
    
    logger.error(`Circuit breaker OPENED for ${this.name}`, {
      failureCount: this.failureCount,
      nextAttempt: new Date(this.nextAttempt).toISOString(),
      totalOpened: this.circuitOpened
    });
  }
  
  /**
   * Close the circuit (service recovered)
   */
  close() {
    const previousState = this.state;
    this.state = States.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    
    if (previousState !== States.CLOSED) {
      logger.info(`Circuit breaker CLOSED for ${this.name} (service recovered)`, {
        successCount: this.successCount
      });
    }
  }
  
  /**
   * Get circuit breaker status
   */
  getStatus() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses,
      circuitOpened: this.circuitOpened,
      lastFailureTime: this.lastFailureTime ? new Date(this.lastFailureTime).toISOString() : null,
      lastSuccessTime: this.lastSuccessTime ? new Date(this.lastSuccessTime).toISOString() : null,
      nextAttemptTime: this.state === States.OPEN ? new Date(this.nextAttempt).toISOString() : null,
      healthStatus: this.getHealthStatus()
    };
  }
  
  /**
   * Get health status
   */
  getHealthStatus() {
    if (this.state === States.OPEN) return 'unhealthy';
    if (this.state === States.HALF_OPEN) return 'recovering';
    
    // Calculate success rate
    const total = this.totalSuccesses + this.totalFailures;
    if (total === 0) return 'unknown';
    
    const successRate = this.totalSuccesses / total;
    if (successRate > 0.95) return 'healthy';
    if (successRate > 0.80) return 'degraded';
    return 'unhealthy';
  }
  
  /**
   * Reset circuit breaker
   */
  reset() {
    this.state = States.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    
    logger.info(`Circuit breaker reset for ${this.name}`);
  }
}

/**
 * Circuit Breaker Registry
 * Manages multiple circuit breakers
 */
class CircuitBreakerRegistry {
  constructor() {
    this.breakers = new Map();
  }
  
  /**
   * Get or create circuit breaker
   */
  getBreaker(name, options = {}) {
    if (!this.breakers.has(name)) {
      this.breakers.set(name, new CircuitBreaker(name, options));
    }
    return this.breakers.get(name);
  }
  
  /**
   * Get all circuit breaker statuses
   */
  getAllStatuses() {
    const statuses = {};
    for (const [name, breaker] of this.breakers.entries()) {
      statuses[name] = breaker.getStatus();
    }
    return statuses;
  }
  
  /**
   * Reset all circuit breakers
   */
  resetAll() {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
    logger.info('All circuit breakers reset');
  }
  
  /**
   * Get unhealthy services
   */
  getUnhealthyServices() {
    const unhealthy = [];
    for (const [name, breaker] of this.breakers.entries()) {
      const status = breaker.getStatus();
      if (status.healthStatus === 'unhealthy' || status.state === 'OPEN') {
        unhealthy.push(status);
      }
    }
    return unhealthy;
  }
}

// Global registry instance
const registry = new CircuitBreakerRegistry();

/**
 * Pre-configured circuit breakers for common services
 */
const breakers = {
  // Payment Gateway
  paytm: registry.getBreaker('paytm', {
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 120000 // 2 minutes
  }),
  
  // SMS Service
  sms: registry.getBreaker('sms', {
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 60000 // 1 minute
  }),
  
  // Cloudinary
  cloudinary: registry.getBreaker('cloudinary', {
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 60000 // 1 minute
  }),
  
  // Database (for external database scenarios)
  database: registry.getBreaker('database', {
    failureThreshold: 10,
    successThreshold: 3,
    timeout: 30000 // 30 seconds
  }),
  
  // Push Notifications
  pushNotifications: registry.getBreaker('pushNotifications', {
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 60000 // 1 minute
  })
};

module.exports = {
  CircuitBreaker,
  CircuitBreakerRegistry,
  registry,
  breakers,
  States
};

