import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, AppStateStatus } from 'react-native';
import { API_BASE_URL } from '@/constants/api';

/**
 * Notification service that works in Expo Go
 * Uses Socket.io + local notifications instead of push notifications
 */
class ExpoGoNotificationService {
  private static instance: ExpoGoNotificationService;
  private appStateSubscription: any = null;
  private notificationCallbacks: ((notification: any) => void)[] = [];

  private constructor() {
    this.setupAppStateListener();
  }

  static getInstance(): ExpoGoNotificationService {
    if (!ExpoGoNotificationService.instance) {
      ExpoGoNotificationService.instance = new ExpoGoNotificationService();
    }
    return ExpoGoNotificationService.instance;
  }

  /**
   * Initialize notification service for Expo Go
   */
  async initialize(): Promise<boolean> {
    console.log('📱 Initializing Expo Go notification service...');
    
    // Register device info (without push token)
    await this.registerDevice();
    
    console.log('✅ Expo Go notification service initialized');
    return true;
  }

  /**
   * Register device info with backend
   */
  private async registerDevice(): Promise<void> {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) return;

      const deviceInfo = {
        platform: 'expo-go',
        deviceType: 'development',
        timestamp: Date.now(),
      };

      await fetch(`${API_BASE_URL}/api/push-notifications/register-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          pushToken: `expo-go-${Date.now()}`, // Fake token for development
          deviceInfo,
        }),
      });

      console.log('✅ Device registered for Expo Go notifications');
    } catch (error) {
      console.error('❌ Error registering device:', error);
    }
  }

  /**
   * Setup app state listener for background notification checking
   */
  private setupAppStateListener(): void {
    this.appStateSubscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        // App came to foreground, check for missed notifications
        this.checkMissedNotifications();
      }
    });
  }

  /**
   * Check for notifications missed while app was in background
   */
  private async checkMissedNotifications(): Promise<void> {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) return;

      const lastCheck = await AsyncStorage.getItem('last_notification_check') || '0';
      const since = parseInt(lastCheck);

      const response = await fetch(`${API_BASE_URL}/api/notifications/recent?since=${since}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        const newNotifications = data.data?.notifications || [];

        for (const notification of newNotifications) {
          // Trigger notification callbacks
          this.notificationCallbacks.forEach(callback => callback(notification));
        }

        if (newNotifications.length > 0) {
          await AsyncStorage.setItem('last_notification_check', Date.now().toString());
          console.log(`📱 Found ${newNotifications.length} missed notifications`);
        }
      }
    } catch (error) {
      console.error('❌ Error checking missed notifications:', error);
    }
  }

  /**
   * Add notification listener
   */
  addNotificationListener(callback: (notification: any) => void): void {
    this.notificationCallbacks.push(callback);
  }

  /**
   * Remove notification listener
   */
  removeNotificationListener(callback: (notification: any) => void): void {
    const index = this.notificationCallbacks.indexOf(callback);
    if (index > -1) {
      this.notificationCallbacks.splice(index, 1);
    }
  }

  /**
   * Send test notification (simulated)
   */
  async sendTestNotification(): Promise<boolean> {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) return false;

      // For Expo Go, we'll simulate by triggering the callback directly
      const testNotification = {
        id: 'test-' + Date.now(),
        title: 'Test Notification',
        message: 'This is a test notification for Expo Go!',
        type: 'test',
        created_at: new Date().toISOString(),
      };

      // Trigger all callbacks
      this.notificationCallbacks.forEach(callback => callback(testNotification));
      
      console.log('📱 Test notification triggered');
      return true;
    } catch (error) {
      console.error('❌ Error sending test notification:', error);
      return false;
    }
  }

  /**
   * Cleanup
   */
  async cleanup(): Promise<void> {
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
    }
    this.notificationCallbacks = [];
    console.log('✅ Expo Go notification service cleaned up');
  }
}

export const expoGoNotificationService = ExpoGoNotificationService.getInstance();
export default ExpoGoNotificationService;



