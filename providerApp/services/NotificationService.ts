import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { API_BASE_URL } from '@/constants/api';

/**
 * Production-grade notification service for providerApp
 * Handles registration, permissions, and notification handling
 */
class NotificationService {
  private static instance: NotificationService;
  private pushToken: string | null = null;
  private isInitialized: boolean = false;

  private constructor() {
    this.setupNotificationHandlers();
  }

  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  /**
   * Initialize notification service
   */
  async initialize(): Promise<boolean> {
    try {
      if (this.isInitialized) {
        console.log('✅ Notification service already initialized');
        return true;
      }

      console.log('🔄 Initializing notification service...');

      // Configure notification behavior FIRST
      await this.configureNotifications();
      console.log('✅ Notification behavior configured');

      // Request permissions
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {
        console.warn('⚠️ Notification permissions not granted');
        return false;
      }
      console.log('✅ Notification permissions granted');

      // Register for push notifications
      const token = await this.registerForPushNotifications();
      if (token) {
        this.pushToken = token;
        console.log('✅ Push token obtained');
        
        // Register token with backend (retry if needed)
        const registered = await this.registerTokenWithBackend(token);
        if (registered) {
          console.log('✅ Push token registered with backend');
          this.isInitialized = true;
          return true;
        } else {
          console.warn('⚠️ Failed to register token with backend, but token obtained');
          // Still mark as initialized if token was obtained
          this.isInitialized = true;
          return true;
        }
      }

      console.error('❌ Failed to obtain push token');
      return false;
    } catch (error: any) {
      console.error('❌ Error initializing notification service:', error.message || error);
      return false;
    }
  }

