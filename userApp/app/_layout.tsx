import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { AuthProvider } from '@/context/AuthContext';
import { NotificationProvider } from '@/context/NotificationContext';
import { LanguageProvider } from '@/context/LanguageContext';
import { LabourAccessProvider } from '@/context/LabourAccessContext';
import { CallScreen } from '@/components/calls/CallScreen';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import Toast from 'react-native-toast-message';
import { globalErrorHandler } from '@/utils/globalErrorHandler';
import { requestQueue } from '@/utils/requestQueue';
import { frontendMonitor } from '@/utils/monitoring';

export default function RootLayout() {
  useFrameworkReady();

  // Initialize global error handler, request queue, and monitoring on mount
  React.useEffect(() => {
    globalErrorHandler.initialize();
    frontendMonitor.initialize();
    // Request queue initializes automatically on import
  }, []);

  return (
    <ErrorBoundary
      onError={(error, errorInfo) => {
        // Log to error reporting service in production
        console.error('Root ErrorBoundary caught error:', error, errorInfo);
        // Record error in monitoring
        frontendMonitor.recordError(error, 'ErrorBoundary', errorInfo);
      }}
    >
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
    </ErrorBoundary>
  );
}
