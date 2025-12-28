import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { API_BASE_URL } from '@/constants/api';

/**
 * Production-grade notification service for userApp
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
        return true;
      }


      // Configure notification behavior
      await this.configureNotifications();

      // Request permissions
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {
        return false;
      }

      // Register for push notifications
      const token = await this.registerForPushNotifications();
      if (token) {
        this.pushToken = token;
        await this.registerTokenWithBackend(token);
        this.isInitialized = true;
        return true;
      }

      return false;
    } catch (error) {
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

    // Configure notification channel for Android
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#3B82F6',
        sound: 'default',
      });

      await Notifications.setNotificationChannelAsync('booking-updates', {
        name: 'Booking Updates',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#10B981',
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
      const authToken = await AsyncStorage.getItem('token');
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
        const errorData = await response.json().catch(() => ({}));
        console.error('❌ Failed to register push token with backend:', response.status, errorData);
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
    });

    // Handle notification tapped/opened
    Notifications.addNotificationResponseReceivedListener((response) => {
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
        
        // Navigate to specific screen based on notification data
        switch (data.screen) {
          case 'bookings':
            router.push('/(tabs)/bookings');
            break;
          case 'notifications':
            router.push('/(tabs)/notifications');
            break;
          case 'profile':
            router.push('/(tabs)/profile');
            break;
          default:
            router.push('/(tabs)');
            break;
        }
      }
    } catch (error) {
      // Error handling notification tap
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
          body: 'This is a test notification from BuildXpert!',
          data: { type: 'test' },
        }),
      });

      return response.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * Cleanup on logout
   */
  async cleanup(): Promise<void> {
    try {
      
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

    } catch (error) {
      // Error during notification cleanup
    }
  }
}

// Export singleton instance
export const notificationService = NotificationService.getInstance();
export default NotificationService;
