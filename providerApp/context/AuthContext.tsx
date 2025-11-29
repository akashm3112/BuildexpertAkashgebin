import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { storage } from '@/utils/storage';
import { useRouter } from 'expo-router';
import { setGlobalLogout } from '@/utils/api';
import { globalErrorHandler } from '@/utils/globalErrorHandler';
// Push notifications don't work in Expo Go SDK 53+, using Socket.io instead
// import { notificationService } from '@/services/NotificationService'; // For standalone builds only

interface User {
  id: string;
  phone: string;
  fullName: string;
  full_name?: string; // Backend compatibility
  email?: string;
  aadharNumber?: string;
  role: 'user' | 'provider' | 'admin';
  registeredServices: string[];
  token?: string;
  profile_pic_url?: string;
  profilePicUrl?: string; // Backend compatibility
  createdAt?: string;
  created_at?: string; // Backend compatibility
}

interface AuthContextType {
  user: User | null;
  login: (userData: User) => Promise<void>;
  logout: () => Promise<void>;
  isLoading: boolean;
  updateUser: (userData: Partial<User>) => Promise<void>;
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
        onRetry: (attempt, error) => {
          console.log(`Storage retry attempt ${attempt}/3 for loading user:`, error.message);
        },
      });
      
      if (userData) {
        if (!Array.isArray(userData.registeredServices)) {
          userData.registeredServices = [];
        }
        
        // Check if tokens exist and if refresh token is expired (30 days)
        // Only clear user data if refresh token is actually expired, not if access token is expired
        try {
          const { tokenManager } = await import('@/utils/tokenManager');
          
          // First, check if tokens exist at all (don't validate yet, just check existence)
          const tokenData = await tokenManager.getStoredToken();
          
          if (!tokenData) {
            // No tokens found at all - user needs to login
            console.log('📱 AuthContext: No tokens found, clearing user data');
            try {
              await storage.removeItem('user', { maxRetries: 2 });
            } catch (error) {
              console.error('Error removing user data:', error);
            }
            setUser(null);
            return;
          }
          
          // Check if refresh token is expired (30 days) - this is the only case where we should logout
          const now = Date.now();
          if (tokenData.refreshTokenExpiresAt && tokenData.refreshTokenExpiresAt <= now) {
            // Refresh token expired after 30 days - user must login again
            console.log('📱 AuthContext: Refresh token expired (30 days), clearing user data');
            try {
              await storage.removeItem('user', { maxRetries: 2 });
            } catch (error) {
              console.error('Error removing user data:', error);
            }
            setUser(null);
            return;
          }
          
          // Tokens exist and refresh token is still valid - load user
          // Access token might be expired, but that's fine - it will be refreshed on first API call
          console.log('📱 AuthContext: Loading user from storage (tokens valid):', { 
            id: userData.id, 
            phone: userData.phone, 
            role: userData.role,
            fullName: userData.fullName || userData.full_name 
          });
          
          setUser(userData);
          
          // Optionally, try to refresh access token in the background (non-blocking)
          // This ensures we have a fresh token ready for API calls
          // Wrap in try-catch to prevent unhandled promise rejections
          (async () => {
            try {
              await tokenManager.getValidToken();
            } catch (error) {
              // Ignore errors - token refresh will happen on first API call if needed
              // This is just an optimization to have a fresh token ready
              // Errors are expected if backend is down or network is unavailable
            }
          })();
          
        } catch (tokenError: any) {
          // If we can't check tokens (e.g., storage error), still load user
          // Token validation will happen on first API call
          const isTimeout = tokenError instanceof Error && tokenError.message.includes('timeout');
          if (isTimeout) {
            console.log('📱 AuthContext: Token check timeout, loading user anyway (will validate on first API call)');
          } else {
            console.warn('📱 AuthContext: Error checking tokens, loading user anyway (will validate on first API call):', tokenError?.message || tokenError);
          }
          // Load user anyway - token validation will happen on first API call
          setUser(userData);
        }
      } else {
        // No user data - don't check tokens to avoid triggering refresh during signup
        setUser(null);
      }
    } catch (error) {
      console.error('Error loading user:', error);
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
      if (!Array.isArray(userData.registeredServices)) {
        userData.registeredServices = [];
      }
      
      console.log('💾 AuthContext: Saving user data:', { 
        id: userData.id, 
        phone: userData.phone, 
        role: userData.role,
        fullName: userData.fullName || userData.full_name 
      });
      
      // Save user data with retry mechanism (critical priority - never expires)
      await storage.setJSON('user', userData, {
        maxRetries: 3,
        priority: 'critical',
        onRetry: (attempt, error) => {
          console.log(`Storage retry attempt ${attempt}/3 for saving user:`, error.message);
        },
      });
      
      setUser(userData);
      
      // Save token separately if provided (for backward compatibility)
      if (userData.token) {
        await storage.setItem('token', userData.token, {
          maxRetries: 3,
          onRetry: (attempt, error) => {
            console.log(`Storage retry attempt ${attempt}/3 for saving token:`, error.message);
          },
        });
      }

      // Note: Push notifications don't work in Expo Go SDK 53+
      // Real-time notifications work via Socket.io (already implemented)
    } catch (error) {
      console.error('Error saving user:', error);
      throw error; // Re-throw to allow caller to handle
    }
  };

  const logout = async () => {
    try {
      // Note: Socket.io cleanup handled by NotificationContext
      
      // Clear all storage data except language preferences with retry
      const allKeys = await storage.getAllKeys({
        maxRetries: 2,
        onRetry: (attempt, error) => {
          console.log(`Storage retry attempt ${attempt}/2 for getting keys:`, error.message);
        },
      });
      
      const keysToKeep = ['selectedLanguage'];
      const keysToRemove = allKeys.filter(key => !keysToKeep.includes(key));
      
      if (keysToRemove.length > 0) {
        await storage.multiRemove(keysToRemove, {
          maxRetries: 3,
          onRetry: (attempt, error) => {
            console.log(`Storage retry attempt ${attempt}/3 for removing keys:`, error.message);
          },
        });
      }
      
      // Reset user state
      setUser(null);
      
    } catch (error) {
      console.error('❌ Error during logout:', error);
      // Even if there's an error, we should still clear the user state
      setUser(null);
    }
  };

  // Set global logout function for API utility
  useEffect(() => {
    setGlobalLogout(logout);
  }, []);

  const clearAllAppData = async () => {
    try {
      // Get all storage keys with retry
      const allKeys = await storage.getAllKeys({
        maxRetries: 2,
        onRetry: (attempt, error) => {
          console.log(`Storage retry attempt ${attempt}/2 for getting keys:`, error.message);
        },
      });
      
      // Keep only essential keys that shouldn't be cleared (like language preferences)
      const keysToKeep = ['selectedLanguage'];
      const keysToRemove = allKeys.filter(key => !keysToKeep.includes(key));
      
      if (keysToRemove.length > 0) {
        await storage.multiRemove(keysToRemove, {
          maxRetries: 3,
          onRetry: (attempt, error) => {
            console.log(`Storage retry attempt ${attempt}/3 for removing keys:`, error.message);
          },
        });
      }
      
    } catch (error) {
      console.error('❌ Error clearing app data:', error);
    }
  };

  const updateUser = async (userData: Partial<User>) => {
    if (user) {
      const updatedUser = { ...user, ...userData };
      if (!Array.isArray(updatedUser.registeredServices)) {
        updatedUser.registeredServices = [];
      }
      try {
        await storage.setJSON('user', updatedUser, {
          maxRetries: 3,
          priority: 'critical',
          onRetry: (attempt, error) => {
            console.log(`Storage retry attempt ${attempt}/3 for updating user:`, error.message);
          },
        });
        setUser(updatedUser);
      } catch (error) {
        console.error('Error updating user:', error);
        throw error; // Re-throw to allow caller to handle
      }
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading, updateUser, clearAllAppData }}>
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