import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal as RNModal, ActivityIndicator, Alert, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, CreditCard, Smartphone, CheckCircle, X } from 'lucide-react-native';
// WebView removed for testing
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { useLabourAccess } from '@/context/LabourAccessContext';
import { SafeView } from '@/components/SafeView';
import { Modal } from '@/components/common/Modal';
import { API_BASE_URL } from '@/constants/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function LabourPaymentScreen() {
  const router = useRouter();
  const { user, updateUser } = useAuth();
  const { t } = useLanguage();
  const { grantLabourAccess } = useLabourAccess();
  const [selectedMethod, setSelectedMethod] = useState<'paytm' | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [orderId, setOrderId] = useState('');
  const [showAlertModal, setShowAlertModal] = useState(false);
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
      const token = await AsyncStorage.getItem('token');
      if (!token) {
        throw new Error('Authentication token not found');
      }

      
      // For testing: Make payment successful immediately
      const testOrderId = 'TEST_ORDER_' + Date.now();
      setOrderId(testOrderId);
      
      // Close payment method modal
      setShowPaymentModal(false);
      setIsProcessing(false);
      
      // Immediately verify payment for testing
      verifyPayment(testOrderId, token);

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
      // For testing: Make payment successful immediately
      setIsProcessing(false);
      setShowPaymentModal(false);
      
      // For testing: Grant labour access using context
      try {
        await grantLabourAccess();
        
        // Also try to call the backend API
        try {
          const response = await fetch(`${API_BASE_URL}/api/test/grant-labour-access`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            }
          });

          const data = await response.json();
        } catch (apiError) {
        }
        
      } catch (error) {
        console.error('Error granting labour access:', error);
      }
      
      // Add a small delay to ensure backend processing
      setTimeout(() => {
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
      }, 1000);
      
    } catch (error: any) {
      setIsProcessing(false);
      setShowPaymentModal(false);
      showAlert('Payment Failed', error.message || 'Failed to verify payment', 'error', [
        { text: 'OK', onPress: () => setShowAlertModal(false), style: 'primary' }
      ]);
    }
  };

  const handlePaymentMethodSelect = (method: 'paytm') => {
    setSelectedMethod(method);
    setShowPaymentModal(true);
  };

  const handlePayment = () => {
    if (selectedMethod === 'paytm') {
      initiatePaytmPayment();
    }
  };

  // WebView navigation handler removed for testing

  const PaymentModal = () => (
    <RNModal
      visible={showPaymentModal}
      transparent={true}
      animationType="slide"
      onRequestClose={() => setShowPaymentModal(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Confirm Payment</Text>
            <TouchableOpacity onPress={() => setShowPaymentModal(false)}>
              <X size={24} color="#64748B" />
            </TouchableOpacity>
          </View>

          <View style={styles.modalBody}>
            <Text style={styles.confirmText}>
              {isProcessing 
                ? 'Processing payment with Paytm...' 
                : 'Confirm to proceed with Paytm payment gateway'}
            </Text>
            <Text style={styles.validityText}>
              Valid for 7 days from activation
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
        <Text style={styles.headerTitle}>Labour Service Payment</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.serviceInfo}>
          <View style={styles.serviceHeader}>
            <View style={styles.serviceIcon}>
              <CreditCard size={32} color="#3B82F6" />
            </View>
            <View style={styles.serviceDetails}>
              <Text style={styles.serviceTitle}>Labour Service Access</Text>
              <Text style={styles.servicePrice}>₹99 for 7 days</Text>
            </View>
          </View>
          <Text style={styles.serviceDescription}>
            Get unlimited access to book labour services and connect with skilled workers for 7 days
          </Text>
          <View style={styles.featuresList}>
            <View style={styles.featureItem}>
              <CheckCircle size={16} color="#10B981" />
              <Text style={styles.featureText}>Unlimited labour bookings</Text>
            </View>
            <View style={styles.featureItem}>
              <CheckCircle size={16} color="#10B981" />
              <Text style={styles.featureText}>Access to skilled workers</Text>
            </View>
            <View style={styles.featureItem}>
              <CheckCircle size={16} color="#10B981" />
              <Text style={styles.featureText}>7-day validity</Text>
            </View>
          </View>
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
            <View style={styles.paymentMethodContent}>
              <View style={styles.paymentMethodIcon}>
                <Smartphone size={28} color="#00BAF2" />
              </View>
              <View style={styles.paymentMethodInfo}>
                <Text style={styles.methodText}>Paytm Payment</Text>
                <Text style={styles.methodSubtext}>Secure & Fast</Text>
              </View>
              {selectedMethod === 'paytm' && (
                <View style={styles.selectedIndicator}>
                  <CheckCircle size={20} color="#FFFFFF" />
                </View>
              )}
            </View>
          </TouchableOpacity>

          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>📋 Payment Information</Text>
            <Text style={styles.infoText}>• Service valid for 7 days</Text>
            <Text style={styles.infoText}>• Reminder notification before expiry</Text>
            <Text style={styles.infoText}>• Service auto-deactivates after expiry</Text>
            <Text style={styles.infoText}>• Renewal extends from current expiry date</Text>
          </View>
        </View>

        <View style={styles.summary}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Labour Service Access (7 days)</Text>
            <Text style={styles.summaryValue}>₹99</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Processing Fee</Text>
            <Text style={styles.summaryValue}>₹0</Text>
          </View>
          <View style={[styles.summaryRow, styles.totalRow]}>
            <Text style={styles.totalLabel}>Total Amount</Text>
            <Text style={styles.totalValue}>₹99</Text>
          </View>
        </View>

        <Text style={styles.securityNote}>
          🔒 Your payment information is secure and encrypted via Paytm
        </Text>
      </View>

      <PaymentModal />
      
      {/* WebView removed for testing - payment goes directly to success */}

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
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginLeft: 16,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  serviceInfo: {
    backgroundColor: '#FFFFFF',
    padding: 24,
    borderRadius: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Platform.select({
      ios: {
        shadowColor: '#CBD5E1',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  serviceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  serviceIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#F0F9FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  serviceDetails: {
    flex: 1,
  },
  serviceTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  servicePrice: {
    fontSize: 24,
    fontWeight: '700',
    color: '#3B82F6',
  },
  serviceDescription: {
    fontSize: 16,
    color: '#64748B',
    lineHeight: 24,
    marginBottom: 20,
  },
  featuresList: {
    gap: 12,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  featureText: {
    fontSize: 14,
    color: '#374151',
    marginLeft: 12,
    fontWeight: '500',
  },
  paymentMethods: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },
  paymentMethod: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    marginBottom: 16,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#CBD5E1',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  selectedMethod: {
    borderColor: '#3B82F6',
    backgroundColor: '#3B82F6',
  },
  paymentMethodContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
  },
  paymentMethodIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#F0F9FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  paymentMethodInfo: {
    flex: 1,
  },
  methodText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  methodSubtext: {
    fontSize: 14,
    color: '#64748B',
  },
  selectedIndicator: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoBox: {
    backgroundColor: '#F0F9FF',
    padding: 16,
    borderRadius: 12,
    marginTop: 16,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E40AF',
    marginBottom: 12,
  },
  infoText: {
    fontSize: 14,
    color: '#1E40AF',
    marginBottom: 6,
    lineHeight: 20,
  },
  summary: {
    backgroundColor: '#F9FAFB',
    padding: 20,
    borderRadius: 12,
    marginBottom: 24,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  summaryLabel: {
    fontSize: 16,
    color: '#6B7280',
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 12,
    marginTop: 8,
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  totalValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#059669',
  },
  securityNote: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 16,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    margin: 20,
    width: '90%',
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  modalBody: {
    padding: 20,
  },
  confirmText: {
    fontSize: 16,
    color: '#374151',
    textAlign: 'center',
    marginBottom: 12,
  },
  validityText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  processingContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  processingText: {
    fontSize: 16,
    color: '#6B7280',
    marginTop: 12,
  },
  confirmButton: {
    backgroundColor: '#3B82F6',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  confirmButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    backgroundColor: '#F3F4F6',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#374151',
    fontSize: 16,
    fontWeight: '500',
  },
  // WebView styles
  webViewContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  webViewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  webViewTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  webView: {
    flex: 1,
  },
});
