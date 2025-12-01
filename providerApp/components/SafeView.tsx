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

export function SafeView({ children, style, backgroundColor = '#FFFFFF', excludeBottom = false }: SafeViewProps) {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = Dimensions.get('window');
  
  // Responsive design breakpoints
  const isSmallDevice = screenWidth < 375;
  const isMediumDevice = screenWidth >= 375 && screenWidth < 414;
  const isLargeDevice = screenWidth >= 414;
  
  // Calculate responsive tab bar height (matches tab layout)
  const tabBarHeight = 60 + insets.bottom;
  
  // Calculate responsive padding based on device size
  const getResponsivePadding = () => {
    // Minimal padding just to prevent content from being hidden behind tab bar
    return 0;
  };
  
  const edges: Edge[] = excludeBottom
    ? ['top', 'left', 'right']
    : ['top', 'left', 'right', 'bottom'];
  
  return (
    <SafeAreaView style={[styles.container, { backgroundColor }, style]} edges={edges}>
      <StatusBar 
        barStyle="dark-content" 
        backgroundColor={backgroundColor}
        translucent={false}
      />
      <View style={[styles.content, { backgroundColor }, excludeBottom && { paddingBottom: getResponsivePadding() }]}> 
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