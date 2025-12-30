import React from 'react';
import { View, StyleSheet, Platform, StatusBar, Dimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Edge } from 'react-native-safe-area-context';

interface SafeViewProps {
  children: React.ReactNode;
  style?: any;
  backgroundColor?: string;
  excludeBottom?: boolean;
}

// Export hook for components that need safe area insets
export { useSafeAreaInsets };

export function SafeView({ children, style, backgroundColor = '#FFFFFF', excludeBottom = false }: SafeViewProps) {
  const insets = useSafeAreaInsets();
  
  // PRODUCTION FIX: Always include top edge to handle status bar/notch on all devices
  // This ensures proper spacing on MI phones and other devices with custom toolbars
  // When excludeBottom is true, tab bar handles its own safe area, so no extra padding needed
  const edges: Edge[] = excludeBottom
    ? ['top', 'left', 'right']
    : ['top', 'left', 'right', 'bottom'];
  
  return (
    <SafeAreaView style={[styles.container, { backgroundColor }, style]} edges={edges}>
      {/* PRODUCTION FIX: Remove StatusBar from SafeView to avoid conflicts with expo-status-bar in _layout.tsx */}
      {/* StatusBar is handled globally in app/_layout.tsx */}
      {/* PRODUCTION FIX: SafeAreaView with edges=['top'] automatically handles top padding for status bar/notch */}
      {/* When excludeBottom=true, tab bar handles its own spacing, so no paddingBottom needed */}
      <View style={[styles.content, { backgroundColor }]}> 
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    marginBottom: 0,
    paddingBottom: 0,
  },
});