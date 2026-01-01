import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions, StatusBar, Image, ActivityIndicator, RefreshControl, Modal as RNModal, Platform, Linking, Share, BackHandler } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import enTranslations from '@/i18n/locales/en';
import hiTranslations from '@/i18n/locales/hi';
import knTranslations from '@/i18n/locales/kn';
import taTranslations from '@/i18n/locales/ta';
import teTranslations from '@/i18n/locales/te';
import mlTranslations from '@/i18n/locales/ml';
import { useRouter, useFocusEffect } from 'expo-router';
import { User, Phone, MapPin, LogOut, CreditCard as Edit, Bell, Shield, Globe, Volume2, CircleHelp as HelpCircle, FileText, Star, Settings, CreditCard, TriangleAlert as AlertTriangle, Trash2, Camera, X, Gift, Mail, MessageCircle, Instagram, ExternalLink, ChevronRight, Share2 } from 'lucide-react-native';
import { SafeView, useSafeAreaInsets } from '@/components/SafeView';
import { LanguageModal } from '@/components/common/LanguageModal';
import { Modal } from '@/components/common/Modal';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '@/constants/api';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import NotificationSettings from '@/components/NotificationSettings';
import { tokenManager } from '../../utils/tokenManager';

// Store links for provider app
const PLAY_STORE_LINK = 'https://play.google.com/store/apps/details?id=com.builtxpert.provider';
const APP_STORE_LINK = 'https://apps.apple.com/app/builtxpert-provider/id1234567890'; // Update with actual App Store ID when available

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

