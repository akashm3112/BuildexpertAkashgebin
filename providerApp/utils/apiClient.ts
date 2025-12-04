import { API_BASE_URL } from '@/constants/api';
import { tokenManager } from './tokenManager';

// -------------------- TYPES --------------------
export interface ApiError {
  message: string;
  status?: number;
  code?: string;
  data?: any;
  isNetworkError: boolean;
  isTimeout: boolean;
  isServerError: boolean;
  isClientError: boolean;
}

export interface RequestConfig extends RequestInit {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  skipAuth?: boolean;
  skipErrorHandling?: boolean;
  allowDedup?: boolean; // Allow deduplication for non-GET methods
}

export interface ApiResponse<T = any> {
  data: T;
  status: number;
  headers: Headers;
  ok: boolean;
}

// -------------------- GLOBAL HANDLERS --------------------
let globalErrorHandler: ((error: ApiError) => void) | null = null;
let globalLogout: (() => Promise<void>) | null = null;

export const setGlobalErrorHandler = (handler: (error: ApiError) => void) => {
  globalErrorHandler = handler;
};

export const setGlobalLogout = (logoutFn: () => Promise<void>) => {
  globalLogout = logoutFn;
};

let isLoggingOut = false;

// -------------------- CONSTANTS --------------------
const DEFAULT_TIMEOUT = 30000; // 30s
const DEFAULT_RETRIES = 3;
const DEFAULT_RETRY_DELAY = 1000; // 1s

const RETRYABLE_STATUS_CODES = [408, 429, 500, 502, 503, 504];
const RETRYABLE_ERROR_CODES = ['ECONNABORTED', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNRESET'];
const UNSAFE_HTTP_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

// Rate limiting: max requests per window
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 100; // max requests per window
const RATE_LIMIT_MAX_ENTRIES = 1000; // Max entries in rate limit store (LRU)
const GLOBAL_RATE_LIMIT_MAX_REQUESTS = 1000; // Global cap across all endpoints

// Request deduplication cache TTL
const DEDUP_CACHE_TTL = 5000; // 5 seconds
const DEDUP_CACHE_MAX_ENTRIES = 500; // Max entries in dedup cache (LRU)

// Unified cleanup interval
const CLEANUP_INTERVAL = 30000; // 30 seconds

// -------------------- RATE LIMITING --------------------
interface RateLimitEntry {
  count: number;
  resetAt: number;
  lastAccess: number; // For LRU eviction
}

const rateLimitStore = new Map<string, RateLimitEntry>();
let globalRequestCount = 0;
let globalResetAt = Date.now() + RATE_LIMIT_WINDOW;

// Extract endpoint path from URL for rate limiting
const getEndpointKey = (url: string): string => {
  try {
    const urlObj = new URL(url);
    // Use pathname as endpoint key (e.g., /api/users, /api/auth/login)
    return urlObj.pathname;
  } catch {
    // If URL parsing fails, use the full URL
    return url;
  }
};

// LRU eviction for rate limit store
const evictLRUFromRateLimit = (): void => {
  if (rateLimitStore.size <= RATE_LIMIT_MAX_ENTRIES) return;
  
  const entries = Array.from(rateLimitStore.entries());
  entries.sort((a, b) => a[1].lastAccess - b[1].lastAccess);
  
  // Remove oldest 10% of entries
  const toRemove = Math.ceil(rateLimitStore.size * 0.1);
  for (let i = 0; i < toRemove; i++) {
    rateLimitStore.delete(entries[i][0]);
  }
};

const checkRateLimit = (endpoint: string, method: string): boolean => {
  const now = Date.now();
  
  // Check global rate limit
  if (now > globalResetAt) {
    globalRequestCount = 0;
    globalResetAt = now + RATE_LIMIT_WINDOW;
  }
  
  if (globalRequestCount >= GLOBAL_RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }
  
  // Per-endpoint rate limiting: endpoint:method
  const key = `${endpoint}:${method}`;
  const entry = rateLimitStore.get(key);
  
  if (!entry || now > entry.resetAt) {
    // Evict if needed before adding new entry
    if (rateLimitStore.size >= RATE_LIMIT_MAX_ENTRIES) {
      evictLRUFromRateLimit();
    }
    rateLimitStore.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW, lastAccess: now });
    globalRequestCount++;
    return true;
  }
  
  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    entry.lastAccess = now; // Update access time
    return false;
  }
  
  entry.count++;
  entry.lastAccess = now;
  globalRequestCount++;
  return true;
};

