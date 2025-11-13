import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  Alert,
  Dimensions,
  StyleProp,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/context/NotificationContext';
import { useRouter } from 'expo-router';
import { useLanguage } from '@/context/LanguageContext';

interface LogoutButtonProps {
  style?: any;
  textStyle?: any;
  title?: string;
  variant?: 'default' | 'destructive' | 'outline';
  showConfirmation?: boolean;
  onLogoutStart?: () => void;
  onLogoutComplete?: () => void;
}

export default function LogoutButton({
  style,
  textStyle,
  title,
  variant = 'destructive',
  showConfirmation = true,
  onLogoutStart,
  onLogoutComplete,
}: LogoutButtonProps) {
  const { logout } = useAuth();
  const { resetNotificationState } = useNotifications();
  const { t } = useLanguage();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      onLogoutStart?.();
      
      
      // Reset notification state first
      resetNotificationState();
      
      // Perform logout (clears AsyncStorage and user state)
      await logout();
      
      // Navigate to auth screen (router.replace already handles stack reset)
      router.replace('/(auth)/login');
      
      onLogoutComplete?.();
    } catch (error) {
      console.error('❌ Logout error:', error);
      
      // Even if there's an error, try to navigate to auth
      try {
        router.replace('/(auth)/login');
      } catch (navError) {
        console.error('❌ Navigation error during logout:', navError);
      }
      
      onLogoutComplete?.();
    }
  };

  const confirmLogout = () => {
    if (!showConfirmation) {
      handleLogout();
      return;
    }

    Alert.alert(
      t('alerts.logout.title') || 'Logout',
      t('alerts.logout.message') || 'Are you sure you want to logout?',
      [
        {
          text: t('alerts.logout.cancel') || 'Cancel',
          style: 'cancel',
        },
        {
          text: t('alerts.logout.confirm') || 'Logout',
          style: 'destructive',
          onPress: handleLogout,
        },
      ]
    );
  };

  const getButtonStyle = (): StyleProp<ViewStyle>[] => {
    switch (variant) {
      case 'destructive':
        return [styles.button, styles.destructiveButton];
      case 'outline':
        return [styles.button, styles.outlineButton];
      default:
        return [styles.button, styles.defaultButton];
    }
  };

  const getTextStyle = (): StyleProp<TextStyle>[] => {
    switch (variant) {
      case 'destructive':
        return [styles.buttonText, styles.destructiveText];
      case 'outline':
        return [styles.buttonText, styles.outlineText];
      default:
        return [styles.buttonText, styles.defaultText];
    }
  };

  return (
    <TouchableOpacity
      style={[...getButtonStyle(), style]}
      onPress={confirmLogout}
      activeOpacity={0.7}
    >
      <Text style={[...getTextStyle(), textStyle]}>
        {title || t('profile.logout') || 'Logout'}
      </Text>
    </TouchableOpacity>
  );
}

const SCREEN_WIDTH = Dimensions.get('window').width;

const getResponsiveSpacing = (small: number, medium: number, large: number) => {
  if (SCREEN_WIDTH < 375) return small;
  if (SCREEN_WIDTH < 768) return medium;
  return large;
};

const getResponsiveFontSize = (small: number, medium: number, large: number) => {
  if (SCREEN_WIDTH < 375) return small;
  if (SCREEN_WIDTH < 768) return medium;
  return large;
};

const styles = StyleSheet.create({
  button: {
    paddingHorizontal: getResponsiveSpacing(16, 20, 24),
    paddingVertical: getResponsiveSpacing(12, 14, 16),
    borderRadius: getResponsiveSpacing(8, 10, 12),
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: getResponsiveSpacing(44, 48, 52),
  },
  buttonText: {
    fontSize: getResponsiveFontSize(14, 16, 18),
    fontWeight: '600',
  },
  defaultButton: {
    backgroundColor: '#6B7280',
  },
  defaultText: {
    color: '#FFFFFF',
  },
  destructiveButton: {
    backgroundColor: '#EF4444',
  },
  destructiveText: {
    color: '#FFFFFF',
  },
  outlineButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  outlineText: {
    color: '#EF4444',
  },
});
