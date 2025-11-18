import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '@/constants/api';
import { tokenManager } from './tokenManager';
import { handleError, handleApiError, safeApiCall, ErrorInfo } from './errorHandler';
import { globalErrorHandler } from './globalErrorHandler';
import { requestQueue, RequestPriority } from './requestQueue';
import { frontendMonitor } from './monitoring';

// Global logout function - will be set by the app
let globalLogout: (() => Promise<void>) | null = null;

export const setGlobalLogout = (logoutFn: () => Promise<void>) => {
  globalLogout = logoutFn;
};

const apiRequestImpl = async (
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> => {
  const startTime = Date.now();
  
  try {
    const token = await tokenManager.getValidToken();
    
    const headers = {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
      ...options.headers,
    };

    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers,
      });
      
      // Record API call performance
      const duration = Date.now() - startTime;
      frontendMonitor.recordPerformance(
        `api.${options.method || 'GET'}.${endpoint}`,
        duration,
        'ms',
        { statusCode: response.status }
      );
    } catch (fetchError) {
      // Check if it's a network error (offline)
      const isNetworkError = fetchError instanceof TypeError && 
        (fetchError.message.includes('Network request failed') || 
         fetchError.message.includes('Failed to fetch'));
      
      if (isNetworkError) {
        // Determine priority based on endpoint
        const priority = getRequestPriority(endpoint, options.method || 'GET');
        
        // Queue the request for retry when network is restored
        const requestId = await requestQueue.enqueue(
          endpoint,
          options,
          priority,
          { originalError: fetchError.message }
        );
        
        console.log(`📴 Network offline, queued request: ${endpoint} (ID: ${requestId})`);
        
        // Use unified error handler
        await handleError(fetchError, undefined, { showAlert: false });
        
        // Throw error to let caller know request was queued
        throw new Error(`Request queued (offline): ${requestId}`);
      }
      
      // Other errors - use unified error handler
      await handleError(fetchError, undefined, { showAlert: false });
      throw fetchError;
    }

    // Handle 401 errors globally - try to refresh token first
    if (response.status === 401) {
      // Try to refresh the token
      const refreshedToken = await tokenManager.forceRefreshToken();
      if (refreshedToken) {
        // Retry the request with the new token
        const retryHeaders = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${refreshedToken}`,
          ...options.headers,
        };
        try {
          response = await fetch(`${API_BASE_URL}${endpoint}`, {
            ...options,
            headers: retryHeaders,
          });
        } catch (retryError) {
          await handleError(retryError, undefined, { showAlert: false });
          throw retryError;
        }
      } else {
        // If refresh failed, logout
        if (globalLogout) {
          await globalLogout();
        }
        // Handle 401 error with unified error handler
        await handleApiError(response, { showAlert: false });
        throw new Error('Authentication failed');
      }
    }

    // Log non-2xx responses for debugging (but don't throw - let caller handle)
    if (!response.ok) {
      // Record error in monitoring
      frontendMonitor.recordError(
        new Error(`API Error: ${response.status} ${response.statusText}`),
        `api.${options.method || 'GET'}.${endpoint}`,
        { statusCode: response.status, endpoint }
      );
      await handleApiError(response, { showAlert: false });
    }

    return response;
  } catch (error) {
    // Use unified error handler for logging
    await handleError(error, undefined, { showAlert: false });
    throw error;
  }
};

// Wrap with error handler to catch unhandled rejections
export const apiRequest = globalErrorHandler.wrapAsync(apiRequestImpl, 'API Request');

/**
 * Enhanced API request with unified error handling
 */
export const apiRequestWithErrorHandling = async (
  endpoint: string,
  options: RequestInit = {},
  errorOptions?: {
    showAlert?: boolean;
    onError?: (errorInfo: ErrorInfo) => void;
    customMessage?: string;
  }
): Promise<{ success: boolean; response?: Response; error?: ErrorInfo }> => {
  return safeApiCall(
    async () => {
      const token = await tokenManager.getValidToken();
      
      const headers = {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` }),
        ...options.headers,
      };

      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers,
      });

      // Handle 401 errors globally - try to refresh token first
      if (response.status === 401) {
        const refreshedToken = await tokenManager.forceRefreshToken();
        if (refreshedToken) {
          const retryHeaders = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${refreshedToken}`,
            ...options.headers,
          };
          return await fetch(`${API_BASE_URL}${endpoint}`, {
            ...options,
            headers: retryHeaders,
          });
        }
        
        if (globalLogout) {
          await globalLogout();
        }
      }

      return response;
    },
    errorOptions
  );
};

/**
 * Determine request priority based on endpoint and method
 */
function getRequestPriority(endpoint: string, method: string): RequestPriority {
  // Critical: Login, payment, critical updates
  if (
    endpoint.includes('/auth/login') ||
    endpoint.includes('/auth/signup') ||
    endpoint.includes('/auth/verify-otp') ||
    endpoint.includes('/payment') ||
    endpoint.includes('/payments')
  ) {
    return RequestPriority.CRITICAL;
  }
  
  // High: Bookings, notifications, user actions
  if (
    endpoint.includes('/bookings') ||
    endpoint.includes('/notifications') ||
    endpoint.includes('/reports') ||
    method === 'POST' || method === 'PUT'
  ) {
    return RequestPriority.HIGH;
  }
  
  // Low: Analytics, non-critical updates
  if (
    endpoint.includes('/analytics') ||
    endpoint.includes('/stats') ||
    method === 'GET' && endpoint.includes('/search')
  ) {
    return RequestPriority.LOW;
  }
  
  // Normal: Everything else
  return RequestPriority.NORMAL;
}

/**
 * Queue a request with explicit priority
 */
export async function apiRequestWithPriority(
  endpoint: string,
  options: RequestInit = {},
  priority: RequestPriority = RequestPriority.NORMAL
): Promise<Response> {
  // Try normal request first
  try {
    return await apiRequest(endpoint, options);
  } catch (error: any) {
    // If it's a queued error, re-throw
    if (error.message?.includes('Request queued')) {
      throw error;
    }
    
    // For network errors, queue with explicit priority
    const isNetworkError = error instanceof TypeError && 
      (error.message.includes('Network request failed') || 
       error.message.includes('Failed to fetch'));
    
    if (isNetworkError) {
      const requestId = await requestQueue.enqueue(
        endpoint,
        options,
        priority,
        { originalError: error.message }
      );
      throw new Error(`Request queued (offline): ${requestId}`);
    }
    
    throw error;
  }
}

// Convenience methods
export const apiGet = (endpoint: string) => apiRequest(endpoint);
export const apiPost = (endpoint: string, data?: any, priority?: RequestPriority) => {
  const options: RequestInit = {
    method: 'POST',
    body: data ? JSON.stringify(data) : undefined,
  };
  return priority !== undefined 
    ? apiRequestWithPriority(endpoint, options, priority)
    : apiRequest(endpoint, options);
};
export const apiPut = (endpoint: string, data?: any, priority?: RequestPriority) => {
  const options: RequestInit = {
    method: 'PUT',
    body: data ? JSON.stringify(data) : undefined,
  };
  return priority !== undefined 
    ? apiRequestWithPriority(endpoint, options, priority)
    : apiRequest(endpoint, options);
};
export const apiDelete = (endpoint: string) => 
  apiRequest(endpoint, { method: 'DELETE' });
