import { ActivityIndicator, View, StyleSheet } from 'react-native';

type LoadingSpinnerProps = {
  size?: 'small' | 'large';
  color?: string;
};

export const LoadingSpinner = ({ size = 'large', color = '#2563EB' }: LoadingSpinnerProps) => {
  return (
    <View style={styles.container} accessibilityLabel="loading-indicator">
      <ActivityIndicator size={size} color={color} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
