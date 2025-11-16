import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { setGlobalLogout } from '@/utils/api';
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

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const userData = await AsyncStorage.getItem('user');
      if (userData) {
        const parsed = JSON.parse(userData);
        if (!Array.isArray(parsed.registeredServices)) {
          parsed.registeredServices = [];
        }
        
        // Verify that tokens exist in TokenManager
        const { tokenManager } = await import('@/utils/tokenManager');
        const hasValidToken = await tokenManager.isTokenValid();
        
        if (!hasValidToken) {
          // Tokens don't exist or are invalid, clear user data
          console.log('📱 AuthContext: No valid tokens found, clearing user data');
          await AsyncStorage.removeItem('user');
          setUser(null);
        } else {
          console.log('📱 AuthContext: Loading user from storage:', { 
            id: parsed.id, 
            phone: parsed.phone, 
            role: parsed.role,
            fullName: parsed.fullName || parsed.full_name 
          });
          
          setUser(parsed);
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
  };

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
      
      await AsyncStorage.setItem('user', JSON.stringify(userData));
      setUser(userData);
      if (userData.token) {
        await AsyncStorage.setItem('token', userData.token);
      }

      // Note: Push notifications don't work in Expo Go SDK 53+
      // Real-time notifications work via Socket.io (already implemented)
    } catch (error) {
      console.error('Error saving user:', error);
    }
  };

  const logout = async () => {
    try {
      
      // Note: Socket.io cleanup handled by NotificationContext
      
      // Clear all AsyncStorage data except language preferences
      const allKeys = await AsyncStorage.getAllKeys();
      const keysToKeep = ['selectedLanguage'];
      const keysToRemove = allKeys.filter(key => !keysToKeep.includes(key));
      
      if (keysToRemove.length > 0) {
        await AsyncStorage.multiRemove(keysToRemove);
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
      
      // Get all AsyncStorage keys
      const allKeys = await AsyncStorage.getAllKeys();
      
      // Keep only essential keys that shouldn't be cleared (like language preferences)
      const keysToKeep = ['selectedLanguage'];
      const keysToRemove = allKeys.filter(key => !keysToKeep.includes(key));
      
      if (keysToRemove.length > 0) {
        await AsyncStorage.multiRemove(keysToRemove);
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
        await AsyncStorage.setItem('user', JSON.stringify(updatedUser));
        setUser(updatedUser);
      } catch (error) {
        console.error('Error updating user:', error);
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