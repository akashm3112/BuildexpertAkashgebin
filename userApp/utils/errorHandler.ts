/**
 * ============================================================================
 * UNIFIED ERROR HANDLING UTILITY
 * Purpose: Consistent error handling across all screens and API calls
 * Features: Error classification, user-friendly messages, logging
 * ============================================================================
 */

import { Alert } from 'react-native';

export interface ApiErrorResponse {
  status: 'error' | 'success';
  message: string;
  errorCode?: string;
  errorCategory?: string;
  errors?: Array<{ field: string; message: string }>;
  retryable?: boolean;
  retryAfter?: number;
  details?: any;
}

export enum ErrorCategory {
  NETWORK = 'NETWORK_ERROR',
  VALIDATION = 'VALIDATION_ERROR',
  AUTHENTICATION = 'AUTHENTICATION_ERROR',
  AUTHORIZATION = 'AUTHORIZATION_ERROR',
  NOT_FOUND = 'NOT_FOUND_ERROR',
  SERVER = 'SERVER_ERROR',
  UNKNOWN = 'UNKNOWN_ERROR'
}

export interface ErrorInfo {
  message: string;
  category: ErrorCategory;
  errorCode?: string;
  retryable: boolean;
  userMessage: string;
  originalError?: any;
}

/**
 * Classify error based on response status and error code
 */
export const classifyError = (error: any, response?: Response): ErrorInfo => {
  // Network errors (no response)
  if (!response) {
    if (error.message?.includes('Network request failed') || 
        error.message?.includes('fetch') ||
        error.code === 'NETWORK_ERROR') {
      return {
        message: 'Network request failed',
        category: ErrorCategory.NETWORK,
        errorCode: 'NETWORK_ERROR',
        retryable: true,
        userMessage: 'Unable to connect. Please check your internet connection and try again',
        originalError: error
      };
    }
    
    if (error.message?.includes('timeout') || error.code === 'TIMEOUT') {
      return {
        message: 'Request timeout',
        category: ErrorCategory.NETWORK,
        errorCode: 'TIMEOUT_ERROR',
        retryable: true,
        userMessage: 'This is taking longer than expected. Please try again',
        originalError: error
      };
    }
  }

  // HTTP status code errors
  if (response) {
    switch (response.status) {
      case 400:
        return {
          message: 'Bad request',
          category: ErrorCategory.VALIDATION,
          errorCode: 'VALIDATION_ERROR',
          retryable: false,
          userMessage: 'Please check the information you entered and try again',
          originalError: error
        };
      
      case 401:
        return {
          message: 'Unauthorized',
          category: ErrorCategory.AUTHENTICATION,
          errorCode: 'AUTHENTICATION_ERROR',
          retryable: false,
          userMessage: 'Your session has expired. Please sign in again to continue',
          originalError: error
        };
      
      case 403:
        return {
          message: 'Forbidden',
          category: ErrorCategory.AUTHORIZATION,
          errorCode: 'AUTHORIZATION_ERROR',
          retryable: false,
          userMessage: 'You don\'t have permission to perform this action',
          originalError: error
        };
      
      case 404:
        return {
          message: 'Not found',
          category: ErrorCategory.NOT_FOUND,
          errorCode: 'NOT_FOUND_ERROR',
          retryable: false,
          userMessage: 'The information you\'re looking for is not available',
          originalError: error
        };
      
      case 429:
        return {
          message: 'Too many requests',
          category: ErrorCategory.NETWORK,
          errorCode: 'RATE_LIMIT_ERROR',
          retryable: true,
          userMessage: 'Too many requests. Please wait a moment and try again',
          originalError: error
        };
      
      case 500:
      case 502:
      case 503:
      case 504:
        return {
          message: 'Server error',
          category: ErrorCategory.SERVER,
          errorCode: 'SERVER_ERROR',
          retryable: true,
          userMessage: 'Something went wrong on our end. Please try again in a moment',
          originalError: error
        };
    }
  }

  // Try to parse API error response
  if (error && typeof error === 'object' && 'status' in error) {
    const apiError = error as ApiErrorResponse;
    if (apiError.status === 'error') {
      return {
        message: apiError.message || 'An error occurred',
        category: apiError.errorCategory as ErrorCategory || ErrorCategory.UNKNOWN,
        errorCode: apiError.errorCode,
        retryable: apiError.retryable || false,
        userMessage: apiError.message || 'An error occurred. Please try again.',
        originalError: error
      };
    }
  }

  // Default unknown error
  return {
    message: error?.message || 'An unexpected error occurred',
    category: ErrorCategory.UNKNOWN,
    errorCode: 'UNKNOWN_ERROR',
    retryable: false,
        userMessage: 'Something unexpected happened. Please try again',
    originalError: error
  };
};

/**
 * Parse error from API response
 */
export const parseApiError = async (response: Response): Promise<ApiErrorResponse> => {
  try {
    const data = await response.json();
    return {
      status: data.status || 'error',
      message: data.message || 'An error occurred',
      errorCode: data.errorCode,
      errorCategory: data.errorCategory,
      errors: data.errors,
      retryable: data.retryable,
      retryAfter: data.retryAfter,
      details: data.details
    };
  } catch (parseError) {
    // Log parse error but don't swallow it - return a structured error
    console.error('Failed to parse API error response:', parseError);
    return {
      status: 'error',
      message: `Server error (${response.status})`,
      errorCode: `HTTP_${response.status}`,
      errorCategory: response.status >= 500 ? ErrorCategory.SERVER : ErrorCategory.UNKNOWN
    };
  }
};

