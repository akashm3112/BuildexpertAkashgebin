import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  BackHandler,
  Image,
  Dimensions,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link, useRouter } from 'expo-router';
import { Eye, EyeOff, Mail, Lock, AlertCircle, Phone, CheckCircle2, ShieldCheck } from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import { Modal as CustomModal } from '@/components/common/Modal';
import { useAuth } from '@/context/AuthContext';
import { API_BASE_URL } from '@/constants/api';

export default function LoginScreen() {
  const { login, user } = useAuth();
  const router = useRouter();
  const [formData, setFormData] = useState({
    phone: '',
    password: '',
  });
  const [errors, setErrors] = useState({
    phone: '',
    password: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotStep, setForgotStep] = useState<'mobile' | 'otp' | 'reset' | 'success'>('mobile');
  const [forgotMobile, setForgotMobile] = useState('');
  const [forgotOtp, setForgotOtp] = useState(['', '', '', '', '', '']);
  const [otpSent, setOtpSent] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetConfirm, setResetConfirm] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [remainingAttempts, setRemainingAttempts] = useState(5);
  const [isLocked, setIsLocked] = useState(false);
  const [lockoutTimer, setLockoutTimer] = useState(0);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const otpRefs = useRef<Array<TextInput | null>>([]);
  const resetPasswordRef = useRef<TextInput | null>(null);
  const resetConfirmRef = useRef<TextInput | null>(null);

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const otpAnimations = useRef(
    Array(6).fill(null).map(() => new Animated.Value(0))
  ).current;

  // Responsive design utilities
  const { width: screenWidth } = Dimensions.get('window');
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

  // Create responsive styles using component's responsive functions
  const forgotPasswordStyles = React.useMemo(
    () => createForgotPasswordStyles(getResponsiveSpacing, getResponsiveFontSize),
    [screenWidth]
  );

  // Animate modal entrance
  useEffect(() => {
    if (showForgotModal) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      fadeAnim.setValue(0);
      scaleAnim.setValue(0.9);
      slideAnim.setValue(20);
    }
  }, [showForgotModal]);

  // Animate step transitions
  useEffect(() => {
    const stepProgress = {
      mobile: 0,
      otp: 33,
      reset: 66,
      success: 100,
    };
    
    Animated.timing(progressAnim, {
      toValue: stepProgress[forgotStep],
      duration: 400,
      useNativeDriver: false,
    }).start();

    // Animate OTP inputs
    if (forgotStep === 'otp') {
      otpAnimations.forEach((anim, idx) => {
        Animated.sequence([
          Animated.delay(idx * 50),
          Animated.spring(anim, {
            toValue: 1,
            tension: 50,
            friction: 7,
            useNativeDriver: true,
          }),
        ]).start();
      });
    } else {
      otpAnimations.forEach(anim => anim.setValue(0));
    }
  }, [forgotStep]);

  useEffect(() => {
    if (user) {
      router.replace('/(tabs)');
    }
    // Prevent back navigation on login screen - production pattern
    // This ensures users can't navigate back to authenticated screens after logout/account deletion
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      // If user is logged in, redirect to home (shouldn't happen on login screen but safety check)
      if (user) {
        router.replace('/(tabs)');
        return true; // Prevent default back behavior
      }
      // If user is not logged in, prevent going back to authenticated screens
      // This is production behavior - login screen is the entry point after logout/account deletion
      // Returning true prevents navigation back, ensuring users can't access deleted account or authenticated routes
      return true; // Always prevent back navigation from login screen
    });
    return () => backHandler.remove();
  }, [user]);

  const validatePhone = (phone: string) => {
    const phoneRegex = /^[6-9]\d{9}$/;
    return phoneRegex.test(phone);
  };

  const validateField = (field: string, value: string) => {
    let error = '';
    switch (field) {
      case 'phone':
        if (!validatePhone(value)) error = 'Please enter a valid 10-digit mobile number';
        break;
      case 'password':
        if (value.length < 6) error = 'Password must be at least 6 characters';
        break;
    }
    setErrors(prev => ({ ...prev, [field]: error }));
    return !error;
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    validateField(field, value);
  };

  const handleLogin = async () => {
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
      // Import network retry utility
      const { fetchWithRetry, getNetworkErrorMessage, checkNetworkConnectivity } = await import('@/utils/networkRetry');
      
      // Check network connectivity first
      const hasNetwork = await checkNetworkConnectivity();
      if (!hasNetwork) {
        Toast.show({
          type: 'error',
          text1: 'No Internet Connection',
          text2: 'Please check your network and try again',
        });
        setLoading(false);
        return;
      }

      // Make login request with retry mechanism
      const response = await fetchWithRetry(
        `${API_BASE_URL}/api/auth/login`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            phone: formData.phone,
            password: formData.password,
            role: 'user',
          }),
        },
        {
          maxRetries: 3,
          retryDelay: 1000,
          exponentialBackoff: true,
          timeout: 30000,
          onRetry: (attempt, error) => {
            console.log(`Login retry attempt ${attempt}/${3}`);
          },
        }
      );

      const data = await response.json();

      if (response.ok) {
        try {
          // Store tokens using TokenManager with retry
          const { tokenManager } = await import('@/utils/tokenManager');
          if (data.data.accessToken && data.data.refreshToken) {
            await tokenManager.storeTokenPair(
              data.data.accessToken,
              data.data.refreshToken,
              data.data.accessTokenExpiresAt,
              data.data.refreshTokenExpiresAt
            );
          }

          // Save user data to context (keep token for backward compatibility)
          await login({
            ...data.data.user,
            token: data.data.accessToken, // Keep for backward compatibility
          });

          Toast.show({
            type: 'success',
            text1: 'Welcome Back!',
            text2: 'Successfully logged in',
          });

          router.replace('/(tabs)');
        } catch (storageError) {
          console.error('Storage error during login:', storageError);
          Toast.show({
            type: 'error',
            text1: 'Storage Error',
            text2: 'Failed to save login data. Please try again.',
          });
        }
      } else {
        Toast.show({
          type: 'error',
          text1: 'Login Failed',
          text2: data.message || 'Invalid phone number or password',
        });
      }
    } catch (error) {
      console.error('Login error:', error);
      const { getNetworkErrorMessage } = await import('@/utils/networkRetry');
      const errorMessage = getNetworkErrorMessage(error);
      
      Toast.show({
        type: 'error',
        text1: 'Login Failed',
        text2: errorMessage,
      });
    } finally {
      setLoading(false);
    }
  };

  const validateMobile = (number: string) => /^[6-9]\d{9}$/.test(number);

  useEffect(() => {
    if (resendTimer <= 0) return;
    const t = setInterval(() => setResendTimer(prev => (prev > 0 ? prev - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [resendTimer]);

  // Handle lockout timer
  useEffect(() => {
    if (lockoutTimer <= 0) {
      setIsLocked(false);
      setRemainingAttempts(5);
      return;
    }
    const interval = setInterval(() => {
      setLockoutTimer((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [lockoutTimer]);

  const handleSendOtp = async () => {
    if (!validateMobile(forgotMobile)) {
      setOtpError('Please enter a valid 10-digit mobile number');
      return;
    }
    setOtpLoading(true);
    setOtpError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: forgotMobile })
      });
      const data = await response.json();
      if (!response.ok) {
        setOtpError(data.message || 'Failed to send OTP');
        setOtpLoading(false);
        return;
      }
      setOtpSent(true);
      setForgotStep('otp');
      setResendTimer(30);
      setOtpLoading(false);
    } catch (e) {
      setOtpError('Network error. Please try again');
      setOtpLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (isLocked) {
      const minutes = Math.floor(lockoutTimer / 60);
      const seconds = lockoutTimer % 60;
      setOtpError(`Too many failed attempts. Please try again in ${minutes}:${seconds.toString().padStart(2, '0')}`);
      return;
    }

    const code = forgotOtp.join('');
    if (code.length !== 6) {
      setOtpError('Please enter the 6-digit OTP');
      return;
    }
    setOtpError('');
    setOtpLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/forgot-password/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: forgotMobile, otp: code })
      });
      const data = await response.json();
      if (!response.ok) {
        // Handle OTP attempt limits
        if (data.locked) {
          setIsLocked(true);
          setLockoutTimer(data.lockoutTimeRemaining || 900); // 15 minutes default
          const minutes = Math.floor((data.lockoutTimeRemaining || 900) / 60);
          const seconds = (data.lockoutTimeRemaining || 900) % 60;
          setOtpError(`Too many failed attempts. Please try again in ${minutes}:${seconds.toString().padStart(2, '0')}`);
        } else if (data.remainingAttempts !== undefined) {
          setRemainingAttempts(data.remainingAttempts);
          setOtpError(data.message || 'Invalid or expired OTP');
        } else {
          setOtpError(data.message || 'Invalid or expired OTP');
        }
        setOtpLoading(false);
        return;
      }
      setResetToken(data.data?.resetToken || null);
      setForgotStep('reset');
    } catch (e) {
      setOtpError('Network error. Please try again');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (resetPassword.length < 6) {
      setOtpError('Password must be at least 6 characters');
      return;
    }
    if (resetPassword !== resetConfirm) {
      setOtpError('Passwords do not match');
      return;
    }
    if (!resetToken) {
      setOtpError('Reset session missing. Please restart forgot password');
      return;
    }
    setResetLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/forgot-password/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: forgotMobile, resetToken, newPassword: resetPassword })
      });
      const data = await response.json();
      if (!response.ok) {
        setOtpError(data.message || 'Failed to reset password');
        setResetLoading(false);
        return;
      }
      setForgotStep('success');
    } catch (e) {
      setOtpError('Network error. Please try again');
    } finally {
      setResetLoading(false);
    }
  };

  const handleOtpInput = (text: string, idx: number) => {
    // Handle paste (when user pastes 6 digits at once)
    if (text.length > 1) {
      const digits = text.slice(0, 6).split('').filter(char => /^\d$/.test(char));
      if (digits.length > 0) {
        const newOtp = [...forgotOtp];
        digits.forEach((digit, i) => {
          if (idx + i < 6) {
            newOtp[idx + i] = digit;
          }
        });
        setForgotOtp(newOtp);
        
        // Focus the last filled input
        const lastFilledIndex = Math.min(idx + digits.length - 1, 5);
        const focusIndex = lastFilledIndex < 5 ? lastFilledIndex + 1 : lastFilledIndex;
        
        // Auto-submit if all 6 digits are filled
        if (newOtp.every(d => d !== '')) {
          setTimeout(() => {
            otpRefs.current[focusIndex]?.blur();
            handleVerifyOtp();
          }, 100);
        } else {
          setTimeout(() => {
            otpRefs.current[focusIndex]?.focus();
          }, 50);
        }
      }
      return;
    }

    // Handle single digit input
    if (!/^[0-9]?$/.test(text)) return;
    const newOtp = [...forgotOtp];
    newOtp[idx] = text;
    setForgotOtp(newOtp);
    if (text && idx < 5) {
      setTimeout(() => {
        otpRefs.current[idx + 1]?.focus();
      }, 50);
    }
    
    // Auto-submit when all 6 digits are filled
    if (text && newOtp.every(d => d !== '')) {
      setTimeout(() => {
        otpRefs.current[idx]?.blur();
        handleVerifyOtp();
      }, 300);
    }
  };

  const handleOtpKeyPress = (e: any, idx: number) => {
    // Handle backspace key - when pressing backspace on an empty field, go to previous field
    if (e.nativeEvent.key === 'Backspace') {
      if (!forgotOtp[idx] && idx > 0) {
        const newOtp = [...forgotOtp];
        newOtp[idx - 1] = '';
        setForgotOtp(newOtp);
        setTimeout(() => {
          otpRefs.current[idx - 1]?.focus();
        }, 50);
      }
    }
  };

  const resetForgotState = () => {
    setShowForgotModal(false);
    setForgotStep('mobile');
    setForgotMobile('');
    setForgotOtp(['', '', '', '', '', '']);
    setOtpSent(false);
    setOtpLoading(false);
    setOtpError('');
    setResetPassword('');
    setResetConfirm('');
    setResetLoading(false);
    setShowResetPassword(false);
    setShowResetConfirm(false);
    setResendTimer(0);
    setResetToken(null);
    setRemainingAttempts(5);
    setIsLocked(false);
    setLockoutTimer(0);
  };

  const renderInput = (
    field: keyof typeof formData,
    placeholder: string,
    icon: React.ReactNode,
    secureTextEntry?: boolean,
    keyboardType: 'default' | 'email-address' | 'phone-pad' = 'default',
    autoCapitalize: 'none' = 'none',
    autoComplete?: 'email' | 'password' | 'name' | 'tel'
  ) => (
    <View style={styles.inputContainer}>
      <View style={[styles.inputWrapper, errors[field] && styles.inputError]}>
        {icon}
        <TextInput
          style={styles.input}
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
      </View>
      {errors[field] && (
        <View style={styles.errorContainer}>
          <AlertCircle size={14} color="#EF4444" />
          <Text style={styles.errorText}>{errors[field]}</Text>
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <CustomModal
        visible={showForgotModal}
        onClose={resetForgotState}
        title={forgotStep === 'success' ? 'Password Reset Successful!' : ''}
        type={forgotStep === 'success' ? 'success' : 'info'}
        buttons={
          forgotStep === 'mobile' ? [
            { text: otpLoading ? 'Sending...' : 'Send OTP', onPress: handleSendOtp, style: 'primary' }
          ] :
          forgotStep === 'otp' ? [
            { text: 'Verify OTP', onPress: handleVerifyOtp, style: 'primary' }
          ] :
          forgotStep === 'reset' ? [
            { text: resetLoading ? 'Resetting...' : 'Reset Password', onPress: handleResetPassword, style: 'primary' }
          ] :
          [
            { text: 'Close', onPress: resetForgotState, style: 'primary' }
          ]
        }
      >
        <Animated.View 
          style={[
            forgotPasswordStyles.container,
            {
              opacity: fadeAnim,
              transform: [
                { scale: scaleAnim },
                { translateY: slideAnim }
              ]
            }
          ]}
        >
          {/* Progress Indicator */}
          <View style={forgotPasswordStyles.progressContainer}>
            <View style={forgotPasswordStyles.progressBar}>
              <Animated.View 
                style={[
                  forgotPasswordStyles.progressFill,
                  {
                    width: progressAnim.interpolate({
                      inputRange: [0, 100],
                      outputRange: ['0%', '100%'],
                    })
                  }
                ]}
              />
            </View>
            <View style={forgotPasswordStyles.progressDots}>
              {['mobile', 'otp', 'reset', 'success'].map((step, idx) => {
                const stepIndex = ['mobile', 'otp', 'reset', 'success'].indexOf(forgotStep);
                const isActive = idx <= stepIndex;
                const isCurrent = idx === stepIndex;
                return (
                  <View
                    key={step}
                    style={[
                      forgotPasswordStyles.progressDot,
                      isActive && forgotPasswordStyles.progressDotActive,
                      isCurrent && forgotPasswordStyles.progressDotCurrent,
                    ]}
                  />
                );
              })}
            </View>
          </View>

          {forgotStep === 'mobile' && (
            <Animated.View 
              style={[
                forgotPasswordStyles.stepContainer,
                { opacity: fadeAnim }
              ]}
            >
              <Animated.View 
                style={[
                  forgotPasswordStyles.iconContainer,
                  forgotPasswordStyles.blueIcon,
                  {
                    transform: [{
                      scale: scaleAnim.interpolate({
                        inputRange: [0.9, 1],
                        outputRange: [0.9, 1],
                      })
                    }]
                  }
                ]}
              >
                <Phone size={getResponsiveFontSize(22, 24, 26)} color="#3B82F6" />
              </Animated.View>
              <Text style={[forgotPasswordStyles.stepTitle, { fontSize: getResponsiveFontSize(18, 19, 20) }]}>
                Verify Mobile Number
              </Text>
              <Text style={[forgotPasswordStyles.stepDescription, { fontSize: getResponsiveFontSize(13, 14, 15) }]}>
                Enter your registered mobile number to receive a verification code.
              </Text>
              <View style={[forgotPasswordStyles.inputWrapper, forgotPasswordStyles.inputWrapperElevated]}>
                <View style={forgotPasswordStyles.inputIconWrapper}>
                  <Phone size={20} color="#3B82F6" />
                </View>
                <TextInput
                  style={[forgotPasswordStyles.input, { fontSize: getResponsiveFontSize(15, 16, 17) }]}
                  placeholder="Enter mobile number"
                  placeholderTextColor="#94A3B8"
                  value={forgotMobile}
                  onChangeText={text => setForgotMobile(text.replace(/\D/g, '').slice(0, 10))}
                  keyboardType="number-pad"
                  maxLength={10}
                  autoFocus
                  editable={!otpLoading}
                />
              </View>
            </Animated.View>
          )}
          
          {forgotStep === 'otp' && (
            <Animated.View 
              style={[
                forgotPasswordStyles.stepContainer,
                { opacity: fadeAnim }
              ]}
            >
              <Animated.View 
                style={[
                  forgotPasswordStyles.iconContainer,
                  forgotPasswordStyles.amberIcon,
                  {
                    transform: [{
                      scale: scaleAnim.interpolate({
                        inputRange: [0.9, 1],
                        outputRange: [0.9, 1],
                      })
                    }]
                  }
                ]}
              >
                <ShieldCheck size={getResponsiveFontSize(22, 24, 26)} color="#F59E0B" />
              </Animated.View>
              <Text style={[forgotPasswordStyles.stepTitle, { fontSize: getResponsiveFontSize(18, 19, 20) }]}>
                Enter Verification Code
              </Text>
              <Text style={[forgotPasswordStyles.stepDescription, { fontSize: getResponsiveFontSize(13, 14, 15) }]}>
                We've sent a 6-digit code to{'\n'}
                <Text style={forgotPasswordStyles.phoneHighlight}>+91 {forgotMobile}</Text>
              </Text>
              <View style={forgotPasswordStyles.otpContainer}>
                {forgotOtp.map((digit, idx) => (
                  <Animated.View
                    key={idx}
                    style={{
                      transform: [
                        {
                          scale: otpAnimations[idx].interpolate({
                            inputRange: [0, 1],
                            outputRange: [0.8, 1],
                          })
                        },
                        {
                          translateY: otpAnimations[idx].interpolate({
                            inputRange: [0, 1],
                            outputRange: [20, 0],
                          })
                        }
                      ],
                      opacity: otpAnimations[idx],
                    }}
                  >
                    <TextInput
                      ref={ref => { otpRefs.current[idx] = ref; }}
                      style={[
                        forgotPasswordStyles.otpInput,
                        digit && forgotPasswordStyles.otpInputFilled,
                        isLocked && forgotPasswordStyles.otpInputDisabled,
                        {
                          width: getResponsiveSpacing(44, 48, 52),
                          height: getResponsiveSpacing(52, 56, 60),
                          fontSize: getResponsiveFontSize(18, 20, 22),
                        }
                      ]}
                      value={digit}
                      onChangeText={text => handleOtpInput(text, idx)}
                      onKeyPress={(e) => handleOtpKeyPress(e, idx)}
                      keyboardType="number-pad"
                      maxLength={6}
                      textAlign="center"
                      autoFocus={idx === 0 && forgotOtp.every(d => !d)}
                      editable={!isLocked}
                      selectTextOnFocus={true}
                      contextMenuHidden={true}
                    />
                  </Animated.View>
                ))}
              </View>
              <View style={forgotPasswordStyles.resendContainer}>
                <Text style={[forgotPasswordStyles.resendText, { fontSize: getResponsiveFontSize(12, 13, 14) }]}>
                  Didn't receive code?{' '}
                </Text>
                {resendTimer > 0 ? (
                  <View style={forgotPasswordStyles.timerBadge}>
                    <Text style={[forgotPasswordStyles.timerText, { fontSize: getResponsiveFontSize(12, 13, 14) }]}>
                      {resendTimer}s
                    </Text>
                  </View>
                ) : (
                  <TouchableOpacity 
                    onPress={handleSendOtp} 
                    disabled={otpLoading}
                    style={forgotPasswordStyles.resendButton}
                  >
                    <Text style={[forgotPasswordStyles.resendLink, { fontSize: getResponsiveFontSize(12, 13, 14) }]}>
                      {otpLoading ? 'Sending...' : 'Resend OTP'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </Animated.View>
          )}
          
          {forgotStep === 'reset' && (
            <Animated.View 
              style={[
                forgotPasswordStyles.stepContainer,
                { opacity: fadeAnim }
              ]}
            >
              <Animated.View 
                style={[
                  forgotPasswordStyles.iconContainer,
                  forgotPasswordStyles.greenIcon,
                  {
                    transform: [{
                      scale: scaleAnim.interpolate({
                        inputRange: [0.9, 1],
                        outputRange: [0.9, 1],
                      })
                    }]
                  }
                ]}
              >
                <Lock size={getResponsiveFontSize(22, 24, 26)} color="#10B981" />
              </Animated.View>
              <Text style={[forgotPasswordStyles.stepTitle, { fontSize: getResponsiveFontSize(18, 19, 20) }]}>
                Set New Password
              </Text>
              <Text style={[forgotPasswordStyles.stepDescription, { fontSize: getResponsiveFontSize(13, 14, 15) }]}>
                Create a strong password for your account. Make sure it's at least 6 characters long.
              </Text>
              <View style={[forgotPasswordStyles.inputWrapper, forgotPasswordStyles.inputWrapperElevated]}>
                <View style={forgotPasswordStyles.inputIconWrapper}>
                  <Lock size={20} color="#10B981" />
                </View>
                <TextInput
                  ref={resetPasswordRef}
                  style={[forgotPasswordStyles.input, { fontSize: getResponsiveFontSize(15, 16, 17) }]}
                  placeholder="New password"
                  placeholderTextColor="#94A3B8"
                  value={resetPassword}
                  onChangeText={setResetPassword}
                  secureTextEntry={!showResetPassword}
                  autoCapitalize="none"
                  autoFocus
                />
                <TouchableOpacity
                  style={forgotPasswordStyles.eyeIcon}
                  onPress={() => setShowResetPassword(!showResetPassword)}
                >
                  {showResetPassword ? (
                    <EyeOff size={20} color="#64748B" />
                  ) : (
                    <Eye size={20} color="#64748B" />
                  )}
                </TouchableOpacity>
              </View>
              <View style={[forgotPasswordStyles.inputWrapper, forgotPasswordStyles.inputWrapperElevated, { 
                marginTop: getResponsiveSpacing(14, 16, 18)
              }]}>
                <View style={forgotPasswordStyles.inputIconWrapper}>
                  <Lock size={20} color="#10B981" />
                </View>
                <TextInput
                  ref={resetConfirmRef}
                  style={[forgotPasswordStyles.input, { fontSize: getResponsiveFontSize(15, 16, 17) }]}
                  placeholder="Confirm new password"
                  placeholderTextColor="#94A3B8"
                  value={resetConfirm}
                  onChangeText={setResetConfirm}
                  secureTextEntry={!showResetConfirm}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  style={forgotPasswordStyles.eyeIcon}
                  onPress={() => setShowResetConfirm(!showResetConfirm)}
                >
                  {showResetConfirm ? (
                    <EyeOff size={20} color="#64748B" />
                  ) : (
                    <Eye size={20} color="#64748B" />
                  )}
                </TouchableOpacity>
              </View>
            </Animated.View>
          )}
          
          {forgotStep === 'success' && (
            <Animated.View 
              style={[
                forgotPasswordStyles.stepContainer,
                { opacity: fadeAnim }
              ]}
            >
              <Text style={[forgotPasswordStyles.successMessage, { fontSize: getResponsiveFontSize(14, 15, 16) }]}>
                Your password has been reset successfully.{'\n'}
                You can now log in with your new password.
              </Text>
            </Animated.View>
          )}
          
          {!!otpError && (
            <Animated.View 
              style={[
                forgotPasswordStyles.errorContainer, 
                { 
                  marginTop: getResponsiveSpacing(16, 20, 24),
                  opacity: fadeAnim,
                }
              ]}
            >
              <AlertCircle size={16} color="#EF4444" />
              <Text style={[forgotPasswordStyles.errorText, { fontSize: getResponsiveFontSize(12, 13, 14) }]}>
                {otpError}
              </Text>
            </Animated.View>
          )}
        </Animated.View>
      </CustomModal>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <Image
              source={require('../../assets/images/icon.png')}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.title}>Welcome Back</Text>
            <Text style={styles.subtitle}>Sign in to your account</Text>
          </View>

          <View style={styles.form}>
            {renderInput('phone', 'Mobile number', <Phone size={20} color="#64748B" style={styles.inputIcon} />, false, 'phone-pad', 'none', 'tel')}
            {renderInput('password', 'Password', <Lock size={20} color="#64748B" style={styles.inputIcon} />, !showPassword, 'default', 'none', 'password')}

            <TouchableOpacity style={styles.forgotPassword} onPress={() => setShowForgotModal(true)}>
              <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.loginButton, loading && styles.loginButtonDisabled]}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.loginButtonText}>Sign In</Text>
              )}
            </TouchableOpacity>

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            <View style={styles.signupContainer}>
              <Text style={styles.signupText}>Don't have an account? </Text>
              <Link href="/(auth)/signup" asChild>
                <TouchableOpacity>
                  <Text style={styles.signupLink}>Sign Up</Text>
                </TouchableOpacity>
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <Toast />
    </SafeAreaView>
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
  logo: {
    width: 150,
    height: 150,
    marginBottom: 20,
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
  inputError: {
    borderColor: '#EF4444',
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
  forgotPassword: {
    alignSelf: 'flex-end',
    marginBottom: 32,
  },
  forgotPasswordText: {
    fontSize: 14,
    color: '#3B82F6',
    fontWeight: '500',
  },
  loginButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  loginButtonDisabled: {
    opacity: 0.7,
  },
  loginButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
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
  signupContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  signupText: {
    fontSize: 14,
    color: '#64748B',
  },
  signupLink: {
    fontSize: 14,
    color: '#3B82F6',
    fontWeight: '600',
  },
});