// -------------------- REQUEST DEDUPLICATION --------------------
interface DedupCacheEntry<T> {
  promise: Promise<ApiResponse<T>>;
  timestamp: number;
  expiresAt: number; // Atomic expiration time
}

const dedupCache = new Map<string, DedupCacheEntry<any>>();

const getRequestKey = (url: string, method: string, body?: any): string => {
  // Only deduplicate GET requests or requests with identical bodies
  if (method === 'GET') {
    return `${method}:${url}`;
  }
  // For other methods, include body hash for deduplication
  if (body) {
    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
    return `${method}:${url}:${bodyStr}`;
  }
  return `${method}:${url}`;
};

// LRU eviction for dedup cache
const evictLRUFromDedup = (): void => {
  if (dedupCache.size <= DEDUP_CACHE_MAX_ENTRIES) return;
  
  const entries = Array.from(dedupCache.entries());
  entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
  
  // Remove oldest 10% of entries
  const toRemove = Math.ceil(dedupCache.size * 0.1);
  for (let i = 0; i < toRemove; i++) {
    dedupCache.delete(entries[i][0]);
  }
};

const getDedupedRequest = <T>(key: string, allowDedup: boolean, method: string): Promise<ApiResponse<T>> | null => {
  // Only dedupe GET/HEAD by default, or if explicitly allowed
  if (!allowDedup && method !== 'GET' && method !== 'HEAD') {
    return null;
  }
  
  const entry = dedupCache.get(key);
  if (!entry) return null;
  
  // Atomic check using expiresAt (set at creation time)
  const now = Date.now();
  if (now > entry.expiresAt) {
    dedupCache.delete(key);
    return null;
  }
  
  return entry.promise;
};

const setDedupedRequest = <T>(key: string, promise: Promise<ApiResponse<T>>, allowDedup: boolean, method: string): void => {
  // Only cache GET/HEAD by default, or if explicitly allowed
  if (!allowDedup && method !== 'GET' && method !== 'HEAD') {
    return;
  }
  
  const now = Date.now();
  // Set expiration time atomically at creation
  const expiresAt = now + DEDUP_CACHE_TTL;
  
  // Evict if needed before adding new entry
  if (dedupCache.size >= DEDUP_CACHE_MAX_ENTRIES) {
    evictLRUFromDedup();
  }
  
  dedupCache.set(key, { promise, timestamp: now, expiresAt });
  
  // Cleanup after promise resolves/rejects (atomic deletion)
  promise.finally(() => {
    // Use expiresAt check to prevent race conditions
    const entry = dedupCache.get(key);
    if (entry && Date.now() > entry.expiresAt) {
      dedupCache.delete(key);
    }
  });
};

// -------------------- UNIFIED CLEANUP --------------------
// Single cleanup interval for both rate limit and dedup cache
setInterval(() => {
  const now = Date.now();
  
  // Cleanup expired rate limit entries
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetAt) {
      rateLimitStore.delete(key);
    }
  }
  
  // Cleanup expired dedup cache entries (atomic check)
  for (const [key, entry] of dedupCache.entries()) {
    if (now > entry.expiresAt) {
      dedupCache.delete(key);
    }
  }
  
  // Reset global counter if window expired
  if (now > globalResetAt) {
    globalRequestCount = 0;
    globalResetAt = now + RATE_LIMIT_WINDOW;
  }
}, CLEANUP_INTERVAL);

// -------------------- TOKEN REFRESH QUEUE --------------------
let tokenRefreshPromise: Promise<string | null> | null = null;
const tokenRefreshQueue: Array<{
  resolve: (token: string | null) => void;
  reject: (error: any) => void;
}> = [];

const queueTokenRefresh = async (forceRefresh: boolean = false): Promise<string | null> => {
  // If refresh is already in progress, queue this request (even for force refresh to prevent duplicates)
  // This prevents multiple simultaneous refresh calls which can cause race conditions
  if (tokenRefreshPromise) {
    // If force refresh is requested but a refresh is already in progress,
    // queue the request to wait for the current refresh to complete
    // This prevents duplicate refresh calls and race conditions
    return new Promise<string | null>((resolve, reject) => {
      tokenRefreshQueue.push({ resolve, reject });
    });
  }
  
  // Start refresh (force refresh if requested)
  const refreshFn = forceRefresh 
    ? tokenManager.forceRefreshToken()
    : tokenManager.getValidToken();
  
  tokenRefreshPromise = refreshFn.catch((error: any) => {
    // If refresh fails, reject all queued requests
    tokenRefreshQueue.forEach(({ reject }) => reject(error));
    tokenRefreshQueue.length = 0;
    throw error;
  });
  
  try {
    const token = await tokenRefreshPromise;
    // Resolve all queued requests
    tokenRefreshQueue.forEach(({ resolve }) => resolve(token));
    tokenRefreshQueue.length = 0;
    return token;
  } finally {
    tokenRefreshPromise = null;
  }
};

