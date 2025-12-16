import React, { useState, useEffect, useRef } from 'react';
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
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, ShieldCheck, CheckCircle, Shield, CheckSquare, Square, MessageCircle, AlertTriangle, Clock, Lock } from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import { useAuth } from '@/context/AuthContext';
import { Modal } from '@/components/common/Modal';
import { TermsModal } from '@/components/common/TermsModal';
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

export default function MobileVerificationScreen() {
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [timer, setTimer] = useState(30);
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [termsChecked, setTermsChecked] = useState(false);
  const [verificationData, setVerificationData] = useState<any>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalConfig, setModalConfig] = useState({
    title: '',
    message: '',
    type: 'info' as 'success' | 'error' | 'warning' | 'info'
  });
  const [smsStatus, setSmsStatus] = useState<'pending' | 'sent' | 'failed'>('sent');
  const [remainingAttempts, setRemainingAttempts] = useState(5);
  const [isLocked, setIsLocked] = useState(false);
  const [lockoutTimer, setLockoutTimer] = useState(0);
  const inputRefs = useRef<Array<TextInput | null>>([]);
  const router = useRouter();
  const { phone, isNewUser } = useLocalSearchParams();
  const { login, acceptTerms, user } = useAuth();

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

  useEffect(() => {
    if (timer <= 0) return;
    const interval = setInterval(() => {
      setTimer((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [timer]);

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
        
        // Auto-submit if all 6 digits are filled
        if (newOtp.every(d => d !== '')) {
          setTimeout(() => {
            inputRefs.current[focusIndex]?.blur();
            handleVerifyOtp(newOtp);
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
    if (/^\d?$/.test(value)) {
      const newOtp = [...otp];
      newOtp[idx] = value;
      setOtp(newOtp);
      
      if (value && idx < 5) {
        // Move to next input when digit is entered
        setTimeout(() => {
          inputRefs.current[idx + 1]?.focus();
        }, 50);
      } else if (!value) {
        // When digit is deleted, focus stays on current field (backspace will handle navigation)
        // This allows user to edit the current field
      }
      
      // Auto-submit when all 6 digits are filled
      if (value && newOtp.every(d => d !== '')) {
        setTimeout(() => {
          inputRefs.current[idx]?.blur();
          handleVerifyOtp(newOtp);
        }, 300);
      }
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

  const handleVerifyOtp = async (otpOverride?: string[]) => {
    if (isLocked) {
      showModal('Account Locked', `Too many failed attempts. Please try again in ${formatTime(lockoutTimer)}`, 'error');
      return;
    }

    const otpToVerify = otpOverride || otp;
    const otpString = otpToVerify.join('');
    if (otpString.length !== 6) {
      showModal('Invalid OTP', 'Please enter the 6-digit OTP sent to your mobile number.', 'error');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/verify-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone: phone as string,
          otp: otpString,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        if (isNewUser === 'true') {
          // For new users, store verification data and show terms and conditions first
          setVerificationData(data.data);
          setShowTermsModal(true);
        } else {
          // For existing users, just verify OTP
          Toast.show({
            type: 'success',
            text1: 'OTP Verified',
            text2: 'Your mobile number has been verified successfully!',
          });
          router.back();
        }
      } else {
        // Handle OTP attempt limits
        if (data.locked) {
          setIsLocked(true);
          setLockoutTimer(data.lockoutTimeRemaining || 900); // 15 minutes default
          showModal('Account Locked', `Too many failed attempts. Please try again in ${formatTime(data.lockoutTimeRemaining || 900)}`, 'error');
        } else if (data.remainingAttempts !== undefined) {
          setRemainingAttempts(data.remainingAttempts);
          showModal('Verification Failed', data.message || 'Invalid OTP. Please try again.', 'error');
        } else {
          showModal('Verification Failed', data.message || 'Invalid OTP. Please try again.', 'error');
        }
      }
    } catch (error) {
      console.error('OTP verification error:', error);
      showModal('Network Error', 'Could not verify OTP. Please check your connection and try again.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAcceptTerms = async () => {
    if (!termsChecked) {
      showModal('Terms Required', 'Please accept the terms and conditions to continue.', 'warning');
      return;
    }

    try {
      await acceptTerms();
      
      // Store tokens using TokenManager
      const { tokenManager } = await import('@/utils/tokenManager');
      if (verificationData.accessToken && verificationData.refreshToken) {
        await tokenManager.storeTokenPair(
          verificationData.accessToken,
          verificationData.refreshToken,
          verificationData.accessTokenExpiresAt,
          verificationData.refreshTokenExpiresAt
        );
      }

      await login({
        ...verificationData.user,
        token: verificationData.accessToken || verificationData.token, // Keep for backward compatibility
      });

      Toast.show({
        type: 'success',
        text1: 'Welcome to BuildXpert!',
        text2: 'Your account has been created successfully!',
      });

      router.replace('/(tabs)');
    } catch (error) {
      console.error('Error accepting terms:', error);
      showModal('Error', 'Failed to create account. Please try again.', 'error');
    }
  };

  const handleResendOtp = async () => {
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

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        {/* Simple Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.6}
          >
            <ArrowLeft size={22} color="#475569" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Verification</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Simple Icon */}
          <View style={styles.iconSection}>
            <View style={styles.iconContainer}>
              <ShieldCheck size={getResponsiveFontSize(32, 36, 40)} color="#3B82F6" strokeWidth={2} />
            </View>
          </View>

          {/* Main Content */}
          <View style={styles.contentSection}>
            <Text style={styles.mainTitle}>Enter Verification Code</Text>
            <Text style={styles.description}>
              We've sent a 6-digit code to{'\n'}
              <Text style={styles.phoneHighlight}>+91 {phone}</Text>
            </Text>

            {/* Status Badge */}
            {smsStatus === 'sent' && (
              <View style={styles.statusBadge}>
                <MessageCircle size={14} color="#10B981" />
                <Text style={styles.statusText}>SMS sent successfully</Text>
              </View>
            )}

            {/* Warning Messages */}
            {remainingAttempts < 5 && !isLocked && (
              <View style={styles.warningBadge}>
                <AlertTriangle size={14} color="#F59E0B" />
                <Text style={styles.warningText}>{remainingAttempts} attempts remaining</Text>
              </View>
            )}

            {isLocked && (
              <View style={styles.errorBadge}>
                <Clock size={14} color="#EF4444" />
                <Text style={styles.errorText}>Account locked. Try again in {formatTime(lockoutTimer)}</Text>
              </View>
            )}

            {/* OTP Input Fields - Simple Design */}
            <View style={styles.otpContainer}>
              {otp.map((digit, index) => {
                const scrollContentPadding = 24 * 2;
                const gapSize = getResponsiveSpacing(8, 10, 12);
                const totalGaps = gapSize * 5;
                const availableWidth = screenWidth - scrollContentPadding - totalGaps;
                const inputWidth = availableWidth / 6;
                const responsiveInputWidth = Math.max(48, Math.min(64, inputWidth));
                
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
                        height: getResponsiveSpacing(56, 64, 72),
                        fontSize: getResponsiveFontSize(22, 26, 30),
                        marginRight: index < 5 ? gapSize : 0,
                      },
                      digit && styles.otpInputFilled,
                      isLocked && styles.otpInputDisabled
                    ]}
                    value={digit}
                    onChangeText={(value) => handleOtpChange(value, index)}
                    onKeyPress={(e) => handleKeyPress(e, index)}
                    keyboardType="numeric"
                    maxLength={6}
                    textAlign="center"
                    autoFocus={index === 0}
                    editable={!isLocked}
                    selectTextOnFocus={true}
                    contextMenuHidden={true}
                  />
                );
              })}
            </View>

            {/* Verify Button */}
            <TouchableOpacity
              style={[
                styles.verifyButton, 
                (isLoading || isLocked) && styles.verifyButtonDisabled
              ]}
              onPress={() => handleVerifyOtp()}
              disabled={isLoading || isLocked}
              activeOpacity={0.8}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <CheckCircle size={20} color="#FFFFFF" />
                  <Text style={styles.verifyButtonText}>Verify OTP</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Resend Section */}
            <View style={styles.resendContainer}>
              <Text style={styles.resendText}>Didn't receive the code? </Text>
              {timer > 0 ? (
                <View style={styles.timerContainer}>
                  <Clock size={12} color="#94A3B8" />
                  <Text style={styles.timerText}>Resend in {timer}s</Text>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={handleResendOtp}
                  disabled={isResending || isLocked}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.resendLink, 
                    (isResending || isLocked) && styles.resendLinkDisabled
                  ]}>
                    {isResending ? 'Resending...' : 'Resend'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Terms & Conditions Modal */}
      <TermsModal
        visible={showTermsModal}
        onClose={() => setShowTermsModal(false)}
        onAccept={handleAcceptTerms}
        termsChecked={termsChecked}
        onToggleTerms={() => setTermsChecked(prev => !prev)}
      />

      {/* Error/Success Modal */}
      <Modal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title={modalConfig.title}
        message={modalConfig.message}
        type={modalConfig.type}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFBFC',
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: getResponsiveSpacing(20, 24, 28),
    paddingTop: getResponsiveSpacing(16, 20, 24),
    paddingBottom: getResponsiveSpacing(12, 16, 20),
    backgroundColor: '#FAFBFC',
  },
  backButton: {
    width: getResponsiveSpacing(36, 40, 44),
    height: getResponsiveSpacing(36, 40, 44),
    borderRadius: getResponsiveSpacing(18, 20, 22),
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  headerTitle: {
    fontSize: getResponsiveFontSize(18, 20, 22),
    fontWeight: '600',
    color: '#1E293B',
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: getResponsiveSpacing(40, 48, 56),
  },
  iconSection: {
    alignItems: 'center',
    paddingTop: getResponsiveSpacing(24, 32, 40),
    paddingBottom: getResponsiveSpacing(16, 20, 24),
  },
  iconContainer: {
    width: getResponsiveSpacing(72, 80, 88),
    height: getResponsiveSpacing(72, 80, 88),
    borderRadius: getResponsiveSpacing(36, 40, 44),
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#DBEAFE',
  },
  contentSection: {
    flex: 1,
    paddingHorizontal: getResponsiveSpacing(24, 28, 32),
  },
  mainTitle: {
    fontSize: getResponsiveFontSize(26, 30, 34),
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: getResponsiveSpacing(8, 10, 12),
    letterSpacing: -0.5,
  },
  description: {
    fontSize: getResponsiveFontSize(14, 16, 18),
    color: '#64748B',
    textAlign: 'center',
    marginBottom: getResponsiveSpacing(20, 24, 28),
    lineHeight: getResponsiveFontSize(20, 24, 28),
  },
  phoneHighlight: {
    fontWeight: '600',
    color: '#1E293B',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    paddingHorizontal: getResponsiveSpacing(12, 14, 16),
    paddingVertical: getResponsiveSpacing(8, 10, 12),
    backgroundColor: '#ECFDF5',
    borderRadius: getResponsiveSpacing(16, 18, 20),
    marginBottom: getResponsiveSpacing(12, 16, 20),
    gap: getResponsiveSpacing(6, 8, 10),
  },
  statusText: {
    fontSize: getResponsiveFontSize(12, 13, 14),
    color: '#10B981',
    fontWeight: '500',
  },
  warningBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    paddingHorizontal: getResponsiveSpacing(12, 14, 16),
    paddingVertical: getResponsiveSpacing(8, 10, 12),
    backgroundColor: '#FEF3C7',
    borderRadius: getResponsiveSpacing(16, 18, 20),
    marginBottom: getResponsiveSpacing(12, 16, 20),
    gap: getResponsiveSpacing(6, 8, 10),
  },
  warningText: {
    fontSize: getResponsiveFontSize(12, 13, 14),
    color: '#92400E',
    fontWeight: '500',
  },
  errorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    paddingHorizontal: getResponsiveSpacing(12, 14, 16),
    paddingVertical: getResponsiveSpacing(8, 10, 12),
    backgroundColor: '#FEE2E2',
    borderRadius: getResponsiveSpacing(16, 18, 20),
    marginBottom: getResponsiveSpacing(12, 16, 20),
    gap: getResponsiveSpacing(6, 8, 10),
  },
  errorText: {
    fontSize: getResponsiveFontSize(12, 13, 14),
    color: '#991B1B',
    fontWeight: '500',
  },
  otpContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: getResponsiveSpacing(32, 40, 48),
    paddingHorizontal: getResponsiveSpacing(4, 8, 12),
  },
  otpInput: {
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: getResponsiveSpacing(12, 14, 16),
    fontWeight: '600',
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
    textAlign: 'center',
  },
  otpInputFilled: {
    borderColor: '#3B82F6',
    backgroundColor: '#F8FAFF',
    borderWidth: 2,
  },
  otpInputDisabled: {
    backgroundColor: '#F1F5F9',
    borderColor: '#CBD5E1',
    color: '#94A3B8',
    opacity: 0.6,
  },
  verifyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3B82F6',
    paddingVertical: getResponsiveSpacing(16, 18, 20),
    paddingHorizontal: getResponsiveSpacing(32, 40, 48),
    borderRadius: getResponsiveSpacing(12, 14, 16),
    marginBottom: getResponsiveSpacing(24, 28, 32),
    gap: getResponsiveSpacing(8, 10, 12),
  },
  verifyButtonDisabled: {
    backgroundColor: '#94A3B8',
  },
  verifyButtonText: {
    color: '#FFFFFF',
    fontSize: getResponsiveFontSize(16, 17, 18),
    fontWeight: '600',
  },
  resendContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: getResponsiveSpacing(4, 6, 8),
  },
  resendText: {
    fontSize: getResponsiveFontSize(13, 14, 15),
    color: '#64748B',
  },
  resendLink: {
    fontSize: getResponsiveFontSize(13, 14, 15),
    color: '#3B82F6',
    fontWeight: '600',
  },
  resendLinkDisabled: {
    color: '#94A3B8',
  },
  timerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: getResponsiveSpacing(4, 6, 8),
  },
  timerText: {
    fontSize: getResponsiveFontSize(13, 14, 15),
    color: '#94A3B8',
    fontWeight: '500',
  },
}); 