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
  private originalConsoleError: typeof console.error | null = null; // Store original console.error to prevent circular calls

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
                                 (event.reason as any)?.status === 401 && error.message?.includes('Session expired');
        
        // Check if this is a database/server error (500) - backend issue, not user's fault
        const isServerError = (event.reason as any)?.status === 500 || 
                             (event.reason as any)?.isServerError === true ||
                             error.message?.includes('Database operation failed') ||
                             error.message?.includes('Database') ||
                             (event.reason as any)?.data?.errorCode === 'DATABASE_ERROR' ||
                             (event.reason as any)?.data?.originalError?.includes('column') ||
                             (event.reason as any)?.data?.originalError?.includes('does not exist');
        
        // Check if error is marked as suppressed or handled
        const isSuppressed = (event.reason as any)?._suppressUnhandled === true ||
                            (event.reason as any)?._handled === true;
        
        if (isSessionExpired || isServerError || isSuppressed) {
          // Suppress these errors completely - prevent default logging
          event.preventDefault();
          event.stopPropagation();
          return; // Don't log or handle - just suppress
        }
        
        if (!isSessionExpired && !isServerError && !isSuppressed) {
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
                                 (error as any).status === 401 && error.message?.includes('Session expired');
        
        // Check if this is a database/server error (500) - backend issue, not user's fault
        const isServerError = (error as any)?.status === 500 || 
                             (error as any)?.isServerError === true ||
                             error.message?.includes('Database operation failed') ||
                             error.message?.includes('Database') ||
                             (error as any)?.data?.errorCode === 'DATABASE_ERROR' ||
                             (error as any)?.data?.originalError?.includes('column') ||
                             (error as any)?.data?.originalError?.includes('does not exist');
        
        // Check if error is marked as suppressed or handled
        const isSuppressed = (error as any)?._suppressUnhandled === true ||
                            (error as any)?._handled === true;
        
        if (!isSessionExpired && !isServerError && !isSuppressed) {
          // Log the error
          this.handleError(error, isFatal || false, 'JavaScript Error');
        }

        // Call original handler if it exists (but suppress console output for suppressed errors)
        if (originalHandler) {
          if (!isSessionExpired && !isServerError && !isSuppressed) {
            originalHandler(error, isFatal);
          }
          // For suppressed errors, we don't call the handler - just suppress
        }
      });
    }
  }

  /**
   * Setup handler for console errors
   */
  private setupConsoleErrorHandler() {
    // Store original console.error to prevent circular calls
    this.originalConsoleError = console.error;

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
                                 (errorArg as any).status === 401 && error.message?.includes('Session expired');
        
        // Check if this is a database/server error (500) - backend issue, not user's fault
        const isServerError = (errorArg as any)?.status === 500 || 
                             (errorArg as any)?.isServerError === true ||
                             error.message?.includes('Database operation failed') ||
                             error.message?.includes('Database') ||
                             (errorArg as any)?.data?.errorCode === 'DATABASE_ERROR' ||
                             (errorArg as any)?.data?.originalError?.includes('column') ||
                             (errorArg as any)?.data?.originalError?.includes('does not exist');
        
        // Check if error is marked as suppressed or handled
        const isSuppressed = (errorArg as any)?._suppressUnhandled === true ||
                            (errorArg as any)?._handled === true;
        
        // Suppress timeout errors during signup/login flows
        const isTokenRefreshTimeout = error.message.includes('timeout') && 
          (error.message.includes('refreshing token') || 
           error.stack?.includes('tokenManager') ||
           error.stack?.includes('performTokenRefresh'));
        
        // Suppress Metro bundler errors (InternalBytecode.js not found - harmless development issue)
        const isMetroBundlerError = error.message.includes('ENOENT') &&
                                    (error.message.includes('InternalBytecode.js') ||
                                     error.stack?.includes('InternalBytecode.js') ||
                                     error.message.includes('no such file or directory'));
        
        if (!isSessionExpired && !isServerError && !isSuppressed && !isTokenRefreshTimeout && !isMetroBundlerError) {
          this.handleError(error, false, 'Console Error');
        }
        
        // For Metro bundler errors, suppress completely (harmless development issue)
        if (isMetroBundlerError) {
          return; // Suppress the console.error call entirely
        }
        
        // For session expired, server errors, or suppressed errors, don't call original console.error
        if (isSessionExpired || isServerError || isSuppressed) {
          return; // Suppress the console.error call entirely
        }
      }

      // Call original console.error (use stored reference to prevent circular calls)
      if (this.originalConsoleError) {
        this.originalConsoleError.apply(console, args);
      }
    };
  }

  /**
   * Handle an error (public method for external use)
   * IMPORTANT: This method uses originalConsoleError to prevent circular calls
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

    // CRITICAL: Use originalConsoleError to prevent circular calls
    // If we used console.error here, it would call our overridden version,
    // which would call handleError again, creating an infinite loop
    const logError = this.originalConsoleError;
    
    if (!logError) {
      // Fallback: If originalConsoleError is not set (shouldn't happen), 
      // use a try-catch to prevent infinite loops
      try {
        // Use native console.error directly (bypass our override)
        const nativeError = (console as any).__originalError || console.error;
        nativeError(`[${context || 'Error'}]`, {
          message: error.message,
          stack: error.stack,
          isFatal,
          timestamp: new Date(errorInfo.timestamp).toISOString(),
        });
      } catch {
        // If even that fails, silently ignore to prevent crash
      }
      return;
    }
    
    // Use original console.error (bypasses our override, prevents circular calls)
    try {
      logError.call(console, `[${context || 'Error'}]`, {
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
        logError.call(console, 'Fatal error occurred - app may crash');
      }
    } catch (logErr) {
      // If logging itself fails, silently ignore to prevent infinite loops
      // This should never happen, but is a safety measure
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
