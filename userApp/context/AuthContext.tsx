import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { storage } from '@/utils/storage';
import { setGlobalLogout } from '@/utils/api';
import { globalErrorHandler } from '@/utils/globalErrorHandler';
// Push notifications don't work in Expo Go SDK 53+, using Socket.io instead
// import { notificationService } from '@/services/NotificationService'; // For standalone builds only
// import { expoGoNotificationService } from '@/services/ExpoGoNotificationService'; // Alternative for Expo Go

interface User {
  id: string;
  full_name: string;
  email?: string;
  phone: string;
  role: string;
  profile_pic_url?: string;
  is_verified: boolean;
  token?: string;
  hasAcceptedTerms?: boolean;
}

interface AuthContextType {
  user: User | null;
  login: (userData: User) => Promise<void>;
  logout: () => Promise<void>;
  isLoading: boolean;
  updateUser: (userData: Partial<User>) => Promise<void>;
  acceptTerms: () => Promise<void>;
  clearAllAppData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadUser = useCallback(async () => {
    try {
      const userData = await storage.getJSON<any>('user', {
        maxRetries: 3,
      });
      
      if (userData) {
        // Check if tokens exist and if refresh token is expired (30 days)
        // Only clear user data if refresh token is actually expired, not if access token is expired
        try {
          const { tokenManager } = await import('@/utils/tokenManager');
          
          // First, check if tokens exist at all (don't validate yet, just check existence)
          const tokenData = await tokenManager.getStoredToken();
          
          if (!tokenData) {
            // No tokens found at all - user needs to login
            try {
              await storage.removeItem('user', { maxRetries: 2 });
            } catch (error) {
              // Error removing user data
            }
            setUser(null);
            return;
          }
          
          // Check if refresh token is expired (30 days) - this is the only case where we should logout
          const now = Date.now();
          if (tokenData.refreshTokenExpiresAt && tokenData.refreshTokenExpiresAt <= now) {
            // Refresh token expired after 30 days - user must login again
            try {
              await storage.removeItem('user', { maxRetries: 2 });
            } catch (error) {
              // Error removing user data
            }
            setUser(null);
            return;
          }
          
          // Tokens exist and refresh token is still valid - load user
          // Access token might be expired, but that's fine - it will be refreshed on first API call
          setUser(userData);
          
          // Optionally, try to refresh access token in the background (non-blocking)
          // This ensures we have a fresh token ready for API calls
          tokenManager.getValidToken().catch((error) => {
            // Ignore errors - token refresh will happen on first API call if needed
            // This is just an optimization to have a fresh token ready
          });
          
        } catch (tokenError: any) {
          // If we can't check tokens (e.g., storage error), still load user
          // Token validation will happen on first API call
          // Load user anyway - token validation will happen on first API call
          setUser(userData);
        }
      } else {
        // No user data - don't check tokens to avoid triggering refresh during signup
        setUser(null);
      }
    } catch (error) {
      // On error, clear user to force re-login
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Wrap loadUser to catch any unhandled promise rejections
    const loadUserSafely = async () => {
      try {
        await loadUser();
      } catch (error) {
        // Error is already handled in loadUser, but we catch here to prevent unhandled rejection
        globalErrorHandler.handleError(
          error instanceof Error ? error : new Error(String(error)),
          false,
          'AuthContext.loadUser'
        );
      }
    };
    loadUserSafely();
  }, [loadUser]);

  const login = async (userData: User) => {
    try {
      // Save user data with retry mechanism (critical priority - never expires)
      await storage.setJSON('user', userData, {
        maxRetries: 3,
        priority: 'critical',
      });
      
      setUser(userData);
      
      // Save token separately if provided (for backward compatibility)
      if (userData.token) {
        await storage.setItem('token', userData.token, {
          maxRetries: 3,
        });
      }

      // Note: Push notifications don't work in Expo Go SDK 53+
      // Real-time notifications work via Socket.io (already implemented)
    } catch (error) {
      throw error; // Re-throw to allow caller to handle
    }
  };

  const logout = async () => {
    try {
      // Note: Socket.io cleanup handled by NotificationContext
      
      // Clear all storage data except language preferences with retry
      const allKeys = await storage.getAllKeys({
        maxRetries: 2,
      });
      
      const keysToKeep = ['selectedLanguage'];
      const keysToRemove = allKeys.filter(key => !keysToKeep.includes(key));
      
      if (keysToRemove.length > 0) {
        await storage.multiRemove(keysToRemove, {
          maxRetries: 3,
        });
      }
      
      // Reset user state
      setUser(null);
      
    } catch (error) {
      // Even if there's an error, we should still clear the user state
      setUser(null);
    }
  };

  // Set global logout function for API utility
  useEffect(() => {
    setGlobalLogout(logout);
  }, []);

  const updateUser = async (userData: Partial<User>) => {
    if (user) {
      const updatedUser = { ...user, ...userData };
      try {
        await storage.setJSON('user', updatedUser, {
          maxRetries: 3,
          priority: 'critical',
        });
        setUser(updatedUser);
      } catch (error) {
        throw error; // Re-throw to allow caller to handle
      }
    }
  };

  const clearAllAppData = async () => {
    try {
      // Get all storage keys with retry
      const allKeys = await storage.getAllKeys({
        maxRetries: 2,
      });
      
      // Keep only essential keys that shouldn't be cleared (like language preferences)
      const keysToKeep = ['selectedLanguage'];
      const keysToRemove = allKeys.filter(key => !keysToKeep.includes(key));
      
      if (keysToRemove.length > 0) {
        await storage.multiRemove(keysToRemove, {
          maxRetries: 3,
        });
      }
      
    } catch (error) {
      // Error clearing app data
    }
  };

  const acceptTerms = async () => {
    if (user) {
      const updatedUser = { ...user, hasAcceptedTerms: true };
      try {
        await storage.setJSON('user', updatedUser, {
          maxRetries: 3,
          priority: 'critical',
        });
        setUser(updatedUser);
      } catch (error) {
        throw error; // Re-throw to allow caller to handle
      }
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading, updateUser, acceptTerms, clearAllAppData }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
} 