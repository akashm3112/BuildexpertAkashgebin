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
        if (user.role === 'admin') {
          setTimeout(() => {
            router.replace('/admin/dashboard');
          }, 100);
        } else {
          setTimeout(() => {
            router.replace('/(tabs)');
          }, 100);
        }
      } else {
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