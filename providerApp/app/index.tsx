import { useEffect } from 'react';
import { View, StyleSheet, BackHandler } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { LoadingSpinner } from '@/components/LoadingSpinner';

export default function Index() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading) {
      if (user) {
        // Navigate based on user role
        // Using router.replace() ensures the navigation stack is properly reset
        // This prevents back navigation to previous role's screens
        if (user.role === 'admin') {
          setTimeout(() => {
            // Replace current route with admin tabs
            // This clears any provider screens from the navigation stack
            router.replace('/admin/(admin-tabs)');
          }, 100);
        } else {
          setTimeout(() => {
            // Replace current route with provider tabs
            // This clears any admin screens from the navigation stack
            router.replace('/(tabs)');
          }, 100);
        }
      } else {
        // No user, navigate to auth screen
        router.replace('/auth');
      }
    }
  }, [user, isLoading]);

  // Handle back button press - prevent going back to previous screens
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      // Always prevent back navigation from index screen
      return true;
    });

    return () => backHandler.remove();
  }, []);

  return (
    <View style={styles.container}>
      <LoadingSpinner />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
});