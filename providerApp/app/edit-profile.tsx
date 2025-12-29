import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Image,
  ActivityIndicator,
  Alert,
  Dimensions,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  BackHandler,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { SafeView } from '@/components/SafeView';
import { Modal } from '@/components/common/Modal';
import { ArrowLeft, Camera, Save, X, Trash2 } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { API_BASE_URL } from '@/constants/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { tokenManager } from '../utils/tokenManager';

// Responsive design utilities
const { width: screenWidth } = Dimensions.get('window');
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

export default function EditProfileScreen() {
  const { user, updateUser, logout } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();

  // Form state
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
  });
  const [nameChangeCount, setNameChangeCount] = useState(0);
  const [originalName, setOriginalName] = useState('');

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [profileImage, setProfileImage] = useState<string>('');
  const [hasChanges, setHasChanges] = useState(false);
  const [originalData, setOriginalData] = useState<any>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  
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

  useEffect(() => {
    if (user) {
      const initialData = {
        fullName: user.fullName || user.full_name || '',
        email: user.email || '',
      };
      setFormData(initialData);
      setOriginalData(initialData);
      setProfileImage(user.profile_pic_url || user.profilePicUrl || '');
      setOriginalName(initialData.fullName);
      setNameChangeCount(user.nameChangeCount || 0);
      
      // Fetch latest profile to get accurate nameChangeCount
      const fetchProfile = async () => {
        try {
          const { tokenManager } = await import('@/utils/tokenManager');
          const token = await tokenManager.getValidToken();
          if (!token) return;
          
          const response = await fetch(`${API_BASE_URL}/api/users/profile`, {
            headers: { 'Authorization': `Bearer ${token}` },
          });
          
          if (response.ok) {
            const data = await response.json();
            if (data.status === 'success' && data.data?.user) {
              const profileData = data.data.user;
              const fetchedCount = profileData.nameChangeCount !== undefined ? profileData.nameChangeCount : 0;
              setNameChangeCount(fetchedCount);
              
              // Update original name if different
              if (profileData.fullName && profileData.fullName !== initialData.fullName) {
                setOriginalName(profileData.fullName);
                setFormData(prev => ({ ...prev, fullName: profileData.fullName }));
              } else if (profileData.fullName) {
                // Ensure originalName is set even if it matches
                setOriginalName(profileData.fullName);
              }
            }
          }
        } catch (error) {
          console.error('Failed to fetch profile:', error);
          // Use user context data as fallback
          if (user?.nameChangeCount !== undefined) {
            setNameChangeCount(user.nameChangeCount);
          }
        }
      };
      
      fetchProfile();
    }
  }, [user]);

  useEffect(() => {
    // Check if there are changes
    if (originalData) {
      const changed = 
        formData.fullName !== originalData.fullName ||
        formData.email !== originalData.email ||
        profileImage !== (user?.profile_pic_url || user?.profilePicUrl || '');
      setHasChanges(changed);
    }
  }, [formData, profileImage, originalData, user]);

  // Handle Android back button
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (hasChanges) {
        showAlert(
          'Unsaved Changes',
          t('profile.unsavedChangesMessage'),
          'warning',
          [
            {
              text: 'Cancel',
              onPress: () => setShowAlertModal(false),
              style: 'secondary',
            },
            {
              text: 'Discard',
              style: 'destructive',
              onPress: () => {
                setShowAlertModal(false);
                router.back();
              },
            },
          ]
        );
      } else {
        router.back();
      }
      return true; // Prevent default back behavior
    });

    return () => backHandler.remove();
  }, [hasChanges]);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleProfilePictureAction = () => {
    Alert.alert(
      t('profile.changeProfilePicture'),
      '',
      [
        {
          text: t('common.cancel'),
          style: 'cancel',
        },
        {
          text: t('profile.takePhoto'),
          onPress: () => pickImage('camera'),
        },
        {
          text: t('profile.chooseFromGallery'),
          onPress: () => pickImage('gallery'),
        },
        ...(profileImage ? [{
          text: t('profile.removePhoto'),
          style: 'destructive' as const,
          onPress: () => setProfileImage(''),
        }] : []),
      ]
    );
  };

  const pickImage = async (source: 'camera' | 'gallery') => {
    try {
      setImageLoading(true);

      let result;
      if (source === 'camera') {
        const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
        if (permissionResult.granted === false) {
          showAlert('Error', t('profile.cameraPermissionDenied'), 'error', [
            { text: 'OK', onPress: () => setShowAlertModal(false), style: 'primary' }
          ]);
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
        });
      } else {
        const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (permissionResult.granted === false) {
          showAlert('Error', t('profile.galleryPermissionDenied'), 'error', [
            { text: 'OK', onPress: () => setShowAlertModal(false), style: 'primary' }
          ]);
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
        });
      }

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setProfileImage(asset.uri);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      showAlert('Error', t('profile.imagePickerError'), 'error', [
        { text: 'OK', onPress: () => setShowAlertModal(false), style: 'primary' }
      ]);
    } finally {
      setImageLoading(false);
    }
  };

  const uploadImageToCloudinary = async (imageUri: string): Promise<string> => {
    try {
      const formData = new FormData();
      formData.append('file', {
        uri: imageUri,
        type: 'image/jpeg',
        name: 'profile.jpg',
      } as any);
      formData.append('upload_preset', 'profile_pictures');

      const response = await fetch('https://api.cloudinary.com/v1_1/dqoizs0fu/image/upload', {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const data = await response.json();
      return data.secure_url;
    } catch (error) {
      console.error('Error uploading image:', error);
      throw error;
    }
  };

  const handleSave = async () => {
    // Get valid token using token manager
    const token = await tokenManager.getValidToken();
    if (!token) {
      showAlert(
        'Session Expired', 
        'Your session has expired. Please login again.',
        'error',
        [
          {
            text: 'OK',
            onPress: () => {
              setShowAlertModal(false);
              // Clear user data and redirect to login
              AsyncStorage.removeItem('token');
              AsyncStorage.removeItem('user');
              router.replace('/auth');
            },
            style: 'primary'
          }
        ]
      );
      return;
    }

    // Validation
    if (!formData.fullName.trim()) {
      showAlert('Error', t('profile.nameRequired'), 'error', [
        { text: 'OK', onPress: () => setShowAlertModal(false), style: 'primary' }
      ]);
      return;
    }

    if (!formData.email.trim()) {
      showAlert('Error', t('profile.emailRequired'), 'error', [
        { text: 'OK', onPress: () => setShowAlertModal(false), style: 'primary' }
      ]);
      return;
    }

    // Check name change limit before submitting
    const isNameChanging = formData.fullName.trim() !== originalName.trim();
    if (isNameChanging) {
      // Fetch latest name change count from backend to ensure accuracy
      try {
        const { tokenManager } = await import('@/utils/tokenManager');
        const currentToken = await tokenManager.getValidToken();
        if (currentToken) {
          const profileResponse = await fetch(`${API_BASE_URL}/api/users/profile`, {
            headers: { 'Authorization': `Bearer ${currentToken}` },
          });
          if (profileResponse.ok) {
            const profileData = await profileResponse.json();
            if (profileData.status === 'success' && profileData.data?.user) {
              const currentCount = profileData.data.user.nameChangeCount || 0;
              setNameChangeCount(currentCount);
              
              // Check limit with fresh count from backend
              if (currentCount >= 2) {
                showAlert(
                  'Name Change Limit Reached',
                  'You have reached the maximum limit of 2 name changes. Name changes are limited to prevent abuse.',
                  'error',
                  [{ text: 'OK', onPress: () => setShowAlertModal(false), style: 'primary' }]
                );
                return;
              }
            }
          }
        }
      } catch (error) {
        console.error('Error fetching current name change count:', error);
        // Fallback to local count if fetch fails
        if (nameChangeCount >= 2) {
          showAlert(
            'Name Change Limit Reached',
            'You have reached the maximum limit of 2 name changes. Name changes are limited to prevent abuse.',
            'error',
            [{ text: 'OK', onPress: () => setShowAlertModal(false), style: 'primary' }]
          );
          return;
        }
      }
    }


    try {
      setIsLoading(true);

      let profileImageUrl = profileImage;
      
      // Upload new image if it's a local URI
      if (profileImage && profileImage.startsWith('file://')) {
        profileImageUrl = await uploadImageToCloudinary(profileImage);
      }

      // Prepare update data for user profile
      const updateData = {
        fullName: formData.fullName.trim(),
        email: formData.email.trim(),
        ...(profileImageUrl && { profilePicUrl: profileImageUrl }),
      };

      // Update user profile via API (this updates the users table)
      const response = await fetch(`${API_BASE_URL}/api/users/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(updateData),
      });

      const responseText = await response.text();

      if (response.ok) {
        const responseData = JSON.parse(responseText);
        const updatedUserData = responseData.data?.user || {};
        
        // Get the updated name change count from backend response
        // Backend returns the actual updated count after incrementing
        const updatedNameChangeCount = updatedUserData.nameChangeCount !== undefined 
          ? updatedUserData.nameChangeCount 
          : (formData.fullName.trim() !== originalName.trim() ? nameChangeCount + 1 : nameChangeCount);

        // Update local user data
        const updatedUser = {
          ...user,
          fullName: formData.fullName.trim(),
          full_name: formData.fullName.trim(),
          email: formData.email.trim(),
          profile_pic_url: profileImageUrl,
          profilePicUrl: profileImageUrl,
          nameChangeCount: updatedNameChangeCount,
        };

        await updateUser(updatedUser);
        await AsyncStorage.setItem('user', JSON.stringify(updatedUser));

        // Update name change tracking - always update if name changed
        if (formData.fullName.trim() !== originalName.trim()) {
          setNameChangeCount(updatedNameChangeCount);
          setOriginalName(formData.fullName.trim());
        } else {
          // Name didn't change, but still update count from backend in case it was fetched
          if (updatedUserData.nameChangeCount !== undefined) {
            setNameChangeCount(updatedUserData.nameChangeCount);
          }
        }

        showAlert(
          'Success',
          t('profile.profileUpdatedSuccessfully'),
          'success',
          [
            {
              text: 'OK',
              onPress: () => {
                setShowAlertModal(false);
                router.back();
              },
              style: 'primary',
            },
          ]
        );
      } else {
        let errorData;
        try {
          errorData = JSON.parse(responseText);
        } catch (e) {
          errorData = { message: responseText || 'Unknown error' };
        }
        console.error('Profile update failed:', errorData);
        
        // Handle specific error cases
        if (errorData.message && errorData.message.includes('name change limit')) {
          showAlert(
            'Name Change Limit Reached',
            'You have reached the maximum limit of 2 name changes. Name changes are limited to prevent abuse.',
            'error',
            [{ text: 'OK', onPress: () => setShowAlertModal(false), style: 'primary' }]
          );
        } else if (errorData.message && errorData.message.includes('Email already taken')) {
          showAlert(
            'Error', 
            'This email address is already in use by another account. Please use a different email address.',
            'error',
            [{ text: 'OK', onPress: () => setShowAlertModal(false), style: 'primary' }]
          );
        } else {
          showAlert('Error', errorData.message || t('profile.updateFailed'), 'error', [
            { text: 'OK', onPress: () => setShowAlertModal(false), style: 'primary' }
          ]);
        }
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      showAlert('Error', t('profile.updateFailed'), 'error', [
        { text: 'OK', onPress: () => setShowAlertModal(false), style: 'primary' }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    if (hasChanges) {
      showAlert(
        'Unsaved Changes',
        t('profile.unsavedChangesMessage'),
        'warning',
        [
          {
            text: 'Cancel',
            onPress: () => setShowAlertModal(false),
            style: 'secondary',
          },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => {
              setShowAlertModal(false);
              router.back();
            },
          },
        ]
      );
    } else {
      router.back();
    }
  };

  const handleDeleteAccount = async () => {
    showAlert(
      t('alerts.deleteAccount'),
      t('alerts.deleteAccountMessage'),
      'warning',
      [
        {
          text: t('alerts.cancel'),
          onPress: () => setShowAlertModal(false),
          style: 'secondary',
        },
        {
          text: t('alerts.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              setShowAlertModal(false);
              setDeleteLoading(true);
              const token = await tokenManager.getValidToken();
              if (!token) {
                setDeleteLoading(false);
                showAlert(t('alerts.error'), t('alerts.noAuthToken'), 'error');
                return;
              }
              const response = await fetch(`${API_BASE_URL}/api/users/delete-account`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
              });
              if (response.ok) {
                await logout();
                setDeleteLoading(false);
                showAlert(
                  t('alerts.accountDeleted'),
                  t('alerts.accountDeletedMessage'),
                  'success',
                  [
                    {
                      text: 'OK',
                      onPress: () => {
                        setShowAlertModal(false);
                        // Navigate to root index which will handle auth redirect and prevent back navigation
                        router.replace('/');
                      },
                      style: 'primary',
                    },
                  ]
                );
              } else {
                const data = await response.json();
                setDeleteLoading(false);
                showAlert(t('alerts.error'), data.message || t('alerts.failedToDeleteAccount'), 'error');
              }
            } catch (error) {
              setDeleteLoading(false);
              showAlert(t('alerts.error'), t('alerts.failedToDeleteAccount'), 'error');
            }
          },
        },
      ]
    );
  };

  return (
    <SafeView backgroundColor="#F8FAFC">
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleCancel} style={styles.backButton}>
          <ArrowLeft size={24} color="#374151" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('profile.editProfile')}</Text>
        <TouchableOpacity 
          onPress={handleSave} 
          disabled={!hasChanges || isLoading}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#3B82F6" />
          ) : (
            <Text style={[styles.saveButton, !hasChanges && styles.saveButtonDisabled]}>
              Save
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView 
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView 
          style={styles.container} 
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
        {/* Profile Picture Section */}
        <View style={styles.profilePictureSection}>
          <View style={styles.profileImageContainer}>
            {profileImage ? (
              <Image source={{ uri: profileImage }} style={styles.profileImage} />
            ) : (
              <View style={[styles.profileImage, styles.placeholderImage]}>
                <Text style={styles.placeholderText}>
                  {formData.fullName ? formData.fullName.charAt(0).toUpperCase() : 'P'}
                </Text>
              </View>
            )}
            {imageLoading && (
              <View style={styles.imageLoadingOverlay}>
                <ActivityIndicator size="small" color="#3B82F6" />
              </View>
            )}
            <TouchableOpacity style={styles.cameraButton} onPress={handleProfilePictureAction}>
              <Camera size={16} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
          <Text style={styles.profilePictureLabel}>{t('profile.profilePicture')}</Text>
        </View>

        {/* Form Fields */}
        <View style={styles.formSection}>
          {/* Full Name */}
          <View style={styles.inputGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.inputLabel}>{t('editProfile.fullName')} *</Text>
              {(() => {
                const isNameChanging = formData.fullName.trim() !== originalName.trim();
                const remaining = Math.max(0, 2 - nameChangeCount);
                
                if (nameChangeCount >= 2 && isNameChanging) {
                  return (
                    <Text style={styles.warningText}>
                      Limit reached (2/2)
                    </Text>
                  );
                } else if (nameChangeCount < 2 && isNameChanging) {
                  return (
                    <Text style={styles.infoText}>
                      {t('editProfile.nameChangesRemaining', { count: remaining })}
                    </Text>
                  );
                }
                return null;
              })()}
            </View>
            <TextInput
              style={[
                styles.textInput,
                nameChangeCount >= 2 && formData.fullName.trim() !== originalName.trim() && styles.disabledInput
              ]}
              value={formData.fullName}
              onChangeText={(value) => {
                // Prevent changes if limit reached and name is different from original
                const isChanging = value.trim() !== originalName.trim();
                if (nameChangeCount >= 2 && originalName.trim() !== '' && isChanging) {
                  // Reset to original name if trying to change beyond limit
                  showAlert(
                    'Name Change Limit Reached',
                    t('editProfile.nameChangeLimitMessage') || 'You have reached the maximum limit of 2 name changes. Name changes are limited to prevent abuse.',
                    'error',
                    [{ 
                      text: 'OK', 
                      onPress: () => {
                        setShowAlertModal(false);
                        // Reset to original name
                        handleInputChange('fullName', originalName);
                      }, 
                      style: 'primary' 
                    }]
                  );
                  return;
                }
                handleInputChange('fullName', value);
              }}
              placeholder={t('editProfile.fullNamePlaceholder')}
              placeholderTextColor="#9CA3AF"
              editable={!(nameChangeCount >= 2 && formData.fullName.trim() !== originalName.trim())}
            />
            {nameChangeCount >= 2 && (
              <Text style={styles.limitReachedText}>
                {t('editProfile.nameChangeLimitMessage') || 'You have used all 2 name changes. You cannot change your name again.'}
              </Text>
            )}
          </View>

          {/* Email */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>{t('editProfile.email')} *</Text>
            <TextInput
              style={styles.textInput}
              value={formData.email}
              onChangeText={(value) => handleInputChange('email', value)}
              placeholder={t('editProfile.emailPlaceholder')}
              placeholderTextColor="#9CA3AF"
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          {/* Read-only Phone Display */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>{t('editProfile.phoneNumber')}</Text>
            <View style={[styles.textInput, styles.readOnlyInput]}>
              <Text style={styles.readOnlyText}>{user?.phone || 'N/A'}</Text>
            </View>
            <Text style={styles.readOnlyNote}>{t('editProfile.phoneDisabled')}</Text>
          </View>

          {/* Delete Account Section */}
          <View style={styles.deleteAccountSection}>
            <TouchableOpacity 
              style={[styles.deleteAccountButton, deleteLoading && styles.deleteAccountButtonDisabled]} 
              onPress={handleDeleteAccount}
              disabled={deleteLoading}
            >
              {deleteLoading ? (
                <ActivityIndicator size="small" color="#EF4444" style={{ marginRight: 10 }} />
              ) : (
                <Trash2 size={20} color="#EF4444" style={{ marginRight: 10 }} />
              )}
              <Text style={styles.deleteAccountButtonText}>
                {deleteLoading ? 'Deleting Account...' : t('profile.deleteAccount')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Alert Modal */}
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
    justifyContent: 'space-between',
    paddingHorizontal: getResponsiveSpacing(16, 18, 20),
    paddingVertical: getResponsiveSpacing(12, 14, 16),
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: getResponsiveFontSize(18, 20, 22),
    fontFamily: 'Inter-SemiBold',
    color: '#111827',
  },
  saveButton: {
    fontSize: getResponsiveFontSize(14, 16, 18),
    fontWeight: '600',
    color: '#3B82F6',
  },
  saveButtonDisabled: {
    color: '#9CA3AF',
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 50,
  },
  profilePictureSection: {
    alignItems: 'center',
    paddingVertical: getResponsiveSpacing(24, 28, 32),
    backgroundColor: '#FFFFFF',
    marginBottom: 16,
  },
  profileImageContainer: {
    position: 'relative',
    marginBottom: 12,
  },
  profileImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  placeholderImage: {
    backgroundColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 48,
    fontFamily: 'Inter-Bold',
    color: '#6B7280',
  },
  imageLoadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 60,
  },
  cameraButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#3B82F6',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  profilePictureLabel: {
    fontSize: getResponsiveFontSize(14, 15, 16),
    fontFamily: 'Inter-Medium',
    color: '#6B7280',
  },
  formSection: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: getResponsiveSpacing(16, 18, 20),
    paddingVertical: getResponsiveSpacing(20, 24, 28),
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  inputGroup: {
    marginBottom: getResponsiveSpacing(16, 18, 20),
  },
  inputLabel: {
    fontSize: getResponsiveFontSize(14, 15, 16),
    fontFamily: 'Inter-Medium',
    color: '#374151',
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: getResponsiveSpacing(12, 14, 16),
    paddingVertical: getResponsiveSpacing(12, 14, 16),
    fontSize: getResponsiveFontSize(14, 15, 16),
    fontFamily: 'Inter-Regular',
    color: '#111827',
    backgroundColor: '#FFFFFF',
  },
  readOnlyInput: {
    backgroundColor: '#F3F4F6',
    borderColor: '#D1D5DB',
  },
  readOnlyText: {
    fontSize: getResponsiveFontSize(14, 15, 16),
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
  },
  disabledInput: {
    backgroundColor: '#F1F5F9',
    color: '#64748B',
  },
  warningText: {
    fontSize: 12,
    color: '#EF4444',
    fontWeight: '500',
  },
  infoText: {
    fontSize: 12,
    color: '#3B82F6',
    fontWeight: '500',
  },
  limitReachedText: {
    fontSize: 11,
    color: '#EF4444',
    marginTop: 6,
    fontStyle: 'italic',
  },
  readOnlyNote: {
    fontSize: getResponsiveFontSize(12, 13, 14),
    fontFamily: 'Inter-Regular',
    color: '#9CA3AF',
    marginTop: 4,
    fontStyle: 'italic',
  },
  deleteAccountSection: {
    marginTop: getResponsiveSpacing(24, 28, 32),
    paddingTop: getResponsiveSpacing(20, 24, 28),
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  deleteAccountButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF2F2',
    paddingVertical: getResponsiveSpacing(14, 16, 18),
    borderRadius: getResponsiveSpacing(10, 12, 14),
  },
  deleteAccountButtonDisabled: {
    opacity: 0.6,
    backgroundColor: '#F9FAFB',
  },
  deleteAccountButtonText: {
    fontSize: getResponsiveFontSize(14, 16, 18),
    fontWeight: '500',
    color: '#EF4444',
  },
});
