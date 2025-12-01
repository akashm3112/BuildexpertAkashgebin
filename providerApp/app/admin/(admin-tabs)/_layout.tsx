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
      const isNestedScreen = pathname?.includes('/admin/(admin-tabs)/') && 
                            (pathname?.split('/').length > 4);
      
      if (isNestedScreen) {
        // Allow normal back navigation for nested screens
        return false;
      }
      
      // Only handle back navigation if we're actually on a tab screen
      const isOnTabScreen = pathname?.startsWith('/admin/(admin-tabs)') || 
                           segments[0] === 'admin' && segments[1] === '(admin-tabs)';
      
      if (!isOnTabScreen) {
        // Not on a tab screen, allow normal back navigation
        return false;
      }
      
      // Get current route segments
      const currentRoute = segments.join('/');
      
      // If we're on home tab, prevent back navigation (exit app)
      if (currentRoute === 'admin/(admin-tabs)' || 
          currentRoute === 'admin/(admin-tabs)/index' || 
          pathname === '/admin/(admin-tabs)' || 
          pathname === '/admin/(admin-tabs)/') {
        return true; // Prevent back navigation, let Android handle app exit
      }
      
      // If we're on any other tab, navigate to home tab
      router.push('/admin/(admin-tabs)/index');
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

