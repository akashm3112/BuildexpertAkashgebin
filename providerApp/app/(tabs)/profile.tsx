import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, BackHandler, Dimensions, StatusBar, Image, ActivityIndicator, RefreshControl } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { useRouter, useFocusEffect } from 'expo-router';
import { User, Phone, MapPin, LogOut, CreditCard as Edit, Bell, Shield, Globe, Volume2, CircleHelp as HelpCircle, FileText, Star, Settings, CreditCard, TriangleAlert as AlertTriangle, Trash2, Camera } from 'lucide-react-native';
import { SafeView } from '@/components/SafeView';
import { LanguageModal } from '@/components/common/LanguageModal';
import { Modal } from '@/components/common/Modal';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '@/constants/api';
import * as ImagePicker from 'expo-image-picker';
import NotificationSettings from '@/components/NotificationSettings';
import { tokenManager } from '../../utils/tokenManager';

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
  const { t, currentLanguageName } = useLanguage();
  const router = useRouter();
  const [serviceCount, setServiceCount] = useState(0);
  const [jobsDone, setJobsDone] = useState(0);
  const [averageRating, setAverageRating] = useState(0);
  const [totalRatings, setTotalRatings] = useState(0);
  const [languageModalVisible, setLanguageModalVisible] = useState(false);
  const [notificationSettingsVisible, setNotificationSettingsVisible] = useState(false);
  
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
        console.error('Error parsing creation date:', error);
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
          console.log('🖼️ Initial profile picture URL:', initialImage);
          console.log('👤 User context data:', {
            fullName: user.fullName,
            full_name: user.full_name,
            email: user.email,
            phone: user.phone,
            createdAt: user.createdAt || user.created_at
          });
          
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
        
        console.log('🔄 Cache check:', {
          shouldFetchProfile,
          shouldFetchStats,
          profileCacheAge: now - lastProfileFetch,
          statsCacheAge: now - lastStatsFetch,
          isProfileLoaded,
          isStatsLoaded,
          hasValidName,
          currentName: userProfile.name
        });
        
        if (shouldFetchProfile) {
          console.log('🔄 Fetching profile data (cache expired or name missing)');
          fetchUserProfile();
        } else {
          console.log('✅ Using cached profile data');
        }
        
        if (shouldFetchStats) {
          fetchStats();
        } else {
          console.log('✅ Using cached stats data');
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
      console.log('🔄 Fetching stats from backend...');
      
      let token = user?.token;
      if (!token) {
        const storedToken = await AsyncStorage.getItem('token');
        token = storedToken || undefined;
      }
      if (!token) {
        console.log('🔍 fetchStats: No token available');
        return;
      }
      
      console.log('🔍 fetchStats: Token available, making API calls...');

      // Fetch service count (existing logic)
      console.log('🔍 fetchStats: Fetching service registrations...');
      const serviceRes = await fetch(`${API_BASE_URL}/api/services/my-registrations`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      console.log('🔍 fetchStats: Service registrations response status:', serviceRes.status);
      if (serviceRes.ok) {
        const data = await serviceRes.json();
        setServiceCount(data.data.registeredServices.length);
        console.log('✅ fetchStats: Service count set to:', data.data.registeredServices.length);
      } else {
        const errorText = await serviceRes.text();
        console.log('❌ fetchStats: Service registrations error:', serviceRes.status, errorText);
      }

      // Fetch completed bookings for jobs done
      console.log('🔍 fetchStats: Fetching completed bookings...');
      const jobsRes = await fetch(`${API_BASE_URL}/api/providers/bookings?status=completed`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      console.log('🔍 fetchStats: Completed bookings response status:', jobsRes.status);
      if (jobsRes.ok) {
        const data = await jobsRes.json();
        setJobsDone(data.data.bookings.length);
        console.log('✅ fetchStats: Jobs done set to:', data.data.bookings.length);
      } else {
        const errorText = await jobsRes.text();
        console.log('❌ fetchStats: Completed bookings error:', jobsRes.status, errorText);
        setJobsDone(0);
      }

      // Fetch all bookings to calculate average rating
      console.log('🔍 fetchStats: Fetching all bookings for ratings...');
      const bookingsRes = await fetch(`${API_BASE_URL}/api/providers/bookings`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      console.log('🔍 fetchStats: All bookings response status:', bookingsRes.status);
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
          console.log('✅ fetchStats: Average rating set to:', Math.round(avg * 10) / 10, 'from', ratings.length, 'ratings');
        } else {
          setAverageRating(0);
          setTotalRatings(0);
          console.log('✅ fetchStats: No ratings found, set to 0');
        }
      } else {
        const errorText = await bookingsRes.text();
        console.log('❌ fetchStats: All bookings error:', bookingsRes.status, errorText);
        setAverageRating(0);
        setTotalRatings(0);
      }
      
      // Update cache tracking
      setLastStatsFetch(Date.now());
      setIsStatsLoaded(true);
      console.log('✅ Stats data cached successfully');
    } catch (e) {
      setServiceCount(0);
      setJobsDone(0);
      setAverageRating(0);
      setTotalRatings(0);
      console.error('Error fetching stats:', e);
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
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!user) return true;
      return false;
    });
    return () => backHandler.remove();
  }, [user]);

  // Update userProfile when user context changes
  useEffect(() => {
    if (user) {
      console.log('👤 Updating userProfile from user context:', {
        profile_pic_url: user.profile_pic_url,
        profilePicUrl: user.profilePicUrl,
        fullName: user.fullName,
        full_name: user.full_name,
      });
      
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
        cacheProfileImage(profileImageUrl).catch(error => {
          console.error('❌ Failed to cache profile image from user context:', error);
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

  // Debug: Log userProfile changes
  useEffect(() => {
    console.log('📊 Current userProfile state:', userProfile);
    
    // Cache the image URL when it changes
    if (userProfile.image && userProfile.image.trim() !== '') {
      cacheProfileImage(userProfile.image);
    }
  }, [userProfile]);

  // Debug: Log user context data and update profile if needed
  useEffect(() => {
    console.log('👤 Current user context:', user);
    
    // If user context has a valid name and current profile doesn't, update it
    const userName = user?.fullName || user?.full_name;
    if (user && userName && userName.trim() !== '' && 
        (!userProfile.name || userProfile.name.trim() === '' || userProfile.name === t('profile.serviceProvider'))) {
      console.log('🔄 Updating profile name from user context:', userName);
      setUserProfile(prev => ({
        ...prev,
        name: userName
      }));
    }

    // If user context has a profile picture and current profile doesn't, update it
    const userProfilePic = user?.profile_pic_url || user?.profilePicUrl;
    if (user && userProfilePic && userProfilePic.trim() !== '' && 
        (!userProfile.image || userProfile.image.trim() === '')) {
      console.log('🔄 Updating profile picture from user context:', userProfilePic);
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
              await logout();
              // Clear navigation stack and navigate to auth
              router.dismissAll();
              router.replace('/auth');
            } catch (error) {
              console.error('Logout error:', error);
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
              let token = user?.token;
              if (!token) {
                const storedToken = await AsyncStorage.getItem('token');
                token = storedToken || undefined;
              }
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
                router.replace('/auth');
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
    console.log('🔄 Manual refresh requested by user');
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
      console.log('❌ Failed to cache profile image:', error);
    }
  };

  const loadCachedProfileImage = async () => {
    try {
      const cached = await AsyncStorage.getItem('cached_profile_image');
      if (cached) {
        setCachedImageUrl(cached);
        console.log('📦 Loaded cached profile image:', cached);
        return cached;
      }
    } catch (error) {
      console.log('❌ Failed to load cached profile image:', error);
    }
    return null;
  };

  const checkAndRetryPendingUpload = async () => {
    try {
      const pendingUpload = await AsyncStorage.getItem('pending_profile_upload');
      if (pendingUpload) {
        console.log('🔄 Found pending profile upload, attempting to retry...');
        
        // Try to upload the pending image
        const token = await AsyncStorage.getItem('token');
        if (token) {
          // Test network connectivity first
          try {
            const testResponse = await fetch(`${API_BASE_URL}/health`, { method: 'GET' });
            if (testResponse.ok) {
              console.log('✅ Network connectivity restored, retrying upload...');
              
              // Remove the pending upload flag before attempting
              await AsyncStorage.removeItem('pending_profile_upload');
              
              // Retry the upload
              await uploadProfilePicture(pendingUpload);
            }
          } catch (networkError) {
            console.log('🌐 Network still not available, keeping pending upload');
          }
        }
      }
    } catch (error) {
      console.error('❌ Error checking pending upload:', error);
    }
  };

  const fetchUserProfile = async () => {
    try {
      console.log('🔄 Fetching user profile from backend...');
      
      const token = await tokenManager.getValidToken();
      if (!token) {
        console.log('❌ No valid token available for profile fetch');
        return;
      }

      // First try to get provider-specific profile data
      let response = await fetch(`${API_BASE_URL}/api/providers/profile`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        console.log('📥 Provider profile response:', data);
        
        const profileData = data.data?.profile || {};
        
        setUserProfile({
          name: profileData.full_name || '',
          email: profileData.email || '',
          phone: profileData.phone || '',
          location: profileData.location || '',
          image: profileData.profile_pic_url || '',
          createdAt: profileData.created_at || '',
        });

        console.log('👤 Updated userProfile from provider endpoint:', {
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
        console.log('✅ Profile data cached successfully');
        
        // If we got a valid name, ensure it's displayed
        if (profileData.full_name && profileData.full_name.trim() !== '') {
          console.log('✅ Valid name fetched:', profileData.full_name);
        }
      } else {
        // Fallback to user profile endpoint if provider endpoint fails
        console.log('⚠️ Provider profile endpoint failed, falling back to user profile');
        
        response = await fetch(`${API_BASE_URL}/api/users/profile`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
          const data = await response.json();
          console.log('📥 User profile response:', data);
          
          const profileData = data.data?.user || data.data || {};
          
          setUserProfile({
            name: profileData.fullName || profileData.full_name || '',
            email: profileData.email || '',
            phone: profileData.phone || '',
            location: profileData.location || '',
            image: profileData.profilePicUrl || profileData.profile_pic_url || '',
            createdAt: profileData.createdAt || profileData.created_at || '',
          });

          console.log('👤 Updated userProfile from user endpoint:', {
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
          console.log('✅ Profile data cached successfully');
          
          // If we got a valid name, ensure it's displayed
          if (profileData.fullName || profileData.full_name) {
            const validName = profileData.fullName || profileData.full_name;
            console.log('✅ Valid name fetched from user endpoint:', validName);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching user profile:', error);
    }
  };

  const handleProfilePictureAction = () => {
    console.log('👤 Current userProfile:', userProfile);
    console.log('📦 Current cachedImageUrl:', cachedImageUrl);
    console.log('👤 User context profile_pic_url:', user?.profile_pic_url);
    console.log('👤 User context profilePicUrl:', user?.profilePicUrl);
    console.log('👤 userProfile.name:', userProfile.name);
    console.log('👤 userProfile.name length:', userProfile.name?.length);
    console.log('👤 userProfile.name trimmed:', userProfile.name?.trim());
    
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
        showAlert('Permission Required', 'Camera permission is required to take a photo.', 'error');
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
      console.error('Error taking photo:', error);
      showAlert('Error', 'Failed to take photo. Please try again.', 'error');
    }
  };

  const handleChooseFromGallery = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permissionResult.granted === false) {
        showAlert('Permission Required', 'Gallery permission is required to select a photo.', 'error');
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
      console.error('Error choosing from gallery:', error);
      showAlert('Error', 'Failed to select photo. Please try again.', 'error');
    }
  };

  const uploadProfilePicture = async (imageUri: string) => {
    try {
      showAlert('Uploading...', 'Please wait while we upload your profile picture.', 'info');
      
      const token = await tokenManager.getValidToken();
      if (!token) {
        showAlert('Error', 'Authentication required. Please login again.', 'error');
        return;
      }

      console.log('📤 Starting profile picture upload...');
      console.log('🖼️ Image URI:', imageUri);
      console.log('🌐 API Base URL:', API_BASE_URL);

      // Convert image to base64
      const response = await fetch(imageUri);
      const blob = await response.blob();
      const reader = new FileReader();
      
      reader.onload = async () => {
        const base64 = reader.result as string;

        console.log('🔄 Making API request to upload profile picture...');
        const uploadResponse = await fetch(`${API_BASE_URL}/api/users/profile`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            profilePicUrl: base64,
          }),
        });
        
        console.log('📡 Upload response status:', uploadResponse.status);

        if (uploadResponse.ok) {
          const data = await uploadResponse.json();
          console.log('📤 Upload response:', data);
          
          // Handle different response structures
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
          
          console.log('🖼️ New image URL:', newImageUrl);
          
          if (newImageUrl) {
            setUserProfile(prev => ({ ...prev, image: newImageUrl }));
            await cacheProfileImage(newImageUrl);
            
            // Update user context with new profile picture
            if (user) {
              await updateUser({ profile_pic_url: newImageUrl });
            }
            
            // Refresh user profile data
            await fetchUserProfile();
            
            // Small delay to ensure state updates are processed
            setTimeout(() => {
              showAlert('Success', 'Profile picture updated successfully!', 'success');
            }, 100);
          } else {
            console.error('❌ No image URL in response:', data);
            showAlert('Error', 'Failed to get image URL from response.', 'error');
          }
        } else {
          const errorData = await uploadResponse.json();
          console.error('❌ Upload failed:', errorData);
          showAlert('Error', errorData.message || 'Failed to upload profile picture.', 'error');
        }
      };

      reader.readAsDataURL(blob);
    } catch (error) {
      console.error('❌ Error uploading profile picture:', error);
      
      // Check if it's a network connectivity issue
      const errorMessage = (error as Error)?.message || '';
      if (errorMessage.includes('Network request failed') || errorMessage.includes('Unable to resolve host')) {
        console.log('🌐 Network connectivity issue during upload');
        
        // Store the image locally for later upload when network is restored
        try {
          await AsyncStorage.setItem('pending_profile_upload', imageUri);
          console.log('💾 Stored image locally for later upload');
          
          // Update UI with local image immediately
          setUserProfile(prev => ({ ...prev, image: imageUri }));
          await cacheProfileImage(imageUri);
          
          showAlert('Network Issue', 'Your profile picture has been saved locally and will be uploaded when network connection is restored.', 'warning');
        } catch (storageError) {
          console.error('❌ Failed to store image locally:', storageError);
          showAlert('Error', 'Failed to upload profile picture due to network issues. Please try again when connected.', 'error');
        }
      } else {
        showAlert('Error', 'Failed to upload profile picture. Please try again.', 'error');
      }
    }
  };

  const handleDeleteProfilePicture = async () => {
    try {
      console.log('🗑️ Starting profile picture deletion...');
      
      const token = await AsyncStorage.getItem('token');
      if (!token) {
        showAlert('Error', 'Authentication required. Please login again.', 'error');
        return;
      }

      console.log('📤 Sending delete request with profilePicUrl: ""');
      
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

      console.log('📥 Response status:', response.status);
      console.log('📥 Response ok:', response.ok);

      if (response.ok) {
        const responseData = await response.json();
        console.log('📥 Response data:', responseData);
        
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
          showAlert('Success', 'Profile picture removed successfully!', 'success');
        }, 100);
      } else {
        const errorData = await response.json();
        console.error('❌ Delete failed:', errorData);
        showAlert('Error', errorData.message || 'Failed to remove profile picture.', 'error');
      }
    } catch (error) {
      console.error('❌ Error removing profile picture:', error);
      showAlert('Error', 'Failed to remove profile picture. Please try again.', 'error');
    }
  };

  const handleSettingsAction = (action: string) => {
    if (action === 'notifications') {
      setNotificationSettingsVisible(true);
      return;
    }
    
    if (action === 'edit-profile') {
      router.push('/edit-profile');
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
      'help': {
        title: t('settings.help.title'),
        message: t('settings.help.message')
      },
      'terms': {
        title: t('settings.terms.title'),
        message: t('settings.terms.message')
      },
      'privacy-policy': {
        title: t('settings.privacyPolicy.title'),
        message: t('settings.privacyPolicy.message')
      },
      'rate': {
        title: t('settings.rate.title'),
        message: t('settings.rate.message')
      },
      'feedback': {
        title: t('settings.feedback.title'),
        message: t('settings.feedback.message')
      }
    };

    const info = settingsInfo[action as keyof typeof settingsInfo];
    if (info) {
      showAlert(info.title, info.message, 'info');
    }
  };

  return (
    <SafeView backgroundColor="#F8FAFC">
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />
      <ScrollView 
        style={styles.scrollView} 
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
                  console.log('🔄 Image loading started:', imageUri);
                  setImageLoading(true);
                  
                  // Set a timeout to fallback to text avatar if image takes too long
                  const timeout = setTimeout(() => {
                    console.log('⏰ Image load timeout - falling back to text avatar');
                    setUserProfile(prev => ({ ...prev, image: '' }));
                    setImageLoading(false);
                  }, 5000); // 5 second timeout
                  
                  setImageLoadTimeout(timeout);
                }}
                onLoadEnd={() => {
                  console.log('✅ Image loaded successfully');
                  setImageLoading(false);
                  
                  // Clear timeout if image loads successfully
                  if (imageLoadTimeout) {
                    clearTimeout(imageLoadTimeout);
                    setImageLoadTimeout(null);
                  }
                }}
                onError={(error) => {
                  console.log('❌ Image load error:', error);
                  console.log('🔄 Falling back to text avatar');
                  
                  // Clear timeout on error
                  if (imageLoadTimeout) {
                    clearTimeout(imageLoadTimeout);
                    setImageLoadTimeout(null);
                  }
                  
                  // Check if it's a network error
                  const errorMessage = error.nativeEvent?.error || '';
                  if (errorMessage.includes('Unable to resolve host') || errorMessage.includes('Network request failed')) {
                    console.log('🌐 Network connectivity issue detected');
                    console.log('💡 Using text avatar as fallback for network issues');
                    
                    // For network errors, keep the image URL but show text avatar
                    // This way when network is restored, the image can be retried
                    console.log('📦 Keeping image URL for future retry:', userProfile.image);
                  } else {
                    // For other errors (invalid URL, etc.), clear the image
                    console.log('🗑️ Clearing invalid image URL');
                    setUserProfile(prev => ({ ...prev, image: '' }));
                    // Also clear from cache if it's invalid
                    AsyncStorage.removeItem('cached_profile_image').catch(console.error);
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
          >
            <AlertTriangle size={20} color="#DC2626" />
            <Text style={styles.reportButtonText}>{t('profile.reportCustomer')}</Text>
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
            <Text style={styles.actionButtonText}>{t('profile.editProfile')}</Text>
            <View style={styles.actionButtonArrow}>
              <Text style={styles.arrowText}>›</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.actionButton}
            onPress={() => handleSettingsAction('notifications')}
          >
            <Bell size={20} color="#6B7280" />
            <Text style={styles.actionButtonText}>{t('profile.notifications')}</Text>
            <View style={styles.actionButtonArrow}>
              <Text style={styles.arrowText}>›</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.actionButton}
            onPress={() => handleSettingsAction('privacy')}
          >
            <Shield size={20} color="#6B7280" />
            <Text style={styles.actionButtonText}>{t('profile.privacyAndSecurity')}</Text>
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
            <Text style={styles.actionButtonText}>{t('profile.soundAndVibration')}</Text>
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
            <Text style={styles.actionButtonText}>{t('profile.helpAndSupport')}</Text>
            <View style={styles.actionButtonArrow}>
              <Text style={styles.arrowText}>›</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.actionButton}
            onPress={() => handleSettingsAction('feedback')}
          >
            <Settings size={20} color="#6B7280" />
            <Text style={styles.actionButtonText}>{t('profile.sendFeedback')}</Text>
            <View style={styles.actionButtonArrow}>
              <Text style={styles.arrowText}>›</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.actionButton}
            onPress={() => handleSettingsAction('rate')}
          >
            <Star size={20} color="#6B7280" />
            <Text style={styles.actionButtonText}>{t('profile.rateOurApp')}</Text>
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
            <Text style={styles.actionButtonText}>{t('profile.termsAndConditions')}</Text>
            <View style={styles.actionButtonArrow}>
              <Text style={styles.arrowText}>›</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.actionButton}
            onPress={() => handleSettingsAction('privacy-policy')}
          >
            <Shield size={20} color="#6B7280" />
            <Text style={styles.actionButtonText}>{t('profile.privacyPolicy')}</Text>
            <View style={styles.actionButtonArrow}>
              <Text style={styles.arrowText}>›</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Logout Button */}
        <View style={styles.section}>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <LogOut size={20} color="#EF4444" />
            <Text style={styles.logoutButtonText}>{t('profile.logout')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.deleteButton} onPress={handleDeleteAccount}>
            <Trash2 size={20} color="#EF4444" style={{ marginRight: 10 }} />
            <Text style={styles.deleteButtonText}>{t('profile.deleteAccount')}</Text>
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
      <Modal
        visible={notificationSettingsVisible}
        onClose={() => setNotificationSettingsVisible(false)}
        title=""
        message=""
        type="info"
      >
        <NotificationSettings onClose={() => setNotificationSettingsVisible(false)} />
      </Modal>

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
  profileHeader: {
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#FFFFFF',
    marginBottom: 16,
  },
  profileIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#EBF8FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
    position: 'relative',
  },
  profileImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  textAvatar: {
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  textAvatarText: {
    fontSize: 48,
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
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#3B82F6',
    borderRadius: 20,
    width: 40,
    height: 40,
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
    fontSize: getResponsiveSpacing(24, 26, 28),
    fontFamily: 'Inter-Bold',
    color: '#1F2937',
    marginBottom: getResponsiveSpacing(2, 3, 4),
    flexShrink: 1,
  },
  memberSince: {
    fontSize: getResponsiveSpacing(12, 13, 14),
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
    marginBottom: getResponsiveSpacing(20, 22, 24),
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
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statNumber: {
    fontSize: 20,
    fontFamily: 'Inter-Bold',
    color: '#1F2937',
    marginTop: 4,
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: '#6B7280',
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 16,
  },
  section: {
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    color: '#1F2937',
    marginBottom: 16,
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  infoContent: {
    marginLeft: 16,
    flex: 1,
  },
  infoLabel: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
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
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  reportButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#DC2626',
    marginLeft: 12,
    flex: 1,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderRadius: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  actionButtonContent: {
    flex: 1,
    marginLeft: 12,
  },
  actionButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: '#374151',
  },
  actionButtonSubtext: {
    fontSize: 14,
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
    paddingVertical: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  logoutButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#EF4444',
    marginLeft: 8,
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
    paddingVertical: 24,
    paddingHorizontal: 24,
  },
  appVersion: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: '#9CA3AF',
    marginBottom: 8,
  },
  copyright: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#9CA3AF',
    textAlign: 'center',
  },
});