// Forgot Password Modal Styles - Using responsive helper functions defined in component
// Note: Some values are fixed in StyleSheet, responsive values applied via inline styles in JSX
const createForgotPasswordStyles = (getSpacing: (s: number, m: number, l: number) => number, getFontSize: (s: number, m: number, l: number) => number) => StyleSheet.create({
  container: {
    width: '100%',
    paddingTop: getSpacing(0, 0, 0),
    paddingBottom: getSpacing(4, 6, 8),
    alignItems: 'center',
  },
  progressContainer: {
    width: '100%',
    marginBottom: getSpacing(24, 28, 32),
    paddingHorizontal: getSpacing(8, 10, 12),
  },
  progressBar: {
    height: 3,
    backgroundColor: '#E2E8F0',
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: getSpacing(12, 14, 16),
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#3B82F6',
    borderRadius: 10,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 3,
  },
  progressDots: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  progressDot: {
    width: getSpacing(8, 10, 12),
    height: getSpacing(8, 10, 12),
    borderRadius: getSpacing(4, 5, 6),
    backgroundColor: '#E2E8F0',
    borderWidth: 2,
    borderColor: '#E2E8F0',
  },
  progressDotActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  progressDotCurrent: {
    transform: [{ scale: 1.3 }],
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  stepContainer: {
    alignItems: 'center',
    width: '100%',
    justifyContent: 'center',
  },
  iconContainer: {
    width: getSpacing(64, 72, 80),
    height: getSpacing(64, 72, 80),
    borderRadius: getSpacing(32, 36, 40),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: getSpacing(20, 24, 28),
    marginTop: getSpacing(0, 0, 0),
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  blueIcon: {
    backgroundColor: '#EFF6FF',
    borderWidth: 2,
    borderColor: '#3B82F6',
  },
  amberIcon: {
    backgroundColor: '#FFFBEB',
    borderWidth: 2,
    borderColor: '#F59E0B',
  },
  greenIcon: {
    backgroundColor: '#ECFDF5',
    borderWidth: 2,
    borderColor: '#10B981',
  },
  successIcon: {
    backgroundColor: '#ECFDF5',
    borderWidth: 2,
    borderColor: '#10B981',
  },
  stepTitle: {
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: getSpacing(10, 12, 14),
    textAlign: 'center',
    paddingHorizontal: getSpacing(4, 6, 8),
  },
  stepDescription: {
    color: '#64748B',
    textAlign: 'center',
    lineHeight: getFontSize(20, 22, 24),
    marginBottom: getSpacing(24, 28, 32),
    paddingHorizontal: getSpacing(8, 10, 12),
  },
  phoneHighlight: {
    color: '#3B82F6',
    fontWeight: '600',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: getSpacing(14, 16, 18),
    height: getSpacing(52, 56, 60),
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    width: '100%',
    alignSelf: 'center',
  },
  inputWrapperElevated: {
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: {
        elevation: 3,
      },
    }),
    borderColor: '#CBD5E1',
  },
  inputIconWrapper: {
    width: getSpacing(36, 40, 44),
    height: getSpacing(36, 40, 44),
    borderRadius: getSpacing(10, 12, 14),
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: getSpacing(12, 14, 16),
  },
  inputIcon: {
    marginRight: getSpacing(10, 12, 14),
  },
  input: {
    flex: 1,
    color: '#1E293B',
    fontWeight: '500',
    paddingVertical: 0,
  },
  eyeIcon: {
    padding: getSpacing(4, 6, 8),
    marginLeft: getSpacing(8, 10, 12),
  },
  otpContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: getSpacing(20, 24, 28),
    gap: getSpacing(8, 10, 12),
    width: '100%',
    paddingHorizontal: getSpacing(4, 6, 8),
  },
  otpInput: {
    borderWidth: 2,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    fontWeight: '600',
    color: '#1E293B',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  otpInputFilled: {
    borderColor: '#3B82F6',
    backgroundColor: '#EFF6FF',
    borderWidth: 2.5,
    ...Platform.select({
      ios: {
        shadowColor: '#3B82F6',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 6,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  otpInputDisabled: {
    backgroundColor: '#F1F5F9',
    borderColor: '#CBD5E1',
    color: '#94A3B8',
  },
  resendContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: getSpacing(0, 0, 0),
    width: '100%',
    paddingHorizontal: getSpacing(4, 6, 8),
  },
  resendText: {
    color: '#64748B',
  },
  timerBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: getSpacing(10, 12, 14),
    paddingVertical: getSpacing(4, 6, 8),
    borderRadius: getSpacing(12, 14, 16),
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  timerText: {
    color: '#64748B',
    fontWeight: '600',
    fontSize: getFontSize(11, 12, 13),
  },
  resendButton: {
    paddingHorizontal: getSpacing(10, 12, 14),
    paddingVertical: getSpacing(4, 6, 8),
    borderRadius: getSpacing(12, 14, 16),
    backgroundColor: '#EFF6FF',
  },
  resendLink: {
    color: '#3B82F6',
    fontWeight: '600',
  },
  successMessage: {
    color: '#10B981',
    textAlign: 'center',
    lineHeight: getFontSize(20, 22, 24),
    fontWeight: '500',
    paddingHorizontal: getSpacing(8, 10, 12),
    marginTop: getSpacing(4, 6, 8),
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    padding: getSpacing(12, 14, 16),
    marginTop: getSpacing(12, 14, 16),
    borderWidth: 1.5,
    borderColor: '#FEE2E2',
    width: '100%',
    ...Platform.select({
      ios: {
        shadowColor: '#EF4444',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  errorText: {
    color: '#EF4444',
    marginLeft: getSpacing(6, 8, 10),
    flex: 1,
    textAlign: 'center',
    fontWeight: '500',
  },
});

// Styles are created dynamically in the component using useMemo