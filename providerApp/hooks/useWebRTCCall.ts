import { useState, useEffect, useCallback, useRef } from 'react';
import { webRTCService, CallData } from '@/services/webrtc';
import { useAuth } from '@/context/AuthContext';
import { API_BASE_URL } from '@/constants/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Toast from 'react-native-toast-message';

export type CallStatus = 'idle' | 'calling' | 'ringing' | 'connecting' | 'connected' | 'ended';

const CALL_ERROR_MESSAGES: Record<string, string> = {
  CALL_BOOKING_NOT_FOUND: 'Unable to find that booking or you no longer have access to it.',
  CALL_STATUS_NOT_ALLOWED: 'Calls are only available for active bookings.',
  CALLER_NOT_VERIFIED: 'Please verify your account before placing calls.',
  CALLER_PHONE_MISSING: 'Add a valid phone number to your profile before calling.',
  RECEIVER_NOT_VERIFIED: 'The customer must verify their account before calls can begin.',
  RECEIVER_PHONE_MISSING: 'The customer has not added a phone number yet.',
  PROVIDER_CALLS_DISABLED: 'Your subscription is inactive. Renew to continue calling customers.',
  CALLER_ROLE_MISMATCH: 'Invalid caller information supplied for this booking.',
  CALL_SELF_NOT_ALLOWED: 'You cannot initiate a call with yourself.',
  CALL_HISTORY_ACCESS_DENIED: 'You do not have permission to view this call history.',
  WEBRTC_PERMISSION_DENIED: 'You do not have permission to start this call.',
  WEBRTC_INVALID_PAYLOAD: 'Unsupported call request. Please update the app and try again.',
  WEBRTC_ERROR: 'An unexpected call error occurred. Please try again.',
};

const mapCallError = (errorCode?: string, fallback?: string) => {
  if (!errorCode) {
    return fallback || 'Failed to initiate call';
  }
  return CALL_ERROR_MESSAGES[errorCode] || fallback || 'Failed to initiate call';
};

