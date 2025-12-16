import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, TriangleAlert as AlertTriangle, Upload, Camera, FileText } from 'lucide-react-native';
import { SafeView } from '@/components/SafeView';
import { Modal } from '@/components/common/Modal';
import { useAuth } from '@/context/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '@/constants/api';
import { t } from '@/i18n';

interface ReportData {
  customerName: string;
  incidentDate: string;
  incidentTime: string;
  incidentType: string;
  description: string;
  evidence: string[];
}

const INCIDENT_TYPES = [
  'Inappropriate Behavior',
  'Policy Violation',
  'Payment Issues',
  'Harassment',
  'Spam/Unwanted Contact',
  'Safety Concerns',
  'Fraudulent Activity',
  'Other'
];

export default function ReportCustomerScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  
  // Alert Modal State
  const [showAlertModal, setShowAlertModal] = useState(false);
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
  
  const [formData, setFormData] = useState<ReportData>({
    customerName: '',
    incidentDate: '',
    incidentTime: '',
    incidentType: '',
    description: '',
    evidence: [],
  });

  const handleInputChange = (field: keyof ReportData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleAddEvidence = () => {
    if (formData.evidence.length >= 3) {
      showAlert(t('alerts.limitReached'), t('alerts.maxEvidenceReached'), 'warning', [
        { text: 'OK', onPress: () => {
          setShowAlertModal(false);
        }, style: 'primary' }
      ]);
      return;
    }
    
    // Mock evidence URLs for demonstration
    const mockEvidence = [
      'https://images.pexels.com/photos/5668858/pexels-photo-5668858.jpeg?auto=compress&cs=tinysrgb&w=400',
      'https://images.pexels.com/photos/6474471/pexels-photo-6474471.jpeg?auto=compress&cs=tinysrgb&w=400',
      'https://images.pexels.com/photos/5691654/pexels-photo-5691654.jpeg?auto=compress&cs=tinysrgb&w=400',
    ];
    
    const randomEvidence = mockEvidence[Math.floor(Math.random() * mockEvidence.length)];
    setFormData(prev => ({
      ...prev,
      evidence: [...prev.evidence, randomEvidence]
    }));
  };

  const handleRemoveEvidence = (index: number) => {
    setFormData(prev => ({
      ...prev,
      evidence: prev.evidence.filter((_, i) => i !== index)
    }));
  };

  // Convert DD/MM/YYYY to YYYY-MM-DD format
  const convertDateFormat = (dateString: string): string => {
    if (!dateString) return '';
    
    // Check if already in YYYY-MM-DD format
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      return dateString;
    }
    
    // Convert from DD/MM/YYYY to YYYY-MM-DD
    const parts = dateString.split('/');
    if (parts.length === 3) {
      const [day, month, year] = parts;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    
    return dateString; // Return as is if format is unrecognized
  };

  const handleSubmitReport = async () => {
    // Validate required fields
    if (!formData.customerName || !formData.incidentDate || !formData.incidentType || !formData.description) {
      showAlert('Missing Information', 'Please fill in all required fields', 'warning', [
        { text: 'OK', onPress: () => {
          setShowAlertModal(false);
        }, style: 'primary' }
      ]);
      return;
    }

    // Validate date format
    const convertedDate = convertDateFormat(formData.incidentDate);
    if (!convertedDate || !/^\d{4}-\d{2}-\d{2}$/.test(convertedDate)) {
      showAlert('Invalid Date', 'Please enter date in DD/MM/YYYY format (e.g., 25/12/2024)', 'warning', [
        { text: 'OK', onPress: () => {
          setShowAlertModal(false);
        }, style: 'primary' }
      ]);
      return;
    }

    setIsLoading(true);

    try {
      // Get authentication token
      const { tokenManager } = await import('@/utils/tokenManager');
      const token = await tokenManager.getValidToken();
      if (!token) {
        throw new Error('No authentication token found');
      }

     
      console.log('Submitting report with data:', {
        customerName: formData.customerName,
        incidentDate: convertedDate,
        incidentTime: formData.incidentTime || null,
        incidentType: formData.incidentType,
        description: formData.description,
        evidence: formData.evidence,
      });

      // Use unified error handling
      const { safeApiCall } = await import('@/utils/errorHandler');
      
      const result = await safeApiCall(
        async () => {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000);
          
          try {
            const response = await fetch(`${API_BASE_URL}/api/providers/report-customer`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
              },
              body: JSON.stringify({
                customerName: formData.customerName,
                incidentDate: convertedDate,
                incidentTime: formData.incidentTime || null,
                incidentType: formData.incidentType,
                description: formData.description,
                evidence: formData.evidence,
              }),
              signal: controller.signal,
            });
            
            clearTimeout(timeoutId);
            return response;
          } catch (fetchError) {
            clearTimeout(timeoutId);
            if ((fetchError as Error).name === 'AbortError') {
              throw new Error('Request timeout: Please check your internet connection and try again.');
            }
            throw fetchError;
          }
        },
        {
          showAlert: false, // Use custom alert
          onError: (errorInfo) => {
            showAlert('Error', errorInfo.userMessage, 'error', [
              { text: 'OK', onPress: () => {
                setShowAlertModal(false);
              }, style: 'primary' }
            ]);
          }
        }
      );

      if (result.success) {
        showAlert(
          'Report Submitted',
          'Your customer report has been submitted successfully. Our team will review it and take appropriate action.',
          'success',
          [
            {
              text: 'OK',
              onPress: () => {
                setShowAlertModal(false);
                router.back();
              },
              style: 'primary'
            }
          ]
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeView backgroundColor="#FFFFFF">
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <ArrowLeft size={24} color="#374151" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Report Customer</Text>
        </View>

        <ScrollView 
          style={styles.scrollView} 
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.content}>
            <View style={styles.iconContainer}>
              <AlertTriangle size={48} color="#DC2626" />
            </View>
            
            <Text style={styles.title}>Report a Customer Issue</Text>
            <Text style={styles.subtitle}>
              Help us maintain a safe and professional environment by reporting any issues with customers
            </Text>

            <View style={styles.form}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Customer Name/ID *</Text>
                <TextInput
                  style={styles.input}
                  value={formData.customerName}
                  onChangeText={(value) => handleInputChange('customerName', value)}
                  placeholder="Enter customer name or ID"
                  returnKeyType="next"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Incident Date *</Text>
                <TextInput
                  style={styles.input}
                  value={formData.incidentDate}
                  onChangeText={(value) => handleInputChange('incidentDate', value)}
                  placeholder="DD/MM/YYYY"
                  returnKeyType="next"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Incident Time</Text>
                <TextInput
                  style={styles.input}
                  value={formData.incidentTime}
                  onChangeText={(value) => handleInputChange('incidentTime', value)}
                  placeholder="HH:MM AM/PM (optional)"
                  returnKeyType="next"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Type of Incident *</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.incidentTypesContainer}>
                  {INCIDENT_TYPES.map((type) => (
                    <TouchableOpacity
                      key={type}
                      style={[
                        styles.incidentTypeButton,
                        formData.incidentType === type && styles.selectedIncidentType
                      ]}
                      onPress={() => handleInputChange('incidentType', type)}
                    >
                      <Text style={[
                        styles.incidentTypeText,
                        formData.incidentType === type && styles.selectedIncidentTypeText
                      ]}>
                        {type}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Detailed Description *</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={formData.description}
                  onChangeText={(value) => handleInputChange('description', value)}
                  placeholder="Please provide a detailed description of the incident, including what happened, when it occurred, and any relevant context..."
                  multiline
                  numberOfLines={6}
                  textAlignVertical="top"
                  returnKeyType="done"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Supporting Evidence (Optional)</Text>
                <Text style={styles.helperText}>
                  Upload screenshots, photos, or documents that support your report (Max 3 files)
                </Text>
                
                <View style={styles.evidenceContainer}>
                  {formData.evidence.map((evidence, index) => (
                    <View key={index} style={styles.evidenceItem}>
                      <FileText size={20} color="#3B82F6" />
                      <Text style={styles.evidenceText}>Evidence {index + 1}</Text>
                      <TouchableOpacity 
                        style={styles.removeEvidenceButton}
                        onPress={() => handleRemoveEvidence(index)}
                      >
                        <Text style={styles.removeEvidenceText}>×</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                  
                  {formData.evidence.length < 3 && (
                    <TouchableOpacity style={styles.addEvidenceButton} onPress={handleAddEvidence}>
                      <Upload size={20} color="#3B82F6" />
                      <Text style={styles.addEvidenceText}>Add Evidence</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              <View style={styles.warningBox}>
                <AlertTriangle size={20} color="#F59E0B" />
                <Text style={styles.warningText}>
                  Please ensure all information provided is accurate. False reports may result in account suspension.
                </Text>
              </View>

              <TouchableOpacity 
                style={[styles.submitButton, isLoading && styles.disabledButton]}
                onPress={handleSubmitReport}
                disabled={isLoading}
              >
                <AlertTriangle size={20} color="#FFFFFF" />
                <Text style={styles.submitButtonText}>
                  {isLoading ? 'Submitting Report...' : 'Submit Report'}
                </Text>
              </TouchableOpacity>
            </View>
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
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    color: '#1F2937',
    marginLeft: 16,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 24,
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
  form: {
    marginBottom: 32,
  },
  inputGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: '#374151',
    marginBottom: 8,
  },
  helperText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
    marginBottom: 12,
    lineHeight: 20,
  },
  input: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: '#374151',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  textArea: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
  incidentTypesContainer: {
    flexDirection: 'row',
  },
  incidentTypeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  selectedIncidentType: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  incidentTypeText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: '#6B7280',
  },
  selectedIncidentTypeText: {
    color: '#FFFFFF',
  },
  evidenceContainer: {
    gap: 12,
  },
  evidenceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F9FF',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  evidenceText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: '#1E40AF',
    marginLeft: 8,
    flex: 1,
  },
  removeEvidenceButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeEvidenceText: {
    fontSize: 16,
    fontFamily: 'Inter-Bold',
    color: '#FFFFFF',
  },
  addEvidenceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#3B82F6',
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    gap: 8,
  },
  addEvidenceText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: '#3B82F6',
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFBEB',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginBottom: 24,
  },
  warningText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#92400E',
    marginLeft: 12,
    flex: 1,
    lineHeight: 20,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DC2626',
    paddingVertical: 16,
    borderRadius: 12,
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
    gap: 8,
  },
  disabledButton: {
    backgroundColor: '#9CA3AF',
    shadowOpacity: 0.1,
  },
  submitButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#FFFFFF',
  },
});