import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useAuth } from './AuthContext';
import { io as socketIOClient, Socket } from 'socket.io-client';
import { API_BASE_URL } from '@/constants/api';

interface BookingContextType {
  unreadCount: number;
  fetchUnreadCount: () => Promise<void>;
  refreshBookings: () => void;
  resetBookingState: () => void;
}

const BookingContext = createContext<BookingContextType | undefined>(undefined);

export function BookingProvider({ children }: { children: React.ReactNode }) {
  const { user, logout, isLoading: authLoading } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const appState = useRef(AppState.currentState);
  const socketRef = useRef<Socket | null>(null);

  // Fetch unread count from API
  const fetchUnreadCount = async () => {
    if (!user?.id) return;
    
    // Skip API call if user doesn't have provider role (prevents 403 errors)
    // This can happen if admin accesses provider app
    if (user?.role && user.role !== 'provider') {
      setUnreadCount(0);
      return;
    }
    
    try {
      // Use API client for automatic token management and error handling
      const { apiGet } = await import('@/utils/apiClient');
      const response = await apiGet('/api/providers/bookings/unread-count');

      if (response.ok && response.data && response.data.status === 'success') {
        setUnreadCount(response.data.data.unreadCount);
      }
    } catch (error: any) {
      // Mark error as handled to prevent unhandled promise rejection warnings
      const isNetworkError = error?.message?.includes('Network request failed') ||
                            error?.message?.includes('timeout') ||
                            error?.isNetworkError === true;
      
      const isSessionExpired = error?.message === 'Session expired' || 
                               error?.status === 401 && error?.message?.includes('Session expired') ||
                               error?._suppressUnhandled === true ||
                               error?._handled === true;
      
      // 403 (Access forbidden) is expected if user doesn't have provider role
      // This can happen if admin accesses provider app or user role is incorrect
      const isAccessForbidden = error?.status === 403 || 
                                error?.message?.includes('Access forbidden') ||
                                error?.message?.includes('Forbidden');
      
      // Mark all errors as handled to prevent unhandled rejection warnings
      if (!error?._handled) {
        (error as any)._handled = true;
        (error as any)._suppressUnhandled = true;
      }
      
      // Errors are handled silently (network, session, and access forbidden are expected)
      
      // Silently handle access forbidden - user may not have provider role
      // Set count to 0 as fallback
      if (isAccessForbidden) {
        setUnreadCount(0);
      }
    }
  };

  // Refresh bookings (placeholder for future use)
  const refreshBookings = () => {
    fetchUnreadCount().catch((error) => {
      // Errors are already handled in fetchUnreadCount
      const isSessionExpired = error?.message === 'Session expired' || 
                               error?.status === 401 && error?.message?.includes('Session expired');
      const isServerError = error?.status === 500 || 
                           error?.isServerError === true ||
                           error?.message?.includes('Database operation failed') ||
                           error?.message?.includes('Service temporarily unavailable');
      
      // Errors are handled silently
    });
  };

  // Reset booking state on logout
  const resetBookingState = () => {
    setUnreadCount(0);
  };

  // Handle app state changes (foreground/background)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active' &&
        user?.id
      ) {
        // App has come to foreground, refresh unread count
        fetchUnreadCount().catch((error) => {
          // Errors are already handled in fetchUnreadCount, but catch here to prevent unhandled rejections
          const isSessionExpired = error?.message === 'Session expired' || 
                                   error?.status === 401 && error?.message?.includes('Session expired');
          const isServerError = error?.status === 500 || 
                               error?.isServerError === true ||
                               error?.message?.includes('Database operation failed') ||
                               error?.message?.includes('Service temporarily unavailable');
          
          // Errors are handled silently
        });
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [user?.id]);

  // Setup socket connection for real-time updates
  useEffect(() => {
    if (!user?.id || authLoading) {
      // Clean up socket if user logs out
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }

    // Initialize socket connection
    // CRITICAL: Use polling as fallback for mobile data networks
    socketRef.current = socketIOClient(`${API_BASE_URL}`, {
      transports: ['polling', 'websocket'], // Try polling first, upgrade to websocket if available
      upgrade: true, // Allow upgrade from polling to websocket
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      forceNew: false,
    });

    const socket = socketRef.current;

    socket.on('connect', () => {
      socket.emit('join', user.id);
    });

    // Listen for booking creation (new booking for provider)
    socket.on('booking_created', () => {
      fetchUnreadCount().catch((error) => {
        // Errors are already handled in fetchUnreadCount, but catch here to prevent unhandled rejections
        const isSessionExpired = error?.message === 'Session expired' || 
                                 error?.status === 401 && error?.message?.includes('Session expired');
        const isServerError = error?.status === 500 || 
                             error?.isServerError === true ||
                             error?.message?.includes('Database operation failed') ||
                             error?.message?.includes('Service temporarily unavailable');
        
        // Errors are handled silently
      });
    });

    // Listen for booking updates (cancelled bookings)
    socket.on('booking_updated', () => {
      fetchUnreadCount().catch((error) => {
        // Errors are already handled in fetchUnreadCount, but catch here to prevent unhandled rejections
        const isSessionExpired = error?.message === 'Session expired' || 
                                 error?.status === 401 && error?.message?.includes('Session expired');
        const isServerError = error?.status === 500 || 
                             error?.isServerError === true ||
                             error?.message?.includes('Database operation failed') ||
                             error?.message?.includes('Service temporarily unavailable');
        
        // Errors are handled silently
      });
    });

    // Listen for unread count update events (more efficient than listening to all booking events)
    socket.on('booking_unread_count_update', () => {
      fetchUnreadCount().catch((error) => {
        // Errors are already handled in fetchUnreadCount, but catch here to prevent unhandled rejections
        const isSessionExpired = error?.message === 'Session expired' || 
                                 error?.status === 401 && error?.message?.includes('Session expired');
        const isServerError = error?.status === 500 || 
                             error?.isServerError === true ||
                             error?.message?.includes('Database operation failed') ||
                             error?.message?.includes('Service temporarily unavailable');
        
        // Errors are handled silently
      });
    });

    socket.on('disconnect', () => {
      // Socket disconnected - expected when backend is off
    });

    socket.on('connect_error', (error: any) => {
      // Suppress socket connection errors - they're expected when backend is off
      // Don't log or show errors to user
    });

    // Initial fetch
    fetchUnreadCount().catch((error) => {
      // Errors are already handled in fetchUnreadCount, but catch here to prevent unhandled rejections
      const isSessionExpired = error?.message === 'Session expired' || 
                               error?.status === 401 && error?.message?.includes('Session expired');
      const isServerError = error?.status === 500 || 
                           error?.isServerError === true ||
                           error?.message?.includes('Database operation failed') ||
                           error?.message?.includes('Service temporarily unavailable');
      
      // Errors are handled silently
    });

    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, [user?.id, authLoading]);

  // Reset state when user logs out
  useEffect(() => {
    if (!user?.id && !authLoading) {
      resetBookingState();
    }
  }, [user?.id, authLoading]);

  return (
    <BookingContext.Provider
      value={{
        unreadCount,
        fetchUnreadCount,
        refreshBookings,
        resetBookingState
      }}
    >
      {children}
    </BookingContext.Provider>
  );
}

export function useBookings() {
  const context = useContext(BookingContext);
  if (context === undefined) {
    throw new Error('useBookings must be used within a BookingProvider');
  }
  return context;
}

