import * as Location from 'expo-location';
import { Storage } from '@/utils/storage';

export interface LocationData {
  state: string;
  city: string;
  latitude: number;
  longitude: number;
  timestamp: number;
}

interface CachedLocationData extends LocationData {
  cachedAt: number;
}

const CACHE_KEY = 'user_location_cache';
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
const LOCATION_COORDINATE_THRESHOLD = 0.01; // ~1km - if user moves more than this, invalidate cache

import { API_BASE_URL } from '@/constants/api';

/**
 * Calculate distance between two coordinates (Haversine formula)
 */
const calculateDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
};

/**
 * Reverse geocode coordinates to get state and city using backend API (which proxies LocationIQ)
 */
const reverseGeocodeWithLocationIQ = async (
  latitude: number,
  longitude: number,
  retryCount: number = 0
): Promise<{ state: string; city: string }> => {
  const MAX_RETRIES = 3;
  const baseDelay = 1000; // 1 second base delay

  try {
    // Call backend endpoint which proxies LocationIQ
    const url = `${API_BASE_URL}/api/public/reverse-geocode?latitude=${latitude}&longitude=${longitude}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 429) {
        // Rate limited - retry with exponential backoff
        if (retryCount < MAX_RETRIES) {
          const delay = baseDelay * Math.pow(2, retryCount);
          await new Promise(resolve => setTimeout(resolve, delay));
          return reverseGeocodeWithLocationIQ(latitude, longitude, retryCount + 1);
        }
        throw new Error('Location service is temporarily unavailable. Please try again later.');
      }
      
      const errorText = await response.text();
      let errorMessage = 'Failed to fetch location details';
      
      try {
        const errorData = JSON.parse(errorText);
        errorMessage = errorData.message || errorData.error || errorMessage;
      } catch {
        // If parsing fails, use default message
      }
      
      throw new Error(errorMessage);
    }

    const result = await response.json();
    
    if (result.status !== 'success' || !result.data) {
      throw new Error('Invalid response from location service');
    }

    const { state, city } = result.data;

    if (!state && !city) {
      throw new Error('Could not determine location from coordinates');
    }

    return {
      state: state || 'Unknown',
      city: city || 'Unknown',
    };
  } catch (error) {
    // Retry on network errors with exponential backoff
    if (retryCount < MAX_RETRIES && error instanceof Error) {
      // Check if it's a network error (not a validation error)
      if (
        error.message.includes('Network') ||
        error.message.includes('fetch') ||
        error.message.includes('timeout') ||
        error.message.includes('Failed to fetch')
      ) {
        const delay = baseDelay * Math.pow(2, retryCount);
        await new Promise(resolve => setTimeout(resolve, delay));
        return reverseGeocodeWithLocationIQ(latitude, longitude, retryCount + 1);
      }
    }
    
    throw error;
  }
};

/**
 * Get cached location if valid
 */
const getCachedLocation = async (): Promise<CachedLocationData | null> => {
  try {
    const cached = await Storage.getJSON<CachedLocationData>(CACHE_KEY);
    if (!cached) {
      console.log('💾 No cache found in storage');
      return null;
    }

    const now = Date.now();
    const age = now - cached.cachedAt;
    const ageHours = (age / (1000 * 60 * 60)).toFixed(2);

    // Check if cache is still valid (within 24 hours)
    if (age > CACHE_DURATION_MS) {
      console.log(`💾 Cache expired (age: ${ageHours} hours, max: 24 hours) - removing from cache`);
      await Storage.removeItem(CACHE_KEY);
      return null;
    }

    console.log(`💾 Cache found and valid (age: ${ageHours} hours, max: 24 hours)`);
    return cached;
  } catch (error) {
    console.warn('Error reading location cache:', error);
    return null;
  }
};

/**
 * Check if cached location is still valid based on current coordinates
 */
const isCachedLocationValid = (
  cached: CachedLocationData,
  currentLat: number,
  currentLon: number
): boolean => {
  const distance = calculateDistance(
    cached.latitude,
    cached.longitude,
    currentLat,
    currentLon
  );

  // If user moved more than threshold, cache is invalid
  return distance <= LOCATION_COORDINATE_THRESHOLD * 111; // Convert to km (1 degree ≈ 111 km)
};

/**
 * Cache location data
 */
const cacheLocation = async (location: LocationData): Promise<void> => {
  try {
    const cachedData: CachedLocationData = {
      ...location,
      cachedAt: Date.now(),
    };
    await Storage.setJSON(CACHE_KEY, cachedData, {
      priority: 'normal',
      expiresAt: Date.now() + CACHE_DURATION_MS,
    });
  } catch (error) {
    console.warn('Error caching location:', error);
    // Don't throw - caching failure shouldn't break the flow
  }
};

/**
 * Get current location with caching and retry logic
 */
export const getCurrentLocation = async (
  forceRefresh: boolean = false
): Promise<LocationData> => {
  console.log('🔵 getCurrentLocation called, forceRefresh:', forceRefresh);
  try {
    // Request location permissions
    console.log('🔵 Requesting location permissions...');
    const { status } = await Location.requestForegroundPermissionsAsync();
    console.log('🔵 Location permission status:', status);
    if (status !== 'granted') {
      console.error('❌ Location permission denied');
      throw new Error('Location permission denied');
    }

    // Get current position
    console.log('🔵 Getting current position...');
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced, // Balanced accuracy for better battery life
      maximumAge: 60000, // Accept cached location up to 1 minute old
    });

    const { latitude, longitude } = location.coords;
    console.log('🔵 Got coordinates:', latitude, longitude);

    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      console.log('🔵 Checking cache...');
      const cached = await getCachedLocation();
      if (cached) {
        console.log('🔵 Found cached location:', cached.state, cached.city);
        const cacheAge = Date.now() - cached.cachedAt;
        const cacheAgeHours = (cacheAge / (1000 * 60 * 60)).toFixed(2);
        console.log(`🔵 Cache age: ${cacheAgeHours} hours`);
        
        // Use cached location if it exists and is within 24 hours (no distance check)
        console.log('✅ ✅ ✅ USING CACHED LOCATION - NO API CALL TO LOCATIONIQ ✅ ✅ ✅');
        console.log('📍 Cached location:', {
          state: cached.state,
          city: cached.city,
          cachedAt: new Date(cached.cachedAt).toISOString(),
          ageHours: cacheAgeHours,
        });
        return {
          state: cached.state,
          city: cached.city,
          latitude: cached.latitude,
          longitude: cached.longitude,
          timestamp: cached.timestamp,
        };
      } else {
        console.log('🔵 No cached location found');
        console.log('🌐 Will call LocationIQ API to fetch new location');
      }
    } else {
      console.log('🔵 Force refresh requested - skipping cache');
      console.log('🌐 Will call LocationIQ API to fetch new location');
    }

    // Reverse geocode to get state and city
    console.log('🌐 🌐 🌐 CALLING LOCATIONIQ API (reverse geocoding)... 🌐 🌐 🌐');
    const { state, city } = await reverseGeocodeWithLocationIQ(latitude, longitude);
    console.log('✅ ✅ ✅ LOCATIONIQ API CALL SUCCESSFUL ✅ ✅ ✅');
    console.log('📍 LocationIQ response:', { state, city });

    const locationData: LocationData = {
      state,
      city,
      latitude,
      longitude,
      timestamp: Date.now(),
    };

    // Cache the result
    console.log('💾 Caching location data for 24 hours...');
    await cacheLocation(locationData);
    console.log('✅ Location cached successfully');

    return locationData;
  } catch (error) {
    // If we have cached data, return it even if fresh fetch failed
    const cached = await getCachedLocation();
    if (cached) {
      console.warn('Using cached location due to fetch error:', error);
      return {
        state: cached.state,
        city: cached.city,
        latitude: cached.latitude,
        longitude: cached.longitude,
        timestamp: cached.timestamp,
      };
    }

    // Re-throw error if no cache available
    throw error;
  }
};

/**
 * Clear location cache
 */
export const clearLocationCache = async (): Promise<void> => {
  try {
    await Storage.removeItem(CACHE_KEY);
  } catch (error) {
    console.warn('Error clearing location cache:', error);
  }
};

