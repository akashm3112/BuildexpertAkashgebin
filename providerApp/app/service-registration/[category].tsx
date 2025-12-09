import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Image,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Dimensions,
  StatusBar,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Camera, X, Upload } from 'lucide-react-native';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { getServiceById } from '@/constants/serviceCategories';
import { SafeView } from '@/components/SafeView';
import { Modal } from '@/components/common/Modal';
import StateSelector from '@/components/common/StateSelector';
import CitySelector from '@/components/common/CitySelector';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { API_BASE_URL } from '@/constants/api';

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

interface FormData {
  fullName: string;
  phone: string;
  state: string;
  city: string;
  address: string;
  experience: string;
  charges: string;
  description: string;
  photos: string[];
  engineeringCertificate?: string;
}

export default function ServiceRegistration() {
  const router = useRouter();
  const { category, mode, serviceId } = useLocalSearchParams();
  const { user, updateUser } = useAuth();
  const { t } = useLanguage();
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});

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

  const service = getServiceById(category as string);
  const isViewMode = mode === 'view';
  const isEditMode = mode === 'edit';
  const isEngineerOrInterior = category === 'engineer-interior';

  const [formData, setFormData] = useState<FormData>({
    fullName: user?.fullName || '',
    phone: user?.phone || '',
    state: '',
    city: '',
    address: '',
    experience: '',
    charges: '',
    description: '',
    photos: [],
    engineeringCertificate: undefined,
  });

  useEffect(() => {
    if (isEditMode || isViewMode) {
      loadExistingServiceData();
    }
  }, [serviceId]);

  // Handle orientation changes for responsive design
  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', () => {
      // Force re-render when orientation changes
      // The responsive utilities will automatically adjust
    });

    return () => subscription?.remove();
  }, []);

  const loadExistingServiceData = async () => {
    if (!serviceId) return;
    
    try {
      setIsLoadingData(true);
      const { tokenManager } = await import('@/utils/tokenManager');
      const token = await tokenManager.getValidToken();

      if (!token) {
        showAlert(t('alerts.error'), t('alerts.noAuthTokenAvailable'), 'error');
        setIsLoadingData(false);
        return;
      }

      // Fetch the specific service data from backend
      const response = await fetch(`${API_BASE_URL}/api/services/my-registrations`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        
        // PRODUCTION FIX: Debug logging to understand data structure
        if (__DEV__) {
          console.log('📦 Full API response:', JSON.stringify(data, null, 2));
        }
        
        const serviceData = data.data.registeredServices.find(
          (s: any) => s.provider_service_id === serviceId
        );

        // PRODUCTION FIX: Debug logging for found service data
        if (__DEV__) {
          console.log('📦 Found service data:', serviceData ? 'YES' : 'NO');
          if (serviceData) {
            console.log('📦 Service data working_proof_urls:', serviceData.working_proof_urls);
            console.log('📦 Service data working_proof_urls type:', typeof serviceData.working_proof_urls);
            console.log('📦 Service data working_proof_urls isArray:', Array.isArray(serviceData.working_proof_urls));
            if (serviceData.working_proof_urls) {
              console.log('📦 Service data working_proof_urls length:', Array.isArray(serviceData.working_proof_urls) ? serviceData.working_proof_urls.length : 'N/A');
            }
          }
        }

        if (serviceData) {
          // PRODUCTION FIX: Parse working_proof_urls - handle all possible formats
          // Also filter out mock URLs that don't exist
          let workingProofUrls: string[] = [];
          
          if (serviceData.working_proof_urls) {
            try {
              // Handle PostgreSQL array format - pg library should return arrays, but handle all cases
              if (Array.isArray(serviceData.working_proof_urls)) {
                // Already an array - filter valid URLs and exclude mock URLs
                workingProofUrls = serviceData.working_proof_urls
                  .filter((url: any) => {
                    if (!url || typeof url !== 'string') return false;
                    const trimmed = url.trim();
                    // PRODUCTION FIX: Filter out mock URLs that don't exist
                    if (trimmed.includes('mock-cloud') || trimmed.includes('/mock-image-')) {
                      if (__DEV__) {
                        console.warn('⚠️ Filtering out mock URL:', trimmed);
                      }
                      return false; // Skip mock URLs
                    }
                    return trimmed !== '' && 
                           (trimmed.startsWith('http://') || 
                            trimmed.startsWith('https://') || 
                            trimmed.startsWith('data:image/') || 
                            trimmed.startsWith('file://'));
                  })
                  .map((url: any) => url.trim()); // Ensure no whitespace
              } else if (typeof serviceData.working_proof_urls === 'string') {
                // PostgreSQL array might be returned as string - try to parse
                const strValue = serviceData.working_proof_urls.trim();
                
                // PRODUCTION FIX: Filter out mock URLs
                if (strValue.includes('mock-cloud') || strValue.includes('/mock-image-')) {
                  if (__DEV__) {
                    console.warn('⚠️ Skipping mock URL string:', strValue);
                  }
                  workingProofUrls = [];
                } else {
                  // Try JSON parse first
                  try {
                    const parsed = JSON.parse(strValue);
                    if (Array.isArray(parsed)) {
                      workingProofUrls = parsed
                        .filter((url: any) => {
                          if (!url || typeof url !== 'string') return false;
                          const trimmed = url.trim();
                          // PRODUCTION FIX: Filter out mock URLs
                          if (trimmed.includes('mock-cloud') || trimmed.includes('/mock-image-')) {
                            if (__DEV__) {
                              console.warn('⚠️ Filtering out mock URL from array:', trimmed);
                            }
                            return false;
                          }
                          return trimmed !== '' && 
                                 (trimmed.startsWith('http://') || 
                                  trimmed.startsWith('https://') || 
                                  trimmed.startsWith('data:image/') || 
                                  trimmed.startsWith('file://'));
                        })
                        .map((url: any) => url.trim());
                    } else if (typeof parsed === 'string' && parsed.trim() !== '') {
                      // Single URL string in JSON
                      const trimmed = parsed.trim();
                      if (!trimmed.includes('mock-cloud') && !trimmed.includes('/mock-image-') &&
                          (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:image/') || trimmed.startsWith('file://'))) {
                        workingProofUrls = [trimmed];
                      }
                    }
                  } catch (parseError) {
                    // JSON parse failed - check if it's a single URL string
                    if (strValue !== '' && 
                        !strValue.includes('mock-cloud') && !strValue.includes('/mock-image-') &&
                        (strValue.startsWith('http://') || 
                         strValue.startsWith('https://') ||
                         strValue.startsWith('data:image/') ||
                         strValue.startsWith('file://'))) {
                      workingProofUrls = [strValue];
                    }
                  }
                }
              }
            } catch (error) {
              console.warn('Error parsing working_proof_urls:', error, 'Raw data:', serviceData.working_proof_urls);
              workingProofUrls = [];
            }
          }
          
          // DEBUG: Log the parsed URLs in development
          if (__DEV__) {
            console.log('📸 Raw working_proof_urls:', serviceData.working_proof_urls);
            console.log('📸 Raw type:', typeof serviceData.working_proof_urls);
            console.log('📸 Is array:', Array.isArray(serviceData.working_proof_urls));
            console.log('📸 Parsed working proof URLs (after filtering mock URLs):', workingProofUrls);
            console.log('📸 Parsed URLs count:', workingProofUrls.length);
            workingProofUrls.forEach((url, idx) => {
              console.log(`📸 URL ${idx}:`, url);
            });
          }
          
          // PRODUCTION FIX: Ensure engineering certificate URL is valid
          let engineeringCertificateUrl: string | undefined = undefined;
          if (serviceData.engineering_certificate_url && 
              typeof serviceData.engineering_certificate_url === 'string' &&
              serviceData.engineering_certificate_url.trim() !== '' &&
              (serviceData.engineering_certificate_url.startsWith('http://') || 
               serviceData.engineering_certificate_url.startsWith('https://') || 
               serviceData.engineering_certificate_url.startsWith('data:image/') || 
               serviceData.engineering_certificate_url.startsWith('file://'))) {
            engineeringCertificateUrl = serviceData.engineering_certificate_url;
          }
          
          // Map backend data to form data
          setFormData({
            fullName: user?.fullName || '',
            phone: user?.phone || '',
            state: serviceData.state || '',
            city: serviceData.city || '',
            address: serviceData.full_address || '',
            experience: serviceData.years_of_experience?.toString() || '',
            charges: serviceData.service_charge_value?.toString() || '',
            description: serviceData.service_description || '',
            photos: workingProofUrls,
            engineeringCertificate: engineeringCertificateUrl,
          });
          
        } else {
          showAlert(t('alerts.error'), t('alerts.serviceDataNotFound'), 'error');
          router.back();
        }
      } else {
        showAlert(t('alerts.error'), t('alerts.failedToLoadServiceData'), 'error');
        router.back();
      }
    } catch (error) {
      console.error('Error loading service data:', error);
              showAlert(t('alerts.error'), t('alerts.failedToLoadServiceData'), 'error');
      router.back();
    } finally {
      setIsLoadingData(false);
    }
  };

  const loadExistingData = async () => {
    try {
      const key = `service_${category}_${user?.id}`;
      const savedData = await AsyncStorage.getItem(key);
      if (savedData) {
        setFormData(JSON.parse(savedData));
      }
    } catch (error) {
      console.error('Error loading data:', error);
              showAlert(t('alerts.error'), t('alerts.failedToLoadPreviousData'), 'error');
    }
  };

  const handleInputChange = (field: keyof FormData, value: string) => {
    if (field === 'fullName' || field === 'phone') return;
    if (isViewMode) return; // Don't allow changes in view mode
    
    // If state changes, clear city selection
    if (field === 'state') {
      setFormData((prev) => ({ ...prev, [field]: value, city: '' }));
    } else {
      setFormData((prev) => ({ ...prev, [field]: value }));
    }
    
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined })); // Clear error when typing
    }
  };

  const handleAddPhoto = async () => {
    if (formData.photos.length >= 4) {
      showAlert(t('alerts.limitReached'), t('alerts.maxPhotosReached'), 'warning', [
        { text: t('serviceRegistration.ok'), onPress: () => {
          setShowAlertModal(false);
        }, style: 'primary' }
      ]);
      return;
    }

    showAlert(
      t('serviceRegistration.addPhoto'),
      t('serviceRegistration.chooseOption'),
      'info',
      [
        {
          text: t('serviceRegistration.takePhoto'),
          onPress: async () => {
            setShowAlertModal(false);
            const permission = await ImagePicker.requestCameraPermissionsAsync();
            if (permission.status !== 'granted') {
              showAlert(t('alerts.permissionDenied'), t('alerts.cameraPermissionRequired'), 'error');
              return;
            }
            const result = await ImagePicker.launchCameraAsync({
              mediaTypes: ['images'],
              allowsEditing: true,
              aspect: [4, 3],
              quality: 0.7,
            });
            if (!result.canceled && result.assets && result.assets.length > 0) {
              setFormData((prev) => ({
                ...prev,
                photos: [...prev.photos, result.assets[0].uri],
              }));
              setErrors((prev) => ({ ...prev, photos: undefined }));
            }
          },
          style: 'primary',
        },
        {
          text: t('serviceRegistration.chooseFromGallery'),
          onPress: async () => {
            setShowAlertModal(false);
            const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (permission.status !== 'granted') {
              showAlert(t('alerts.permissionDenied'), t('alerts.mediaPermissionRequired'), 'error');
              return;
            }
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              allowsEditing: true,
              aspect: [4, 3],
              quality: 0.7,
            });
            if (!result.canceled && result.assets && result.assets.length > 0) {
              setFormData((prev) => ({
                ...prev,
                photos: [...prev.photos, result.assets[0].uri],
              }));
              setErrors((prev) => ({ ...prev, photos: undefined }));
            }
          },
          style: 'primary',
        },
        { 
          text: t('serviceRegistration.cancel'), 
          onPress: () => {
            setShowAlertModal(false);
          }, 
          style: 'secondary' 
        },
      ]
    );
  };

  const handleRemovePhoto = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      photos: prev.photos.filter((_, i) => i !== index),
    }));
  };

  const handleAddCertificate = async () => {
    showAlert(
      t('serviceRegistration.addEngineeringCertificate'),
      t('serviceRegistration.chooseOption'),
      'info',
      [
        {
          text: t('serviceRegistration.takePhoto'),
          onPress: async () => {
            setShowAlertModal(false);
            const permission = await ImagePicker.requestCameraPermissionsAsync();
            if (permission.status !== 'granted') {
              showAlert(t('alerts.permissionDenied'), t('alerts.cameraPermissionRequired'), 'error');
              return;
            }
                    const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          aspect: [4, 3],
          quality: 0.7,
        });
            if (!result.canceled && result.assets && result.assets.length > 0) {
              setFormData((prev) => ({
                ...prev,
                engineeringCertificate: result.assets[0].uri,
              }));
              setErrors((prev) => ({ ...prev, engineeringCertificate: undefined }));
            }
          },
          style: 'primary',
        },
        {
          text: t('serviceRegistration.chooseFromGallery'),
          onPress: async () => {
            setShowAlertModal(false);
            const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (permission.status !== 'granted') {
              showAlert(t('alerts.permissionDenied'), t('alerts.mediaPermissionRequired'), 'error');
              return;
            }
                    const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          aspect: [4, 3],
          quality: 0.7,
        });
            if (!result.canceled && result.assets && result.assets.length > 0) {
              setFormData((prev) => ({
                ...prev,
                engineeringCertificate: result.assets[0].uri,
              }));
              setErrors((prev) => ({ ...prev, engineeringCertificate: undefined }));
            }
          },
          style: 'primary',
        },
        { 
          text: t('serviceRegistration.cancel'), 
          onPress: () => {
            setShowAlertModal(false);
          }, 
          style: 'secondary' 
        },
      ]
    );
  };

  const handleRemoveCertificate = () => {
    setFormData((prev) => ({
      ...prev,
      engineeringCertificate: undefined,
    }));
  };

  // Convert file URI to base64
  const convertToBase64 = async (uri: string): Promise<string> => {
    try {
      // PRODUCTION FIX: Validate input
      if (!uri || typeof uri !== 'string' || uri.trim() === '') {
        if (__DEV__) {
          console.warn('⚠️ Invalid URI provided to convertToBase64:', uri);
        }
        throw new Error('Invalid URI provided');
      }
      
      // If it's already a base64 URL, return as is
      if (uri.startsWith('data:image/')) {
        if (__DEV__) {
          console.log('✅ Already base64, returning as-is');
        }
        return uri;
      }
      
      // If it's a file URI, convert to base64
      if (uri.startsWith('file://')) {
        if (__DEV__) {
          console.log('🔄 Converting file URI to base64:', uri.substring(0, 80) + '...');
        }
        
        try {
          // PRODUCTION FIX: Check if file exists before reading
          const fileInfo = await FileSystem.getInfoAsync(uri);
          if (!fileInfo.exists) {
            if (__DEV__) {
              console.error('❌ File does not exist:', uri);
            }
            throw new Error(`File does not exist: ${uri}`);
          }
          
          const base64 = await FileSystem.readAsStringAsync(uri, {
            encoding: 'base64' as any,
          });
          
          if (!base64 || base64.length === 0) {
            if (__DEV__) {
              console.error('❌ Failed to read file content (empty result):', uri);
            }
            throw new Error('Failed to read file content');
          }
          
          // PRODUCTION FIX: Determine MIME type more accurately
          const extension = uri.split('.').pop()?.toLowerCase() || 'jpg';
          let mimeType = 'image/jpeg'; // Default
          if (extension === 'png') {
            mimeType = 'image/png';
          } else if (extension === 'gif') {
            mimeType = 'image/gif';
          } else if (extension === 'webp') {
            mimeType = 'image/webp';
          }
          
          const base64DataUrl = `data:${mimeType};base64,${base64}`;
          
          if (__DEV__) {
            console.log('✅ Successfully converted to base64, length:', base64DataUrl.length);
          }
          
          return base64DataUrl;
        } catch (fileError: any) {
          if (__DEV__) {
            console.error('❌ Error converting file URI to base64:', fileError?.message || fileError, uri.substring(0, 80));
          }
          throw new Error(`Failed to convert file to base64: ${fileError?.message || fileError}`);
        }
      }
      
      // If it's already a remote URL (Cloudinary), return as is
      if (uri.startsWith('http://') || uri.startsWith('https://')) {
        if (__DEV__) {
          console.log('✅ Already a remote URL, returning as-is');
        }
        return uri;
      }
      
      // Unknown format
      if (__DEV__) {
        console.warn('⚠️ Unknown URI format:', uri.substring(0, 80));
      }
      throw new Error(`Unknown URI format: ${uri.substring(0, 50)}`);
    } catch (error: any) {
      if (__DEV__) {
        console.error('❌ Error converting to base64:', error?.message || error, 'URI:', uri?.substring(0, 80));
      }
      throw error; // Re-throw to be caught by caller
    }
  };

  // Convert multiple URIs to base64
  const convertMultipleToBase64 = async (uris: string[]): Promise<string[]> => {
    try {
      if (!uris || uris.length === 0) {
        if (__DEV__) {
          console.warn('⚠️ No URIs provided to convertMultipleToBase64');
        }
        return [];
      }
      
      if (__DEV__) {
        console.log(`🔄 Converting ${uris.length} images to base64...`);
      }
      
      // PRODUCTION FIX: Use Promise.allSettled to handle individual failures gracefully
      const base64Promises = uris.map(async (uri, index) => {
        try {
          const result = await convertToBase64(uri);
          if (__DEV__) {
            console.log(`✅ Image ${index + 1}/${uris.length} converted successfully`);
          }
          return { success: true, result };
        } catch (error: any) {
          if (__DEV__) {
            console.error(`❌ Image ${index + 1}/${uris.length} conversion failed:`, error?.message || error);
          }
          return { success: false, error: error?.message || 'Unknown error', uri };
        }
      });
      
      const results = await Promise.allSettled(base64Promises);
      
      // Extract successful conversions
      const successful: string[] = [];
      const failed: { uri: string; error: string }[] = [];
      
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          if (result.value.success && result.value.result) {
            successful.push(result.value.result);
          } else {
            failed.push({ uri: uris[index], error: result.value.error || 'Unknown error' });
          }
        } else {
          failed.push({ uri: uris[index], error: result.reason?.message || 'Promise rejected' });
        }
      });
      
      if (__DEV__) {
        console.log(`📊 Conversion results: ${successful.length} successful, ${failed.length} failed`);
        if (failed.length > 0) {
          console.warn('⚠️ Failed conversions:', failed);
        }
      }
      
      // PRODUCTION FIX: If all conversions failed, throw an error
      if (successful.length === 0 && uris.length > 0) {
        const errorMessage = `Failed to convert all ${uris.length} image(s) to base64. ${failed.map(f => f.error).join('; ')}`;
        if (__DEV__) {
          console.error('❌ All image conversions failed:', errorMessage);
        }
        throw new Error(errorMessage);
      }
      
      return successful;
    } catch (error: any) {
      if (__DEV__) {
        console.error('❌ Error converting multiple images to base64:', error?.message || error);
      }
      throw error; // Re-throw to be caught by handleSubmit
    }
  };

  const handleSubmit = async () => {
    const newErrors: Partial<Record<keyof FormData, string>> = {};
    if (!formData.state.trim()) newErrors.state = 'State is required.';
    if (!formData.city.trim()) newErrors.city = 'City is required.';
    if (!formData.address.trim()) newErrors.address = 'Address is required.';
    if (!formData.experience.trim()) newErrors.experience = 'Years of experience is required.';
    if (!formData.charges.trim()) newErrors.charges = 'Service charges are required.';
    if (isEngineerOrInterior && !formData.engineeringCertificate) {
      newErrors.engineeringCertificate = 'Engineering certificate is mandatory.';
    }
    if (!isEngineerOrInterior && formData.photos.length === 0) {
      newErrors.photos = 'Please upload at least one previous project photo.';
    }
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) {
      showAlert(t('alerts.missingInformation'), t('alerts.fillRequiredFieldsAndErrors'), 'warning');
      return;
    }
    setIsLoading(true);
    try {
      // Get token from tokenManager
      const { tokenManager } = await import('@/utils/tokenManager');
      const token = await tokenManager.getValidToken();
      
      if (!token) {
        setIsLoading(false);
        showAlert(t('alerts.error'), t('alerts.noAuthTokenAvailable'), 'error');
        return;
      }
      
      // PRODUCTION FIX: Convert working proof images to base64 with error handling
      let workingProofUrls: string[] = [];
      if (formData.photos.length > 0) {
        try {
          workingProofUrls = await convertMultipleToBase64(formData.photos);
          
          // PRODUCTION FIX: Validate that we have at least one converted image
          if (workingProofUrls.length === 0) {
            setIsLoading(false);
            showAlert(
              t('alerts.error'), 
              'Failed to convert images. Please try selecting images again.', 
              'error'
            );
            return;
          }
          
          if (__DEV__) {
            console.log(`✅ Successfully converted ${workingProofUrls.length} image(s) to base64`);
          }
        } catch (conversionError: any) {
          setIsLoading(false);
          console.error('❌ Image conversion error:', conversionError);
          showAlert(
            t('alerts.error'), 
            `Failed to process images: ${conversionError?.message || 'Unknown error'}. Please try again.`, 
            'error'
          );
          return;
        }
      }
      
      // PRODUCTION FIX: Convert engineering certificate to base64 with error handling
      let engineeringCertificateUrl = formData.engineeringCertificate;
      if (engineeringCertificateUrl) {
        // Check if it needs conversion
        if (engineeringCertificateUrl.startsWith('file://')) {
          try {
            engineeringCertificateUrl = await convertToBase64(engineeringCertificateUrl);
            if (!engineeringCertificateUrl || engineeringCertificateUrl.length === 0) {
              setIsLoading(false);
              showAlert(
                t('alerts.error'), 
                'Failed to convert engineering certificate. Please try selecting it again.', 
                'error'
              );
              return;
            }
            if (__DEV__) {
              console.log('✅ Successfully converted engineering certificate to base64');
            }
          } catch (certError: any) {
            setIsLoading(false);
            console.error('❌ Certificate conversion error:', certError);
            showAlert(
              t('alerts.error'), 
              `Failed to process engineering certificate: ${certError?.message || 'Unknown error'}. Please try again.`, 
              'error'
            );
            return;
          }
        } else if (!engineeringCertificateUrl.startsWith('data:image/') && 
                   !engineeringCertificateUrl.startsWith('http://') && 
                   !engineeringCertificateUrl.startsWith('https://')) {
          // Invalid format
          setIsLoading(false);
          showAlert(
            t('alerts.error'), 
            'Invalid engineering certificate format. Please select it again.', 
            'error'
          );
          return;
        }
      }
      
      // Prepare payload for backend
      const payload: any = {
        yearsOfExperience: parseInt(formData.experience, 10),
        serviceDescription: formData.description,
        serviceChargeValue: parseFloat(formData.charges),
        serviceChargeUnit: 'INR',
        state: formData.state,
        city: formData.city,
        fullAddress: formData.address,
        workingProofUrls: workingProofUrls,
        isEngineeringProvider: isEngineerOrInterior,
        engineeringCertificateUrl: engineeringCertificateUrl || undefined
      };
      
      
      // PRODUCTION FIX: Log payload in development for debugging
      if (__DEV__) {
        console.log('📤 Sending registration payload:', {
          ...payload,
          workingProofUrls: payload.workingProofUrls?.map((url: string) => url.substring(0, 50) + '...') || [],
          engineeringCertificateUrl: payload.engineeringCertificateUrl?.substring(0, 50) + '...' || 'none'
        });
      }
      
      const method = isEditMode ? 'PUT' : 'POST';
      const response = await fetch(`${API_BASE_URL}/api/services/${category}/providers`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      
      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        // If response is not JSON, get text
        const text = await response.text();
        setIsLoading(false);
        console.error('❌ Non-JSON response from server:', text);
        showAlert(
          t('alerts.registrationError'), 
          `Server error: ${text || 'Unknown error'}`, 
          'error', 
          [{ text: 'OK', onPress: () => setShowAlertModal(false), style: 'primary' }]
        );
        return;
      }
      
      setIsLoading(false);
      
      if (!response.ok) {
        // PRODUCTION FIX: Better error handling with detailed messages
        const errorMessage = data.message || data.error || t('alerts.failedToRegisterService');
        const errorDetails = data.errors ? `\n\nDetails: ${JSON.stringify(data.errors)}` : '';
        
        if (__DEV__) {
          console.error('❌ Registration failed:', {
            status: response.status,
            statusText: response.statusText,
            error: errorMessage,
            data: data
          });
        }
        
        if (data.message && data.message.includes('Already registered')) {
          showAlert(
            'Service Already Registered', 
            'You have already registered for this service. You cannot register for the same service multiple times.',
            'warning',
            [{ text: 'OK', onPress: () => {
              setShowAlertModal(false);
              router.back();
            }, style: 'primary' }]
          );
        } else if (data.message && data.message.includes('Cloudinary')) {
          // Cloudinary-specific error
          showAlert(
            t('alerts.registrationError'), 
            `${errorMessage}${errorDetails}\n\nPlease check your internet connection and try again.`, 
            'error', 
            [{ text: 'OK', onPress: () => setShowAlertModal(false), style: 'primary' }]
          );
        } else {
          showAlert(
            t('alerts.registrationError'), 
            `${errorMessage}${errorDetails}`, 
            'error', 
            [{ text: 'OK', onPress: () => setShowAlertModal(false), style: 'primary' }]
          );
        }
        return;
      }
      
      // For edit mode, show success message
      if (isEditMode) {
        showAlert(t('alerts.success'), t('alerts.serviceUpdatedSuccessfully'), 'success', [
          { text: 'OK', onPress: () => {
            setShowAlertModal(false);
            router.replace('/(tabs)/services');
          }, style: 'primary'},
        ]);
      } else {
        // For new registration, check if it's a free service
        const providerServiceId = data.data?.providerService?.id;
        const isFreeService = data.data?.isFreeService;
        
        if (providerServiceId) {
          if (isFreeService) {
            // Free service (labor) - show success and navigate to services
            showAlert(
              'Registration Successful! 🎉',
              'Your labor service has been activated for free! You can now start receiving bookings.',
              'success',
              [
                { 
                  text: 'OK', 
                  onPress: () => {
                    setShowAlertModal(false);
                    router.replace('/(tabs)/services');
                  }, 
                  style: 'primary' 
                }
              ]
            );
          } else {
            // Paid service - navigate to payment screen
            router.push({
              pathname: '/payment',
              params: {
                serviceId: category as string,
                serviceName: service?.name,
                amount: service?.basePrice || 99,
                category: category as string,
                providerServiceId: providerServiceId
              }
            });
          }
        } else {
          showAlert('Error', 'Failed to get service ID for payment', 'error', [
            { text: 'OK', onPress: () => setShowAlertModal(false), style: 'primary' }
          ]);
        }
      }
    } catch (error: any) {
      setIsLoading(false);
      // PRODUCTION FIX: Better error logging and user feedback
      const errorMessage = error?.message || error?.toString() || 'Unknown error occurred';
      
      if (__DEV__) {
        console.error('❌ Submit error:', {
          message: errorMessage,
          error: error,
          stack: error?.stack
        });
      }
      
      // Check if it's a network error
      if (errorMessage.includes('Network') || errorMessage.includes('fetch') || errorMessage.includes('Failed to fetch')) {
        showAlert(
          t('alerts.error'), 
          'Network error. Please check your internet connection and try again.', 
          'error', 
          [{ text: 'OK', onPress: () => setShowAlertModal(false), style: 'primary' }]
        );
      } else if (errorMessage.includes('base64') || errorMessage.includes('convert')) {
        // Image conversion error
        showAlert(
          t('alerts.error'), 
          `Failed to process images: ${errorMessage}. Please try selecting images again.`, 
          'error', 
          [{ text: 'OK', onPress: () => setShowAlertModal(false), style: 'primary' }]
        );
      } else {
        showAlert(
          t('alerts.error'), 
          `${t('alerts.failedToSubmitRegistration')}\n\n${errorMessage}`, 
          'error', 
          [{ text: 'OK', onPress: () => setShowAlertModal(false), style: 'primary' }]
        );
      }
    }
  };

  if (!service) {
    return (
      <SafeView style={styles.centerContent}>
        <Text style={styles.errorText}>{t('serviceRegistration.serviceNotFound')}</Text>
      </SafeView>
    );
  }

  if (isLoadingData) {
    return (
      <SafeView style={styles.centerContent}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>{t('serviceRegistration.loadingServiceDetails')}</Text>
      </SafeView>
    );
  }

  return (
    <SafeView style={styles.safeArea} backgroundColor="#FFFFFF">
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={24} color="#374151" />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1} ellipsizeMode="tail">
            {isViewMode ? t('serviceRegistration.view') : isEditMode ? t('serviceRegistration.edit') : t('serviceRegistration.register')} - {service.name}
          </Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollViewContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.form}>
            <View style={styles.formSection}>
              <Text style={styles.label} numberOfLines={1} ellipsizeMode="tail">{t('serviceRegistration.providerName')}</Text>
              <TextInput
                style={[styles.input, { backgroundColor: '#F1F5F9', color: '#9CA3AF' }]}
                value={formData.fullName}
                editable={false}
                selectTextOnFocus={false}
                placeholder={t('serviceRegistration.providerName')}
                placeholderTextColor="#9CA3AF"
              />
            </View>

            <View style={styles.formSection}>
              <Text style={styles.label} numberOfLines={1} ellipsizeMode="tail">{t('serviceRegistration.phoneNumber')}</Text>
              <TextInput
                style={[styles.input, { backgroundColor: '#F1F5F9', color: '#9CA3AF' }]}
                value={formData.phone}
                editable={false}
                selectTextOnFocus={false}
                placeholder={t('serviceRegistration.phoneNumber')}
                placeholderTextColor="#9CA3AF"
                keyboardType="numeric"
              />
            </View>

            <View style={styles.formSection}>
              <Text style={styles.label} numberOfLines={1} ellipsizeMode="tail">{t('serviceRegistration.state')} *</Text>
              <StateSelector
                value={formData.state}
                onSelect={(value) => handleInputChange('state', value)}
                placeholder={t('serviceRegistration.statePlaceholder')}
                error={errors.state}
                disabled={isViewMode}
              />
            </View>

            <View style={styles.formSection}>
              <Text style={styles.label} numberOfLines={1} ellipsizeMode="tail">{t('serviceRegistration.city')} *</Text>
              <CitySelector
                value={formData.city}
                onSelect={(value) => handleInputChange('city', value)}
                state={formData.state}
                placeholder={t('serviceRegistration.cityPlaceholder')}
                error={errors.city}
                disabled={isViewMode}
              />
            </View>

            <View style={styles.formSection}>
              <Text style={styles.label} numberOfLines={1} ellipsizeMode="tail">{t('serviceRegistration.completeAddress')} *</Text>
              <TextInput
                style={[
                  styles.input, 
                  styles.textArea, 
                  errors.address && styles.inputError,
                  isViewMode && { backgroundColor: '#F1F5F9', color: '#9CA3AF' }
                ]}
                value={formData.address}
                onChangeText={(value) => handleInputChange('address', value)}
                placeholder={t('serviceRegistration.addressPlaceholder')}
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={3}
                returnKeyType="next"
                clearButtonMode="while-editing"
                editable={!isViewMode}
              />
              {errors.address && <Text style={styles.errorText} numberOfLines={2} ellipsizeMode="tail">{errors.address}</Text>}
            </View>

            <View style={styles.formSection}>
              <Text style={styles.label} numberOfLines={1} ellipsizeMode="tail">{t('serviceRegistration.yearsOfExperience')} *</Text>
              <TextInput
                style={[
                  styles.input, 
                  errors.experience && styles.inputError,
                  isViewMode && { backgroundColor: '#F1F5F9', color: '#9CA3AF' }
                ]}
                value={formData.experience}
                onChangeText={(value) => handleInputChange('experience', value)}
                placeholder={t('serviceRegistration.experiencePlaceholder')}
                placeholderTextColor="#9CA3AF"
                keyboardType="numeric"
                returnKeyType="next"
                clearButtonMode="while-editing"
                editable={!isViewMode}
              />
              {errors.experience && <Text style={styles.errorText} numberOfLines={2} ellipsizeMode="tail">{errors.experience}</Text>}
            </View>

            <View style={styles.formSection}>
              <Text style={styles.label} numberOfLines={1} ellipsizeMode="tail">{t('serviceRegistration.serviceCharges')} *</Text>
              <TextInput
                style={[
                  styles.input, 
                  errors.charges && styles.inputError,
                  isViewMode && { backgroundColor: '#F1F5F9', color: '#9CA3AF' }
                ]}
                value={formData.charges}
                onChangeText={(value) => handleInputChange('charges', value)}
                placeholder={t('serviceRegistration.chargesPlaceholder')}
                placeholderTextColor="#9CA3AF"
                returnKeyType="next"
                clearButtonMode="while-editing"
                editable={!isViewMode}
              />
              {errors.charges && <Text style={styles.errorText} numberOfLines={2} ellipsizeMode="tail">{errors.charges}</Text>}
            </View>

            <View style={styles.formSection}>
              <Text style={styles.label} numberOfLines={1} ellipsizeMode="tail">{t('serviceRegistration.serviceDescription')}</Text>
              <TextInput
                style={[
                  styles.input, 
                  styles.textArea,
                  isViewMode && { backgroundColor: '#F1F5F9', color: '#9CA3AF' }
                ]}
                value={formData.description}
                onChangeText={(value) => handleInputChange('description', value)}
                placeholder={t('serviceRegistration.descriptionPlaceholder')}
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={4}
                returnKeyType="done"
                clearButtonMode="while-editing"
                editable={!isViewMode}
              />
            </View>

            {isEngineerOrInterior && (
              <View style={styles.formSection}>
                <Text style={styles.label} numberOfLines={1} ellipsizeMode="tail">{t('serviceRegistration.engineeringCertificate')} *</Text>
                <Text style={styles.helperText} numberOfLines={2} ellipsizeMode="tail">
                  {t('serviceRegistration.certificateHelper')}
                </Text>

                {formData.engineeringCertificate && formData.engineeringCertificate.trim() !== '' ? (
                  <View style={styles.certificateContainer}>
                    <Image
                      source={{ uri: formData.engineeringCertificate }}
                      style={styles.certificateImage}
                      resizeMode="cover"
                      onError={(error) => {
                        // PRODUCTION FIX: Handle image loading errors gracefully
                        // Don't log as error - image loading failures are expected (network issues, invalid URLs, etc.)
                        // Only log in development for debugging
                        if (__DEV__) {
                          console.warn('Engineering certificate failed to load:', formData.engineeringCertificate, error?.nativeEvent?.error || error);
                        }
                      }}
                      onLoad={() => {
                        // Only log in development
                        if (__DEV__) {
                          console.log('Successfully loaded engineering certificate:', formData.engineeringCertificate);
                        }
                      }}
                    />
                    {!isViewMode && (
                      <TouchableOpacity
                        style={styles.removeCertificateButton}
                        onPress={handleRemoveCertificate}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <X size={16} color="#FFFFFF" />
                      </TouchableOpacity>
                    )}
                  </View>
                ) : (
                  !isViewMode && (
                    <TouchableOpacity style={styles.uploadButton} onPress={handleAddCertificate}>
                      <Upload size={24} color="#3B82F6" />
                      <Text style={styles.uploadButtonText} numberOfLines={1} ellipsizeMode="tail">{t('serviceRegistration.uploadCertificate')}</Text>
                    </TouchableOpacity>
                  )
                )}
                {errors.engineeringCertificate && (
                  <Text style={styles.errorText} numberOfLines={2} ellipsizeMode="tail">{errors.engineeringCertificate}</Text>
                )}
              </View>
            )}

            {!isEngineerOrInterior && (
              <View style={styles.formSection}>
                <Text style={styles.label} numberOfLines={1} ellipsizeMode="tail">{t('serviceRegistration.previousProjectPhotos')} *</Text>
                <Text style={styles.helperText} numberOfLines={2} ellipsizeMode="tail">{t('serviceRegistration.photosHelper')}</Text>

                <View style={styles.photosContainer}>
                  {formData.photos && formData.photos.length > 0 ? (
                    formData.photos
                      .filter(photo => {
                        // PRODUCTION FIX: Filter out invalid and mock URLs
                        if (!photo || typeof photo !== 'string' || photo.trim() === '') {
                          return false;
                        }
                        const trimmed = photo.trim();
                        // PRODUCTION FIX: Filter out mock URLs that don't exist
                        if (trimmed.includes('mock-cloud') || trimmed.includes('/mock-image-')) {
                          if (__DEV__) {
                            console.warn('⚠️ Skipping mock URL in render:', trimmed.substring(0, 80));
                          }
                          return false;
                        }
                        return true;
                      })
                      .map((photo, index) => {
                        // PRODUCTION FIX: Ensure photo URL is valid before rendering
                        if (!photo || typeof photo !== 'string' || photo.trim() === '') {
                          return null;
                        }
                        
                        // PRODUCTION FIX: Debug log in development
                        if (__DEV__) {
                          console.log(`📸 Rendering image ${index}:`, photo.substring(0, 80) + '...');
                        }
                        
                        return (
                          <View key={`photo-${index}-${photo.substring(0, 20)}`} style={styles.photoWrapper}>
                            <Image 
                              source={{ uri: photo }} 
                              style={styles.photo} 
                              resizeMode="cover"
                              onError={(error) => {
                                // PRODUCTION FIX: Handle image loading errors gracefully
                                // Don't log as error - image loading failures are expected (network issues, invalid URLs, etc.)
                                // Only log in development for debugging
                                if (__DEV__) {
                                  console.warn(`❌ Image ${index} failed to load:`, photo.substring(0, 80), error?.nativeEvent?.error || error);
                                }
                                // Optionally remove the broken image from the list
                                // Uncomment the line below if you want to auto-remove broken images
                                // handleRemovePhoto(index);
                              }}
                              onLoadStart={() => {
                                if (__DEV__) {
                                  console.log(`🔄 Image ${index} loading started:`, photo.substring(0, 80) + '...');
                                }
                              }}
                              onLoad={() => {
                                // Only log in development
                                if (__DEV__) {
                                  console.log(`✅ Successfully loaded image ${index}:`, photo.substring(0, 80) + '...');
                                }
                              }}
                              onLoadEnd={() => {
                                if (__DEV__) {
                                  console.log(`🏁 Image ${index} load ended:`, photo.substring(0, 80) + '...');
                                }
                              }}
                            />
                            {!isViewMode && (
                              <TouchableOpacity
                                style={styles.removePhotoButton}
                                onPress={() => handleRemovePhoto(index)}
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                              >
                                <X size={16} color="#FFFFFF" />
                              </TouchableOpacity>
                            )}
                          </View>
                        );
                      })
                  ) : (
                    // PRODUCTION FIX: Show message when no photos available in view mode
                    isViewMode && (
                      <Text style={styles.helperText}>{t('serviceRegistration.noPhotosAvailable') || 'No photos available'}</Text>
                    )
                  )}

                  {formData.photos.length < 4 && !isViewMode && (
                    <TouchableOpacity style={styles.addPhotoButton} onPress={handleAddPhoto}>
                      <Camera size={24} color="#3B82F6" />
                      <Text style={styles.addPhotoText} numberOfLines={1} ellipsizeMode="tail">{t('serviceRegistration.addPhoto')}</Text>
                    </TouchableOpacity>
                  )}
                </View>
                {errors.photos && <Text style={styles.errorText} numberOfLines={2} ellipsizeMode="tail">{errors.photos}</Text>}
              </View>
            )}

            {!isViewMode && (
              <TouchableOpacity
                style={[styles.submitButton, isLoading && styles.submitButtonLoading]}
                onPress={handleSubmit}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.submitButtonText} numberOfLines={1} ellipsizeMode="tail">
                    {isEditMode 
                      ? t('serviceRegistration.updateInformation') 
                      : service?.basePrice === 0 
                        ? 'Register Free Service' 
                        : `${t('serviceRegistration.continueToPayment')} (₹${service?.basePrice})`
                    }
                  </Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF', // Ensures a clean background behind the content
  },
  container: {
    flex: 1,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: getResponsiveSpacing(12, 16, 20),
    paddingVertical: getResponsiveSpacing(12, 16, 20),
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  backButton: {
    padding: getResponsiveSpacing(6, 8, 10),
    minWidth: getResponsiveSpacing(40, 44, 48),
    minHeight: getResponsiveSpacing(40, 44, 48),
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: getResponsiveSpacing(16, 18, 20),
    fontFamily: 'Inter-SemiBold',
    color: '#1F2937',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: getResponsiveSpacing(8, 12, 16),
  },
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    paddingBottom: getResponsiveSpacing(20, 30, 40), // Extra padding at the bottom of the scroll view
  },
  form: {
    padding: getResponsiveSpacing(16, 20, 24),
  },
  formSection: {
    marginBottom: getResponsiveSpacing(16, 20, 24),
  },
  label: {
    fontSize: getResponsiveSpacing(14, 15, 16),
    fontFamily: 'Inter-Medium',
    color: '#374151',
    marginBottom: getResponsiveSpacing(4, 6, 8),
    flexShrink: 1,
  },
  helperText: {
    fontSize: getResponsiveSpacing(12, 13, 14), // Slightly smaller helper text
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
    marginBottom: getResponsiveSpacing(8, 10, 12), // Reduced margin
    lineHeight: getResponsiveSpacing(16, 18, 20),
  },
  input: {
    fontSize: getResponsiveSpacing(14, 16, 18),
    fontFamily: 'Inter-Regular',
    color: '#1F2937', // Darker text for readability
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: getResponsiveSpacing(8, 10, 12), // Slightly less rounded corners
    backgroundColor: '#FFFFFF', // White background for inputs
    paddingHorizontal: getResponsiveSpacing(12, 16, 20),
    paddingVertical: getResponsiveSpacing(10, 12, 14),
    shadowColor: '#000', // Subtle shadow for inputs
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 1,
    elevation: 1,
  },
  inputError: {
    borderColor: '#EF4444', // Red border for error state
    borderWidth: 1.5, // Slightly thicker border for error
  },
  errorText: {
    fontSize: getResponsiveSpacing(11, 12, 13),
    fontFamily: 'Inter-Regular',
    color: '#EF4444',
    marginTop: getResponsiveSpacing(3, 4, 5),
    flexShrink: 1,
  },
  disabledInput: {
    backgroundColor: '#F3F4F6',
    color: '#9CA3AF',
  },
  textArea: {
    minHeight: getResponsiveSpacing(80, 100, 120), // Slightly taller text area
    textAlignVertical: 'top',
    paddingTop: getResponsiveSpacing(10, 12, 14), // Ensure text starts from top
  },
  photosContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: getResponsiveSpacing(8, 10, 12), // Reduced gap slightly
  },
  photoWrapper: {
    position: 'relative',
    width: getResponsiveSpacing(75, 85, 95), // Slightly larger photo size
    height: getResponsiveSpacing(75, 85, 95),
    borderRadius: getResponsiveSpacing(8, 10, 12),
    overflow: 'hidden', // Ensures image respects border radius
    borderWidth: 1,
    borderColor: '#E5E7EB', // Border for consistency
    backgroundColor: '#F3F4F6', // PRODUCTION FIX: Add background color to prevent white flash
  },
  photo: {
    width: '100%',
    height: '100%',
    borderRadius: getResponsiveSpacing(8, 10, 12), // Match wrapper border radius
    backgroundColor: 'transparent', // PRODUCTION FIX: Ensure image background is transparent
  },
  removePhotoButton: {
    position: 'absolute',
    top: getResponsiveSpacing(-5, -6, -7), // Adjusted position
    right: getResponsiveSpacing(-5, -6, -7), // Adjusted position
    backgroundColor: '#EF4444',
    borderRadius: getResponsiveSpacing(10, 12, 14),
    width: getResponsiveSpacing(20, 24, 28),
    height: getResponsiveSpacing(20, 24, 28),
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1, // Ensure button is above image
  },
  addPhotoButton: {
    width: getResponsiveSpacing(75, 85, 95),
    height: getResponsiveSpacing(75, 85, 95),
    borderWidth: 2,
    borderColor: '#3B82F6',
    borderStyle: 'dashed',
    borderRadius: getResponsiveSpacing(8, 10, 12),
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F0F9FF', // Light blue background for add photo
  },
  addPhotoText: {
    fontSize: getResponsiveSpacing(10, 11, 12),
    fontFamily: 'Inter-Medium',
    color: '#3B82F6',
    marginTop: getResponsiveSpacing(3, 4, 5),
    textAlign: 'center',
    flexShrink: 1,
  },
  certificateContainer: {
    position: 'relative',
    alignSelf: 'flex-start',
    borderRadius: getResponsiveSpacing(8, 10, 12),
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  certificateImage: {
    width: getResponsiveSpacing(100, 120, 140),
    height: getResponsiveSpacing(130, 160, 190),
    borderRadius: getResponsiveSpacing(8, 10, 12),
    backgroundColor: 'transparent', // PRODUCTION FIX: Ensure image background is transparent
  },
  removeCertificateButton: {
    position: 'absolute',
    top: getResponsiveSpacing(-5, -6, -7),
    right: getResponsiveSpacing(-5, -6, -7),
    backgroundColor: '#EF4444',
    borderRadius: getResponsiveSpacing(10, 12, 14),
    width: getResponsiveSpacing(20, 24, 28),
    height: getResponsiveSpacing(20, 24, 28),
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#3B82F6',
    borderStyle: 'dashed',
    borderRadius: getResponsiveSpacing(8, 10, 12), // Slightly less rounded
    paddingVertical: getResponsiveSpacing(16, 18, 20), // Slightly more vertical padding
    paddingHorizontal: getResponsiveSpacing(12, 16, 20),
    gap: getResponsiveSpacing(8, 10, 12), // Increased gap between icon and text
    backgroundColor: '#F0F9FF', // Light blue background
  },
  uploadButtonText: {
    fontSize: getResponsiveSpacing(14, 16, 18),
    fontFamily: 'Inter-SemiBold',
    color: '#3B82F6',
    flexShrink: 1,
  },
  submitButton: {
    backgroundColor: '#3B82F6',
    paddingVertical: getResponsiveSpacing(14, 15, 16), // Slightly less vertical padding
    borderRadius: getResponsiveSpacing(8, 10, 12), // Less rounded
    alignItems: 'center',
    justifyContent: 'center', // Center content
    marginTop: getResponsiveSpacing(20, 25, 30), // Increased margin
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 }, // More pronounced shadow
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6, // Higher elevation
  },
  submitButtonLoading: {
    opacity: 0.7, // Only opacity change for loading
  },
  submitButtonText: {
    fontSize: getResponsiveSpacing(15, 17, 19),
    fontFamily: 'Inter-SemiBold',
    color: '#FFFFFF',
    textAlign: 'center',
    flexShrink: 1,
  },
  loadingText: {
    fontSize: getResponsiveSpacing(14, 16, 18),
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
    marginTop: getResponsiveSpacing(8, 10, 12),
    textAlign: 'center',
  },
});