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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link, useRouter } from 'expo-router';
import { Eye, EyeOff, Mail, Lock, AlertCircle, Phone, CheckCircle2 } from 'lucide-react-native';
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
  const otpRefs = useRef<Array<TextInput | null>>([]);

  useEffect(() => {
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
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone: formData.phone,
          password: formData.password,
          role: 'user',
        }),
      });

      const data = await response.json();

      if (response.ok) {
        // Save user data to context
        await login({
          ...data.data.user,
          token: data.data.token,
        });

        Toast.show({
          type: 'success',
          text1: 'Welcome Back!',
          text2: 'Successfully logged in',
        });

        router.replace('/(tabs)');
      } else {
        Toast.show({
          type: 'error',
          text1: 'Login Failed',
          text2: data.message || 'Invalid phone number or password',
        });
      }
    } catch (error) {
      console.error('Login error:', error);
      Toast.show({
        type: 'error',
        text1: 'Network Error',
        text2: 'Please check your connection and try again',
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
    if (!/^[0-9]?$/.test(text)) return;
    const newOtp = [...forgotOtp];
    newOtp[idx] = text;
    setForgotOtp(newOtp);
    if (text && idx < 5) {
      otpRefs.current[idx + 1]?.focus();
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
        title="Reset Password"
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
        <View style={{ backgroundColor: '#F8FAFC', borderRadius: 14, padding: 14, alignItems: 'center', maxWidth: 340, width: '100%', alignSelf: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 }}>
          {forgotStep === 'mobile' && (
            <>
              <View style={{ backgroundColor: '#EFF6FF', borderRadius: 20, width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                <Phone size={20} color="#3B82F6" />
              </View>
              <Text style={{ fontSize: 16, fontWeight: '600', color: '#1E293B', marginBottom: 4 }}>Verify Mobile</Text>
              <Text style={{ fontSize: 13, color: '#64748B', marginBottom: 12, textAlign: 'center' }}>
                Enter your registered mobile number to receive an OTP.
              </Text>
              <TextInput
                style={{
                  borderWidth: 1,
                  borderColor: '#E2E8F0',
                  borderRadius: 8,
                  padding: 10,
                  fontSize: 15,
                  color: '#1E293B',
                  backgroundColor: '#FFFFFF',
                  marginBottom: 6,
                  width: 180,
                  textAlign: 'center',
                  letterSpacing: 1,
                }}
                placeholder="Mobile number"
                placeholderTextColor="#94A3B8"
                value={forgotMobile}
                onChangeText={text => setForgotMobile(text.replace(/\D/g, '').slice(0, 10))}
                keyboardType="number-pad"
                maxLength={10}
                autoFocus
                editable={!otpLoading}
              />
            </>
          )}
          {forgotStep === 'otp' && (
            <>
              <View style={{ backgroundColor: '#FEF9C3', borderRadius: 20, width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                <Lock size={20} color="#F59E0B" />
              </View>
              <Text style={{ fontSize: 16, fontWeight: '600', color: '#1E293B', marginBottom: 4 }}>Enter OTP</Text>
              <Text style={{ fontSize: 13, color: '#64748B', marginBottom: 12, textAlign: 'center' }}>
                Enter the 6-digit OTP sent to <Text style={{ color: '#3B82F6', fontWeight: '500' }}>+91 {forgotMobile}</Text>
              </Text>
              <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 10 }}>
                {forgotOtp.map((digit, idx) => (
                  <TextInput
                    key={idx}
                    ref={ref => { otpRefs.current[idx] = ref; }}
                    style={{
                      width: 40,
                      height: 44,
                      borderWidth: 1,
                      borderColor: '#CBD5E1',
                      borderRadius: 8,
                      textAlign: 'center',
                      fontSize: 18,
                      fontWeight: '500',
                      marginHorizontal: 3,
                      backgroundColor: '#FFFFFF',
                      color: '#1E293B',
                    }}
                    value={digit}
                    onChangeText={text => handleOtpInput(text, idx)}
                    keyboardType="number-pad"
                    maxLength={1}
                  />
                ))}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                <Text style={{ fontSize: 12, color: '#64748B' }}>Didn't receive code?</Text>
                {resendTimer > 0 ? (
                  <Text style={{ marginLeft: 6, color: '#94A3B8', fontSize: 12 }}>Resend in {resendTimer}s</Text>
                ) : (
                  <TouchableOpacity onPress={handleSendOtp} style={{ marginLeft: 6 }} disabled={otpLoading}>
                    <Text style={{ color: '#3B82F6', fontWeight: '500', fontSize: 12 }}>{otpLoading ? 'Sending...' : 'Resend OTP'}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </>
          )}
          {forgotStep === 'reset' && (
            <>
              <View style={{ backgroundColor: '#DCFCE7', borderRadius: 20, width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                <Lock size={20} color="#22C55E" />
              </View>
              <Text style={{ fontSize: 16, fontWeight: '600', color: '#1E293B', marginBottom: 4 }}>Set New Password</Text>
              <Text style={{ fontSize: 13, color: '#64748B', marginBottom: 12, textAlign: 'center' }}>
                Enter and confirm your new password below.
              </Text>
              <TextInput
                style={{
                  borderWidth: 1,
                  borderColor: '#E2E8F0',
                  borderRadius: 8,
                  padding: 10,
                  fontSize: 15,
                  color: '#1E293B',
                  backgroundColor: '#FFFFFF',
                  marginBottom: 6,
                  width: 180,
                  textAlign: 'center',
                }}
                placeholder="New password"
                placeholderTextColor="#94A3B8"
                value={resetPassword}
                onChangeText={setResetPassword}
                secureTextEntry
                autoCapitalize="none"
              />
              <TextInput
                style={{
                  borderWidth: 1,
                  borderColor: '#E2E8F0',
                  borderRadius: 8,
                  padding: 10,
                  fontSize: 15,
                  color: '#1E293B',
                  backgroundColor: '#FFFFFF',
                  marginBottom: 6,
                  width: 180,
                  textAlign: 'center',
                }}
                placeholder="Confirm new password"
                placeholderTextColor="#94A3B8"
                value={resetConfirm}
                onChangeText={setResetConfirm}
                secureTextEntry
                autoCapitalize="none"
              />
            </>
          )}
          {forgotStep === 'success' && (
            <>
              <View style={{ backgroundColor: '#ECFDF5', borderRadius: 20, width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                <CheckCircle2 size={22} color="#10B981" />
              </View>
              <Text style={{ fontSize: 16, fontWeight: '600', color: '#1E293B', marginBottom: 4 }}>Password Reset!</Text>
              <Text style={{ fontSize: 14, color: '#10B981', textAlign: 'center', marginVertical: 8 }}>
                Your password has been reset successfully. You can now log in with your new password.
              </Text>
            </>
          )}
          {!!otpError && (
            <Text style={{ color: '#EF4444', fontSize: 13, marginTop: 6, textAlign: 'center' }}>{otpError}</Text>
          )}
        </View>
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