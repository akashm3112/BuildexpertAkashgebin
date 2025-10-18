import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Switch, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { Bell, BellOff, Settings, Volume2, VolumeX, Smartphone } from 'lucide-react-native';
import { usePushNotifications } from '@/hooks/useNotifications';
import { useLanguage } from '@/context/LanguageContext';
import { Modal } from '@/components/common/Modal';

interface NotificationSettingsProps {
  visible: boolean;
  onClose: () => void;
}

export default function NotificationSettings({ visible, onClose }: NotificationSettingsProps) {
  const { t } = useLanguage();
  const { updateSettings, sendTestNotification, permissionStatus } = usePushNotifications();
  
  const [settings, setSettings] = useState({
    booking_updates: true,
    reminders: true,
    promotional: false,
    sound_enabled: true,
    vibration_enabled: true,
  });
  
  const [loading, setLoading] = useState(false);
  const [showAlert, setShowAlert] = useState(false);
  const [alertConfig, setAlertConfig] = useState({
    title: '',
    message: '',
    type: 'info' as 'success' | 'error' | 'info' | 'warning',
  });

  const showAlertModal = (title: string, message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info') => {
    setAlertConfig({ title, message, type });
    setShowAlert(true);
  };

  const handleSettingChange = async (key: string, value: boolean) => {
    try {
      const newSettings = { ...settings, [key]: value };
      setSettings(newSettings);
      
      setLoading(true);
      const success = await updateSettings(newSettings);
      setLoading(false);
      
      if (!success) {
        // Revert on failure
        setSettings(settings);
        showAlertModal('Error', 'Failed to update notification settings', 'error');
      }
    } catch (error) {
      setLoading(false);
      setSettings(settings); // Revert
      showAlertModal('Error', 'Failed to update notification settings', 'error');
    }
  };

  const handleTestNotification = async () => {
    try {
      setLoading(true);
      const success = await sendTestNotification();
      setLoading(false);
      
      if (success) {
        showAlertModal('Test Sent', 'Test notification sent successfully!', 'success');
      } else {
        showAlertModal('Test Failed', 'Failed to send test notification', 'error');
      }
    } catch (error) {
      setLoading(false);
      showAlertModal('Test Failed', 'Failed to send test notification', 'error');
    }
  };

  const SettingItem = ({ 
    title, 
    description, 
    value, 
    onValueChange, 
    icon: Icon,
    disabled = false 
  }: {
    title: string;
    description: string;
    value: boolean;
    onValueChange: (value: boolean) => void;
    icon: any;
    disabled?: boolean;
  }) => (
    <View style={[styles.settingItem, disabled && styles.settingItemDisabled]}>
      <View style={styles.settingLeft}>
        <View style={[styles.settingIcon, { backgroundColor: value ? '#3B82F6' : '#E5E7EB' }]}>
          <Icon size={20} color={value ? '#FFFFFF' : '#9CA3AF'} />
        </View>
        <View style={styles.settingContent}>
          <Text style={[styles.settingTitle, disabled && styles.disabledText]}>{title}</Text>
          <Text style={[styles.settingDescription, disabled && styles.disabledText]}>{description}</Text>
        </View>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled || loading}
        trackColor={{ false: '#E5E7EB', true: '#3B82F6' }}
        thumbColor={value ? '#FFFFFF' : '#9CA3AF'}
      />
    </View>
  );

  return (
    <>
      <Modal
        visible={visible}
        onClose={onClose}
        title="Notification Settings"
        type="info"
      >
        <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
          {permissionStatus === 'denied' && (
            <View style={styles.permissionWarning}>
              <BellOff size={24} color="#EF4444" />
              <Text style={styles.permissionWarningText}>
                Push notifications are disabled. Enable them in device settings to receive updates.
              </Text>
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Booking Notifications</Text>
            <Text style={styles.sectionDescription}>
              Stay updated on your booking status and appointments
            </Text>
            
            <SettingItem
              title="Booking Updates"
              description="Get notified when bookings are confirmed, cancelled, or completed"
              value={settings.booking_updates}
              onValueChange={(value) => handleSettingChange('booking_updates', value)}
              icon={Bell}
              disabled={permissionStatus === 'denied'}
            />
            
            <SettingItem
              title="Appointment Reminders"
              description="Receive reminders before your scheduled appointments"
              value={settings.reminders}
              onValueChange={(value) => handleSettingChange('reminders', value)}
              icon={Bell}
              disabled={permissionStatus === 'denied'}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Sound & Vibration</Text>
            
            <SettingItem
              title="Sound"
              description="Play sound for notifications"
              value={settings.sound_enabled}
              onValueChange={(value) => handleSettingChange('sound_enabled', value)}
              icon={settings.sound_enabled ? Volume2 : VolumeX}
              disabled={permissionStatus === 'denied'}
            />
            
            <SettingItem
              title="Vibration"
              description="Vibrate for notifications"
              value={settings.vibration_enabled}
              onValueChange={(value) => handleSettingChange('vibration_enabled', value)}
              icon={Smartphone}
              disabled={permissionStatus === 'denied'}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Marketing</Text>
            
            <SettingItem
              title="Promotional Notifications"
              description="Receive updates about new features and offers"
              value={settings.promotional}
              onValueChange={(value) => handleSettingChange('promotional', value)}
              icon={Bell}
              disabled={permissionStatus === 'denied'}
            />
          </View>

          {permissionStatus === 'granted' && (
            <View style={styles.section}>
              <TouchableOpacity
                style={[styles.testButton, loading && styles.testButtonDisabled]}
                onPress={handleTestNotification}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Bell size={20} color="#FFFFFF" />
                    <Text style={styles.testButtonText}>Send Test Notification</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </Modal>

      <Modal
        visible={showAlert}
        onClose={() => setShowAlert(false)}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  permissionWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  permissionWarningText: {
    flex: 1,
    marginLeft: 12,
    fontSize: 14,
    color: '#DC2626',
    lineHeight: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  sectionDescription: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 16,
    lineHeight: 20,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  settingItemDisabled: {
    opacity: 0.5,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  settingContent: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 2,
  },
  settingDescription: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
  },
  disabledText: {
    color: '#9CA3AF',
  },
  testButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3B82F6',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginTop: 8,
  },
  testButtonDisabled: {
    opacity: 0.6,
  },
  testButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
});
