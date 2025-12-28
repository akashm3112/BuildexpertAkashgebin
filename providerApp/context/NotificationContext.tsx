import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';
import { API_BASE_URL } from '@/constants/api';
import { io as socketIOClient } from 'socket.io-client';
import { tokenManager } from '../utils/tokenManager';
import { AppState, AppStateStatus } from 'react-native';
import { bookingNotificationService } from '@/services/BookingNotificationService';

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
  fetchUnreadCount: () => Promise<void>;
  fetchNotifications: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  refreshNotifications: () => void;
  resetNotificationState: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoading: authLoading } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const appState = useRef(AppState.currentState);
  const lastFetchTime = useRef<number>(0);
  const fetchInProgress = useRef<boolean>(false);
  const socketRef = useRef<any>(null);
  const DEBOUNCE_DELAY = 500; // 500ms debounce to prevent duplicate fetches

  // Fetch unread count from API
  const fetchUnreadCount = async () => {
    if (!user?.id) {
      return;
    }
    
    try {
      const token = await tokenManager.getValidToken();
      if (!token) {
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/notifications/unread-count`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.status === 'success') {
          setUnreadCount(data.data.unreadCount);
        }
      } else {
        const errorText = await response.text();
      }
    } catch (error: any) {
      // Mark error as handled to prevent unhandled promise rejection warnings
      const isNetworkError = error?.message?.includes('Network request failed') ||
                            error?.message?.includes('timeout') ||
                            error?.isNetworkError === true;
      
      // Mark all errors as handled to prevent unhandled rejection warnings
      if (!error?._handled) {
        (error as any)._handled = true;
        (error as any)._suppressUnhandled = true;
      }
      
      // Network errors are expected when backend is down or network is unavailable
      // Silently handle them (will retry on next fetch)
    }
  };

  // Fetch all notifications
  const fetchNotifications = async (force = false) => {
    if (!user?.id) {
      return;
    }
    
    // Debounce: Prevent rapid duplicate fetches (within 500ms)
    // But allow forced fetches (e.g., from socket events or manual refresh)
    const now = Date.now();
    if (!force && (fetchInProgress.current || (now - lastFetchTime.current < DEBOUNCE_DELAY))) {
      return; // Skip if fetch is in progress or too soon after last fetch (unless forced)
    }
    
    fetchInProgress.current = true;
    lastFetchTime.current = now;
    
    try {
      const token = await tokenManager.getValidToken();
      if (!token) {
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/notifications`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.status === 'success') {
          const fetchedNotifications = data.data.notifications || [];
          setNotifications(fetchedNotifications);
          // Update unread count based on notifications
          const unread = fetchedNotifications.filter((n: Notification) => !n.is_read).length;
          setUnreadCount(unread);
        } else {
          // If API call fails but we have existing notifications, don't clear them
          // Only clear if this is the initial load (no existing notifications)
          if (notifications.length === 0) {
            setNotifications([]);
          }
        }
      } else {
        const errorText = await response.text();
        // Don't clear existing notifications on error - preserve what we have
        if (notifications.length === 0) {
          setNotifications([]);
        }
      }
    } catch (error: any) {
      // Mark error as handled to prevent unhandled promise rejection warnings
      const isNetworkError = error?.message?.includes('Network request failed') ||
                            error?.message?.includes('timeout') ||
                            error?.isNetworkError === true;
      
      // Mark all errors as handled to prevent unhandled rejection warnings
      if (!error?._handled) {
        (error as any)._handled = true;
        (error as any)._suppressUnhandled = true;
      }
      
      // Network errors are expected when backend is down or network is unavailable
      // Silently handle them (will retry on next fetch)
      // Only clear notifications on initial load if there's an error
      // Don't clear existing notifications on subsequent fetch errors
      if (notifications.length === 0) {
        setNotifications([]);
      }
    } finally {
      fetchInProgress.current = false;
    }
  };

  // Mark individual notification as read
  const markAsRead = async (id: string) => {
    try {
      const token = await tokenManager.getValidToken();
      if (!token) return;

      // Update local state immediately for better UX
      setNotifications(prev =>
        prev.map(notification =>
          notification.id === id ? { ...notification, is_read: true } : notification
        )
      );

      // Update unread count
      setUnreadCount(prev => Math.max(0, prev - 1));

      // Call API to mark as read
      await fetch(`${API_BASE_URL}/api/notifications/${id}/mark-read`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` },
      });
    } catch (error) {
      // Silently fail - notification marking errors are not critical
    }
  };

  // Mark all notifications as read
  const markAllAsRead = async () => {
    try {
      const token = await tokenManager.getValidToken();
      if (!token) return;

      // Update local state immediately
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);

      // Call API
      await fetch(`${API_BASE_URL}/api/notifications/mark-all-read`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` },
      });
    } catch (error) {
      // Silently fail - notification marking errors are not critical
    }
  };

  // Refresh notifications (for pull-to-refresh)
  const refreshNotifications = () => {
    // Force refresh (bypasses debounce)
    fetchNotifications(true).catch(() => {
      // Silently fail - notification refresh errors are not critical
    });
  };

  const resetNotificationState = () => {
    setUnreadCount(0);
    setNotifications([]);
  };

  // Handle booking-specific notifications with vibration and sound
  const handleBookingNotification = (data: any) => {
    try {
      const { type, title, message, data: notificationData } = data;
      
      // Extract relevant information from notification data
      const providerName = notificationData?.providerName || 'Service Provider';
      const serviceName = notificationData?.serviceName || 'Service';
      const customerName = notificationData?.customerName || 'Customer';
      const amount = notificationData?.amount;
      const reason = notificationData?.reason;
      const scheduledDate = notificationData?.scheduledDate;
      const timeUntil = notificationData?.timeUntil;
      const location = notificationData?.location;
      const rating = notificationData?.rating;

      // Trigger appropriate notification based on type
      switch (type) {
        case 'new_booking_received':
          bookingNotificationService.notifyNewBookingReceived(customerName, serviceName, scheduledDate);
          break;
        case 'booking_cancelled_by_customer':
          bookingNotificationService.notifyBookingCancelledByCustomer(customerName, serviceName, reason);
          break;
        case 'booking_completed':
          bookingNotificationService.notifyBookingCompleted(customerName, serviceName, amount);
          break;
        case 'booking_confirmed':
          bookingNotificationService.notifyBookingConfirmed(customerName, serviceName, scheduledDate);
          break;
        case 'payment_received':
          if (amount) {
            bookingNotificationService.notifyPaymentReceived(amount, customerName, serviceName);
          }
          break;
        case 'customer_rating_received':
          if (rating) {
            bookingNotificationService.notifyCustomerRatingReceived(customerName, rating, serviceName);
          }
          break;
        case 'booking_reminder':
          bookingNotificationService.notifyBookingReminder(customerName, serviceName, timeUntil);
          break;
        case 'service_requested':
          bookingNotificationService.notifyServiceRequested(customerName, serviceName, location);
          break;
        default:
          // For other notification types, just trigger a basic vibration
          bookingNotificationService.testNotification();
          break;
      }
    } catch (error) {
      // Silently fail - booking notification handling errors are not critical
    }
  };

  // Handle app state changes
  const handleAppStateChange = (nextAppState: AppStateStatus) => {
    if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
      // App has come to foreground, refresh notifications
      fetchUnreadCount().catch((error: any) => {
        // Mark as handled to prevent unhandled rejection warnings
        if (!error?._handled) {
          (error as any)._handled = true;
          (error as any)._suppressUnhandled = true;
        }
      });
      fetchNotifications().catch((error: any) => {
        // Mark as handled to prevent unhandled rejection warnings
        if (!error?._handled) {
          (error as any)._handled = true;
          (error as any)._suppressUnhandled = true;
        }
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

    // CRITICAL: Use polling as fallback for mobile data networks
    // Mobile carriers often block WebSocket connections
    const socket = socketIOClient(`${API_BASE_URL}`, {
      transports: ['polling', 'websocket'], // Try polling first, upgrade to websocket if available
      upgrade: true, // Allow upgrade from polling to websocket
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      forceNew: false,
    });
    socketRef.current = socket;
    
    socket.on('connect', () => {
      socket.emit('join', user.id);
    });

    socket.on('notification_created', (data) => {
      
      // Trigger vibration and sound for booking-related notifications
      if (data && data.type) {
        handleBookingNotification(data);
      }
      
      // OPTIMISTIC UI UPDATE: Add notification immediately if provided in socket event
      if (data && data.notification) {
        setNotifications((prev) => {
          // Check if notification already exists (prevent duplicates)
          const exists = prev.some((n: Notification) => n.id === data.notification.id);
          if (exists) return prev;
          // Add new notification at the beginning
          return [data.notification, ...prev];
        });
        // Update unread count optimistically
        if (!data.notification.is_read) {
          setUnreadCount((prev) => prev + 1);
        }
      }
      
      // Force fetch to get latest data (bypasses debounce)
      fetchNotifications(true).catch((error: any) => {
        if (!error?._handled) {
          (error as any)._handled = true;
          (error as any)._suppressUnhandled = true;
        }
      });
      fetchUnreadCount().catch((error: any) => {
        if (!error?._handled) {
          (error as any)._handled = true;
          (error as any)._suppressUnhandled = true;
        }
      });
    });

    socket.on('notification_updated', () => {
      // Force fetch to get latest data (bypasses debounce)
      fetchNotifications(true).catch((error: any) => {
        if (!error?._handled) {
          (error as any)._handled = true;
          (error as any)._suppressUnhandled = true;
        }
      });
      fetchUnreadCount().catch((error: any) => {
        if (!error?._handled) {
          (error as any)._handled = true;
          (error as any)._suppressUnhandled = true;
        }
      });
    });

    socket.on('notification_deleted', () => {
      // Force fetch to get latest data (bypasses debounce)
      fetchNotifications(true).catch((error: any) => {
        if (!error?._handled) {
          (error as any)._handled = true;
          (error as any)._suppressUnhandled = true;
        }
      });
      fetchUnreadCount().catch((error: any) => {
        if (!error?._handled) {
          (error as any)._handled = true;
          (error as any)._suppressUnhandled = true;
        }
      });
    });

    socket.on('disconnect', () => {
      // Socket disconnected - expected when backend is off
    });

    socket.on('connect_error', (error: any) => {
      // Suppress socket connection errors - they're expected when backend is off
      // Don't log or show errors to user
    });

    socket.on('error', (error) => {
      // Suppress socket errors - they're expected when backend is off
      // Don't log or show errors to user
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
      fetchUnreadCount().catch((error: any) => {
        if (!error?._handled) {
          (error as any)._handled = true;
          (error as any)._suppressUnhandled = true;
        }
      });
      fetchNotifications().catch((error: any) => {
        if (!error?._handled) {
          (error as any)._handled = true;
          (error as any)._suppressUnhandled = true;
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
      fetchUnreadCount,
      fetchNotifications,
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
