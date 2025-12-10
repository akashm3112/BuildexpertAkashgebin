import { storage } from '@/utils/storage';
import { fetchWithRetry, getNetworkErrorMessage } from '@/utils/networkRetry';
import { API_BASE_URL } from '@/constants/api';

// -------------------- TYPES --------------------
interface TokenData {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number;
  refreshTokenExpiresAt: number;
}

interface RefreshTokenResponse {
  status: string;
  data: {
    accessToken: string;
    refreshToken: string;
    accessTokenExpiresAt: string;
    refreshTokenExpiresAt: string;
  };
  message?: string;
}

// -------------------- CONFIGURATION --------------------
const DEFAULT_BUFFER_TIME = 2 * 60 * 1000; // 2 minutes - refresh proactively before expiration

// -------------------- REACT NATIVE COMPATIBLE BASE64 DECODER --------------------
// React Native compatible base64 decoder (works in both web and native)
const base64Decode = (str: string): string => {
  try {
    // Try native atob first (web/Expo web)
    if (typeof atob !== 'undefined') {
      return atob(str);
    }
    
    // React Native fallback: manual base64 decoding
    // Base64 character set
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let output = '';
    
    str = str.replace(/[^A-Za-z0-9\+\/\=]/g, '');
    
    for (let i = 0; i < str.length; i += 4) {
      const enc1 = chars.indexOf(str.charAt(i));
      const enc2 = chars.indexOf(str.charAt(i + 1));
      const enc3 = chars.indexOf(str.charAt(i + 2));
      const enc4 = chars.indexOf(str.charAt(i + 3));
      
      const chr1 = (enc1 << 2) | (enc2 >> 4);
      const chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
      const chr3 = ((enc3 & 3) << 6) | enc4;
      
      output += String.fromCharCode(chr1);
      
      if (enc3 !== 64) {
        output += String.fromCharCode(chr2);
      }
      if (enc4 !== 64) {
        output += String.fromCharCode(chr3);
      }
    }
    
    // Decode UTF-8
    return decodeURIComponent(escape(output));
  } catch (error) {
    throw new Error('Failed to decode base64 string');
  }
};

