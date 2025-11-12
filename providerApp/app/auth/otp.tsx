import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Dimensions } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, ShieldCheck, CheckCircle, Shield, MessageCircle, AlertTriangle, Clock } from 'lucide-react-native';
import { SafeView } from '@/components/SafeView';
import { Modal } from '@/components/common/Modal';
import { useAuth } from '@/context/AuthContext';
import { API_BASE_URL } from '@/constants/api';

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

export default function OTPVerification() {
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [timer, setTimer] = useState(30);
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [smsStatus, setSmsStatus] = useState<'pending' | 'sent' | 'failed'>('sent');
  const [modalVisible, setModalVisible] = useState(false);
  const [modalConfig, setModalConfig] = useState({
    title: '',
    message: '',
    type: 'info' as 'success' | 'error' | 'warning' | 'info'
  });
  const [remainingAttempts, setRemainingAttempts] = useState(5);
  const [isLocked, setIsLocked] = useState(false);
  const [lockoutTimer, setLockoutTimer] = useState(0);
  const inputRefs = useRef<Array<TextInput | null>>([]);
  const router = useRouter();
  const { phone, password, isNewUser } = useLocalSearchParams();
  const { login } = useAuth();

  useEffect(() => {
    const interval = setInterval(() => {
      setTimer((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

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

  const handleOtpChange = (value: string, idx: number) => {
    if (isLocked) return; // Prevent input when locked
    
    // Handle paste (when user pastes 6 digits at once)
    if (value.length > 1) {
      const digits = value.slice(0, 6).split('').filter(char => /^\d$/.test(char));
      if (digits.length > 0) {
        const newOtp = [...otp];
        digits.forEach((digit, i) => {
          if (idx + i < 6) {
            newOtp[idx + i] = digit;
          }
        });
        setOtp(newOtp);
        
        // Focus the last filled input or the next empty one
        const lastFilledIndex = Math.min(idx + digits.length - 1, 5);
        const nextEmptyIndex = newOtp.findIndex((val, i) => i > lastFilledIndex && !val);
        const focusIndex = nextEmptyIndex !== -1 ? nextEmptyIndex : (lastFilledIndex < 5 ? lastFilledIndex + 1 : lastFilledIndex);
        
        // Auto-submit if all 6 digits are filled - pass newOtp directly to avoid state timing issues
        if (newOtp.every(d => d !== '')) {
          setTimeout(() => {
            inputRefs.current[focusIndex]?.blur();
            handleVerifyOTP(newOtp);
          }, 100);
        } else {
          setTimeout(() => {
            inputRefs.current[focusIndex]?.focus();
          }, 50);
        }
      }
      return;
    }
    
    // Handle single digit input
    if (!/^[0-9]?$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[idx] = value;
    setOtp(newOtp);
    if (value && idx < 5) {
      setTimeout(() => {
        inputRefs.current[idx + 1]?.focus();
      }, 50);
    }

    // Auto-submit when all 6 digits are filled - pass newOtp directly to avoid state timing issues
    if (value && newOtp.every(d => d !== '')) {
      setTimeout(() => {
        inputRefs.current[idx]?.blur();
        handleVerifyOTP(newOtp);
      }, 300);
    }
  };

  const handleKeyPress = (e: any, idx: number) => {
    // Handle backspace key - when pressing backspace on an empty field, go to previous field
    if (e.nativeEvent.key === 'Backspace') {
      if (!otp[idx] && idx > 0) {
        // If current field is empty and backspace is pressed, go to previous field and clear it
        const newOtp = [...otp];
        newOtp[idx - 1] = '';
        setOtp(newOtp);
        setTimeout(() => {
          inputRefs.current[idx - 1]?.focus();
          inputRefs.current[idx - 1]?.setNativeProps?.({ text: '' });
        }, 50);
      }
    }
  };

  const showModal = (title: string, message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') => {
    setModalConfig({ title, message, type });
    setModalVisible(true);
  };

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const getSmsStatusText = () => {
    switch (smsStatus) {
      case 'sent':
        return 'SMS sent successfully';
      case 'failed':
        return 'SMS delivery failed';
      default:
        return 'SMS delivery pending';
    }
  };

  const getSmsStatusColor = () => {
    switch (smsStatus) {
      case 'sent':
        return '#10B981';
      case 'failed':
        return '#EF4444';
      default:
        return '#6B7280';
    }
  };

  const handleVerifyOTP = async (otpOverride?: string[]) => {
    if (isLocked) {
      showModal('Account Locked', `Too many failed attempts. Please try again in ${formatTime(lockoutTimer)}`, 'error');
      return;
    }

    // Use provided OTP array or fall back to state (for manual button press)
    const otpToVerify = otpOverride || otp;
    const otpValue = otpToVerify.join('').trim();
    
    if (otpValue.length !== 6) {
      showModal('Invalid OTP', 'Please enter a valid 6-digit OTP', 'error');
      return;
    }

    // Clean phone number (remove country code prefixes, spaces, etc.) to match backend format
    const cleanPhone = String(phone || '').replace(/^\+/, '').replace(/^1/, '').replace(/^91/, '').replace(/\D/g, '');
    
    if (!cleanPhone || cleanPhone.length !== 10) {
      showModal('Invalid Phone Number', 'Please enter a valid 10-digit phone number', 'error');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: cleanPhone, otp: otpValue })
      });
      const data = await response.json();
      setIsLoading(false);
      if (!response.ok) {
        // Handle OTP attempt limits
        if (data.locked) {
          setIsLocked(true);
          setLockoutTimer(data.lockoutTimeRemaining || 900); // 15 minutes default
          showModal('Account Locked', `Too many failed attempts. Please try again in ${formatTime(data.lockoutTimeRemaining || 900)}`, 'error');
        } else if (data.remainingAttempts !== undefined) {
          setRemainingAttempts(data.remainingAttempts);
          showModal('OTP Error', data.message || 'Invalid or expired OTP', 'error');
        } else {
          showModal('OTP Error', data.message || 'Invalid or expired OTP', 'error');
        }
        return;
      }
      // Debug: log the response data
      console.log('📥 OTP verification response:', data);
      console.log('🖼️ Profile picture URL from backend:', data.data.user.profilePicUrl || data.data.user.profile_pic_url || 'No profile picture');
      console.log('👤 User data:', data.data.user);
    
      // Success: log in and navigate
      await login({
        id: data.data.user.id,
        phone: data.data.user.phone,
        fullName: data.data.user.fullName || data.data.user.full_name || '',
        email: data.data.user.email || '',
        aadharNumber: data.data.user.aadharNumber || '',
        role: data.data.user.role || 'provider',
        registeredServices: data.data.user.registeredServices || [],
        token: data.data.token,
        profile_pic_url: data.data.user.profilePicUrl || data.data.user.profile_pic_url || ''
      });
        router.replace('/(tabs)');
    } catch (error) {
      setIsLoading(false);
      showModal('Network Error', 'Could not connect to server.', 'error');
    }
  };

  const handleResendOTP = async () => {
    if (isLocked) {
      showModal('Account Locked', `Too many failed attempts. Please try again in ${formatTime(lockoutTimer)}`, 'error');
      return;
    }

    if (timer > 0) return;
    
    // Clean phone number (remove country code prefixes, spaces, etc.) to match backend format
    const cleanPhone = String(phone || '').replace(/^\+/, '').replace(/^1/, '').replace(/^91/, '').replace(/\D/g, '');
    
    if (!cleanPhone || cleanPhone.length !== 10) {
      showModal('Invalid Phone Number', 'Please enter a valid 10-digit phone number', 'error');
      return;
    }
    
    setIsResending(true);
    setSmsStatus('pending');
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/resend-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone: cleanPhone,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setTimer(30);
        setOtp(['', '', '', '', '', '']);
        setSmsStatus('sent');
        showModal('OTP Resent', 'A new OTP has been sent to your mobile number.', 'success');
      } else {
        setSmsStatus('failed');
        if (data.message && data.message.includes('Too many failed attempts')) {
          setIsLocked(true);
          // Extract time from message like "Too many failed attempts. Please try again in 15:00"
          const timeMatch = data.message.match(/(\d+):(\d+)/);
          if (timeMatch) {
            const minutes = parseInt(timeMatch[1]);
            const seconds = parseInt(timeMatch[2]);
            setLockoutTimer(minutes * 60 + seconds);
          } else {
            setLockoutTimer(900); // 15 minutes default
          }
        }
        showModal('Resend Failed', data.message || 'Failed to resend OTP. Please try again.', 'error');
      }
    } catch (error) {
      console.error('Resend OTP error:', error);
      setSmsStatus('failed');
      showModal('Network Error', 'Could not resend OTP. Please check your connection and try again.', 'error');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <SafeView backgroundColor="#F8FAFC">
      <KeyboardAvoidingView 
        style={styles.container} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.topBar}>
            <View style={{ width: 32 }} />
            <Text style={styles.screenTitle}>Mobile Number Verification</Text>
            <View style={{ width: 32 }} />
          </View>

          <View style={styles.cardWrapper}>
            <View style={styles.card}>
              <View style={styles.iconContainer}>
                <Shield size={48} color="#3B82F6" />
              </View>
              <Text style={styles.cardTitle}>Verify Your Identity</Text>
              <Text style={styles.cardSubtitle}>
                Please enter your OTP sent to +{phone}
              </Text>
              
              {/* SMS Status Indicator */}
              <View style={styles.smsStatusContainer}>
                <MessageCircle size={16} color={getSmsStatusColor()} />
                <Text style={[styles.smsStatusText, { color: getSmsStatusColor() }]}>
                  {getSmsStatusText()}
                </Text>
              </View>

              {/* Attempt Counter */}
              {remainingAttempts < 5 && !isLocked && (
                <View style={styles.attemptContainer}>
                  <AlertTriangle size={16} color="#F59E0B" />
                  <Text style={styles.attemptText}>
                    {remainingAttempts} attempts remaining
                  </Text>
                </View>
              )}

              {/* Lockout Warning */}
              {isLocked && (
                <View style={styles.lockoutContainer}>
                  <Clock size={16} color="#EF4444" />
                  <Text style={styles.lockoutText}>
                    Account locked. Try again in {formatTime(lockoutTimer)}
                  </Text>
                </View>
              )}

              <View style={styles.otpContainer}>
                {otp.map((digit, index) => {
                  // Calculate responsive width for OTP inputs
                  // Account for: scrollContent padding (20*2) + card padding (32*2) = 104px total
                  const scrollContentPadding = 20 * 2; // Left + Right
                  const cardPadding = 32 * 2; // Left + Right
                  const totalHorizontalPadding = scrollContentPadding + cardPadding;
                  const gapSize = getResponsiveSpacing(6, 8, 10); // Responsive gap between inputs
                  const totalGaps = gapSize * 5; // 5 gaps for 6 inputs
                  const availableWidth = screenWidth - totalHorizontalPadding - totalGaps;
                  const inputWidth = availableWidth / 6;
                  // Ensure minimum 38px for very small screens and maximum 52px for large screens
                  const responsiveInputWidth = Math.max(38, Math.min(52, inputWidth));
                  
                  return (
                    <TextInput
                      key={index}
                      ref={(ref) => {
                        inputRefs.current[index] = ref;
                      }}
                      style={[
                        styles.otpInput,
                        {
                          width: responsiveInputWidth,
                          height: getResponsiveSpacing(50, 54, 58),
                          fontSize: getResponsiveFontSize(18, 20, 22),
                          marginRight: index < 5 ? gapSize : 0, // Add margin except for last input
                        },
                        digit && styles.otpInputFilled,
                        isLocked && styles.otpInputDisabled
                      ]}
                      value={digit}
                      onChangeText={(value) => handleOtpChange(value, index)}
                      onKeyPress={(e) => handleKeyPress(e, index)}
                      keyboardType="number-pad"
                      maxLength={6}
                      textAlign="center"
                      autoFocus={index === 0 && otp.every(d => !d)}
                      editable={!isLocked}
                      selectTextOnFocus={true}
                      contextMenuHidden={true}
                    />
                  );
                })}
              </View>

              <TouchableOpacity
                style={[
                  styles.verifyButton,
                  (isLoading || isLocked) && styles.verifyButtonDisabled
                ]}
                onPress={() => handleVerifyOTP()}
                disabled={isLoading || isLocked}
              >
                {isLoading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <CheckCircle size={20} color="#FFFFFF" />
                    <Text style={styles.verifyButtonText}>Verify OTP</Text>
                  </>
                )}
              </TouchableOpacity>

              <View style={styles.resendContainer}>
                <Text style={styles.resendText}>Didn't receive the code? </Text>
                {timer > 0 ? (
                  <Text style={styles.timerText}>Resend in {timer}s</Text>
                ) : (
                  <TouchableOpacity
                    onPress={handleResendOTP}
                    disabled={isResending || isLocked}
                  >
                    <Text style={[
                      styles.resendButton,
                      (isResending || isLocked) && styles.resendButtonDisabled
                    ]}>
                      {isResending ? 'Resending...' : 'Resend'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
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
      />
    </SafeView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 40,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 32,
  },
  screenTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1E293B',
  },
  cardWrapper: {
    flex: 1,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 24,
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1E293B',
    textAlign: 'center',
    marginBottom: 8,
  },
  cardSubtitle: {
    fontSize: 16,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },
  smsStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
  },
  smsStatusText: {
    fontSize: 14,
    marginLeft: 6,
    fontWeight: '500',
  },
  attemptContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
  },
  attemptText: {
    fontSize: 14,
    color: '#92400E',
    marginLeft: 6,
    fontWeight: '500',
  },
  lockoutContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
  },
  lockoutText: {
    fontSize: 14,
    color: '#991B1B',
    marginLeft: 6,
    fontWeight: '500',
  },
  otpContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 32,
    paddingHorizontal: 0,
    width: '100%',
  },
  otpInput: {
    borderWidth: 2,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    fontWeight: '600',
    color: '#1E293B',
    backgroundColor: '#FFFFFF',
    textAlign: 'center',
  },
  otpInputFilled: {
    borderColor: '#3B82F6',
    backgroundColor: '#EFF6FF',
  },
  otpInputDisabled: {
    backgroundColor: '#F1F5F9',
    borderColor: '#CBD5E1',
    color: '#94A3B8',
  },
  verifyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3B82F6',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    marginBottom: 24,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  verifyButtonDisabled: {
    backgroundColor: '#94A3B8',
    shadowOpacity: 0,
    elevation: 0,
  },
  verifyButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  resendContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resendText: {
    fontSize: 14,
    color: '#64748B',
  },
  resendButton: {
    fontSize: 14,
    color: '#3B82F6',
    fontWeight: '600',
  },
  resendButtonDisabled: {
    color: '#94A3B8',
  },
  timerText: {
    fontSize: 14,
    color: '#94A3B8',
    fontWeight: '500',
  },
});