export const useWebRTCCall = () => {
  const { user } = useAuth();
  const [callStatus, setCallStatus] = useState<CallStatus>('idle');
  const [incomingCall, setIncomingCall] = useState<CallData | null>(null);
  const [currentCall, setCurrentCall] = useState<CallData | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const durationInterval = useRef<number | null>(null);
  const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Connection timeout duration (20 seconds)
  const CONNECTION_TIMEOUT = 20000;

  // Monitor call status changes and clear timeout when call connects or ends
  useEffect(() => {
    // Clear timeout if call status changes to connected, ended, or idle
    if (callStatus === 'connected' || callStatus === 'ended' || callStatus === 'idle') {
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }
    }
  }, [callStatus]);

  // Initialize WebRTC service
  useEffect(() => {
    const init = async () => {
      if (user?.id) {
        try {
          const { tokenManager } = await import('@/utils/tokenManager');
          const token = await tokenManager.getValidToken();
          if (token) {
            await webRTCService.initialize(user.id, token);
            
            // Set up event handlers
            webRTCService.on({
              onIncomingCall: handleIncomingCall,
              onCallAccepted: handleCallAccepted,
              onCallRejected: handleCallRejected,
              onCallEnded: handleCallEnded,
              onCallConnected: handleCallConnected,
              onError: handleError,
            });
          }
        } catch (err) {
          console.error('Failed to initialize WebRTC:', err);
          setError('Failed to initialize call service');
        }
      }
    };

    init().catch((error) => {
      console.error('Failed to initialize WebRTC service:', error);
      setError('Failed to initialize call service');
    });

    return () => {
      if (durationInterval.current) {
        clearInterval(durationInterval.current);
      }
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }
      webRTCService.disconnect();
    };
  }, [user?.id]);

  const handleIncomingCall = useCallback((data: CallData) => {
    setIncomingCall(data);
    setCallStatus('ringing');
  }, []);

  const handleCallAccepted = useCallback(() => {
    setCallStatus('connecting');
  }, []);

  const handleCallRejected = useCallback((reason: string) => {
    setError(`Call rejected: ${reason}`);
    setCallStatus('ended');
    setCurrentCall(null);
  }, []);

  const handleCallEnded = useCallback((duration: number, endedBy: string) => {
    // Clear connection timeout when call ends
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }
    
    setCallStatus('ended');
    setCallDuration(duration);
    if (durationInterval.current) {
      clearInterval(durationInterval.current);
    }
    
    // Reset after a delay
    setTimeout(() => {
      setCallStatus('idle');
      setCurrentCall(null);
      setIncomingCall(null);
      setCallDuration(0);
    }, 2000);
  }, []);

  const handleCallConnected = useCallback(() => {
    // Clear connection timeout since connection is established
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }
    
    setCallStatus('connected');
    setCallDuration(0);
    
    // Start duration counter
    if (durationInterval.current) {
      clearInterval(durationInterval.current);
    }
    
    durationInterval.current = setInterval(() => {
      setCallDuration(prev => prev + 1);
    }, 1000);
  }, []);

  const handleError = useCallback((errorMsg: string) => {
    // Clear connection timeout on error
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }
    
    const errorMessage = mapCallError(undefined, errorMsg);
    setError(errorMessage);
    setCallStatus('ended');
    
    // Show error toast to user
    Toast.show({
      type: 'error',
      text1: 'Call Failed',
      text2: errorMessage,
      position: 'top',
      visibilityTime: 4000,
    });
    
    setTimeout(() => {
      setError(null);
      setCallStatus('idle');
      setCurrentCall(null);
    }, 3000);
  }, []);

  // Initiate a call
  const initiateCall = useCallback(async (bookingId: string, callerType: 'user' | 'provider') => {
    try {
      // Clear any existing timeout
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }
      
      setError(null);
      setCallStatus('calling');
      
      const { tokenManager } = await import('@/utils/tokenManager');
      const token = await tokenManager.getValidToken();
      if (!token) {
        throw new Error('No authentication token');
      }

      // Get call information from backend
      const response = await fetch(`${API_BASE_URL}/api/calls/initiate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ bookingId, callerType }),
      });

      // Handle 401 errors (session expired)
      if (response.status === 401) {
        const refreshedToken = await tokenManager.forceRefreshToken();
        if (refreshedToken) {
          // Retry with new token
          const retryResponse = await fetch(`${API_BASE_URL}/api/calls/initiate`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${refreshedToken}`,
            },
            body: JSON.stringify({ bookingId, callerType }),
          });
          if (retryResponse.ok) {
            const retryData = await retryResponse.json();
            if (retryData.status === 'success') {
              const callData: CallData = {
                bookingId: retryData.data.bookingId,
                callerId: retryData.data.callerId,
                callerName: retryData.data.callerName,
                receiverId: retryData.data.receiverId,
                receiverName: retryData.data.receiverName,
                serviceName: retryData.data.serviceName,
              };
              setCurrentCall(callData);
              
              // Set up connection timeout before starting call
              connectionTimeoutRef.current = setTimeout(() => {
                // Check current status first (read-only)
                setCallStatus((currentStatus) => {
                  // Only proceed if still in calling/connecting state
                  if (currentStatus === 'calling' || currentStatus === 'connecting') {
                    // Schedule side effects outside of setState callback
                    setTimeout(() => {
                      const errorMessage = 'Connection timeout. Unable to establish call connection. Please check your internet connection and try again.';
                      setError(errorMessage);
                      
                      // Show error toast to user
                      Toast.show({
                        type: 'error',
                        text1: 'Call Failed',
                        text2: errorMessage,
                        position: 'top',
                        visibilityTime: 5000,
                      });
                      
                      // End the call
                      webRTCService.endCall().catch(() => {
                        // Ignore errors when ending call due to timeout
                      });
                      
                      // Reset after a delay
                      setTimeout(() => {
                        setCallStatus('idle');
                        setCurrentCall(null);
                        setError(null);
                      }, 2000);
                    }, 0);
                    
                    return 'ended';
                  }
                  return currentStatus;
                });
                
                connectionTimeoutRef.current = null;
              }, CONNECTION_TIMEOUT);
              
              await webRTCService.startCall(callData);
              return;
            }
          }
        }
        // Refresh token expired (30 days) - throw handled error
        // Create a suppressed error that won't be logged by React Native
        const sessionExpiredError = new Error('Session expired');
        (sessionExpiredError as any)._suppressUnhandled = true;
        (sessionExpiredError as any)._handled = true;
        throw sessionExpiredError;
      }

      const data = await response.json();

      if (data.status === 'success') {
        const callData: CallData = {
          bookingId: data.data.bookingId,
          callerId: data.data.callerId,
          callerName: data.data.callerName,
          receiverId: data.data.receiverId,
          receiverName: data.data.receiverName,
          serviceName: data.data.serviceName,
        };

        setCurrentCall(callData);
        
        // Set up connection timeout before starting call
        connectionTimeoutRef.current = setTimeout(() => {
          // Check current status first (read-only)
          setCallStatus((currentStatus) => {
            // Only proceed if still in calling/connecting state
            if (currentStatus === 'calling' || currentStatus === 'connecting') {
              // Schedule side effects outside of setState callback
              setTimeout(() => {
                const errorMessage = 'Connection timeout. Unable to establish call connection. Please check your internet connection and try again.';
                setError(errorMessage);
                
                // Show error toast to user
                Toast.show({
                  type: 'error',
                  text1: 'Call Failed',
                  text2: errorMessage,
                  position: 'top',
                  visibilityTime: 5000,
                });
                
                // End the call
                webRTCService.endCall().catch(() => {
                  // Ignore errors when ending call due to timeout
                });
                
                // Reset after a delay
                setTimeout(() => {
                  setCallStatus('idle');
                  setCurrentCall(null);
                  setError(null);
                }, 2000);
              }, 0);
              
              return 'ended';
            }
            return currentStatus;
          });
          
          connectionTimeoutRef.current = null;
        }, CONNECTION_TIMEOUT);
        
        await webRTCService.startCall(callData);
      } else {
        const message = mapCallError(data.errorCode, data.message);
        const error = new Error(message);
        (error as any).code = data.errorCode;
        throw error;
      }
    } catch (err: any) {
      // Clear timeout on error
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }
      
      console.error('Error initiating call:', err);
      const message = mapCallError(err.code, err.message);
      setError(message);
      setCallStatus('idle');
      
      // Show error toast to user
      Toast.show({
        type: 'error',
        text1: 'Call Failed',
        text2: message,
        position: 'top',
        visibilityTime: 4000,
      });
    }
  }, []);

  // Accept incoming call
  const acceptCall = useCallback(async () => {
    try {
      // Clear any existing timeout
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }
      
      setError(null);
      await webRTCService.acceptCall();
      setCurrentCall(incomingCall);
      setIncomingCall(null);
      setCallStatus('connecting');
      
      // Set up connection timeout for accepted calls
      connectionTimeoutRef.current = setTimeout(() => {
        setCallStatus((currentStatus) => {
          if (currentStatus === 'connecting') {
            setTimeout(() => {
              const errorMessage = 'Connection timeout. Unable to establish call connection. Please check your internet connection and try again.';
              setError(errorMessage);
              
              Toast.show({
                type: 'error',
                text1: 'Call Failed',
                text2: errorMessage,
                position: 'top',
                visibilityTime: 5000,
              });
              
              webRTCService.endCall().catch(() => {});
              
              setTimeout(() => {
                setCallStatus('idle');
                setCurrentCall(null);
                setError(null);
              }, 2000);
            }, 0);
            
            return 'ended';
          }
          return currentStatus;
        });
        
        connectionTimeoutRef.current = null;
      }, CONNECTION_TIMEOUT);
    } catch (err: any) {
      // Clear timeout on error
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }
      
      console.error('Error accepting call:', err);
      const errorMessage = err.message || 'Failed to accept call';
      setError(errorMessage);
      setCallStatus('idle');
      
      Toast.show({
        type: 'error',
        text1: 'Call Failed',
        text2: errorMessage,
        position: 'top',
        visibilityTime: 4000,
      });
    }
  }, [incomingCall]);

  // Reject incoming call
  const rejectCall = useCallback(() => {
    webRTCService.rejectCall();
    setIncomingCall(null);
    setCallStatus('idle');
  }, []);

  // End current call
  const endCall = useCallback(async () => {
    try {
      // Clear connection timeout when ending call
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }
      
      await webRTCService.endCall();
      
      // Log call if it was connected
      if (callStatus === 'connected' && currentCall) {
        const { tokenManager } = await import('@/utils/tokenManager');
        const token = await tokenManager.getValidToken();
        if (token) {
          try {
            const response = await fetch(`${API_BASE_URL}/api/calls/log`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
              },
              body: JSON.stringify({
                bookingId: currentCall.bookingId,
                duration: callDuration,
                callerType: user?.role === 'provider' ? 'provider' : 'user',
                status: 'completed',
              }),
            });
            
            // Handle 401 errors silently (session expired) - don't block call ending
            if (response.status === 401) {
              // Try to refresh token, but don't retry - just log silently
              await tokenManager.forceRefreshToken().catch(() => {
                // Ignore refresh errors - call logging is not critical
              });
            }
          } catch (logError) {
            // Ignore call logging errors - they're not critical
            const isSessionExpired = (logError as any)?.message === 'Session expired' || 
                                     (logError as any)?.status === 401;
            if (!isSessionExpired) {
              console.warn('Error logging call (non-critical):', logError);
            }
          }
        }
      }
    } catch (err) {
      console.error('Error ending call:', err);
    }
  }, [callStatus, currentCall, callDuration, user?.role]);

  return {
    callStatus,
    incomingCall,
    currentCall,
    callDuration,
    error,
    initiateCall,
    acceptCall,
    rejectCall,
    endCall,
  };
};

