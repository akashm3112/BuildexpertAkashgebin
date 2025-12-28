// CRITICAL: API_BASE_URL must be set via environment variable in production
const API_BASE_URL_ENV = process.env.EXPO_PUBLIC_API_URL;

if (!API_BASE_URL_ENV) {
  if (__DEV__) {
    // Allow fallback in development
    console.warn('⚠️ EXPO_PUBLIC_API_URL not set, using default development URL');
  } else {
    // Fail in production
    throw new Error('EXPO_PUBLIC_API_URL environment variable is required in production');
  }
}

export const API_BASE_URL = API_BASE_URL_ENV || 'https://buildexpertakashgebin.onrender.com';
