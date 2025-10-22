import { Tabs, useRouter, useSegments } from 'expo-router';
import { Chrome as Home, Calendar, Bell, User } from 'lucide-react-native';
import React, { useEffect } from 'react';
import { View, Text, BackHandler } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNotifications } from '@/context/NotificationContext';
import { useLanguage } from '@/context/LanguageContext';

function NotificationTabIcon({ color, size }: { color: string; size: number }) {
  const { unreadCount } = useNotifications();

  return (
    <>
      <Bell size={size} color={color} />
      {unreadCount > 0 && (
        <View
          style={{
            position: 'absolute',
            top: -2,
            right: -6,
            backgroundColor: '#EF4444',
            borderRadius: 8,
            minWidth: 16,
            height: 16,
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: 3,
            zIndex: 10,
          }}
        >
          <Text style={{ color: '#FFF', fontSize: 10, fontWeight: 'bold' }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </Text>
        </View>
      )}
    </>
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const router = useRouter();
  const segments = useSegments();

  // Handle back button press - navigate to home tab when on other tabs
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      // Get current route segments
      const currentRoute = segments.join('/');
      
      // If we're on home tab, prevent back navigation (exit app)
      if (currentRoute === '(tabs)' || currentRoute === '(tabs)/index') {
        return true; // Prevent back navigation, let Android handle app exit
      }
      
      // If we're on any other tab, navigate to home tab
      router.push('/(tabs)');
      return true; // Prevent default back behavior
    });

    return () => backHandler.remove();
  }, [segments, router]);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#3B82F6',
        tabBarInactiveTintColor: '#94A3B8',
        tabBarStyle: {
          borderTopWidth: 1,
          borderTopColor: '#E2E8F0',
          elevation: 0,
          height: 60 + insets.bottom,
          paddingBottom: insets.bottom,
          paddingTop: 8,
          backgroundColor: '#FFFFFF',
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
        },
        headerShown: false,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: t('toolbar.home'),
          tabBarIcon: ({ color, size }) => <Home size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          title: t('toolbar.bookings'),
          tabBarIcon: ({ color, size }) => <Calendar size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: t('toolbar.notifications'),
          tabBarIcon: ({ color, size }) => <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}><NotificationTabIcon color={color} size={size} /></View>,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('toolbar.profile'),
          tabBarIcon: ({ color, size }) => <User size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}