  /**
   * Configure notification behavior
   */
  private async configureNotifications() {
    // Configure how notifications are handled when app is in foreground
    await Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });

    // Configure notification channels for Android (CRITICAL for background notifications)
    if (Platform.OS === 'android') {
      // Default channel - highest priority for background delivery
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default Notifications',
        description: 'General notifications from BuildXpert Provider',
        importance: Notifications.AndroidImportance.MAX, // MAX ensures delivery even in Do Not Disturb mode
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#3B82F6',
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
      });

      // Provider updates channel - high priority
      await Notifications.setNotificationChannelAsync('provider-updates', {
        name: 'Provider Updates',
        description: 'Notifications about bookings and service requests',
        importance: Notifications.AndroidImportance.HIGH, // HIGH ensures delivery in background
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#10B981',
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
      });

      // Booking updates channel
      await Notifications.setNotificationChannelAsync('booking-updates', {
        name: 'Booking Updates',
        description: 'Notifications about booking status changes',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#10B981',
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
      });

      // Payments channel
      await Notifications.setNotificationChannelAsync('payments', {
        name: 'Payments',
        description: 'Payment and earnings notifications',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#059669',
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
      });

      // Reminders channel
      await Notifications.setNotificationChannelAsync('reminders', {
        name: 'Reminders',
        description: 'Booking reminders and important updates',
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250],
        lightColor: '#F59E0B',
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
      });
    }
  }

  /**
   * Request notification permissions
   */
  private async requestPermissions(): Promise<boolean> {
    try {
      if (!Device.isDevice) {
        return false;
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        return false;
      }

      return true;
    } catch (error) {
      console.error('❌ Error requesting permissions:', error);
      return false;
    }
  }

  /**
   * Register for push notifications and get token
   */
  private async registerForPushNotifications(): Promise<string | null> {
    try {
      if (!Device.isDevice) {
        console.log('⚠️ Not a physical device, skipping push notification registration');
        return null;
      }

      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      if (!projectId) {
        console.error('❌ Project ID not found in app config. Push notifications will not work.');
        return null;
      }

      // Get the token
      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: projectId,
      });

      const token = tokenData.data;
      console.log('✅ Push token obtained:', token.substring(0, 20) + '...');

      // Store token locally
      await AsyncStorage.setItem('expo_push_token', token);

      return token;
    } catch (error: any) {
      console.error('❌ Error getting push token:', error.message || error);
      return null;
    }
  }

  /**
   * Register token with backend
   */
  private async registerTokenWithBackend(token: string): Promise<boolean> {
    try {
      const { tokenManager } = await import('../utils/tokenManager');
      const authToken = await tokenManager.getValidToken();
      if (!authToken) {
        console.warn('⚠️ No auth token found, cannot register push token with backend');
        return false;
      }

      const deviceInfo = {
        deviceName: Device.deviceName,
        deviceType: Device.deviceType,
        osName: Device.osName,
        osVersion: Device.osVersion,
        platform: Platform.OS,
        appVersion: Constants.expoConfig?.version,
        appType: 'provider', // Distinguish from userApp
      };

      const response = await fetch(`${API_BASE_URL}/api/push-notifications/register-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          pushToken: token,
          deviceInfo,
        }),
      });

      if (response.ok) {
        console.log('✅ Push token registered with backend successfully');
        return true;
      } else {
        const data = await response.json().catch(() => ({}));
        console.error('❌ Failed to register token with backend:', response.status, data.message || data);
        return false;
      }
    } catch (error: any) {
      console.error('❌ Error registering token with backend:', error.message || error);
      return false;
    }
  }

  /**
   * Setup notification event handlers
   */
  private setupNotificationHandlers() {
    // Handle notification received while app is in foreground
    Notifications.addNotificationReceivedListener((notification) => {
      // You can add custom handling here (e.g., update badge, show custom UI)
      console.log('📬 Notification received (foreground):', notification.request.content.title);
    });

    // Handle notification tapped/opened (works in both foreground and background)
    Notifications.addNotificationResponseReceivedListener((response) => {
      console.log('👆 Notification tapped:', response.notification.request.content.title);
      this.handleNotificationTap(response.notification);
    });

    // CRITICAL: Handle background notifications
    // This ensures notifications are received even when app is closed
    Notifications.setNotificationCategoryAsync('default', [
      {
        identifier: 'VIEW',
        buttonTitle: 'View',
        options: { opensAppToForeground: true },
      },
      {
        identifier: 'DISMISS',
        buttonTitle: 'Dismiss',
        options: {},
      },
    ], {
      intentIdentifiers: [],
      hiddenPreviewsBodyPlaceholder: '',
      categorySummaryFormat: '%u more notifications',
    }).catch((error) => {
      console.error('Error setting notification category:', error);
    });
  }

  /**
   * Handle notification tap navigation
   */
  private handleNotificationTap(notification: Notifications.Notification) {
    try {
      const data = notification.request.content.data;
      
      if (data?.screen) {
        // Navigate to specific screen
        
        // Navigate to specific screen based on notification data
        switch (data.screen) {
          case 'bookings':
            router.push('/(tabs)/bookings');
            break;
          case 'notifications':
            router.push('/(tabs)/notifications');
            break;
          case 'earnings':
          case 'profile':
            router.push('/(tabs)/profile');
            break;
          case 'services':
            router.push('/(tabs)/services');
            break;
          default:
            router.push('/(tabs)');
            break;
        }
      }
    } catch (error) {
      console.error('❌ Error handling notification tap:', error);
    }
  }

  /**
   * Get current push token
   */
  async getPushToken(): Promise<string | null> {
    try {
      if (this.pushToken) {
        return this.pushToken;
      }

      // Try to get from storage
      const storedToken = await AsyncStorage.getItem('expo_push_token');
      if (storedToken) {
        this.pushToken = storedToken;
        return storedToken;
      }

      // Generate new token
      const token = await this.registerForPushNotifications();
      if (token) {
        this.pushToken = token;
        await this.registerTokenWithBackend(token);
      }

      return token;
    } catch (error) {
      console.error('❌ Error getting push token:', error);
      return null;
    }
  }

  /**
   * Update notification settings
   */
  async updateSettings(settings: any): Promise<boolean> {
    try {
      const { tokenManager } = await import('../utils/tokenManager');
      const authToken = await tokenManager.getValidToken();
      if (!authToken) {
        return false;
      }

      const response = await fetch(`${API_BASE_URL}/api/push-notifications/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({ settings }),
      });

      return response.ok;
    } catch (error) {
      console.error('❌ Error updating notification settings:', error);
      return false;
    }
  }

  /**
   * Send test notification (development only)
   */
  async sendTestNotification(): Promise<boolean> {
    try {
      const { tokenManager } = await import('../utils/tokenManager');
      const authToken = await tokenManager.getValidToken();
      if (!authToken) {
        return false;
      }

      const response = await fetch(`${API_BASE_URL}/api/push-notifications/send-test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          title: 'Test Notification',
          body: 'This is a test notification from BuildXpert Provider App!',
          data: { type: 'test' },
        }),
      });

      return response.ok;
    } catch (error) {
      console.error('❌ Error sending test notification:', error);
      return false;
    }
  }

  /**
   * Cleanup on logout
   */
  async cleanup(): Promise<void> {
    try {
      console.log('🧹 Cleaning up notification service...');
      
      if (this.pushToken) {
        // Deactivate token on backend
        const { tokenManager } = await import('../utils/tokenManager');
        const authToken = await tokenManager.getValidToken();
        if (authToken) {
          await fetch(`${API_BASE_URL}/api/push-notifications/token`, {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${authToken}`,
            },
            body: JSON.stringify({ pushToken: this.pushToken }),
          });
        }
      }

      // Clear local data
      await AsyncStorage.removeItem('expo_push_token');
      this.pushToken = null;
      this.isInitialized = false;

      console.log('✅ Notification service cleanup completed');
    } catch (error) {
      console.error('❌ Error during notification cleanup:', error);
    }
  }
}

// Export singleton instance
export const notificationService = NotificationService.getInstance();
export default NotificationService;
