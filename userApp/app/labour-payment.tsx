import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal as RNModal, ActivityIndicator, Alert, Platform, ScrollView, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, CreditCard, Smartphone, CheckCircle, X, Shield, Clock, Users } from 'lucide-react-native';
import { WebView } from 'react-native-webview';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { useLabourAccess } from '@/context/LabourAccessContext';
import { SafeView } from '@/components/SafeView';
import { Modal } from '@/components/common/Modal';
import { API_BASE_URL } from '@/constants/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

export default function LabourPaymentScreen() {
  const router = useRouter();
  const { user, updateUser } = useAuth();
  const { t } = useLanguage();
  const { grantLabourAccess, checkLabourAccess } = useLabourAccess();
  const [selectedMethod, setSelectedMethod] = useState<'paytm' | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showWebView, setShowWebView] = useState(false);
  const [paytmUrl, setPaytmUrl] = useState('');
  const [orderId, setOrderId] = useState('');
  const [showAlertModal, setShowAlertModal] = useState(false);
  const webViewRef = useRef<WebView>(null);
  const [alertConfig, setAlertConfig] = useState({
    title: '',
    message: '',
    type: 'info' as 'success' | 'error' | 'warning' | 'info',
    buttons: [] as { text: string; onPress: () => void; style?: 'primary' | 'secondary' | 'destructive' }[]
  });

  const showAlert = (title: string, message: string, type: 'success' | 'error' | 'warning' | 'info', buttons: { text: string; onPress: () => void; style?: 'primary' | 'secondary' | 'destructive' }[]) => {
    setAlertConfig({ title, message, type, buttons });
    setShowAlertModal(true);
  };

  const initiatePaytmPayment = async () => {
    setIsProcessing(true);
    try {
      const { apiPost } = await import('@/utils/apiClient');
      
      // Call the backend to initiate payment
      const response = await apiPost('/api/payments/initiate-labour-payment', {
        amount: 99,
        serviceName: 'labors',
        paymentMethod: 'paytm'
      });

      if (response.ok && response.data && response.data.status === 'success') {
        const orderId = response.data.orderId;
        const paytmUrl = response.data.paytmUrl;
        
        setOrderId(orderId);
        setPaytmUrl(paytmUrl);
        
        // ============================================================================
        // DEV/TEST BYPASS: Skip WebView and directly verify payment (for testing only)
        // ============================================================================
        // TODO: Remove this bypass before production release
        const isDevMode = __DEV__ || process.env.NODE_ENV !== 'production';
        
        if (isDevMode) {
          // In dev mode, skip WebView and directly verify payment
          setShowPaymentModal(false);
          setIsProcessing(true);
          // Small delay to show processing state
          setTimeout(() => {
            verifyPayment(orderId);
          }, 500);
        } else {
          // Close payment method modal and open WebView
          setShowPaymentModal(false);
          setShowWebView(true);
          setIsProcessing(false);
        }
      } else {
        throw new Error(response.data?.message || 'Failed to initiate payment');
      }
    } catch (error: any) {
      setIsProcessing(false);
      setShowPaymentModal(false);
      showAlert('Payment Unsuccessful', error.message || 'Unable to process your payment. Please try again', 'error', [
        { text: 'OK', onPress: () => setShowAlertModal(false), style: 'primary' }
      ]);
    }
  };

  const handleWebViewNavigationStateChange = async (navState: any) => {
    const { url } = navState;
    
    // Check if user returned from Paytm (callback URL)
    if (url.includes('/api/payments/paytm-callback') || url.includes('payment-success') || url.includes('payment-complete')) {
      setShowWebView(false);
      setIsProcessing(true);
      
      const { tokenManager } = await import('@/utils/tokenManager');
      const token = await tokenManager.getValidToken();
      
      if (token && orderId) {
        await verifyPayment(orderId);
      }
    }
  };

  const verifyPayment = async (orderId: string) => {
    try {
      // Call the backend to verify payment and grant access
      const { apiPost } = await import('@/utils/apiClient');
      
      const response = await apiPost('/api/payments/verify-labour-payment', {
        orderId: orderId
      });

      if (response.ok && response.data && response.data.status === 'success') {
        // Payment verified and access granted on backend
        // Now refresh the access data from backend
        try {
          await checkLabourAccess();
        } catch (refreshError) {
          // Access is already granted on backend, continue silently
        }
        
        setIsProcessing(false);
        setShowPaymentModal(false);
        
        // Show success message
        showAlert(
          'Payment Successful! 🎉',
          `Your labour service access is now active for 7 days. You will receive a reminder before expiry.`,
          'success',
          [
            { 
              text: 'View Access Status', 
              onPress: () => {
                setShowAlertModal(false);
                router.push('/labour-access-simple' as any);
              }, 
              style: 'primary' 
            },
            {
              text: 'Continue',
              onPress: () => {
                setShowAlertModal(false);
                router.replace('/(tabs)');
              },
              style: 'secondary'
            }
          ]
        );
      } else {
        throw new Error(response.data?.message || 'Payment verification failed');
      }
    } catch (error: any) {
      setIsProcessing(false);
      setShowPaymentModal(false);
      
      // Check if it's a "already processed" error - that's actually success
      if (error?.message?.includes('already processed') || error?.message?.includes('Payment already processed')) {
        // Access was already granted, just refresh data
        try {
          await checkLabourAccess();
        } catch (refreshError) {
          // Error refreshing access data, continue silently
        }
        
        showAlert(
          'Payment Already Processed',
          'Your labour service access is already active.',
          'success',
          [
            { 
              text: 'View Access Status', 
              onPress: () => {
                setShowAlertModal(false);
                router.push('/labour-access-simple' as any);
              }, 
              style: 'primary' 
            },
            {
              text: 'OK',
              onPress: () => setShowAlertModal(false),
              style: 'secondary'
            }
          ]
        );
      } else {
        showAlert('Payment Verification Unsuccessful', error.message || 'Unable to verify your payment. Please try again', 'error', [
          { text: 'OK', onPress: () => setShowAlertModal(false), style: 'primary' }
        ]);
      }
    }
  };

  const handlePaymentMethodSelect = (method: 'paytm') => {
    setSelectedMethod(method);
    // Payment method selected - user can now click "Pay Now" button
  };

  const handlePayment = () => {
    if (!selectedMethod) {
      showAlert('Select Payment Method', 'Please choose a payment method to continue', 'warning', [
        { text: 'OK', onPress: () => setShowAlertModal(false), style: 'primary' }
      ]);
      return;
    }
    
    if (selectedMethod === 'paytm') {
      initiatePaytmPayment();
    }
  };

  const PaymentModal = () => (
    <RNModal
      visible={showPaymentModal}
      transparent={true}
      animationType="slide"
      onRequestClose={() => !isProcessing && setShowPaymentModal(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderLeft}>
              <View style={styles.modalIconContainer}>
                <CreditCard size={getResponsiveFontSize(20, 24, 28)} color="#3B82F6" />
              </View>
              <Text style={styles.modalTitle}>Confirm Payment</Text>
            </View>
            {!isProcessing && (
              <TouchableOpacity 
                onPress={() => setShowPaymentModal(false)}
                style={styles.modalCloseButton}
              >
                <X size={getResponsiveFontSize(20, 24, 28)} color="#64748B" />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.modalBody}>
            {isProcessing ? (
              <View style={styles.processingContainer}>
                <ActivityIndicator size="large" color="#3B82F6" />
                <Text style={styles.processingText}>Processing your payment...</Text>
                <Text style={styles.processingSubtext}>Please wait, this may take a few seconds</Text>
              </View>
            ) : (
              <>
                <View style={styles.modalAmountContainer}>
                  <Text style={styles.modalAmountLabel}>Amount to Pay</Text>
                  <Text style={styles.modalAmountValue}>₹99</Text>
                </View>
                
                <View style={styles.modalInfoContainer}>
                  <View style={styles.modalInfoRow}>
                    <Clock size={getResponsiveFontSize(16, 18, 20)} color="#6B7280" />
                    <Text style={styles.modalInfoText}>Valid for 7 days from activation</Text>
                  </View>
                  <View style={styles.modalInfoRow}>
                    <Shield size={getResponsiveFontSize(16, 18, 20)} color="#6B7280" />
                    <Text style={styles.modalInfoText}>Secure payment via Paytm</Text>
                  </View>
                </View>

                <TouchableOpacity 
                  style={styles.modalConfirmButton}
                  onPress={handlePayment}
                  activeOpacity={0.8}
                >
                  <Text style={styles.modalConfirmButtonText}>Confirm & Pay ₹99</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={styles.modalCancelButton}
                  onPress={() => setShowPaymentModal(false)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.modalCancelButtonText}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </View>
    </RNModal>
  );

  return (
    <SafeView backgroundColor="#F9FAFB">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color="#374151" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Payment</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Section */}
        <View style={styles.heroSection}>
          <View style={styles.heroIconContainer}>
            <CreditCard size={40} color="#FFFFFF" />
          </View>
          <Text style={styles.heroTitle}>Labour Service Access</Text>
          <Text style={styles.heroSubtitle}>Unlimited bookings for 7 days</Text>
          <View style={styles.priceBadge}>
            <Text style={styles.priceBadgeText}>₹99</Text>
          </View>
        </View>

        {/* Features Section */}
        <View style={styles.featuresCard}>
          <Text style={styles.featuresTitle}>What's Included</Text>
          <View style={styles.featuresGrid}>
            <View style={styles.featureCard}>
              <View style={styles.featureIconContainer}>
                <Users size={getResponsiveFontSize(20, 22, 24)} color="#3B82F6" />
              </View>
              <Text style={styles.featureCardTitle}>Unlimited Bookings</Text>
              <Text style={styles.featureCardText} numberOfLines={2}>Book as many services as you need</Text>
            </View>
            <View style={styles.featureCard}>
              <View style={styles.featureIconContainer}>
                <Clock size={getResponsiveFontSize(20, 22, 24)} color="#10B981" />
              </View>
              <Text style={styles.featureCardTitle}>7 Days Access</Text>
              <Text style={styles.featureCardText} numberOfLines={2}>Full access for a week</Text>
            </View>
            <View style={styles.featureCard}>
              <View style={styles.featureIconContainer}>
                <Shield size={getResponsiveFontSize(20, 22, 24)} color="#F59E0B" />
              </View>
              <Text style={styles.featureCardTitle}>Secure Payment</Text>
              <Text style={styles.featureCardText} numberOfLines={2}>100% safe & encrypted</Text>
            </View>
          </View>
        </View>

        {/* Payment Method Section */}
        <View style={styles.paymentSection}>
          <Text style={styles.sectionTitle}>Payment Method</Text>
          
          <TouchableOpacity 
            style={[
              styles.paymentMethodCard,
              selectedMethod === 'paytm' && styles.paymentMethodCardSelected
            ]}
            onPress={() => handlePaymentMethodSelect('paytm')}
            activeOpacity={0.7}
          >
            <View style={styles.paymentMethodLeft}>
              <View style={[
                styles.paymentMethodIconContainer,
                selectedMethod === 'paytm' && styles.paymentMethodIconContainerSelected
              ]}>
                <Smartphone size={getResponsiveFontSize(20, 24, 28)} color={selectedMethod === 'paytm' ? '#FFFFFF' : '#00BAF2'} />
              </View>
              <View style={styles.paymentMethodInfo}>
                <Text style={[
                  styles.paymentMethodName,
                  selectedMethod === 'paytm' && styles.paymentMethodNameSelected
                ]}>
                  Paytm
                </Text>
                <Text style={[
                  styles.paymentMethodDesc,
                  selectedMethod === 'paytm' && styles.paymentMethodDescSelected
                ]}>
                  Secure & Fast Payment
                </Text>
              </View>
            </View>
            {selectedMethod === 'paytm' && (
              <View style={styles.checkBadge}>
                <CheckCircle size={24} color="#FFFFFF" />
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Summary Section */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Order Summary</Text>
          <View style={styles.summaryContent}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Service Access (7 days)</Text>
              <Text style={styles.summaryValue}>₹99</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Processing Fee</Text>
              <Text style={styles.summaryValue}>Free</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>₹99</Text>
            </View>
          </View>
        </View>

        {/* Security Note */}
        <View style={styles.securityCard}>
          <Shield size={getResponsiveFontSize(18, 20, 22)} color="#10B981" style={styles.securityIcon} />
          <Text style={styles.securityText}>
            Your payment is secured with 256-bit SSL encryption
          </Text>
        </View>

        {/* Pay Button */}
        {selectedMethod ? (
          <TouchableOpacity 
            style={[
              styles.payButton,
              isProcessing && styles.payButtonDisabled
            ]}
            onPress={() => {
              if (!isProcessing) {
                setShowPaymentModal(true);
              }
            }}
            disabled={isProcessing}
            activeOpacity={0.8}
          >
            {isProcessing ? (
              <>
                <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 12 }} />
                <Text style={styles.payButtonText}>Processing Payment...</Text>
              </>
            ) : (
              <>
                <Text style={styles.payButtonText}>Pay ₹99</Text>
                <ArrowLeft size={getResponsiveFontSize(18, 20, 22)} color="#FFFFFF" style={{ transform: [{ rotate: '180deg' }], marginLeft: getResponsiveSpacing(6, 8, 10) }} />
              </>
            )}
          </TouchableOpacity>
        ) : (
          <View style={styles.selectMethodPrompt}>
            <Text style={styles.selectMethodText}>Please select a payment method to continue</Text>
          </View>
        )}
      </ScrollView>

      <PaymentModal />
      
      {/* Paytm WebView Modal */}
      <RNModal
        visible={showWebView}
        animationType="slide"
        onRequestClose={() => setShowWebView(false)}
      >
        <SafeView backgroundColor="#FFFFFF">
          <View style={styles.webViewHeader}>
            <TouchableOpacity onPress={() => setShowWebView(false)}>
              <ArrowLeft size={24} color="#374151" />
            </TouchableOpacity>
            <Text style={styles.webViewTitle}>Complete Payment</Text>
            <View style={{ width: 24 }} />
          </View>
          
          {paytmUrl ? (
            <WebView
              ref={webViewRef}
              source={{ uri: paytmUrl }}
              onNavigationStateChange={handleWebViewNavigationStateChange}
              startInLoadingState={true}
              renderLoading={() => (
                <View style={styles.webViewLoading}>
                  <ActivityIndicator size="large" color="#3B82F6" />
                  <Text style={styles.webViewLoadingText}>Loading Paytm Payment...</Text>
                </View>
              )}
            />
          ) : (
            <View style={styles.webViewLoading}>
              <ActivityIndicator size="large" color="#3B82F6" />
              <Text style={styles.webViewLoadingText}>Preparing payment...</Text>
            </View>
          )}
        </SafeView>
      </RNModal>

      <Modal
        visible={showAlertModal}
        onClose={() => setShowAlertModal(false)}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
        buttons={alertConfig.buttons || [
          {
            text: 'OK',
            onPress: () => setShowAlertModal(false),
            style: 'primary'
          }
        ]}
      />
    </SafeView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: getResponsiveSpacing(16, 20, 24),
    paddingVertical: getResponsiveSpacing(14, 16, 18),
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  backButton: {
    padding: 4,
    minWidth: 40,
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: getResponsiveFontSize(18, 20, 22),
    fontWeight: '700',
    color: '#111827',
    flex: 1,
    textAlign: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: getResponsiveSpacing(24, 32, 40),
  },
  // Hero Section
  heroSection: {
    backgroundColor: '#3B82F6',
    paddingTop: getResponsiveSpacing(24, 32, 40),
    paddingBottom: getResponsiveSpacing(32, 40, 48),
    paddingHorizontal: getResponsiveSpacing(16, 20, 24),
    alignItems: 'center',
    borderBottomLeftRadius: getResponsiveSpacing(24, 32, 40),
    borderBottomRightRadius: getResponsiveSpacing(24, 32, 40),
    marginBottom: getResponsiveSpacing(20, 24, 28),
  },
  heroIconContainer: {
    width: getResponsiveSpacing(70, 80, 90),
    height: getResponsiveSpacing(70, 80, 90),
    borderRadius: getResponsiveSpacing(35, 40, 45),
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: getResponsiveSpacing(16, 20, 24),
  },
  heroTitle: {
    fontSize: getResponsiveFontSize(24, 28, 32),
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: getResponsiveSpacing(6, 8, 10),
    textAlign: 'center',
    paddingHorizontal: getResponsiveSpacing(8, 12, 16),
  },
  heroSubtitle: {
    fontSize: getResponsiveFontSize(14, 16, 18),
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: getResponsiveSpacing(16, 20, 24),
    textAlign: 'center',
    paddingHorizontal: getResponsiveSpacing(8, 12, 16),
  },
  priceBadge: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: getResponsiveSpacing(24, 32, 40),
    paddingVertical: getResponsiveSpacing(10, 12, 14),
    borderRadius: 30,
    minWidth: 100,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  priceBadgeText: {
    fontSize: getResponsiveFontSize(28, 32, 36),
    fontWeight: '800',
    color: '#3B82F6',
  },
  // Features Section
  featuresCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: getResponsiveSpacing(16, 20, 24),
    marginBottom: getResponsiveSpacing(16, 20, 24),
    borderRadius: getResponsiveSpacing(16, 20, 24),
    padding: getResponsiveSpacing(16, 20, 24),
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
  },
  featuresTitle: {
    fontSize: getResponsiveFontSize(18, 20, 22),
    fontWeight: '700',
    color: '#111827',
    marginBottom: getResponsiveSpacing(16, 20, 24),
    textAlign: 'center',
  },
  featuresGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: getResponsiveSpacing(8, 12, 16),
  },
  featureCard: {
    flex: 1,
    alignItems: 'center',
    minWidth: 0,
  },
  featureIconContainer: {
    width: getResponsiveSpacing(50, 56, 64),
    height: getResponsiveSpacing(50, 56, 64),
    borderRadius: getResponsiveSpacing(25, 28, 32),
    backgroundColor: '#F0F9FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: getResponsiveSpacing(10, 12, 14),
  },
  featureCardTitle: {
    fontSize: getResponsiveFontSize(12, 13, 14),
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
    marginBottom: getResponsiveSpacing(4, 6, 8),
  },
  featureCardText: {
    fontSize: getResponsiveFontSize(10, 11, 12),
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: getResponsiveFontSize(14, 16, 18),
  },
  // Payment Section
  paymentSection: {
    marginHorizontal: getResponsiveSpacing(16, 20, 24),
    marginBottom: getResponsiveSpacing(16, 20, 24),
  },
  sectionTitle: {
    fontSize: getResponsiveFontSize(18, 20, 22),
    fontWeight: '700',
    color: '#111827',
    marginBottom: getResponsiveSpacing(12, 16, 20),
  },
  paymentMethodCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: getResponsiveSpacing(14, 16, 18),
    borderWidth: 2,
    borderColor: '#E5E7EB',
    padding: getResponsiveSpacing(16, 20, 24),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  paymentMethodCardSelected: {
    borderColor: '#3B82F6',
    backgroundColor: '#3B82F6',
  },
  paymentMethodLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  paymentMethodIconContainer: {
    width: getResponsiveSpacing(50, 56, 64),
    height: getResponsiveSpacing(50, 56, 64),
    borderRadius: getResponsiveSpacing(25, 28, 32),
    backgroundColor: '#F0F9FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: getResponsiveSpacing(12, 16, 20),
    flexShrink: 0,
  },
  paymentMethodIconContainerSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  paymentMethodInfo: {
    flex: 1,
    minWidth: 0,
  },
  paymentMethodName: {
    fontSize: getResponsiveFontSize(16, 18, 20),
    fontWeight: '700',
    color: '#111827',
    marginBottom: getResponsiveSpacing(2, 4, 6),
  },
  paymentMethodNameSelected: {
    color: '#FFFFFF',
  },
  paymentMethodDesc: {
    fontSize: getResponsiveFontSize(12, 14, 16),
    color: '#6B7280',
  },
  paymentMethodDescSelected: {
    color: 'rgba(255, 255, 255, 0.9)',
  },
  checkBadge: {
    width: getResponsiveSpacing(36, 40, 44),
    height: getResponsiveSpacing(36, 40, 44),
    borderRadius: getResponsiveSpacing(18, 20, 22),
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginLeft: getResponsiveSpacing(8, 12, 16),
  },
  // Summary Section
  summaryCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: getResponsiveSpacing(16, 20, 24),
    marginBottom: getResponsiveSpacing(16, 20, 24),
    borderRadius: getResponsiveSpacing(16, 20, 24),
    padding: getResponsiveSpacing(16, 20, 24),
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
  },
  summaryTitle: {
    fontSize: getResponsiveFontSize(18, 20, 22),
    fontWeight: '700',
    color: '#111827',
    marginBottom: getResponsiveSpacing(12, 16, 20),
  },
  summaryContent: {
    gap: getResponsiveSpacing(10, 12, 14),
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  summaryLabel: {
    fontSize: getResponsiveFontSize(14, 16, 18),
    color: '#6B7280',
    fontWeight: '500',
    flex: 1,
    minWidth: 0,
  },
  summaryValue: {
    fontSize: getResponsiveFontSize(14, 16, 18),
    fontWeight: '600',
    color: '#111827',
    textAlign: 'right',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: getResponsiveSpacing(6, 8, 10),
  },
  totalLabel: {
    fontSize: getResponsiveFontSize(18, 20, 22),
    fontWeight: '700',
    color: '#111827',
    flex: 1,
  },
  totalValue: {
    fontSize: getResponsiveFontSize(22, 24, 28),
    fontWeight: '800',
    color: '#059669',
    textAlign: 'right',
  },
  // Security Card
  securityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    marginHorizontal: getResponsiveSpacing(16, 20, 24),
    marginBottom: getResponsiveSpacing(20, 24, 28),
    padding: getResponsiveSpacing(14, 16, 18),
    borderRadius: getResponsiveSpacing(10, 12, 14),
    borderLeftWidth: 4,
    borderLeftColor: '#10B981',
  },
  securityIcon: {
    flexShrink: 0,
  },
  securityText: {
    fontSize: getResponsiveFontSize(12, 14, 16),
    color: '#047857',
    marginLeft: getResponsiveSpacing(10, 12, 14),
    flex: 1,
    fontWeight: '500',
    lineHeight: getResponsiveFontSize(18, 20, 22),
    flexShrink: 1,
  },
  // Pay Button
  payButton: {
    backgroundColor: '#3B82F6',
    marginHorizontal: getResponsiveSpacing(16, 20, 24),
    paddingVertical: getResponsiveSpacing(16, 18, 20),
    borderRadius: getResponsiveSpacing(14, 16, 18),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: getResponsiveSpacing(52, 56, 60),
    ...Platform.select({
      ios: {
        shadowColor: '#3B82F6',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  payButtonDisabled: {
    backgroundColor: '#9CA3AF',
    opacity: 0.7,
  },
  payButtonText: {
    color: '#FFFFFF',
    fontSize: getResponsiveFontSize(16, 18, 20),
    fontWeight: '700',
  },
  selectMethodPrompt: {
    marginHorizontal: getResponsiveSpacing(16, 20, 24),
    padding: getResponsiveSpacing(14, 16, 18),
    backgroundColor: '#FFFBEB',
    borderRadius: getResponsiveSpacing(10, 12, 14),
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
  },
  selectMethodText: {
    fontSize: getResponsiveFontSize(12, 14, 16),
    color: '#92400E',
    textAlign: 'center',
    fontWeight: '500',
    lineHeight: getResponsiveFontSize(18, 20, 22),
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: getResponsiveSpacing(20, 24, 28),
    borderTopRightRadius: getResponsiveSpacing(20, 24, 28),
    maxHeight: screenHeight * 0.8,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: getResponsiveSpacing(20, 24, 28),
    paddingVertical: getResponsiveSpacing(16, 20, 24),
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  modalIconContainer: {
    width: getResponsiveSpacing(36, 40, 44),
    height: getResponsiveSpacing(36, 40, 44),
    borderRadius: getResponsiveSpacing(18, 20, 22),
    backgroundColor: '#F0F9FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: getResponsiveSpacing(10, 12, 14),
    flexShrink: 0,
  },
  modalTitle: {
    fontSize: getResponsiveFontSize(18, 20, 22),
    fontWeight: '700',
    color: '#111827',
    flex: 1,
  },
  modalCloseButton: {
    padding: 4,
    minWidth: 40,
    alignItems: 'flex-end',
  },
  modalBody: {
    padding: getResponsiveSpacing(20, 24, 28),
  },
  modalAmountContainer: {
    alignItems: 'center',
    marginBottom: getResponsiveSpacing(20, 24, 28),
    paddingVertical: getResponsiveSpacing(18, 20, 24),
    paddingHorizontal: getResponsiveSpacing(16, 20, 24),
    backgroundColor: '#F9FAFB',
    borderRadius: getResponsiveSpacing(14, 16, 18),
  },
  modalAmountLabel: {
    fontSize: getResponsiveFontSize(12, 14, 16),
    color: '#6B7280',
    marginBottom: getResponsiveSpacing(6, 8, 10),
    fontWeight: '500',
  },
  modalAmountValue: {
    fontSize: getResponsiveFontSize(32, 36, 40),
    fontWeight: '800',
    color: '#3B82F6',
  },
  modalInfoContainer: {
    marginBottom: getResponsiveSpacing(20, 24, 28),
    gap: getResponsiveSpacing(10, 12, 14),
  },
  modalInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: getResponsiveSpacing(6, 8, 10),
  },
  modalInfoText: {
    fontSize: getResponsiveFontSize(12, 14, 16),
    color: '#6B7280',
    marginLeft: getResponsiveSpacing(10, 12, 14),
    fontWeight: '500',
    flex: 1,
  },
  processingContainer: {
    alignItems: 'center',
    paddingVertical: getResponsiveSpacing(32, 40, 48),
  },
  processingText: {
    fontSize: getResponsiveFontSize(16, 18, 20),
    color: '#111827',
    marginTop: getResponsiveSpacing(12, 16, 20),
    fontWeight: '600',
    textAlign: 'center',
  },
  processingSubtext: {
    fontSize: getResponsiveFontSize(12, 14, 16),
    color: '#6B7280',
    marginTop: getResponsiveSpacing(6, 8, 10),
    textAlign: 'center',
  },
  modalConfirmButton: {
    backgroundColor: '#3B82F6',
    paddingVertical: getResponsiveSpacing(14, 16, 18),
    borderRadius: getResponsiveSpacing(10, 12, 14),
    alignItems: 'center',
    marginBottom: getResponsiveSpacing(10, 12, 14),
    minHeight: getResponsiveSpacing(48, 52, 56),
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
  modalConfirmButtonText: {
    color: '#FFFFFF',
    fontSize: getResponsiveFontSize(16, 18, 20),
    fontWeight: '700',
  },
  modalCancelButton: {
    paddingVertical: getResponsiveSpacing(14, 16, 18),
    borderRadius: getResponsiveSpacing(10, 12, 14),
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    minHeight: getResponsiveSpacing(48, 52, 56),
  },
  modalCancelButtonText: {
    color: '#374151',
    fontSize: getResponsiveFontSize(14, 16, 18),
    fontWeight: '600',
  },
  // WebView styles
  webViewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: getResponsiveSpacing(16, 20, 24),
    paddingVertical: getResponsiveSpacing(12, 14, 16),
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  webViewTitle: {
    fontSize: getResponsiveFontSize(16, 18, 20),
    fontWeight: '600',
    color: '#111827',
    flex: 1,
    textAlign: 'center',
  },
  webViewLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  webViewLoadingText: {
    marginTop: getResponsiveSpacing(12, 16, 20),
    fontSize: getResponsiveFontSize(14, 16, 18),
    fontWeight: '500',
    color: '#6B7280',
  },
});
