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
        onRetry: (attempt, error) => {
          console.log(`Storage retry attempt ${attempt}/3 for loading user:`, error.message);
        },
      });
      
      if (userData) {
        // Verify that tokens exist in TokenManager
        const { tokenManager } = await import('@/utils/tokenManager');
        const hasValidToken = await tokenManager.isTokenValid();
        
        if (!hasValidToken) {
          // Tokens don't exist or are invalid, clear user data
          console.log('📱 AuthContext: No valid tokens found, clearing user data');
          try {
            await storage.removeItem('user', { maxRetries: 2 });
          } catch (error) {
            console.error('Error removing user data:', error);
          }
          setUser(null);
        } else {
          console.log('📱 AuthContext: Loading user from storage:', { 
            id: userData.id, 
            phone: userData.phone, 
            role: userData.role,
            fullName: userData.fullName || userData.full_name 
          });
          
          setUser(userData);
        }
      } else {
        // No user data, ensure tokens are also cleared
        const { tokenManager } = await import('@/utils/tokenManager');
        const hasValidToken = await tokenManager.isTokenValid();
        if (!hasValidToken) {
          // Already cleared, nothing to do
        }
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

  const updateUser = async (userData: Partial<User>) => {
    if (user) {
      const updatedUser = { ...user, ...userData };
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

  const acceptTerms = async () => {
    if (user) {
      const updatedUser = { ...user, hasAcceptedTerms: true };
      try {
        await storage.setJSON('user', updatedUser, {
          maxRetries: 3,
          priority: 'critical',
          onRetry: (attempt, error) => {
            console.log(`Storage retry attempt ${attempt}/3 for accepting terms:`, error.message);
          },
        });
        setUser(updatedUser);
      } catch (error) {
        console.error('Error accepting terms:', error);
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