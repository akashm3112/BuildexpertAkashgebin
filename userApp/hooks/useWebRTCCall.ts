import { useState, useEffect, useCallback, useRef } from 'react';
import { webRTCService, CallData } from '@/services/webrtc';
import { useAuth } from '@/context/AuthContext';
import { API_BASE_URL } from '@/constants/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type CallStatus = 'idle' | 'calling' | 'ringing' | 'connecting' | 'connected' | 'ended';

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
          const token = await AsyncStorage.getItem('token');
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

    init();

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
    setError(errorMsg);
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
      
      const token = await AsyncStorage.getItem('token');
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
        throw new Error(data.message || 'Failed to initiate call');
      }
    } catch (err: any) {
      console.error('Error initiating call:', err);
      setError(err.message || 'Failed to initiate call');
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
        const token = await AsyncStorage.getItem('token');
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

