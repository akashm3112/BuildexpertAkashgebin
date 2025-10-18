import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal as RNModal, Dimensions } from 'react-native';
import { CheckCircle, XCircle, AlertCircle, Info } from 'lucide-react-native';

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

interface ModalButton {
  text: string;
  onPress: () => void;
  style?: 'primary' | 'secondary' | 'destructive';
}

interface ModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  message?: string;
  type?: 'success' | 'error' | 'warning' | 'info';
  buttonText?: string;
  buttons?: ModalButton[];
  children?: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({
  visible,
  onClose,
  title,
  message,
  type = 'info',
  buttonText = 'OK',
  buttons,
  children,
}) => {
  const getIcon = () => {
    switch (type) {
      case 'success':
        return <CheckCircle size={48} color="#10B981" />;
      case 'error':
        return <XCircle size={48} color="#EF4444" />;
      case 'warning':
        return <AlertCircle size={48} color="#F59E0B" />;
      default:
        return <Info size={48} color="#3B82F6" />;
    }
  };

  const getIconContainerStyle = () => {
    switch (type) {
      case 'success':
        return styles.successIconContainer;
      case 'error':
        return styles.errorIconContainer;
      case 'warning':
        return styles.warningIconContainer;
      default:
        return styles.infoIconContainer;
    }
  };

  const renderButtons = () => {
    if (buttons && buttons.length > 0) {
      // For small screens or more than 2 buttons, stack them vertically
      if (isSmallScreen || buttons.length > 2) {
        return (
          <View style={styles.buttonsColumn}>
            {buttons.map((btn, idx) => (
              <TouchableOpacity
                key={idx}
                style={[
                  styles.actionButtonVertical,
                  btn.style === 'primary' && styles.primaryButton,
                  btn.style === 'secondary' && styles.secondaryButton,
                  btn.style === 'destructive' && styles.destructiveButton,
                  !btn.style && styles.primaryButton, // Default to primary if no style specified
                ]}
                onPress={btn.onPress}
              >
                <Text style={[
                  styles.actionButtonText,
                  (btn.style === 'secondary') && styles.secondaryButtonText,
                ]}>{btn.text}</Text>
              </TouchableOpacity>
            ))}
          </View>
        );
      }
      // For medium/large screens with 1-2 buttons, keep horizontal layout
      return (
        <View style={styles.buttonsRow}>
          {buttons.map((btn, idx) => (
            <TouchableOpacity
              key={idx}
              style={[
                styles.actionButton,
                btn.style === 'primary' && styles.primaryButton,
                btn.style === 'secondary' && styles.secondaryButton,
                btn.style === 'destructive' && styles.destructiveButton,
                !btn.style && styles.primaryButton, // Default to primary if no style specified
              ]}
              onPress={btn.onPress}
            >
              <Text style={[
                styles.actionButtonText,
                (btn.style === 'secondary') && styles.secondaryButtonText,
              ]}>{btn.text}</Text>
            </TouchableOpacity>
          ))}
        </View>
      );
    }
    return (
      <TouchableOpacity style={styles.button} onPress={onClose}>
        <Text style={styles.buttonText}>{buttonText}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <RNModal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <View style={[styles.iconContainer, getIconContainerStyle()]}>
            {getIcon()}
          </View>
          
          <Text style={styles.title}>{title}</Text>
          {children ? (
            <View style={{ width: '100%' }}>{children}</View>
          ) : (
            <Text style={styles.message}>{message}</Text>
          )}
          {renderButtons()}
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
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: getResponsiveSpacing(12, 14, 16),
  },
  successIconContainer: {
    backgroundColor: '#ECFDF5',
    borderWidth: 2,
    borderColor: '#10B981',
  },
  errorIconContainer: {
    backgroundColor: '#FEF2F2',
    borderWidth: 2,
    borderColor: '#EF4444',
  },
  warningIconContainer: {
    backgroundColor: '#FFFBEB',
    borderWidth: 2,
    borderColor: '#F59E0B',
  },
  infoIconContainer: {
    backgroundColor: '#EFF6FF',
    borderWidth: 2,
    borderColor: '#3B82F6',
  },
  title: {
    fontSize: getResponsiveFontSize(18, 19, 20),
    fontFamily: 'Inter-Bold',
    color: '#1F2937',
    textAlign: 'center',
    marginBottom: getResponsiveSpacing(6, 7, 8),
  },
  message: {
    fontSize: getResponsiveFontSize(14, 15, 16),
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: getResponsiveFontSize(20, 22, 24),
    marginBottom: getResponsiveSpacing(20, 22, 24),
  },
  button: {
    backgroundColor: '#3B82F6',
    paddingVertical: getResponsiveSpacing(10, 11, 12),
    paddingHorizontal: getResponsiveSpacing(28, 30, 32),
    borderRadius: getResponsiveSpacing(10, 11, 12),
    minWidth: getResponsiveSpacing(100, 110, 120),
    alignItems: 'center',
  },
  buttonText: {
    fontSize: getResponsiveFontSize(14, 15, 16),
    fontFamily: 'Inter-SemiBold',
    color: '#FFFFFF',
  },
  buttonsRow: {
    flexDirection: 'row',
    gap: getResponsiveSpacing(8, 10, 12),
    marginTop: getResponsiveSpacing(6, 7, 8),
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  buttonsColumn: {
    flexDirection: 'column',
    gap: getResponsiveSpacing(6, 7, 8),
    marginTop: getResponsiveSpacing(6, 7, 8),
    width: '100%',
  },
  actionButton: {
    paddingVertical: getResponsiveSpacing(10, 11, 12),
    paddingHorizontal: getResponsiveSpacing(16, 18, 20),
    borderRadius: getResponsiveSpacing(8, 9, 10),
    minWidth: getResponsiveSpacing(90, 100, 110),
    alignItems: 'center',
    backgroundColor: '#3B82F6', // Default background color
  },
  actionButtonVertical: {
    paddingVertical: getResponsiveSpacing(10, 11, 12),
    paddingHorizontal: getResponsiveSpacing(16, 18, 20),
    borderRadius: getResponsiveSpacing(8, 9, 10),
    width: '100%',
    alignItems: 'center',
    backgroundColor: '#3B82F6', // Default background color
  },
  primaryButton: {
    backgroundColor: '#3B82F6',
  },
  destructiveButton: {
    backgroundColor: '#EF4444',
  },
  secondaryButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: getResponsiveFontSize(14, 15, 16),
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
  },
  secondaryButtonText: {
    color: '#1F2937',
  },
}); 