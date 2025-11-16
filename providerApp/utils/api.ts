import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '@/constants/api';
import { tokenManager } from './tokenManager';

// Global logout function - will be set by the app
let globalLogout: (() => Promise<void>) | null = null;

export const setGlobalLogout = (logoutFn: () => Promise<void>) => {
  globalLogout = logoutFn;
};

export const apiRequest = async (
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> => {
  try {
    const token = await tokenManager.getValidToken();
    
    const headers = {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
      ...options.headers,
    };

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    // Handle 401 errors globally - try to refresh token first
    if (response.status === 401) {
      // Try to refresh the token
      const refreshedToken = await tokenManager.forceRefreshToken();
      if (refreshedToken) {
        // Retry the request with the new token
        const retryHeaders = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${refreshedToken}`,
          ...options.headers,
        };
        const retryResponse = await fetch(`${API_BASE_URL}${endpoint}`, {
          ...options,
          headers: retryHeaders,
        });
        return retryResponse;
      }
      
      // If refresh failed, logout
      if (globalLogout) {
        await globalLogout();
      }
    }

    return response;
  } catch (error) {
    console.error('API request error:', error);
    throw error;
  }
};

// Convenience methods
export const apiGet = (endpoint: string) => apiRequest(endpoint);
export const apiPost = (endpoint: string, data?: any) => 
  apiRequest(endpoint, {
    method: 'POST',
    body: data ? JSON.stringify(data) : undefined,
  });
export const apiPut = (endpoint: string, data?: any) => 
  apiRequest(endpoint, {
    method: 'PUT',
    body: data ? JSON.stringify(data) : undefined,
  });
export const apiDelete = (endpoint: string) => 
  apiRequest(endpoint, { method: 'DELETE' });
