import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, Platform, Dimensions } from 'react-native';
import { Phone } from 'lucide-react-native';
import { useWebRTCCall } from '@/hooks/useWebRTCCall';

// Responsive design utilities
const { width: screenWidth } = Dimensions.get('window');
const isSmallScreen = screenWidth < 375;
const isMediumScreen = screenWidth >= 375 && screenWidth < 414;
const isLargeScreen = screenWidth >= 414;

const getResponsiveSpacing = (small: number, medium: number, large: number) => {
  if (isSmallScreen) return small;
  if (isMediumScreen) return medium;
  return large;
};

const getResponsiveFontSize = (small: number, medium: number, large: number) => {
  if (isSmallScreen) return small;
  if (isMediumScreen) return medium;
  return large;
};

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
    await initiateCall(bookingId, 'user');
  };

  const getButtonSize = () => {
    switch (size) {
      case 'small':
        return { 
          paddingVertical: getResponsiveSpacing(6, 8, 10), 
          paddingHorizontal: getResponsiveSpacing(10, 12, 14), 
          minHeight: getResponsiveSpacing(32, 36, 40),
          borderRadius: getResponsiveSpacing(8, 10, 12),
          gap: getResponsiveSpacing(4, 6, 8),
        };
      case 'large':
        return { 
          paddingVertical: getResponsiveSpacing(12, 14, 16), 
          paddingHorizontal: getResponsiveSpacing(18, 20, 22), 
          minHeight: getResponsiveSpacing(44, 48, 52),
          borderRadius: getResponsiveSpacing(10, 12, 14),
          gap: getResponsiveSpacing(6, 8, 10),
        };
      default:
        return { 
          paddingVertical: getResponsiveSpacing(8, 10, 12), 
          paddingHorizontal: getResponsiveSpacing(14, 16, 18), 
          minHeight: getResponsiveSpacing(36, 40, 44),
          borderRadius: getResponsiveSpacing(8, 10, 12),
          gap: getResponsiveSpacing(4, 6, 8),
        };
    }
  };

  const getIconSize = () => {
    switch (size) {
      case 'small': return getResponsiveFontSize(12, 14, 16);
      case 'large': return getResponsiveFontSize(18, 20, 22);
      default: return getResponsiveFontSize(14, 16, 18);
    }
  };

  const getTextSize = () => {
    switch (size) {
      case 'small': return getResponsiveFontSize(11, 13, 15);
      case 'large': return getResponsiveFontSize(14, 16, 18);
      default: return getResponsiveFontSize(12, 14, 16);
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

  const getIconColor = () => {
    if (disabled || isLoading) return '#9CA3AF';
    
    switch (variant) {
      case 'secondary': return '#6B7280';
      case 'outline': return '#2563EB';
      default: return '#2563EB';
    }
  };

  const getTextColor = () => {
    if (disabled || isLoading) return '#9CA3AF';
    
    switch (variant) {
      case 'secondary': return '#6B7280';
      case 'outline': return '#2563EB';
      default: return '#2563EB';
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
        <>
          <Phone size={getIconSize()} color={getIconColor()} />
          <Text style={[styles.buttonText, { fontSize: getTextSize(), color: getTextColor() }]}>
            {isLoading ? 'Calling...' : 'Call'}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    backgroundColor: '#EEF2FF', // Light blue background like provider app
  },
  secondaryButton: {
    backgroundColor: '#F3F4F6',
  },
  outlineButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#2563EB',
  },
  disabledButton: {
    opacity: 0.5,
  },
  buttonText: {
    fontWeight: '600',
    marginLeft: 0,
  },
});

