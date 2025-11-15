import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '@/constants/api';

// -------------------- TYPES --------------------
interface TokenData {
  token: string;
  expiresAt: number;
}

interface RefreshTokenResponse {
  status: string;
  data: {
    token: string;
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

      const now = Date.now();
      
      // If token is already expired, clear data and return null
      if (tokenData.expiresAt <= now) {
        await this.clearStoredData();
        this.invalidateCache();
        return null;
      }
      
      // If token will expire soon, try to refresh
      if (tokenData.expiresAt - now < this.bufferTime) {
        return await this.refreshToken();
      }

      return tokenData.token;
    } catch (error) {
      console.error('Error getting valid token:', error);
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

      const token = await AsyncStorage.getItem('token');
      if (!token) {
        this.invalidateCache();
        return null;
      }

      // Decode JWT to get expiration (React Native compatible)
      const payload = decodeJWTPayload(token);
      
      if (!payload.exp || typeof payload.exp !== 'number') {
        throw new Error('Invalid JWT: missing or invalid expiration');
      }
      
      const expiresAt = payload.exp * 1000; // Convert to milliseconds
      const tokenData = { token, expiresAt };

      // Update cache
      this.memoryCache = tokenData;
      this.cacheTimestamp = now;

      return tokenData;
    } catch (error) {
      console.error('Error parsing stored token:', error);
      this.invalidateCache();
      return null;
    }
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
      const currentToken = await AsyncStorage.getItem('token');
      if (!currentToken) {
        this.invalidateCache();
        return null;
      }

      const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentToken}`,
        },
      });

      if (!response.ok) {
        // Refresh failed, clear stored data
        await this.clearStoredData();
        this.invalidateCache();
        return null;
      }

      // Type-safe response handling
      const data: RefreshTokenResponse = await response.json();
      
      // Validate response structure
      if (!data || !data.data || !data.data.token || typeof data.data.token !== 'string') {
        console.error('Invalid refresh token response structure:', data);
        await this.clearStoredData();
        this.invalidateCache();
        return null;
      }

      const newToken = data.data.token;
      
      // Store the new token
      await AsyncStorage.setItem('token', newToken);
      
      // Update in-memory cache
      try {
        const payload = decodeJWTPayload(newToken);
        if (payload.exp && typeof payload.exp === 'number') {
          this.memoryCache = {
            token: newToken,
            expiresAt: payload.exp * 1000,
          };
          this.cacheTimestamp = Date.now();
        }
      } catch (error) {
        console.warn('Failed to cache new token:', error);
      }
      
      // Update user context if needed
      try {
        const userData = await AsyncStorage.getItem('user');
        if (userData) {
          const user = JSON.parse(userData);
          user.token = newToken;
          await AsyncStorage.setItem('user', JSON.stringify(user));
        }
      } catch (error) {
        console.warn('Failed to update user context:', error);
        // Non-critical error, continue
      }

      return newToken;
    } catch (error) {
      console.error('Error refreshing token:', error);
      await this.clearStoredData();
      this.invalidateCache();
      return null;
    }
  }

  private async clearStoredData(): Promise<void> {
    try {
      await AsyncStorage.removeItem('token');
      await AsyncStorage.removeItem('user');
      this.invalidateCache();
    } catch (error) {
      console.error('Error clearing stored data:', error);
      this.invalidateCache();
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
