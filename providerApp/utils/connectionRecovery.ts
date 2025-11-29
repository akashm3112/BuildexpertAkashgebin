/**
 * Connection Recovery Manager
 * Automatically recovers from network issues and validates tokens
 * when network is restored or app comes to foreground
 */

import { AppState, AppStateStatus } from 'react-native';
import { tokenManager } from './tokenManager';
import { storage } from './storage';
import { requestQueue } from './requestQueue';

class ConnectionRecoveryManager {
  private static instance: ConnectionRecoveryManager;
  private appStateSubscription: (() => void) | null = null;
  private networkListener: (() => void) | null = null;
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
        console.log('📱 App came to foreground, validating connection...');
        this.recoverConnection().catch((error) => {
          console.error('Error during connection recovery on app state change:', error);
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
          console.log('🌐 Network restored, recovering connection...');
          this.recoverConnection().catch((error) => {
            console.error('Error during connection recovery on network restore:', error);
          });
        }
      });
    } catch (error) {
      console.warn('NetInfo not available, using requestQueue network monitoring');
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
        console.log('🔐 No valid tokens found during recovery, attempting refresh...');
        
        // Try to refresh token (forceRefreshToken will handle missing tokens gracefully)
        try {
          const refreshedToken = await tokenManager.forceRefreshToken();
          
          if (refreshedToken) {
            console.log('✅ Token refreshed successfully during recovery');
            // Token refreshed, connection is recovered
            return;
          } else {
            console.log('⚠️ Token refresh failed during recovery - tokens may be expired or missing');
            // Token refresh failed - tokens are expired (30 days) or don't exist
            // Don't logout automatically - let the app handle it on next API call
            return;
          }
        } catch (refreshError: any) {
          console.warn('⚠️ Token refresh error during recovery:', refreshError.message);
          // Network error during refresh - will retry on next recovery
          return;
        }
      }

      // Tokens are valid, but verify they work by attempting a silent refresh
      // This ensures tokens are still valid on the server
      try {
        // Attempt a proactive token refresh to validate connection
        await tokenManager.getValidToken();
        console.log('✅ Connection validated successfully');
      } catch (error: any) {
        console.warn('⚠️ Token validation failed during recovery:', error.message);
        // If validation fails, try force refresh
        try {
          await tokenManager.forceRefreshToken();
          console.log('✅ Token refreshed after validation failure');
        } catch (refreshError) {
          console.warn('⚠️ Token refresh failed after validation failure');
          // Will be handled on next API call
        }
      }

      // Process any queued requests
      if (requestQueue.getQueueStatus().size > 0) {
        console.log('📦 Processing queued requests after recovery...');
        // Request queue will automatically process when network is detected
      }

    } catch (error) {
      console.error('❌ Connection recovery error:', error);
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
      console.error('Error in triggerRecovery:', error);
      // Don't throw - let the recovery handle its own errors
    }
  }

  /**
   * Cleanup listeners
   */
  cleanup() {
    if (this.appStateSubscription) {
      this.appStateSubscription();
      this.appStateSubscription = null;
    }
    if (this.networkListener) {
      this.networkListener();
      this.networkListener = null;
    }
  }
}

// Export singleton instance
export const connectionRecovery = ConnectionRecoveryManager.getInstance();

