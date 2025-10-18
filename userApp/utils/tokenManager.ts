import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '@/constants/api';

interface TokenData {
  token: string;
  expiresAt: number;
}

export class TokenManager {
  private static instance: TokenManager;
  private refreshPromise: Promise<string | null> | null = null;

  static getInstance(): TokenManager {
    if (!TokenManager.instance) {
      TokenManager.instance = new TokenManager();
    }
    return TokenManager.instance;
  }

  async getValidToken(): Promise<string | null> {
    try {
      const tokenData = await this.getStoredToken();
      if (!tokenData) return null;

      const now = Date.now();
      const bufferTime = 5 * 60 * 1000; // 5 minutes
      
      // If token is already expired, clear data and return null
      if (tokenData.expiresAt <= now) {
        console.log('Token is expired, clearing stored data');
        await this.clearStoredData();
        return null;
      }
      
      // If token will expire soon, try to refresh
      if (tokenData.expiresAt - now < bufferTime) {
        console.log('Token will expire soon, attempting refresh');
        return await this.refreshToken();
      }

      return tokenData.token;
    } catch (error) {
      console.error('Error getting valid token:', error);
      return null;
    }
  }

  private async getStoredToken(): Promise<TokenData | null> {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) return null;

      // Decode JWT to get expiration
      const payload = JSON.parse(atob(token.split('.')[1]));
      const expiresAt = payload.exp * 1000; // Convert to milliseconds

      return { token, expiresAt };
    } catch (error) {
      console.error('Error parsing stored token:', error);
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
      if (!currentToken) return null;

      const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentToken}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        const newToken = data.data.token;
        
        // Store the new token
        await AsyncStorage.setItem('token', newToken);
        
        // Update user context if needed
        const userData = await AsyncStorage.getItem('user');
        if (userData) {
          const user = JSON.parse(userData);
          user.token = newToken;
          await AsyncStorage.setItem('user', JSON.stringify(user));
        }

        return newToken;
      } else {
        // Refresh failed, clear stored data
        await this.clearStoredData();
        return null;
      }
    } catch (error) {
      console.error('Error refreshing token:', error);
      await this.clearStoredData();
      return null;
    }
  }

  private async clearStoredData(): Promise<void> {
    try {
      await AsyncStorage.removeItem('token');
      await AsyncStorage.removeItem('user');
    } catch (error) {
      console.error('Error clearing stored data:', error);
    }
  }

  async isTokenValid(): Promise<boolean> {
    const token = await this.getValidToken();
    return token !== null;
  }
}

export const tokenManager = TokenManager.getInstance();
