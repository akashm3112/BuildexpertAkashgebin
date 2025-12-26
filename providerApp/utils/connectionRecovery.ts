/**
 * Connection Recovery Manager
 * Automatically recovers from network issues and validates tokens
 * when network is restored or app comes to foreground
 */

import { AppState, AppStateStatus, NativeEventSubscription } from 'react-native';
import { tokenManager } from './tokenManager';
import { storage } from './storage';
import { requestQueue } from './requestQueue';

class ConnectionRecoveryManager {
  private static instance: ConnectionRecoveryManager;
  private appStateSubscription: NativeEventSubscription | null = null;
  private networkListener: { remove: () => void } | null = null;
  private isRecovering = false;
  private lastRecoveryAttempt = 0;
  private readonly RECOVERY_COOLDOWN = 5000; // 5 seconds between recovery attempts

  private constructor() {
    this.initialize();
  }

  static getInstance(): ConnectionRecoveryManager {
    if (!ConnectionRecoveryManager.instance) {
      ConnectionRecoveryManager.instance = new ConnectionRecoveryManager();
    }
    return ConnectionRecoveryManager.instance;
  }

  private initialize() {
    this.setupAppStateListener();
    this.setupNetworkListener();
  }

  /**
   * Monitor app state changes (foreground/background)
   */
  private setupAppStateListener() {
    this.appStateSubscription = AppState.addEventListener('change', async (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        // App came to foreground - validate connection and tokens
        this.recoverConnection().catch(() => {
          // Silently fail - recovery errors are not critical
        });
      }
    });
  }

  /**
   * Monitor network state changes
   */
  private setupNetworkListener() {
    try {
      const NetInfo = require('@react-native-community/netinfo');
      
      this.networkListener = NetInfo.addEventListener(async (state: any) => {
        const isOnline = state.isConnected && state.isInternetReachable !== false;
        
        if (isOnline) {
          // Network restored - recover connection
          this.recoverConnection().catch(() => {
            // Silently fail - recovery errors are not critical
          });
        }
      });
    } catch (error) {
      // Fallback: requestQueue already has network monitoring
    }
  }

  /**
   * Recover connection by validating tokens and refreshing if needed
   */
  private async recoverConnection(): Promise<void> {
    // Prevent multiple simultaneous recovery attempts
    if (this.isRecovering) {
      return;
    }

    // Cooldown to prevent excessive recovery attempts
    const now = Date.now();
    if (now - this.lastRecoveryAttempt < this.RECOVERY_COOLDOWN) {
      return;
    }

    this.isRecovering = true;
    this.lastRecoveryAttempt = now;

    try {
      // Check if user is logged in
      const userData = await storage.getJSON<any>('user', {
        maxRetries: 2,
      });

      if (!userData) {
        // No user data, nothing to recover
        return;
      }

      // Validate tokens exist and try to refresh if needed
      const hasValidToken = await tokenManager.isTokenValid();
      
      if (!hasValidToken) {
        // Try to refresh token (forceRefreshToken will handle missing tokens gracefully)
        try {
          const refreshedToken = await tokenManager.forceRefreshToken();
          
          if (refreshedToken) {
            // Token refreshed, connection is recovered
            return;
          } else {
            // Token refresh failed - tokens are expired (30 days) or don't exist
            // Don't logout automatically - let the app handle it on next API call
            return;
          }
        } catch (refreshError: any) {
          // Network error during refresh - will retry on next recovery
          return;
        }
      }

      // Tokens are valid, but verify they work by attempting a silent refresh
      // This ensures tokens are still valid on the server
      try {
        // Attempt a proactive token refresh to validate connection
        await tokenManager.getValidToken();
      } catch (error: any) {
        // If validation fails, try force refresh
        try {
          await tokenManager.forceRefreshToken();
        } catch (refreshError) {
          // Will be handled on next API call
        }
      }

      // Process any queued requests
      if (requestQueue.getQueueStatus().size > 0) {
        // Request queue will automatically process when network is detected
      }

    } catch (error) {
      // Silently fail - recovery errors are not critical
    } finally {
      this.isRecovering = false;
    }
  }

  /**
   * Manually trigger connection recovery
   */
  async triggerRecovery(): Promise<void> {
    try {
      await this.recoverConnection();
    } catch (error) {
      // Don't throw - let the recovery handle its own errors
    }
  }

  /**
   * Cleanup listeners
   */
  cleanup() {
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }
    if (this.networkListener) {
      this.networkListener.remove();
      this.networkListener = null;
    }
  }
}

// Export singleton instance
export const connectionRecovery = ConnectionRecoveryManager.getInstance();

