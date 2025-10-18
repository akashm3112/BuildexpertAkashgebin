import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';

/**
 * Comprehensive logout utility that clears all app data and redirects to auth
 * This can be called from anywhere in the app for a complete logout
 */
export const performCompleteLogout = async () => {
  try {
    console.log('🚪 Starting complete logout process...');
    
    // Clear all AsyncStorage data except language preferences
    const allKeys = await AsyncStorage.getAllKeys();
    const keysToKeep = ['selectedLanguage'];
    const keysToRemove = allKeys.filter(key => !keysToKeep.includes(key));
    
    if (keysToRemove.length > 0) {
      console.log('🧹 Clearing all app data:', keysToRemove.length, 'keys');
      await AsyncStorage.multiRemove(keysToRemove);
    }
    
    // Navigate to auth screen
    router.replace('/auth');
    
    console.log('✅ Complete logout successful');
    
    // Return success
    return { success: true };
  } catch (error) {
    console.error('❌ Error during complete logout:', error);
    
    // Even if there's an error, try to navigate to auth
    try {
      router.replace('/auth');
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
    console.log('🚨 Performing emergency logout...');
    
    // Clear everything from AsyncStorage
    await AsyncStorage.clear();
    
    // Force navigation to auth
    router.replace('/auth');
    
    console.log('✅ Emergency logout completed');
    return { success: true };
  } catch (error) {
    console.error('❌ Emergency logout error:', error);
    return { success: false, error };
  }
};
