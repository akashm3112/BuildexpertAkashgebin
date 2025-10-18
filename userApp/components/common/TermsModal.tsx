import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal as RNModal, Dimensions } from 'react-native';
import { Info, CheckSquare, Square } from 'lucide-react-native';

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

interface TermsModalProps {
  visible: boolean;
  onClose: () => void;
  onAccept: () => void;
  termsChecked: boolean;
  onToggleTerms: () => void;
}

export const TermsModal: React.FC<TermsModalProps> = ({
  visible,
  onClose,
  onAccept,
  termsChecked,
  onToggleTerms,
}) => {
  return (
    <RNModal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <View style={styles.iconContainer}>
            <Info size={48} color="#3B82F6" />
          </View>
          
          <Text style={styles.title}>Terms & Conditions</Text>
          <Text style={styles.subtitle}>
            Please read and accept our terms before using the app:
          </Text>
          
          <View style={styles.termsContainer}>
            <Text style={styles.termItem}>• Pay the chargeable fees only after the work is done.</Text>
            <Text style={styles.termItem}>• The service user should pay only if they feel the worker is promising.</Text>
            <Text style={styles.termItem}>• This application will not bear any losses for the user or provider.</Text>
            <Text style={styles.termItem}>• For engineer's planning, an advance payment is compulsory.</Text>
          </View>
          
          <TouchableOpacity
            style={styles.checkboxRow}
            onPress={onToggleTerms}
            activeOpacity={0.8}
          >
            {termsChecked ? (
              <CheckSquare size={24} color="#3B82F6" style={styles.checkbox} />
            ) : (
              <Square size={24} color="#94A3B8" style={styles.checkbox} />
            )}
            <Text style={styles.checkboxText}>
              I have read and agree to the Terms & Conditions
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.button, !termsChecked && styles.buttonDisabled]} 
            onPress={termsChecked ? onAccept : undefined}
            disabled={!termsChecked}
          >
            <Text style={styles.buttonText}>I Agree</Text>
          </TouchableOpacity>
        </View>
      </View>
    </RNModal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: getResponsiveSpacing(16, 20, 24),
  },
  modalContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: getResponsiveSpacing(12, 14, 16),
    padding: getResponsiveSpacing(20, 22, 24),
    alignItems: 'center',
    maxWidth: getResponsiveSpacing(320, 340, 360),
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  iconContainer: {
    width: getResponsiveSpacing(70, 75, 80),
    height: getResponsiveSpacing(70, 75, 80),
    borderRadius: getResponsiveSpacing(35, 37, 40),
    backgroundColor: '#EFF6FF',
    borderWidth: 2,
    borderColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: getResponsiveSpacing(12, 14, 16),
  },
  title: {
    fontSize: getResponsiveFontSize(18, 19, 20),
    fontFamily: 'Inter-Bold',
    color: '#1F2937',
    textAlign: 'center',
    marginBottom: getResponsiveSpacing(6, 7, 8),
  },
  subtitle: {
    fontSize: getResponsiveFontSize(14, 15, 16),
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: getResponsiveFontSize(20, 22, 24),
    marginBottom: getResponsiveSpacing(16, 18, 20),
  },
  termsContainer: {
    backgroundColor: '#F1F5F9',
    borderRadius: getResponsiveSpacing(10, 11, 12),
    padding: getResponsiveSpacing(14, 15, 16),
    marginBottom: getResponsiveSpacing(16, 18, 20),
    width: '100%',
  },
  termItem: {
    fontSize: getResponsiveFontSize(12, 13, 14),
    color: '#1E293B',
    marginBottom: getResponsiveSpacing(6, 7, 8),
    lineHeight: getResponsiveFontSize(18, 19, 20),
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: getResponsiveSpacing(20, 22, 24),
    width: '100%',
  },
  checkbox: {
    marginRight: getResponsiveSpacing(8, 9, 10),
  },
  checkboxText: {
    fontSize: getResponsiveFontSize(13, 14, 15),
    color: '#334155',
    flex: 1,
    lineHeight: getResponsiveFontSize(18, 19, 20),
  },
  button: {
    backgroundColor: '#3B82F6',
    paddingVertical: getResponsiveSpacing(10, 11, 12),
    paddingHorizontal: getResponsiveSpacing(28, 30, 32),
    borderRadius: getResponsiveSpacing(10, 11, 12),
    minWidth: getResponsiveSpacing(100, 110, 120),
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#E5E7EB',
  },
  buttonText: {
    fontSize: getResponsiveFontSize(14, 15, 16),
    fontFamily: 'Inter-SemiBold',
    color: '#FFFFFF',
  },
}); 