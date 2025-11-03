import React from 'react';
import { TouchableOpacity, Text, StyleSheet, Alert } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/context/NotificationContext';
import { useRouter } from 'expo-router';
import { useLanguage } from '@/context/LanguageContext';
import { getResponsiveSpacing, getResponsiveFontSize } from '@/utils/responsive';

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
      
      console.log('🚪 Starting complete logout process...');
      
      // Reset notification state first
      resetNotificationState();
      
      // Perform logout (clears AsyncStorage and user state)
      await logout();
      
      // Navigate to auth screen with navigation stack reset (production pattern)
      try {
        if (router.dismissAll) {
          router.dismissAll();
        }
      } catch (e) {
        // dismissAll might not be available in all versions
      }
      router.replace('/(auth)/login');
      
      console.log('✅ Complete logout successful');
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

  const getButtonStyle = () => {
    const baseStyle = [styles.button];
    
    switch (variant) {
      case 'destructive':
        baseStyle.push(styles.destructiveButton);
        break;
      case 'outline':
        baseStyle.push(styles.outlineButton);
        break;
      default:
        baseStyle.push(styles.defaultButton);
    }
    
    return baseStyle;
  };

  const getTextStyle = () => {
    const baseStyle = [styles.buttonText];
    
    switch (variant) {
      case 'destructive':
        baseStyle.push(styles.destructiveText);
        break;
      case 'outline':
        baseStyle.push(styles.outlineText);
        break;
      default:
        baseStyle.push(styles.defaultText);
    }
    
    return baseStyle;
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