export default function ProfileScreen() {
  const { user, logout, updateUser } = useAuth();
  const { t, currentLanguageName, currentLanguage } = useLanguage();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  
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
  const [serviceCount, setServiceCount] = useState(0);
  const [jobsDone, setJobsDone] = useState(0);
  const [averageRating, setAverageRating] = useState(0);
  const [totalRatings, setTotalRatings] = useState(0);
  const [languageModalVisible, setLanguageModalVisible] = useState(false);
  const [notificationSettingsVisible, setNotificationSettingsVisible] = useState(false);
  const [referModalVisible, setReferModalVisible] = useState(false);
  const [supportModalVisible, setSupportModalVisible] = useState(false);
  const [rateModalVisible, setRateModalVisible] = useState(false);
  const [termsModalVisible, setTermsModalVisible] = useState(false);
  
  // Profile picture state
  const [userProfile, setUserProfile] = useState({
    name: user?.fullName || user?.full_name || '',
    email: user?.email || '',
    phone: user?.phone || '',
    location: '',
    image: user?.profile_pic_url || user?.profilePicUrl || '',
    createdAt: '',
  });
  const [imageLoading, setImageLoading] = useState(false);
  const [cachedImageUrl, setCachedImageUrl] = useState<string>('');
  const [imageLoadTimeout, setImageLoadTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);

  // Cache tracking state
  const [lastProfileFetch, setLastProfileFetch] = useState<number>(0);
  const [lastStatsFetch, setLastStatsFetch] = useState<number>(0);
  const [isProfileLoaded, setIsProfileLoaded] = useState(false);
  const [isStatsLoaded, setIsStatsLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);
  
  // Cache duration constants (in milliseconds)
  const PROFILE_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  const STATS_CACHE_DURATION = 2 * 60 * 1000; // 2 minutes

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

  // Helper function to get account creation year
  const getAccountCreationYear = () => {
    if (userProfile.createdAt) {
      try {
        const year = new Date(userProfile.createdAt).getFullYear();
        return year.toString();
      } catch (error) {
        return '2024';
      }
    }
    return '2024'; // Fallback year
  };

  useFocusEffect(
    React.useCallback(() => {
      const initializeProfile = async () => {
        // Load cached image first for instant display
        const cachedImage = await loadCachedProfileImage();
        
        // Initialize userProfile with user context data (but don't set name if it's empty)
        if (user) {
          const initialImage = user.profile_pic_url || '';
          
          setUserProfile((prev) => ({
            ...prev,
            name: (user.fullName || user.full_name || '').trim() !== '' ? (user.fullName || user.full_name || '') : '',
            email: user.email || '',
            phone: user.phone || '',
            image: initialImage,
            createdAt: user.createdAt || user.created_at || '',
          }));
          
          // If we have a cached image, use it immediately
          if (cachedImage && !initialImage) {
            setUserProfile((prev) => ({
              ...prev,
              image: cachedImage,
            }));
          }
        }
        
        // Check for pending uploads and retry if network is available
        await checkAndRetryPendingUpload();
        
        // Always fetch profile data on first load or if name is missing
        const now = Date.now();
        const hasValidName = userProfile.name && userProfile.name.trim() !== '' && userProfile.name !== t('profile.serviceProvider');
        const shouldFetchProfile = !hasInitialized || !isProfileLoaded || (now - lastProfileFetch) > PROFILE_CACHE_DURATION || !hasValidName;
        const shouldFetchStats = !hasInitialized || !isStatsLoaded || (now - lastStatsFetch) > STATS_CACHE_DURATION;
        
        if (shouldFetchProfile) {
          fetchUserProfile();
        } else {
        }
        
        if (shouldFetchStats) {
          fetchStats();
        } else {
        }
        
        // Mark as initialized after first run
        setHasInitialized(true);
      };
      
      
      initializeProfile();
    }, [user])
  );

  // Fetch stats function
  const fetchStats = async () => {
    try {
      const { tokenManager } = await import('@/utils/tokenManager');
      const token = await tokenManager.getValidToken();
      if (!token) {
        return;
      }
      

      // Fetch service count (existing logic)
      const serviceRes = await fetch(`${API_BASE_URL}/api/services/my-registrations`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (serviceRes.ok) {
        const data = await serviceRes.json();
        // Validate response structure and ensure registeredServices is an array
        if (data && data.data && Array.isArray(data.data.registeredServices)) {
          setServiceCount(data.data.registeredServices.length);
        } else {
          // If response structure is unexpected, default to 0
          console.warn('Unexpected response structure from my-registrations:', data);
          setServiceCount(0);
        }
      } else {
        const errorText = await serviceRes.text();
        console.error('Failed to fetch service count:', errorText);
        setServiceCount(0);
      }

      // Fetch completed bookings for jobs done
      const jobsRes = await fetch(`${API_BASE_URL}/api/providers/bookings?status=completed`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (jobsRes.ok) {
        const data = await jobsRes.json();
        setJobsDone(data.data.bookings.length);
      } else {
        const errorText = await jobsRes.text();
        setJobsDone(0);
      }

      // Fetch all bookings to calculate average rating
      const bookingsRes = await fetch(`${API_BASE_URL}/api/providers/bookings`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (bookingsRes.ok) {
        const data = await bookingsRes.json();
        const bookings = data.data.bookings;
        const ratings = bookings
          .map((b: any) => b.rating?.rating)
          .filter((r: any) => typeof r === 'number');
        if (ratings.length > 0) {
          const avg = ratings.reduce((sum: number, r: number) => sum + r, 0) / ratings.length;
          setAverageRating(Math.round(avg * 10) / 10);
          setTotalRatings(ratings.length);
        } else {
          setAverageRating(0);
          setTotalRatings(0);
        }
      } else {
        const errorText = await bookingsRes.text();
        setAverageRating(0);
        setTotalRatings(0);
      }
      
      // Update cache tracking
      setLastStatsFetch(Date.now());
      setIsStatsLoaded(true);
    } catch (e) {
      setServiceCount(0);
      setJobsDone(0);
      setAverageRating(0);
      setTotalRatings(0);
    }
  };

  // Handle orientation changes for responsive design
  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', () => {
      // Force re-render when orientation changes
      // The responsive utilities will automatically adjust
    });

    return () => subscription?.remove();
  }, []);

  useEffect(() => {
    if (!user) {
      router.replace('/auth');
    }
  }, [user]);

  // Update userProfile when user context changes
  useEffect(() => {
    if (user) {
      // Update profile with user context data
      const updatedProfile = {
        name: user.fullName || user.full_name || '',
        email: user.email || '',
        phone: user.phone || '',
        image: user.profile_pic_url || user.profilePicUrl || '',
      };
      
      setUserProfile(prev => ({
        ...prev,
        ...updatedProfile,
      }));
      
      // Cache the profile image if it exists and is valid
      const profileImageUrl = user.profile_pic_url || user.profilePicUrl;
      if (profileImageUrl && profileImageUrl.trim() !== '' && !profileImageUrl.includes('data:image')) {
        cacheProfileImage(profileImageUrl).catch(() => {
          // Silently fail - caching is not critical
        });
      }
    }
  }, [user?.profile_pic_url, user?.profilePicUrl, user?.fullName, user?.full_name, user?.email, user?.phone]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (imageLoadTimeout) {
        clearTimeout(imageLoadTimeout);
      }
    };
  }, [imageLoadTimeout]);

  // Cache the image URL when it changes
  useEffect(() => {
    // Cache the image URL when it changes
    if (userProfile.image && userProfile.image.trim() !== '') {
      cacheProfileImage(userProfile.image);
    }
  }, [userProfile]);

  // Update profile from user context if needed
  useEffect(() => {
    // If user context has a valid name and current profile doesn't, update it
    const userName = user?.fullName || user?.full_name;
    if (user && userName && userName.trim() !== '' && 
        (!userProfile.name || userProfile.name.trim() === '' || userProfile.name === t('profile.serviceProvider'))) {
      setUserProfile(prev => ({
        ...prev,
        name: userName
      }));
    }

    // If user context has a profile picture and current profile doesn't, update it
    const userProfilePic = user?.profile_pic_url || user?.profilePicUrl;
    if (user && userProfilePic && userProfilePic.trim() !== '' && 
        (!userProfile.image || userProfile.image.trim() === '')) {
      setUserProfile(prev => ({
        ...prev,
        image: userProfilePic
      }));
    }
  }, [user, userProfile.name, userProfile.image]);

  const handleLogout = async () => {
    showAlert(
      t('alerts.logout'),
      t('alerts.logoutMessage'),
      'warning',
      [
        { text: t('alerts.cancel'), onPress: () => {
          setShowAlertModal(false);
        }, style: 'secondary' },
        { 
          text: t('alerts.logoutConfirm'), 
          onPress: async () => {
            try {
              setShowAlertModal(false);
              
              // Perform logout
              await logout();
              
              // Add a small delay to ensure logout completes before navigation
              setTimeout(() => {
                try {
                  // Navigate to root index which will handle auth redirect and prevent back navigation
                  router.replace('/');
                } catch (navError) {
                  // Fallback: try to navigate to root
                  router.push('/');
                }
              }, 100);
              
            } catch (error) {
              showAlert(t('alerts.error'), t('alerts.failedToLogout'), 'error');
            }
          },
          style: 'destructive'
        }
      ]
    );
  };

  const handleDeleteAccount = async () => {
    showAlert(
      t('alerts.deleteAccount'),
      t('alerts.deleteAccountMessage'),
      'warning',
      [
        { text: t('alerts.cancel'), onPress: () => {
          setShowAlertModal(false);
        }, style: 'secondary' },
        {
          text: t('alerts.delete'),
          onPress: async () => {
            try {
              setShowAlertModal(false);
              const token = await tokenManager.getValidToken();
              if (!token) {
                showAlert(t('alerts.error'), t('alerts.noAuthToken'), 'error');
                return;
              }
              const response = await fetch(`${API_BASE_URL}/api/users/delete-account`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
              });
              if (response.ok) {
                await logout();
                showAlert(t('alerts.accountDeleted'), t('alerts.accountDeletedMessage'), 'success');
                // Navigate to root index which will handle auth redirect and prevent back navigation
                router.replace('/');
              } else {
                const data = await response.json();
                showAlert(t('alerts.error'), data.message || t('alerts.failedToDeleteAccount'), 'error');
              }
            } catch (error) {
              showAlert(t('alerts.error'), t('alerts.failedToDeleteAccount'), 'error');
            }
          },
          style: 'destructive'
        }
      ]
    );
  };

  const handleReportCustomer = () => {
    router.push('/report-customer');
  };

  // Manual refresh function for users who want fresh data
  const handleRefreshProfile = async () => {
    setRefreshing(true);
    setLastProfileFetch(0); // Force refresh by resetting cache time
    setLastStatsFetch(0);
    setIsProfileLoaded(false);
    setIsStatsLoaded(false);
    
    try {
      // Fetch fresh data
      await fetchUserProfile();
      await fetchStats();
    } finally {
      setRefreshing(false);
    }
  };

  // Profile picture management functions
  const cacheProfileImage = async (imageUrl: string) => {
    try {
      await AsyncStorage.setItem('cached_profile_image', imageUrl);
      setCachedImageUrl(imageUrl);
    } catch (error) {
    }
  };

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

  const checkAndRetryPendingUpload = async () => {
    try {
      const pendingUpload = await AsyncStorage.getItem('pending_profile_upload');
      if (pendingUpload) {
        
        // Try to upload the pending image
        const token = await tokenManager.getValidToken();
        if (token) {
          // Test network connectivity first
          try {
            const testResponse = await fetch(`${API_BASE_URL}/health`, { method: 'GET' });
            if (testResponse.ok) {
              
              // Remove the pending upload flag before attempting
              await AsyncStorage.removeItem('pending_profile_upload');
              
              // Retry the upload
              await uploadProfilePicture(pendingUpload);
            }
          } catch (networkError) {
          }
        }
      }
    } catch (error) {
      // Silently fail - pending upload check is not critical
    }
  };

  const fetchUserProfile = async () => {
    try {
      
      const token = await tokenManager.getValidToken();
      if (!token) {
        return;
      }

      // First try to get provider-specific profile data
      let response = await fetch(`${API_BASE_URL}/api/providers/profile`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        
        const profileData = data.data?.profile || {};
        
        setUserProfile({
          name: profileData.full_name || '',
          email: profileData.email || '',
          phone: profileData.phone || '',
          location: profileData.location || '',
          image: profileData.profile_pic_url || '',
          createdAt: profileData.created_at || '',
        });

        // Cache the profile image if it exists
        if (profileData.profile_pic_url) {
          await cacheProfileImage(profileData.profile_pic_url);
        }
        
        // Update cache tracking
        setLastProfileFetch(Date.now());
        setIsProfileLoaded(true);
        
        // If we got a valid name, ensure it's displayed
        if (profileData.full_name && profileData.full_name.trim() !== '') {
        }
      } else {
        // Fallback to user profile endpoint if provider endpoint fails
        
        response = await fetch(`${API_BASE_URL}/api/users/profile`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
          const data = await response.json();
          
          const profileData = data.data?.user || data.data || {};
          
          setUserProfile({
            name: profileData.fullName || profileData.full_name || '',
            email: profileData.email || '',
            phone: profileData.phone || '',
            location: profileData.location || '',
            image: profileData.profilePicUrl || profileData.profile_pic_url || '',
            createdAt: profileData.createdAt || profileData.created_at || '',
          });

          // Cache the profile image if it exists
          if (profileData.profilePicUrl || profileData.profile_pic_url) {
            await cacheProfileImage(profileData.profilePicUrl || profileData.profile_pic_url);
          }
          
          // Update cache tracking
          setLastProfileFetch(Date.now());
          setIsProfileLoaded(true);
          
          // If we got a valid name, ensure it's displayed
          if (profileData.fullName || profileData.full_name) {
            const validName = profileData.fullName || profileData.full_name;
          }
        }
      }
    } catch (error) {
      // Silently fail - profile fetch errors are handled by UI state
    }
  };

  const handleProfilePictureAction = () => {
    
    
    // Check if there's any profile picture (current, cached, or from user context)
    const hasProfilePicture = (userProfile.image && userProfile.image.trim() !== '') || 
                             (cachedImageUrl && cachedImageUrl.trim() !== '') ||
                             (user?.profile_pic_url && user.profile_pic_url.trim() !== '') ||
                             (user?.profilePicUrl && user.profilePicUrl.trim() !== '');

    if (hasProfilePicture) {
      // Show options to update or delete existing picture
      showAlert(
        'Profile Picture',
        'What would you like to do with your profile picture?',
        'info',
        [
          { text: 'Cancel', onPress: () => setShowAlertModal(false), style: 'secondary' },
          { text: 'Update Picture', onPress: () => { setShowAlertModal(false); handleTakePhoto(); }, style: 'primary' },
          { text: 'Remove Picture', onPress: () => { setShowAlertModal(false); handleDeleteProfilePicture(); }, style: 'destructive' }
        ]
      );
    } else {
      // Show options to add new picture
      showAlert(
        'Add Profile Picture',
        'Choose an option to add your profile picture',
        'info',
        [
          { text: 'Cancel', onPress: () => setShowAlertModal(false), style: 'secondary' },
          { text: 'Take Photo', onPress: () => { setShowAlertModal(false); handleTakePhoto(); }, style: 'primary' },
          { text: 'Choose from Gallery', onPress: () => { setShowAlertModal(false); handleChooseFromGallery(); }, style: 'primary' }
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
    let optimizedImage: ImageManipulator.ImageResult | null = null;
    try {
      showAlert('Uploading Photo', 'Please wait while we update your profile picture', 'info');
      
      const token = await tokenManager.getValidToken();
      if (!token) {
        showAlert('Error', 'Authentication required. Please login again.', 'error');
        return;
      }

      optimizedImage = await ImageManipulator.manipulateAsync(
        imageUri,
        [{ resize: { width: 1080 } }],
        { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );

      if (!optimizedImage.base64) {
        showAlert('Unable to Process Photo', 'Please try selecting a different image', 'error');
        return;
      }

      const localUri = optimizedImage?.uri;
      if (localUri) {
        setUserProfile(prev => ({ ...prev, image: localUri }));
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
        } else if (data.data && data.data.profile_pic_url) {
          newImageUrl = data.data.profile_pic_url;
        } else if (data.user && data.user.profilePicUrl) {
          newImageUrl = data.user.profilePicUrl;
        } else if (data.profile_pic_url) {
          newImageUrl = data.profile_pic_url;
        }
        
        
        if (newImageUrl) {
          setUserProfile(prev => ({ ...prev, image: newImageUrl }));
          await cacheProfileImage(newImageUrl);
          
          if (user) {
            await updateUser({ profile_pic_url: newImageUrl });
          }
          
          await fetchUserProfile();
          
          setTimeout(() => {
            showAlert('Profile Picture Updated', 'Your profile picture has been updated successfully', 'success');
          }, 100);
        } else {
          showAlert('Update Unsuccessful', 'Unable to save your profile picture. Please try again', 'error');
        }
      } else {
        const errorData = await uploadResponse.json();
        showAlert('Update Unsuccessful', errorData.message || 'Unable to update your profile picture. Please try again', 'error');
      }
    } catch (error) {
      // Check if it's a network connectivity issue
      const errorMessage = (error as Error)?.message || '';
      if (errorMessage.includes('Network request failed') || errorMessage.includes('Unable to resolve host')) {
        
        // Store the image locally for later upload when network is restored
        try {
          const optimizedForOffline = optimizedImage?.uri || imageUri;
          await AsyncStorage.setItem('pending_profile_upload', optimizedForOffline);
          
          // Update UI with local image immediately
          setUserProfile(prev => ({ ...prev, image: optimizedForOffline }));
          await cacheProfileImage(optimizedForOffline);
          
          showAlert('Saved for Later', 'Your profile picture has been saved and will be uploaded when your connection is restored', 'warning');
        } catch (storageError) {
          showAlert('Connection Problem', 'Unable to upload your profile picture. Please check your internet and try again', 'error');
        }
      } else {
        showAlert('Upload Unsuccessful', 'Unable to upload your profile picture. Please check your connection and try again', 'error');
      }
    }
  };

  const handleDeleteProfilePicture = async () => {
    try {
      
      const token = await tokenManager.getValidToken();
      if (!token) {
        showAlert('Error', 'Authentication required. Please login again.', 'error');
        return;
      }

      
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
        const responseData = await response.json();
        
        setUserProfile(prev => ({ ...prev, image: '' }));
        await AsyncStorage.removeItem('cached_profile_image');
        setCachedImageUrl('');
        
        // Update user context to clear profile picture
        if (user) {
          await updateUser({ profile_pic_url: '' });
        }
        
        // Refresh user profile data
        await fetchUserProfile();
        
        // Small delay to ensure state updates are processed
        setTimeout(() => {
          showAlert('Profile Picture Removed', 'Your profile picture has been removed successfully', 'success');
        }, 100);
      } else {
        const errorData = await response.json();
        showAlert('Unable to Remove Photo', errorData.message || 'Something went wrong. Please try again', 'error');
      }
    } catch (error) {
      showAlert('Unable to Remove Photo', 'Please check your connection and try again', 'error');
    }
  };

  // Handle Android hardware back button
  useFocusEffect(
    React.useCallback(() => {
      const handleHardwareBack = () => {
        if (notificationSettingsVisible) {
          setNotificationSettingsVisible(false);
          return true;
        }
        if (referModalVisible) {
          setReferModalVisible(false);
          return true;
        }
        if (supportModalVisible) {
          setSupportModalVisible(false);
          return true;
        }
        if (rateModalVisible) {
          setRateModalVisible(false);
          return true;
        }
        if (languageModalVisible) {
          setLanguageModalVisible(false);
          return true;
        }
        if (showAlertModal) {
          setShowAlertModal(false);
          return true;
        }
        return false;
      };

      if (Platform.OS === 'android') {
        const subscription = BackHandler.addEventListener('hardwareBackPress', handleHardwareBack);
        return () => {
          subscription.remove();
        };
      }
    }, [
      notificationSettingsVisible,
      referModalVisible,
      supportModalVisible,
      rateModalVisible,
      languageModalVisible,
      showAlertModal,
    ])
  );

  const handleSettingsAction = (action: string) => {
    if (action === 'notifications') {
      setNotificationSettingsVisible(true);
      return;
    }
    
    if (action === 'edit-profile') {
      router.push('/edit-profile');
      return;
    }
    
    if (action === 'help') {
      setSupportModalVisible(true);
      return;
    }
    
    if (action === 'rate') {
      setRateModalVisible(true);
      return;
    }
    
    const settingsInfo = {
      'notifications': {
        title: t('settings.notifications.title'),
        message: t('settings.notifications.message')
      },
      'privacy': {
        title: t('settings.privacy.title'),
        message: t('settings.privacy.message')
      },
      'language': {
        title: t('settings.language.title'),
        message: t('settings.language.message')
      },
      'sound': {
        title: t('settings.sound.title'),
        message: t('settings.sound.message')
      },
      'terms': {
        title: t('settings.terms.title'),
        message: t('settings.terms.message')
      }
    };

    if (action === 'terms') {
      setTermsModalVisible(true);
      return;
    };

    const info = settingsInfo[action as keyof typeof settingsInfo];
    if (info) {
      showAlert(info.title, info.message, 'info');
    }
  };

  const getReferralMessage = () => {
    const message = `Hey! I have been using BuildXpert Provider for reliable service bookings. Download it here:\n\n📱 Android: ${PLAY_STORE_LINK}\n🍎 iOS: ${APP_STORE_LINK}`;
    return message;
  };

  const openReferModal = () => {
    setReferModalVisible(true);
  };

  const openSupportModal = () => {
    setSupportModalVisible(true);
  };

  const openRateModal = () => {
    setRateModalVisible(true);
  };

  const openPlayStoreLink = async () => {
    try {
      const supported = await Linking.canOpenURL(PLAY_STORE_LINK);
      if (supported) {
        await Linking.openURL(PLAY_STORE_LINK);
      } else {
        showAlert('Unable to Open Play Store', 'Please try opening the Play Store manually', 'error');
      }
    } catch (error) {
      showAlert('Unable to Open Play Store', 'Please try opening the Play Store manually', 'error');
    }
  };

  const openPlayStoreForRating = async () => {
    try {
      const supported = await Linking.canOpenURL(PLAY_STORE_LINK);
      if (supported) {
        await Linking.openURL(PLAY_STORE_LINK);
      } else {
        showAlert('Error', t('rateAppModal.error'), 'error');
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
        showAlert('Error', t('rateAppModal.error'), 'error');
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
      showAlert('Unable to Share', 'Please try again in a moment', 'error');
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
        showAlert('Error', t('supportModal.emailError'), 'error');
      }
    } catch (error) {
      showAlert('Error', t('supportModal.emailError'), 'error');
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
        showAlert('Error', t('supportModal.phoneError'), 'error');
      }
    } catch (error) {
      showAlert('Error', t('supportModal.phoneError'), 'error');
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
        showAlert('Error', t('supportModal.whatsappError'), 'error');
      }
    } catch (error) {
      showAlert('Error', t('supportModal.whatsappError'), 'error');
    }
  };

  const ratingSteps = useMemo(() => [
    t('rateAppModal.steps.one'),
    t('rateAppModal.steps.two'),
    t('rateAppModal.steps.three'),
  ], [t, currentLanguageName]);

  // Memoize arrays for Terms & Privacy modal to ensure they're always arrays
  const providerResponsibilitiesList = useMemo(() => {
    return getArrayTranslation('termsPrivacy.providerResponsibilitiesList');
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

  return (
    <SafeView backgroundColor="#F8FAFC" excludeBottom={true}>
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefreshProfile}
            colors={['#3B82F6']}
            tintColor="#3B82F6"
          />
        }
      >
        {/* Profile Header */}
        <View style={styles.profileHeader}>
          <View style={styles.profileIconContainer}>
            {(userProfile.image && userProfile.image.trim() !== '') || (cachedImageUrl && cachedImageUrl.trim() !== '') || (user?.profile_pic_url && user.profile_pic_url.trim() !== '') || (user?.profilePicUrl && user.profilePicUrl.trim() !== '') ? (
              <Image 
                source={{ uri: userProfile.image || cachedImageUrl || user?.profile_pic_url || user?.profilePicUrl }} 
                style={styles.profileImage} 
                resizeMode="cover"
                onLoadStart={() => {
                  const imageUri = userProfile.image || cachedImageUrl || user?.profile_pic_url || user?.profilePicUrl;
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
                    
                    // For network errors, keep the image URL but show text avatar
                    // This way when network is restored, the image can be retried
                  } else {
                    // For other errors (invalid URL, etc.), clear the image
                    setUserProfile(prev => ({ ...prev, image: '' }));
                    // Also clear from cache if it's invalid
                    AsyncStorage.removeItem('cached_profile_image').catch(() => {
                      // Silently fail - cache cleanup is not critical
                    });
                    setCachedImageUrl('');
                  }
                  
                  setImageLoading(false);
                }}
              />
            ) : (
              <View style={[styles.profileImage, styles.textAvatar]}>
                <Text style={styles.textAvatarText}>
                  {userProfile.name ? userProfile.name.charAt(0).toUpperCase() : 'P'}
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
          <Text style={styles.welcomeText} numberOfLines={1} ellipsizeMode="tail">
            {userProfile.name && userProfile.name.trim() !== '' ? userProfile.name : t('profile.serviceProvider')}
          </Text>
          <Text style={styles.memberSince}>
            {t('profile.professionalMember')} • {getAccountCreationYear()}
            {isProfileLoaded && (
              <Text style={styles.cacheIndicator}>
                {' '}• {Date.now() - lastProfileFetch < PROFILE_CACHE_DURATION ? '🔄' : '✅'}
              </Text>
            )}
          </Text>
          
          {/* Quick Stats */}
          <View style={styles.quickStats}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{serviceCount}</Text>
              <Text style={styles.statLabel}>{t('profile.services')}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{averageRating > 0 ? averageRating.toFixed(1) : 'N/A'}</Text>
              <Text style={styles.statLabel}>{t('profile.rating')}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{jobsDone}</Text>
              <Text style={styles.statLabel}>{t('profile.jobsDone')}</Text>
            </View>
          </View>
        </View>

        {/* Profile Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('profile.profileInformation')}</Text>
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Phone size={20} color="#6B7280" />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>{t('profile.phoneNumber')}</Text>
                <Text style={styles.infoValue}>{user?.phone}</Text>
              </View>
            </View>

            <View style={styles.infoRow}>
              <MapPin size={20} color="#6B7280" />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>{t('profile.activeServices')}</Text>
                <Text style={styles.infoValue}>
                  {serviceCount} {t('profile.servicesRegistered')}
                </Text>
              </View>
            </View>

            <View style={styles.infoRow}>
              <CreditCard size={20} color="#6B7280" />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>{t('profile.accountStatus')}</Text>
                <Text style={[styles.infoValue, styles.activeStatus]}>{t('profile.activeProfessional')}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Report Customer Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('profile.supportAndReporting')}</Text>
          <TouchableOpacity 
            style={styles.reportButton}
            onPress={handleReportCustomer}
            activeOpacity={0.7}
          >
            <AlertTriangle size={20} color="#DC2626" />
            <View style={styles.actionButtonContent}>
              <Text style={styles.reportButtonText} numberOfLines={1}>
                {t('profile.reportCustomer')}
              </Text>
            </View>
            <View style={styles.actionButtonArrow}>
              <Text style={styles.arrowText}>›</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Account Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('profile.accountSettings')}</Text>
          
          <TouchableOpacity 
            style={styles.actionButton}
            onPress={() => handleSettingsAction('edit-profile')}
          >
            <Edit size={20} color="#6B7280" />
            <View style={styles.actionButtonContent}>
              <Text style={styles.actionButtonText}>{t('profile.editProfile')}</Text>
            </View>
            <View style={styles.actionButtonArrow}>
              <Text style={styles.arrowText}>›</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.actionButton}
            onPress={() => handleSettingsAction('notifications')}
          >
            <Bell size={20} color="#6B7280" />
            <View style={styles.actionButtonContent}>
              <Text style={styles.actionButtonText}>{t('profile.notifications')}</Text>
            </View>
            <View style={styles.actionButtonArrow}>
              <Text style={styles.arrowText}>›</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* App Preferences */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('profile.appPreferences')}</Text>
          
          <TouchableOpacity 
            style={styles.actionButton}
            onPress={() => setLanguageModalVisible(true)}
          >
            <Globe size={20} color="#6B7280" />
            <View style={styles.actionButtonContent}>
              <Text style={styles.actionButtonText}>{t('profile.language')}</Text>
              <Text style={styles.actionButtonSubtext}>{currentLanguageName}</Text>
            </View>
            <View style={styles.actionButtonArrow}>
              <Text style={styles.arrowText}>›</Text>
            </View>
          </TouchableOpacity>


          <TouchableOpacity 
            style={styles.actionButton}
            onPress={() => handleSettingsAction('sound')}
          >
            <Volume2 size={20} color="#6B7280" />
            <View style={styles.actionButtonContent}>
              <Text style={styles.actionButtonText}>{t('profile.soundAndVibration')}</Text>
            </View>
            <View style={styles.actionButtonArrow}>
              <Text style={styles.arrowText}>›</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Support & Feedback */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('profile.supportAndFeedback')}</Text>
          
          <TouchableOpacity 
            style={styles.actionButton}
            onPress={() => handleSettingsAction('help')}
          >
            <HelpCircle size={20} color="#6B7280" />
            <View style={styles.actionButtonContent}>
              <Text style={styles.actionButtonText}>{t('profile.helpAndSupport')}</Text>
            </View>
            <View style={styles.actionButtonArrow}>
              <Text style={styles.arrowText}>›</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.actionButton}
            onPress={openReferModal}
          >
            <Gift size={20} color="#6B7280" />
            <View style={styles.actionButtonContent}>
              <Text style={styles.actionButtonText}>Refer a Friend</Text>
            </View>
            <View style={styles.actionButtonArrow}>
              <Text style={styles.arrowText}>›</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.actionButton}
            onPress={() => handleSettingsAction('rate')}
          >
            <Star size={20} color="#6B7280" />
            <View style={styles.actionButtonContent}>
              <Text style={styles.actionButtonText}>{t('profile.rateOurApp')}</Text>
            </View>
            <View style={styles.actionButtonArrow}>
              <Text style={styles.arrowText}>›</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Legal */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('profile.legalAndPolicies')}</Text>
          
          <TouchableOpacity 
            style={styles.actionButton}
            onPress={() => handleSettingsAction('terms')}
          >
            <FileText size={20} color="#6B7280" />
            <View style={styles.actionButtonContent}>
              <Text style={styles.actionButtonText}>{t('profile.termsAndConditions')}</Text>
            </View>
            <View style={styles.actionButtonArrow}>
              <Text style={styles.arrowText}>›</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Logout Button */}
        <View style={[styles.section, styles.lastSection]}>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <LogOut size={20} color="#EF4444" />
            <Text style={styles.logoutButtonText}>{t('profile.logout')}</Text>
          </TouchableOpacity>
        </View>

        {/* App Info */}
        <View style={styles.appInfo}>
          <Text style={styles.appVersion}>{t('profile.appVersion')}</Text>
          <Text style={styles.copyright}>{t('profile.copyright')}</Text>
        </View>

        {/* Language Modal */}
        <LanguageModal 
          visible={languageModalVisible}
          onClose={() => setLanguageModalVisible(false)}
        />
      </ScrollView>

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
                <ExternalLink size={getResponsiveSpacing(14, 16, 18)} color="#2563EB" />
                <Text style={styles.referralLinkText}>{PLAY_STORE_LINK}</Text>
              </TouchableOpacity>
              <Text style={styles.referralLinkHint}>{t('referFriendsModal.linkHint')}</Text>
            </View>

            <View style={styles.shareSection}>
              <Text style={styles.shareSectionTitle}>{t('referFriendsModal.shareVia')}</Text>
              <View style={styles.shareButtonsRow}>
                <TouchableOpacity style={styles.shareButton} onPress={shareApp}>
                  <Share2 size={getResponsiveSpacing(16, 18, 20)} color="#0F172A" />
                  <Text style={styles.shareButtonText}>{t('referFriendsModal.shareGeneric')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.shareButton} onPress={shareViaWhatsApp}>
                  <MessageCircle size={getResponsiveSpacing(16, 18, 20)} color="#0F172A" />
                  <Text style={styles.shareButtonText}>{t('referFriendsModal.shareWhatsApp')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.shareButton} onPress={shareViaInstagram}>
                  <Instagram size={getResponsiveSpacing(16, 18, 20)} color="#0F172A" />
                  <Text style={styles.shareButtonText}>{t('referFriendsModal.shareInstagram')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.shareButton} onPress={shareViaSms}>
                  <MessageCircle size={getResponsiveSpacing(16, 18, 20)} color="#0F172A" />
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
                  <Mail size={getResponsiveSpacing(16, 18, 20)} color="#1D4ED8" />
                </View>
                <View style={styles.supportContent}>
                  <Text style={styles.supportLabel}>{t('supportModal.emailLabel')}</Text>
                  <Text style={styles.supportValue}>{t('supportModal.emailAddress')}</Text>
                </View>
                <ChevronRight size={getResponsiveSpacing(16, 18, 20)} color="#94A3B8" />
              </TouchableOpacity>

              <TouchableOpacity style={styles.supportItem} onPress={callSupportNumber}>
                <View style={styles.supportIcon}>
                  <Phone size={getResponsiveSpacing(16, 18, 20)} color="#059669" />
                </View>
                <View style={styles.supportContent}>
                  <Text style={styles.supportLabel}>{t('supportModal.phoneLabel')}</Text>
                  <Text style={styles.supportValue}>{t('supportModal.displayPhoneNumber')}</Text>
                </View>
                <ChevronRight size={getResponsiveSpacing(16, 18, 20)} color="#94A3B8" />
              </TouchableOpacity>

              <TouchableOpacity style={styles.supportItem} onPress={openWhatsAppSupport}>
                <View style={styles.supportIcon}>
                  <MessageCircle size={getResponsiveSpacing(16, 18, 20)} color="#10B981" />
                </View>
                <View style={styles.supportContent}>
                  <Text style={styles.supportLabel}>{t('supportModal.whatsappLabel')}</Text>
                  <Text style={styles.supportValue}>{t('supportModal.displayWhatsApp')}</Text>
                </View>
                <ChevronRight size={getResponsiveSpacing(16, 18, 20)} color="#94A3B8" />
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
              {ratingSteps.map((step, index) => (
                <View key={index} style={styles.rateStepItem}>
                  <View style={styles.rateStepIndex}>
                    <Text style={styles.rateStepIndexText}>{index + 1}</Text>
                  </View>
                  <Text style={styles.rateStepText}>{step}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity style={[styles.referralPlayStoreButton, { marginBottom: 12 }]} onPress={openPlayStoreForRating}>
              <Text style={styles.referralPlayStoreText}>{t('rateAppModal.openStore')}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.referralPlayStoreButton, styles.appStoreButton]} onPress={openAppStoreForRating}>
              <Text style={styles.referralPlayStoreText}>{t('rateAppModal.openAppStore')}</Text>
            </TouchableOpacity>

            <Text style={styles.rateReminder}>{t('rateAppModal.reminder')}</Text>
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
              
              <Text style={styles.termsSubtitle}>{t('termsPrivacy.providerResponsibilities')}</Text>
              <Text style={styles.termsText}>
                {providerResponsibilitiesList.map((item: string, index: number) => 
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: getResponsiveSpacing(8, 10, 12), // Minimal padding for scroll end
  },
  profileHeader: {
    alignItems: 'center',
    padding: getResponsiveSpacing(20, 24, 28),
    backgroundColor: '#FFFFFF',
    marginBottom: getResponsiveSpacing(12, 14, 16),
  },
  profileIconContainer: {
    width: getResponsiveSpacing(100, 110, 120),
    height: getResponsiveSpacing(100, 110, 120),
    borderRadius: getResponsiveSpacing(50, 55, 60),
    backgroundColor: '#EBF8FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: getResponsiveSpacing(12, 14, 16),
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
    position: 'relative',
  },
  profileImage: {
    width: getResponsiveSpacing(100, 110, 120),
    height: getResponsiveSpacing(100, 110, 120),
    borderRadius: getResponsiveSpacing(50, 55, 60),
  },
  textAvatar: {
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  textAvatarText: {
    fontSize: getResponsiveSpacing(40, 44, 48),
    fontFamily: 'Inter-Bold',
    color: '#FFFFFF',
  },
  imageLoadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: getResponsiveSpacing(50, 55, 60),
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#3B82F6',
    borderRadius: getResponsiveSpacing(16, 18, 20),
    width: getResponsiveSpacing(32, 36, 40),
    height: getResponsiveSpacing(32, 36, 40),
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  welcomeText: {
    fontSize: getResponsiveSpacing(22, 24, 26),
    fontFamily: 'Inter-Bold',
    color: '#1F2937',
    marginBottom: getResponsiveSpacing(4, 5, 6),
    flexShrink: 1,
  },
  memberSince: {
    fontSize: getResponsiveSpacing(12, 13, 14),
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
    marginBottom: getResponsiveSpacing(12, 14, 16),
  },
  cacheIndicator: {
    fontSize: getResponsiveSpacing(10, 11, 12),
    fontFamily: 'Inter-Regular',
    color: '#9CA3AF',
  },
  quickStats: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingVertical: getResponsiveSpacing(12, 14, 16),
    paddingHorizontal: getResponsiveSpacing(16, 20, 24),
    borderRadius: getResponsiveSpacing(14, 16, 18),
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statNumber: {
    fontSize: getResponsiveSpacing(18, 20, 22),
    fontFamily: 'Inter-Bold',
    color: '#1F2937',
    marginTop: 2,
    marginBottom: 2,
  },
  statLabel: {
    fontSize: getResponsiveSpacing(11, 12, 13),
    fontFamily: 'Inter-Medium',
    color: '#6B7280',
  },
  statDivider: {
    width: 1,
    height: getResponsiveSpacing(32, 36, 40),
    backgroundColor: '#E5E7EB',
    marginHorizontal: getResponsiveSpacing(12, 14, 16),
  },
  section: {
    paddingHorizontal: getResponsiveSpacing(16, 20, 24),
    marginBottom: getResponsiveSpacing(12, 14, 16), // Reduced marginBottom to prevent excessive blank space
  },
  lastSection: {
    marginBottom: getResponsiveSpacing(8, 10, 12), // Even less margin for last section
  },
  sectionTitle: {
    fontSize: getResponsiveSpacing(16, 17, 18),
    fontFamily: 'Inter-Bold',
    color: '#1F2937',
    marginBottom: getResponsiveSpacing(10, 12, 14),
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: getResponsiveSpacing(16, 18, 20),
    padding: getResponsiveSpacing(14, 16, 18),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: getResponsiveSpacing(12, 14, 16),
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  infoContent: {
    marginLeft: getResponsiveSpacing(12, 14, 16), // Spacing between icon and content
    flex: 1,
  },
  infoLabel: {
    fontSize: getResponsiveSpacing(12, 13, 14),
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
    marginBottom: 2,
  },
  infoValue: {
    fontSize: getResponsiveSpacing(14, 15, 16),
    fontFamily: 'Inter-SemiBold',
    color: '#1F2937',
  },
  activeStatus: {
    color: '#10B981',
  },
  reportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    paddingVertical: getResponsiveSpacing(14, 16, 18),
    paddingHorizontal: getResponsiveSpacing(16, 18, 20),
    borderRadius: getResponsiveSpacing(14, 16, 18),
    marginBottom: 0, // Remove marginBottom since it's the only item in the section
    borderWidth: 1,
    borderColor: '#FECACA',
    minHeight: getResponsiveSpacing(48, 52, 56), // Ensure minimum height for proper rendering
  },
  reportButtonText: {
    fontSize: getResponsiveSpacing(14, 15, 16),
    fontFamily: 'Inter-SemiBold',
    color: '#DC2626',
    flex: 1, // Ensure text takes available space
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: getResponsiveSpacing(14, 16, 18),
    paddingHorizontal: getResponsiveSpacing(16, 18, 20),
    borderRadius: getResponsiveSpacing(14, 16, 18),
    marginBottom: getResponsiveSpacing(8, 10, 12),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  actionButtonContent: {
    flex: 1,
    marginLeft: getResponsiveSpacing(12, 14, 16), // Spacing between icon and content
  },
  actionButtonText: {
    fontSize: getResponsiveSpacing(14, 15, 16),
    fontFamily: 'Inter-Medium',
    color: '#374151',
  },
  actionButtonSubtext: {
    fontSize: getResponsiveSpacing(12, 13, 14),
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
    marginTop: 2,
  },
  actionButtonArrow: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  arrowText: {
    fontSize: 18,
    color: '#9CA3AF',
    fontFamily: 'Inter-Regular',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF2F2',
    paddingVertical: getResponsiveSpacing(14, 16, 18),
    borderRadius: getResponsiveSpacing(14, 16, 18),
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  logoutButtonText: {
    fontSize: getResponsiveSpacing(14, 15, 16),
    fontFamily: 'Inter-SemiBold',
    color: '#EF4444',
    marginLeft: getResponsiveSpacing(6, 8, 10),
  },
  deleteButton: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff0f0',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingVertical: 16,
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  deleteButtonText: {
    color: '#EF4444',
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    letterSpacing: 0.2,
  },
  appInfo: {
    alignItems: 'center',
    paddingVertical: getResponsiveSpacing(12, 16, 20), // Reduced padding to minimize blank space
    paddingHorizontal: getResponsiveSpacing(16, 20, 24),
    marginBottom: getResponsiveSpacing(8, 10, 12), // Add small margin instead of relying on section margin
  },
  appVersion: {
    fontSize: getResponsiveSpacing(12, 13, 14),
    fontFamily: 'Inter-Medium',
    color: '#9CA3AF',
    marginBottom: getResponsiveSpacing(4, 6, 8),
  },
  copyright: {
    fontSize: getResponsiveSpacing(10, 11, 12),
    fontFamily: 'Inter-Regular',
    color: '#9CA3AF',
    textAlign: 'center',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    color: '#1F2937',
    fontWeight: '600',
  },
  modalContent: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  // Refer Friends Modal Styles
  referralHero: {
    backgroundColor: '#EEF2FF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  referralHeroTitle: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#1E293B',
    marginBottom: 6,
  },
  referralHeroText: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#475569',
    lineHeight: 18,
  },
  referralCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 20,
  },
  referralCardLabel: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
    color: '#475569',
    marginBottom: 10,
  },
  referralLinkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  referralLinkText: {
    marginLeft: 10,
    color: '#1D4ED8',
    fontFamily: 'Inter-SemiBold',
    flex: 1,
    flexWrap: 'wrap',
    fontSize: 12,
  },
  referralLinkHint: {
    marginTop: 10,
    color: '#64748B',
    fontSize: 11,
    fontFamily: 'Inter-Regular',
  },
  shareSection: {
    marginBottom: 20,
  },
  shareSectionTitle: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: '#1E293B',
    marginBottom: 12,
  },
  shareButtonsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexGrow: 1,
    minWidth: '45%',
    gap: 10,
  },
  shareButtonText: {
    fontSize: 13,
    color: '#0F172A',
    fontFamily: 'Inter-Medium',
  },
  referralInfoBox: {
    backgroundColor: '#ECFDF5',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    marginBottom: 20,
  },
  referralInfoTitle: {
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
    color: '#065F46',
    marginBottom: 6,
  },
  referralInfoText: {
    fontSize: 12,
    color: '#065F46',
    lineHeight: 18,
    fontFamily: 'Inter-Regular',
  },
  referralPlayStoreButton: {
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  appStoreButton: {
    marginTop: 0,
    marginBottom: 24,
  },
  referralPlayStoreText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
  },
  // Support Modal Styles
  supportCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 20,
  },
  supportSectionTitle: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: '#1E293B',
    marginBottom: 8,
  },
  supportItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  supportIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  supportContent: {
    flex: 1,
  },
  supportLabel: {
    fontSize: 12,
    color: '#475569',
    marginBottom: 2,
    fontFamily: 'Inter-Regular',
  },
  supportValue: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    color: '#0F172A',
  },
  supportInfoBox: {
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    marginBottom: 24,
  },
  supportInfoTitle: {
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
    color: '#166534',
    marginBottom: 6,
  },
  supportInfoText: {
    fontSize: 12,
    color: '#166534',
    lineHeight: 18,
    fontFamily: 'Inter-Regular',
  },
  // Rate App Modal Styles
  rateStepsContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 20,
  },
  rateStepsTitle: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: '#1E293B',
    marginBottom: 12,
  },
  rateStepItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  rateStepIndex: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rateStepIndexText: {
    color: '#2563EB',
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
  },
  rateStepText: {
    flex: 1,
    color: '#475569',
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'Inter-Regular',
  },
  rateReminder: {
    textAlign: 'center',
    color: '#475569',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 24,
    fontFamily: 'Inter-Regular',
  },
  // Terms & Privacy Styles
  termsSection: {
    marginBottom: 28,
  },
  termsSectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 16,
  },
  termsSubtitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1E293B',
    marginTop: 16,
    marginBottom: 8,
  },
  termsText: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 20,
  },
});