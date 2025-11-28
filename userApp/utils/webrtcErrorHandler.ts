/**
 * ============================================================================
 * WEBRTC ERROR HANDLER & RECOVERY SYSTEM
 * Purpose: Comprehensive error categorization, recovery strategies, and fallback mechanisms
 * ============================================================================
 */

export enum WebRTCErrorType {
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  DEVICE_NOT_FOUND = 'DEVICE_NOT_FOUND',
  NETWORK_ERROR = 'NETWORK_ERROR',
  ICE_FAILED = 'ICE_FAILED',
  CONNECTION_FAILED = 'CONNECTION_FAILED',
  SIGNALING_ERROR = 'SIGNALING_ERROR',
  TIMEOUT = 'TIMEOUT',
  STUN_TURN_ERROR = 'STUN_TURN_ERROR',
  MEDIA_ERROR = 'MEDIA_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

export interface RecoveryAction {
  action: 'RETRY' | 'ICE_RESTART' | 'RECONNECT' | 'FALLBACK_TURN' | 'SHOW_ERROR' | 'CLEANUP';
  retryCount?: number;
  maxRetries?: number;
  backoffMs?: number;
  fallback?: RecoveryAction;
}

export interface ErrorContext {
  error: Error | any;
  context: string;
  peerConnectionState?: string;
  iceConnectionState?: string;
  signalingState?: string;
  retryCount?: number;
}

export class WebRTCErrorHandler {
  private retryCounts: Map<string, number> = new Map();
  private readonly MAX_RETRIES = 3;
  private readonly INITIAL_BACKOFF_MS = 1000;
  private readonly MAX_BACKOFF_MS = 10000;

  /**
   * Categorize WebRTC error
   */
  categorizeError(error: Error | any, context?: ErrorContext): WebRTCErrorType {
    const errorName = error?.name || '';
    const errorMessage = error?.message || '';
    const errorCode = error?.code || '';

    // Permission errors
    if (errorName === 'NotAllowedError' || errorMessage.includes('permission') || errorMessage.includes('denied')) {
      return WebRTCErrorType.PERMISSION_DENIED;
    }

    // Device errors
    if (errorName === 'NotFoundError' || errorName === 'DevicesNotFoundError' || errorMessage.includes('device') || errorMessage.includes('microphone')) {
      return WebRTCErrorType.DEVICE_NOT_FOUND;
    }

    // Network errors
    if (errorName === 'NetworkError' || 
        errorMessage.includes('network') || 
        errorMessage.includes('connection') ||
        errorMessage.includes('timeout') ||
        errorCode === 'ENOTFOUND' ||
        errorCode === 'ECONNREFUSED') {
      return WebRTCErrorType.NETWORK_ERROR;
    }

    // ICE errors
    if (errorMessage.includes('ICE') || 
        errorMessage.includes('ice') ||
        context?.iceConnectionState === 'failed' ||
        errorCode === 'ICE_FAILED') {
      return WebRTCErrorType.ICE_FAILED;
    }

    // Connection errors
    if (errorMessage.includes('connection failed') ||
        context?.peerConnectionState === 'failed' ||
        errorCode === 'CONNECTION_FAILED') {
      return WebRTCErrorType.CONNECTION_FAILED;
    }

    // Signaling errors
    if (errorMessage.includes('signaling') ||
        errorMessage.includes('offer') ||
        errorMessage.includes('answer') ||
        context?.signalingState === 'closed') {
      return WebRTCErrorType.SIGNALING_ERROR;
    }

    // Timeout errors
    if (errorName === 'TimeoutError' || 
        errorMessage.includes('timeout') ||
        errorCode === 'ETIMEDOUT') {
      return WebRTCErrorType.TIMEOUT;
    }

    // STUN/TURN errors
    if (errorMessage.includes('STUN') || 
        errorMessage.includes('TURN') ||
        errorMessage.includes('stun') ||
        errorMessage.includes('turn')) {
      return WebRTCErrorType.STUN_TURN_ERROR;
    }

    // Media errors
    if (errorName === 'MediaError' || 
        errorMessage.includes('media') ||
        errorMessage.includes('stream')) {
      return WebRTCErrorType.MEDIA_ERROR;
    }

    return WebRTCErrorType.UNKNOWN_ERROR;
  }

