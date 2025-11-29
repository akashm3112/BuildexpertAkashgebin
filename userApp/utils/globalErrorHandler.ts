

import { ErrorUtils } from 'react-native';

export interface ErrorInfo {
  error: Error;
  isFatal: boolean;
  timestamp: number;
  context?: string;
}

class GlobalErrorHandler {
  private errorQueue: ErrorInfo[] = [];
  private maxQueueSize = 50;
  private isInitialized = false;

  /**
   * Initialize global error handlers
   */
  initialize() {
    if (this.isInitialized) {
      console.warn('GlobalErrorHandler already initialized');
      return;
    }

    // Handle unhandled promise rejections
    this.setupUnhandledRejectionHandler();

    // Handle JavaScript errors (React Native)
    this.setupJavaScriptErrorHandler();

    // Handle console errors
    this.setupConsoleErrorHandler();

    this.isInitialized = true;
    console.log('✅ GlobalErrorHandler initialized');
  }

  /**
   * Setup handler for unhandled promise rejections
   * Note: React Native doesn't have native support for unhandledrejection event
   * We rely on wrapping async operations with wrapAsync() or safeAsync()
   */
  private setupUnhandledRejectionHandler() {
    // React Native doesn't support unhandledrejection event natively
    // We'll use a polyfill approach for web environments
    if (typeof window !== 'undefined' && typeof window.addEventListener !== 'undefined') {
      window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
        const error = event.reason instanceof Error 
          ? event.reason 
          : (typeof event.reason === 'object' && event.reason !== null && 'message' in event.reason)
            ? new Error((event.reason as any).message || String(event.reason))
            : new Error(String(event.reason));

        // Suppress "Session expired" errors - they're expected after 30 days
        const isSessionExpired = error.message === 'Session expired' || 
                                 error.message?.includes('Session expired') ||
                                 (event.reason as any)?.status === 401 && error.message?.includes('Session expired') ||
                                 (event.reason as any)?._suppressUnhandled === true ||
                                 (event.reason as any)?._handled === true;
        
        if (isSessionExpired) {
          // Suppress "Session expired" errors completely - prevent default logging
          event.preventDefault();
          event.stopPropagation();
          return; // Don't log or handle - just suppress
        }
        
        if (!isSessionExpired) {
          this.handleError(error, false, 'Unhandled Promise Rejection');
        }
        
        // Prevent default browser behavior
        event.preventDefault();
      });
    }

    // For React Native, we rely on explicit error handling via wrapAsync/safeAsync
    // This is documented in the codebase and enforced through code review
    // Additionally, we've added .catch() handlers to all async operations
  }

  /**
   * Setup handler for JavaScript errors (React Native ErrorUtils)
   */
  private setupJavaScriptErrorHandler() {
    // Check if ErrorUtils is available (may not be in all environments)
    if (!ErrorUtils || typeof ErrorUtils.getGlobalHandler !== 'function') {
      console.warn('ErrorUtils not available, skipping JavaScript error handler setup');
      return;
    }

    const originalHandler = ErrorUtils.getGlobalHandler();

    if (typeof ErrorUtils.setGlobalHandler === 'function') {
      ErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
        // Suppress "Session expired" errors - they're expected after 30 days
        const isSessionExpired = error.message === 'Session expired' || 
                                 error.message?.includes('Session expired') ||
                                 (error as any).status === 401 && error.message?.includes('Session expired') ||
                                 (error as any)._suppressUnhandled === true ||
                                 (error as any)._handled === true;
        
        if (!isSessionExpired) {
          // Log the error
          this.handleError(error, isFatal || false, 'JavaScript Error');
        }

        // Call original handler if it exists (but suppress console output for session expired)
        if (originalHandler) {
          if (!isSessionExpired) {
            originalHandler(error, isFatal);
          }
          // For session expired errors, we still call the handler but it won't log
        }
      });
    }
  }

  /**
   * Setup handler for console errors
   */
  private setupConsoleErrorHandler() {
    const originalError = console.error;

    console.error = (...args: any[]) => {
      // Check if it's an Error object or error-like object
      const errorArg = args.find(arg => 
        arg instanceof Error || 
        (typeof arg === 'object' && arg !== null && ('message' in arg || 'status' in arg))
      );
      
      if (errorArg) {
        const error = errorArg instanceof Error 
          ? errorArg 
          : new Error((errorArg as any).message || String(errorArg));
        
        // Suppress "Session expired" errors - they're expected after 30 days
        const isSessionExpired = error.message === 'Session expired' || 
                                 error.message?.includes('Session expired') ||
                                 (errorArg as any).status === 401 && error.message?.includes('Session expired') ||
                                 (errorArg as any)._suppressUnhandled === true ||
                                 (errorArg as any)._handled === true;
        
        // Suppress timeout errors during signup/login flows
        const isTokenRefreshTimeout = error.message.includes('timeout') && 
          (error.message.includes('refreshing token') || 
           error.stack?.includes('tokenManager') ||
           error.stack?.includes('performTokenRefresh'));
        
        if (!isSessionExpired && !isTokenRefreshTimeout) {
          this.handleError(error, false, 'Console Error');
        }
        
        // For session expired errors, don't call original console.error to suppress the log
        if (isSessionExpired) {
          return; // Suppress the console.error call entirely
        }
      }

      // Call original console.error
      originalError.apply(console, args);
    };
  }

  /**
   * Handle an error (public method for external use)
   */
  handleError(error: Error, isFatal: boolean, context?: string) {
    // Suppress "Session expired" errors - they're expected after 30 days and handled gracefully
    const isSessionExpired = error.message === 'Session expired' || 
                             error.message?.includes('Session expired') ||
                             (error as any).status === 401 && error.message?.includes('Session expired');
    
    if (isSessionExpired) {
      // Don't log or queue session expired errors - they're expected behavior
      // The apiClient already handles logout, we just need to prevent unhandled rejections
      return;
    }

    const errorInfo: ErrorInfo = {
      error,
      isFatal,
      timestamp: Date.now(),
      context,
    };

    // Add to queue
    this.errorQueue.push(errorInfo);
    if (this.errorQueue.length > this.maxQueueSize) {
      this.errorQueue.shift();
    }

    // Log error
    console.error(`[${context || 'Error'}]`, {
      message: error.message,
      stack: error.stack,
      isFatal,
      timestamp: new Date(errorInfo.timestamp).toISOString(),
    });

    // In production, you might want to:
    // 1. Send to error reporting service (Sentry, Bugsnag, etc.)
    // 2. Show user-friendly error message
    // 3. Attempt recovery

    // For fatal errors, we might want to show a critical error screen
    if (isFatal) {
      // This will be handled by ErrorBoundary or a global error screen
      console.error('Fatal error occurred - app may crash');
    }
  }

  /**
   * Get error queue (for debugging)
   */
  getErrorQueue(): ErrorInfo[] {
    return [...this.errorQueue];
  }

  /**
   * Clear error queue
   */
  clearErrorQueue() {
    this.errorQueue = [];
  }

  /**
   * Wrap async function to catch unhandled rejections
   */
  wrapAsync<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    context?: string
  ): T {
    return ((...args: Parameters<T>) => {
      return fn(...args).catch((error: unknown) => {
        const errorObj = error instanceof Error 
          ? error 
          : new Error(String(error));
        
        this.handleError(
          errorObj,
          false,
          context || 'Async Function'
        );
        throw errorObj; // Re-throw to allow caller to handle
      });
    }) as T;
  }

  /**
   * Safe async wrapper that returns null on error
   */
  async safeAsync<T>(
    fn: () => Promise<T>,
    fallback?: T,
    context?: string
  ): Promise<T | null> {
    try {
      return await fn();
    } catch (error: unknown) {
      const errorObj = error instanceof Error 
        ? error 
        : new Error(String(error));
      
      this.handleError(
        errorObj,
        false,
        context || 'Safe Async'
      );
      return fallback !== undefined ? fallback : null;
    }
  }
}

// Export singleton instance
export const globalErrorHandler = new GlobalErrorHandler();

// Note: initialize() must be called explicitly in the app entry point (_layout.tsx)
// This prevents side effects on import and allows better control over initialization timing

