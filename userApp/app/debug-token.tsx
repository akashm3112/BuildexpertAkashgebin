import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

export default function DebugTokenScreen() {
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTokens();
  }, []);

  const loadTokens = async () => {
    try {
      // Get push token
      const token = await Notifications.getExpoPushTokenAsync({
        projectId: 'your-project-id', // This might need to be set
      });
      setPushToken(token.data);

      // Get access token
      const storedToken = await AsyncStorage.getItem('accessToken') || await AsyncStorage.getItem('token');
      setAccessToken(storedToken);
    } catch (error) {
      console.error('Error loading tokens:', error);
      Alert.alert('Error', 'Failed to load tokens');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    // In React Native, you'd use Clipboard API
    Alert.alert('Copied!', `${label} copied to clipboard`);
    // For web/development, you can use navigator.clipboard
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text>Loading tokens...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Debug Tokens</Text>
      
      <View style={styles.section}>
        <Text style={styles.label}>Push Token (Expo):</Text>
        <TouchableOpacity onPress={() => pushToken && copyToClipboard(pushToken, 'Push Token')}>
          <Text style={styles.token}>{pushToken || 'Not available'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Access Token (JWT):</Text>
        <TouchableOpacity onPress={() => accessToken && copyToClipboard(accessToken, 'Access Token')}>
          <Text style={styles.token}>{accessToken ? `${accessToken.substring(0, 50)}...` : 'Not available'}</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.button} onPress={loadTokens}>
        <Text style={styles.buttonText}>Refresh Tokens</Text>
      </TouchableOpacity>

      <View style={styles.instructions}>
        <Text style={styles.instructionsTitle}>How to use:</Text>
        <Text style={styles.instructionsText}>
          1. Copy the Push Token above{'\n'}
          2. Use it with the /send-direct-test endpoint{'\n'}
          3. Or share it to trigger a notification
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  section: {
    marginBottom: 20,
    padding: 15,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    color: '#666',
  },
  token: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#333',
    padding: 10,
    backgroundColor: '#fff',
    borderRadius: 4,
  },
  button: {
    backgroundColor: '#3B82F6',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  instructions: {
    marginTop: 30,
    padding: 15,
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
  },
  instructionsTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  instructionsText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
});

