import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Alert,
  Dimensions,
} from 'react-native';
import { Bell, Volume2, VolumeX, Vibrate, Smartphone } from 'lucide-react-native';
import { bookingNotificationService } from '@/services/BookingNotificationService';
import { useLanguage } from '@/context/LanguageContext';

// Responsive design utilities
const { width: screenWidth } = Dimensions.get('window');
const isSmallScreen = screenWidth < 375;

interface NotificationSettingsProps {
  onClose?: () => void;
}

export default function NotificationSettings({ onClose }: NotificationSettingsProps) {
  const { t } = useLanguage();
  const [config, setConfig] = useState(bookingNotificationService.getConfig());
  const [isTesting, setIsTesting] = useState(false);

  const updateConfig = (newConfig: Partial<typeof config>) => {
    const updatedConfig = { ...config, ...newConfig };
    setConfig(updatedConfig);
    bookingNotificationService.updateConfig(updatedConfig);
  };

  const handleTestNotification = async () => {
    if (isTesting) return;
    
    setIsTesting(true);
    try {
      await bookingNotificationService.testNotification();
      Alert.alert(
        'Test Notification',
        'Notification test completed! Check if you felt the vibration and heard the sound.',
        [{ text: 'OK' }]
      );
    } catch (error) {
      Alert.alert(
        'Test Failed',
        'Unable to test notification. Please check your device settings.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Bell size={24} color="#3B82F6" />
        <Text style={styles.headerTitle}>Notification Settings</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Vibration</Text>
        
        <View style={styles.settingCard}>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Vibrate size={20} color="#6B7280" />
              <Text style={styles.settingLabel}>Enable Vibration</Text>
            </View>
            <Switch
              value={config.enableVibration}
              onValueChange={(value) => updateConfig({ enableVibration: value })}
              trackColor={{ false: '#E5E7EB', true: '#3B82F6' }}
              thumbColor={config.enableVibration ? '#FFFFFF' : '#9CA3AF'}
            />
          </View>

          <View style={styles.intensitySection}>
            <View style={styles.intensityHeader}>
              <Smartphone size={20} color="#6B7280" />
              <Text style={styles.settingLabel}>Vibration Intensity</Text>
            </View>
            <View style={styles.intensityButtons}>
              {(['light', 'medium', 'heavy'] as const).map((intensity) => (
                <TouchableOpacity
                  key={intensity}
                  style={[
                    styles.intensityButton,
                    config.vibrationIntensity === intensity && styles.intensityButtonActive,
                  ]}
                  onPress={() => updateConfig({ vibrationIntensity: intensity })}
                >
                  <Text
                    style={[
                      styles.intensityButtonText,
                      config.vibrationIntensity === intensity && styles.intensityButtonTextActive,
                    ]}
                  >
                    {intensity.charAt(0).toUpperCase() + intensity.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Sound</Text>
        
        <View style={styles.settingCard}>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              {config.enableSound ? (
                <Volume2 size={20} color="#10B981" />
              ) : (
                <VolumeX size={20} color="#EF4444" />
              )}
              <Text style={styles.settingLabel}>Enable Sound</Text>
            </View>
            <Switch
              value={config.enableSound}
              onValueChange={(value) => updateConfig({ enableSound: value })}
              trackColor={{ false: '#E5E7EB', true: '#3B82F6' }}
              thumbColor={config.enableSound ? '#FFFFFF' : '#9CA3AF'}
            />
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Test</Text>
        
        <View style={styles.settingCard}>
          <TouchableOpacity
            style={[styles.testButton, isTesting && styles.testButtonDisabled]}
            onPress={handleTestNotification}
            disabled={isTesting}
          >
            <Bell size={20} color="#FFFFFF" />
            <Text style={styles.testButtonText}>
              {isTesting ? 'Testing...' : 'Test Notification'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          These settings control vibration and sound feedback for booking notifications.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    margin: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: isSmallScreen ? 18 : 20,
    fontWeight: '600',
    color: '#1F2937',
    marginLeft: 12,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: isSmallScreen ? 16 : 18,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 12,
  },
  settingCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  settingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingLabel: {
    fontSize: isSmallScreen ? 14 : 16,
    color: '#374151',
    marginLeft: 12,
    fontWeight: '500',
  },
  intensitySection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  intensityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  intensityButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  intensityButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    minWidth: 60,
    alignItems: 'center',
  },
  intensityButtonActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  intensityButtonText: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
  },
  intensityButtonTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  testButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3B82F6',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: 8,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  testButtonDisabled: {
    backgroundColor: '#9CA3AF',
  },
  testButtonText: {
    color: '#FFFFFF',
    fontSize: isSmallScreen ? 14 : 16,
    fontWeight: '600',
  },
  footer: {
    marginTop: 8,
  },
  footerText: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 16,
  },
});