/**
 * Handle error and show user-friendly message
 * NEVER swallows errors - always logs and optionally shows UI
 */
export const handleError = async (
  error: any,
  response?: Response,
  options?: {
    showAlert?: boolean;
    onError?: (errorInfo: ErrorInfo) => void;
    customMessage?: string;
    context?: string; // Additional context for logging
    logError?: boolean; // Whether to log (default: true)
  }
): Promise<ErrorInfo> => {
  const errorInfo = classifyError(error, response);
  
  // Always log error for debugging (unless explicitly disabled)
  if (options?.logError !== false) {
    const logContext = options?.context ? `[${options.context}] ` : '';
    console.error(`${logContext}Error occurred:`, {
      message: errorInfo.message,
      category: errorInfo.category,
      errorCode: errorInfo.errorCode,
      context: options?.context,
      originalError: errorInfo.originalError,
      stack: errorInfo.originalError?.stack
    });
  }

  // Call custom error handler if provided
  if (options?.onError) {
    try {
      options.onError(errorInfo);
    } catch (handlerError) {
      // Don't let error handler errors break the flow
      console.error('Error in custom error handler:', handlerError);
    }
  }

  // Show alert if requested (default: true)
  if (options?.showAlert !== false) {
    try {
      const message = options?.customMessage || errorInfo.userMessage;
      Alert.alert('Error', message, [{ text: 'OK' }]);
    } catch (alertError) {
      // If alert fails, at least log it
      console.error('Failed to show error alert:', alertError);
    }
  }

  return errorInfo;
};

/**
 * Handle API error response
 */
export const handleApiError = async (
  response: Response,
  options?: {
    showAlert?: boolean;
    onError?: (errorInfo: ErrorInfo) => void;
    customMessage?: string;
  }
): Promise<ErrorInfo> => {
  const apiError = await parseApiError(response);
  
  // Create error object from API response
  const error = {
    status: apiError.status,
    message: apiError.message,
    errorCode: apiError.errorCode,
    errorCategory: apiError.errorCategory,
    errors: apiError.errors
  };

  return handleError(error, response, options);
};

/**
 * Safe API call wrapper with unified error handling
 * NEVER swallows errors - always returns error info
 */
export const safeApiCall = async <T>(
  apiCall: () => Promise<Response>,
  options?: {
    showAlert?: boolean;
    onError?: (errorInfo: ErrorInfo) => void;
    customMessage?: string;
    context?: string;
    logError?: boolean;
  }
): Promise<{ success: boolean; data?: T; error?: ErrorInfo }> => {
  try {
    const response = await apiCall();
    
    if (!response.ok) {
      const errorInfo = await handleApiError(response, options);
      return { success: false, error: errorInfo };
    }

    try {
      const data = await response.json();
      return { success: true, data: data.data || data };
    } catch (parseError) {
      // JSON parse error - still return error info, don't swallow
      const errorInfo = await handleError(
        new Error('Failed to parse response'),
        response,
        { ...options, context: options?.context || 'safeApiCall.parse' }
      );
      return { success: false, error: errorInfo };
    }
  } catch (error) {
    // NEVER swallow errors - always handle and return
    const errorInfo = await handleError(error, undefined, {
      ...options,
      context: options?.context || 'safeApiCall'
    });
    return { success: false, error: errorInfo };
  }
};

/**
 * Wrap async function with standardized error handling
 * Use this for all async functions that might throw
 */
export const withErrorHandling = <T extends (...args: any[]) => Promise<any>>(
  fn: T,
  options?: {
    context?: string;
    onError?: (error: ErrorInfo) => void;
    showAlert?: boolean;
    logError?: boolean;
  }
): T => {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      // Always handle errors - never swallow
      const errorInfo = await handleError(error, undefined, {
        context: options?.context || fn.name || 'withErrorHandling',
        onError: options?.onError,
        showAlert: options?.showAlert,
        logError: options?.logError
      });
      
      // Re-throw as a standardized error so caller can handle if needed
      const standardizedError = new Error(errorInfo.message);
      (standardizedError as any).errorInfo = errorInfo;
      throw standardizedError;
    }
  }) as T;
};

/**
 * Safe async wrapper that returns result or null on error
 * Use when you want to gracefully handle errors without throwing
 */
export const safeAsync = async <T>(
  fn: () => Promise<T>,
  options?: {
    context?: string;
    defaultValue?: T;
    onError?: (error: ErrorInfo) => void;
    logError?: boolean;
  }
): Promise<T | null> => {
  try {
    return await fn();
  } catch (error) {
    // Handle error but return default value instead of throwing
    await handleError(error, undefined, {
      context: options?.context || 'safeAsync',
      onError: options?.onError,
      showAlert: false, // Don't show alert for safe operations
      logError: options?.logError
    });
    return options?.defaultValue ?? null;
  }
};

