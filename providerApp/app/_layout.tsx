import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { AuthProvider } from '@/context/AuthContext';
import { NotificationProvider } from '@/context/NotificationContext';
import { LanguageProvider } from '@/context/LanguageContext';
import { CallScreen } from '@/components/calls/CallScreen';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import * as SplashScreen from 'expo-splash-screen';
import { globalErrorHandler } from '@/utils/globalErrorHandler';
import { requestQueue } from '@/utils/requestQueue';
import { frontendMonitor } from '@/utils/monitoring';
import { connectionRecovery } from '@/utils/connectionRecovery';

/**
 * ROOT LAYOUT - Navigation Structure
 * 
 * This app handles both Provider and Admin roles in a single app structure:
 * - Provider routes: /(tabs)/* (Home, Services, Bookings, Notifications, Profile)
 * - Admin routes: /admin/* (Dashboard, User Reports, Provider Reports)
 * - Auth routes: /auth/* (Login, Signup, OTP, Terms)
 * 
 * NAVIGATION FIXES IMPLEMENTED:
 * - BackHandler prevents cross-role navigation
 * - router.replace() properly handles navigation stack reset on logout (no dismissAll needed)
 * - Proper role-based routing in index.tsx
 * 
 * IMPORTANT: Back button behavior is now properly isolated between roles
 * to prevent the bug where admin users could navigate back to provider screens.
 */

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useFrameworkReady();

  // Initialize global error handler, request queue, monitoring, and connection recovery on mount
  useEffect(() => {
    globalErrorHandler.initialize();
    frontendMonitor.initialize();
    // Request queue initializes automatically on import
    // Connection recovery initializes automatically on import and starts monitoring
    // It will automatically recover connections when network is restored or app comes to foreground
  }, []);

  const [fontsLoaded, fontError] = useFonts({
    'Inter-Regular': Inter_400Regular,
    'Inter-Medium': Inter_500Medium,
    'Inter-SemiBold': Inter_600SemiBold,
    'Inter-Bold': Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

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
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="auth" />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="admin/dashboard" />
              <Stack.Screen name="admin/user-reports" />
              <Stack.Screen name="admin/provider-reports" />
              <Stack.Screen name="admin/monitoring" />
              <Stack.Screen name="service-registration/[category]" />
              <Stack.Screen name="edit-profile" />
              <Stack.Screen name="payment" />
              <Stack.Screen name="+not-found" />
            </Stack>
            <StatusBar style="auto" />
            <CallScreen />
          </LanguageProvider>
        </NotificationProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}