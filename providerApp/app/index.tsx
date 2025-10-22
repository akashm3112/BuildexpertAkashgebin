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
        console.log('🏠 Index: User found!');
        console.log('   User ID:', user.id);
        console.log('   Phone:', user.phone);
        console.log('   Role:', user.role);
        console.log('   Role type:', typeof user.role);
        console.log('   Is admin?', user.role === 'admin');
        console.log('   Full user object keys:', Object.keys(user));
        
        // Navigate based on user role
        if (user.role === 'admin') {
          console.log('👑 Index: Role is "admin" - navigating to /admin/dashboard');
          setTimeout(() => {
            router.replace('/admin/dashboard');
          }, 100);
        } else {
          console.log('👷 Index: Role is "' + user.role + '" - navigating to /(tabs)');
          setTimeout(() => {
            router.replace('/(tabs)');
          }, 100);
        }
      } else {
        console.log('🔐 Index: No user found, redirecting to auth');
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