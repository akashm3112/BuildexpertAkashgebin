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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, ShieldCheck, CheckCircle, Shield, CheckSquare, Square, MessageCircle, AlertTriangle, Clock } from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import { useAuth } from '@/context/AuthContext';
import { Modal } from '@/components/common/Modal';
import { TermsModal } from '@/components/common/TermsModal';
import { API_BASE_URL } from '@/constants/api';

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
  const [smsStatus, setSmsStatus] = useState<'pending' | 'sent' | 'failed'>('pending');
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
    
    if (/^\d?$/.test(value)) {
      const newOtp = [...otp];
      newOtp[idx] = value;
      setOtp(newOtp);
      if (value && idx < 5) {
        inputRefs.current[idx + 1]?.focus?.();
      }
      if (!value && idx > 0) {
        inputRefs.current[idx - 1]?.focus?.();
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

  const handleVerifyOtp = async () => {
    if (isLocked) {
      showModal('Account Locked', `Too many failed attempts. Please try again in ${formatTime(lockoutTimer)}`, 'error');
      return;
    }

    const otpString = otp.join('');
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
      await login({
        ...verificationData.user,
        token: verificationData.token,
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

    setIsResending(true);
    setSmsStatus('pending');
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/resend-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone: phone as string,
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
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.back()}
            >
              <ArrowLeft size={24} color="#1E293B" />
            </TouchableOpacity>
          </View>

          <View style={styles.content}>
            <View style={styles.iconContainer}>
              <ShieldCheck size={64} color="#3B82F6" />
            </View>

            <Text style={styles.title}>Verify Your Mobile</Text>
            <Text style={styles.subtitle}>
              We've sent a 6-digit verification code to{'\n'}
              <Text style={styles.phoneNumber}>+91 {phone}</Text>
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
              {otp.map((digit, index) => (
                <TextInput
                  key={index}
                  ref={(ref) => {
                    inputRefs.current[index] = ref;
                  }}
                  style={[
                    styles.otpInput, 
                    digit && styles.otpInputFilled,
                    isLocked && styles.otpInputDisabled
                  ]}
                  value={digit}
                  onChangeText={(value) => handleOtpChange(value, index)}
                  keyboardType="numeric"
                  maxLength={1}
                  textAlign="center"
                  autoFocus={index === 0}
                  editable={!isLocked}
                />
              ))}
            </View>

            <TouchableOpacity
              style={[
                styles.verifyButton, 
                (isLoading || isLocked) && styles.verifyButtonDisabled
              ]}
              onPress={handleVerifyOtp}
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
                  onPress={handleResendOtp}
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

            {/* Development Mode Notice */}
            {__DEV__ && (
              <View style={styles.devNotice}>
                <Text style={styles.devNoticeText}>
                  💡 Development Mode: Check console for OTP
                </Text>
              </View>
            )}
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
    backgroundColor: '#F8FAFC',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  header: {
    marginBottom: 40,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  phoneNumber: {
    fontWeight: '600',
    color: '#1E293B',
  },
  smsStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
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
    width: '100%',
    marginBottom: 32,
  },
  otpInput: {
    width: 48,
    height: 56,
    borderWidth: 2,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    fontSize: 20,
    fontWeight: '600',
    color: '#1E293B',
    backgroundColor: '#FFFFFF',
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
    minWidth: 200,
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
  devNotice: {
    marginTop: 32,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
  },
  devNoticeText: {
    fontSize: 12,
    color: '#92400E',
    textAlign: 'center',
  },
}); 