import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '@/constants/api';

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
    const token = await AsyncStorage.getItem('token');
    
    const headers = {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
      ...options.headers,
    };

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    // Handle 401 errors globally
    if (response.status === 401) {
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
