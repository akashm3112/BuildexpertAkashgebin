import { useState, useEffect, useCallback, useRef } from 'react';
import { webRTCService, CallData } from '@/services/webrtc';
import { useAuth } from '@/context/AuthContext';
import { API_BASE_URL } from '@/constants/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
    setError(mapCallError(undefined, errorMsg));
    setCallStatus('ended');
    
    setTimeout(() => {
      setError(null);
      setCallStatus('idle');
      setCurrentCall(null);
    }, 3000);
  }, []);

  // Initiate a call
  const initiateCall = useCallback(async (bookingId: string, callerType: 'user' | 'provider') => {
    try {
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
        await webRTCService.startCall(callData);
      } else {
        const message = mapCallError(data.errorCode, data.message);
        const error = new Error(message);
        (error as any).code = data.errorCode;
        throw error;
      }
    } catch (err: any) {
      console.error('Error initiating call:', err);
      const message = mapCallError(err.code, err.message);
      setError(message);
      setCallStatus('idle');
    }
  }, []);

  // Accept incoming call
  const acceptCall = useCallback(async () => {
    try {
      setError(null);
      await webRTCService.acceptCall();
      setCurrentCall(incomingCall);
      setIncomingCall(null);
      setCallStatus('connecting');
    } catch (err: any) {
      console.error('Error accepting call:', err);
      setError(err.message || 'Failed to accept call');
      setCallStatus('idle');
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
      await webRTCService.endCall();
      
      // Log call if it was connected
      if (callStatus === 'connected' && currentCall) {
        const { tokenManager } = await import('@/utils/tokenManager');
        const token = await tokenManager.getValidToken();
        if (token) {
          await fetch(`${API_BASE_URL}/api/calls/log`, {
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

