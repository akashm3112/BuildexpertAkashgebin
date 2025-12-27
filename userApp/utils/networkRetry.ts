
export interface NetworkRetryOptions {
  maxRetries?: number;
  retryDelay?: number;
  exponentialBackoff?: boolean;
  retryableStatusCodes?: number[];
  timeout?: number;
  onRetry?: (attempt: number, error: Error | Response) => void;
}

const DEFAULT_OPTIONS: Required<Omit<NetworkRetryOptions, 'timeout'>> & { timeout?: number } = {
  maxRetries: 3,
  retryDelay: 1000, // Initial delay in ms
  exponentialBackoff: true,
  retryableStatusCodes: [408, 429, 500, 502, 503, 504], // Timeout, Rate limit, Server errors
  timeout: 30000, // 30 seconds default timeout
  onRetry: () => {},
};

/**
 * Check if error is network-related and retryable
 */
const isRetryableError = (error: any, retryableStatusCodes: number[]): boolean => {
  // Network errors (no response)
  if (error instanceof TypeError && error.message.includes('Network request failed')) {
    return true;
  }
  
  // Timeout errors
  if (error instanceof Error && (error.message.includes('timeout') || error.message.includes('TIMEOUT'))) {
    return true;
  }
  
  // HTTP status codes
  if (error instanceof Response) {
    return retryableStatusCodes.includes(error.status);
  }
  
  // AbortController errors
  if (error instanceof Error && error.name === 'AbortError') {
    return false; // Don't retry aborted requests
  }
  
  return false;
};

/**
 * Calculate delay for retry with exponential backoff
 */
const calculateRetryDelay = (
  attempt: number,
  baseDelay: number,
  exponentialBackoff: boolean
): number => {
  if (!exponentialBackoff) {
    return baseDelay;
  }
  // Exponential backoff: 1s, 2s, 4s, 8s (max 10s)
  return Math.min(baseDelay * Math.pow(2, attempt), 10000);
};

/**
 * Create fetch with timeout
 */
const fetchWithTimeout = async (
  url: string,
  options: RequestInit,
  timeout: number
): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timeout');
    }
    throw error;
  }
};

/**
 * Retry wrapper for network requests
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retryOptions: NetworkRetryOptions = {}
): Promise<Response> {
  const opts = { ...DEFAULT_OPTIONS, ...retryOptions };
  let lastError: Error | Response | null = null;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, options, opts.timeout || 30000);
      
      // Check if response status is retryable
      if (!response.ok && opts.retryableStatusCodes.includes(response.status)) {
        lastError = response;
        
        // Don't retry on last attempt
        if (attempt === opts.maxRetries) {
          return response; // Return the error response
        }

        // Call retry callback
        opts.onRetry(attempt + 1, response);

        // Wait before retrying
        const delay = calculateRetryDelay(attempt, opts.retryDelay, opts.exponentialBackoff);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      // Success or non-retryable error
      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Check if error is retryable
      if (!isRetryableError(lastError, opts.retryableStatusCodes)) {
        throw lastError; // Don't retry non-retryable errors
      }

      // Don't retry on last attempt
      if (attempt === opts.maxRetries) {
        break;
      }

      // Call retry callback
      opts.onRetry(attempt + 1, lastError);

      // Wait before retrying
      const delay = calculateRetryDelay(attempt, opts.retryDelay, opts.exponentialBackoff);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // All retries exhausted
  if (lastError instanceof Response) {
    return lastError;
  }
  throw lastError || new Error('Network request failed after retries');
}

/**
 * Check if device has network connectivity
 * For local testing: Checks backend health endpoint instead of Google
 * This allows testing even without internet access, as long as backend is reachable
 */
export async function checkNetworkConnectivity(): Promise<boolean> {
  try {
    // Import API_BASE_URL dynamically to avoid circular dependencies
    const { API_BASE_URL } = await import('@/constants/api');
    
    // Check backend health endpoint instead of Google
    // This works for local testing scenarios where backend is accessible but internet might not be
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(`${API_BASE_URL}/health`, {
      method: 'GET',
      signal: controller.signal,
      cache: 'no-cache',
    });
    
    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    // If backend check fails, fallback to Google check (for production scenarios)
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      
      const response = await fetch('https://www.google.com/favicon.ico', {
        method: 'HEAD',
        signal: controller.signal,
        cache: 'no-cache',
      });
      
      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      return false;
    }
  }
}

/**
 * Get user-friendly network error message
 */
export function getNetworkErrorMessage(error: any): string {
  if (error instanceof TypeError && error.message.includes('Network request failed')) {
    return 'No internet connection. Please check your network and try again.';
  }
  
  if (error instanceof Error && error.message.includes('timeout')) {
    return 'Request timed out. Please check your connection and try again.';
  }
  
  if (error instanceof Response) {
    switch (error.status) {
      case 408:
        return 'Request timeout. Please try again.';
      case 429:
        return 'Too many requests. Please wait a moment and try again.';
      case 500:
      case 502:
      case 503:
      case 504:
        return 'Server error. Please try again in a moment.';
      default:
        return 'Network error occurred. Please try again.';
    }
  }
  
  return 'Network error. Please check your connection and try again.';
}

