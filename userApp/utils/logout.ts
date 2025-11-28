import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';

/**
 * Comprehensive logout utility that clears all app data and redirects to auth
 * This can be called from anywhere in the app for a complete logout
 */
export const performCompleteLogout = async () => {
  try {
    
    // Clear all AsyncStorage data except language preferences
    const allKeys = await AsyncStorage.getAllKeys();
    const keysToKeep = ['selectedLanguage'];
    const keysToRemove = allKeys.filter(key => !keysToKeep.includes(key));
    
    if (keysToRemove.length > 0) {
      await AsyncStorage.multiRemove(keysToRemove);
    }
    
    // Navigate to auth screen
    router.replace('/(auth)/login');
    
    
    // Return success
    return { success: true };
  } catch (error) {
    console.error('❌ Error during complete logout:', error);
    
    // Even if there's an error, try to navigate to auth
    try {
      router.replace('/(auth)/login');
    } catch (navError) {
      console.error('❌ Navigation error during logout:', navError);
    }
    
    return { success: false, error };
  }
};

/**
 * Emergency logout - clears everything and forces navigation
 * Use this when the app is in an inconsistent state
 */
export const performEmergencyLogout = async () => {
  try {
    
    // Clear everything from AsyncStorage
    await AsyncStorage.clear();
    
    // Force navigation to auth
    router.replace('/(auth)/login');
    
    return { success: true };
  } catch (error) {
    console.error('❌ Emergency logout error:', error);
    return { success: false, error };
  }
};
