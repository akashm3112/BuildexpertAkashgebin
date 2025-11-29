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
import { connectionRecovery } from '@/utils/connectionRecovery';

export default function RootLayout() {
  useFrameworkReady();

  // Initialize global error handler, request queue, monitoring, and connection recovery on mount
  React.useEffect(() => {
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
                               (error as any)?.status === 401 && error?.message?.includes('Session expired') ||
                               (error as any)?._suppressUnhandled === true ||
                               (error as any)?._handled === true;
      
      if (isSessionExpired) {
        // Suppress "Session expired" errors completely - they're expected after 30 days
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
                               (error?.status === 401 && errorObj.message?.includes('Session expired')) ||
                               error?._suppressUnhandled === true ||
                               error?._handled === true;
      
      if (isSessionExpired) {
        // Suppress "Session expired" errors completely - they're expected after 30 days
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
    // Connection recovery initializes automatically on import and starts monitoring
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
