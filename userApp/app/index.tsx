import { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { LoadingSpinner } from '@/components/LoadingSpinner';

export default function Index() {
  const { user, isLoading } = useAuth();

  // After auth loads, redirect to the proper screen immediately
  if (!isLoading) {
    if (user) {
      return <Redirect href="/(tabs)" />;
    }
    return <Redirect href="/(auth)/login" />;
  }

  // Show loading spinner while auth is loading
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
