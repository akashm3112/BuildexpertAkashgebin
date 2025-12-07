import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { 
  getCurrentLocation, 
  LocationData, 
  clearLocationCache,
  LocationPermissionError,
  LocationServiceError,
  LocationNetworkError
} from '@/services/locationService';

interface LocationContextType {
  location: LocationData | null;
  isLoading: boolean;
  error: string | null;
  fetchLocation: (forceRefresh?: boolean) => Promise<void>;
  clearLocation: () => Promise<void>;
}

const LocationContext = createContext<LocationContextType | undefined>(undefined);

export const useLocation = () => {
  const context = useContext(LocationContext);
  if (!context) {
    throw new Error('useLocation must be used within a LocationProvider');
  }
  return context;
};

interface LocationProviderProps {
  children: ReactNode;
}

export const LocationProvider: React.FC<LocationProviderProps> = ({ children }) => {
  const [location, setLocation] = useState<LocationData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLocation = useCallback(async (forceRefresh: boolean = false) => {
    console.log('🔵 LocationContext: fetchLocation called, forceRefresh:', forceRefresh);
    setIsLoading(true);
    setError(null);

    // Record start time to ensure minimum display duration
    const startTime = Date.now();
    const MIN_LOADING_DURATION = 800; // Minimum 800ms to show loading indicator

    try {
      console.log('🔵 LocationContext: Calling getCurrentLocation...');
      const locationData = await getCurrentLocation(forceRefresh);
      console.log('✅ LocationContext: Location data received:', locationData);
      
      // Calculate elapsed time and wait if needed to show loading indicator
      const elapsedTime = Date.now() - startTime;
      const remainingTime = MIN_LOADING_DURATION - elapsedTime;
      
      if (remainingTime > 0) {
        console.log(`🔵 LocationContext: Waiting ${remainingTime}ms to show loading indicator...`);
        await new Promise(resolve => setTimeout(resolve, remainingTime));
      }
      
      setLocation(locationData);
      setError(null);
    } catch (err) {
      // Handle different error types with user-friendly messages
      // All errors are handled gracefully - using console.warn to avoid triggering global error handler
      let errorMessage: string;
      
      if (err instanceof LocationPermissionError) {
        errorMessage = 'Location permission is required. You can still use the app without location services.';
        console.warn('⚠️ LocationContext: Permission error (handled gracefully):', err.message);
      } else if (err instanceof LocationNetworkError) {
        errorMessage = 'Network error while fetching location. Please check your internet connection.';
        console.warn('⚠️ LocationContext: Network error (handled gracefully):', err.message);
      } else if (err instanceof LocationServiceError) {
        errorMessage = 'Unable to fetch location. You can still use the app without location services.';
        console.warn('⚠️ LocationContext: Service error (handled gracefully):', err.message);
      } else {
        // Handle expo-location specific errors
        const errorMsg = err instanceof Error ? err.message : String(err);
        if (errorMsg.includes('unavailable') || errorMsg.includes('Location services')) {
          errorMessage = 'Location services are unavailable. Please enable location services in your device settings.';
        } else {
          errorMessage = 'Failed to fetch location. You can still use the app.';
        }
        console.warn('⚠️ LocationContext: Unknown error (handled gracefully):', errorMsg);
      }
      
      // Calculate elapsed time and wait if needed
      const elapsedTime = Date.now() - startTime;
      const remainingTime = MIN_LOADING_DURATION - elapsedTime;
      
      if (remainingTime > 0) {
        await new Promise(resolve => setTimeout(resolve, remainingTime));
      }
      
      // Set error but don't block app functionality - location is optional
      setError(errorMessage);
      setLocation(null);
      
      // Note: We don't throw the error - the app continues to work without location
      // This is production-level error handling - graceful degradation
    } finally {
      setIsLoading(false);
      console.log('🔵 LocationContext: fetchLocation completed, isLoading set to false');
    }
  }, []);

  const clearLocation = useCallback(async () => {
    await clearLocationCache();
    setLocation(null);
    setError(null);
  }, []);

  return (
    <LocationContext.Provider
      value={{
        location,
        isLoading,
        error,
        fetchLocation,
        clearLocation,
      }}
    >
      {children}
    </LocationContext.Provider>
  );
};

