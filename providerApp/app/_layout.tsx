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
    try {
      globalErrorHandler.initialize();
      frontendMonitor.initialize();
      
      // Set up React Native global error handler (ErrorUtils.setGlobalHandler)
      // This is the ONLY way to catch unhandled promise rejections in React Native
      // React Native doesn't support unhandledrejection event like browsers do
      const originalGlobalHandler = (ErrorUtils as any).getGlobalHandler?.() || 
                                    ((ErrorUtils as any).globalHandler as ((error: Error, isFatal?: boolean) => void) | undefined);
      
      const reactNativeErrorHandler = (error: Error, isFatal?: boolean) => {
        // Check if this is a "Session expired" error
        const isSessionExpired = error?.message === 'Session expired' || 
                                 error?.message?.includes('Session expired') ||
                                 (error as any)?.status === 401 && error?.message?.includes('Session expired');
        
        // Check if this is a database/server error (500) - backend issue, not user's fault
        const isServerError = (error as any)?.status === 500 || 
                             (error as any)?.isServerError === true ||
                             error?.message?.includes('Database operation failed') ||
                             error?.message?.includes('Database') ||
                             (error as any)?.data?.errorCode === 'DATABASE_ERROR' ||
                             (error as any)?.data?.originalError?.includes('column') ||
                             (error as any)?.data?.originalError?.includes('does not exist');
        
        // Check if error is marked as suppressed or handled
        const isSuppressed = (error as any)?._suppressUnhandled === true ||
                            (error as any)?._handled === true;
        
        if (isSessionExpired || isServerError || isSuppressed) {
          // Suppress these errors completely - they're expected or backend issues
          // Don't call the original handler - just suppress the error
          return;
        }
        
        // For other errors, call the original handler
        if (originalGlobalHandler) {
          originalGlobalHandler(error, isFatal);
        } else {
          // Fallback: log to console if no original handler
          console.error('Unhandled error:', error);
        }
      };
      
      // Set the global error handler for React Native
      if ((ErrorUtils as any).setGlobalHandler) {
        (ErrorUtils as any).setGlobalHandler(reactNativeErrorHandler);
      } else if ((ErrorUtils as any).globalHandler !== undefined) {
        (ErrorUtils as any).globalHandler = reactNativeErrorHandler;
      }
      
      // Also set up web unhandled rejection handler (for Expo web/development)
      const rejectionHandler = (event: any) => {
        const error = event?.reason || event;
        const errorObj = error instanceof Error 
          ? error 
          : (typeof error === 'object' && error !== null && 'message' in error)
            ? new Error(error.message || String(error))
            : new Error(String(error));
        
        // Check if this is a "Session expired" error
        const isSessionExpired = errorObj.message === 'Session expired' || 
                                 errorObj.message?.includes('Session expired') ||
                                 (error?.status === 401 && errorObj.message?.includes('Session expired'));
        
        // Check if this is a database/server error (500) - backend issue, not user's fault
        const isServerError = error?.status === 500 || 
                             error?.isServerError === true ||
                             errorObj.message?.includes('Database operation failed') ||
                             errorObj.message?.includes('Database') ||
                             error?.data?.errorCode === 'DATABASE_ERROR' ||
                             error?.data?.originalError?.includes('column') ||
                             error?.data?.originalError?.includes('does not exist');
        
        // Check if error is marked as suppressed or handled
        const isSuppressed = error?._suppressUnhandled === true ||
                            error?._handled === true;
        
        if (isSessionExpired || isServerError || isSuppressed) {
          // Suppress these errors completely - they're expected or backend issues
          // Prevent default logging by stopping propagation
          if (event?.preventDefault) {
            event.preventDefault();
          }
          if (event?.stopPropagation) {
            event.stopPropagation();
          }
          return; // Don't log or handle - just suppress
        }
      };
      
      // Try to set up unhandled rejection handler (works in web/Expo Go)
      if (typeof window !== 'undefined' && typeof window.addEventListener !== 'undefined') {
        window.addEventListener('unhandledrejection', rejectionHandler);
      }
      
      // Request queue initializes automatically on import
      // Connection recovery initializes automatically on import (singleton pattern)
      // It will automatically recover connections when network is restored or app comes to foreground
      
      return () => {
        // Restore original error handler
        if (originalGlobalHandler && (ErrorUtils as any).setGlobalHandler) {
          (ErrorUtils as any).setGlobalHandler(originalGlobalHandler);
        } else if (originalGlobalHandler && (ErrorUtils as any).globalHandler !== undefined) {
          (ErrorUtils as any).globalHandler = originalGlobalHandler;
        }
        
        // Cleanup web handler
        if (typeof window !== 'undefined' && typeof window.removeEventListener !== 'undefined') {
          window.removeEventListener('unhandledrejection', rejectionHandler);
        }
      };
    } catch (error) {
      console.error('Error during app initialization:', error);
      globalErrorHandler.handleError(error instanceof Error ? error : new Error(String(error)), false, 'RootLayout.initialize');
    }
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
              <Stack.Screen name="admin/(admin-tabs)" />
              <Stack.Screen name="admin/dashboard" />
              <Stack.Screen name="admin/reports" />
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