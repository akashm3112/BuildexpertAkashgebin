import { Stack } from 'expo-router';
import React from 'react';
import { StyleSheet, View, Image, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';

export default function NotFoundScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const handlePress = () => {
    if (user) {
      router.replace('/(tabs)');
    } else {
      router.replace('/(auth)/login');
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: ' ' }} />
      <View style={styles.container}>
        <Pressable onPress={handlePress} hitSlop={20}>
          <Image
            source={require('../assets/images/icon.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
  },
  logo: {
    width: 390,
    height: 390,
  },
});
