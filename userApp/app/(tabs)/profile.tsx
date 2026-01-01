import React, { useState, useEffect, useMemo } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { 
  View, 
  Text, 
  StyleSheet, 
  Image, 
  TouchableOpacity, 
  ScrollView, 
  Alert,
  Switch,
  Modal as RNModal,
  TextInput,
  Platform,
  Dimensions,
  ActivityIndicator,
  RefreshControl,
  BackHandler,
  Share,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronRight, MapPin, CreditCard, Bell, CircleHelp as HelpCircle, LogOut, CreditCard as Edit3, Camera, Star, Gift, Users, FileText, X, ArrowLeft, Trash2, Lock, Eye, EyeOff, Smartphone, Mail, UserCheck, Globe, Share2, MessageCircle, Instagram, ExternalLink, Phone } from 'lucide-react-native';
import { Modal } from '@/components/common/Modal';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/context/NotificationContext';
import { useLanguage } from '@/context/LanguageContext';
import enTranslations from '@/i18n/locales/en';
import hiTranslations from '@/i18n/locales/hi';
import knTranslations from '@/i18n/locales/kn';
import taTranslations from '@/i18n/locales/ta';
import teTranslations from '@/i18n/locales/te';
import mlTranslations from '@/i18n/locales/ml';
import { API_BASE_URL } from '@/constants/api';
import { SafeView } from '@/components/SafeView';
import NotificationSettings from '@/components/NotificationSettings';

// Default profile image (consistent with backend)
const DEFAULT_PROFILE_IMAGE = 'https://res.cloudinary.com/dqoizs0fu/raw/upload/v1756189484/profile-pictures/m3szbez4bzvwh76j1fle';
const PLAY_STORE_LINK = 'https://play.google.com/store/apps/details?id=com.builtxpert.user';
const APP_STORE_LINK = 'https://apps.apple.com/app/builtxpert/id1234567890'; // Update with actual App Store ID when available

// Responsive design constants
const SCREEN_HEIGHT = Dimensions.get('window').height;
const SCREEN_WIDTH = Dimensions.get('window').width;

// Responsive spacing
const getResponsiveSpacing = (small: number, medium: number, large: number) => {
  if (SCREEN_WIDTH < 375) return small;
  if (SCREEN_WIDTH < 768) return medium;
  return large;
};

// Responsive font sizes
const getResponsiveFontSize = (small: number, medium: number, large: number) => {
  if (SCREEN_WIDTH < 375) return small;
  if (SCREEN_WIDTH < 768) return medium;
  return large;
};

// Responsive image sizes
const getResponsiveImageSize = (small: number, medium: number, large: number) => {
  if (SCREEN_WIDTH < 375) return small;
  if (SCREEN_WIDTH < 768) return medium;
  return large;
};

