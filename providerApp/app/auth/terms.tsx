import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, CircleCheck as CheckCircle, Circle, FileText, ArrowRight } from 'lucide-react-native';
import { SafeView } from '@/components/SafeView';
import { Modal } from '@/components/common/Modal';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';

export default function TermsAndConditions() {
  const [accepted, setAccepted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertConfig, setAlertConfig] = useState({
    title: '',
    message: '',
    type: 'info' as 'success' | 'error' | 'warning' | 'info',
    buttons: [] as { text: string; onPress: () => void; style?: 'primary' | 'secondary' | 'destructive' }[]
  });
  const router = useRouter();
  const { phone, password } = useLocalSearchParams();
  const { login } = useAuth();
  const { t } = useLanguage();

  const showAlert = (title: string, message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info', buttons?: { text: string; onPress: () => void; style?: 'primary' | 'secondary' | 'destructive' }[]) => {
    setAlertConfig({ title, message, type, buttons: buttons || [] });
    setShowAlertModal(true);
  };

  const handleAcceptTerms = async () => {
    if (!accepted) {
      showAlert(t('alerts.termsRequired'), t('alerts.acceptTermsToContinue'), 'warning', [
        { text: 'OK', onPress: () => {
          setShowAlertModal(false);
        }, style: 'primary' }
      ]);
      return;
    }

    setIsLoading(true);

    // Create new user account
    const userData = {
      id: Date.now().toString(),
      phone: phone as string,
      fullName: '',
      role: 'provider' as const,
      aadharNumber: '',
      registeredServices: [],
    };

    try {
      await login(userData);
      
      setTimeout(() => {
        setIsLoading(false);
        router.replace('/(tabs)');
      }, 1000);
    } catch (error) {
      setIsLoading(false);
      showAlert(t('alerts.error'), t('alerts.failedToCompleteRegistration'), 'error', [
        { text: 'OK', onPress: () => {
          setShowAlertModal(false);
        }, style: 'primary' }
      ]);
    }
  };

  return (
    <SafeView backgroundColor="#FFFFFF">
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <ArrowLeft size={24} color="#374151" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Terms & Conditions</Text>
        </View>

        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          <View style={styles.content}>
            <View style={styles.iconContainer}>
              <FileText size={48} color="#3B82F6" />
            </View>
            
            <Text style={styles.title}>Service Provider Agreement</Text>
            <Text style={styles.subtitle}>
              Please read and accept our terms to complete your registration
            </Text>

            <View style={styles.termsContainer}>
              <View style={styles.termSection}>
                <Text style={styles.termTitle}>1. Service Completion Policy</Text>
                <Text style={styles.termText}>
                  If the work is not finished (2 days contract time) in the given span of time, 
                  the charges for the penalty will be implemented for the service given.
                </Text>
              </View>

              <View style={styles.termSection}>
                <Text style={styles.termTitle}>2. Contract Conditions</Text>
                <Text style={styles.termText}>
                  If it is an overall contract, it depends on the condition of the building 
                  or the project; it goes for mutual understanding between service givers 
                  and a service receiver.
                </Text>
              </View>

              <View style={styles.termSection}>
                <Text style={styles.termTitle}>3. Professional Standards</Text>
                <Text style={styles.termText}>
                  All service providers must maintain professional standards and deliver 
                  quality work as per industry best practices.
                </Text>
              </View>

              <View style={styles.termSection}>
                <Text style={styles.termTitle}>4. Payment Terms</Text>
                <Text style={styles.termText}>
                  Payment terms will be agreed upon between service provider and client. 
                  Platform fees apply as per subscription plan.
                </Text>
              </View>

              <View style={styles.termSection}>
                <Text style={styles.termTitle}>5. Dispute Resolution</Text>
                <Text style={styles.termText}>
                  Any disputes will be resolved through our platform's mediation process 
                  with fair consideration to both parties.
                </Text>
              </View>
            </View>

            <TouchableOpacity 
              style={styles.checkboxContainer} 
              onPress={() => setAccepted(!accepted)}
            >
              {accepted ? (
                <CheckCircle size={24} color="#10B981" />
              ) : (
                <Circle size={24} color="#9CA3AF" />
              )}
              <Text style={styles.checkboxText}>
                I accept all terms and conditions
              </Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.acceptButton, !accepted && styles.disabledButton, isLoading && styles.disabledButton]} 
              onPress={handleAcceptTerms}
              disabled={!accepted || isLoading}
            >
              <Text style={styles.acceptButtonText}>
                {isLoading ? 'Completing Registration...' : 'Accept & Continue'}
              </Text>
              <ArrowRight size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
             <Modal
         visible={showAlertModal}
         title={alertConfig.title}
         message={alertConfig.message}
         type={alertConfig.type}
         buttons={alertConfig.buttons}
         onClose={() => setShowAlertModal(false)}
       />
    </SafeView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  backButton: {
    marginRight: 16,
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    color: '#1F2937',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 24,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontFamily: 'Inter-Bold',
    color: '#1F2937',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  termsContainer: {
    marginBottom: 32,
  },
  termSection: {
    marginBottom: 24,
    padding: 20,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#3B82F6',
  },
  termTitle: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#1F2937',
    marginBottom: 8,
  },
  termText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#374151',
    lineHeight: 20,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 32,
    padding: 16,
    backgroundColor: '#F0F9FF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  checkboxText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#1F2937',
    marginLeft: 12,
    flex: 1,
  },
  acceptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3B82F6',
    paddingVertical: 18,
    borderRadius: 16,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
    gap: 8,
  },
  acceptButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#FFFFFF',
  },
  disabledButton: {
    backgroundColor: '#9CA3AF',
    shadowOpacity: 0.1,
  },
});