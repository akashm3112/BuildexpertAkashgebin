import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';
import { API_BASE_URL } from '@/constants/api';
import { io as socketIOClient } from 'socket.io-client';
import { AppState, AppStateStatus } from 'react-native';
// import { bookingNotificationService } from '@/services/BookingNotificationService';

interface Notification {
  id: string;
  title: string;
  message: string;
  created_at: string;
  is_read?: boolean;
  read?: boolean;
  formatted_date?: string;
  formatted_time?: string;
  relative_time?: string;
}

interface NotificationContextType {
  unreadCount: number;
  notifications: Notification[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalCount: number;
    hasMore: boolean;
  };
  fetchUnreadCount: () => Promise<void>;
  fetchNotifications: (page?: number, limit?: number) => Promise<void>;
  fetchNotificationHistory: (params?: {
    page?: number;
    limit?: number;
    type?: string;
    dateFrom?: string;
    dateTo?: string;
    readStatus?: 'read' | 'unread';
  }) => Promise<{ notifications: Notification[]; pagination: any; statistics: any }>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  refreshNotifications: () => void;
  resetNotificationState: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user, logout, isLoading: authLoading } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalCount: 0,
    hasMore: false
  });
  const appState = useRef(AppState.currentState);
  const lastFetchTime = useRef<number>(0);
  const fetchInProgress = useRef<boolean>(false);
  const socketRef = useRef<any>(null);
  const DEBOUNCE_DELAY = 500; // 500ms debounce to prevent duplicate fetches

  // Fetch unread count from API
  const fetchUnreadCount = async () => {
    if (!user?.id) return;
    
    try {
      // Use API client for automatic token management and error handling
      const { apiGet } = await import('@/utils/apiClient');
      const response = await apiGet('/api/notifications/unread-count');

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
      
      // Mark all errors as handled to prevent unhandled rejection warnings
      if (!error?._handled) {
        (error as any)._handled = true;
        (error as any)._suppressUnhandled = true;
      }
      
      // Errors are handled silently - network errors are expected when backend is down or network is unavailable
      // Session expired errors are handled by apiClient (logout triggered)
      // Session expired errors are handled by apiClient (logout triggered)
    }
  };

  // Fetch all notifications with debouncing to prevent duplicate fetches
  const fetchNotifications = async (page = 1, limit = 20) => {
    if (!user?.id) return;
    
    // Debounce: Prevent rapid duplicate fetches (within 500ms)
    const now = Date.now();
    if (fetchInProgress.current || (now - lastFetchTime.current < DEBOUNCE_DELAY)) {
      return; // Skip if fetch is in progress or too soon after last fetch
    }
    
    fetchInProgress.current = true;
    lastFetchTime.current = now;
    
    try {
      // Use API client for automatic token management and error handling
      const { apiGet } = await import('@/utils/apiClient');
      const response = await apiGet(`/api/notifications?page=${page}&limit=${limit}`);

      if (response.ok && response.data && response.data.status === 'success') {
        setNotifications(response.data.data.notifications);
        setPagination(response.data.data.pagination);
        // Update unread count based on notifications
        const unread = response.data.data.notifications.filter((n: Notification) => !n.is_read).length;
        setUnreadCount(unread);
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
      
      // Mark all errors as handled to prevent unhandled rejection warnings
      if (!error?._handled) {
        (error as any)._handled = true;
        (error as any)._suppressUnhandled = true;
      }
      
      // Errors are handled silently - network errors are expected when backend is down or network is unavailable
      // Session expired errors are handled by apiClient (logout triggered)
      // Session expired errors are handled by apiClient (logout triggered)
    }
  };

  // Fetch notification history with advanced filtering
  const fetchNotificationHistory = async (params: {
    page?: number;
    limit?: number;
    type?: string;
    dateFrom?: string;
    dateTo?: string;
    readStatus?: 'read' | 'unread';
  } = {}) => {
    if (!user?.id) return { notifications: [], pagination: {}, statistics: {} };
    
    try {
      // Use API client for automatic token management and error handling
      const { apiGet } = await import('@/utils/apiClient');
      
      const queryParams = new URLSearchParams();
      if (params.page) queryParams.append('page', params.page.toString());
      if (params.limit) queryParams.append('limit', params.limit.toString());
      if (params.type) queryParams.append('type', params.type);
      if (params.dateFrom) queryParams.append('dateFrom', params.dateFrom);
      if (params.dateTo) queryParams.append('dateTo', params.dateTo);
      if (params.readStatus) queryParams.append('readStatus', params.readStatus);

      const response = await apiGet(`/api/notifications/history?${queryParams}`);

      if (response.ok && response.data && response.data.status === 'success') {
        return {
          notifications: response.data.data.notifications,
          pagination: response.data.data.pagination,
          statistics: response.data.data.statistics
        };
      }
      return { notifications: [], pagination: {}, statistics: {} };
    } catch (error: any) {
      // Check if it's a "Session expired" error (expected after 30 days)
      const isSessionExpired = error?.message === 'Session expired' || 
                               error?.status === 401 && error?.message?.includes('Session expired') ||
                               error?._suppressUnhandled === true ||
                               error?._handled === true;
      
      // Errors are handled silently - session expired errors are handled by apiClient (logout triggered)
      return { notifications: [], pagination: {}, statistics: {} };
    }
  };

  // Mark individual notification as read
  const markAsRead = async (id: string) => {
    try {
      // Update local state immediately for better UX
      setNotifications(prev =>
        prev.map(notification =>
          notification.id === id ? { ...notification, is_read: true } : notification
        )
      );

      // Update unread count
      setUnreadCount(prev => Math.max(0, prev - 1));

      // Use API client for automatic token management and error handling
      const { apiPut } = await import('@/utils/apiClient');
      const response = await apiPut(`/api/notifications/${id}/mark-read`);

      // 401 errors are handled by apiClient automatically (token refresh or logout)
    } catch (error) {
      // Error marking notification as read
    }
  };

  // Mark all notifications as read
  const markAllAsRead = async () => {
    try {
      // Update local state immediately
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);

      // Use API client for automatic token management and error handling
      const { apiPut } = await import('@/utils/apiClient');
      await apiPut('/api/notifications/mark-all-read');
      
      // Response is handled by apiClient - no need to check status manually
    } catch (error: any) {
      // Check if it's a "Session expired" error (expected after 30 days)
      const isSessionExpired = error?.message === 'Session expired' || 
                               error?.status === 401 && error?.message?.includes('Session expired') ||
                               error?._suppressUnhandled === true ||
                               error?._handled === true;
      
      // Errors are handled silently - session expired errors are handled by apiClient (logout triggered)
      // Revert local state on error (optional - could keep optimistic update)
    }
  };

  // Refresh notifications (for pull-to-refresh)
  const refreshNotifications = () => {
    fetchNotifications();
  };

  const resetNotificationState = () => {
    setUnreadCount(0);
    setNotifications([]);
    setPagination({
      currentPage: 1,
      totalPages: 0,
      totalCount: 0,
      hasMore: false,
    });
  };

  // Handle booking-specific notifications with vibration and sound
  // Temporarily disabled due to expo-haptics plugin issue
  const handleBookingNotification = (data: any) => {
    // TODO: Re-enable when expo-haptics plugin issue is resolved
  };

  // Handle app state changes
  const handleAppStateChange = (nextAppState: AppStateStatus) => {
    if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
      // App has come to foreground, refresh notifications
      fetchUnreadCount().catch((error) => {
        // Errors are already handled in fetchUnreadCount, but catch here to prevent unhandled rejections
        const isSessionExpired = error?.message === 'Session expired' || 
                                 error?.status === 401 && error?.message?.includes('Session expired');
        const isServerError = error?.status === 500 || 
                             error?.isServerError === true ||
                             error?.message?.includes('Database operation failed') ||
                             error?.message?.includes('Database') ||
                             error?.data?.errorCode === 'DATABASE_ERROR';
        // Errors are already handled in fetchUnreadCount, but catch here to prevent unhandled rejections
      });
      fetchNotifications().catch((error) => {
        // Errors are already handled in fetchNotifications, but catch here to prevent unhandled rejections
      });
    }
    appState.current = nextAppState;
  };

  // Initialize push notifications when user logs in
  useEffect(() => {
    if (authLoading || !user?.id) {
      return;
    }

    // Initialize push notifications in the background
    const initPushNotifications = async () => {
      try {
        const { notificationService } = await import('@/services/NotificationService');
        await notificationService.initialize().catch((error) => {
          console.error('Failed to initialize push notifications:', error);
        });
      } catch (error) {
        console.error('Error loading notification service:', error);
      }
    };
    
    initPushNotifications();
  }, [user?.id, authLoading]);

  // Set up real-time notifications via socket.io - wait for auth to finish loading
  useEffect(() => {
    if (authLoading || !user?.id) {
      // Clean up socket if user logs out
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }

    // Prevent duplicate socket connections
    if (socketRef.current) {
      return; // Socket already exists
    }

    const socket = socketIOClient(`${API_BASE_URL}`);
    socketRef.current = socket;
    
    socket.on('connect', () => {
      socket.emit('join', user.id);
    });

    socket.on('notification_created', (data) => {
      
      // Trigger vibration and sound for booking-related notifications
      // Temporarily disabled due to expo-haptics plugin issue
      // if (data && data.type) {
      //   handleBookingNotification(data);
      // }
      
      fetchNotifications().catch((error) => {
        // Errors are already handled in fetchNotifications, but catch here to prevent unhandled rejections
        const isSessionExpired = error?.message === 'Session expired' || 
                                 error?.status === 401 && error?.message?.includes('Session expired');
        const isServerError = error?.status === 500 || 
                             error?.isServerError === true ||
                             error?.message?.includes('Database operation failed') ||
                             error?.message?.includes('Database') ||
                             error?.data?.errorCode === 'DATABASE_ERROR';
        // Errors are already handled in fetchNotifications, but catch here to prevent unhandled rejections
      });
      fetchUnreadCount().catch((error) => {
        // Errors are already handled in fetchUnreadCount, but catch here to prevent unhandled rejections
      });
    });

    socket.on('notification_updated', () => {
      fetchNotifications().catch((error) => {
        // Errors are already handled in fetchNotifications, but catch here to prevent unhandled rejections
        const isSessionExpired = error?.message === 'Session expired' || 
                                 error?.status === 401 && error?.message?.includes('Session expired');
        const isServerError = error?.status === 500 || 
                             error?.isServerError === true ||
                             error?.message?.includes('Database operation failed') ||
                             error?.message?.includes('Database') ||
                             error?.data?.errorCode === 'DATABASE_ERROR';
        // Errors are already handled in fetchNotifications, but catch here to prevent unhandled rejections
      });
      fetchUnreadCount().catch((error) => {
        // Errors are already handled in fetchUnreadCount, but catch here to prevent unhandled rejections
      });
    });

    socket.on('notification_deleted', () => {
      fetchNotifications().catch((error) => {
        // Errors are already handled in fetchNotifications, but catch here to prevent unhandled rejections
        const isSessionExpired = error?.message === 'Session expired' ||
                                 error?.status === 401 && error?.message?.includes('Session expired');
        const isServerError = error?.status === 500 || 
                             error?.isServerError === true ||
                             error?.message?.includes('Database operation failed') ||
                             error?.message?.includes('Database') ||
                             error?.data?.errorCode === 'DATABASE_ERROR';
        // Errors are already handled in fetchNotifications, but catch here to prevent unhandled rejections
      });
      fetchUnreadCount().catch((error) => {
        // Errors are already handled in fetchUnreadCount, but catch here to prevent unhandled rejections
      });
    });

    socket.on('disconnect', () => {
    });

    socket.on('error', (error) => {
      // Notification socket error - handled silently
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [user?.id, authLoading]);

  // Set up app state listener
  useEffect(() => {
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription?.remove();
  }, []);



  // Initial fetch when user changes - wait for auth to finish loading
  useEffect(() => {
    if (!authLoading && user?.id) {
      fetchUnreadCount().catch((error) => {
        // Errors are already handled in fetchUnreadCount, but catch here to prevent unhandled rejections
        const isSessionExpired = error?.message === 'Session expired' || 
                                 error?.status === 401 && error?.message?.includes('Session expired');
        const isServerError = error?.status === 500 || 
                             error?.isServerError === true ||
                             error?.message?.includes('Database operation failed') ||
                             error?.message?.includes('Database') ||
                             error?.data?.errorCode === 'DATABASE_ERROR';
        // Errors are already handled in fetchUnreadCount, but catch here to prevent unhandled rejections
      });
      fetchNotifications().catch((error) => {
        // Errors are already handled in fetchNotifications, but catch here to prevent unhandled rejections
      });
    } else if (!authLoading && !user?.id) {
      setUnreadCount(0);
      setNotifications([]);
    }
  }, [user?.id, authLoading]);

  return (
    <NotificationContext.Provider value={{
      unreadCount,
      notifications,
      pagination,
      fetchUnreadCount,
      fetchNotifications,
      fetchNotificationHistory,
      markAsRead,
      markAllAsRead,
      refreshNotifications,
      resetNotificationState,
    }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}