// -------------------- UTILS --------------------
const isFormData = (body: any): body is FormData => body instanceof FormData;

const joinUrl = (base: string, endpoint: string): string => {
  const baseTrimmed = base.replace(/\/+$/, '');
  const endpointTrimmed = endpoint.replace(/^\/+/, '');
  return `${baseTrimmed}/${endpointTrimmed}`;
};

// Normalize URL with query parameters
const normalizeUrl = (url: string): string => {
  try {
    const urlObj = new URL(url);
    // Sort query parameters for consistency
    const sortedParams = new URLSearchParams();
    urlObj.searchParams.sort();
    for (const [key, value] of urlObj.searchParams.entries()) {
      sortedParams.append(key, value);
    }
    urlObj.search = sortedParams.toString();
    return urlObj.toString();
  } catch {
    // If URL parsing fails, return as-is
    return url;
  }
};

// Merge multiple AbortSignals (simplified, race-safe)
const mergeAbortSignals = (...signals: (AbortSignal | null | undefined)[]): AbortSignal | undefined => {
  const validSignals = signals.filter((s): s is AbortSignal => s !== null && s !== undefined);
  if (validSignals.length === 0) return undefined;
  if (validSignals.length === 1) return validSignals[0];
  
  // Check if any signal is already aborted
  for (const signal of validSignals) {
    if (signal.aborted) {
      return signal; // Return aborted signal immediately
    }
  }
  
  // Use AbortSignal.any() if available (modern browsers)
  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any(validSignals);
  }
  
  // Fallback: manual merge for older browsers (race-safe)
  const controller = new AbortController();
  let aborted = false;
  
  const abort = () => {
    if (!aborted) {
      aborted = true;
      controller.abort();
    }
  };
  
  validSignals.forEach(signal => {
    // Double-check aborted state
    if (signal.aborted) {
      abort();
    } else {
      signal.addEventListener('abort', abort, { once: true });
    }
  });
  
  return controller.signal;
};

const normalizeError = (error: any, response?: Response): ApiError => {
  const message = error?.message || 'An unexpected error occurred';
  const code = error?.code;

  const isNetworkError =
    message.includes('Network request failed') ||
    message.includes('Failed to fetch') ||
    message.includes('ECONNREFUSED') ||
    message.includes('ENOTFOUND') ||
    code === 'NETWORK_ERROR' ||
    message.includes('CORS') ||
    message.includes('Cross-Origin') ||
    message.includes('Access-Control');

  const isTimeout =
    error?.name === 'AbortError' ||
    code === 'TIMEOUT' ||
    message.toLowerCase().includes('timeout') ||
    message.includes('ETIMEDOUT');

  const status = response?.status || error?.status;
  const isServerError = status ? status >= 500 && status < 600 : false;
  const isClientError = status ? status >= 400 && status < 500 : false;

  return {
    message,
    status,
    code,
    data: error?.data,
    isNetworkError,
    isTimeout,
    isServerError,
    isClientError,
  };
};

const isRetryable = (error: ApiError, attempt: number, maxRetries: number, method?: string): boolean => {
  if (attempt >= maxRetries) return false;

  // Don't retry unsafe methods on client errors except 408/429
  if (method && UNSAFE_HTTP_METHODS.includes(method.toUpperCase())) {
    if (error.isClientError && ![408, 429].includes(error.status!)) return false;
  }

  if (error.isNetworkError || error.isTimeout) return true;
  if (error.status && RETRYABLE_STATUS_CODES.includes(error.status)) return true;
  if (error.code && RETRYABLE_ERROR_CODES.includes(error.code)) return true;

  return false;
};

// Exponential backoff with jitter
const calculateRetryDelay = (attempt: number, baseDelay: number, retryAfter?: number): number => {
  // If server specifies retry-after, use it (with a minimum)
  if (retryAfter && retryAfter > 0) {
    return Math.max(retryAfter * 1000, baseDelay); // Convert seconds to ms
  }
  const exponential = baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * baseDelay;
  return exponential + jitter;
};