export default function ProfileScreen() {
  const { user, logout, updateUser } = useAuth();
  const { unreadCount } = useNotifications();
  const { t, currentLanguageName, setLanguage, availableLanguages, currentLanguage } = useLanguage();
  const router = useRouter();
  
  // Helper function to get array translations
  const getArrayTranslation = (key: string): string[] => {
    try {
      const keys = key.split('.');
      const translationMap: Record<string, any> = {
        en: enTranslations,
        hi: hiTranslations,
        kn: knTranslations,
        ta: taTranslations,
        te: teTranslations,
        ml: mlTranslations,
      };
      
      let value: any = translationMap[currentLanguage] || enTranslations;
      
      for (const k of keys) {
        if (value && typeof value === 'object' && k in value) {
          value = value[k];
        } else {
          // Fallback to English
          value = enTranslations;
          for (const fallbackKey of keys) {
            if (value && typeof value === 'object' && fallbackKey in value) {
              value = value[fallbackKey];
            } else {
              return [];
            }
          }
          break;
        }
      }
      
      return Array.isArray(value) ? value : [];
    } catch (error) {
      return [];
    }
  };

  // Memoize arrays for Terms & Privacy modal to ensure they're always arrays
  const userResponsibilitiesList = useMemo(() => {
    return getArrayTranslation('termsPrivacy.userResponsibilitiesList');
  }, [currentLanguage, currentLanguageName]);

  const informationWeCollectList = useMemo(() => {
    return getArrayTranslation('termsPrivacy.informationWeCollectList');
  }, [currentLanguage, currentLanguageName]);

  const howWeUseInfoList = useMemo(() => {
    return getArrayTranslation('termsPrivacy.howWeUseInfoList');
  }, [currentLanguage, currentLanguageName]);

  const dataSecurityList = useMemo(() => {
    return getArrayTranslation('termsPrivacy.dataSecurityList');
  }, [currentLanguage, currentLanguageName]);

  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [privacyModalVisible, setPrivacyModalVisible] = useState(false);
  const [termsModalVisible, setTermsModalVisible] = useState(false);
  const [languageModalVisible, setLanguageModalVisible] = useState(false);
  const [notificationSettingsVisible, setNotificationSettingsVisible] = useState(false);
  const [rateModalVisible, setRateModalVisible] = useState(false);
  const [supportModalVisible, setSupportModalVisible] = useState(false);
  const [referModalVisible, setReferModalVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState<{
    title: string;
    message: string;
    type: 'success' | 'error' | 'info' | 'warning';
    buttons?: { text: string; onPress: () => void; style?: 'primary' | 'secondary' | 'destructive' }[];
  }>({
    title: '',
    message: '',
    type: 'info',
  });
  const [userProfile, setUserProfile] = useState({
    name: '',
    email: '',
    phone: '',
    location: '',
    image: '',
  });
  const [nameChangeCount, setNameChangeCount] = useState(0);
  const [originalName, setOriginalName] = useState('');
  const [imageLoading, setImageLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [bookingsCount, setBookingsCount] = useState(0);
  const [averageRating, setAverageRating] = useState(0);
  const [totalReviews, setTotalReviews] = useState(0);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState(false);
  const [dimensions, setDimensions] = useState(Dimensions.get('window'));
  const [refreshing, setRefreshing] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  // Handle Android hardware back button to close active overlays
  useEffect(() => {
    const handleHardwareBack = () => {
      if (showAlertModal) {
        setShowAlertModal(false);
        return true;
      }
      if (notificationSettingsVisible) {
        setNotificationSettingsVisible(false);
        return true;
      }
      if (languageModalVisible) {
        setLanguageModalVisible(false);
        return true;
      }
      if (termsModalVisible) {
        setTermsModalVisible(false);
        return true;
      }
      if (privacyModalVisible) {
        setPrivacyModalVisible(false);
        return true;
      }
      if (referModalVisible) {
        setReferModalVisible(false);
        return true;
      }
      if (rateModalVisible) {
        setRateModalVisible(false);
        return true;
      }
      if (supportModalVisible) {
        setSupportModalVisible(false);
        return true;
      }
      if (editModalVisible) {
        setEditModalVisible(false);
        return true;
      }
      return false;
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', handleHardwareBack);
    return () => subscription.remove();
  }, [
    editModalVisible,
    privacyModalVisible,
    termsModalVisible,
    languageModalVisible,
    notificationSettingsVisible,
    referModalVisible,
    rateModalVisible,
    supportModalVisible,
    showAlertModal,
  ]);

  // Privacy & Security Settings
  const [privacySettings, setPrivacySettings] = useState({
    profileVisibility: true,
    locationSharing: false,
    dataAnalytics: true,
    marketingEmails: false,
    pushNotifications: true,
    biometricAuth: false,
    twoFactorAuth: false,
  });

  useEffect(() => {
    const initializeProfile = async () => {
      // Load cached image first for instant display
      const cachedImage = await loadCachedProfileImage();
      
      fetchUserProfile();
      fetchBookingsStats();
      
      if (!user) {
        router.replace('/(auth)/login');
      } else {
        // Initialize userProfile with user context data
        const initialImage = user.profile_pic_url || '';
        
        setUserProfile((prev) => ({
          ...prev,
          name: user.full_name || '',
          email: user.email || '',
          phone: user.phone || '',
          image: initialImage,
        }));
        
        // If we have a cached image, use it immediately
        if (cachedImage && !initialImage) {
          setUserProfile((prev) => ({
            ...prev,
            image: cachedImage,
          }));
        }
      }
    };
    
    initializeProfile();
    
    // Listen for dimension changes (orientation, etc.)
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      setDimensions(window);
    });
    
    return () => {
      subscription?.remove();
    };
  }, [user]);

  // Refresh profile data when user data changes
  useEffect(() => {
    if (user) {
      fetchUserProfile();
    }
  }, [user?.profile_pic_url]);

  // Cache profile image URL
  const [cachedImageUrl, setCachedImageUrl] = useState<string>('');
  const [imageLoadTimeout, setImageLoadTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);

  // Cache profile image URL in AsyncStorage
  const cacheProfileImage = async (imageUrl: string) => {
    try {
      await AsyncStorage.setItem('cached_profile_image', imageUrl);
      setCachedImageUrl(imageUrl);
    } catch (error) {
    }
  };

  // Load cached profile image
  const loadCachedProfileImage = async () => {
    try {
      const cached = await AsyncStorage.getItem('cached_profile_image');
      if (cached) {
        setCachedImageUrl(cached);
        return cached;
      }
    } catch (error) {
    }
    return null;
  };

  useEffect(() => {
    // Cache the image URL when it changes
    if (userProfile.image && userProfile.image.trim() !== '') {
      cacheProfileImage(userProfile.image);
    }
  }, [userProfile]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (imageLoadTimeout) {
        clearTimeout(imageLoadTimeout);
      }
    };
  }, [imageLoadTimeout]);

  // Handle profile picture actions
  const handleProfilePictureAction = () => {
    if (userProfile.image && userProfile.image.trim() !== '') {
      // Show options to update or delete existing picture
      showAlert(
        t('profile.pictureOptions.title'),
        t('profile.pictureOptions.message'),
        'info',
        [
          { text: t('profile.pictureOptions.cancel'), onPress: () => setShowAlertModal(false), style: 'secondary' },
          { text: t('profile.pictureOptions.update'), onPress: () => { setShowAlertModal(false); handleTakePhoto(); }, style: 'primary' },
          { text: t('profile.pictureOptions.delete'), onPress: () => { setShowAlertModal(false); handleDeleteProfilePicture(); }, style: 'destructive' }
        ]
      );
    } else {
      // Show options to add new picture
      showAlert(
        t('profile.addPicture.title'),
        t('profile.addPicture.message'),
        'info',
        [
          { text: t('profile.addPicture.cancel'), onPress: () => setShowAlertModal(false), style: 'secondary' },
          { text: t('profile.addPicture.takePhoto'), onPress: () => { setShowAlertModal(false); handleTakePhoto(); }, style: 'primary' },
          { text: t('profile.addPicture.chooseGallery'), onPress: () => { setShowAlertModal(false); handleChooseFromGallery(); }, style: 'primary' }
        ]
      );
    }
  };

  const handleTakePhoto = async () => {
    try {
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      if (permissionResult.granted === false) {
        showAlert('Camera Access Required', 'Please allow camera access in your device settings to take a photo', 'error');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        await uploadProfilePicture(result.assets[0].uri);
      }
    } catch (error) {
      showAlert('Unable to Take Photo', 'Something went wrong. Please try again', 'error');
    }
  };

  const handleChooseFromGallery = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permissionResult.granted === false) {
        showAlert('Gallery Access Required', 'Please allow gallery access in your device settings to select a photo', 'error');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        await uploadProfilePicture(result.assets[0].uri);
      }
    } catch (error) {
      showAlert('Unable to Select Photo', 'Something went wrong. Please try again', 'error');
    }
  };

  const uploadProfilePicture = async (imageUri: string) => {
    try {
      showAlert('Uploading Photo', 'Please wait while we update your profile picture', 'info');
      
      const token = await AsyncStorage.getItem('token');
      if (!token) {
        showAlert('Session Expired', 'Please sign in again to continue', 'error');
        return;
      }

      const optimizedImage = await ImageManipulator.manipulateAsync(
        imageUri,
        [{ resize: { width: 1080 } }],
        { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );

      if (!optimizedImage.base64) {
        showAlert('Unable to Process Photo', 'Please try selecting a different image', 'error');
        return;
      }

      // Optimistic preview while upload is in progress
      if (optimizedImage.uri) {
        setUserProfile(prev => ({ ...prev, image: optimizedImage.uri }));
      }

      const payload = `data:image/jpeg;base64,${optimizedImage.base64}`;

      const uploadResponse = await fetch(`${API_BASE_URL}/api/users/profile`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          profilePicUrl: payload,
        }),
      });

      if (uploadResponse.ok) {
        const data = await uploadResponse.json();
        
        let newImageUrl = '';
        if (data.data && data.data.user && data.data.user.profilePicUrl) {
          newImageUrl = data.data.user.profilePicUrl;
        } else if (data.data && data.data.user && data.data.user.profile_pic_url) {
          newImageUrl = data.data.user.profile_pic_url;
        } else if (data.user && data.user.profilePicUrl) {
          newImageUrl = data.user.profilePicUrl;
        } else if (data.user && data.user.profile_pic_url) {
          newImageUrl = data.user.profile_pic_url;
        }


        if (newImageUrl) {
          setUserProfile(prev => ({ ...prev, image: newImageUrl }));
          await cacheProfileImage(newImageUrl);

          if (user) {
            await updateUser({ profile_pic_url: newImageUrl });
          }

          showAlert('Profile Picture Updated', 'Your profile picture has been updated successfully', 'success');
        } else {
          showAlert('Update Unsuccessful', 'Unable to save your profile picture. Please try again', 'error');
        }
      } else {
        const errorData = await uploadResponse.json();
        showAlert('Update Unsuccessful', errorData.message || 'Unable to update your profile picture. Please try again', 'error');
      }
    } catch (error) {
      showAlert('Upload Unsuccessful', 'Unable to upload your profile picture. Please check your connection and try again', 'error');
    }
  };

  const handleDeleteProfilePicture = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) {
        showAlert('Session Expired', 'Please sign in again to continue', 'error');
        return;
      }

      // Clear profile picture in backend
      const response = await fetch(`${API_BASE_URL}/api/users/profile`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          profilePicUrl: '',
        }),
      });

      if (response.ok) {
        // Clear local state and cache
        setUserProfile(prev => ({ ...prev, image: '' }));
        await AsyncStorage.removeItem('cached_profile_image');
        setCachedImageUrl('');
        
        // Update user context to clear profile picture
        if (user) {
          await updateUser({ profile_pic_url: '' });
        }
        
        showAlert('Profile Picture Removed', 'Your profile picture has been removed successfully', 'success');
      } else {
        const errorData = await response.json();
        showAlert('Unable to Remove Photo', errorData.message || 'Something went wrong. Please try again', 'error');
      }
    } catch (error) {
      showAlert('Unable to Remove Photo', 'Please check your connection and try again', 'error');
    }
  };

  const fetchUserProfile = async () => {
    try {
      let token = await AsyncStorage.getItem('token');
      if (!token) {
        // Use user context data as fallback
        if (user) {
          const fallbackImage = user.profile_pic_url || '';
          
          setUserProfile((prev) => ({
            ...prev,
            name: user.full_name || '',
            email: user.email || '',
            phone: user.phone || '',
            image: fallbackImage,
          }));
        }
        return;
      }
      
      
      // Fetch user profile
      const profileRes = await fetch(`${API_BASE_URL}/api/users/profile`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const profileData = await profileRes.json();
      
      
      if (profileRes.ok && profileData.status === 'success') {
        // Handle different response structures
        const userData = profileData.data?.user || profileData.data || {};
        const profilePicUrl = userData.profilePicUrl || userData.profile_pic_url || '';
        const fullName = userData.fullName || userData.full_name || '';
        const changeCount = userData.nameChangeCount !== undefined ? userData.nameChangeCount : 0;
        
        
        setUserProfile((prev) => ({
          ...prev,
          name: fullName,
          email: userData.email || '',
          phone: userData.phone || '',
          image: profilePicUrl,
        }));
        setNameChangeCount(changeCount);
        setOriginalName(fullName);
      } else {
        // If profile fetch fails, use user data from context as fallback
        if (user) {
          const fallbackImage = user.profile_pic_url || '';
          
          setUserProfile((prev) => ({
            ...prev,
            name: user.full_name || '',
            email: user.email || '',
            phone: user.phone || '',
            image: fallbackImage,
          }));
        }
      }
      
      // Fetch user addresses
      const addressRes = await fetch(`${API_BASE_URL}/api/users/addresses`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const addressData = await addressRes.json();
      if (addressRes.ok && addressData.status === 'success' && addressData.data.addresses.length > 0) {
        // Use the first address (or preferred type)
        const addr = addressData.data.addresses[0];
        setUserProfile((prev) => ({ ...prev, location: addr.full_address }));
      }
    } catch (err) {
      // Fallback: use user data from context
      if (user) {
        setUserProfile((prev) => ({
          ...prev,
          name: user.full_name || '',
          email: user.email || '',
          phone: user.phone || '',
          image: user.profile_pic_url || '',
        }));
      }
    }
  };

  const fetchBookingsStats = async () => {
    try {
      setStatsLoading(true);
      let token = await AsyncStorage.getItem('token');
      if (!token) {
        setStatsLoading(false);
        return;
      }
      
      const response = await fetch(`${API_BASE_URL}/api/bookings`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      const data = await response.json();
      
      if (response.ok && data.status === 'success') {
        // Handle different response structures
        const bookings = data.data?.bookings || [];
        const pagination = data.data?.pagination || {};
        const totalBookings = pagination.total || bookings.length || 0;
        
        setBookingsCount(totalBookings);
        
        // Calculate ratings and reviews from bookings
        let ratingsSum = 0;
        let ratingsCount = 0;
        bookings.forEach((b: any) => {
          if (b.rating && b.rating.rating) {
            ratingsSum += b.rating.rating;
            ratingsCount++;
          }
        });
        
        setTotalReviews(ratingsCount);
        setAverageRating(ratingsCount > 0 ? (ratingsSum / ratingsCount) : 0);
      } else {
        // Set default values on failure
        setBookingsCount(0);
        setTotalReviews(0);
        setAverageRating(0);
      }
    } catch (err) {
      // Set default values on error
      setBookingsCount(0);
      setTotalReviews(0);
      setAverageRating(0);
      setStatsError(true);
    } finally {
      setStatsLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      // Refresh all profile data
      await Promise.all([
        fetchUserProfile(),
        fetchBookingsStats(),
      ]);
    } catch (error) {
      // Error refreshing profile data
    } finally {
      setRefreshing(false);
    }
  };

  const showAlert = (title: string, message: string, type: 'success' | 'error' | 'info' | 'warning', buttons?: { text: string; onPress: () => void; style?: 'primary' | 'secondary' | 'destructive' }[]) => {
    setAlertConfig({ title, message, type, buttons });
    setShowAlertModal(true);
  };

  const handleLogout = () => {
    showAlert(
      t('alerts.logout.title'),
      t('alerts.logout.message'),
      'warning',
      [
        { text: t('alerts.logout.cancel'), onPress: () => setShowAlertModal(false), style: 'secondary' },
        { text: t('alerts.logout.confirm'), onPress: async () => { 
          await logout(); 
          router.replace('/(auth)/login'); 
        }, style: 'destructive' }
      ]
    );
  };

  const handleEditProfile = () => {
    setEditModalVisible(true);
  };

  const handleMyBookings = () => {
    router.push('/(tabs)/bookings');
  };

  const handleSettings = () => {
    setNotificationSettingsVisible(true);
  };

  const saveProfile = async () => {
    try {
      setIsLoading(true);
      
      // Get valid token using token manager (handles refresh automatically)
      const { tokenManager } = await import('@/utils/tokenManager');
      const token = await tokenManager.getValidToken();
      
      if (!token) {
        setIsLoading(false);
        showAlert(
          'Session Expired',
          'Your session has expired. Please login again.',
          'error',
          [
            {
              text: 'OK',
              onPress: () => {
                setShowAlertModal(false);
                logout();
                router.replace('/(auth)/login');
              },
              style: 'primary'
            }
          ]
        );
        return;
      }

      // Validation
      if (!userProfile.name.trim()) {
        setIsLoading(false);
        showAlert('Name Required', 'Please enter your name', 'error');
        return;
      }

      // Check name change limit before submitting
      const isNameChanging = userProfile.name.trim() !== originalName.trim();
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
                  setIsLoading(false);
                  showAlert(
                    'Name Change Limit Reached',
                    'You have reached the maximum limit of 2 name changes. Name changes are limited to prevent abuse.',
                    'error'
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
            setIsLoading(false);
            showAlert(
              'Name Change Limit Reached',
              'You have reached the maximum limit of 2 name changes. Name changes are limited to prevent abuse.',
              'error'
            );
            return;
          }
        }
      }

      if (!userProfile.email.trim()) {
        setIsLoading(false);
        showAlert('Email Required', 'Please enter your email address', 'error');
        return;
      }

      // Prepare update data
      const updateData: any = {
        fullName: userProfile.name.trim(),
        email: userProfile.email.trim(),
      };

      // Handle profile image - convert local URI to base64 for backend upload
      if (userProfile.image && userProfile.image.startsWith('file://')) {
        try {
          // Convert local file to base64 (backend will handle Cloudinary upload)
          const optimizedImage = await ImageManipulator.manipulateAsync(
            userProfile.image,
            [{ resize: { width: 1080 } }],
            { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG, base64: true }
          );
          
          if (optimizedImage.base64) {
            updateData.profilePicUrl = `data:image/jpeg;base64,${optimizedImage.base64}`;
          }
        } catch (imageError) {
          console.error('Failed to process profile image:', imageError);
          // Continue without image if processing fails
        }
      } else if (userProfile.image && userProfile.image.trim() !== '') {
        updateData.profilePicUrl = userProfile.image;
      }

      // Call API to update profile
      const response = await fetch(`${API_BASE_URL}/api/users/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(updateData),
      });

      const responseText = await response.text();
      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch (e) {
        responseData = { message: responseText || 'Unknown error' };
      }

      if (response.ok && responseData.status === 'success') {
        // Update local user data
        const updatedUserData = responseData.data?.user || {};
        
        // Get the updated name change count from backend response
        // Backend returns the actual updated count after incrementing
        const updatedNameChangeCount = updatedUserData.nameChangeCount !== undefined 
          ? updatedUserData.nameChangeCount 
          : (userProfile.name.trim() !== originalName.trim() ? nameChangeCount + 1 : nameChangeCount);
        
        const updatedUser = {
          ...user,
          fullName: userProfile.name.trim(),
          full_name: userProfile.name.trim(),
          email: userProfile.email.trim(),
          profile_pic_url: updateData.profilePicUrl || userProfile.image,
          profilePicUrl: updateData.profilePicUrl || userProfile.image,
          nameChangeCount: updatedNameChangeCount,
        };

        await updateUser(updatedUser);
        await AsyncStorage.setItem('user', JSON.stringify(updatedUser));

        // Update name change tracking - always update if name changed
        if (userProfile.name.trim() !== originalName.trim()) {
          setNameChangeCount(updatedNameChangeCount);
          setOriginalName(userProfile.name.trim());
        } else {
          // Name didn't change, but still update count from backend in case it was fetched
          if (updatedUserData.nameChangeCount !== undefined) {
            setNameChangeCount(updatedUserData.nameChangeCount);
          }
        }

        setEditModalVisible(false);
        showAlert('Success', t('alerts.success.profileUpdated'), 'success', [
          { text: 'OK', onPress: () => setShowAlertModal(false), style: 'primary' }
        ]);
      } else {
        // Handle 401 Unauthorized - token expired
        if (response.status === 401) {
          setIsLoading(false);
          showAlert(
            'Session Expired',
            'Your session has expired. Please login again.',
            'error',
            [
              {
                text: 'OK',
                onPress: () => {
                  setShowAlertModal(false);
                  logout();
                  router.replace('/(auth)/login');
                },
                style: 'primary'
              }
            ]
          );
          return;
        }
        
        // Handle specific error cases
        if (responseData.message && responseData.message.includes('name change limit')) {
          showAlert(
            'Name Change Limit Reached',
            'You have reached the maximum limit of 2 name changes. Name changes are limited to prevent abuse.',
            'error'
          );
        } else if (responseData.message && responseData.message.includes('Email already taken')) {
          showAlert('Email Already in Use', 'This email address is already registered. Please use a different email address', 'error');
        } else {
          showAlert('Update Unsuccessful', responseData.message || t('alerts.error.updateFailed'), 'error');
        }
      }
    } catch (error: any) {
      console.error('Error updating profile:', error);
      showAlert('Update Unsuccessful', error.message || t('alerts.error.updateFailed'), 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    showAlert(
      t('alerts.deleteAccount.title'),
      t('alerts.deleteAccount.message'),
      'warning',
      [
        { text: t('alerts.deleteAccount.cancel'), onPress: () => setShowAlertModal(false), style: 'secondary' },
        {
          text: t('alerts.deleteAccount.confirm'),
          onPress: async () => {
            setShowAlertModal(false);
            setDeleteLoading(true);
            try {
              // Get valid token using token manager (handles refresh automatically)
              const { tokenManager } = await import('@/utils/tokenManager');
              const token = await tokenManager.getValidToken();
              
              if (!token) {
                setDeleteLoading(false);
                showAlert(
                  'Session Expired',
                  'Your session has expired. Please login again.',
                  'error',
                  [
                    {
                      text: 'OK',
                      onPress: () => {
                        setShowAlertModal(false);
                        logout();
                        router.replace('/(auth)/login');
                      },
                      style: 'primary'
                    }
                  ]
                );
                return;
              }
              const response = await fetch(`${API_BASE_URL}/api/users/delete-account`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
              });
              
              if (response.status === 401) {
                setDeleteLoading(false);
                showAlert(
                  'Session Expired',
                  'Your session has expired. Please login again.',
                  'error',
                  [
                    {
                      text: 'OK',
                      onPress: () => {
                        setShowAlertModal(false);
                        logout();
                        router.replace('/(auth)/login');
                      },
                      style: 'primary'
                    }
                  ]
                );
                return;
              }
              
              if (response.ok) {
                await logout();
                setDeleteLoading(false);
                showAlert('Account Deleted', 'Your account and all related data have been deleted.', 'success');
                // Redirect to login screen
                setTimeout(() => {
                  router.replace('/(auth)/login');
                }, 1500);
              } else {
                const data = await response.json();
                setDeleteLoading(false);
                showAlert('Unable to Delete Account', data.message || t('alerts.error.deleteFailed'), 'error');
              }
            } catch (error) {
              setDeleteLoading(false);
              showAlert('Unable to Delete Account', t('alerts.error.deleteFailed'), 'error');
            }
          },
          style: 'destructive'
        }
      ]
    );
  };

  const handlePrivacySettings = () => {
    setPrivacyModalVisible(true);
  };

  const handleTermsPrivacy = () => {
    setTermsModalVisible(true);
  };

  const handleLanguageSelection = () => {
    setLanguageModalVisible(true);
  };

  const getReferralMessage = () => {
    const message = `Hey! I have been using BuildXpert for reliable home services. Download it here:\n\n📱 Android: ${PLAY_STORE_LINK}\n🍎 iOS: ${APP_STORE_LINK}`;
    return message;
  };

  const openReferModal = () => {
    setReferModalVisible(true);
  };

  const openRateModal = () => {
    setRateModalVisible(true);
  };

  const openSupportModal = () => {
    setSupportModalVisible(true);
  };

  const openPlayStoreLink = async () => {
    try {
      const supported = await Linking.canOpenURL(PLAY_STORE_LINK);
      if (supported) {
        await Linking.openURL(PLAY_STORE_LINK);
      } else {
        showAlert('Unable to Copy Link', t('referFriendsModal.linkError'), 'error');
      }
    } catch (error) {
      showAlert('Unable to Copy Link', t('referFriendsModal.linkError'), 'error');
    }
  };

  const openPlayStoreForRating = async () => {
    try {
      const supported = await Linking.canOpenURL(PLAY_STORE_LINK);
      if (supported) {
        await Linking.openURL(PLAY_STORE_LINK);
      } else {
        showAlert('Unable to Open Store', t('rateAppModal.error'), 'error');
      }
    } catch (error) {
      showAlert('Error', t('rateAppModal.error'), 'error');
    }
  };

  const openAppStoreForRating = async () => {
    try {
      const supported = await Linking.canOpenURL(APP_STORE_LINK);
      if (supported) {
        await Linking.openURL(APP_STORE_LINK);
      } else {
        showAlert('Unable to Open Store', t('rateAppModal.error'), 'error');
      }
    } catch (error) {
      showAlert('Error', t('rateAppModal.error'), 'error');
    }
  };

  const shareApp = async () => {
    try {
      await Share.share({
        message: getReferralMessage(),
      });
    } catch (error) {
      showAlert('Unable to Share', t('referFriendsModal.shareError'), 'error');
    }
  };

  const shareViaWhatsApp = async () => {
    const message = encodeURIComponent(getReferralMessage());
    const whatsappUrl = `whatsapp://send?text=${message}`;
    try {
      const supported = await Linking.canOpenURL(whatsappUrl);
      if (supported) {
        await Linking.openURL(whatsappUrl);
      } else {
        await shareApp();
      }
    } catch (error) {
      await shareApp();
    }
  };

  const shareViaInstagram = async () => {
    await shareApp();
  };

  const shareViaSms = async () => {
    const smsUrl = Platform.select({
      ios: `sms:&body=${encodeURIComponent(getReferralMessage())}`,
      android: `sms:?body=${encodeURIComponent(getReferralMessage())}`,
    });

    if (!smsUrl) {
      await shareApp();
      return;
    }

    try {
      const supported = await Linking.canOpenURL(smsUrl);
      if (supported) {
        await Linking.openURL(smsUrl);
      } else {
        await shareApp();
      }
    } catch (error) {
      await shareApp();
    }
  };

  const selectLanguage = async (languageCode: string) => {
    const languageMap: { [key: string]: string } = {
      'English': 'en',
      'Hindi': 'hi',
      'Kannada': 'kn',
      'Tamil': 'ta',
      'Telugu': 'te',
      'Malayalam': 'ml',
    };
    
    const code = languageMap[languageCode];
    if (code) {
      await setLanguage(code as any);
      setLanguageModalVisible(false);
      showAlert('Success', t('alerts.success.languageChanged', { language: languageCode }), 'success');
    }
  };

  const updatePrivacySetting = (key: string, value: boolean) => {
    setPrivacySettings(prev => ({ ...prev, [key]: value }));
    const settingName = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
    showAlert('Success', t('alerts.success.settingUpdated', { setting: settingName }), 'success');
  };

  const ratingSteps = [
    t('rateAppModal.steps.one'),
    t('rateAppModal.steps.two'),
    t('rateAppModal.steps.three'),
  ].filter((step) => typeof step === 'string' && step.trim().length > 0) as string[];

  const openEmailClient = async () => {
    const email = t('supportModal.emailAddress');
    const subject = encodeURIComponent(t('supportModal.emailSubject'));
    const body = encodeURIComponent(t('supportModal.emailBody'));
    const mailto = `mailto:${email}?subject=${subject}&body=${body}`;
    try {
      const supported = await Linking.canOpenURL(mailto);
      if (supported) {
        await Linking.openURL(mailto);
      } else {
        showAlert('Unable to Open Email', t('supportModal.emailError'), 'error');
      }
    } catch (error) {
      showAlert('Unable to Open Email', t('supportModal.emailError'), 'error');
    }
  };

  const callSupportNumber = async () => {
    const phoneNumber = t('supportModal.phoneNumber');
    const phoneUrl = `tel:${phoneNumber}`;
    try {
      const supported = await Linking.canOpenURL(phoneUrl);
      if (supported) {
        await Linking.openURL(phoneUrl);
      } else {
        showAlert('Unable to Make Call', t('supportModal.phoneError'), 'error');
      }
    } catch (error) {
      showAlert('Unable to Make Call', t('supportModal.phoneError'), 'error');
    }
  };

  const openWhatsAppSupport = async () => {
    const message = encodeURIComponent(t('supportModal.whatsappMessage'));
    const phone = t('supportModal.whatsappNumber');
    const whatsappUrl = `whatsapp://send?phone=${phone}&text=${message}`;
    try {
      const supported = await Linking.canOpenURL(whatsappUrl);
      if (supported) {
        await Linking.openURL(whatsappUrl);
      } else {
        showAlert('Unable to Open WhatsApp', t('supportModal.whatsappError'), 'error');
      }
    } catch (error) {
      showAlert('Unable to Open WhatsApp', t('supportModal.whatsappError'), 'error');
    }
  };

  const menuSections = [
    {
      title: t('profile.account'),
      items: [
        {
          icon: <Edit3 size={20} color="#3B82F6" />,
          title: t('profile.editProfile'),
          subtitle: t('profile.updatePersonalInfo'),
          onPress: handleEditProfile,
        },
        {
          icon: <Globe size={20} color="#3B82F6" />,
          title: t('profile.language'),
          subtitle: t('profile.currentLanguage', { language: currentLanguageName }),
          onPress: handleLanguageSelection,
        },
        {
          icon: <MapPin size={20} color="#3B82F6" />,
          title: t('profile.addresses'),
          subtitle: t('profile.manageAddresses'),
          onPress: () => showAlert(t('profile.addresses'), t('alerts.info.addresses'), 'info'),
        },
      ]
    },
    {
      title: t('profile.preferences'),
      items: [
        {
          icon: <Bell size={20} color="#3B82F6" />,
          title: t('profile.notifications'),
          subtitle: t('profile.customizeNotifications'),
          onPress: () => {},
          hasSwitch: true,
          switchValue: notificationsEnabled,
          onSwitchChange: setNotificationsEnabled,
        },
      ]
    },
    {
      title: t('profile.more'),
      items: [
        {
          icon: <Gift size={20} color="#3B82F6" />,
          title: t('profile.referFriends'),
          subtitle: t('profile.earnRewards'),
          onPress: openReferModal,
        },
        {
          icon: <Star size={20} color="#3B82F6" />,
          title: t('profile.rateApp'),
          subtitle: t('profile.helpImprove'),
          onPress: openRateModal,
        },
        {
          icon: <HelpCircle size={20} color="#3B82F6" />,
          title: t('profile.helpSupport'),
          subtitle: t('profile.getHelp'),
          onPress: openSupportModal,
        },
        {
          icon: <FileText size={20} color="#3B82F6" />,
          title: t('profile.termsPrivacy'),
          subtitle: t('profile.readTerms'),
          onPress: handleTermsPrivacy,
        },
      ]
    }
  ];

  return (
    <SafeView style={styles.container} backgroundColor="#F8FAFC" excludeBottom={true}>
      <ScrollView 
        style={styles.scrollView} 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#3B82F6']} // Android
            tintColor="#3B82F6" // iOS
            title="Pull to refresh" // iOS
            titleColor="#64748B" // iOS
          />
        }
      >
        {/* Header */}
        <View style={styles.headerWrapper}>
          <View style={styles.header}>
            <View style={styles.headerContent}>
              <View style={styles.imageContainer}>
                {(userProfile.image && userProfile.image.trim() !== '') || (cachedImageUrl && cachedImageUrl.trim() !== '') ? (
                  <Image 
                    source={{ uri: userProfile.image || cachedImageUrl }} 
                    style={styles.profileImage} 
                    resizeMode="cover"
                    onLoadStart={() => {
                      setImageLoading(true);
                      
                      // Set a timeout to fallback to text avatar if image takes too long
                      const timeout = setTimeout(() => {
                        setUserProfile(prev => ({ ...prev, image: '' }));
                        setImageLoading(false);
                      }, 5000); // 5 second timeout
                      
                      setImageLoadTimeout(timeout);
                    }}
                    onLoadEnd={() => {
                      setImageLoading(false);
                      
                      // Clear timeout if image loads successfully
                      if (imageLoadTimeout) {
                        clearTimeout(imageLoadTimeout);
                        setImageLoadTimeout(null);
                      }
                    }}
                    onError={(error) => {
                     
                      
                      // Clear timeout on error
                      if (imageLoadTimeout) {
                        clearTimeout(imageLoadTimeout);
                        setImageLoadTimeout(null);
                      }
                      
                      // Check if it's a network error
                      const errorMessage = error.nativeEvent?.error || '';
                      if (errorMessage.includes('Unable to resolve host') || errorMessage.includes('Network request failed')) {
                        
                      }
                      
                      // If the profile image fails to load, use text avatar
                      setUserProfile(prev => ({ ...prev, image: '' }));
                      setImageLoading(false);
                    }}
                  />
                ) : (
                  <View style={[styles.profileImage, styles.textAvatar]}>
                    <Text style={styles.textAvatarText}>
                      {userProfile.name ? userProfile.name.charAt(0).toUpperCase() : 'U'}
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
              <View style={styles.profileInfo}>
                <Text 
                  style={styles.profileName}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {userProfile.name}
                </Text>
                <View style={styles.profileDetails}>
                  {userProfile.location ? (
                    <View style={styles.detailItem}>
                      <View style={styles.detailIconContainer}>
                        <MapPin size={16} color="#64748B" />
                      </View>
                      <Text 
                        style={styles.detailText}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                      >
                        {userProfile.location}
                      </Text>
                    </View>
                  ) : null}
                  <View style={styles.detailItem}>
                    <Text 
                      style={styles.detailText}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {userProfile.email}
                    </Text>
                  </View>
                </View>
              </View>
              <TouchableOpacity 
                style={styles.notificationButton}
                onPress={() => router.push('/(tabs)/notifications')}
              >
                <Bell size={24} color="#64748B" />
                {unreadCount > 0 && (
                  <View style={styles.notificationBadge}>
                    <Text style={styles.notificationBadgeText}>
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
        
        {/* Stats */}
        <View style={styles.statsContainer}>
          <TouchableOpacity style={styles.statItem} onPress={handleMyBookings}>
            {statsLoading ? (
              <ActivityIndicator size="small" color="#3B82F6" />
            ) : (
              <Text style={styles.statValue}>{bookingsCount}</Text>
            )}
            <Text style={styles.statLabel}>{t('profile.bookings')}</Text>
          </TouchableOpacity>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            {statsLoading ? (
              <ActivityIndicator size="small" color="#3B82F6" />
            ) : (
              <Text style={styles.statValue}>{averageRating > 0 ? averageRating.toFixed(1) : '-'}</Text>
            )}
            <Text style={styles.statLabel}>{t('profile.rating')}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            {statsLoading ? (
              <ActivityIndicator size="small" color="#3B82F6" />
            ) : (
              <Text style={styles.statValue}>{totalReviews}</Text>
            )}
            <Text style={styles.statLabel}>{t('profile.reviews')}</Text>
          </View>
        </View>

        {/* Menu Sections */}
        {menuSections.map((section, sectionIndex) => (
          <View key={sectionIndex} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.optionsList}>
              {section.items.map((item, itemIndex) => (
                <MenuItem 
                  key={itemIndex}
                  {...item}
                  isLast={itemIndex === section.items.length - 1}
                />
              ))}
            </View>
          </View>
        ))}
        
        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <LogOut size={20} color="#EF4444" />
          <Text style={styles.logoutText}>{t('profile.logout')}</Text>
        </TouchableOpacity>

        <View style={styles.footer}>
          <Text style={styles.footerText}>{t('profile.version')}</Text>
        </View>
      </ScrollView>

      {/* Edit Profile Modal */}
      <RNModal
        visible={editModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <SafeView style={styles.modalContainer} backgroundColor="#FFFFFF">
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setEditModalVisible(false)}>
              <X size={24} color="#64748B" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{t('editProfile.title')}</Text>
            <TouchableOpacity onPress={saveProfile}>
              <Text style={styles.saveButton}>{t('editProfile.save')}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            <View style={styles.modalImageContainer}>
              {(userProfile.image && userProfile.image.trim() !== '') || (cachedImageUrl && cachedImageUrl.trim() !== '') ? (
                <Image 
                  source={{ uri: userProfile.image || cachedImageUrl }} 
                  style={styles.modalProfileImage} 
                  resizeMode="cover"
                  onLoadStart={() => setImageLoading(true)}
                  onLoadEnd={() => setImageLoading(false)}
                  onError={() => {
                    // If the profile image fails to load, use text avatar
                    setUserProfile(prev => ({ ...prev, image: '' }));
                    setImageLoading(false);
                  }}
                />
              ) : (
                <View style={[styles.modalProfileImage, styles.modalTextAvatar]}>
                  <Text style={styles.modalTextAvatarText}>
                    {userProfile.name ? userProfile.name.charAt(0).toUpperCase() : 'U'}
                  </Text>
                </View>
              )}
              {imageLoading && (
                <View style={styles.modalImageLoadingOverlay}>
                  <ActivityIndicator size="small" color="#3B82F6" />
                </View>
              )}
                             <TouchableOpacity style={styles.modalCameraButton} onPress={handleProfilePictureAction}>
                 <Camera size={20} color="#FFFFFF" />
               </TouchableOpacity>
            </View>

            <View style={styles.formGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.formLabel}>{t('editProfile.fullName')}</Text>
                {(() => {
                  const isNameChanging = userProfile.name.trim() !== originalName.trim();
                  const remaining = Math.max(0, 2 - nameChangeCount);
                  
                  if (nameChangeCount >= 2 && isNameChanging) {
                    return (
                      <Text style={styles.warningText}>
                        {t('editProfile.nameChangeLimitReached') || 'Name change limit reached (2/2)'}
                      </Text>
                    );
                  } else if (nameChangeCount < 2 && isNameChanging) {
                    return (
                      <Text style={styles.infoText}>
                        {t('editProfile.nameChangesRemaining', { count: remaining.toString() })}
                      </Text>
                    );
                  }
                  return null;
                })()}
              </View>
              <TextInput
                style={[
                  styles.formInput,
                  nameChangeCount >= 2 && userProfile.name.trim() !== originalName.trim() && styles.disabledInput
                ]}
                value={userProfile.name}
                onChangeText={(text) => {
                  // Prevent changes if limit reached and name is different from original
                  const isChanging = text.trim() !== originalName.trim();
                  if (nameChangeCount >= 2 && originalName.trim() !== '' && isChanging) {
                    // Reset to original name if trying to change beyond limit
                    showAlert(
                      'Name Change Limit Reached',
                      t('editProfile.nameChangeLimitMessage') || 'You have reached the maximum limit of 2 name changes. Name changes are limited to prevent abuse.',
                      'error',
                      [
                        {
                          text: 'OK',
                          onPress: () => {
                            // Reset to original name
                            setUserProfile(prev => ({ ...prev, name: originalName }));
                          }
                        }
                      ]
                    );
                    return;
                  }
                  setUserProfile(prev => ({ ...prev, name: text }));
                }}
                placeholder={t('editProfile.fullNamePlaceholder')}
                editable={!(nameChangeCount >= 2 && userProfile.name.trim() !== originalName.trim())}
              />
              {nameChangeCount >= 2 && (
                <Text style={styles.limitReachedText}>
                  {t('editProfile.nameChangeLimitMessage') || 'You have used all 2 name changes. You cannot change your name again.'}
                </Text>
              )}
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>{t('editProfile.email')}</Text>
              <TextInput
                style={styles.formInput}
                value={userProfile.email}
                onChangeText={(text) => setUserProfile(prev => ({ ...prev, email: text }))}
                placeholder={t('editProfile.emailPlaceholder')}
                keyboardType="email-address"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>{t('editProfile.phoneNumber')}</Text>
              <TextInput
                style={[styles.formInput, styles.disabledInput]}
                value={userProfile.phone}
                editable={false}
                placeholder={t('editProfile.phonePlaceholder')}
                placeholderTextColor="#94A3B8"
              />
              <Text style={styles.disabledText}>{t('editProfile.phoneDisabled')}</Text>
            </View>

            {/* Delete Account Button */}
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
          </ScrollView>
        </SafeView>
      </RNModal>

      {/* Privacy & Security Modal */}
      <RNModal
        visible={privacyModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setPrivacyModalVisible(false)}
      >
        <SafeView style={styles.modalContainer} backgroundColor="#FFFFFF">
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setPrivacyModalVisible(false)}>
              <X size={24} color="#64748B" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Privacy & Security</Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView style={styles.modalContent}>
            <View style={styles.privacySection}>
              <Text style={styles.privacySectionTitle}>Profile Privacy</Text>
              <PrivacySettingItem
                icon={<UserCheck size={20} color="#3B82F6" />}
                title="Profile Visibility"
                subtitle="Allow others to see your profile information"
                value={privacySettings.profileVisibility}
                onValueChange={(value) => updatePrivacySetting('profileVisibility', value)}
              />
              <PrivacySettingItem
                icon={<MapPin size={20} color="#3B82F6" />}
                title="Location Sharing"
                subtitle="Share your location with service providers"
                value={privacySettings.locationSharing}
                onValueChange={(value) => updatePrivacySetting('locationSharing', value)}
              />
            </View>

            <View style={styles.privacySection}>
              <Text style={styles.privacySectionTitle}>Data & Analytics</Text>
              <PrivacySettingItem
                icon={<Eye size={20} color="#3B82F6" />}
                title="Data Analytics"
                subtitle="Help us improve by sharing usage data"
                value={privacySettings.dataAnalytics}
                onValueChange={(value) => updatePrivacySetting('dataAnalytics', value)}
              />
              <PrivacySettingItem
                icon={<Mail size={20} color="#3B82F6" />}
                title="Marketing Emails"
                subtitle="Receive promotional emails and offers"
                value={privacySettings.marketingEmails}
                onValueChange={(value) => updatePrivacySetting('marketingEmails', value)}
              />
            </View>

            <View style={styles.privacySection}>
              <Text style={styles.privacySectionTitle}>Security</Text>
              <PrivacySettingItem
                icon={<Bell size={20} color="#3B82F6" />}
                title="Push Notifications"
                subtitle="Receive important app notifications"
                value={privacySettings.pushNotifications}
                onValueChange={(value) => updatePrivacySetting('pushNotifications', value)}
              />
              <PrivacySettingItem
                icon={<Smartphone size={20} color="#3B82F6" />}
                title="Biometric Authentication"
                subtitle="Use fingerprint or face ID to login"
                value={privacySettings.biometricAuth}
                onValueChange={(value) => updatePrivacySetting('biometricAuth', value)}
              />
              <PrivacySettingItem
                icon={<Lock size={20} color="#3B82F6" />}
                title="Two-Factor Authentication"
                subtitle="Add an extra layer of security"
                value={privacySettings.twoFactorAuth}
                onValueChange={(value) => updatePrivacySetting('twoFactorAuth', value)}
              />
            </View>

            <View style={styles.privacyInfo}>
              <Text style={styles.privacyInfoTitle}>Data Protection</Text>
              <Text style={styles.privacyInfoText}>
                Your personal data is encrypted and stored securely. We never share your information with third parties without your explicit consent.
              </Text>
            </View>
          </ScrollView>
        </SafeView>
      </RNModal>

      {/* Terms & Privacy Modal */}
      <RNModal
        visible={termsModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setTermsModalVisible(false)}
      >
        <SafeView style={styles.modalContainer} backgroundColor="#FFFFFF">
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setTermsModalVisible(false)}>
              <X size={24} color="#64748B" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{t('termsPrivacy.title')}</Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView style={styles.modalContent}>
            <View style={styles.termsSection}>
              <Text style={styles.termsSectionTitle}>{t('termsPrivacy.termsOfService')}</Text>
              <Text style={styles.termsText}>
                {t('termsPrivacy.termsDescription')}
              </Text>
              
              <Text style={styles.termsSubtitle}>{t('termsPrivacy.userResponsibilities')}</Text>
              <Text style={styles.termsText}>
                {userResponsibilitiesList.map((item: string, index: number) => 
                  index === 0 ? `• ${item}` : `\n• ${item}`
                ).join('')}
              </Text>
            </View>

            <View style={styles.termsSection}>
              <Text style={styles.termsSectionTitle}>{t('termsPrivacy.privacyPolicy')}</Text>
              <Text style={styles.termsText}>
                {t('termsPrivacy.privacyDescription')}
              </Text>

              <Text style={styles.termsSubtitle}>{t('termsPrivacy.informationWeCollect')}</Text>
              <Text style={styles.termsText}>
                {informationWeCollectList.map((item: string, index: number) => 
                  index === 0 ? `• ${item}` : `\n• ${item}`
                ).join('')}
              </Text>

              <Text style={styles.termsSubtitle}>{t('termsPrivacy.howWeUseInfo')}</Text>
              <Text style={styles.termsText}>
                {howWeUseInfoList.map((item: string, index: number) => 
                  index === 0 ? `• ${item}` : `\n• ${item}`
                ).join('')}
              </Text>

              <Text style={styles.termsSubtitle}>{t('termsPrivacy.dataSecurity')}</Text>
              <Text style={styles.termsText}>
                {dataSecurityList.map((item: string, index: number) => 
                  index === 0 ? `• ${item}` : `\n• ${item}`
                ).join('')}
              </Text>
            </View>

            <View style={styles.termsSection}>
              <Text style={styles.termsSectionTitle}>{t('termsPrivacy.contactInfo')}</Text>
              <Text style={styles.termsText}>
                {t('termsPrivacy.contactDescription')}{'\n\n'}
                {t('termsPrivacy.contactEmail')}{'\n'}
                {t('termsPrivacy.contactPhone')}{'\n'}
                {t('termsPrivacy.contactAddress')}
              </Text>
            </View>
          </ScrollView>
        </SafeView>
      </RNModal>

      {/* Language Selection Modal */}
      <RNModal
        visible={languageModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setLanguageModalVisible(false)}
      >
        <SafeView style={styles.modalContainer} backgroundColor="#FFFFFF">
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setLanguageModalVisible(false)}>
              <X size={24} color="#64748B" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{t('languageSelection.title')}</Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView style={styles.modalContent}>
            <View style={styles.languageSection}>
              <Text style={styles.languageSectionTitle}>{t('languageSelection.subtitle')}</Text>
              <Text style={styles.languageSectionSubtitle}>
                {t('languageSelection.description')}
              </Text>
            </View>

            {['English', 'Hindi', 'Kannada', 'Tamil', 'Telugu', 'Malayalam'].map((language) => (
              <TouchableOpacity
                key={language}
                style={[
                  styles.languageItem,
                  currentLanguageName === language && styles.languageItemSelected
                ]}
                onPress={() => selectLanguage(language)}
              >
                <View style={styles.languageItemContent}>
                  <Text style={[
                    styles.languageItemTitle,
                    currentLanguageName === language && styles.languageItemTitleSelected
                  ]}>
                    {language}
                  </Text>
                  {currentLanguageName === language && (
                    <Text style={styles.languageItemSubtitle}>{t('languageSelection.currentlySelected')}</Text>
                  )}
                </View>
                {currentLanguageName === language && (
                  <View style={styles.languageCheckmark}>
                    <Text style={styles.languageCheckmarkText}>✓</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </SafeView>
      </RNModal>

      {/* Notification Settings Modal */}
      <RNModal
        visible={notificationSettingsVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setNotificationSettingsVisible(false)}
      >
        <SafeView style={styles.modalContainer} backgroundColor="#FFFFFF">
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setNotificationSettingsVisible(false)}>
              <X size={24} color="#64748B" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Notification Settings</Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView style={styles.modalContent}>
            <NotificationSettings onClose={() => setNotificationSettingsVisible(false)} />
          </ScrollView>
        </SafeView>
      </RNModal>

      {/* Refer Friends Modal */}
      <RNModal
        visible={referModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setReferModalVisible(false)}
      >
        <SafeView style={styles.modalContainer} backgroundColor="#FFFFFF">
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setReferModalVisible(false)}>
              <X size={24} color="#64748B" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{t('referFriendsModal.title')}</Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView style={styles.modalContent}>
            <View style={styles.referralHero}>
              <Text style={styles.referralHeroTitle}>{t('referFriendsModal.subtitle')}</Text>
              <Text style={styles.referralHeroText}>{t('referFriendsModal.description')}</Text>
            </View>

            <View style={styles.referralCard}>
              <Text style={styles.referralCardLabel}>{t('referFriendsModal.linkLabel')}</Text>
              <TouchableOpacity style={styles.referralLinkButton} onPress={openPlayStoreLink}>
                <ExternalLink size={16} color="#2563EB" />
                <Text style={styles.referralLinkText}>{PLAY_STORE_LINK}</Text>
              </TouchableOpacity>
              <Text style={styles.referralLinkHint}>{t('referFriendsModal.linkHint')}</Text>
            </View>

            <View style={styles.shareSection}>
              <Text style={styles.shareSectionTitle}>{t('referFriendsModal.shareVia')}</Text>
              <View style={styles.shareButtonsRow}>
                <TouchableOpacity style={styles.shareButton} onPress={shareApp}>
                  <Share2 size={18} color="#0F172A" />
                  <Text style={styles.shareButtonText}>{t('referFriendsModal.shareGeneric')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.shareButton} onPress={shareViaWhatsApp}>
                  <MessageCircle size={18} color="#0F172A" />
                  <Text style={styles.shareButtonText}>{t('referFriendsModal.shareWhatsApp')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.shareButton} onPress={shareViaInstagram}>
                  <Instagram size={18} color="#0F172A" />
                  <Text style={styles.shareButtonText}>{t('referFriendsModal.shareInstagram')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.shareButton} onPress={shareViaSms}>
                  <MessageCircle size={18} color="#0F172A" />
                  <Text style={styles.shareButtonText}>{t('referFriendsModal.shareSms')}</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.referralInfoBox}>
              <Text style={styles.referralInfoTitle}>{t('referFriendsModal.tipTitle')}</Text>
              <Text style={styles.referralInfoText}>{t('referFriendsModal.tipDescription')}</Text>
            </View>

            <TouchableOpacity style={styles.referralPlayStoreButton} onPress={openPlayStoreLink}>
              <Text style={styles.referralPlayStoreText}>{t('referFriendsModal.openStore')}</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeView>
      </RNModal>

      {/* Help & Support Modal */}
      <RNModal
        visible={supportModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSupportModalVisible(false)}
      >
        <SafeView style={styles.modalContainer} backgroundColor="#FFFFFF">
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setSupportModalVisible(false)}>
              <X size={24} color="#64748B" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{t('supportModal.title')}</Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView style={styles.modalContent}>
            <View style={styles.referralHero}>
              <Text style={styles.referralHeroTitle}>{t('supportModal.subtitle')}</Text>
              <Text style={styles.referralHeroText}>{t('supportModal.description')}</Text>
            </View>

            <View style={styles.supportCard}>
              <Text style={styles.supportSectionTitle}>{t('supportModal.contactTitle')}</Text>

              <TouchableOpacity style={styles.supportItem} onPress={openEmailClient}>
                <View style={styles.supportIcon}>
                  <Mail size={18} color="#1D4ED8" />
                </View>
                <View style={styles.supportContent}>
                  <Text style={styles.supportLabel}>{t('supportModal.emailLabel')}</Text>
                  <Text style={styles.supportValue}>{t('supportModal.emailAddress')}</Text>
                </View>
                <ChevronRight size={18} color="#94A3B8" />
              </TouchableOpacity>

              <TouchableOpacity style={styles.supportItem} onPress={callSupportNumber}>
                <View style={styles.supportIcon}>
                  <Phone size={18} color="#059669" />
                </View>
                <View style={styles.supportContent}>
                  <Text style={styles.supportLabel}>{t('supportModal.phoneLabel')}</Text>
                  <Text style={styles.supportValue}>{t('supportModal.displayPhoneNumber')}</Text>
                </View>
                <ChevronRight size={18} color="#94A3B8" />
              </TouchableOpacity>

              <TouchableOpacity style={styles.supportItem} onPress={openWhatsAppSupport}>
                <View style={styles.supportIcon}>
                  <MessageCircle size={18} color="#10B981" />
                </View>
                <View style={styles.supportContent}>
                  <Text style={styles.supportLabel}>{t('supportModal.whatsappLabel')}</Text>
                  <Text style={styles.supportValue}>{t('supportModal.displayWhatsApp')}</Text>
                </View>
                <ChevronRight size={18} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <View style={styles.supportInfoBox}>
              <Text style={styles.supportInfoTitle}>{t('supportModal.availableTitle')}</Text>
              <Text style={styles.supportInfoText}>{t('supportModal.availableHours')}</Text>
            </View>
          </ScrollView>
        </SafeView>
      </RNModal>

      {/* Rate App Modal */}
      <RNModal
        visible={rateModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setRateModalVisible(false)}
      >
        <SafeView style={styles.modalContainer} backgroundColor="#FFFFFF">
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setRateModalVisible(false)}>
              <X size={24} color="#64748B" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{t('rateAppModal.title')}</Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView style={styles.modalContent}>
            <View style={styles.referralHero}>
              <Text style={styles.referralHeroTitle}>{t('rateAppModal.subtitle')}</Text>
              <Text style={styles.referralHeroText}>{t('rateAppModal.description')}</Text>
            </View>

            <View style={styles.rateStepsContainer}>
              <Text style={styles.rateStepsTitle}>{t('rateAppModal.stepsTitle')}</Text>
              {ratingSteps?.map((step, index) => (
                <View key={index} style={styles.rateStepItem}>
                  <View style={styles.rateStepIndex}>
                    <Text style={styles.rateStepIndexText}>{index + 1}</Text>
                  </View>
                  <Text style={styles.rateStepText}>{step}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity style={[styles.referralPlayStoreButton, { marginBottom: getResponsiveSpacing(12, 14, 16) }]} onPress={openPlayStoreForRating}>
              <Text style={styles.referralPlayStoreText}>Rate on Play Store</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.referralPlayStoreButton, styles.appStoreButton]} onPress={openAppStoreForRating}>
              <Text style={styles.referralPlayStoreText}>Rate on App Store</Text>
            </TouchableOpacity>

            <Text style={styles.rateReminder}>{t('rateAppModal.reminder')}</Text>
          </ScrollView>
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

      {/* Delete Account Loading Overlay */}
      <RNModal
        visible={deleteLoading}
        transparent={true}
        animationType="fade"
        statusBarTranslucent={true}
        onRequestClose={() => setDeleteLoading(false)}
      >
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#EF4444" />
            <Text style={styles.loadingText}>Deleting your account...</Text>
            <Text style={styles.loadingSubtext}>This may take a few moments</Text>
          </View>
        </View>
      </RNModal>
    </SafeView>
  );
}

function MenuItem({ 
  icon, 
  title, 
  subtitle, 
  onPress, 
  hasSwitch, 
  switchValue, 
  onSwitchChange, 
  isLast 
}: any) {
  return (
    <TouchableOpacity 
      style={[styles.menuItem, isLast && styles.menuItemLast]} 
      onPress={onPress}
      disabled={hasSwitch}
    >
      <View style={styles.menuIconContainer}>
        {icon}
      </View>
      <View style={styles.menuContent}>
        <Text style={styles.menuTitle}>{title}</Text>
        <Text style={styles.menuSubtitle}>{subtitle}</Text>
      </View>
      {hasSwitch ? (
        <Switch
          value={switchValue}
          onValueChange={onSwitchChange}
          trackColor={{ false: '#E2E8F0', true: '#3B82F6' }}
          thumbColor="#FFFFFF"
        />
      ) : (
        <ChevronRight size={20} color="#94A3B8" />
      )}
    </TouchableOpacity>
  );
}

function PrivacySettingItem({ 
  icon, 
  title, 
  subtitle, 
  value, 
  onValueChange 
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.privacyItem}>
      <View style={styles.privacyItemIcon}>
        {icon}
      </View>
      <View style={styles.privacyItemContent}>
        <Text style={styles.privacyItemTitle}>{title}</Text>
        <Text style={styles.privacyItemSubtitle}>{subtitle}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: '#E2E8F0', true: '#3B82F6' }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollView: {
    flex: 1,
  },
  headerWrapper: {
    paddingTop: Platform.OS === 'ios' ? 0 : getResponsiveSpacing(12, 16, 20),
    paddingHorizontal: getResponsiveSpacing(12, 16, 20),
    marginBottom: getResponsiveSpacing(12, 16, 20),
  },
  header: {
    backgroundColor: '#F8FAFC',
    paddingTop: getResponsiveSpacing(20, 24, 28),
    paddingBottom: getResponsiveSpacing(20, 24, 28),
    borderRadius: getResponsiveSpacing(20, 24, 28),
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.03,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: getResponsiveSpacing(16, 20, 24),
  },
  imageContainer: {
    position: 'relative',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 6,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  profileImage: {
    width: getResponsiveImageSize(80, 100, 120),
    height: getResponsiveImageSize(80, 100, 120),
    borderRadius: getResponsiveImageSize(24, 30, 36),
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  imageLoadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: getResponsiveImageSize(24, 30, 36),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  textAvatar: {
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  textAvatarText: {
    color: '#FFFFFF',
    fontSize: getResponsiveFontSize(24, 32, 40),
    fontWeight: 'bold',
  },
  cameraButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#3B82F6',
    borderRadius: getResponsiveSpacing(12, 16, 20),
    width: getResponsiveSpacing(28, 32, 36),
    height: getResponsiveSpacing(28, 32, 36),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  profileInfo: {
    marginLeft: getResponsiveSpacing(16, 20, 24),
    flex: 1,
    minWidth: 0, // Allows flex item to shrink below content size
  },
  profileName: {
    fontSize: getResponsiveFontSize(20, 24, 28),
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: getResponsiveSpacing(8, 12, 16),
    width: '100%', // Ensure text takes full available width for truncation
  },
  notificationButton: {
    width: getResponsiveSpacing(40, 44, 48),
    height: getResponsiveSpacing(40, 44, 48),
    borderRadius: getResponsiveSpacing(20, 22, 24),
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    position: 'relative',
  },
  notificationBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#EF4444',
    borderRadius: getResponsiveSpacing(6, 8, 10),
    minWidth: getResponsiveSpacing(14, 16, 18),
    height: getResponsiveSpacing(14, 16, 18),
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: getResponsiveSpacing(2, 3, 4),
    zIndex: 10,
  },
  notificationBadgeText: {
    color: '#FFF',
    fontSize: getResponsiveFontSize(8, 10, 12),
    fontWeight: 'bold',
  },
  profileDetails: {
    gap: 8,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'baseline', // Use baseline alignment for better text-icon alignment
    minHeight: getResponsiveSpacing(20, 22, 24), // Ensure consistent height
    paddingVertical: getResponsiveSpacing(2, 3, 4), // Add vertical padding for better spacing
    minWidth: 0, // Allows flex item to shrink below content size for truncation
    flex: 1, // Allow item to take available space
  },
  detailIconContainer: {
    width: getResponsiveSpacing(18, 20, 22), // Slightly larger to accommodate size 16 icon
    height: getResponsiveSpacing(18, 20, 22), // Slightly larger to accommodate size 16 icon
    alignItems: 'center',
    justifyContent: 'flex-end', // Align to bottom to match text baseline
    paddingBottom: getResponsiveSpacing(2, 3, 4), // Adjust to align with text baseline
  },
  detailText: {
    fontSize: getResponsiveFontSize(12, 14, 16),
    color: '#64748B',
    marginLeft: getResponsiveSpacing(6, 8, 10), // Increased margin for better spacing
    fontWeight: '500',
    flex: 1, // Allow text to take remaining space
    minWidth: 0, // Allows flex item to shrink below content size for truncation
    lineHeight: getResponsiveSpacing(16, 18, 20), // Better line height for alignment
    textAlignVertical: 'center', // Ensure text is vertically centered
    includeFontPadding: false, // Remove extra font padding on Android
  },
  statsContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: getResponsiveSpacing(10, 12, 14),
    marginHorizontal: getResponsiveSpacing(16, 20, 24),
    paddingVertical: getResponsiveSpacing(16, 20, 24),
    marginBottom: getResponsiveSpacing(20, 24, 28),
    shadowColor: '#CBD5E1',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: getResponsiveFontSize(18, 20, 22),
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: getResponsiveSpacing(2, 4, 6),
  },
  statLabel: {
    fontSize: getResponsiveFontSize(12, 14, 16),
    color: '#64748B',
  },
  statDivider: {
    width: 1,
    height: '70%',
    backgroundColor: '#E2E8F0',
    alignSelf: 'center',
  },
  section: {
    marginBottom: getResponsiveSpacing(20, 24, 28),
    paddingHorizontal: getResponsiveSpacing(16, 20, 24),
  },
  sectionTitle: {
    fontSize: getResponsiveFontSize(16, 18, 20),
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: getResponsiveSpacing(12, 16, 20),
  },
  optionsList: {
    backgroundColor: '#FFFFFF',
    borderRadius: getResponsiveSpacing(10, 12, 14),
    overflow: 'hidden',
    shadowColor: '#CBD5E1',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: getResponsiveSpacing(14, 16, 18),
    paddingHorizontal: getResponsiveSpacing(14, 16, 18),
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  menuItemLast: {
    borderBottomWidth: 0,
  },
  menuIconContainer: {
    width: getResponsiveSpacing(36, 40, 44),
    height: getResponsiveSpacing(36, 40, 44),
    borderRadius: getResponsiveSpacing(18, 20, 22),
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: getResponsiveSpacing(14, 16, 18),
  },
  menuContent: {
    flex: 1,
  },
  menuTitle: {
    fontSize: getResponsiveFontSize(14, 16, 18),
    fontWeight: '500',
    color: '#1E293B',
    marginBottom: getResponsiveSpacing(1, 2, 3),
  },
  menuSubtitle: {
    fontSize: getResponsiveFontSize(12, 14, 16),
    color: '#64748B',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: getResponsiveSpacing(16, 20, 24),
    marginTop: getResponsiveSpacing(16, 20, 24),
    marginBottom: getResponsiveSpacing(28, 32, 36),
    backgroundColor: '#FEF2F2',
    paddingVertical: getResponsiveSpacing(14, 16, 18),
    borderRadius: getResponsiveSpacing(10, 12, 14),
  },
  logoutButtonDisabled: {
    opacity: 0.6,
    backgroundColor: '#F9FAFB',
  },
  logoutText: {
    fontSize: getResponsiveFontSize(14, 16, 18),
    fontWeight: '500',
    color: '#EF4444',
  },
  footer: {
    alignItems: 'center',
    paddingBottom: getResponsiveSpacing(16, 20, 24),
  },
  footerText: {
    fontSize: getResponsiveFontSize(10, 12, 14),
    color: '#94A3B8',
  },
  // Loading Overlay Styles
  loadingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    minWidth: 280,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  loadingText: {
    fontSize: getResponsiveFontSize(16, 17, 18),
    fontWeight: '600',
    color: '#1E293B',
    marginTop: 16,
    textAlign: 'center',
  },
  loadingSubtext: {
    fontSize: getResponsiveFontSize(13, 14, 15),
    fontWeight: '400',
    color: '#64748B',
    marginTop: 8,
    textAlign: 'center',
  },
  // Modal Styles
  modalContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: getResponsiveSpacing(16, 20, 24),
    paddingVertical: getResponsiveSpacing(14, 16, 18),
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  modalTitle: {
    fontSize: getResponsiveFontSize(16, 18, 20),
    fontWeight: '600',
    color: '#1E293B',
  },
  saveButton: {
    fontSize: getResponsiveFontSize(14, 16, 18),
    fontWeight: '600',
    color: '#3B82F6',
  },
  modalContent: {
    flex: 1,
    paddingHorizontal: getResponsiveSpacing(16, 20, 24),
    paddingTop: getResponsiveSpacing(20, 24, 28),
  },
  modalImageContainer: {
    alignItems: 'center',
    marginBottom: getResponsiveSpacing(28, 32, 36),
    position: 'relative',
  },
  modalProfileImage: {
    width: getResponsiveImageSize(100, 120, 140),
    height: getResponsiveImageSize(100, 120, 140),
    borderRadius: getResponsiveImageSize(50, 60, 70),
  },
  modalImageLoadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: getResponsiveImageSize(50, 60, 70),
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTextAvatar: {
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTextAvatarText: {
    color: '#FFFFFF',
    fontSize: getResponsiveFontSize(32, 40, 48),
    fontWeight: 'bold',
  },
  modalCameraButton: {
    position: 'absolute',
    bottom: 0,
    right: '35%',
    backgroundColor: '#3B82F6',
    borderRadius: getResponsiveSpacing(12, 16, 20),
    width: getResponsiveSpacing(28, 32, 36),
    height: getResponsiveSpacing(28, 32, 36),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  formGroup: {
    marginBottom: getResponsiveSpacing(16, 20, 24),
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  formLabel: {
    fontSize: getResponsiveFontSize(14, 16, 18),
    fontWeight: '500',
    color: '#1E293B',
    marginBottom: getResponsiveSpacing(6, 8, 10),
  },
  formInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: getResponsiveSpacing(10, 12, 14),
    paddingHorizontal: getResponsiveSpacing(14, 16, 18),
    paddingVertical: getResponsiveSpacing(12, 14, 16),
    fontSize: getResponsiveFontSize(14, 16, 18),
    color: '#1E293B',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  disabledInput: {
    backgroundColor: '#F1F5F9',
    color: '#64748B',
  },
  disabledText: {
    fontSize: getResponsiveFontSize(10, 12, 14),
    color: '#64748B',
    marginTop: getResponsiveSpacing(2, 4, 6),
  },
  warningText: {
    fontSize: getResponsiveFontSize(11, 12, 13),
    color: '#EF4444',
    fontWeight: '500',
  },
  infoText: {
    fontSize: getResponsiveFontSize(11, 12, 13),
    color: '#3B82F6',
    fontWeight: '500',
  },
  limitReachedText: {
    fontSize: getResponsiveFontSize(11, 12, 13),
    color: '#EF4444',
    marginTop: getResponsiveSpacing(4, 6, 8),
    fontStyle: 'italic',
  },
  deleteAccountSection: {
    marginTop: getResponsiveSpacing(24, 28, 32),
    marginBottom: getResponsiveSpacing(16, 20, 24),
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
  // Privacy & Security Styles
  privacySection: {
    marginBottom: getResponsiveSpacing(28, 32, 36),
  },
  privacySectionTitle: {
    fontSize: getResponsiveFontSize(16, 18, 20),
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: getResponsiveSpacing(12, 16, 20),
  },
  privacyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: getResponsiveSpacing(14, 16, 18),
    paddingHorizontal: getResponsiveSpacing(14, 16, 18),
    borderRadius: getResponsiveSpacing(10, 12, 14),
    marginBottom: getResponsiveSpacing(10, 12, 14),
    shadowColor: '#CBD5E1',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  privacyItemIcon: {
    width: getResponsiveSpacing(36, 40, 44),
    height: getResponsiveSpacing(36, 40, 44),
    borderRadius: getResponsiveSpacing(18, 20, 22),
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: getResponsiveSpacing(14, 16, 18),
  },
  privacyItemContent: {
    flex: 1,
  },
  privacyItemTitle: {
    fontSize: getResponsiveFontSize(14, 16, 18),
    fontWeight: '500',
    color: '#1E293B',
    marginBottom: getResponsiveSpacing(1, 2, 3),
  },
  privacyItemSubtitle: {
    fontSize: getResponsiveFontSize(12, 14, 16),
    color: '#64748B',
  },
  privacyInfo: {
    backgroundColor: '#F0F9FF',
    padding: getResponsiveSpacing(14, 16, 18),
    borderRadius: getResponsiveSpacing(10, 12, 14),
    marginBottom: getResponsiveSpacing(16, 20, 24),
  },
  privacyInfoTitle: {
    fontSize: getResponsiveFontSize(14, 16, 18),
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: getResponsiveSpacing(6, 8, 10),
  },
  privacyInfoText: {
    fontSize: getResponsiveFontSize(12, 14, 16),
    color: '#475569',
    lineHeight: getResponsiveSpacing(18, 20, 22),
  },
  // Terms & Privacy Styles
  termsSection: {
    marginBottom: getResponsiveSpacing(28, 32, 36),
  },
  termsSectionTitle: {
    fontSize: getResponsiveFontSize(16, 18, 20),
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: getResponsiveSpacing(12, 16, 20),
  },
  termsSubtitle: {
    fontSize: getResponsiveFontSize(14, 16, 18),
    fontWeight: '500',
    color: '#1E293B',
    marginTop: getResponsiveSpacing(12, 16, 20),
    marginBottom: getResponsiveSpacing(6, 8, 10),
  },
  termsText: {
    fontSize: getResponsiveFontSize(12, 14, 16),
    color: '#475569',
    lineHeight: getResponsiveSpacing(18, 20, 22),
  },
  // Language Selection Styles
  languageSection: {
    marginBottom: getResponsiveSpacing(24, 28, 32),
  },
  languageSectionTitle: {
    fontSize: getResponsiveFontSize(16, 18, 20),
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: getResponsiveSpacing(6, 8, 10),
  },
  languageSectionSubtitle: {
    fontSize: getResponsiveFontSize(12, 14, 16),
    color: '#64748B',
    lineHeight: getResponsiveSpacing(18, 20, 22),
  },
  languageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: getResponsiveSpacing(16, 18, 20),
    paddingHorizontal: getResponsiveSpacing(16, 18, 20),
    borderRadius: getResponsiveSpacing(10, 12, 14),
    marginBottom: getResponsiveSpacing(10, 12, 14),
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#CBD5E1',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  languageItemSelected: {
    borderColor: '#3B82F6',
    backgroundColor: '#EFF6FF',
  },
  languageItemContent: {
    flex: 1,
  },
  languageItemTitle: {
    fontSize: getResponsiveFontSize(14, 16, 18),
    fontWeight: '500',
    color: '#1E293B',
    marginBottom: getResponsiveSpacing(2, 4, 6),
  },
  languageItemTitleSelected: {
    color: '#3B82F6',
    fontWeight: '600',
  },
  languageItemSubtitle: {
    fontSize: getResponsiveFontSize(10, 12, 14),
    color: '#3B82F6',
    fontWeight: '500',
  },
  languageCheckmark: {
    width: getResponsiveSpacing(24, 28, 32),
    height: getResponsiveSpacing(24, 28, 32),
    borderRadius: getResponsiveSpacing(12, 14, 16),
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  languageCheckmarkText: {
    color: '#FFFFFF',
    fontSize: getResponsiveFontSize(12, 14, 16),
    fontWeight: 'bold',
  },
  // Refer Friends Styles
  referralHero: {
    backgroundColor: '#EEF2FF',
    padding: getResponsiveSpacing(16, 20, 24),
    borderRadius: getResponsiveSpacing(12, 14, 16),
    marginBottom: getResponsiveSpacing(20, 24, 28),
  },
  referralHeroTitle: {
    fontSize: getResponsiveFontSize(16, 18, 20),
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: getResponsiveSpacing(6, 8, 10),
  },
  referralHeroText: {
    fontSize: getResponsiveFontSize(12, 14, 16),
    color: '#475569',
    lineHeight: getResponsiveSpacing(18, 20, 22),
  },
  referralCard: {
    backgroundColor: '#FFFFFF',
    padding: getResponsiveSpacing(16, 20, 24),
    borderRadius: getResponsiveSpacing(12, 14, 16),
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: getResponsiveSpacing(20, 24, 28),
  },
  referralCardLabel: {
    fontSize: getResponsiveFontSize(12, 14, 16),
    fontWeight: '600',
    color: '#475569',
    marginBottom: getResponsiveSpacing(10, 12, 14),
  },
  referralLinkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: getResponsiveSpacing(10, 12, 14),
    paddingVertical: getResponsiveSpacing(10, 12, 14),
    paddingHorizontal: getResponsiveSpacing(12, 16, 20),
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  referralLinkText: {
    marginLeft: 10,
    color: '#1D4ED8',
    fontWeight: '600',
    flex: 1,
    flexWrap: 'wrap',
  },
  referralLinkHint: {
    marginTop: getResponsiveSpacing(10, 12, 14),
    color: '#64748B',
    fontSize: getResponsiveFontSize(11, 13, 15),
  },
  shareSection: {
    marginBottom: getResponsiveSpacing(20, 24, 28),
  },
  shareSectionTitle: {
    fontSize: getResponsiveFontSize(14, 16, 18),
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: getResponsiveSpacing(12, 14, 16),
  },
  shareButtonsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: getResponsiveSpacing(10, 12, 14),
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: getResponsiveSpacing(10, 12, 14),
    paddingVertical: getResponsiveSpacing(12, 14, 16),
    paddingHorizontal: getResponsiveSpacing(14, 16, 18),
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexGrow: 1,
    minWidth: '45%',
    gap: 10,
  },
  shareButtonText: {
    fontSize: getResponsiveFontSize(13, 15, 17),
    color: '#0F172A',
    fontWeight: '500',
  },
  referralInfoBox: {
    backgroundColor: '#ECFDF5',
    borderRadius: getResponsiveSpacing(12, 14, 16),
    padding: getResponsiveSpacing(16, 20, 24),
    borderWidth: 1,
    borderColor: '#A7F3D0',
    marginBottom: getResponsiveSpacing(20, 24, 28),
  },
  referralInfoTitle: {
    fontSize: getResponsiveFontSize(13, 15, 17),
    fontWeight: '600',
    color: '#065F46',
    marginBottom: getResponsiveSpacing(6, 8, 10),
  },
  referralInfoText: {
    fontSize: getResponsiveFontSize(12, 14, 16),
    color: '#065F46',
    lineHeight: getResponsiveSpacing(18, 20, 22),
  },
  referralPlayStoreButton: {
    backgroundColor: '#2563EB',
    borderRadius: getResponsiveSpacing(12, 14, 16),
    paddingVertical: getResponsiveSpacing(14, 16, 18),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: getResponsiveSpacing(24, 28, 32),
  },
  appStoreButton: {
    marginTop: 0,
    marginBottom: getResponsiveSpacing(24, 28, 32),
  },
  referralPlayStoreText: {
    color: '#FFFFFF',
    fontSize: getResponsiveFontSize(14, 16, 18),
    fontWeight: '600',
  },
  supportCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: getResponsiveSpacing(12, 14, 16),
    padding: getResponsiveSpacing(12, 16, 20),
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: getResponsiveSpacing(20, 24, 28),
  },
  supportSectionTitle: {
    fontSize: getResponsiveFontSize(14, 16, 18),
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: getResponsiveSpacing(8, 10, 12),
  },
  supportItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: getResponsiveSpacing(12, 14, 16),
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  supportItemFirst: {
    borderTopWidth: 0,
  },
  supportIcon: {
    width: getResponsiveSpacing(36, 40, 44),
    height: getResponsiveSpacing(36, 40, 44),
    borderRadius: getResponsiveSpacing(18, 20, 22),
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: getResponsiveSpacing(12, 14, 16),
  },
  supportContent: {
    flex: 1,
  },
  supportLabel: {
    fontSize: getResponsiveFontSize(12, 14, 16),
    color: '#475569',
    marginBottom: 2,
  },
  supportValue: {
    fontSize: getResponsiveFontSize(13, 15, 17),
    fontWeight: '500',
    color: '#0F172A',
  },
  supportInfoBox: {
    backgroundColor: '#F0FDF4',
    borderRadius: getResponsiveSpacing(12, 14, 16),
    padding: getResponsiveSpacing(14, 16, 18),
    borderWidth: 1,
    borderColor: '#BBF7D0',
    marginBottom: getResponsiveSpacing(24, 28, 32),
  },
  supportInfoTitle: {
    fontSize: getResponsiveFontSize(13, 15, 17),
    fontWeight: '600',
    color: '#166534',
    marginBottom: getResponsiveSpacing(6, 8, 10),
  },
  supportInfoText: {
    fontSize: getResponsiveFontSize(12, 14, 16),
    color: '#166534',
    lineHeight: getResponsiveSpacing(18, 20, 22),
  },
  rateStepsContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: getResponsiveSpacing(12, 14, 16),
    padding: getResponsiveSpacing(16, 20, 24),
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: getResponsiveSpacing(20, 24, 28),
  },
  rateStepsTitle: {
    fontSize: getResponsiveFontSize(14, 16, 18),
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: getResponsiveSpacing(12, 14, 16),
  },
  rateStepItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: getResponsiveSpacing(10, 12, 14),
  },
  rateStepIndex: {
    width: getResponsiveSpacing(28, 32, 36),
    height: getResponsiveSpacing(28, 32, 36),
    borderRadius: getResponsiveSpacing(14, 16, 18),
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: getResponsiveSpacing(12, 14, 16),
  },
  rateStepIndexText: {
    color: '#2563EB',
    fontWeight: '600',
  },
  rateStepText: {
    flex: 1,
    color: '#475569',
    fontSize: getResponsiveFontSize(12, 14, 16),
    lineHeight: getResponsiveSpacing(18, 20, 22),
  },
  rateReminder: {
    textAlign: 'center',
    color: '#475569',
    fontSize: getResponsiveFontSize(12, 14, 16),
    lineHeight: getResponsiveSpacing(18, 20, 22),
    marginBottom: getResponsiveSpacing(24, 28, 32),
  },
});