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

export function SafeView({ children, style, backgroundColor = '#FFFFFF', excludeBottom = true }: SafeViewProps) {
  const insets = useSafeAreaInsets();
  
  // Always exclude bottom edge to prevent blank space - tab bar handles bottom safe area
  // Only include top, left, right edges for status bar and notch handling
  const edges: Edge[] = ['top', 'left', 'right'];
  
  return (
    <SafeAreaView style={[styles.container, { backgroundColor }, style]} edges={edges}>
      <StatusBar 
        barStyle="dark-content" 
        backgroundColor={backgroundColor}
        translucent={false}
      />
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
  },
});