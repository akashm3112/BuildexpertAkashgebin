import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Dimensions, Animated } from 'react-native';
import { Phone, PhoneOff, User } from 'lucide-react-native';
import { useWebRTCCall } from '@/hooks/useWebRTCCall';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export const CallScreen = () => {
  const {
    callStatus,
    incomingCall,
    currentCall,
    callDuration,
    acceptCall,
    rejectCall,
    endCall,
  } = useWebRTCCall();

  const pulseAnim = new Animated.Value(1);

  useEffect(() => {
    if (callStatus === 'ringing' || callStatus === 'calling') {
      // Pulsing animation for ringing state
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      ).start();
    }
  }, [callStatus]);

  // Format duration to MM:SS
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusText = () => {
    switch (callStatus) {
      case 'calling':
        return 'Calling...';
      case 'ringing':
        return 'Incoming Call';
      case 'connecting':
        return 'Connecting...';
      case 'connected':
        return formatDuration(callDuration);
      case 'ended':
        return 'Call Ended';
      default:
        return '';
    }
  };

  const getCallerName = () => {
    if (callStatus === 'ringing' && incomingCall) {
      return incomingCall.callerName;
    }
    if (currentCall) {
      return currentCall.receiverName;
    }
    return 'Unknown';
  };

  // Only show modal if there's an active call state
  const isVisible = callStatus !== 'idle';

  return (
    <Modal
      visible={isVisible}
      transparent={true}
      animationType="fade"
      onRequestClose={endCall}
    >
      <View style={styles.container}>
        <View style={styles.callCard}>
          {/* Avatar */}
          <Animated.View
            style={[
              styles.avatarContainer,
              callStatus === 'ringing' || callStatus === 'calling'
                ? { transform: [{ scale: pulseAnim }] }
                : {},
            ]}
          >
            <User size={60} color="#FFFFFF" />
          </Animated.View>

          {/* Caller Name */}
          <Text style={styles.callerName}>{getCallerName()}</Text>

          {/* Status */}
          <Text style={styles.statusText}>{getStatusText()}</Text>

          {/* Service Name (if available) */}
          {(incomingCall?.serviceName || currentCall?.serviceName) && (
            <Text style={styles.serviceText}>
              {incomingCall?.serviceName || currentCall?.serviceName}
            </Text>
          )}

          {/* Action Buttons */}
          <View style={styles.actions}>
            {/* Incoming Call - Show Accept/Reject */}
            {callStatus === 'ringing' && (
              <>
                <TouchableOpacity
                  style={[styles.actionButton, styles.rejectButton]}
                  onPress={rejectCall}
                >
                  <PhoneOff size={30} color="#FFFFFF" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, styles.acceptButton]}
                  onPress={acceptCall}
                >
                  <Phone size={30} color="#FFFFFF" />
                </TouchableOpacity>
              </>
            )}

            {/* Active/Calling - Show End Call */}
            {(callStatus === 'calling' ||
              callStatus === 'connecting' ||
              callStatus === 'connected') && (
              <TouchableOpacity
                style={[styles.actionButton, styles.endCallButton]}
                onPress={endCall}
              >
                <PhoneOff size={30} color="#FFFFFF" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  callCard: {
    width: SCREEN_WIDTH * 0.85,
    backgroundColor: '#1E293B',
    borderRadius: 24,
    padding: 40,
    alignItems: 'center',
  },
  avatarContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  callerName: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  statusText: {
    fontSize: 18,
    fontWeight: '500',
    color: '#94A3B8',
    marginBottom: 8,
  },
  serviceText: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 32,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 32,
    marginTop: 20,
  },
  actionButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  acceptButton: {
    backgroundColor: '#10B981',
  },
  rejectButton: {
    backgroundColor: '#EF4444',
  },
  endCallButton: {
    backgroundColor: '#EF4444',
  },
});