const prepareBody = (data: any): string | FormData | Blob | undefined => {
  if (data === undefined || data === null) return undefined;
  if (isFormData(data)) return data;
  if (data instanceof Blob) return data;
  if (typeof data === 'string') return data;
  return JSON.stringify(data);
};

// Parse response body (extracted to reduce duplication)
const parseResponseBody = async (response: Response): Promise<any> => {
  const contentType = response.headers.get('content-type') || '';
  const contentLength = response.headers.get('content-length');
  
  // Handle empty responses
  if (contentLength === '0' || response.status === 204) {
    return null;
  }
  
  // Handle JSON responses
  if (contentType.includes('application/json')) {
    try {
      const text = await response.text();
      return text.trim() ? JSON.parse(text) : null;
    } catch (jsonError: any) {
      // Only throw parse error if response is not ok
      if (!response.ok) {
        throw normalizeError({ 
          message: 'Failed to parse JSON response', 
          code: 'PARSE_ERROR', 
          data: jsonError.message 
        }, response);
      }
      // For successful responses with invalid JSON, return null
      return null;
    }
  }
  
  // Handle binary/blob responses
  if (contentType.includes('application/octet-stream') || 
      contentType.includes('image/') || 
      contentType.includes('application/pdf')) {
    return await response.blob();
  }
  
  // Handle text responses
  if (contentType.includes('text/')) {
    return await response.text();
  }
  
  // Default: try text, fallback to null
  try {
    return await response.text();
  } catch {
    return null;
  }
};

// -------------------- INTERCEPTORS --------------------
const requestInterceptor = async (config: RequestConfig, forceTokenRefresh: boolean = false): Promise<RequestConfig> => {
  const headers = new Headers(config.headers);

  // Don't set Content-Type for FormData or Blob (browser will set it with boundary)
  if (config.body && !headers.has('Content-Type')) {
    if (!isFormData(config.body) && !(config.body instanceof Blob)) {
      headers.set('Content-Type', 'application/json');
    }
  }

  if (!config.skipAuth) {
    try {
      // Use queued token refresh to prevent multiple simultaneous refreshes
      const token = await queueTokenRefresh(forceTokenRefresh);
      if (token) headers.set('Authorization', `Bearer ${token}`);
    } catch (tokenError) {
      // If token retrieval fails, continue without token (will get 401)
      console.warn('Failed to get auth token:', tokenError);
    }
  }

  return { ...config, headers };
};

