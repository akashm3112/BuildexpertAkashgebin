import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, Linking, BackHandler, Image, ActivityIndicator, Dimensions } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, UserPlus, Eye, EyeOff, ArrowRight, User, Mail, Phone, Lock, Camera, X } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { SafeView } from '@/components/SafeView';
import { Modal } from '@/components/common/Modal';
import { useAuth } from '@/context/AuthContext';
import { API_BASE_URL } from '@/constants/api';

// Responsive design utilities
const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const isSmallScreen = screenWidth < 375;
const isMediumScreen = screenWidth >= 375 && screenWidth < 414;
const isLargeScreen = screenWidth >= 414;

const getResponsiveSpacing = (small: number, medium: number, large: number) => {
  if (isSmallScreen) return small;
  if (isMediumScreen) return medium;
  return large;
};

const getResponsiveFontSize = (small: number, medium: number, large: number) => {
  if (isSmallScreen) return small;
  if (isMediumScreen) return medium;
  return large;
};

const DEFAULT_PROFILE_PIC = 'https://res.cloudinary.com/dqoizs0fu/raw/upload/v1756189484/profile-pictures/m3szbez4bzvwh76j1fle';

export default function SignUpScreen() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [profileImage, setProfileImage] = useState<string>('');
  const [imageLoading, setImageLoading] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const [modalConfig, setModalConfig] = useState<{
    title: string;
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
    buttons?: { text: string; onPress: () => void; style?: 'primary' | 'secondary' | 'destructive' }[];
  }>({
    title: '',
    message: '',
    type: 'info',
  });
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user } = useAuth();

  React.useEffect(() => {
    if (params.phone) {
      setPhone(params.phone as string);
    }
  }, [params.phone]);

  useEffect(() => {
    // If already logged in, redirect to main app
    if (user) {
      router.replace('/(tabs)');
    }
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      // Prevent going back to splash or previous screens if logged in
      if (user) return true;
      return false;
    });
    return () => backHandler.remove();
  }, [user]);

  const showModal = (title: string, message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info', buttons?: { text: string; onPress: () => void; style?: 'primary' | 'secondary' | 'destructive' }[]) => {
    setModalConfig({ title, message, type, buttons });
    setModalVisible(true);
  };

  const handleImagePicker = async () => {
    showModal(
      'Profile Picture',
      'Choose an option',
      'info',
      [
        {
          text: 'Take Photo',
          onPress: async () => {
            setModalVisible(false);
            const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
            if (permissionResult.granted === false) {
              showModal('Permission Required', 'Camera permission is required to take a photo.', 'error');
              return;
            }

            setImageLoading(true);
            try {
              const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.8,
              });

              if (!result.canceled && result.assets[0]) {
                console.log('📸 Camera photo selected:', result.assets[0].uri);
                // Convert file URI to base64 for backend processing
                try {
                  const base64 = await convertUriToBase64(result.assets[0].uri);
                  setProfileImage(base64);
                } catch (error) {
                  console.error('Error converting image to base64:', error);
                  // Fallback to URI if conversion fails
                  setProfileImage(result.assets[0].uri);
                }
              } else {
                console.log('📸 Camera photo selection canceled');
              }
            } catch (error) {
              console.error('Error taking photo:', error);
              showModal('Error', 'Failed to take photo. Please try again.', 'error');
            } finally {
              setImageLoading(false);
            }
          },
          style: 'primary',
        },
        {
          text: 'Choose from Gallery',
          onPress: async () => {
            setModalVisible(false);
            const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (permissionResult.granted === false) {
              showModal('Permission Required', 'Gallery permission is required to select a photo.', 'error');
              return;
            }

            setImageLoading(true);
            try {
              const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.8,
              });

              if (!result.canceled && result.assets[0]) {
                console.log('🖼️ Gallery photo selected:', result.assets[0].uri);
                // Convert file URI to base64 for backend processing
                try {
                  const base64 = await convertUriToBase64(result.assets[0].uri);
                  setProfileImage(base64);
                } catch (error) {
                  console.error('Error converting image to base64:', error);
                  // Fallback to URI if conversion fails
                  setProfileImage(result.assets[0].uri);
                }
              } else {
                console.log('🖼️ Gallery photo selection canceled');
              }
            } catch (error) {
              console.error('Error choosing from gallery:', error);
              showModal('Error', 'Failed to select photo. Please try again.', 'error');
            } finally {
              setImageLoading(false);
            }
          },
          style: 'primary',
        },
        { 
          text: 'Cancel', 
          onPress: () => {
            setModalVisible(false);
          }, 
          style: 'secondary' 
        },
      ]
    );
  };

  const removeProfileImage = () => {
    setProfileImage('');
  };

  // Helper function to convert file URI to base64
  const convertUriToBase64 = async (uri: string): Promise<string> => {
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error('Error converting URI to base64:', error);
      throw error;
    }
  };

  const handleCreateAccount = async () => {
    if (!fullName.trim()) {
      showModal('Missing Name', 'Please enter your full name.', 'error');
      return;
    }
    if (!email.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      showModal('Invalid Email', 'Please enter a valid email address.', 'error');
      return;
    }
    if (phone.length !== 10) {
              showModal('Invalid Number', 'Please enter a valid 10-digit mobile number (US or Indian format)', 'error');
      return;
    }
    if (!password || password.length < 6) {
      showModal('Invalid Password', 'Password must be at least 6 characters long', 'error');
      return;
    }
    if (password !== confirmPassword) {
      showModal('Password Mismatch', 'Passwords do not match. Please try again.', 'error');
      return;
    }
    setIsLoading(true);
    try {
      console.log('📤 Starting signup process...');
      console.log('🖼️ Profile image being sent:', profileImage ? profileImage.substring(0, 50) + '...' : 'No image');
      console.log('🌐 API Base URL:', API_BASE_URL);
      
      const response = await fetch(`${API_BASE_URL}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName,
          email,
          phone,
          password,
          role: 'provider',
          profilePicUrl: profileImage
        })
      });
      const data = await response.json();
      setIsLoading(false);
      if (!response.ok) {
        showModal('Signup Failed', data.message || 'An error occurred.', 'error');
        return;
      }
      // On success, navigate to OTP screen
      router.push({
        pathname: '/auth/otp',
        params: { phone, isNewUser: 'true' }
      });
    } catch (error) {
      setIsLoading(false);
      showModal('Network Error', 'Could not connect to server.', 'error');
    }
  };

  return (
    <SafeView style={styles.container} backgroundColor="#F8FAFC">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={dynamicStyles.scrollContent}>
          <View style={dynamicStyles.header}>
            <Text style={dynamicStyles.title}>Create Account</Text>
            <Text style={dynamicStyles.subtitle}>Join our construction marketplace</Text>
          </View>

          {/* Modern Profile Picture Section */}
          <View style={dynamicStyles.profileSection}>
            <View style={dynamicStyles.profileCard}>
              <View style={dynamicStyles.profileHeader}>
                <Text style={dynamicStyles.profileTitle}>Profile Picture</Text>
                <Text style={dynamicStyles.profileSubtitle}>Add a photo to personalize your account</Text>
              </View>
              
              <View style={dynamicStyles.profileContent}>
                <TouchableOpacity
                  style={dynamicStyles.profileImageWrapper}
                  onPress={handleImagePicker}
                  onPressIn={() => setShowOverlay(true)}
                  onPressOut={() => setShowOverlay(false)}
                  activeOpacity={0.9}
                  disabled={imageLoading}
                >
                  <View style={dynamicStyles.profileImageContainer}>
                    <Image
                      source={{ uri: profileImage || DEFAULT_PROFILE_PIC }}
                      style={dynamicStyles.profileImage}
                    />
                    <View style={[
                      dynamicStyles.profileOverlay,
                      { opacity: showOverlay ? 1 : 0 }
                    ]}>
                      {imageLoading ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <View style={dynamicStyles.overlayContent}>
                          <Camera size={24} color="#FFFFFF" />
                          <Text style={dynamicStyles.overlayText}>
                            {profileImage ? 'Tap to change' : 'Tap to add'}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
                
                <View style={dynamicStyles.profileActions}>
                  <TouchableOpacity
                    style={[dynamicStyles.primaryButton, imageLoading && styles.buttonDisabled]}
                    onPress={handleImagePicker}
                    disabled={imageLoading}
                  >
                    {imageLoading ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <Camera size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                        <Text style={dynamicStyles.primaryButtonText}>
                          {profileImage ? 'Change Photo' : 'Add Photo'}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                  
                  {profileImage && (
                    <TouchableOpacity
                      style={dynamicStyles.secondaryButton}
                      onPress={removeProfileImage}
                    >
                      <X size={18} color="#EF4444" style={{ marginRight: 8 }} />
                      <Text style={dynamicStyles.secondaryButtonText}>Remove Photo</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          </View>

          <View style={styles.form}>
            {/* Full Name */}
            <View style={styles.inputContainer}>
              <View style={styles.inputWrapper}>
                <User size={20} color="#64748B" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="Full Name"
                  placeholderTextColor="#9CA3AF"
                  autoCapitalize="words"
                  returnKeyType="next"
                />
              </View>
            </View>

            {/* Email */}
            <View style={styles.inputContainer}>
              <View style={styles.inputWrapper}>
                <Mail size={20} color="#64748B" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Email address"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  returnKeyType="next"
                />
              </View>
            </View>

            {/* Phone */}
            <View style={styles.inputContainer}>
              <View style={styles.inputWrapper}>
                <Phone size={20} color="#64748B" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="Mobile Number"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="numeric"
                  maxLength={10}
                  returnKeyType="next"
                />
              </View>
            </View>

            {/* Password */}
            <View style={styles.inputContainer}>
              <View style={styles.inputWrapper}>
                <Lock size={20} color="#64748B" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Password"
                  placeholderTextColor="#9CA3AF"
                  secureTextEntry={!showPassword}
                  returnKeyType="next"
                />
                <TouchableOpacity 
                  style={styles.eyeIcon}
                  onPress={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff size={20} color="#64748B" />
                  ) : (
                    <Eye size={20} color="#64748B" />
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {/* Confirm Password */}
            <View style={styles.inputContainer}>
              <View style={styles.inputWrapper}>
                <Lock size={20} color="#64748B" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Confirm Password"
                  placeholderTextColor="#9CA3AF"
                  secureTextEntry={!showConfirmPassword}
                  returnKeyType="done"
                  onSubmitEditing={handleCreateAccount}
                />
                <TouchableOpacity 
                  style={styles.eyeIcon}
                  onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? (
                    <EyeOff size={20} color="#64748B" />
                  ) : (
                    <Eye size={20} color="#64748B" />
                  )}
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              style={[dynamicStyles.signupButton, isLoading && styles.signupButtonDisabled]}
              onPress={handleCreateAccount}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={dynamicStyles.signupButtonText}>Create Account</Text>
              )}
            </TouchableOpacity>

            <View style={styles.termsContainer}>
              <Text style={dynamicStyles.termsText}>
                By creating an account, you agree to our{' '}
                <Text style={styles.termsLink} onPress={() => Linking.openURL('https://example.com/terms')}>Terms of Service</Text>
                {' '}and{' '}
                <Text style={styles.termsLink} onPress={() => Linking.openURL('https://example.com/privacy')}>Privacy Policy</Text>
              </Text>
            </View>

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={dynamicStyles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            <View style={styles.loginContainer}>
              <Text style={dynamicStyles.loginText}>Already have an account? </Text>
              <TouchableOpacity 
                onPress={() => router.back()}
                activeOpacity={0.7}
              >
                <Text style={dynamicStyles.loginLink}>Sign In</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title={modalConfig.title}
        message={modalConfig.message}
        type={modalConfig.type}
        buttons={modalConfig.buttons}
      />
    </SafeView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#64748B',
  },
  form: {
    width: '100%',
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 56,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#1E293B',
  },
  eyeIcon: {
    padding: 4,
  },
  signupButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    marginTop: 8,
  },
  signupButtonDisabled: {
    opacity: 0.7,
  },
  signupButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  termsContainer: {
    marginBottom: 24,
  },
  termsText: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
  },
  termsLink: {
    color: '#3B82F6',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E2E8F0',
  },
  dividerText: {
    marginHorizontal: 16,
    fontSize: 14,
    color: '#94A3B8',
  },
  loginContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loginText: {
    fontSize: 14,
    color: '#64748B',
  },
  loginLink: {
    fontSize: 14,
    color: '#3B82F6',
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});

// Dynamic styles using responsive utilities
const dynamicStyles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center' as const,
    paddingHorizontal: getResponsiveSpacing(20, 24, 28),
    paddingVertical: getResponsiveSpacing(32, 40, 48),
  },
  header: {
    alignItems: 'center' as const,
    marginBottom: getResponsiveSpacing(32, 40, 48),
  },
  title: {
    fontSize: getResponsiveFontSize(28, 32, 36),
    fontWeight: '700' as const,
    color: '#1E293B',
    marginBottom: getResponsiveSpacing(6, 8, 10),
  },
  subtitle: {
    fontSize: getResponsiveFontSize(14, 16, 18),
    color: '#64748B',
    textAlign: 'center' as const,
    lineHeight: getResponsiveSpacing(20, 24, 28),
  },
  profileSection: {
    marginBottom: getResponsiveSpacing(24, 32, 40),
  },
  profileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: getResponsiveSpacing(16, 20, 24),
    padding: getResponsiveSpacing(20, 24, 28),
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  profileHeader: {
    alignItems: 'center' as const,
    marginBottom: getResponsiveSpacing(20, 24, 28),
  },
  profileTitle: {
    fontSize: getResponsiveFontSize(18, 20, 22),
    fontWeight: '700' as const,
    color: '#1E293B',
    marginBottom: getResponsiveSpacing(4, 6, 8),
  },
  profileSubtitle: {
    fontSize: getResponsiveFontSize(12, 14, 16),
    color: '#64748B',
    textAlign: 'center' as const,
    lineHeight: getResponsiveSpacing(16, 20, 24),
  },
  profileContent: {
    alignItems: 'center' as const,
  },
  profileImageWrapper: {
    marginBottom: getResponsiveSpacing(20, 24, 28),
  },
  profileImageContainer: {
    position: 'relative' as const,
    borderRadius: getResponsiveSpacing(50, 60, 70),
    overflow: 'hidden' as const,
    borderWidth: 3,
    borderColor: '#E2E8F0',
  },
  profileImage: {
    width: getResponsiveSpacing(100, 120, 140),
    height: getResponsiveSpacing(100, 120, 140),
    borderRadius: getResponsiveSpacing(50, 60, 70),
    backgroundColor: '#F1F5F9',
  },
  profileOverlay: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    opacity: 0,
  },
  overlayContent: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  overlayText: {
    color: '#FFFFFF',
    fontSize: getResponsiveFontSize(10, 12, 14),
    fontWeight: '600' as const,
    marginTop: getResponsiveSpacing(4, 6, 8),
    textAlign: 'center' as const,
  },
  profileActions: {
    alignItems: 'center' as const,
    gap: getResponsiveSpacing(12, 16, 20),
    width: '100%',
  },
  primaryButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: getResponsiveSpacing(20, 24, 28),
    paddingVertical: getResponsiveSpacing(12, 14, 16),
    borderRadius: getResponsiveSpacing(10, 12, 14),
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    flexDirection: 'row' as const,
    minWidth: getResponsiveSpacing(140, 160, 180),
    ...Platform.select({
      ios: {
        shadowColor: '#3B82F6',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: getResponsiveFontSize(14, 16, 18),
    fontWeight: '600' as const,
  },
  secondaryButton: {
    backgroundColor: '#FEF2F2',
    paddingHorizontal: getResponsiveSpacing(16, 20, 24),
    paddingVertical: getResponsiveSpacing(10, 12, 14),
    borderRadius: getResponsiveSpacing(10, 12, 14),
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    flexDirection: 'row' as const,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  secondaryButtonText: {
    color: '#EF4444',
    fontSize: getResponsiveFontSize(12, 14, 16),
    fontWeight: '600' as const,
  },
  signupButton: {
    backgroundColor: '#3B82F6',
    borderRadius: getResponsiveSpacing(12, 14, 16),
    height: getResponsiveSpacing(52, 56, 60),
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: 16,
    marginTop: 8,
    ...Platform.select({
      ios: {
        shadowColor: '#3B82F6',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  signupButtonText: {
    fontSize: getResponsiveFontSize(14, 16, 18),
    fontWeight: '600' as const,
    color: '#FFFFFF',
  },
  termsText: {
    fontSize: getResponsiveFontSize(10, 12, 14),
    color: '#64748B',
    textAlign: 'center' as const,
    lineHeight: getResponsiveSpacing(14, 18, 22),
  },
  dividerText: {
    marginHorizontal: getResponsiveSpacing(12, 16, 20),
    fontSize: getResponsiveFontSize(12, 14, 16),
    color: '#94A3B8',
  },
  loginText: {
    fontSize: getResponsiveFontSize(12, 14, 16),
    color: '#64748B',
  },
  loginLink: {
    fontSize: getResponsiveFontSize(12, 14, 16),
    color: '#3B82F6',
    fontWeight: '600' as const,
  },
});