import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface LabourAccessData {
  hasAccess: boolean;
  accessStatus: string;
  startDate: string;
  endDate: string;
  daysRemaining: number;
  isExpired: boolean;
}

interface LabourAccessContextType {
  labourAccessStatus: LabourAccessData | null;
  setLabourAccessStatus: (status: LabourAccessData | null) => void;
  /**
   * Whether the first access check has completed (backend or local).
   * Used by UI to avoid showing wrong state while loading.
   */
  isInitialized: boolean;
  /**
   * Refresh labour access status from backend (with local fallback).
   */
  checkLabourAccess: () => Promise<void>;
  /**
   * Grant access locally (used by payment/test flows).
   */
  grantLabourAccess: () => Promise<void>;
  /**
   * Clear all stored labour access state.
   */
  clearLabourAccess: () => Promise<void>;
}

const LabourAccessContext = createContext<LabourAccessContextType | undefined>(undefined);

export const useLabourAccess = () => {
  const context = useContext(LabourAccessContext);
  if (!context) {
    throw new Error('useLabourAccess must be used within a LabourAccessProvider');
  }
  return context;
};

export const LabourAccessProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [labourAccessStatus, setLabourAccessStatus] = useState<LabourAccessData | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const appState = useRef(AppState.currentState);

  /**
   * Core helper to map API response into our internal LabourAccessData shape.
   */
  const mapApiToLabourAccessData = (apiData: any): LabourAccessData => {
    const startDate = apiData.startDate || apiData.labour_access_start_date || null;
    const endDate = apiData.endDate || apiData.labour_access_end_date || null;

    const now = new Date();
    const end = endDate ? new Date(endDate) : null;

    let isExpired = !!apiData.isExpired;
    let daysRemaining = typeof apiData.daysRemaining === 'number' ? apiData.daysRemaining : 0;

    if (end) {
      if (end <= now) {
        isExpired = true;
        daysRemaining = 0;
      } else {
        const diffTime = end.getTime() - now.getTime();
        daysRemaining = Math.max(
          0,
          Math.ceil(diffTime / (1000 * 60 * 60 * 24))
        );
      }
    }

    const hasAccess =
      typeof apiData.hasAccess === 'boolean'
        ? apiData.hasAccess && !isExpired
        : apiData.accessStatus === 'active' && !isExpired;

    return {
      hasAccess,
      accessStatus: apiData.accessStatus || apiData.labour_access_status || 'inactive',
      startDate,
      endDate,
      daysRemaining,
      isExpired,
    };
  };

  /**
   * Check labour access, loading local cache first for instant UI, then updating from backend.
   * This ensures the UI shows the correct state immediately without waiting for network.
   */
  const checkLabourAccess = async () => {
    try {
      // STEP 1: Load local cache FIRST for instant UI (synchronous, fast)
      // This ensures the UI shows the correct state immediately without waiting for network
      const localAccessData = await AsyncStorage.getItem('labour_access_status');
      if (localAccessData) {
        try {
          const parsedData = JSON.parse(localAccessData);
          const mapped = mapApiToLabourAccessData(parsedData);

          // If expired, clear it; otherwise use it immediately
          if (mapped.isExpired || !mapped.hasAccess) {
            await AsyncStorage.removeItem('labour_access_status');
            setLabourAccessStatus(mapped.hasAccess ? mapped : null);
          } else {
            // Set local data immediately so UI shows correct state right away
            setLabourAccessStatus(mapped);
          }
        } catch (parseError) {
          // Invalid local data, clear it
          await AsyncStorage.removeItem('labour_access_status');
          setLabourAccessStatus(null);
        }
      } else {
        setLabourAccessStatus(null);
      }

      // Mark as initialized IMMEDIATELY after loading local cache
      // This allows UI to show the correct state right away
      setIsInitialized(true);

      // STEP 2: Fetch from backend in the background and update if different
      // This happens asynchronously and doesn't block the UI
      // BUT: Only make the API call if we have valid tokens (avoid unnecessary 401 errors)
      try {
        // Check if tokens exist before making API call
        // This prevents unnecessary 401 errors when tokens are expired
        const { tokenManager } = await import('@/utils/tokenManager');
        const tokenData = await tokenManager.getStoredToken();
        
        // Only make API call if tokens exist and refresh token is not expired
        if (tokenData && tokenData.refreshToken) {
          const now = Date.now();
          const refreshTokenExpired = tokenData.refreshTokenExpiresAt && 
                                      tokenData.refreshTokenExpiresAt <= now;
          
          // Skip API call if refresh token is expired (30 days) - user will be logged out anyway
          if (!refreshTokenExpired) {
            const { apiGet } = await import('@/utils/apiClient');
            const response = await apiGet('/api/payments/labour-access-status');

            if (response.ok && response.data && response.data.status === 'success') {
              const apiData = response.data.data;
              if (apiData) {
                const mapped = mapApiToLabourAccessData(apiData);
                await AsyncStorage.setItem('labour_access_status', JSON.stringify(mapped));
                // Update state with backend data (may be same as local, but ensures consistency)
                setLabourAccessStatus(mapped);
              }
            }
          }
          // If refresh token is expired, skip API call - user will be logged out on next API call
          // Just keep using local cache
        }
        // If no tokens exist, skip API call - user needs to login first
        // Just keep using local cache
      } catch (apiError: any) {
        // Handle "Session expired" errors silently (expected after 30 days - logout will happen)
        const isSessionExpired = apiError?.message === 'Session expired' || 
                                 apiError?.status === 401 && apiError?.message?.includes('Session expired') ||
                                 apiError?._suppressUnhandled === true ||
                                 apiError?._handled === true;
        
        if (isSessionExpired) {
          // Session expired is expected behavior after 30 days - don't log as error
          // The apiClient already handles logout, we just keep using local cache
          // Suppress the error completely to prevent unhandled rejection
          return; // Exit early, don't log anything
        } else {
          // Other errors (network, etc.) - log but keep using local cache
          // This is fine - local cache is still valid for offline use
          console.warn('Error fetching labour access from API (using local cache):', apiError?.message || apiError);
        }
        // Don't update state on error - keep using local cache that was already set
      }
    } catch (error) {
      console.error('Error checking labour access:', error);
      setLabourAccessStatus(null);
      // Still mark as initialized even on error, so UI doesn't stay in loading state
      setIsInitialized(true);
    }
  };

  const grantLabourAccess = async () => {
    try {
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 7);
      const labourAccessData: LabourAccessData = {
        hasAccess: true,
        accessStatus: 'active',
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        daysRemaining: 7,
        isExpired: false
      };
      await AsyncStorage.setItem('labour_access_status', JSON.stringify(labourAccessData));
      setLabourAccessStatus(labourAccessData);
    } catch (error) {
      console.error('Error granting labour access:', error);
    }
  };

  const clearLabourAccess = async () => {
    try {
      await AsyncStorage.removeItem('labour_access_status');
      setLabourAccessStatus(null);
    } catch (error) {
      console.error('Error clearing labour access:', error);
    }
  };

  useEffect(() => {
    // Wrap in error handler to prevent unhandled promise rejections
    checkLabourAccess().catch((error) => {
      // Errors are already handled in checkLabourAccess, but catch here to prevent unhandled rejections
      console.warn('checkLabourAccess error (handled):', error?.message || error);
    });
  }, []);

  const handleAppStateChange = (nextAppState: AppStateStatus) => {
    if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
      // Wrap in error handler to prevent unhandled promise rejections
      checkLabourAccess().catch((error) => {
        // Errors are already handled in checkLabourAccess, but catch here to prevent unhandled rejections
        console.warn('checkLabourAccess error on app state change (handled):', error?.message || error);
      });
    }
    appState.current = nextAppState;
  };

  useEffect(() => {
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription?.remove();
  }, []);

  const value: LabourAccessContextType = {
    labourAccessStatus,
    setLabourAccessStatus,
    isInitialized,
    checkLabourAccess,
    grantLabourAccess,
    clearLabourAccess,
  };

  return (
    <LabourAccessContext.Provider value={value}>
      {children}
    </LabourAccessContext.Provider>
  );
};
