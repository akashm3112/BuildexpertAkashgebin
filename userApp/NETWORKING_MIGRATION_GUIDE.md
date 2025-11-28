# Networking Migration Guide

## Overview

The app now uses a robust API client with automatic retries, timeouts, error handling, and request/response interceptors. This replaces direct `fetch()` calls throughout the codebase.

## Benefits

1. **Automatic Retries**: Failed requests are automatically retried with exponential backoff
2. **Timeout Handling**: All requests have a 30-second timeout (configurable)
3. **Error Normalization**: All errors are normalized into a consistent format
4. **Global Error Handling**: Centralized error handling for network issues
5. **Request/Response Interceptors**: Automatic token injection and response parsing
6. **Better UX**: No more blank screens on network failures

## Migration Steps

### Step 1: Import the API Client

```typescript
// Old way
import { API_BASE_URL } from '@/constants/api';

// New way
import { apiGet, apiPost, apiPut, apiDelete, ApiError } from '@/utils/api';
// or use the full client
import { apiRequest } from '@/utils/apiClient';
```

### Step 2: Replace Direct Fetch Calls

#### Example 1: Simple GET Request

**Before:**
```typescript
const response = await fetch(`${API_BASE_URL}/api/bookings`, {
  headers: {
    'Authorization': `Bearer ${token}`,
  },
});

if (response.ok) {
  const data = await response.json();
  // handle data
} else {
  // handle error
}
```

**After:**
```typescript
try {
  const response = await apiGet('/api/bookings');
  const data = response.data;
  // handle data - response.data is already parsed
} catch (error: ApiError) {
  // handle error - already normalized
  if (error.isNetworkError) {
    // Show network error message
  } else if (error.isTimeout) {
    // Show timeout message
  }
}
```

#### Example 2: POST Request with Body

**Before:**
```typescript
const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  },
  body: JSON.stringify({ phone, password }),
});

const data = await response.json();
if (response.ok) {
  // handle success
} else {
  // handle error
}
```

**After:**
```typescript
try {
  const response = await apiPost('/api/auth/login', {
    phone,
    password,
  });
  // response.data contains the parsed JSON
  // No need to call response.json()
} catch (error: ApiError) {
  // Error is already normalized and logged
  console.error('Login failed:', error.message);
}
```

#### Example 3: Request with Custom Configuration

**Before:**
```typescript
const response = await fetch(`${API_BASE_URL}/api/upload`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
  },
  body: formData,
});
```

**After:**
```typescript
try {
  const response = await apiPost('/api/upload', formData, {
    timeout: 60000, // 60 seconds for uploads
    retries: 2, // Fewer retries for uploads
  });
} catch (error: ApiError) {
  // Handle upload error
}
```

### Step 3: Error Handling

The new API client provides normalized errors with helpful properties:

```typescript
try {
  const response = await apiGet('/api/data');
} catch (error: ApiError) {
  // Check error type
  if (error.isNetworkError) {
    // Network connectivity issue
    showMessage('Please check your internet connection');
  } else if (error.isTimeout) {
    // Request timed out
    showMessage('Request timed out. Please try again.');
  } else if (error.isServerError) {
    // Server error (500-599)
    showMessage('Server error. Please try again later.');
  } else if (error.isClientError) {
    // Client error (400-499)
    showMessage(error.message || 'Invalid request');
  }
  
  // Access error details
  console.error('Status:', error.status);
  console.error('Code:', error.code);
  console.error('Data:', error.data);
}
```

### Step 4: Setting Up Global Error Handler

In your app's root component or initialization:

```typescript
import { setGlobalErrorHandler, setGlobalLogout } from '@/utils/api';
import { logout } from '@/utils/logout';

// Set up global error handler
setGlobalErrorHandler((error: ApiError) => {
  // Log error
  console.error('Global API error:', error);
  
  // Show user-friendly message
  if (error.isNetworkError) {
    Alert.alert('Connection Error', 'Please check your internet connection');
  } else if (error.isTimeout) {
    Alert.alert('Timeout', 'Request took too long. Please try again.');
  }
  // Don't show alerts for 401/403 - handled by logout
});

// Set up global logout (for 401 errors)
setGlobalLogout(async () => {
  await logout();
});
```

## API Reference

### Methods

- `apiGet<T>(endpoint: string, config?: RequestConfig): Promise<ApiResponse<T>>`
- `apiPost<T>(endpoint: string, data?: any, config?: RequestConfig): Promise<ApiResponse<T>>`
- `apiPut<T>(endpoint: string, data?: any, config?: RequestConfig): Promise<ApiResponse<T>>`
- `apiPatch<T>(endpoint: string, data?: any, config?: RequestConfig): Promise<ApiResponse<T>>`
- `apiDelete<T>(endpoint: string, config?: RequestConfig): Promise<ApiResponse<T>>`
- `apiRequest<T>(endpoint: string, config?: RequestConfig): Promise<ApiResponse<T>>`

### RequestConfig Options

```typescript
interface RequestConfig extends RequestInit {
  timeout?: number;        // Request timeout in ms (default: 30000)
  retries?: number;        // Number of retries (default: 3)
  retryDelay?: number;     // Base retry delay in ms (default: 1000)
  skipAuth?: boolean;      // Skip automatic token injection
  skipErrorHandling?: boolean; // Skip global error handler
  // ... all standard RequestInit options
}
```

### ApiResponse

```typescript
interface ApiResponse<T> {
  data: T;              // Parsed response data
  status: number;       // HTTP status code
  headers: Headers;     // Response headers
  ok: boolean;          // Whether status is 2xx
}
```

### ApiError

```typescript
interface ApiError {
  message: string;      // Error message
  status?: number;      // HTTP status code (if available)
  code?: string;        // Error code
  data?: any;           // Additional error data
  isNetworkError: boolean;  // True if network error
  isTimeout: boolean;       // True if timeout
  isServerError: boolean;   // True if 5xx error
  isClientError: boolean;   // True if 4xx error
}
```

## Common Patterns

### Handling API Response Format

If your API returns `{ status: 'success', data: {...} }`:

```typescript
try {
  const response = await apiGet('/api/endpoint');
  if (response.data.status === 'success') {
    const actualData = response.data.data;
    // Use actualData
  }
} catch (error) {
  // Handle error
}
```

### File Uploads

```typescript
const formData = new FormData();
formData.append('image', {
  uri: imageUri,
  type: 'image/jpeg',
  name: 'photo.jpg',
});

try {
  const response = await apiPost('/api/upload', formData, {
    timeout: 60000, // Longer timeout for uploads
    retries: 1,     // Fewer retries for uploads
  });
} catch (error) {
  // Handle upload error
}
```

### Conditional Retries

```typescript
// Disable retries for non-critical requests
const response = await apiGet('/api/analytics', {
  retries: 0,
});

// More retries for critical requests
const response = await apiGet('/api/payment-status', {
  retries: 5,
  retryDelay: 2000,
});
```

## Migration Checklist

- [ ] Replace all direct `fetch()` calls with API client methods
- [ ] Remove manual token injection (handled automatically)
- [ ] Remove manual error parsing (handled automatically)
- [ ] Update error handling to use `ApiError` type
- [ ] Set up global error handler in app root
- [ ] Set up global logout handler
- [ ] Test network failure scenarios
- [ ] Test timeout scenarios
- [ ] Test retry behavior

## Notes

- The API client automatically handles token injection from AsyncStorage
- 401 errors automatically trigger logout (if `setGlobalLogout` is configured)
- All requests are automatically retried on network errors
- Timeouts are configurable per request
- FormData is automatically handled (no need to set Content-Type)

