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
const DEFAULT_BUFFER_TIME = 5 * 60 * 1000; // 5 minutes

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
      if (!tokenData) return null;

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

      const now = Date.now();
      
      // If access token is already expired, try to refresh
      if (tokenData.accessTokenExpiresAt <= now) {
        // If refresh token is also expired, clear data and return null
        if (tokenData.refreshTokenExpiresAt <= now) {
          await this.clearStoredData();
          this.invalidateCache();
          return null;
        }
        // Try to refresh the access token
        return await this.refreshToken();
      }
      
      // If access token will expire soon, try to refresh
      if (tokenData.accessTokenExpiresAt - now < this.bufferTime) {
        return await this.refreshToken();
      }

      return tokenData.accessToken;
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

  private invalidateCache(): void {
    this.memoryCache = null;
    this.cacheTimestamp = 0;
  }

  private async getStoredToken(): Promise<TokenData | null> {
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
    await storage.multiSet([
      ['accessToken', tokenData.accessToken],
      ['refreshToken', tokenData.refreshToken],
      ['accessTokenExpiresAt', tokenData.accessTokenExpiresAt.toString()],
      ['refreshTokenExpiresAt', tokenData.refreshTokenExpiresAt.toString()],
      // Keep 'token' for backward compatibility
      ['token', tokenData.accessToken]
    ], {
      maxRetries: 3,
      onRetry: (attempt, error) => {
        console.log(`Storage retry attempt ${attempt}/3 for storing tokens:`, error.message);
      },
    });
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
      // Check if user exists before attempting refresh
      // Skip refresh during signup/login flows
      try {
        const userData = await storage.getJSON<any>('user', { maxRetries: 1 });
        if (!userData) {
          // No user data means we're in signup/login flow, skip refresh
          this.invalidateCache();
          return null;
        }
      } catch {
        // Can't read user data, skip refresh
        return null;
      }

      const tokenData = await this.getStoredToken();
      if (!tokenData || !tokenData.refreshToken) {
        this.invalidateCache();
        return null;
      }

      // Check if refresh token is expired
      if (tokenData.refreshTokenExpiresAt <= Date.now()) {
        await this.clearStoredData();
        this.invalidateCache();
        return null;
      }

      // Use fetchWithRetry for token refresh with network failure handling
      const response = await fetchWithRetry(
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
          maxRetries: 1, // Reduce retries to avoid long waits during backend issues
          retryDelay: 1000,
          exponentialBackoff: true,
          timeout: 10000, // Reduce timeout from 15s to 10s
          onRetry: (attempt) => {
            console.log(`Token refresh retry attempt ${attempt}/1`);
          },
        }
      );

      if (!response.ok) {
        // Refresh failed, clear stored data
        await this.clearStoredData();
        this.invalidateCache();
        return null;
      }

      // Type-safe response handling
      const data: RefreshTokenResponse = await response.json();
      
      // Validate response structure
      if (!data || !data.data || !data.data.accessToken || !data.data.refreshToken) {
        console.error('Invalid refresh token response structure:', data);
        await this.clearStoredData();
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
    } catch (error) {
      // Handle timeout errors silently during signup/login flows
      const isTimeout = error instanceof Error && (
        error.message.includes('timeout') || 
        error.message.includes('Request timeout') ||
        error.message.includes('TIMEOUT')
      );
      
      if (isTimeout) {
        // Silently handle timeout - don't log as error to avoid console error during signup
        // Just clear invalid tokens and return null
        try {
          await this.clearStoredData();
        } catch {
          // Ignore errors during cleanup
        }
        this.invalidateCache();
        return null;
      }
      
      // For other errors, log but don't show to user
      console.warn('Error refreshing token:', error instanceof Error ? error.message : error);
      await this.clearStoredData();
      this.invalidateCache();
      return null;
    }
  }

  private async clearStoredData(): Promise<void> {
    try {
      await storage.multiRemove([
        'accessToken',
        'refreshToken',
        'accessTokenExpiresAt',
        'refreshTokenExpiresAt',
        'token', // Remove old format too
        'user'
      ], {
        maxRetries: 3,
        onRetry: (attempt, error) => {
          console.log(`Storage retry attempt ${attempt}/3 for clearing tokens:`, error.message);
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
    const tokenData: TokenData = {
      accessToken,
      refreshToken,
      accessTokenExpiresAt: typeof accessTokenExpiresAt === 'string' ? new Date(accessTokenExpiresAt).getTime() : accessTokenExpiresAt.getTime(),
      refreshTokenExpiresAt: typeof refreshTokenExpiresAt === 'string' ? new Date(refreshTokenExpiresAt).getTime() : refreshTokenExpiresAt.getTime()
    };
    
    await this.storeTokens(tokenData);
    this.memoryCache = tokenData;
    this.cacheTimestamp = Date.now();
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
