import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { AuthProvider } from '@/context/AuthContext';
import { NotificationProvider } from '@/context/NotificationContext';
import { LanguageProvider } from '@/context/LanguageContext';
import { LabourAccessProvider } from '@/context/LabourAccessContext';
import { CallScreen } from '@/components/calls/CallScreen';
import Toast from 'react-native-toast-message';

export default function RootLayout() {
  useFrameworkReady();

  return (
    <AuthProvider>
      <NotificationProvider>
        <LanguageProvider>
          <LabourAccessProvider>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="+not-found" />
            </Stack>
            <StatusBar style="auto" />
            <CallScreen />
            <Toast />
          </LabourAccessProvider>
        </LanguageProvider>
      </NotificationProvider>
    </AuthProvider>
  );
}
