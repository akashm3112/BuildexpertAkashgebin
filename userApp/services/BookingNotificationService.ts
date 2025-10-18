import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * Booking Notification Service
 * 
 * Provides vibration and sound feedback for booking status changes
 * Similar to enterprise production apps like Uber, DoorDash, etc.
 */

export interface BookingNotificationConfig {
  enableVibration: boolean;
  enableSound: boolean;
  vibrationIntensity: 'light' | 'medium' | 'heavy';
  soundType: 'default' | 'success' | 'warning' | 'error';
}

export type BookingEventType = 
  | 'booking_accepted'
  | 'booking_cancelled' 
  | 'booking_completed'
  | 'booking_confirmed'
  | 'booking_rejected'
  | 'booking_reminder'
  | 'payment_received'
  | 'service_started';

class BookingNotificationService {
  private config: BookingNotificationConfig = {
    enableVibration: true,
    enableSound: true,
    vibrationIntensity: 'medium',
    soundType: 'default'
  };

  constructor() {
    this.initializeNotifications();
  }

  private async initializeNotifications() {
    // Configure notification behavior
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: this.config.enableSound,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  }

  /**
   * Update notification configuration
   */
  public updateConfig(newConfig: Partial<BookingNotificationConfig>) {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current configuration
   */
  public getConfig(): BookingNotificationConfig {
    return { ...this.config };
  }

  /**
   * Trigger vibration feedback
   */
  private async triggerVibration(intensity: 'light' | 'medium' | 'heavy' = 'medium') {
    if (!this.config.enableVibration) return;

    try {
      switch (intensity) {
        case 'light':
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          break;
        case 'medium':
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          break;
        case 'heavy':
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          break;
      }
    } catch (error) {
      console.warn('Vibration not supported on this device:', error);
    }
  }

  /**
   * Trigger sound feedback
   */
  private async triggerSound(soundType: 'default' | 'success' | 'warning' | 'error' = 'default') {
    if (!this.config.enableSound) return;

    try {
      // For now, we'll use the default notification sound
      // In a production app, you might want to use custom sound files
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '🔔',
          body: '', // Empty body for sound-only notification
          sound: true,
        },
        trigger: null, // Show immediately
      });
    } catch (error) {
      console.warn('Sound notification failed:', error);
    }
  }

  /**
   * Handle booking accepted notification
   */
  public async notifyBookingAccepted(providerName: string, serviceName: string) {
    console.log('🎉 Booking accepted notification triggered');
    
    // Success vibration pattern
    await this.triggerVibration('medium');
    await new Promise(resolve => setTimeout(resolve, 100));
    await this.triggerVibration('light');
    
    // Success sound
    await this.triggerSound('success');

    // Show notification
    await this.showNotification({
      title: '✅ Booking Accepted!',
      body: `${providerName} has accepted your ${serviceName} booking`,
      data: { type: 'booking_accepted' }
    });
  }

  /**
   * Handle booking cancelled notification
   */
  public async notifyBookingCancelled(providerName: string, serviceName: string, reason?: string) {
    console.log('❌ Booking cancelled notification triggered');
    
    // Warning vibration pattern
    await this.triggerVibration('heavy');
    await new Promise(resolve => setTimeout(resolve, 200));
    await this.triggerVibration('medium');
    
    // Warning sound
    await this.triggerSound('warning');

    // Show notification
    await this.showNotification({
      title: '❌ Booking Cancelled',
      body: reason 
        ? `${providerName} cancelled your ${serviceName} booking: ${reason}`
        : `${providerName} cancelled your ${serviceName} booking`,
      data: { type: 'booking_cancelled' }
    });
  }

  /**
   * Handle booking completed notification
   */
  public async notifyBookingCompleted(providerName: string, serviceName: string) {
    console.log('🎊 Booking completed notification triggered');
    
    // Success vibration pattern (different from accepted)
    await this.triggerVibration('heavy');
    await new Promise(resolve => setTimeout(resolve, 150));
    await this.triggerVibration('medium');
    await new Promise(resolve => setTimeout(resolve, 150));
    await this.triggerVibration('light');
    
    // Success sound
    await this.triggerSound('success');

    // Show notification
    await this.showNotification({
      title: '🎊 Service Completed!',
      body: `${providerName} has completed your ${serviceName} service`,
      data: { type: 'booking_completed' }
    });
  }

  /**
   * Handle booking confirmed notification
   */
  public async notifyBookingConfirmed(providerName: string, serviceName: string, scheduledDate: string) {
    console.log('✅ Booking confirmed notification triggered');
    
    // Confirmation vibration
    await this.triggerVibration('medium');
    
    // Default sound
    await this.triggerSound('default');

    // Show notification
    await this.showNotification({
      title: '✅ Booking Confirmed',
      body: `Your ${serviceName} with ${providerName} is confirmed for ${scheduledDate}`,
      data: { type: 'booking_confirmed' }
    });
  }

  /**
   * Handle booking rejected notification
   */
  public async notifyBookingRejected(providerName: string, serviceName: string, reason?: string) {
    console.log('🚫 Booking rejected notification triggered');
    
    // Error vibration pattern
    await this.triggerVibration('heavy');
    await new Promise(resolve => setTimeout(resolve, 300));
    await this.triggerVibration('heavy');
    
    // Error sound
    await this.triggerSound('error');

    // Show notification
    await this.showNotification({
      title: '🚫 Booking Rejected',
      body: reason 
        ? `${providerName} rejected your ${serviceName} booking: ${reason}`
        : `${providerName} rejected your ${serviceName} booking`,
      data: { type: 'booking_rejected' }
    });
  }

  /**
   * Handle booking reminder notification
   */
  public async notifyBookingReminder(providerName: string, serviceName: string, timeUntil: string) {
    console.log('⏰ Booking reminder notification triggered');
    
    // Gentle reminder vibration
    await this.triggerVibration('light');
    
    // Default sound
    await this.triggerSound('default');

    // Show notification
    await this.showNotification({
      title: '⏰ Service Reminder',
      body: `Your ${serviceName} with ${providerName} is in ${timeUntil}`,
      data: { type: 'booking_reminder' }
    });
  }

  /**
   * Handle payment received notification
   */
  public async notifyPaymentReceived(amount: number, serviceName: string) {
    console.log('💰 Payment received notification triggered');
    
    // Success vibration pattern
    await this.triggerVibration('medium');
    await new Promise(resolve => setTimeout(resolve, 100));
    await this.triggerVibration('light');
    
    // Success sound
    await this.triggerSound('success');

    // Show notification
    await this.showNotification({
      title: '💰 Payment Received',
      body: `₹${amount} received for ${serviceName}`,
      data: { type: 'payment_received' }
    });
  }

  /**
   * Handle service started notification
   */
  public async notifyServiceStarted(providerName: string, serviceName: string) {
    console.log('🚀 Service started notification triggered');
    
    // Start vibration pattern
    await this.triggerVibration('medium');
    
    // Default sound
    await this.triggerSound('default');

    // Show notification
    await this.showNotification({
      title: '🚀 Service Started',
      body: `${providerName} has started your ${serviceName} service`,
      data: { type: 'service_started' }
    });
  }

  /**
   * Show notification with custom content
   */
  private async showNotification({
    title,
    body,
    data
  }: {
    title: string;
    body: string;
    data?: any;
  }) {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data,
          sound: this.config.enableSound,
        },
        trigger: null, // Show immediately
      });
    } catch (error) {
      console.error('Failed to show notification:', error);
    }
  }

  /**
   * Test notification system
   */
  public async testNotification() {
    console.log('🧪 Testing notification system...');
    
    await this.triggerVibration('medium');
    await this.triggerSound('default');
    
    await this.showNotification({
      title: '🧪 Test Notification',
      body: 'Notification system is working correctly!',
      data: { type: 'test' }
    });
  }
}

// Export singleton instance
export const bookingNotificationService = new BookingNotificationService();
export default bookingNotificationService;