  /**
   * Get recovery action based on error type
   */
  getRecoveryAction(errorType: WebRTCErrorType, context?: ErrorContext): RecoveryAction {
    const retryCount = context?.retryCount || this.getRetryCount(context?.context || 'default');
    
    switch (errorType) {
      case WebRTCErrorType.PERMISSION_DENIED:
        return {
          action: 'SHOW_ERROR',
          fallback: {
            action: 'CLEANUP'
          }
        };

      case WebRTCErrorType.DEVICE_NOT_FOUND:
        return {
          action: 'SHOW_ERROR',
          fallback: {
            action: 'CLEANUP'
          }
        };

      case WebRTCErrorType.NETWORK_ERROR:
        if (retryCount < this.MAX_RETRIES) {
          return {
            action: 'RETRY',
            retryCount: retryCount + 1,
            maxRetries: this.MAX_RETRIES,
            backoffMs: this.calculateBackoff(retryCount),
            fallback: {
              action: 'FALLBACK_TURN',
              retryCount: 0,
              maxRetries: 2,
              backoffMs: this.INITIAL_BACKOFF_MS
            }
          };
        }
        return {
          action: 'FALLBACK_TURN',
          retryCount: 0,
          maxRetries: 2,
          backoffMs: this.INITIAL_BACKOFF_MS,
          fallback: {
            action: 'SHOW_ERROR'
          }
        };

      case WebRTCErrorType.ICE_FAILED:
        if (retryCount < this.MAX_RETRIES) {
          return {
            action: 'ICE_RESTART',
            retryCount: retryCount + 1,
            maxRetries: this.MAX_RETRIES,
            backoffMs: this.calculateBackoff(retryCount),
            fallback: {
              action: 'FALLBACK_TURN',
              retryCount: 0,
              maxRetries: 2,
              backoffMs: this.INITIAL_BACKOFF_MS
            }
          };
        }
        return {
          action: 'FALLBACK_TURN',
          retryCount: 0,
          maxRetries: 2,
          backoffMs: this.INITIAL_BACKOFF_MS,
          fallback: {
            action: 'SHOW_ERROR'
          }
        };

      case WebRTCErrorType.CONNECTION_FAILED:
        if (retryCount < this.MAX_RETRIES) {
          return {
            action: 'RECONNECT',
            retryCount: retryCount + 1,
            maxRetries: this.MAX_RETRIES,
            backoffMs: this.calculateBackoff(retryCount),
            fallback: {
              action: 'ICE_RESTART',
              retryCount: 0,
              maxRetries: 2,
              backoffMs: this.INITIAL_BACKOFF_MS
            }
          };
        }
        return {
          action: 'SHOW_ERROR',
          fallback: {
            action: 'CLEANUP'
          }
        };

      case WebRTCErrorType.SIGNALING_ERROR:
        if (retryCount < this.MAX_RETRIES) {
          return {
            action: 'RETRY',
            retryCount: retryCount + 1,
            maxRetries: this.MAX_RETRIES,
            backoffMs: this.calculateBackoff(retryCount),
            fallback: {
              action: 'RECONNECT',
              retryCount: 0,
              maxRetries: 2,
              backoffMs: this.INITIAL_BACKOFF_MS
            }
          };
        }
        return {
          action: 'SHOW_ERROR',
          fallback: {
            action: 'CLEANUP'
          }
        };

      case WebRTCErrorType.TIMEOUT:
        if (retryCount < this.MAX_RETRIES) {
          return {
            action: 'RETRY',
            retryCount: retryCount + 1,
            maxRetries: this.MAX_RETRIES,
            backoffMs: this.calculateBackoff(retryCount),
            fallback: {
              action: 'RECONNECT',
              retryCount: 0,
              maxRetries: 2,
              backoffMs: this.INITIAL_BACKOFF_MS
            }
          };
        }
        return {
          action: 'SHOW_ERROR',
          fallback: {
            action: 'CLEANUP'
          }
        };

      case WebRTCErrorType.STUN_TURN_ERROR:
        return {
          action: 'FALLBACK_TURN',
          retryCount: 0,
          maxRetries: 2,
          backoffMs: this.INITIAL_BACKOFF_MS,
          fallback: {
            action: 'SHOW_ERROR'
          }
        };

      case WebRTCErrorType.MEDIA_ERROR:
        if (retryCount < 2) {
          return {
            action: 'RETRY',
            retryCount: retryCount + 1,
            maxRetries: 2,
            backoffMs: this.calculateBackoff(retryCount),
            fallback: {
              action: 'SHOW_ERROR'
            }
          };
        }
        return {
          action: 'SHOW_ERROR',
          fallback: {
            action: 'CLEANUP'
          }
        };

      default:
        return {
          action: 'SHOW_ERROR',
          fallback: {
            action: 'CLEANUP'
          }
        };
    }
  }

