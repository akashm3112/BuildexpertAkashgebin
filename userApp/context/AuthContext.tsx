import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setGlobalLogout } from '@/utils/api';
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

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const userData = await AsyncStorage.getItem('user');
      if (userData) {
        const parsed = JSON.parse(userData);
        setUser(parsed);
      }
    } catch (error) {
      console.error('Error loading user:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (userData: User) => {
    try {
      await AsyncStorage.setItem('user', JSON.stringify(userData));
      setUser(userData);
      if (userData.token) {
        await AsyncStorage.setItem('token', userData.token);
      }

      // Note: Push notifications don't work in Expo Go SDK 53+
      // Real-time notifications work via Socket.io (already implemented)
      console.log('📱 Using Socket.io for real-time notifications (Expo Go compatible)');
    } catch (error) {
      console.error('Error saving user:', error);
    }
  };

  const logout = async () => {
    try {
      console.log('🚪 Starting comprehensive logout process...');
      
      // Note: Socket.io cleanup handled by NotificationContext
      console.log('📱 Socket.io notifications will be cleaned up by NotificationContext');
      
      // Clear all AsyncStorage data except language preferences
      const allKeys = await AsyncStorage.getAllKeys();
      const keysToKeep = ['selectedLanguage'];
      const keysToRemove = allKeys.filter(key => !keysToKeep.includes(key));
      
      if (keysToRemove.length > 0) {
        console.log('🧹 Clearing all app data:', keysToRemove.length, 'keys');
        await AsyncStorage.multiRemove(keysToRemove);
      }
      
      // Reset user state
      setUser(null);
      
      console.log('✅ Logout completed successfully - all data cleared');
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
        await AsyncStorage.setItem('user', JSON.stringify(updatedUser));
        setUser(updatedUser);
      } catch (error) {
        console.error('Error updating user:', error);
      }
    }
  };

  const clearAllAppData = async () => {
    try {
      console.log('🧹 Clearing all app data...');
      
      // Get all AsyncStorage keys
      const allKeys = await AsyncStorage.getAllKeys();
      
      // Keep only essential keys that shouldn't be cleared (like language preferences)
      const keysToKeep = ['selectedLanguage'];
      const keysToRemove = allKeys.filter(key => !keysToKeep.includes(key));
      
      if (keysToRemove.length > 0) {
        console.log('🗑️ Removing keys:', keysToRemove);
        await AsyncStorage.multiRemove(keysToRemove);
      }
      
      console.log('✅ All app data cleared successfully');
    } catch (error) {
      console.error('❌ Error clearing app data:', error);
    }
  };

  const acceptTerms = async () => {
    if (user) {
      const updatedUser = { ...user, hasAcceptedTerms: true };
      try {
        await AsyncStorage.setItem('user', JSON.stringify(updatedUser));
        setUser(updatedUser);
      } catch (error) {
        console.error('Error accepting terms:', error);
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