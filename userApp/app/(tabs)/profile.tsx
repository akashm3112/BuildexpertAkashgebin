import React, { useState, useEffect } from 'react';
import * as ImagePicker from 'expo-image-picker';
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
  BackHandler,
  Dimensions,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronRight, Settings, MapPin, CreditCard, Bell, CircleHelp as HelpCircle, LogOut, CreditCard as Edit3, Camera, Star, Shield, Gift, Users, FileText, X, ArrowLeft, Trash2, Lock, Eye, EyeOff, Smartphone, Mail, UserCheck, Globe } from 'lucide-react-native';
import { Modal } from '@/components/common/Modal';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/context/NotificationContext';
import { useLanguage } from '@/context/LanguageContext';
import { API_BASE_URL } from '@/constants/api';
import { SafeView } from '@/components/SafeView';
import NotificationSettings from '@/components/NotificationSettings';

// Default profile image (consistent with backend)
const DEFAULT_PROFILE_IMAGE = 'https://res.cloudinary.com/dqoizs0fu/raw/upload/v1756189484/profile-pictures/m3szbez4bzvwh76j1fle';

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
  const { t, currentLanguageName, setLanguage, availableLanguages } = useLanguage();
  const router = useRouter();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [privacyModalVisible, setPrivacyModalVisible] = useState(false);
  const [termsModalVisible, setTermsModalVisible] = useState(false);
  const [languageModalVisible, setLanguageModalVisible] = useState(false);
  const [notificationSettingsVisible, setNotificationSettingsVisible] = useState(false);
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
  const [imageLoading, setImageLoading] = useState(false);
  const [bookingsCount, setBookingsCount] = useState(0);
  const [averageRating, setAverageRating] = useState(0);
  const [totalReviews, setTotalReviews] = useState(0);
  const [statsLoading, setStatsLoading] = useState(true);
  const [dimensions, setDimensions] = useState(Dimensions.get('window'));
  const [refreshing, setRefreshing] = useState(false);

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
        console.log('🖼️ Initial profile picture URL:', initialImage);
        
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
    
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!user) return true;
      return false;
    });
    
    // Listen for dimension changes (orientation, etc.)
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      setDimensions(window);
    });
    
    return () => {
      backHandler.remove();
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
      console.log('❌ Failed to cache profile image:', error);
    }
  };

  // Load cached profile image
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

  // Debug: Log userProfile changes
  useEffect(() => {
    console.log('📊 Current userProfile state:', userProfile);
    console.log('🖼️ Profile image URL:', userProfile.image);
    
    // Cache the image URL when it changes
    if (userProfile.image && userProfile.image.trim() !== '') {
      cacheProfileImage(userProfile.image);
    }
  }, [userProfile]);

  // Debug: Log user context data
  useEffect(() => {
    console.log('👤 Current user context:', user);
    console.log('🖼️ User context profile_pic_url:', user?.profile_pic_url);
  }, [user]);

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
      
      const token = await AsyncStorage.getItem('token');
      if (!token) {
        showAlert('Error', 'Authentication required. Please login again.', 'error');
        return;
      }

      // Convert image to base64
      const response = await fetch(imageUri);
      const blob = await response.blob();
      const reader = new FileReader();
      
      reader.onload = async () => {
        const base64 = reader.result as string;
        
        // Upload to backend
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

        if (uploadResponse.ok) {
          const data = await uploadResponse.json();
          console.log('📤 Upload response:', data);
          
          // Handle different response structures
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
          
          console.log('🖼️ New image URL:', newImageUrl);
          
          if (newImageUrl) {
            setUserProfile(prev => ({ ...prev, image: newImageUrl }));
            await cacheProfileImage(newImageUrl);
            
            // Update user context with new profile picture
            if (user) {
              await updateUser({ profile_pic_url: newImageUrl });
            }
            
            showAlert('Success', 'Profile picture updated successfully!', 'success');
          } else {
            console.error('❌ No image URL in response:', data);
            showAlert('Error', 'Failed to get image URL from response.', 'error');
          }
        } else {
          const errorData = await uploadResponse.json();
          console.error('❌ Upload failed:', errorData);
          showAlert('Error', errorData.message || 'Failed to update profile picture.', 'error');
        }
      };

      reader.readAsDataURL(blob);
    } catch (error) {
      console.error('Error uploading profile picture:', error);
      showAlert('Error', 'Failed to upload profile picture. Please try again.', 'error');
    }
  };

  const handleDeleteProfilePicture = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) {
        showAlert('Error', 'Authentication required. Please login again.', 'error');
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
        
        showAlert('Success', 'Profile picture removed successfully!', 'success');
      } else {
        const errorData = await response.json();
        console.error('❌ Delete failed:', errorData);
        showAlert('Error', errorData.message || 'Failed to remove profile picture.', 'error');
      }
    } catch (error) {
      console.error('Error deleting profile picture:', error);
      showAlert('Error', 'Failed to remove profile picture. Please try again.', 'error');
    }
  };

  const fetchUserProfile = async () => {
    try {
      let token = await AsyncStorage.getItem('token');
      if (!token) {
        console.log('❌ No token found, using user context data');
        // Use user context data as fallback
        if (user) {
          const fallbackImage = user.profile_pic_url || '';
          console.log('🖼️ Using fallback profile picture URL:', fallbackImage);
          
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
      
      console.log('🔍 Fetching user profile...');
      console.log('🌐 API URL:', `${API_BASE_URL}/api/users/profile`);
      
      // Fetch user profile
      const profileRes = await fetch(`${API_BASE_URL}/api/users/profile`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const profileData = await profileRes.json();
      
      console.log('📥 Profile response status:', profileRes.status);
      console.log('📥 Profile response data:', profileData);
      
      if (profileRes.ok && profileData.status === 'success') {
        // Handle different response structures
        const userData = profileData.data?.user || profileData.data || {};
        const profilePicUrl = userData.profilePicUrl || userData.profile_pic_url || '';
        const fullName = userData.fullName || userData.full_name || '';
        
        console.log('🖼️ Profile picture URL:', profilePicUrl);
        console.log('👤 Full name:', fullName);
        
        setUserProfile((prev) => ({
          ...prev,
          name: fullName,
          email: userData.email || '',
          phone: userData.phone || '',
          image: profilePicUrl,
        }));
        console.log('✅ Profile data set successfully');
      } else {
        console.log('⚠️ Profile fetch failed, using fallback data');
        // If profile fetch fails, use user data from context as fallback
        if (user) {
          const fallbackImage = user.profile_pic_url || '';
          console.log('🖼️ Fallback profile picture URL:', fallbackImage);
          
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
      console.error('Error fetching user profile:', err);
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
      console.log('📊 Fetching bookings stats...');
      let token = await AsyncStorage.getItem('token');
      if (!token) {
        console.log('❌ No token found for bookings stats');
        setStatsLoading(false);
        return;
      }
      
      console.log('🌐 API URL:', `${API_BASE_URL}/api/bookings`);
      const response = await fetch(`${API_BASE_URL}/api/bookings`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      console.log('📥 Bookings response status:', response.status);
      const data = await response.json();
      console.log('📥 Bookings response data:', data);
      
      if (response.ok && data.status === 'success') {
        // Handle different response structures
        const bookings = data.data?.bookings || [];
        const pagination = data.data?.pagination || {};
        const totalBookings = pagination.total || bookings.length || 0;
        
        console.log('📊 Total bookings found:', totalBookings);
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
        
        console.log('⭐ Ratings calculated:', { ratingsSum, ratingsCount });
        setTotalReviews(ratingsCount);
        setAverageRating(ratingsCount > 0 ? (ratingsSum / ratingsCount) : 0);
      } else {
        console.log('⚠️ Bookings fetch failed:', data.message || 'Unknown error');
        // Set default values on failure
        setBookingsCount(0);
        setTotalReviews(0);
        setAverageRating(0);
      }
    } catch (err) {
      console.error('❌ Error fetching bookings stats:', err);
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
      console.error('Error refreshing profile data:', error);
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
        { text: t('alerts.logout.confirm'), onPress: async () => { await logout(); router.replace('/(auth)/login'); }, style: 'destructive' }
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

  const saveProfile = () => {
    setEditModalVisible(false);
    showAlert('Success', t('alerts.success.profileUpdated'), 'success', [
      { text: 'OK', onPress: () => setShowAlertModal(false), style: 'primary' }
    ]);
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
            try {
              let token = user?.token;
              if (!token) {
                const storedToken = await AsyncStorage.getItem('token');
                token = storedToken || undefined;
              }
              if (!token) {
                showAlert('Error', t('alerts.error.noToken'), 'error');
                return;
              }
              const response = await fetch(`${API_BASE_URL}/api/users/delete-account`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
              });
              if (response.ok) {
                await logout();
                showAlert('Account Deleted', 'Your account and all related data have been deleted.', 'success');
                // Redirect to login or welcome screen
                router.replace('/(auth)/login');
              } else {
                const data = await response.json();
                showAlert('Error', data.message || t('alerts.error.deleteFailed'), 'error');
              }
            } catch (error) {
              showAlert('Error', t('alerts.error.deleteFailed'), 'error');
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
        {
          icon: <Shield size={20} color="#3B82F6" />,
          title: t('profile.privacySecurity'),
          subtitle: t('profile.managePrivacy'),
          onPress: handlePrivacySettings,
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
          onPress: () => showAlert(t('profile.referFriends'), t('alerts.info.referFriends'), 'info'),
        },
        {
          icon: <Star size={20} color="#3B82F6" />,
          title: t('profile.rateApp'),
          subtitle: t('profile.helpImprove'),
          onPress: () => showAlert('Thank you!', t('alerts.info.rateApp'), 'info'),
        },
        {
          icon: <HelpCircle size={20} color="#3B82F6" />,
          title: t('profile.helpSupport'),
          subtitle: t('profile.getHelp'),
          onPress: () => showAlert(t('profile.helpSupport'), t('alerts.info.helpSupport'), 'info'),
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
                      console.log('🔄 Image loading started:', userProfile.image || cachedImageUrl);
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
                <Text style={styles.profileName}>{userProfile.name}</Text>
                <View style={styles.profileDetails}>
                  {userProfile.location ? (
                    <View style={styles.detailItem}>
                      <View style={styles.detailIconContainer}>
                        <MapPin size={16} color="#64748B" />
                      </View>
                      <Text style={styles.detailText}>{userProfile.location}</Text>
                    </View>
                  ) : null}
                  <View style={styles.detailItem}>
                    <Text style={styles.detailText}>{userProfile.email}</Text>
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

        <TouchableOpacity style={styles.logoutButton} onPress={handleDeleteAccount}>
          <Trash2 size={20} color="#EF4444" style={{ marginRight: 10 }} />
          <Text style={styles.logoutText}>{t('profile.deleteAccount')}</Text>
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
                    console.log('❌ Modal image load error');
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
              <Text style={styles.formLabel}>{t('editProfile.fullName')}</Text>
              <TextInput
                style={styles.formInput}
                value={userProfile.name}
                onChangeText={(text) => setUserProfile(prev => ({ ...prev, name: text }))}
                placeholder={t('editProfile.fullNamePlaceholder')}
              />
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

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>{t('editProfile.location')}</Text>
              <TextInput
                style={styles.formInput}
                value={userProfile.location}
                onChangeText={(text) => setUserProfile(prev => ({ ...prev, location: text }))}
                placeholder={t('editProfile.locationPlaceholder')}
              />
            </View>
          </ScrollView>
        </SafeView>
      </RNModal>

      {/* Privacy & Security Modal */}
      <RNModal
        visible={privacyModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
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
      >
        <SafeView style={styles.modalContainer} backgroundColor="#FFFFFF">
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setTermsModalVisible(false)}>
              <X size={24} color="#64748B" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Terms & Privacy</Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView style={styles.modalContent}>
            <View style={styles.termsSection}>
              <Text style={styles.termsSectionTitle}>Terms of Service</Text>
              <Text style={styles.termsText}>
                By using BuildXpert, you agree to these terms of service. Our platform connects users with service providers for various home improvement and maintenance services.
              </Text>
              
              <Text style={styles.termsSubtitle}>User Responsibilities:</Text>
              <Text style={styles.termsText}>
                • Provide accurate information when booking services{'\n'}
                • Treat service providers with respect and professionalism{'\n'}
                • Pay for services as agreed upon{'\n'}
                • Provide honest feedback and ratings
              </Text>

              <Text style={styles.termsSubtitle}>Service Provider Responsibilities:</Text>
              <Text style={styles.termsText}>
                • Deliver services as promised and on time{'\n'}
                • Maintain professional standards and quality{'\n'}
                • Provide accurate pricing and availability{'\n'}
                • Respond promptly to user communications
              </Text>
            </View>

            <View style={styles.termsSection}>
              <Text style={styles.termsSectionTitle}>Privacy Policy</Text>
              <Text style={styles.termsText}>
                We are committed to protecting your privacy and ensuring the security of your personal information.
              </Text>

              <Text style={styles.termsSubtitle}>Information We Collect:</Text>
              <Text style={styles.termsText}>
                • Personal information (name, email, phone, address){'\n'}
                • Payment information (processed securely){'\n'}
                • Service preferences and booking history{'\n'}
                • Device information and app usage data
              </Text>

              <Text style={styles.termsSubtitle}>How We Use Your Information:</Text>
              <Text style={styles.termsText}>
                • To provide and improve our services{'\n'}
                • To connect you with service providers{'\n'}
                • To process payments and transactions{'\n'}
                • To send important notifications and updates{'\n'}
                • To provide customer support
              </Text>

              <Text style={styles.termsSubtitle}>Data Security:</Text>
              <Text style={styles.termsText}>
                • All data is encrypted using industry-standard protocols{'\n'}
                • We implement strict access controls{'\n'}
                • Regular security audits and updates{'\n'}
                • Compliance with data protection regulations
              </Text>
            </View>

            <View style={styles.termsSection}>
              <Text style={styles.termsSectionTitle}>Contact Information</Text>
              <Text style={styles.termsText}>
                For questions about these terms or privacy policy, please contact us:{'\n\n'}
                Email: support@buildxpert.com{'\n'}
                Phone: +1 (555) 123-4567{'\n'}
                Address: 123 Main Street, City, State 12345
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
  },
  profileName: {
    fontSize: getResponsiveFontSize(20, 24, 28),
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: getResponsiveSpacing(8, 12, 16),
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
  logoutText: {
    fontSize: getResponsiveFontSize(14, 16, 18),
    fontWeight: '500',
    color: '#EF4444',
    marginLeft: getResponsiveSpacing(6, 8, 10),
  },
  footer: {
    alignItems: 'center',
    paddingBottom: getResponsiveSpacing(16, 20, 24),
  },
  footerText: {
    fontSize: getResponsiveFontSize(10, 12, 14),
    color: '#94A3B8',
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
});