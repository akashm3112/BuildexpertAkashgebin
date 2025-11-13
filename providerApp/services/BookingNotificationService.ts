import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Conditionally import expo-notifications only in development builds
let Notifications: any = null;
try {
  if (Constants.appOwnership !== 'expo') {
    Notifications = require('expo-notifications');
  }
} catch (error) {
}

/**
 * Booking Notification Service for Provider App
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
  | 'new_booking_received'
  | 'booking_cancelled_by_customer'
  | 'booking_completed'
  | 'booking_confirmed'
  | 'payment_received'
  | 'customer_rating_received'
  | 'booking_reminder'
  | 'service_requested';

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
    // Skip initialization in Expo Go
    if (!Notifications) {
      return;
    }

    // Configure notification behavior
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: this.config.enableSound,
        shouldSetBadge: true,
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
      // Skip in Expo Go
      if (!Notifications) {
        return;
      }

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
   * Handle new booking received notification
   */
  public async notifyNewBookingReceived(customerName: string, serviceName: string, scheduledDate: string) {
    
    // Urgent vibration pattern for new bookings
    await this.triggerVibration('heavy');
    await new Promise(resolve => setTimeout(resolve, 100));
    await this.triggerVibration('heavy');
    await new Promise(resolve => setTimeout(resolve, 100));
    await this.triggerVibration('medium');
    
    // Urgent sound
    await this.triggerSound('default');

    // Show notification
    await this.showNotification({
      title: '📱 New Booking Request!',
      body: `${customerName} requested ${serviceName} for ${scheduledDate}`,
      data: { type: 'new_booking_received' }
    });
  }

  /**
   * Handle booking cancelled by customer notification
   */
  public async notifyBookingCancelledByCustomer(customerName: string, serviceName: string, reason?: string) {
    
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
        ? `${customerName} cancelled ${serviceName} booking: ${reason}`
        : `${customerName} cancelled ${serviceName} booking`,
      data: { type: 'booking_cancelled_by_customer' }
    });
  }

  /**
   * Handle booking completed notification
   */
  public async notifyBookingCompleted(customerName: string, serviceName: string, amount: number) {
    
    // Success vibration pattern
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
      body: `You completed ${serviceName} for ${customerName}. Payment: ₹${amount}`,
      data: { type: 'booking_completed' }
    });
  }

  /**
   * Handle booking confirmed notification
   */
  public async notifyBookingConfirmed(customerName: string, serviceName: string, scheduledDate: string) {
    
    // Confirmation vibration
    await this.triggerVibration('medium');
    
    // Default sound
    await this.triggerSound('default');

    // Show notification
    await this.showNotification({
      title: '✅ Booking Confirmed',
      body: `${serviceName} with ${customerName} confirmed for ${scheduledDate}`,
      data: { type: 'booking_confirmed' }
    });
  }

  /**
   * Handle payment received notification
   */
  public async notifyPaymentReceived(amount: number, customerName: string, serviceName: string) {
    
    // Success vibration pattern
    await this.triggerVibration('medium');
    await new Promise(resolve => setTimeout(resolve, 100));
    await this.triggerVibration('light');
    
    // Success sound
    await this.triggerSound('success');

    // Show notification
    await this.showNotification({
      title: '💰 Payment Received',
      body: `₹${amount} received from ${customerName} for ${serviceName}`,
      data: { type: 'payment_received' }
    });
  }

  /**
   * Handle customer rating received notification
   */
  public async notifyCustomerRatingReceived(customerName: string, rating: number, serviceName: string) {
    
    // Positive vibration pattern
    await this.triggerVibration('medium');
    await new Promise(resolve => setTimeout(resolve, 100));
    await this.triggerVibration('light');
    
    // Success sound
    await this.triggerSound('success');

    // Show notification
    await this.showNotification({
      title: '⭐ New Rating Received',
      body: `${customerName} rated you ${rating}/5 stars for ${serviceName}`,
      data: { type: 'customer_rating_received' }
    });
  }

  /**
   * Handle booking reminder notification
   */
  public async notifyBookingReminder(customerName: string, serviceName: string, timeUntil: string) {
    
    // Gentle reminder vibration
    await this.triggerVibration('light');
    
    // Default sound
    await this.triggerSound('default');

    // Show notification
    await this.showNotification({
      title: '⏰ Service Reminder',
      body: `${serviceName} with ${customerName} is in ${timeUntil}`,
      data: { type: 'booking_reminder' }
    });
  }

  /**
   * Handle service requested notification
   */
  public async notifyServiceRequested(customerName: string, serviceName: string, location: string) {
    
    // Attention vibration pattern
    await this.triggerVibration('heavy');
    await new Promise(resolve => setTimeout(resolve, 100));
    await this.triggerVibration('medium');
    
    // Default sound
    await this.triggerSound('default');

    // Show notification
    await this.showNotification({
      title: '🔔 Service Request',
      body: `${customerName} needs ${serviceName} at ${location}`,
      data: { type: 'service_requested' }
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
      // Skip in Expo Go
      if (!Notifications) {
        return;
      }

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
    
    await this.triggerVibration('medium');
    await this.triggerSound('default');
    
    await this.showNotification({
      title: '🧪 Test Notification',
      body: 'Provider notification system is working correctly!',
      data: { type: 'test' }
    });
  }
}

// Export singleton instance
export const bookingNotificationService = new BookingNotificationService();
export default bookingNotificationService;


