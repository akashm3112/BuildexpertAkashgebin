import { useEffect, useState } from 'react';
import { View, StyleSheet, Image } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withTiming, 
  withSequence,
  withDelay,
  Easing,
  withSpring,
  interpolate,
  Extrapolate,
} from 'react-native-reanimated';

export default function Index() {
  const { user, isLoading } = useAuth();
  const [minDelayDone, setMinDelayDone] = useState(false);
  
  // Animation values
  const opacity = useSharedValue(0);  // Background opacity
  const scale = useSharedValue(0.3);  // Scale for initial screen
  const logoOpacity = useSharedValue(0);  // Logo opacity
  const logoScale = useSharedValue(0.5);  // Logo scale
  const backgroundColor = useSharedValue('#F8FAFC');  // Initial background color
  const logoRotation = useSharedValue(0); // Logo rotation for added effect
  const logoMovementX = useSharedValue(0); // Horizontal movement
  const logoMovementY = useSharedValue(0); // Vertical movement
  const particlesOpacity = useSharedValue(0); // Particle fade-in
  
  useEffect(() => {
    // Animating the background opacity and scale
    opacity.value = withTiming(1, { duration: 2000, easing: Easing.out(Easing.quad) });
    scale.value = withTiming(1, { duration: 2500, easing: Easing.out(Easing.back(1.7)) });

    // Logo animations: Fade, Scale, Rotation, and Movement
    logoOpacity.value = withDelay(500, withTiming(1, { duration: 1500, easing: Easing.out(Easing.quad) }));
    logoScale.value = withDelay(500, withSequence(
      withTiming(1.5, { duration: 700, easing: Easing.out(Easing.quad) }),  // Overshoot scale
      withTiming(1, { duration: 500, easing: Easing.in(Easing.quad) })  // Settling back to normal
    ));

    // Logo rotation and movement to create dynamic feel
    logoRotation.value = withDelay(1000, withTiming(720, { duration: 2500, easing: Easing.linear }));
    logoMovementX.value = withDelay(500, withSequence(
      withTiming(-30, { duration: 1500, easing: Easing.inOut(Easing.quad) }),
      withTiming(0, { duration: 1500, easing: Easing.inOut(Easing.quad) })
    ));
    logoMovementY.value = withDelay(500, withSequence(
      withTiming(-50, { duration: 1500, easing: Easing.inOut(Easing.quad) }),
      withTiming(0, { duration: 1500, easing: Easing.inOut(Easing.quad) })
    ));

    // Particle effect - Fade in of subtle elements
    particlesOpacity.value = withTiming(1, { duration: 2000, easing: Easing.out(Easing.quad) });

    // Gradient background animation
    backgroundColor.value = withTiming('#6A11CB', { duration: 2500, easing: Easing.inOut(Easing.quad) });

    // Set delay before redirecting
    const t = setTimeout(() => setMinDelayDone(true), 4000);
    return () => clearTimeout(t);
  }, []);

  // Animated styles for container (background with gradient)
  const containerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
    backgroundColor: backgroundColor.value,  // Gradient transition
  }));

  // Animated styles for the logo with rotation and movement
  const logoAnimatedStyle = useAnimatedStyle(() => {
    const rotate = interpolate(logoRotation.value, [0, 720], [0, 720], Extrapolate.CLAMP);

    return {
      opacity: logoOpacity.value,
      transform: [
        { scale: logoScale.value },
        { rotate: `${rotate}deg` },
        { translateX: logoMovementX.value },
        { translateY: logoMovementY.value },
      ],
    };
  });

  // Particle effect animation - Small floating particles in the background
  const particlesAnimatedStyle = useAnimatedStyle(() => ({
    opacity: particlesOpacity.value,
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 10,
    height: 10,
    backgroundColor: '#fff',
    borderRadius: 5,
    transform: [
      { translateX: interpolate(particlesOpacity.value, [0, 1], [0, 150], Extrapolate.CLAMP) },
      { translateY: interpolate(particlesOpacity.value, [0, 1], [0, 150], Extrapolate.CLAMP) },
    ],
  }));

  // After auth loads and minimum delay, redirect to the proper screen
  if (!isLoading && minDelayDone) {
    if (user) {
      return <Redirect href="/(tabs)" />;
    }
    return <Redirect href="/(auth)/login" />;
  }

  // Splash screen with enhanced logo animation and particles
  return (
    <Animated.View style={[styles.container, containerAnimatedStyle]}>
      <Animated.View style={logoAnimatedStyle}>
        <Image
          source={require('../assets/images/icon.png')}
          style={styles.logo}
          resizeMode="contain"
        />
      </Animated.View>

      {/* Particle effect */}
      <Animated.View style={[styles.particles, particlesAnimatedStyle]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  logo: {
    width: 280,
    height: 280,
  },
  particles: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 10,
    height: 10,
    backgroundColor: '#fff',
    borderRadius: 5,
  },
});
