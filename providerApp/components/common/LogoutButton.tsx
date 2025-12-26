import React from 'react';
import { TouchableOpacity, Text, StyleSheet, Alert } from 'react-native';
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
      
      // Add a small delay to ensure logout completes before navigation
      setTimeout(() => {
        try {
          // Navigate to root index which will handle auth redirect and prevent back navigation
          router.replace('/');
          onLogoutComplete?.();
        } catch (navError) {
          // Fallback: try to navigate to root
          try {
            router.push('/');
          } catch (fallbackError) {
            // Navigation failed, continue silently
          }
          onLogoutComplete?.();
        }
      }, 100);
      
    } catch (error) {
      // Even if there's an error, try to navigate to root
      setTimeout(() => {
        try {
          // Navigate to root index which will handle auth redirect and prevent back navigation
          router.replace('/');
        } catch (navError) {
          try {
            router.push('/');
          } catch (fallbackError) {
            // Navigation failed, continue silently
          }
        }
        onLogoutComplete?.();
      }, 100);
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
    const baseStyle: any[] = [styles.button];
    
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
    const baseStyle: any[] = [styles.buttonText];
    
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
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  buttonText: {
    fontSize: 16,
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
