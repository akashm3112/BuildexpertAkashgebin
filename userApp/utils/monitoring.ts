/**
 * ============================================================================
 * FRONTEND MONITORING UTILITY
 * Purpose: Track errors, performance, and user interactions
 * Features: Error tracking, performance metrics, crash reporting
 * ============================================================================
 */

import { globalErrorHandler } from './globalErrorHandler';

export interface PerformanceMetric {
  name: string;
  value: number;
  unit: 'ms' | 'bytes' | 'count';
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface ErrorMetric {
  error: string;
  message: string;
  stack?: string;
  context?: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

class FrontendMonitor {
  private performanceMetrics: PerformanceMetric[] = [];
  private errorMetrics: ErrorMetric[] = [];
  private maxMetrics = 100;
  private isInitialized = false;

  /**
   * Initialize monitoring
   */
  initialize() {
    if (this.isInitialized) return;
    
    // Track unhandled errors
    this.setupErrorTracking();
    
    // Track performance
    this.setupPerformanceTracking();
    
    this.isInitialized = true;
  }

  /**
   * Setup error tracking
   */
  private setupErrorTracking() {
    // Errors are already tracked by globalErrorHandler
    // This adds additional monitoring layer
  }

  /**
   * Setup performance tracking
   */
  private setupPerformanceTracking() {
    // Track navigation performance
    if (typeof performance !== 'undefined' && performance.mark) {
      // Mark app start
      performance.mark('app-start');
    }
  }

  /**
   * Record performance metric
   */
  recordPerformance(name: string, value: number, unit: 'ms' | 'bytes' | 'count' = 'ms', metadata?: Record<string, any>) {
    const metric: PerformanceMetric = {
      name,
      value,
      unit,
      timestamp: Date.now(),
      metadata
    };

    this.performanceMetrics.push(metric);

    // Keep only last N metrics
    if (this.performanceMetrics.length > this.maxMetrics) {
      this.performanceMetrics.shift();
    }

    // Log slow operations
    if (unit === 'ms' && value > 1000) {
      console.warn(`⚠️ Slow operation detected: ${name} took ${value}ms`, metadata);
    }
  }

  /**
   * Record error metric
   */
  recordError(error: Error | string, context?: string, metadata?: Record<string, any>) {
    const errorMetric: ErrorMetric = {
      error: error instanceof Error ? error.name : 'UnknownError',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      context,
      timestamp: Date.now(),
      metadata
    };

    this.errorMetrics.push(errorMetric);

    // Keep only last N errors
    if (this.errorMetrics.length > this.maxMetrics) {
      this.errorMetrics.shift();
    }

    // Also log to global error handler
    if (error instanceof Error) {
      globalErrorHandler.handleError(error, false, context);
    }
  }

  /**
   * Measure async operation
   */
  async measureAsync<T>(
    name: string,
    operation: () => Promise<T>,
    metadata?: Record<string, any>
  ): Promise<T> {
    const start = Date.now();
    try {
      const result = await operation();
      const duration = Date.now() - start;
      this.recordPerformance(name, duration, 'ms', metadata);
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      this.recordPerformance(`${name}_error`, duration, 'ms', { ...metadata, error: true });
      this.recordError(error instanceof Error ? error : new Error(String(error)), name, metadata);
      throw error;
    }
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics() {
    return {
      metrics: this.performanceMetrics,
      summary: this.calculatePerformanceSummary()
    };
  }

  /**
   * Calculate performance summary
   */
  private calculatePerformanceSummary() {
    const msMetrics = this.performanceMetrics.filter(m => m.unit === 'ms');
    
    if (msMetrics.length === 0) {
      return {
        count: 0,
        average: 0,
        min: 0,
        max: 0,
        p95: 0,
        p99: 0
      };
    }

    const values = msMetrics.map(m => m.value).sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);
    const average = sum / values.length;
    const p95Index = Math.floor(values.length * 0.95);
    const p99Index = Math.floor(values.length * 0.99);

    return {
      count: values.length,
      average: Math.round(average),
      min: values[0],
      max: values[values.length - 1],
      p95: values[p95Index] || 0,
      p99: values[p99Index] || 0
    };
  }

  /**
   * Get error metrics
   */
  getErrorMetrics() {
    return {
      errors: this.errorMetrics,
      summary: {
        total: this.errorMetrics.length,
        byType: this.groupErrorsByType(),
        recent: this.errorMetrics.slice(-10).reverse()
      }
    };
  }

  /**
   * Group errors by type
   */
  private groupErrorsByType() {
    const grouped: Record<string, number> = {};
    this.errorMetrics.forEach(error => {
      grouped[error.error] = (grouped[error.error] || 0) + 1;
    });
    return grouped;
  }

  /**
   * Get all metrics
   */
  getMetrics() {
    return {
      performance: this.getPerformanceMetrics(),
      errors: this.getErrorMetrics(),
      timestamp: Date.now()
    };
  }

  /**
   * Clear metrics
   */
  clearMetrics() {
    this.performanceMetrics = [];
    this.errorMetrics = [];
  }
}

// Export singleton instance
export const frontendMonitor = new FrontendMonitor();

// Auto-initialize on import
frontendMonitor.initialize();