const responseInterceptor = async <T>(response: Response, config: RequestConfig, retryWithRefresh: (token?: string) => Promise<ApiResponse<T>>): Promise<ApiResponse<T>> => {
  if (response.status === 401 && !config.skipErrorHandling && !isLoggingOut) {
    // Try to refresh token and retry once (silent refresh)
    if (!config.skipAuth) {
      try {
        // CRITICAL: Invalidate token cache BEFORE refresh to prevent using stale tokens
        // This ensures that if multiple requests are refreshing simultaneously,
        // they all get the new token, not a cached old one
        tokenManager.invalidateCache();
        
        // Force refresh token on 401
        const refreshedToken = await queueTokenRefresh(true);
        if (refreshedToken) {
          // Retry the request with new token (silent retry)
          // IMPORTANT: Pass the refreshed token directly to retryWithRefresh
          // This ensures we use the exact token that was just refreshed, not a potentially stale one
          const retryResult = await retryWithRefresh(refreshedToken);
          // If retry succeeds, return result (no error shown)
          if (retryResult.ok) {
            return retryResult;
          }
          // If retry still 401, refresh token expired (30 days)
          if (retryResult.status === 401) {
            // Refresh token expired - logout silently
            if (globalLogout) {
              isLoggingOut = true;
              try {
                await globalLogout();
              } catch (err) {
                console.error('Logout error', err);
              } finally {
                setTimeout(() => { isLoggingOut = false; }, 1000);
              }
            }
            // Don't throw error - logout handles navigation
            throw normalizeError({ message: 'Session expired', status: 401 }, response);
          }
          return retryResult;
        } else {
          // Refresh token returned null - this can happen if:
          // 1. Refresh token expired (30 days) - logout
          // 2. Backend is down/restarting - don't logout, just return error (will retry when backend is back)
          // 3. Network error - don't logout, just return error (will retry when network is back)
          
          // Check if it's a network error or backend down scenario
          // If refresh token is expired, we should logout
          // But if it's a network/backend issue, we should not logout
          const { tokenManager } = await import('@/utils/tokenManager');
          const tokenData = await tokenManager.getStoredToken();
          const refreshTokenExpired = tokenData && tokenData.refreshTokenExpiresAt && tokenData.refreshTokenExpiresAt <= Date.now();
          
          if (refreshTokenExpired) {
            // Refresh token expired (30 days) - logout silently
            if (globalLogout) {
              isLoggingOut = true;
              try {
                await globalLogout();
              } catch (err) {
                console.error('Logout error', err);
              } finally {
                setTimeout(() => { isLoggingOut = false; }, 1000);
              }
            }
            // Return suppressed "Session expired" error
            const sessionExpiredError = normalizeError({ message: 'Session expired', status: 401 }, response);
            (sessionExpiredError as any)._suppressUnhandled = true;
            (sessionExpiredError as any)._handled = true;
            
            const suppressedPromise = Promise.resolve().then(() => {
              return Promise.reject(sessionExpiredError);
            });
            
            suppressedPromise.catch(() => {
              // Error is already handled (logout triggered), this catch prevents unhandled rejection
            });
            
            return suppressedPromise as any;
          } else {
            // Backend might be down or network issue - don't logout, just return error
            // The connection recovery manager will retry when backend comes back online
            throw normalizeError({ 
              message: 'Unable to refresh token. Backend may be unavailable. Will retry when connection is restored.', 
              status: 503,
              code: 'SERVICE_UNAVAILABLE'
            }, response);
          }
        }
      } catch (refreshError: any) {
        // Check if it's a network error or backend down scenario
        const isNetworkError = refreshError?.isNetworkError === true ||
                               refreshError?.message?.includes('Network') ||
                               refreshError?.message?.includes('Failed to fetch') ||
                               refreshError?.status === 503;
        
        const isSessionExpired = refreshError?.message === 'Session expired' || 
                                 refreshError?.message?.includes('Session expired') ||
                                 refreshError?.status === 401;

        // Handle database/server errors (500) silently - backend issue, not user's fault
        const isServerError = refreshError?.status === 500 || 
                             refreshError?.isServerError === true ||
                             refreshError?.message?.includes('Database operation failed') ||
                             refreshError?.message?.includes('Database') ||
                             refreshError?.data?.errorCode === 'DATABASE_ERROR' ||
                             refreshError?.data?.originalError?.includes('column') ||
                             refreshError?.data?.originalError?.includes('does not exist');
        
        if (isNetworkError) {
          // Network/backend error - don't logout, just throw error (will retry when backend is back)
          throw normalizeError({ 
            message: 'Unable to refresh token. Backend may be unavailable. Will retry when connection is restored.', 
            status: 503,
            code: 'SERVICE_UNAVAILABLE',
            isNetworkError: true
          }, response);
        } else if (isServerError) {
          // Database/server errors - backend issue, not user's fault
          // Silently suppress - don't logout, don't log, just return error that will be handled gracefully
          // Mark error as handled to prevent React Native from logging it
          if (refreshError && typeof refreshError === 'object') {
            (refreshError as any)._handled = true;
            (refreshError as any)._suppressUnhandled = true;
          }
          // Return a suppressed promise that won't cause unhandled rejections
          const suppressedError = normalizeError({ 
            message: 'Backend temporarily unavailable. Will retry when connection is restored.', 
            status: 503,
            code: 'SERVICE_UNAVAILABLE',
            isServerError: true
          }, response);
          (suppressedError as any)._handled = true;
          (suppressedError as any)._suppressUnhandled = true;
          
          // Return a rejected promise with catch handler to prevent unhandled rejection
          // This ensures the error is caught and suppressed before React Native logs it
          const suppressedPromise = Promise.resolve().then(() => {
            return Promise.reject(suppressedError);
          });
          
          // Attach catch handler immediately to prevent unhandled rejection
          suppressedPromise.catch(() => {
            // Error is already handled, this catch prevents unhandled rejection
          });
          
          // Return the suppressed promise instead of throwing
          // This ensures the promise chain has a catch handler attached
          return suppressedPromise as any;
        } else if (!isSessionExpired) {
          // Other errors - log but don't logout (might be temporary)
          // Only log if it's not a suppressed error
          if (!refreshError?._suppressUnhandled && !refreshError?._handled) {
            console.warn('Token refresh failed on 401:', refreshError);
          }
        }
        // Session expired errors are handled below
      }
    }
    
    // Refresh token expired (30 days) - logout silently
    if (globalLogout) {
      isLoggingOut = true;
      try {
        await globalLogout();
      } catch (err) {
        console.error('Logout error', err);
      } finally {
        setTimeout(() => { isLoggingOut = false; }, 1000);
      }
    }
    // Don't show error alert - logout handles navigation
    // For "Session expired" errors, we need to return a promise that won't be logged by React Native
    const sessionExpiredError = normalizeError({ message: 'Session expired', status: 401 }, response);
    (sessionExpiredError as any)._suppressUnhandled = true;
    (sessionExpiredError as any)._handled = true;
    
    const suppressedPromise = Promise.resolve().then(() => {
      return Promise.reject(sessionExpiredError);
    });
    
    suppressedPromise.catch(() => {
      // Error is already handled (logout triggered), this catch prevents unhandled rejection
    });
    
    return suppressedPromise as any;
  }

  if (response.status === 403 && !config.skipErrorHandling) {
    throw normalizeError({ message: 'Access forbidden', status: 403 }, response);
  }

  // Parse response body (refactored to reduce duplication)
  const data = await parseResponseBody(response);

  if (!response.ok) {
    const apiError = normalizeError({ 
      message: (data && typeof data === 'object' && data.message) ? data.message : response.statusText, 
      status: response.status,
      data 
    }, response);
    if (!config.skipErrorHandling && globalErrorHandler) globalErrorHandler(apiError);
    throw apiError;
  }

  return { data, status: response.status, headers: response.headers, ok: response.ok };
};

