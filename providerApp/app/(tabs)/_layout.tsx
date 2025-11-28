import { Tabs, useRouter, useSegments, usePathname } from 'expo-router';
import { Home, User, FileText, Calendar, Bell } from 'lucide-react-native';
import { View, Text, StyleSheet, BackHandler } from 'react-native';
import { useNotifications } from '@/context/NotificationContext';
import { useLanguage } from '@/context/LanguageContext';
import { useEffect } from 'react';

export default function TabLayout() {
  const { unreadCount } = useNotifications();
  const { t } = useLanguage();
  const router = useRouter();
  const segments = useSegments();
  const pathname = usePathname();

  // Handle back button press - navigate to home tab when on other tabs
  // Only intercept if we're actually on a tab screen, not on nested screens
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      // Check if we're on a nested screen (not a tab) - allow normal back navigation
      // Nested screens like edit-profile, booking details, etc. should use normal back navigation
      // These screens have their own BackHandler that should handle navigation
      const isNestedScreen = pathname?.includes('/edit-profile') ||
                            pathname?.includes('/booking/') ||
                            pathname?.includes('/service/') ||
                            pathname?.includes('/admin/') ||
                            pathname?.includes('/auth/') ||
                            pathname?.includes('/payment');
      
      if (isNestedScreen) {
        // Allow normal back navigation for nested screens - don't intercept
        return false;
      }
      
      // Only handle back navigation if we're actually on a tab screen
      // Check both pathname and segments to be sure
      const isOnTabScreen = pathname?.startsWith('/(tabs)') || 
                           pathname === '/(tabs)' ||
                           pathname === '/(tabs)/' ||
                           segments[0] === '(tabs)';
      
      if (!isOnTabScreen) {
        // Not on a tab screen, allow normal back navigation
        return false;
      }
      
      // Get current route segments
      const currentRoute = segments.join('/');
      
      // If we're on home tab, prevent back navigation (exit app)
      if (currentRoute === '(tabs)' || currentRoute === '(tabs)/index' || pathname === '/(tabs)' || pathname === '/(tabs)/') {
        return true; // Prevent back navigation, let Android handle app exit
      }
      
      // If we're on any other tab, navigate to home tab
      router.push('/(tabs)');
      return true; // Prevent default back behavior
    });

    return () => backHandler.remove();
  }, [segments, router, pathname]);
  
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#3B82F6',
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: '#E5E7EB',
          paddingTop: 8,
          height: 88,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontFamily: 'Inter-Medium',
          marginBottom: 8,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('toolbar.home'),
          tabBarIcon: ({ size, color }) => (
            <Home size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="services"
        options={{
          title: t('toolbar.myServices'),
          tabBarIcon: ({ size, color }) => (
            <FileText size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          title: t('toolbar.bookings'),
          tabBarIcon: ({ size, color }) => (
            <Calendar size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: t('toolbar.notifications'),
          tabBarIcon: ({ size, color }) => (
            <View style={{ position: 'relative' }}>
              <Bell size={size} color={color} />
              {unreadCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </Text>
                </View>
              )}
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('toolbar.profile'),
          tabBarIcon: ({ size, color }) => (
            <User size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    backgroundColor: '#EF4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
});