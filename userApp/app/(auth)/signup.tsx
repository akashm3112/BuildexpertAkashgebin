import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
  BackHandler,
  Image,
  Dimensions,
  useWindowDimensions,
  Modal,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { Eye, EyeOff, Mail, Lock, User, Phone, AlertCircle, Camera, X } from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import { useAuth } from '@/context/AuthContext';
import { API_BASE_URL } from '@/constants/api';
import { SafeView } from '@/components/SafeView';
import { Modal as CustomModal } from '@/components/common/Modal';
import * as ImagePicker from 'expo-image-picker';

export default function SignupScreen() {
  const { login, user } = useAuth();
  const router = useRouter();
  const { width, height } = useWindowDimensions();

  // Responsive design constants
  const isSmallDevice = width < 375;
  const isMediumDevice = width >= 375 && width < 414;
  const isLargeDevice = width >= 414;

  // Responsive spacing
  const getResponsiveSpacing = (small: number, medium: number, large: number) => {
    if (isSmallDevice) return small;
    if (isMediumDevice) return medium;
    return large;
  };

  // Responsive font sizes
  const getResponsiveFontSize = (small: number, medium: number, large: number) => {
    if (isSmallDevice) return small;
    if (isMediumDevice) return medium;
    return large;
  };

  // Default profile picture - using a consistent default avatar
  const DEFAULT_PROFILE_PIC = 'https://res.cloudinary.com/dqoizs0fu/raw/upload/v1756189484/profile-pictures/m3szbez4bzvwh76j1fle';

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
  });
  const [profilePicture, setProfilePicture] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const [errors, setErrors] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validatePhone = (phone: string) => {
    const phoneRegex = /^[6-9]\d{9}$/;
    return phoneRegex.test(phone);
  };

  const validateField = (field: string, value: string) => {
    let error = '';
    switch (field) {
      case 'name':
        if (value.length < 2) error = 'Name must be at least 2 characters';
        break;
      case 'email':
        if (!validateEmail(value)) error = 'Please enter a valid email address';
        break;
      case 'phone':
        if (!validatePhone(value)) error = 'Please enter a valid 10-digit mobile number';
        break;
      case 'password':
        if (value.length < 6) error = 'Password must be at least 6 characters';
        break;
      case 'confirmPassword':
        if (value !== formData.password) error = 'Passwords do not match';
        break;
    }
    setErrors(prev => ({ ...prev, [field]: error }));
    return !error;
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    validateField(field, value);
  };

  const requestImagePickerPermission = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission Required',
        'Please allow access to your photo library to select a profile picture.',
        [{ text: 'OK' }]
      );
      return false;
    }
    return true;
  };

  const requestCameraPermission = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission Required',
        'Please allow camera access to take a profile picture.',
        [{ text: 'OK' }]
      );
      return false;
    }
    return true;
  };

  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertConfig, setAlertConfig] = useState<{
    title: string;
    message: string;
    type: 'success' | 'error' | 'info' | 'warning';
    buttons?: { text: string; onPress: () => void; style?: 'primary' | 'secondary' | 'destructive' }[];
  }>({
    title: '',
    message: '',
    type: 'info',
  });

  const showAlert = (title: string, message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info', buttons?: { text: string; onPress: () => void; style?: 'primary' | 'secondary' | 'destructive' }[]) => {
    setAlertConfig({ title, message, type, buttons });
    setShowAlertModal(true);
  };

  const handleImagePicker = async () => {
    showAlert(
      'Profile Picture',
      'Choose an option',
      'info',
      [
        {
          text: 'Take Photo',
          onPress: async () => {
            setShowAlertModal(false);
            const hasPermission = await requestCameraPermission();
            if (!hasPermission) return;

            setImageLoading(true);
            try {
                      const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
        });

              if (!result.canceled && result.assets[0]) {
                // Convert file URI to base64 for backend processing
                try {
                  const base64 = await convertUriToBase64(result.assets[0].uri);
                  setProfilePicture(base64);
                } catch (error) {
                  console.error('Error converting image to base64:', error);
                  // Fallback to URI if conversion fails
                  setProfilePicture(result.assets[0].uri);
                }
              }
            } catch (error) {
              Toast.show({
                type: 'error',
                text1: 'Error',
                text2: 'Failed to take photo. Please try again.',
              });
            } finally {
              setImageLoading(false);
            }
          },
          style: 'primary',
        },
        {
          text: 'Choose from Gallery',
          onPress: async () => {
            setShowAlertModal(false);
            const hasPermission = await requestImagePickerPermission();
            if (!hasPermission) return;

            setImageLoading(true);
            try {
                      const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
        });

              if (!result.canceled && result.assets[0]) {
                // Convert file URI to base64 for backend processing
                try {
                  const base64 = await convertUriToBase64(result.assets[0].uri);
                  setProfilePicture(base64);
                } catch (error) {
                  console.error('Error converting image to base64:', error);
                  // Fallback to URI if conversion fails
                  setProfilePicture(result.assets[0].uri);
                }
              }
            } catch (error) {
              Toast.show({
                type: 'error',
                text1: 'Error',
                text2: 'Failed to select image. Please try again.',
              });
            } finally {
              setImageLoading(false);
            }
          },
          style: 'primary',
        },
        { 
          text: 'Cancel', 
          onPress: () => {
            setShowAlertModal(false);
          }, 
          style: 'secondary' 
        },
      ]
    );
  };

  const removeProfilePicture = () => {
    setProfilePicture(null);
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

  // Dynamic styles based on screen size
  const dynamicStyles = {
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
      textAlign: 'center' as const,
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
      transition: 'opacity 0.2s ease-in-out',
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
      width: '100%' as const,
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
    inputWrapper: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      backgroundColor: '#FFFFFF',
      borderRadius: getResponsiveSpacing(12, 14, 16),
      paddingHorizontal: getResponsiveSpacing(16, 18, 20),
      height: getResponsiveSpacing(52, 56, 60),
      borderWidth: 1,
      borderColor: '#E2E8F0',
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.05,
          shadowRadius: 4,
        },
        android: {
          elevation: 1,
        },
      }),
    },
    input: {
      flex: 1,
      fontSize: getResponsiveFontSize(14, 16, 18),
      color: '#1E293B',
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
    buttonDisabled: {
      opacity: 0.6,
    },
    termsText: {
      fontSize: getResponsiveFontSize(10, 12, 14),
      color: '#64748B',
      textAlign: 'center' as const,
      lineHeight: getResponsiveSpacing(14, 18, 22),
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
    dividerText: {
      marginHorizontal: getResponsiveSpacing(12, 16, 20),
      fontSize: getResponsiveFontSize(12, 14, 16),
      color: '#94A3B8',
    },
  };

  const handleSignup = async () => {
    // Validate all fields
    const isValid = Object.keys(formData).every(field => 
      validateField(field, formData[field as keyof typeof formData])
    );

    if (!isValid) {
      Toast.show({
        type: 'error',
        text1: 'Validation Error',
        text2: 'Please check all fields and try again',
      });
      return;
    }

    setLoading(true);
    
    try {
      const requestBody = {
        fullName: formData.name,
        email: formData.email,
        phone: formData.phone,
        password: formData.password,
        role: 'user',
        profilePicUrl: profilePicture || DEFAULT_PROFILE_PIC,
      };
      
     
      const response = await fetch(`${API_BASE_URL}/api/auth/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();
      

      if (response.ok) {
        Toast.show({
          type: 'success',
          text1: 'Account Created',
          text2: 'Please verify your mobile number to complete registration',
        });

        // Navigate to OTP verification
        router.push({
          pathname: '/(auth)/mobile-verification',
          params: { 
            phone: formData.phone,
            isNewUser: 'true'
          }
        });
      } else {
        Toast.show({
          type: 'error',
          text1: 'Signup Failed',
          text2: data.message || 'Failed to create account. Please try again.',
        });
      }
    } catch (error) {
      console.error('Signup error:', error);
      Toast.show({
        type: 'error',
        text1: 'Network Error',
        text2: 'Please check your connection and try again',
      });
    } finally {
      setLoading(false);
    }
  };

  const renderInput = (
    field: keyof typeof formData,
    placeholder: string,
    icon: React.ReactNode,
    secureTextEntry?: boolean,
    keyboardType: 'default' | 'email-address' | 'phone-pad' = 'default',
    autoCapitalize: 'none' | 'words' = 'none',
    autoComplete?: 'email' | 'password' | 'name' | 'tel' | 'new-password'
  ) => (
    <View style={styles.inputContainer}>
      <View style={[dynamicStyles.inputWrapper, errors[field] && styles.inputError]}>
        {icon}
        <TextInput
          style={dynamicStyles.input}
          placeholder={placeholder}
          placeholderTextColor="#94A3B8"
          value={formData[field]}
          onChangeText={(value) => handleInputChange(field, value)}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoComplete={autoComplete}
          onBlur={() => validateField(field, formData[field])}
        />
        {field === 'password' && (
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
        )}
        {field === 'confirmPassword' && (
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
        )}
      </View>
      {errors[field] && (
        <View style={styles.errorContainer}>
          <AlertCircle size={14} color="#EF4444" />
          <Text style={styles.errorText}>{errors[field]}</Text>
        </View>
      )}
    </View>
  );

  useEffect(() => {
    if (user) {
      router.replace('/(tabs)');
    }
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (user) return true;
      return false;
    });
    return () => backHandler.remove();
  }, [user]);

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
                      source={{ uri: profilePicture || DEFAULT_PROFILE_PIC }}
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
                            {profilePicture ? 'Tap to change' : 'Tap to add'}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
                
                <View style={dynamicStyles.profileActions}>
                  <TouchableOpacity
                    style={[dynamicStyles.primaryButton, imageLoading && { opacity: 0.6 }]}
                    onPress={handleImagePicker}
                    disabled={imageLoading}
                  >
                    {imageLoading ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <Camera size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                        <Text style={dynamicStyles.primaryButtonText}>
                          {profilePicture ? 'Change Photo' : 'Add Photo'}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                  
                  {profilePicture && (
                    <TouchableOpacity
                      style={dynamicStyles.secondaryButton}
                      onPress={removeProfilePicture}
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
            {renderInput('name', 'Full Name', <User size={20} color="#64748B" style={styles.inputIcon} />, false, 'default', 'words', 'name')}
            {renderInput('email', 'Email address', <Mail size={20} color="#64748B" style={styles.inputIcon} />, false, 'email-address', 'none', 'email')}
            {renderInput('phone', 'Mobile Number', <Phone size={20} color="#64748B" style={styles.inputIcon} />, false, 'phone-pad', 'none', 'tel')}
            {renderInput('password', 'Password', <Lock size={20} color="#64748B" style={styles.inputIcon} />, !showPassword, 'default', 'none', 'new-password')}
            {renderInput('confirmPassword', 'Confirm Password', <Lock size={20} color="#64748B" style={styles.inputIcon} />, !showConfirmPassword, 'default', 'none', 'new-password')}

            <TouchableOpacity
              style={[dynamicStyles.signupButton, loading && styles.signupButtonDisabled]}
              onPress={handleSignup}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={dynamicStyles.signupButtonText}>Create Account</Text>
              )}
            </TouchableOpacity>

            <View style={styles.termsContainer}>
              <Text style={dynamicStyles.termsText}>
                By creating an account, you agree to our{' '}
                <Text style={styles.termsLink}>Terms of Service</Text>
                {' '}and{' '}
                <Text style={styles.termsLink}>Privacy Policy</Text>
              </Text>
            </View>

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={dynamicStyles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            <View style={styles.loginContainer}>
              <Text style={dynamicStyles.loginText}>Already have an account? </Text>
              <Link href="/(auth)/login" asChild>
                <TouchableOpacity>
                  <Text style={dynamicStyles.loginLink}>Sign In</Text>
                </TouchableOpacity>
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <CustomModal
        visible={showAlertModal}
        onClose={() => setShowAlertModal(false)}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
        buttons={alertConfig.buttons}
      />

      <Toast />
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
  profileSection: {
    marginBottom: 32,
    alignItems: 'center',
  },
  profileLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 16,
    textAlign: 'center',
  },
  profileContainer: {
    alignItems: 'center',
  },
  profileImageContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  profileImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#F1F5F9',
  },
  cameraOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#3B82F6',
    borderRadius: 20,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  profileActions: {
    alignItems: 'center',
    gap: 12,
  },
  profileActionButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileActionText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  removeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#FEF2F2',
    gap: 4,
  },
  removeButtonText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '500',
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
    fontWeight: '500',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
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
  inputError: {
    borderColor: '#EF4444',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    marginLeft: 4,
  },
  errorText: {
    fontSize: 12,
    color: '#EF4444',
    marginLeft: 4,
  },
});