// -------------------- MAIN REQUEST --------------------
export const apiRequest = async <T = any>(endpoint: string, config: RequestConfig = {}): Promise<ApiResponse<T>> => {
  const { timeout = DEFAULT_TIMEOUT, retries = DEFAULT_RETRIES, retryDelay = DEFAULT_RETRY_DELAY, allowDedup = false, ...fetchConfig } = config;
  let url = endpoint.startsWith('http') ? endpoint : joinUrl(API_BASE_URL, endpoint);
  
  // Normalize URL (sort query params)
  url = normalizeUrl(url);
  
  const method = (config.method || fetchConfig.method || 'GET').toUpperCase();
  const endpointKey = getEndpointKey(url);

  // Check rate limiting per endpoint
  if (!checkRateLimit(endpointKey, method)) {
    throw normalizeError({
      message: 'Rate limit exceeded. Please try again later.',
      code: 'RATE_LIMIT_EXCEEDED',
    });
  }

  // Check for duplicate request
  const requestKey = getRequestKey(url, method, fetchConfig.body);
  const dedupedRequest = getDedupedRequest<T>(requestKey, allowDedup, method);
  if (dedupedRequest) {
    return dedupedRequest;
  }

  // Create the actual request
  const requestPromise = executeRequest<T>(url, method, config, fetchConfig);
  
  // Wrap the promise to catch "Session expired" errors and prevent unhandled rejections
  // This is critical for React Native which doesn't have native unhandledrejection support
  // We attach a catch handler that immediately handles "Session expired" errors silently
  const wrappedPromise = requestPromise.catch((error: any) => {
    // Check if this is a "Session expired" error
    const isSessionExpired = error?.message === 'Session expired' || 
                             error?.message?.includes('Session expired') ||
                             (error?.status === 401 && error?.message?.includes('Session expired')) ||
                             error?._suppressUnhandled === true;
    
    if (isSessionExpired) {
      // The error is already handled (logout triggered), but we need to prevent unhandled rejection
      // Mark the error as handled to prevent React Native from logging it
      (error as any)._handled = true;
      (error as any)._suppressUnhandled = true;
      // The catch handler here prevents React Native from logging it as an unhandled rejection
      // We still reject so the caller can handle it, but the catch prevents the log
    }
    
    // Re-throw the error so the caller can handle it
    throw error;
  });
  
  // Create a promise that ALWAYS has a catch handler attached to prevent unhandled rejections
  // This is the key to preventing React Native from logging "Session expired" errors
  const safePromise = new Promise<ApiResponse<T>>((resolve, reject) => {
    wrappedPromise
      .then((result) => {
        resolve(result);
      })
      .catch((error: any) => {
        const isSessionExpired = error?.message === 'Session expired' || 
                                 error?.message?.includes('Session expired') ||
                                 (error?.status === 401 && error?.message?.includes('Session expired')) ||
                                 error?._suppressUnhandled === true;
        
        if (isSessionExpired) {
          // Error is already handled (logout triggered), mark as handled and suppress
          (error as any)._handled = true;
          (error as any)._suppressUnhandled = true;
          // Still reject so caller can handle it, but the catch prevents React Native from logging
        }
        
        reject(error);
      });
  });
  
  // Attach a final catch handler to the safe promise to ensure "Session expired" errors are never unhandled
  // This is a safety net - the promise already has a catch handler, but this ensures it's never unhandled
  safePromise.catch((error: any) => {
    const isSessionExpired = error?.message === 'Session expired' || 
                             error?.message?.includes('Session expired') ||
                             (error?.status === 401 && error?.message?.includes('Session expired')) ||
                             error?._suppressUnhandled === true;
    if (isSessionExpired) {
      // Error is already handled (logout triggered), this catch prevents unhandled rejection
      // This is a no-op but prevents React Native from logging the error
      // The error is still propagated to the caller via the promise chain
    }
  });
  
  // Cache the safe promise for deduplication
  setDedupedRequest(requestKey, safePromise, allowDedup, method);
  
  return safePromise;
};

