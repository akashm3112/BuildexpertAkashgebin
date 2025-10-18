import { useEffect, useState } from 'react';
import { notificationService } from '@/services/NotificationService';
import { useAuth } from '@/context/AuthContext';

/**
 * Custom hook for managing push notifications
 */
export const usePushNotifications = () => {
  const { user } = useAuth();
  const [isInitialized, setIsInitialized] = useState(false);
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<'granted' | 'denied' | 'pending'>('pending');

  useEffect(() => {
    if (user && !isInitialized) {
      initializeNotifications();
    }
  }, [user, isInitialized]);

  const initializeNotifications = async () => {
    try {
      const success = await notificationService.initialize();
      if (success) {
        const token = await notificationService.getPushToken();
        setPushToken(token);
        setPermissionStatus('granted');
        setIsInitialized(true);
      } else {
        setPermissionStatus('denied');
      }
    } catch (error) {
      console.error('Error initializing notifications:', error);
      setPermissionStatus('denied');
    }
  };

  const sendTestNotification = async (): Promise<boolean> => {
    return await notificationService.sendTestNotification();
  };

  const updateSettings = async (settings: any): Promise<boolean> => {
    return await notificationService.updateSettings(settings);
  };

  return {
    isInitialized,
    pushToken,
    permissionStatus,
    sendTestNotification,
    updateSettings,
    initializeNotifications,
  };
};
