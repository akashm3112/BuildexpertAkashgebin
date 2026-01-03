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
    // PRODUCTION ROOT FIX: Set notification handler IMMEDIATELY in constructor
    // This ensures handler is set before any notifications can arrive (including background)
    // Must be synchronous - no async operations here
    this.setupNotificationHandlerSync();
    this.setupNotificationHandlers();
  }

  /**
   * PRODUCTION ROOT FIX: Set notification handler synchronously
   * This MUST be called before any async operations to ensure background notifications work
   */
  private setupNotificationHandlerSync() {
    try {
      // Set handler immediately - this works for foreground, background, AND when app is closed
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true, // CRITICAL: Show notification even when app is closed
          shouldPlaySound: true,
          shouldSetBadge: true,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
    } catch (error) {
      // Silent error - handler setup will be retried in configureNotifications
    }
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
   * @param forceReRegister - Force re-registration of token even if already initialized
   */
  async initialize(forceReRegister: boolean = false): Promise<boolean> {
    try {
      if (this.isInitialized && !forceReRegister) {
        // Even if initialized, ensure token is registered with backend
        await this.ensureTokenRegistered();
        return true;
      }

      // STEP 1: Configure notification behavior and channels FIRST (synchronously)
      // This ensures channels exist before any notifications can arrive
      await this.configureNotifications();

      // STEP 2: Request permissions (after channels are ready)
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {
        return false;
      }

      // STEP 3: Register for push notifications and get token
      const token = await this.registerForPushNotifications();
      if (!token) {
        return false;
      }

      this.pushToken = token;

      // STEP 4: Register token with backend (with retry logic)
      // CRITICAL: Token must be registered before marking as initialized
      const registered = await this.registerTokenWithBackendWithRetry(token);

      if (!registered) {
        // Still mark as initialized if token was obtained - backend registration can happen later
        // Schedule a retry in the background
        setTimeout(() => {
          this.ensureTokenRegistered().catch(() => {
            // Silent retry failure
          });
        }, 10000); // Retry after 10 seconds
      }

      // Mark as initialized only after token is obtained
      this.isInitialized = true;
      return true;
    } catch (error: any) {
      return false;
    }
  }

  /**
   * Register token with backend with retry logic
   */
  private async registerTokenWithBackendWithRetry(token: string): Promise<boolean> {
    let registered = false;
    let retryCount = 0;
    const maxRetries = 5; // Increased retries
    
    while (!registered && retryCount < maxRetries) {
      registered = await this.registerTokenWithBackend(token);
      if (registered) {
        break;
      } else {
        retryCount++;
        if (retryCount < maxRetries) {
          const delay = 2000 * retryCount; // Exponential backoff: 2s, 4s, 6s, 8s, 10s
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    return registered;
  }

  /**
   * Ensure token is registered with backend (called periodically and on app start)
   */
  async ensureTokenRegistered(): Promise<boolean> {
    try {
      if (!this.pushToken) {
        // Try to get token from storage or generate new one
        const token = await this.getPushToken();
        if (!token) {
          return false;
        }
        this.pushToken = token;
      }

      const registered = await this.registerTokenWithBackendWithRetry(this.pushToken);
      return registered;
    } catch (error: any) {
      return false;
    }
  }

  /**
   * Configure notification behavior
   * CRITICAL: Channels must be created synchronously before any notifications arrive
   */
  private async configureNotifications(): Promise<void> {
    try {
      // PRODUCTION ROOT FIX: Configure notification handler FIRST before anything else
      // This MUST be set before any notifications can arrive (including background notifications)
      // The handler is called for ALL notifications: foreground, background, and when app is closed
      await Notifications.setNotificationHandler({
        handleNotification: async (notification) => {
          // CRITICAL: Always return these values to ensure notifications are shown
          // This works for foreground, background, AND when app is completely closed
          return {
            shouldShowAlert: true, // Show notification banner/alert
            shouldPlaySound: true, // Play sound
            shouldSetBadge: true, // Update badge count
            shouldShowBanner: true, // Show banner (iOS)
            shouldShowList: true, // Show in notification list
          };
        },
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
          } catch (error: any) {
            // Continue with other channels even if one fails
          }
        });

        // Wait for all channels to be created before proceeding
        await Promise.all(channelPromises);
      }
    } catch (error: any) {
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
      return false;
    }
  }

  /**
   * Register for push notifications and get token
   * PRODUCTION ROOT FIX: Prevent Expo Go from registering push tokens
   */
  private async registerForPushNotifications(): Promise<string | null> {
    try {
      // PRODUCTION ROOT FIX: Check if running in Expo Go - push notifications don't work properly in Expo Go
      // The app name will always show as "Expo Go" if running in Expo Go
      const isExpoGo = Constants.executionEnvironment === 'storeClient' || 
                       Constants.appOwnership === 'expo' ||
                       !Constants.expoConfig?.extra?.eas?.projectId;
      
      if (isExpoGo) {
        console.warn('⚠️ Push notifications are not supported in Expo Go. Please build a standalone app.');
        return null;
      }

      if (!Device.isDevice) {
        console.warn('⚠️ Push notifications are not supported on simulators/emulators.');
        return null;
      }

      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      if (!projectId) {
        console.error('❌ EAS project ID not found. Push notifications require a standalone build.');
        return null;
      }

      // Get the token
      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: projectId,
      });

      const token = tokenData.data;

      // Store token locally
      await AsyncStorage.setItem('expo_push_token', token);

      return token;
    } catch (error: any) {
      console.error('❌ Error registering for push notifications:', error);
      return null;
    }
  }

  /**
   * Register token with backend
   */
  private async registerTokenWithBackend(token: string): Promise<boolean> {
    try {
      const { tokenManager } = await import('../utils/tokenManager');
      
      // Try to get valid token, with retry if needed
      let authToken = await tokenManager.getValidToken();
      if (!authToken) {
        // Wait a bit and try refreshing token
        await new Promise(resolve => setTimeout(resolve, 1000));
        authToken = await tokenManager.getValidToken();
        
        if (!authToken) {
          // Try force refresh
          try {
            await tokenManager.forceRefreshToken();
            authToken = await tokenManager.getValidToken();
          } catch (refreshError) {
            // Silent token refresh failure
          }
        }
      }
      
      if (!authToken) {
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
        return true;
      } else {
        return false;
      }
    } catch (error: any) {
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
        this.handleNotificationReceived(notification);
      } else {
        await this.handleBackgroundNotification(notification);
      }
    });

    // Handle notification tapped/opened (works in both foreground and background)
    Notifications.addNotificationResponseReceivedListener((response) => {
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
    ]).catch(() => {
      // Silent error handling
    });
  }

  /**
   * Handle notification received in foreground
   */
  private handleNotificationReceived(notification: Notifications.Notification) {
    try {
      // Update badge count (only if it's a valid number)
      const badgeCount = notification.request.content.badge;
      if (badgeCount !== undefined && badgeCount !== null && typeof badgeCount === 'number' && badgeCount >= 0) {
        Notifications.setBadgeCountAsync(badgeCount).catch(() => {
          // Silent error handling
        });
      }
    } catch (error: any) {
      // Silent error handling
    }
  }

  /**
   * Handle background notification (when app is closed or in background)
   * CRITICAL: This ensures notifications are processed even when app is not running
   */
  private async handleBackgroundNotification(notification: Notifications.Notification): Promise<void> {
    try {
      // Update badge count (only if it's a valid number)
      const badgeCount = notification.request.content.badge;
      if (badgeCount !== undefined && badgeCount !== null && typeof badgeCount === 'number' && badgeCount >= 0) {
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
        // Silent error handling
      }
    } catch (error: any) {
      // Silent error handling
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
      // Silent error handling
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
        // Ensure it's registered with backend
        this.ensureTokenRegistered().catch(() => {
          // Silent error handling
        });
        return storedToken;
      }

      // Generate new token
      const token = await this.registerForPushNotifications();
      if (token) {
        this.pushToken = token;
        // Register with backend (with retry)
        this.registerTokenWithBackendWithRetry(token).catch(() => {
          // Silent error handling
        });
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
          }).catch(() => {
            // Silent error handling
          });
        }
      }

      // Clear local data
      await AsyncStorage.removeItem('expo_push_token');
      this.pushToken = null;
      this.isInitialized = false;
    } catch (error) {
      // Silent error handling
    }
  }
}

// Export singleton instance
export const notificationService = NotificationService.getInstance();
export default NotificationService;
