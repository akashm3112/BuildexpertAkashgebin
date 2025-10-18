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
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { SafeView } from '@/components/SafeView';
import { ArrowLeft, Camera, Save, X } from 'lucide-react-native';
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
  const { user, updateUser } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();

  // Form state
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
  });

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [profileImage, setProfileImage] = useState<string>('');
  const [hasChanges, setHasChanges] = useState(false);
  const [originalData, setOriginalData] = useState<any>(null);

  useEffect(() => {
    if (user) {
      const initialData = {
        fullName: user.fullName || user.full_name || '',
        email: user.email || '',
      };
      setFormData(initialData);
      setOriginalData(initialData);
      setProfileImage(user.profile_pic_url || user.profilePicUrl || '');
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
          Alert.alert('Error', t('profile.cameraPermissionDenied'));
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
          Alert.alert('Error', t('profile.galleryPermissionDenied'));
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
      Alert.alert('Error', t('profile.imagePickerError'));
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
      Alert.alert(
        'Session Expired', 
        'Your session has expired. Please login again.',
        [
          {
            text: 'OK',
            onPress: () => {
              // Clear user data and redirect to login
              AsyncStorage.removeItem('token');
              AsyncStorage.removeItem('user');
              router.replace('/auth');
            }
          }
        ]
      );
      return;
    }

    // Validation
    if (!formData.fullName.trim()) {
      Alert.alert('Error', t('profile.nameRequired'));
      return;
    }

    if (!formData.email.trim()) {
      Alert.alert('Error', t('profile.emailRequired'));
      return;
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

      console.log('Sending update data:', updateData);

      // Update user profile via API
      const response = await fetch(`${API_BASE_URL}/api/users/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(updateData),
      });

      console.log('Response status:', response.status);
      const responseText = await response.text();
      console.log('Response body:', responseText);

      if (response.ok) {
        const responseData = JSON.parse(responseText);
        console.log('Profile updated successfully:', responseData);

        // Update local user data
        const updatedUser = {
          ...user,
          fullName: formData.fullName.trim(),
          full_name: formData.fullName.trim(),
          email: formData.email.trim(),
          profile_pic_url: profileImageUrl,
          profilePicUrl: profileImageUrl,
        };

        await updateUser(updatedUser);
        await AsyncStorage.setItem('user', JSON.stringify(updatedUser));

        Alert.alert(
          'Success',
          t('profile.profileUpdatedSuccessfully'),
          [
            {
              text: 'OK',
              onPress: () => router.back(),
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
        if (errorData.message && errorData.message.includes('Email already taken')) {
          Alert.alert(
            'Error', 
            'This email address is already in use by another account. Please use a different email address.',
            [{ text: 'OK' }]
          );
        } else {
          Alert.alert('Error', errorData.message || t('profile.updateFailed'));
        }
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      Alert.alert('Error', t('profile.updateFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    if (hasChanges) {
      Alert.alert(
        'Unsaved Changes',
        t('profile.unsavedChangesMessage'),
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => router.back(),
          },
        ]
      );
    } else {
      router.back();
    }
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
          style={[styles.saveButton, !hasChanges && styles.saveButtonDisabled]}
          disabled={!hasChanges || isLoading}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Save size={20} color="#FFFFFF" />
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
            <Text style={styles.inputLabel}>{t('profile.fullName')} *</Text>
            <TextInput
              style={styles.textInput}
              value={formData.fullName}
              onChangeText={(value) => handleInputChange('fullName', value)}
              placeholder={t('profile.enterFullName')}
              placeholderTextColor="#9CA3AF"
            />
          </View>

          {/* Email */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>{t('profile.email')} *</Text>
            <TextInput
              style={styles.textInput}
              value={formData.email}
              onChangeText={(value) => handleInputChange('email', value)}
              placeholder={t('profile.enterEmail')}
              placeholderTextColor="#9CA3AF"
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          {/* Read-only Phone Display */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>{t('profile.phoneNumber')}</Text>
            <View style={[styles.textInput, styles.readOnlyInput]}>
              <Text style={styles.readOnlyText}>{user?.phone || 'N/A'}</Text>
            </View>
            <Text style={styles.readOnlyNote}>{t('profile.phoneReadOnly')}</Text>
          </View>
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
    backgroundColor: '#3B82F6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  saveButtonDisabled: {
    backgroundColor: '#9CA3AF',
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
  readOnlyNote: {
    fontSize: getResponsiveFontSize(12, 13, 14),
    fontFamily: 'Inter-Regular',
    color: '#9CA3AF',
    marginTop: 4,
    fontStyle: 'italic',
  },
});