// Decode JWT payload (React Native compatible)
const decodeJWTPayload = (token: string): any => {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT format');
    }
    
    const payload = parts[1];
    const decoded = base64Decode(payload);
    return JSON.parse(decoded);
  } catch (error) {
    throw new Error(`Failed to decode JWT: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

// -------------------- TOKEN MANAGER --------------------
export class TokenManager {
  private static instance: TokenManager;
  private refreshPromise: Promise<string | null> | null = null;
  
  // In-memory cache to reduce AsyncStorage I/O
  private memoryCache: TokenData | null = null;
  private cacheTimestamp: number = 0;
  private readonly cacheTTL = 1000; // 1 second cache to prevent rapid reads
  
  // Configurable buffer time
  private bufferTime: number = DEFAULT_BUFFER_TIME;

  static getInstance(): TokenManager {
    if (!TokenManager.instance) {
      TokenManager.instance = new TokenManager();
    }
    return TokenManager.instance;
  }

  // Set buffer time (for testing or customization)
  setBufferTime(ms: number): void {
    this.bufferTime = ms;
  }

  // Get buffer time
  getBufferTime(): number {
    return this.bufferTime;
  }

  async getValidToken(): Promise<string | null> {
    try {
      const tokenData = await this.getStoredToken();
      if (!tokenData) {
        // No tokens found - return null (API client will handle 401 and attempt refresh)
        return null;
      }

      // Check if user exists before attempting token refresh
      // This prevents token refresh attempts during signup/login flows
      try {
        const userData = await storage.getJSON<any>('user', { maxRetries: 1 });
        if (!userData) {
          // No user data means we're in signup/login flow, skip token refresh
          this.invalidateCache();
          return null;
        }
      } catch {
        // If we can't read user data, skip token refresh to avoid errors during signup
        return null;
      }

      return await this.processTokenData(tokenData);
    } catch (error) {
      // Silently fail during signup/login flows - don't log as error
      const isTimeout = error instanceof Error && error.message.includes('timeout');
      if (!isTimeout) {
        console.error('Error getting valid token:', error);
      }
      this.invalidateCache();
      return null;
    }
  }

  private async processTokenData(tokenData: TokenData): Promise<string | null> {
    const now = Date.now();
    
    // Check if refresh token is expired first (30 days)
    if (tokenData.refreshTokenExpiresAt <= now) {
      // Refresh token expired - user must login again after 30 days
      await this.clearStoredData();
      this.invalidateCache();
      return null;
    }
    
    // If access token is already expired, try to refresh
    if (tokenData.accessTokenExpiresAt <= now) {
      // Refresh token is still valid, refresh the access token
      return await this.refreshToken();
    }
    
    // If access token will expire soon (within buffer time), refresh proactively
    if (tokenData.accessTokenExpiresAt - now < this.bufferTime) {
      // Proactively refresh before expiration to prevent 401 errors
      return await this.refreshToken();
    }

    return tokenData.accessToken;
  }

  /**
   * Invalidate token cache (public method for apiClient)
   * This ensures that after token refresh, the cache is cleared immediately
   */
  public invalidateCache(): void {
    this.memoryCache = null;
    this.cacheTimestamp = 0;
  }

  /**
   * Get stored token data without validation (public method for AuthContext and apiClient)
   * This is used to check if tokens exist and if refresh token is expired
   */
  public async getStoredToken(): Promise<TokenData | null> {
    try {
      // Check in-memory cache first (reduces AsyncStorage I/O)
      const now = Date.now();
      if (this.memoryCache && (now - this.cacheTimestamp) < this.cacheTTL) {
        return this.memoryCache;
      }

      // Try new format first (accessToken + refreshToken) with retry
      const [accessToken, refreshToken, accessTokenExpiresAtStr, refreshTokenExpiresAtStr] = await Promise.all([
        storage.getItem('accessToken', { maxRetries: 2 }),
        storage.getItem('refreshToken', { maxRetries: 2 }),
        storage.getItem('accessTokenExpiresAt', { maxRetries: 2 }),
        storage.getItem('refreshTokenExpiresAt', { maxRetries: 2 }),
      ]);

      // Log missing tokens for debugging
      if (!accessToken || !refreshToken || !accessTokenExpiresAtStr || !refreshTokenExpiresAtStr) {
        console.warn('📱 TokenManager: Missing tokens in storage:', {
          hasAccessToken: !!accessToken,
          hasRefreshToken: !!refreshToken,
          hasAccessTokenExpiresAt: !!accessTokenExpiresAtStr,
          hasRefreshTokenExpiresAt: !!refreshTokenExpiresAtStr,
        });
      }

      if (accessToken && refreshToken && accessTokenExpiresAtStr && refreshTokenExpiresAtStr) {
        const accessTokenExpiresAt = parseInt(accessTokenExpiresAtStr, 10);
        const refreshTokenExpiresAt = parseInt(refreshTokenExpiresAtStr, 10);
        
        const tokenData: TokenData = {
          accessToken,
          refreshToken,
          accessTokenExpiresAt,
          refreshTokenExpiresAt
        };

        // Update cache
        this.memoryCache = tokenData;
        this.cacheTimestamp = now;

        return tokenData;
      }

      // Fallback to old format (backward compatibility) with retry
      const oldToken = await storage.getItem('token', { maxRetries: 2 });
      if (oldToken) {
        // Decode JWT to get expiration (React Native compatible)
        const payload = decodeJWTPayload(oldToken);
        
        if (!payload.exp || typeof payload.exp !== 'number') {
          throw new Error('Invalid JWT: missing or invalid expiration');
        }
        
        const expiresAt = payload.exp * 1000; // Convert to milliseconds
        // Migrate to new format
        const tokenData: TokenData = {
          accessToken: oldToken,
          refreshToken: '', // No refresh token in old format
          accessTokenExpiresAt: expiresAt,
          refreshTokenExpiresAt: expiresAt // Use same expiry as fallback
        };

        // Save in new format
        await this.storeTokens(tokenData);

        // Update cache
        this.memoryCache = tokenData;
        this.cacheTimestamp = now;

        return tokenData;
      }

      this.invalidateCache();
      return null;
    } catch (error) {
      console.error('Error parsing stored token:', error);
      this.invalidateCache();
      return null;
    }
  }

  private async storeTokens(tokenData: TokenData): Promise<void> {
    // Store tokens with CRITICAL priority to prevent cleanup
    // Use individual setItem calls to ensure priority is set for each token
    const retryOptions = {
      maxRetries: 3,
      priority: 'critical' as const,
      onRetry: (attempt: number, error: Error) => {
        console.log(`Storage retry attempt ${attempt}/3 for storing tokens:`, error.message);
      },
    };

    // Store all tokens with critical priority to prevent cleanup
    await Promise.all([
      storage.setItem('accessToken', tokenData.accessToken, retryOptions),
      storage.setItem('refreshToken', tokenData.refreshToken, retryOptions),
      storage.setItem('accessTokenExpiresAt', tokenData.accessTokenExpiresAt.toString(), retryOptions),
      storage.setItem('refreshTokenExpiresAt', tokenData.refreshTokenExpiresAt.toString(), retryOptions),
      // Keep 'token' for backward compatibility
      storage.setItem('token', tokenData.accessToken, retryOptions),
    ]);
  }

  private async refreshToken(): Promise<string | null> {
    // Prevent multiple simultaneous refresh attempts
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.performTokenRefresh();
    try {
      const result = await this.refreshPromise;
      return result;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async performTokenRefresh(): Promise<string | null> {
    try {
      // CRITICAL: Invalidate cache IMMEDIATELY when refresh starts
      // This prevents any concurrent requests from using the old (soon-to-be-blacklisted) token
      // The old token will be blacklisted on the backend, so we must ensure no requests use it
      this.invalidateCache();
      
      // Check if user exists before attempting refresh
      // Skip refresh during signup/login flows
      try {
        const userData = await storage.getJSON<any>('user', { maxRetries: 1 });
        if (!userData) {
          // No user data means we're in signup/login flow, skip refresh
          return null;
        }
      } catch {
        // Can't read user data, skip refresh
        return null;
      }

      const tokenData = await this.getStoredToken();
      if (!tokenData || !tokenData.refreshToken) {
        return null;
      }

      // Check if refresh token is expired
      if (tokenData.refreshTokenExpiresAt <= Date.now()) {
        await this.clearStoredData();
        return null;
      }

      // Use fetchWithRetry for token refresh with network failure handling
      let response: Response;
      try {
        response = await fetchWithRetry(
          `${API_BASE_URL}/api/auth/refresh`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              refreshToken: tokenData.refreshToken
            }),
          },
          {
            maxRetries: 2,
            retryDelay: 1000,
            exponentialBackoff: true,
            timeout: 15000,
            onRetry: (attempt) => {
              console.log(`Token refresh retry attempt ${attempt}/2`);
            },
          }
        );
      } catch (error: any) {
        // Network errors are expected when backend is down or network is unavailable
        // Mark as handled to prevent unhandled promise rejection warnings
        const networkError = error instanceof Error && (
          error.message.includes('Network request failed') ||
          error.message.includes('timeout') ||
          error.message.includes('Network request failed after retries')
        );
        
        if (networkError) {
          // Mark error as handled to prevent unhandled rejection warnings
          (error as any)._handled = true;
          (error as any)._suppressUnhandled = true;
          console.warn('Token refresh failed: Network error (will retry on next API call):', error.message);
        } else {
          // Mark other errors as handled too
          (error as any)._handled = true;
          (error as any)._suppressUnhandled = true;
          console.warn('Token refresh failed (will retry on next API call):', error.message || error);
        }
        
        // Return null to indicate refresh failed (will retry on next API call)
        this.invalidateCache();
        return null;
      }

      if (!response.ok) {
        // Refresh failed - check the status code
        if (response.status === 401) {
          // Token is actually invalid - clear tokens but keep user data
          // User will be logged out on next API call, but not immediately
          await this.clearTokensOnly();
          this.invalidateCache();
          return null;
        }
        
        if (response.status === 503) {
          // Service temporarily unavailable (database error, backend restart, etc.)
          // Don't clear tokens - this is a temporary issue, not a token problem
          // Token refresh will be retried on next API call when service is back
          console.warn('Token refresh failed: Service temporarily unavailable (will retry on next API call)');
          this.invalidateCache();
          return null;
        }
        
        // Other server errors (500, etc.) - don't clear tokens, just return null
        // Token refresh will be retried on next API call
        console.warn('Token refresh failed with status:', response.status, '(will retry on next API call)');
        this.invalidateCache();
        return null;
      }

      // Type-safe response handling
      const data: RefreshTokenResponse = await response.json();
      
      // Validate response structure
      if (!data || !data.data || !data.data.accessToken || !data.data.refreshToken) {
        console.error('Invalid refresh token response structure:', data);
        // Invalid response - clear tokens but keep user data
        await this.clearTokensOnly();
        this.invalidateCache();
        return null;
      }

      const newTokenData: TokenData = {
        accessToken: data.data.accessToken,
        refreshToken: data.data.refreshToken,
        accessTokenExpiresAt: new Date(data.data.accessTokenExpiresAt).getTime(),
        refreshTokenExpiresAt: new Date(data.data.refreshTokenExpiresAt).getTime()
      };
      
      // Store the new tokens
      await this.storeTokens(newTokenData);
      
      // Update in-memory cache
      this.memoryCache = newTokenData;
      this.cacheTimestamp = Date.now();
      
      // Update user context if needed (backward compatibility) with retry
      try {
        const userData = await storage.getJSON<any>('user', { maxRetries: 2 });
        if (userData) {
          userData.token = newTokenData.accessToken; // Keep for backward compatibility
          await storage.setJSON('user', userData, {
            maxRetries: 2,
            onRetry: (attempt, error) => {
              console.log(`Storage retry attempt ${attempt}/2 for updating user token:`, error.message);
            },
          });
        }
      } catch (error) {
        console.warn('Failed to update user context:', error);
        // Non-critical error, continue
      }

      return newTokenData.accessToken;
    } catch (error: any) {
      // Check if it's a network error or actual error
      const isNetworkError = error?.message?.includes('network') || 
                             error?.message?.includes('timeout') ||
                             error?.message?.includes('fetch') ||
                             error?.code === 'NETWORK_ERROR' ||
                             error?.code === 'TIMEOUT';
      
      if (isNetworkError) {
        // Network error - don't clear tokens, just return null
        // Token refresh will be retried on next API call when backend is back
        console.warn('Token refresh failed due to network error (will retry on next API call):', error?.message || error);
        this.invalidateCache();
        return null;
      }
      
      // Other errors - clear tokens but keep user data
      console.error('Error refreshing token:', error);
      await this.clearTokensOnly();
      this.invalidateCache();
      return null;
    }
  }

  /**
   * Clear only tokens, not user data
   * Used when tokens are invalid but we want to keep user logged in
   * User will be logged out on next API call if tokens can't be refreshed
   */
  private async clearTokensOnly(): Promise<void> {
    try {
      await storage.multiRemove([
        'accessToken',
        'refreshToken',
        'accessTokenExpiresAt',
        'refreshTokenExpiresAt',
        'token', // Remove old format too
        // NOTE: Do NOT remove 'user' - keep user data so they stay logged in
        // User will be logged out on next API call if tokens can't be refreshed
      ], {
        maxRetries: 3,
        onRetry: (attempt, error) => {
          console.log(`Storage retry attempt ${attempt}/3 for clearing tokens:`, error.message);
        },
      });
      this.invalidateCache();
    } catch (error) {
      console.error('Error clearing tokens:', error);
      this.invalidateCache();
    }
  }

  /**
   * Clear all stored data including user data
   * Used only when refresh token is expired (30 days) or explicit logout
   */
  private async clearStoredData(): Promise<void> {
    try {
      await storage.multiRemove([
        'accessToken',
        'refreshToken',
        'accessTokenExpiresAt',
        'refreshTokenExpiresAt',
        'token', // Remove old format too
        'user' // Only clear user data when refresh token is expired
      ], {
        maxRetries: 3,
        onRetry: (attempt, error) => {
          console.log(`Storage retry attempt ${attempt}/3 for clearing all data:`, error.message);
        },
      });
      this.invalidateCache();
    } catch (error) {
      console.error('Error clearing stored data:', error);
      this.invalidateCache();
    }
  }

  // Public method to store tokens after login/signup
  async storeTokenPair(accessToken: string, refreshToken: string, accessTokenExpiresAt: string | Date, refreshTokenExpiresAt: string | Date): Promise<void> {
    try {
      const tokenData: TokenData = {
        accessToken,
        refreshToken,
        accessTokenExpiresAt: typeof accessTokenExpiresAt === 'string' ? new Date(accessTokenExpiresAt).getTime() : accessTokenExpiresAt.getTime(),
        refreshTokenExpiresAt: typeof refreshTokenExpiresAt === 'string' ? new Date(refreshTokenExpiresAt).getTime() : refreshTokenExpiresAt.getTime()
      };
      
      // Validate token data
      if (!accessToken || !refreshToken) {
        throw new Error('Invalid token data: accessToken and refreshToken are required');
      }
      
      if (!tokenData.accessTokenExpiresAt || !tokenData.refreshTokenExpiresAt) {
        throw new Error('Invalid token data: expiration times are required');
      }
      
      // Check for invalid dates
      if (isNaN(tokenData.accessTokenExpiresAt) || isNaN(tokenData.refreshTokenExpiresAt)) {
        throw new Error('Invalid token data: expiration times must be valid dates');
      }
      
      console.log('📱 TokenManager: Storing token pair', {
        hasAccessToken: !!accessToken,
        hasRefreshToken: !!refreshToken,
        accessTokenExpiresAt: new Date(tokenData.accessTokenExpiresAt).toISOString(),
        refreshTokenExpiresAt: new Date(tokenData.refreshTokenExpiresAt).toISOString()
      });
      
      await this.storeTokens(tokenData);
      this.memoryCache = tokenData;
      this.cacheTimestamp = Date.now();
      
      // Verify tokens were stored
      const storedTokenData = await this.getStoredToken();
      if (!storedTokenData || !storedTokenData.refreshToken) {
        throw new Error('Failed to verify token storage: tokens were not properly saved');
      }
      
      console.log('✅ TokenManager: Token pair stored and verified successfully');
    } catch (error) {
      console.error('❌ TokenManager: Failed to store token pair:', error);
      throw error;
    }
  }

  async isTokenValid(): Promise<boolean> {
    const token = await this.getValidToken();
    return token !== null;
  }

  // Force refresh token (used on 401 errors)
  async forceRefreshToken(): Promise<string | null> {
    // Clear any existing refresh promise to force a new refresh
    this.refreshPromise = null;
    return await this.refreshToken();
  }
}

export const tokenManager = TokenManager.getInstance();
