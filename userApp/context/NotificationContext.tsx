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
      // Check if it's a "Session expired" error (expected after 30 days)
      const isSessionExpired = error?.message === 'Session expired' || 
                               error?.status === 401 && error?.message?.includes('Session expired') ||
                               error?._suppressUnhandled === true ||
                               error?._handled === true;
      
      if (!isSessionExpired) {
        // Only log non-session-expired errors
        console.warn('Error fetching unread count:', error?.message || error);
      }
      // Session expired errors are handled by apiClient (logout triggered)
    }
  };

  // Fetch all notifications
  const fetchNotifications = async (page = 1, limit = 20) => {
    if (!user?.id) return;
    
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
      // Check if it's a "Session expired" error (expected after 30 days)
      const isSessionExpired = error?.message === 'Session expired' || 
                               error?.status === 401 && error?.message?.includes('Session expired') ||
                               error?._suppressUnhandled === true ||
                               error?._handled === true;
      
      if (!isSessionExpired) {
        // Only log non-session-expired errors
        console.warn('Error fetching notifications:', error?.message || error);
      }
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
      
      if (!isSessionExpired) {
        // Only log non-session-expired errors
        console.warn('Error fetching notification history:', error?.message || error);
      }
      // Session expired errors are handled by apiClient (logout triggered)
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

      if (response.status === 401) {
        // Try to refresh token first
        const refreshedToken = await tokenManager.forceRefreshToken();
        if (refreshedToken) {
          // Retry with new token
          await fetch(`${API_BASE_URL}/api/notifications/${id}/mark-read`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${refreshedToken}` },
          });
          return;
        }
        // Refresh token expired (30 days) - logout silently
        await logout();
        return;
      }
    } catch (error) {
      console.error('Error marking notification as read:', error);
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
      
      if (!isSessionExpired) {
        // Only log non-session-expired errors
        console.warn('Error marking all notifications as read:', error?.message || error);
      }
      // Session expired errors are handled by apiClient (logout triggered)
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
        const isSuppressed = error?._suppressUnhandled === true || error?._handled === true;
        if (!isSessionExpired && !isServerError && !isSuppressed) {
          console.warn('fetchUnreadCount error on app state change (handled):', error?.message || error);
        }
      });
      fetchNotifications().catch((error) => {
        // Errors are already handled in fetchNotifications, but catch here to prevent unhandled rejections
        const isSessionExpired = error?.message === 'Session expired' || 
                                 error?.status === 401 && error?.message?.includes('Session expired');
        const isServerError = error?.status === 500 || 
                             error?.isServerError === true ||
                             error?.message?.includes('Database operation failed') ||
                             error?.message?.includes('Database') ||
                             error?.data?.errorCode === 'DATABASE_ERROR';
        const isSuppressed = error?._suppressUnhandled === true || error?._handled === true;
        if (!isSessionExpired && !isServerError && !isSuppressed) {
          console.warn('fetchNotifications error on app state change (handled):', error?.message || error);
        }
      });
    }
    appState.current = nextAppState;
  };

  // Set up real-time notifications via socket.io - wait for auth to finish loading
  useEffect(() => {
    if (authLoading || !user?.id) return;

    const socket = socketIOClient(`${API_BASE_URL}`);
    
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
        const isSuppressed = error?._suppressUnhandled === true || error?._handled === true;
        if (!isSessionExpired && !isServerError && !isSuppressed) {
          console.warn('fetchNotifications error on notification_created (handled):', error?.message || error);
        }
      });
      fetchUnreadCount().catch((error) => {
        // Errors are already handled in fetchUnreadCount, but catch here to prevent unhandled rejections
        const isSessionExpired = error?.message === 'Session expired' || 
                                 error?.status === 401 && error?.message?.includes('Session expired');
        const isServerError = error?.status === 500 || 
                             error?.isServerError === true ||
                             error?.message?.includes('Database operation failed') ||
                             error?.message?.includes('Database') ||
                             error?.data?.errorCode === 'DATABASE_ERROR';
        const isSuppressed = error?._suppressUnhandled === true || error?._handled === true;
        if (!isSessionExpired && !isServerError && !isSuppressed) {
          console.warn('fetchUnreadCount error on notification_created (handled):', error?.message || error);
        }
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
        const isSuppressed = error?._suppressUnhandled === true || error?._handled === true;
        if (!isSessionExpired && !isServerError && !isSuppressed) {
          console.warn('fetchNotifications error on notification_updated (handled):', error?.message || error);
        }
      });
      fetchUnreadCount().catch((error) => {
        // Errors are already handled in fetchUnreadCount, but catch here to prevent unhandled rejections
        const isSessionExpired = error?.message === 'Session expired' || 
                                 error?.status === 401 && error?.message?.includes('Session expired');
        const isServerError = error?.status === 500 || 
                             error?.isServerError === true ||
                             error?.message?.includes('Database operation failed') ||
                             error?.message?.includes('Database') ||
                             error?.data?.errorCode === 'DATABASE_ERROR';
        const isSuppressed = error?._suppressUnhandled === true || error?._handled === true;
        if (!isSessionExpired && !isServerError && !isSuppressed) {
          console.warn('fetchUnreadCount error on notification_updated (handled):', error?.message || error);
        }
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
        const isSuppressed = error?._suppressUnhandled === true || error?._handled === true;
        if (!isSessionExpired && !isServerError && !isSuppressed) {
          console.warn('fetchNotifications error on notification_deleted (handled):', error?.message || error);
        }
      });
      fetchUnreadCount().catch((error) => {
        // Errors are already handled in fetchUnreadCount, but catch here to prevent unhandled rejections
        const isSessionExpired = error?.message === 'Session expired' || 
                                 error?.status === 401 && error?.message?.includes('Session expired');
        const isServerError = error?.status === 500 || 
                             error?.isServerError === true ||
                             error?.message?.includes('Database operation failed') ||
                             error?.message?.includes('Database') ||
                             error?.data?.errorCode === 'DATABASE_ERROR';
        const isSuppressed = error?._suppressUnhandled === true || error?._handled === true;
        if (!isSessionExpired && !isServerError && !isSuppressed) {
          console.warn('fetchUnreadCount error on notification_deleted (handled):', error?.message || error);
        }
      });
    });

    socket.on('disconnect', () => {
    });

    socket.on('error', (error) => {
      console.error('Notification socket error:', error);
    });

    return () => {
      socket.disconnect();
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
        const isSuppressed = error?._suppressUnhandled === true || error?._handled === true;
        if (!isSessionExpired && !isServerError && !isSuppressed) {
          console.warn('fetchUnreadCount error on initial fetch (handled):', error?.message || error);
        }
      });
      fetchNotifications().catch((error) => {
        // Errors are already handled in fetchNotifications, but catch here to prevent unhandled rejections
        const isSessionExpired = error?.message === 'Session expired' || 
                                 error?.status === 401 && error?.message?.includes('Session expired');
        const isServerError = error?.status === 500 || 
                             error?.isServerError === true ||
                             error?.message?.includes('Database operation failed') ||
                             error?.message?.includes('Database') ||
                             error?.data?.errorCode === 'DATABASE_ERROR';
        const isSuppressed = error?._suppressUnhandled === true || error?._handled === true;
        if (!isSessionExpired && !isServerError && !isSuppressed) {
          console.warn('fetchNotifications error on initial fetch (handled):', error?.message || error);
        }
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
