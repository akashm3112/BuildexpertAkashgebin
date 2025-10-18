import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal as RNModal, ActivityIndicator, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, CreditCard, Smartphone, CheckCircle, X } from 'lucide-react-native';
import { WebView } from 'react-native-webview';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { SafeView } from '@/components/SafeView';
import { Modal } from '@/components/common/Modal';
import { API_BASE_URL } from '@/constants/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function PaymentScreen() {
  const router = useRouter();
  const { serviceId, serviceName, amount, category, providerServiceId } = useLocalSearchParams();
  const { user, updateUser } = useAuth();
  const { t } = useLanguage();
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

  const showAlert = (title: string, message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info', buttons?: { text: string; onPress: () => void; style?: 'primary' | 'secondary' | 'destructive' }[]) => {
    setAlertConfig({ title, message, type, buttons: buttons || [] });
    setShowAlertModal(true);
  };

  const handlePaymentMethodSelect = (method: 'paytm') => {
    setSelectedMethod(method);
    setShowPaymentModal(true);
  };

  const initiatePaytmPayment = async () => {
    try {
      setIsProcessing(true);

      let token = user?.token;
      if (!token) {
        const storedToken = await AsyncStorage.getItem('token');
        token = storedToken || undefined;
      }

      if (!token) {
        showAlert('Error', 'Authentication token not found. Please login again.', 'error');
        setIsProcessing(false);
        return;
      }

      // Call backend to initiate Paytm transaction
      const response = await fetch(`${API_BASE_URL}/api/payments/initiate-paytm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          providerServiceId: providerServiceId,
          amount: amount,
          serviceCategory: category,
          serviceName: serviceName
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to initiate payment');
      }

      // Store order ID and payment URL
      setOrderId(data.orderId);
      setPaytmUrl(data.paytmUrl);
      
      // Close payment method modal and open WebView
      setShowPaymentModal(false);
      setShowWebView(true);
      setIsProcessing(false);

    } catch (error: any) {
      setIsProcessing(false);
      setShowPaymentModal(false);
      showAlert('Payment Failed', error.message || 'Failed to initiate payment', 'error', [
        { text: 'OK', onPress: () => setShowAlertModal(false), style: 'primary' }
      ]);
    }
  };

  const verifyPayment = async (orderId: string, token: string) => {
    try {
      // Verify payment with backend
      const response = await fetch(`${API_BASE_URL}/api/payments/verify-paytm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          orderId: orderId,
          providerServiceId: providerServiceId
        })
      });

      const data = await response.json();

      setIsProcessing(false);
      setShowPaymentModal(false);

      if (response.ok && data.status === 'success') {
        showAlert(
          'Payment Successful!',
          `Your service registration is now active for 30 days. You will receive a reminder 2 days before expiry.`,
          'success',
          [
            {
              text: 'OK',
              onPress: () => {
                setShowAlertModal(false);
                router.replace('/(tabs)/services');
              },
              style: 'primary'
            }
          ]
        );
      } else {
        throw new Error(data.message || 'Payment verification failed');
      }

    } catch (error: any) {
      setIsProcessing(false);
      setShowPaymentModal(false);
      showAlert('Verification Failed', error.message || 'Failed to verify payment', 'error', [
        { text: 'OK', onPress: () => setShowAlertModal(false), style: 'primary' }
      ]);
    }
  };

  const handlePayment = async () => {
    if (!selectedMethod) {
      showAlert(t('alerts.error'), 'Please select a payment method', 'error');
      return;
    }

    await initiatePaytmPayment();
  };

  const handleWebViewNavigationStateChange = async (navState: any) => {
    const { url } = navState;
    
    // Check if user returned from Paytm (callback URL)
    if (url.includes('/api/payments/paytm-callback') || url.includes('payment-success') || url.includes('payment-complete')) {
      setShowWebView(false);
      setIsProcessing(true);
      
      let token = user?.token;
      if (!token) {
        const storedToken = await AsyncStorage.getItem('token');
        token = storedToken || undefined;
      }
      
      if (token && orderId) {
        await verifyPayment(orderId, token);
      }
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
            <Text style={styles.modalTitle}>Paytm Payment</Text>
            {!isProcessing && (
              <TouchableOpacity 
                onPress={() => setShowPaymentModal(false)}
                style={styles.closeButton}
              >
                <X size={24} color="#6B7280" />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.paymentDetails}>
            <Text style={styles.paymentAmount}>₹{amount}</Text>
            <Text style={styles.paymentDescription}>
              {isProcessing 
                ? 'Processing payment with Paytm...' 
                : 'Confirm to proceed with Paytm payment gateway'}
            </Text>
            <Text style={styles.validityText}>
              Valid for 30 days from activation
            </Text>
          </View>

          {isProcessing ? (
            <View style={styles.processingContainer}>
              <ActivityIndicator size="large" color="#3B82F6" />
              <Text style={styles.processingText}>Please wait...</Text>
            </View>
          ) : (
            <>
              <TouchableOpacity 
                style={styles.confirmButton}
                onPress={handlePayment}
              >
                <Text style={styles.confirmButtonText}>
                  Confirm Payment
                </Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.cancelButton}
                onPress={() => setShowPaymentModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </RNModal>
  );

  return (
    <SafeView backgroundColor="#FFFFFF">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <ArrowLeft size={24} color="#374151" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Payment</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.serviceInfo}>
          <Text style={styles.serviceTitle}>{serviceName}</Text>
          <Text style={styles.servicePrice}>₹{amount}/month</Text>
          <Text style={styles.serviceDescription}>
            30-day subscription to receive service requests and manage your profile
          </Text>
        </View>

        <View style={styles.paymentMethods}>
          <Text style={styles.sectionTitle}>Select Payment Method</Text>
          
          <TouchableOpacity 
            style={[
              styles.paymentMethod,
              selectedMethod === 'paytm' && styles.selectedMethod
            ]}
            onPress={() => handlePaymentMethodSelect('paytm')}
          >
            <Smartphone size={24} color="#00BAF2" />
            <Text style={styles.methodText}>Paytm Payment</Text>
            {selectedMethod === 'paytm' && <CheckCircle size={20} color="#3B82F6" />}
          </TouchableOpacity>

          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>📋 Payment Information</Text>
            <Text style={styles.infoText}>• Service valid for 30 days</Text>
            <Text style={styles.infoText}>• Reminder notification 2 days before expiry</Text>
            <Text style={styles.infoText}>• Service auto-deactivates after expiry</Text>
            <Text style={styles.infoText}>• Renewal extends from current expiry date</Text>
          </View>
        </View>

        <View style={styles.summary}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Service Registration (30 days)</Text>
            <Text style={styles.summaryValue}>₹{amount}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Processing Fee</Text>
            <Text style={styles.summaryValue}>₹0</Text>
          </View>
          <View style={[styles.summaryRow, styles.totalRow]}>
            <Text style={styles.totalLabel}>Total Amount</Text>
            <Text style={styles.totalValue}>₹{amount}</Text>
          </View>
        </View>

        <Text style={styles.securityNote}>
          🔒 Your payment information is secure and encrypted via Paytm
        </Text>
      </View>

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
        buttons={alertConfig.buttons}
      />
    </SafeView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    color: '#1F2937',
    marginLeft: 16,
  },
  content: {
    flex: 1,
    padding: 24,
  },
  serviceInfo: {
    backgroundColor: '#F0F9FF',
    padding: 20,
    borderRadius: 16,
    marginBottom: 32,
  },
  serviceTitle: {
    fontSize: 20,
    fontFamily: 'Inter-SemiBold',
    color: '#1F2937',
    marginBottom: 8,
  },
  servicePrice: {
    fontSize: 24,
    fontFamily: 'Inter-Bold',
    color: '#3B82F6',
    marginBottom: 8,
  },
  serviceDescription: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
    lineHeight: 20,
  },
  paymentMethods: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    color: '#1F2937',
    marginBottom: 16,
  },
  paymentMethod: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    marginBottom: 16,
  },
  selectedMethod: {
    borderColor: '#3B82F6',
    backgroundColor: '#F0F9FF',
  },
  methodText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: '#374151',
    marginLeft: 12,
    flex: 1,
  },
  infoBox: {
    backgroundColor: '#FEF3C7',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  infoTitle: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: '#92400E',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    color: '#78350F',
    marginBottom: 4,
  },
  summary: {
    backgroundColor: '#F9FAFB',
    padding: 20,
    borderRadius: 16,
    marginBottom: 24,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  summaryLabel: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
  },
  summaryValue: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: '#374151',
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 12,
    marginTop: 8,
    marginBottom: 0,
  },
  totalLabel: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#1F2937',
  },
  totalValue: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    color: '#3B82F6',
  },
  securityNote: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    margin: 20,
    width: '90%',
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: 'Inter-SemiBold',
    color: '#1F2937',
  },
  closeButton: {
    padding: 4,
  },
  paymentDetails: {
    alignItems: 'center',
    marginBottom: 32,
  },
  paymentAmount: {
    fontSize: 32,
    fontFamily: 'Inter-Bold',
    color: '#3B82F6',
    marginBottom: 8,
  },
  paymentDescription: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 8,
  },
  validityText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: '#059669',
    textAlign: 'center',
  },
  processingContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  processingText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: '#6B7280',
    marginTop: 12,
  },
  confirmButton: {
    backgroundColor: '#3B82F6',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  confirmButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#FFFFFF',
  },
  cancelButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: '#6B7280',
  },
  webViewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  webViewTitle: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    color: '#1F2937',
  },
  webViewLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  webViewLoadingText: {
    marginTop: 16,
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: '#6B7280',
  },
});
