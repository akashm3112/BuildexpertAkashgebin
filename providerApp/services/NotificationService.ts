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
        console.log('📱 Notification service already initialized');
        return true;
      }

      console.log('📱 Initializing notification service...');

      // Configure notification behavior
      await this.configureNotifications();

      // Request permissions
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {
        console.log('❌ Notification permissions denied');
        return false;
      }

      // Register for push notifications
      const token = await this.registerForPushNotifications();
      if (token) {
        this.pushToken = token;
        await this.registerTokenWithBackend(token);
        this.isInitialized = true;
        console.log('✅ Notification service initialized successfully');
        return true;
      }

      return false;
    } catch (error) {
      console.error('❌ Error initializing notification service:', error);
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

    // Configure notification channels for Android
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#3B82F6',
        sound: 'default',
      });

      await Notifications.setNotificationChannelAsync('provider-updates', {
        name: 'Provider Updates',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#10B981',
        sound: 'default',
      });

      await Notifications.setNotificationChannelAsync('payments', {
        name: 'Payments',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#059669',
        sound: 'default',
      });

      await Notifications.setNotificationChannelAsync('reminders', {
        name: 'Reminders',
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250],
        lightColor: '#F59E0B',
        sound: 'default',
      });
    }
  }

  /**
   * Request notification permissions
   */
  private async requestPermissions(): Promise<boolean> {
    try {
      if (!Device.isDevice) {
        console.log('📱 Push notifications only work on physical devices');
        return false;
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('❌ Notification permission not granted');
        return false;
      }

      console.log('✅ Notification permissions granted');
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
        console.log('📱 Must use physical device for push notifications');
        return null;
      }

      // Get the token
      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: Constants.expoConfig?.extra?.eas?.projectId,
      });

      const token = tokenData.data;
      console.log('📱 Got Expo push token:', token);

      // Store token locally
      await AsyncStorage.setItem('expo_push_token', token);

      return token;
    } catch (error) {
      console.error('❌ Error getting push token:', error);
      return null;
    }
  }

  /**
   * Register token with backend
   */
  private async registerTokenWithBackend(token: string): Promise<boolean> {
    try {
      const authToken = await AsyncStorage.getItem('token');
      if (!authToken) {
        console.log('❌ No auth token found, skipping backend registration');
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
        console.log('✅ Push token registered with backend');
        return true;
      } else {
        const data = await response.json();
        console.error('❌ Failed to register token with backend:', data.message);
        return false;
      }
    } catch (error) {
      console.error('❌ Error registering token with backend:', error);
      return false;
    }
  }

  /**
   * Setup notification event handlers
   */
  private setupNotificationHandlers() {
    // Handle notification received while app is in foreground
    Notifications.addNotificationReceivedListener((notification) => {
      console.log('📱 Notification received:', notification);
      // You can add custom handling here (e.g., update badge, show custom UI)
    });

    // Handle notification tapped/opened
    Notifications.addNotificationResponseReceivedListener((response) => {
      console.log('📱 Notification tapped:', response);
      this.handleNotificationTap(response.notification);
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
        console.log('🧭 Navigating to screen:', data.screen);
        
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
      const authToken = await AsyncStorage.getItem('token');
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
      const authToken = await AsyncStorage.getItem('token');
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
        const authToken = await AsyncStorage.getItem('token');
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
