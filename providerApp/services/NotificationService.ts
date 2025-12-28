import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform, AppState } from 'react-native';
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
   * CRITICAL: Order matters - channels must be created before permissions/token
   */
  async initialize(): Promise<boolean> {
    try {
      if (this.isInitialized) {
        console.log('✅ Notification service already initialized');
        return true;
      }

      console.log('🔄 Initializing notification service...');

      // STEP 1: Configure notification behavior and channels FIRST (synchronously)
      // This ensures channels exist before any notifications can arrive
      await this.configureNotifications();
      console.log('✅ Notification behavior and channels configured');

      // STEP 2: Request permissions (after channels are ready)
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {
        console.warn('⚠️ Notification permissions not granted');
        return false;
      }
      console.log('✅ Notification permissions granted');

      // STEP 3: Register for push notifications and get token
      const token = await this.registerForPushNotifications();
      if (!token) {
        console.error('❌ Failed to obtain push token');
        return false;
      }

      this.pushToken = token;
      console.log('✅ Push token obtained');

      // STEP 4: Register token with backend (with retry logic)
      // CRITICAL: Token must be registered before marking as initialized
      let registered = false;
      let retryCount = 0;
      const maxRetries = 3;
      
      while (!registered && retryCount < maxRetries) {
        registered = await this.registerTokenWithBackend(token);
        if (registered) {
          console.log('✅ Push token registered with backend');
          break;
        } else {
          retryCount++;
          if (retryCount < maxRetries) {
            console.log(`⚠️ Token registration failed, retrying (${retryCount}/${maxRetries})...`);
            await new Promise(resolve => setTimeout(resolve, 2000 * retryCount)); // Exponential backoff
          }
        }
      }

      if (!registered) {
        console.warn('⚠️ Failed to register token with backend after retries, but token obtained');
        // Still mark as initialized if token was obtained - backend registration can happen later
      }

      // Mark as initialized only after token is obtained
      this.isInitialized = true;
      return true;
    } catch (error: any) {
      console.error('❌ Error initializing notification service:', error.message || error);
      return false;
    }
  }

  /**
   * Configure notification behavior
   * CRITICAL: Channels must be created synchronously before any notifications arrive
   */
  private async configureNotifications(): Promise<void> {
    try {
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
      // These MUST be created before any notifications are sent
      if (Platform.OS === 'android') {
        const channels = [
          {
            id: 'default',
            name: 'Default Notifications',
            description: 'General notifications from BuildXpert Provider',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#3B82F6',
            sound: 'default',
            enableVibrate: true,
            showBadge: true,
          },
          {
            id: 'provider-updates',
            name: 'Provider Updates',
            description: 'Notifications about bookings and service requests',
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#10B981',
            sound: 'default',
            enableVibrate: true,
            showBadge: true,
          },
          {
            id: 'booking-updates',
            name: 'Booking Updates',
            description: 'Notifications about booking status changes',
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#10B981',
            sound: 'default',
            enableVibrate: true,
            showBadge: true,
          },
          {
            id: 'payments',
            name: 'Payments',
            description: 'Payment and earnings notifications',
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#059669',
            sound: 'default',
            enableVibrate: true,
            showBadge: true,
          },
          {
            id: 'reminders',
            name: 'Reminders',
            description: 'Booking reminders and important updates',
            importance: Notifications.AndroidImportance.DEFAULT,
            vibrationPattern: [0, 250],
            lightColor: '#F59E0B',
            sound: 'default',
            enableVibrate: true,
            showBadge: true,
          },
        ];

        // Create all channels synchronously with error handling
        const channelPromises = channels.map(async (channel) => {
          try {
            await Notifications.setNotificationChannelAsync(channel.id, {
              name: channel.name,
              description: channel.description,
              importance: channel.importance,
              vibrationPattern: channel.vibrationPattern,
              lightColor: channel.lightColor,
              sound: channel.sound,
              enableVibrate: channel.enableVibrate,
              showBadge: channel.showBadge,
            });
            console.log(`✅ Notification channel created: ${channel.id}`);
          } catch (error: any) {
            console.error(`❌ Failed to create notification channel ${channel.id}:`, error.message || error);
            // Continue with other channels even if one fails
          }
        });

        // Wait for all channels to be created before proceeding
        await Promise.all(channelPromises);
        console.log('✅ All notification channels configured');
      }
    } catch (error: any) {
      console.error('❌ Error configuring notifications:', error.message || error);
      throw error; // Re-throw to prevent initialization from continuing with broken config
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
   * CRITICAL: Handles notifications in foreground, background, and when app is closed
   */
  private setupNotificationHandlers() {
    // Handle notification received (works in foreground, background, and when app is closed)
    // This single listener handles all cases
    Notifications.addNotificationReceivedListener(async (notification) => {
      const appState = AppState.currentState;
      const isForeground = appState === 'active';
      
      if (isForeground) {
        console.log('📬 Notification received (foreground):', notification.request.content.title);
        this.handleNotificationReceived(notification);
      } else {
        console.log('📬 Notification received (background/closed):', notification.request.content.title);
        await this.handleBackgroundNotification(notification);
      }
    });

    // Handle notification tapped/opened (works in both foreground and background)
    Notifications.addNotificationResponseReceivedListener((response) => {
      console.log('👆 Notification tapped:', response.notification.request.content.title);
      this.handleNotificationTap(response.notification);
    });

    // Set up notification categories for iOS action buttons
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
      console.error('❌ Error setting notification category:', error);
    });
  }

  /**
   * Handle notification received in foreground
   */
  private handleNotificationReceived(notification: Notifications.Notification) {
    try {
      // Update badge count
      const badgeCount = notification.request.content.badge;
      if (badgeCount !== undefined) {
        Notifications.setBadgeCountAsync(badgeCount).catch((error) => {
          console.error('❌ Error updating badge count:', error);
        });
      }
    } catch (error: any) {
      console.error('❌ Error handling notification received:', error.message || error);
    }
  }

  /**
   * Handle background notification (when app is closed or in background)
   * CRITICAL: This ensures notifications are processed even when app is not running
   */
  private async handleBackgroundNotification(notification: Notifications.Notification): Promise<void> {
    try {
      console.log('🔄 Processing background notification:', notification.request.content.title);
      
      // Update badge count
      const badgeCount = notification.request.content.badge;
      if (badgeCount !== undefined) {
        await Notifications.setBadgeCountAsync(badgeCount);
      }

      // Store notification data for when app opens
      const notificationData = {
        title: notification.request.content.title,
        body: notification.request.content.body,
        data: notification.request.content.data,
        timestamp: Date.now(),
      };

      // Store in AsyncStorage so it can be accessed when app opens
      try {
        const existingNotifications = await AsyncStorage.getItem('background_notifications');
        const notifications = existingNotifications ? JSON.parse(existingNotifications) : [];
        notifications.unshift(notificationData);
        // Keep only last 50 notifications
        const trimmed = notifications.slice(0, 50);
        await AsyncStorage.setItem('background_notifications', JSON.stringify(trimmed));
      } catch (storageError) {
        console.error('❌ Error storing background notification:', storageError);
      }

      console.log('✅ Background notification processed');
    } catch (error: any) {
      console.error('❌ Error handling background notification:', error.message || error);
    }
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