const executeRequest = async <T = any>(
  url: string,
  method: string,
  config: RequestConfig,
  fetchConfig: RequestInit
): Promise<ApiResponse<T>> => {
  const { timeout = DEFAULT_TIMEOUT, retries = DEFAULT_RETRIES, retryDelay = DEFAULT_RETRY_DELAY } = config;
  
  let lastError: ApiError | null = null;
  let hasRetriedWithRefresh = false; // Track if we've already retried with token refresh

  for (let attempt = 0; attempt <= retries; attempt++) {
    // Request interceptor inside retry loop (so token refresh happens on each retry)
    const interceptedConfig = await requestInterceptor(fetchConfig, attempt > 0);
    
    // Create timeout abort controller
    const timeoutController = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    // Merge user's signal with timeout signal
    const userSignal = fetchConfig.signal;
    const mergedSignal = mergeAbortSignals(timeoutController.signal, userSignal);

    try {
      timeoutId = setTimeout(() => {
        timeoutController.abort();
      }, timeout);

      // Create retry function for 401 handling
      const retryWithRefresh = async (refreshedToken?: string): Promise<ApiResponse<T>> => {
        if (hasRetriedWithRefresh) {
          throw normalizeError({ message: 'Authentication required', status: 401 });
        }
        hasRetriedWithRefresh = true;
        
        // IMPORTANT: If refreshedToken is provided, use it directly (from responseInterceptor)
        // Otherwise, get it from tokenManager (fallback for other cases)
        let tokenToUse: string | null = null;
        if (refreshedToken) {
          // Use the token that was just refreshed - this is the key fix!
          // CRITICAL: The old token is already blacklisted on the backend,
          // so we MUST use the new token that was just refreshed
          tokenToUse = refreshedToken;
        } else {
          // Fallback: invalidate cache and get token from storage
          // This should rarely happen, but handle it gracefully
          tokenManager.invalidateCache();
          tokenToUse = await queueTokenRefresh(false);
        }
        
        if (!tokenToUse) {
          throw normalizeError({ message: 'Authentication required', status: 401 });
        }
        
        // CRITICAL: Ensure we're using the new token, not the old blacklisted one
        // Create headers with the refreshed token
        const headers = new Headers(fetchConfig.headers as HeadersInit || {});
        headers.set('Authorization', `Bearer ${tokenToUse}`);
        if (fetchConfig.body && !headers.has('Content-Type')) {
          if (!isFormData(fetchConfig.body) && !(fetchConfig.body instanceof Blob)) {
            headers.set('Content-Type', 'application/json');
          }
        }
        
        const retryResponse = await fetch(url, {
          ...fetchConfig,
          headers,
          signal: mergedSignal,
        });
        return await responseInterceptor<T>(retryResponse, config, async (token?: string) => {
          // If retry after refresh still returns 401, refresh token expired (30 days)
          // Logout silently and throw suppressed "Session expired" error
          if (globalLogout) {
            isLoggingOut = true;
            try {
              await globalLogout();
            } catch (err) {
              console.error('Logout error', err);
            } finally {
              setTimeout(() => { isLoggingOut = false; }, 1000);
            }
          }
          throw normalizeError({ message: 'Session expired', status: 401 });
        });
      };

      const response = await fetch(url, { 
        ...interceptedConfig, 
        signal: mergedSignal 
      });
      
      // Clear timeout on success
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      
      // Extract retry-after header for 429 errors
      const retryAfter = response.status === 429 
        ? parseInt(response.headers.get('retry-after') || '0', 10)
        : undefined;
      
      // Response interceptor (handles 401, token refresh, retry)
      // Wrap in a try-catch to handle errors and prevent unhandled rejections
      let result: ApiResponse<T>;
      try {
        result = await responseInterceptor<T>(response, config, retryWithRefresh);
      } catch (error: any) {
        const isSessionExpired = error?.message === 'Session expired' || 
                                 error?.message?.includes('Session expired') ||
                                 (error?.status === 401 && error?.message?.includes('Session expired'));
        
        // Check if this is a database/server error (500) - backend issue, not user's fault
        const isServerError = error?.status === 500 || 
                             error?.isServerError === true ||
                             error?.message?.includes('Database operation failed') ||
                             error?.message?.includes('Database') ||
                             error?.data?.errorCode === 'DATABASE_ERROR' ||
                             error?.data?.originalError?.includes('column') ||
                             error?.data?.originalError?.includes('does not exist');
        
        // Check if error is marked as suppressed or handled
        const isSuppressed = error?._suppressUnhandled === true ||
                            error?._handled === true;
        
        if (isSessionExpired || isServerError || isSuppressed) {
          // Error is already handled, mark as suppressed to prevent React Native from logging it
          (error as any)._handled = true;
          (error as any)._suppressUnhandled = true;
          // Re-throw the error so the caller can handle it, but it's marked as suppressed
          throw error;
        }
        // For other errors, re-throw normally
        throw error;
      }
      
      return result;
      
    } catch (error: any) {
      // Cleanup timeout
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      
      // Check if aborted by user signal
      if (userSignal?.aborted) {
        throw normalizeError({ 
          message: 'Request aborted by user', 
          code: 'ABORTED' 
        });
      }
      
      lastError = normalizeError(error);

      // Suppress "Session expired" errors from being retried or logged as unhandled
      const isSessionExpired = lastError.message === 'Session expired' || 
                               lastError.message?.includes('Session expired') ||
                               (lastError.status === 401 && lastError.message?.includes('Session expired'));
      if (isSessionExpired) {
        (lastError as any)._suppressUnhandled = true;
        // Don't retry session expired errors
        break;
      }

      if (!isRetryable(lastError, attempt, retries, method)) break;

      // Get retry-after from error response if available
      const retryAfter = lastError.data?.retryAfter || 
                        (lastError.status === 429 ? 1 : undefined);
      
      const delay = calculateRetryDelay(attempt, retryDelay, retryAfter);
      if (attempt < retries) {
        await new Promise(res => setTimeout(res, delay));
      }
    }
  }

  // Suppress "Session expired" errors from being logged
  if (!config.skipErrorHandling && lastError && globalErrorHandler) {
    const isSessionExpired = lastError.message === 'Session expired' || 
                             lastError.message?.includes('Session expired') ||
                             (lastError.status === 401 && lastError.message?.includes('Session expired'));
    if (!isSessionExpired) {
      globalErrorHandler(lastError);
    } else {
      // Mark as handled to prevent React Native from logging it
      (lastError as any)._handled = true;
      (lastError as any)._suppressUnhandled = true;
    }
  }
  
  // For "Session expired" errors, we need to prevent React Native from logging them
  // The error is already handled (logout triggered), so we just need to suppress the log
  const finalError = lastError || normalizeError({ message: 'Request failed after retries' });
  const isSessionExpired = finalError.message === 'Session expired' || 
                           finalError.message?.includes('Session expired') ||
                           (finalError.status === 401 && finalError.message?.includes('Session expired'));
  
  if (isSessionExpired) {
    (finalError as any)._handled = true;
    (finalError as any)._suppressUnhandled = true;
  }
  
  throw finalError;
};

// -------------------- CONVENIENCE METHODS --------------------
export const apiGet = <T = any>(endpoint: string, config?: RequestConfig) =>
  apiRequest<T>(endpoint, { ...config, method: 'GET' });

export const apiPost = <T = any>(endpoint: string, data?: any, config?: RequestConfig) =>
  apiRequest<T>(endpoint, { ...config, method: 'POST', body: prepareBody(data) });

export const apiPut = <T = any>(endpoint: string, data?: any, config?: RequestConfig) =>
  apiRequest<T>(endpoint, { ...config, method: 'PUT', body: prepareBody(data) });

export const apiPatch = <T = any>(endpoint: string, data?: any, config?: RequestConfig) =>
  apiRequest<T>(endpoint, { ...config, method: 'PATCH', body: prepareBody(data) });

export const apiDelete = <T = any>(endpoint: string, config?: RequestConfig) =>
  apiRequest<T>(endpoint, { ...config, method: 'DELETE' });
