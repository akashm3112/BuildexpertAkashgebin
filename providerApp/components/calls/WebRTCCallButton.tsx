import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { Phone } from 'lucide-react-native';
import { useWebRTCCall } from '@/hooks/useWebRTCCall';

interface WebRTCCallButtonProps {
  bookingId: string;
  style?: any;
  disabled?: boolean;
  size?: 'small' | 'medium' | 'large';
  variant?: 'primary' | 'secondary' | 'outline';
}

export default function WebRTCCallButton({
  bookingId,
  style,
  disabled = false,
  size = 'medium',
  variant = 'primary'
}: WebRTCCallButtonProps) {
  // Don't show call button on web
  if (Platform.OS === 'web') {
    return null;
  }

  const { initiateCall, callStatus } = useWebRTCCall();
  const isLoading = callStatus === 'calling' || callStatus === 'connecting';

  const handleCall = async () => {
    if (disabled || isLoading) return;
    await initiateCall(bookingId, 'provider');
  };

  const getButtonSize = () => {
    switch (size) {
      case 'small':
        return { paddingHorizontal: 12, paddingVertical: 8, minHeight: 36 };
      case 'large':
        return { paddingHorizontal: 20, paddingVertical: 14, minHeight: 48 };
      default:
        return { paddingHorizontal: 16, paddingVertical: 10, minHeight: 40 };
    }
  };

  const getIconSize = () => {
    switch (size) {
      case 'small': return 16;
      case 'large': return 24;
      default: return 20;
    }
  };

  const getButtonStyle = () => {
    const baseStyle: any[] = [styles.button, getButtonSize()];
    
    switch (variant) {
      case 'secondary':
        baseStyle.push(styles.secondaryButton);
        break;
      case 'outline':
        baseStyle.push(styles.outlineButton);
        break;
      default:
        baseStyle.push(styles.primaryButton);
    }
    
    if (disabled || isLoading) {
      baseStyle.push(styles.disabledButton);
    }
    
    return baseStyle;
  };

  const getTextStyle = () => {
    const baseStyle: any[] = [styles.buttonText];
    
    switch (variant) {
      case 'secondary':
        baseStyle.push(styles.secondaryText);
        break;
      case 'outline':
        baseStyle.push(styles.outlineText);
        break;
      default:
        baseStyle.push(styles.primaryText);
    }
    
    return baseStyle;
  };

  const getIconColor = () => {
    if (disabled || isLoading) return '#9CA3AF';
    
    switch (variant) {
      case 'secondary': return '#6B7280';
      case 'outline': return '#10B981';
      default: return '#FFFFFF';
    }
  };

  return (
    <TouchableOpacity
      style={[...getButtonStyle(), style]}
      onPress={handleCall}
      disabled={disabled || isLoading}
      activeOpacity={0.7}
    >
      {isLoading ? (
        <ActivityIndicator size="small" color={getIconColor()} />
      ) : (
        <Phone size={getIconSize()} color={getIconColor()} />
      )}
      {size !== 'small' && (
        <Text style={getTextStyle()}>
          {isLoading ? 'Calling...' : 'Call'}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    gap: 6,
  },
  primaryButton: {
    backgroundColor: '#10B981', // Green for call action
  },
  secondaryButton: {
    backgroundColor: '#6B7280',
  },
  outlineButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#10B981',
  },
  disabledButton: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  primaryText: {
    color: '#FFFFFF',
  },
  secondaryText: {
    color: '#FFFFFF',
  },
  outlineText: {
    color: '#10B981',
  },
});