  /**
   * Get user-friendly error message
   */
  getUserFriendlyMessage(errorType: WebRTCErrorType, error?: Error | any): string {
    switch (errorType) {
      case WebRTCErrorType.PERMISSION_DENIED:
        return 'Microphone access denied. Please allow microphone access in your device settings to make calls.';
      
      case WebRTCErrorType.DEVICE_NOT_FOUND:
        return 'No microphone found. Please connect a microphone to make calls.';
      
      case WebRTCErrorType.NETWORK_ERROR:
        return 'Network connection error. Please check your internet connection and try again.';
      
      case WebRTCErrorType.ICE_FAILED:
        return 'Connection failed. Attempting to reconnect...';
      
      case WebRTCErrorType.CONNECTION_FAILED:
        return 'Call connection failed. Please try again.';
      
      case WebRTCErrorType.SIGNALING_ERROR:
        return 'Call setup error. Please try again.';
      
      case WebRTCErrorType.TIMEOUT:
        return 'Call timed out. Please check your connection and try again.';
      
      case WebRTCErrorType.STUN_TURN_ERROR:
        return 'Connection server error. Attempting alternative connection...';
      
      case WebRTCErrorType.MEDIA_ERROR:
        return 'Audio device error. Please check your microphone settings.';
      
      default:
        return error?.message || 'An unexpected error occurred. Please try again.';
    }
  }

  /**
   * Calculate exponential backoff delay
   */
  private calculateBackoff(retryCount: number): number {
    const backoff = this.INITIAL_BACKOFF_MS * Math.pow(2, retryCount);
    return Math.min(backoff, this.MAX_BACKOFF_MS);
  }

  /**
   * Get retry count for a context
   */
  getRetryCount(context: string): number {
    return this.retryCounts.get(context) || 0;
  }

  /**
   * Increment retry count
   */
  incrementRetryCount(context: string): number {
    const current = this.getRetryCount(context);
    const newCount = current + 1;
    this.retryCounts.set(context, newCount);
    return newCount;
  }

  /**
   * Reset retry count
   */
  resetRetryCount(context: string): void {
    this.retryCounts.delete(context);
  }

  /**
   * Check if should retry
   */
  shouldRetry(recoveryAction: RecoveryAction): boolean {
    if (recoveryAction.action === 'SHOW_ERROR' || recoveryAction.action === 'CLEANUP') {
      return false;
    }
    if (recoveryAction.retryCount !== undefined && recoveryAction.maxRetries !== undefined) {
      return recoveryAction.retryCount < recoveryAction.maxRetries;
    }
    return true;
  }
}

// Export singleton instance
export const webrtcErrorHandler = new WebRTCErrorHandler();

