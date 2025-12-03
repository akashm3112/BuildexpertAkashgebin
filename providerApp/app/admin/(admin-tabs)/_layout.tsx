import { Tabs, useRouter, useSegments, usePathname } from 'expo-router';
import { Home, FileText, Users, Settings, Activity } from 'lucide-react-native';
import { View, Text, StyleSheet, BackHandler } from 'react-native';
import { useEffect } from 'react';

export default function AdminTabLayout() {
  const router = useRouter();
  const segments = useSegments();
  const pathname = usePathname();

  // Handle back button press - navigate to home tab when on other tabs
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      // Check if we're on a nested screen (not a tab) - allow normal back navigation
      // Nested screens would have more than 4 path segments: /admin/(admin-tabs)/tab/nested
      const pathSegments = pathname?.split('/').filter(Boolean) || [];
      const isNestedScreen = pathSegments.length > 4 && 
                            pathname?.includes('/admin/(admin-tabs)/');
      
      if (isNestedScreen) {
        // Allow normal back navigation for nested screens
        return false;
      }
      
      // Only handle back navigation if we're actually on an admin tab screen
      // Check both pathname and segments to be sure
      const isOnAdminTabScreen = pathname?.startsWith('/admin/(admin-tabs)') || 
                                 pathname === '/admin/(admin-tabs)' ||
                                 pathname === '/admin/(admin-tabs)/' ||
                                 (segments[0] === 'admin' && segments[1] === '(admin-tabs)');
      
      if (!isOnAdminTabScreen) {
        // Not on an admin tab screen, allow normal back navigation
        return false;
      }
      
      // Get current route segments - use segments for more reliable detection
      const currentRoute = segments.join('/');
      
      // If we're on home tab, prevent back navigation (exit app)
      if (currentRoute === 'admin/(admin-tabs)' || 
          currentRoute === 'admin/(admin-tabs)/index' || 
          pathname === '/admin/(admin-tabs)' || 
          pathname === '/admin/(admin-tabs)/' ||
          pathname === '/admin/(admin-tabs)/index') {
        return true; // Prevent back navigation, let Android handle app exit
      }
      
      // If we're on any other tab (reports, user-reports, provider-reports, monitoring),
      // navigate to home tab
      // Navigate to the root of admin tabs which defaults to index
      router.replace('/admin/(admin-tabs)');
      return true; // Prevent default back behavior
    });

    return () => backHandler.remove();
  }, [segments, router, pathname]);
  
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#667EEA',
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
          title: 'Overview',
          tabBarIcon: ({ size, color }) => (
            <Home size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: 'Reports',
          tabBarIcon: ({ size, color }) => (
            <FileText size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="user-reports"
        options={{
          title: 'Users',
          tabBarIcon: ({ size, color }) => (
            <Users size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="provider-reports"
        options={{
          title: 'Providers',
          tabBarIcon: ({ size, color }) => (
            <Settings size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="monitoring"
        options={{
          title: 'Monitoring',
          tabBarIcon: ({ size, color }) => (
            <Activity size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

