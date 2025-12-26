import * as Location from 'expo-location';
import { Storage } from '@/utils/storage';
import { API_BASE_URL } from '@/constants/api';

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

// Custom error types for better error handling
export class LocationPermissionError extends Error {
  constructor(message: string = 'Location permission denied') {
    super(message);
    this.name = 'LocationPermissionError';
  }
}

export class LocationServiceError extends Error {
  constructor(message: string = 'Location service error') {
    super(message);
    this.name = 'LocationServiceError';
  }
}

export class LocationNetworkError extends Error {
  constructor(message: string = 'Network error while fetching location') {
    super(message);
    this.name = 'LocationNetworkError';
  }
}

const CACHE_KEY = 'user_location_cache';
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

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
    
    // Wrap error in LocationNetworkError for network issues
    if (error instanceof Error) {
      if (
        error.message.includes('Network') ||
        error.message.includes('fetch') ||
        error.message.includes('timeout') ||
        error.message.includes('Failed to fetch')
      ) {
        throw new LocationNetworkError(error.message);
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
      return null;
    }

    const now = Date.now();
    const age = now - cached.cachedAt;
    const ageHours = (age / (1000 * 60 * 60)).toFixed(2);

    // Check if cache is still valid (within 24 hours)
    if (age > CACHE_DURATION_MS) {
      await Storage.removeItem(CACHE_KEY);
      return null;
    }

    return cached;
  } catch (error) {
    return null;
  }
};

// Removed unused functions: calculateDistance and isCachedLocationValid
// Cache is now time-based only (24 hours) as per user requirements

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
    // Don't throw - caching failure shouldn't break the flow
  }
};

/**
 * Get current location with caching and retry logic
 * Handles all errors gracefully and falls back to cache when possible
 */
export const getCurrentLocation = async (
  forceRefresh: boolean = false
): Promise<LocationData> => {
  // Always check cache first (even before permission check) - allows graceful degradation
  if (!forceRefresh) {
    const cached = await getCachedLocation();
    if (cached) {
      // Use cached location if it exists and is within 24 hours
      return {
        state: cached.state,
        city: cached.city,
        latitude: cached.latitude,
        longitude: cached.longitude,
        timestamp: cached.timestamp,
      };
    }
  }

  try {
    // Check if location services are enabled first
    const isLocationEnabled = await Location.hasServicesEnabledAsync();
    if (!isLocationEnabled) {
      // Check cache before throwing error
      const cached = await getCachedLocation();
      if (cached) {
        return {
          state: cached.state,
          city: cached.city,
          latitude: cached.latitude,
          longitude: cached.longitude,
          timestamp: cached.timestamp,
        };
      }
      throw new LocationServiceError('Location services are disabled. Please enable location services in your device settings.');
    }

    // Request location permissions
    let permissionStatus;
    try {
      const permissionResult = await Location.requestForegroundPermissionsAsync();
      permissionStatus = permissionResult.status;
    } catch (permissionError) {
      // Check cache before throwing error
      const cached = await getCachedLocation();
      if (cached) {
        return {
          state: cached.state,
          city: cached.city,
          latitude: cached.latitude,
          longitude: cached.longitude,
          timestamp: cached.timestamp,
        };
      }
      throw new LocationPermissionError('Unable to request location permission. Please enable location access in your device settings.');
    }

    if (permissionStatus !== 'granted') {
      // Check cache before throwing error
      const cached = await getCachedLocation();
      if (cached) {
        return {
          state: cached.state,
          city: cached.city,
          latitude: cached.latitude,
          longitude: cached.longitude,
          timestamp: cached.timestamp,
        };
      }
      throw new LocationPermissionError('Location permission is required to detect your location. You can still use the app without location services.');
    }

    // Get current position
    let location;
    try {
      location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced, // Balanced accuracy for better battery life
      });
    } catch (positionError: any) {
      // Check cache before throwing error
      const cached = await getCachedLocation();
      if (cached) {
        return {
          state: cached.state,
          city: cached.city,
          latitude: cached.latitude,
          longitude: cached.longitude,
          timestamp: cached.timestamp,
        };
      }
      throw new LocationServiceError('Unable to get your current location. Please check your GPS settings and try again.');
    }

    const { latitude, longitude } = location.coords;

    // Reverse geocode to get state and city
    let state: string;
    let city: string;
    try {
      const geocodeResult = await reverseGeocodeWithLocationIQ(latitude, longitude);
      state = geocodeResult.state;
      city = geocodeResult.city;
    } catch (geocodeError: any) {
      // Check cache before throwing error
      const cached = await getCachedLocation();
      if (cached) {
        return {
          state: cached.state,
          city: cached.city,
          latitude: cached.latitude,
          longitude: cached.longitude,
          timestamp: cached.timestamp,
        };
      }
      
      // Determine error type
      if (geocodeError instanceof LocationNetworkError) {
        throw geocodeError;
      } else if (geocodeError.message?.includes('Network') || geocodeError.message?.includes('fetch') || geocodeError.message?.includes('timeout')) {
        throw new LocationNetworkError('Network error while fetching location. Please check your internet connection.');
      } else {
        throw new LocationServiceError('Unable to determine your location. Please try again later.');
      }
    }

    const locationData: LocationData = {
      state,
      city,
      latitude,
      longitude,
      timestamp: Date.now(),
    };

    // Cache the result
    try {
      await cacheLocation(locationData);
    } catch (cacheError) {
      // Don't fail if caching fails - location data is still valid
    }

    return locationData;
  } catch (error) {
    // Final fallback: check cache one more time
    const cached = await getCachedLocation();
    if (cached) {
      return {
        state: cached.state,
        city: cached.city,
        latitude: cached.latitude,
        longitude: cached.longitude,
        timestamp: cached.timestamp,
      };
    }

    // If no cache and error occurred, re-throw with proper error type
    if (error instanceof LocationPermissionError || error instanceof LocationServiceError || error instanceof LocationNetworkError) {
      throw error;
    }
    
    // Wrap unknown errors
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    if (errorMessage.includes('permission') || errorMessage.includes('Permission')) {
      throw new LocationPermissionError('Location permission is required. You can still use the app without location services.');
    } else if (errorMessage.includes('Network') || errorMessage.includes('network') || errorMessage.includes('fetch')) {
      throw new LocationNetworkError('Network error while fetching location. Please check your internet connection.');
    } else {
      throw new LocationServiceError(`Unable to fetch location: ${errorMessage}`);
    }
  }
};

/**
 * Clear location cache
 */
export const clearLocationCache = async (): Promise<void> => {
  try {
    await Storage.removeItem(CACHE_KEY);
  } catch (error) {
    // Error clearing location cache
  }
};

