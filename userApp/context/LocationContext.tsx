import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { getCurrentLocation, LocationData, clearLocationCache } from '@/services/locationService';

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
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch location';
      console.error('❌ LocationContext: Location fetch error:', err);
      
      // Calculate elapsed time and wait if needed
      const elapsedTime = Date.now() - startTime;
      const remainingTime = MIN_LOADING_DURATION - elapsedTime;
      
      if (remainingTime > 0) {
        await new Promise(resolve => setTimeout(resolve, remainingTime));
      }
      
      setError(errorMessage);
      setLocation(null);
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

