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
import { ArrowLeft, Camera, X, Upload, Plus, Trash2 } from 'lucide-react-native';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { getServiceById, SERVICE_CATEGORIES } from '@/constants/serviceCategories';
import { getRelatedSubServices, getSubServiceById } from '@/constants/serviceSubServices';
import { SafeView } from '@/components/SafeView';
import { Modal } from '@/components/common/Modal';
import StateSelector from '@/components/common/StateSelector';
import CitySelector from '@/components/common/CitySelector';
import ServiceSelector from '@/components/common/ServiceSelector';
import SubServiceSelector from '@/components/common/SubServiceSelector';
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

interface SubService {
  id: string; // Unique ID for this sub-service row
  serviceId: string; // Selected service ID from dropdown
  price: string; // Price/cost for this sub-service
}

interface FormData {
  fullName: string;
  phone: string;
  state: string;
  city: string;
  address: string;
  experience: string;
  description: string;
  photos: string[];
  engineeringCertificate?: string;
  subServices: SubService[]; // Array of sub-services
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
    description: '',
    photos: [],
    engineeringCertificate: undefined,
    subServices: [], // Initialize with empty array
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
        
        const serviceData = data.data.registeredServices.find(
          (s: any) => s.provider_service_id === serviceId
        );

        if (serviceData) {
          // PRODUCTION: Parse working_proof_urls - handle all possible formats
          let workingProofUrls: string[] = [];
          
          if (serviceData.working_proof_urls) {
            try {
              // Handle PostgreSQL array format - pg library should return arrays, but handle all cases
              if (Array.isArray(serviceData.working_proof_urls)) {
                // Already an array - filter valid URLs
                workingProofUrls = serviceData.working_proof_urls
                  .filter((url: any) => {
                    if (!url || typeof url !== 'string') return false;
                    const trimmed = url.trim();
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
                
                // Try JSON parse first
                try {
                  const parsed = JSON.parse(strValue);
                  if (Array.isArray(parsed)) {
                    workingProofUrls = parsed
                      .filter((url: any) => {
                        if (!url || typeof url !== 'string') return false;
                        const trimmed = url.trim();
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
                      if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:image/') || trimmed.startsWith('file://')) {
                        workingProofUrls = [trimmed];
                      }
                    }
                  } catch (parseError) {
                    // JSON parse failed - check if it's a single URL string
                    if (strValue !== '' && 
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
              workingProofUrls = [];
            }
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
            description: serviceData.service_description || '',
            photos: workingProofUrls,
            engineeringCertificate: engineeringCertificateUrl,
            // Load sub-services if available (frontend-only feature for now)
            // Backend may not have this data yet, so handle gracefully
            subServices: Array.isArray(serviceData.sub_services) 
              ? serviceData.sub_services.map((sub: any, idx: number) => ({
                  id: sub.id || `sub-service-${idx}-${Date.now()}`,
                  serviceId: sub.serviceId || sub.service_id || '',
                  price: sub.price?.toString() || sub.cost?.toString() || '',
                }))
              : [],
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

  // Handle adding a new sub-service
  const handleAddSubService = () => {
    const newSubService: SubService = {
      id: `sub-service-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      serviceId: '',
      price: '',
    };
    setFormData((prev) => ({
      ...prev,
      subServices: [...prev.subServices, newSubService],
    }));
  };

  // Handle removing a sub-service
  const handleRemoveSubService = (id: string) => {
    setFormData((prev) => ({
      ...prev,
      subServices: prev.subServices.filter((subService) => subService.id !== id),
    }));
  };

  // Handle sub-service service selection change
  const handleSubServiceChange = (id: string, field: 'serviceId' | 'price', value: string) => {
    setFormData((prev) => {
      // If changing price, only allow numeric characters and decimal point
      if (field === 'price') {
        // Remove all non-numeric characters except decimal point
        const numericValue = value.replace(/[^0-9.]/g, '');
        // Ensure only one decimal point
        const parts = numericValue.split('.');
        const sanitizedValue = parts.length > 2 
          ? parts[0] + '.' + parts.slice(1).join('')
          : numericValue;
        
        return {
          ...prev,
          subServices: prev.subServices.map((subService) =>
            subService.id === id ? { ...subService, [field]: sanitizedValue } : subService
          ),
        };
      }
      
      return {
        ...prev,
        subServices: prev.subServices.map((subService) =>
          subService.id === id ? { ...subService, [field]: value } : subService
        ),
      };
    });
  };

  // Convert file URI to base64
  const convertToBase64 = async (uri: string): Promise<string> => {
    try {
      // PRODUCTION FIX: Validate input
      if (!uri || typeof uri !== 'string' || uri.trim() === '') {
        throw new Error('Invalid URI provided');
      }
      
      // If it's already a base64 URL, return as is
      if (uri.startsWith('data:image/')) {
        return uri;
      }
      
      // If it's a file URI, convert to base64
      if (uri.startsWith('file://')) {
        try {
          // PRODUCTION FIX: Check if file exists before reading
          const fileInfo = await FileSystem.getInfoAsync(uri);
          if (!fileInfo.exists) {
            throw new Error(`File does not exist: ${uri}`);
          }
          
          const base64 = await FileSystem.readAsStringAsync(uri, {
            encoding: 'base64' as any,
          });
          
          if (!base64 || base64.length === 0) {
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
          
          return base64DataUrl;
        } catch (fileError: any) {
          throw new Error(`Failed to convert file to base64: ${fileError?.message || fileError}`);
        }
      }
      
      // If it's already a remote URL (Cloudinary), return as is
      if (uri.startsWith('http://') || uri.startsWith('https://')) {
        return uri;
      }
      
      // Unknown format
      throw new Error(`Unknown URI format: ${uri.substring(0, 50)}`);
    } catch (error: any) {
      throw error; // Re-throw to be caught by caller
    }
  };

  // Convert multiple URIs to base64
  const convertMultipleToBase64 = async (uris: string[]): Promise<string[]> => {
    try {
      if (!uris || uris.length === 0) {
        return [];
      }
      
      // PRODUCTION FIX: Use Promise.allSettled to handle individual failures gracefully
      const base64Promises = uris.map(async (uri, index) => {
        try {
          const result = await convertToBase64(uri);
          return { success: true, result };
        } catch (error: any) {
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
      
      // PRODUCTION FIX: If all conversions failed, throw an error
      if (successful.length === 0 && uris.length > 0) {
        const errorMessage = `Failed to convert all ${uris.length} image(s) to base64. ${failed.map(f => f.error).join('; ')}`;
        throw new Error(errorMessage);
      }
      
      return successful;
    } catch (error: any) {
      throw error; // Re-throw to be caught by handleSubmit
    }
  };

  const handleSubmit = async () => {
    const newErrors: Partial<Record<keyof FormData, string>> = {};
    if (!formData.state.trim()) newErrors.state = t('serviceRegistration.stateRequired');
    if (!formData.city.trim()) newErrors.city = t('serviceRegistration.cityRequired');
    if (!formData.address.trim()) newErrors.address = t('serviceRegistration.addressRequired');
    if (!formData.experience.trim()) newErrors.experience = t('serviceRegistration.experienceRequired');
    if (isEngineerOrInterior && !formData.engineeringCertificate) {
      newErrors.engineeringCertificate = t('serviceRegistration.engineeringCertificateMandatory');
    }
    if (!isEngineerOrInterior && formData.photos.length === 0) {
      newErrors.photos = 'Please upload at least one previous project photo.';
    }
    
    // Validate sub-services: at least one required, and all must have both serviceId and price
    if (formData.subServices.length === 0) {
      newErrors.subServices = t('serviceRegistration.atLeastOneSubServiceRequired');
    } else {
      const invalidSubServices = formData.subServices.filter(
        (subService) => !subService.serviceId.trim() || !subService.price.trim()
      );
      if (invalidSubServices.length > 0) {
        newErrors.subServices = t('serviceRegistration.allSubServicesMustBeFilled');
      }
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
        } catch (conversionError: any) {
          setIsLoading(false);
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
          } catch (certError: any) {
            setIsLoading(false);
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
        state: formData.state,
        city: formData.city,
        fullAddress: formData.address,
        workingProofUrls: workingProofUrls,
        isEngineeringProvider: isEngineerOrInterior,
        engineeringCertificateUrl: engineeringCertificateUrl || undefined,
        // Sub-services data
        subServices: formData.subServices
          .filter(subService => subService.serviceId && subService.price) // Only include valid sub-services
          .map(subService => ({
            serviceId: subService.serviceId,
            price: parseFloat(subService.price) || 0,
          })),
      };
      
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

            {/* Sub-Services Section */}
            <View style={styles.formSection}>
              <Text style={styles.label} numberOfLines={1} ellipsizeMode="tail">{t('serviceRegistration.subServices')} *</Text>
              <Text style={styles.helperText} numberOfLines={2} ellipsizeMode="tail">
                {t('serviceRegistration.subServicesHelper')}
              </Text>
              {formData.subServices.length > 0 ? (
                <View style={styles.subServicesContainer}>
                  <View style={styles.subServicesList}>
                    {formData.subServices.map((subService, index) => {
                      // Get the selected sub-service option
                      const selectedSubService = getSubServiceById(category as string, subService.serviceId);
                      
                      // Get all other selected sub-service IDs to exclude them from this dropdown
                      // This ensures once a sub-service is selected in one row, it disappears from all others
                      const otherSelectedSubServiceIds = formData.subServices
                        .filter(s => s.id !== subService.id && s.serviceId && s.serviceId.trim() !== '')
                        .map(s => s.serviceId)
                        .filter((id): id is string => Boolean(id));
                      
                      return (
                        <View key={subService.id} style={styles.subServiceCard}>
                          <View style={styles.subServiceCardHeader}>
                            <View style={styles.subServiceCardHeaderLeft}>
                              <View style={styles.subServiceIndexBadge}>
                                <Text style={styles.subServiceIndexText}>{index + 1}</Text>
                              </View>
                              <View style={styles.subServiceInfo}>
                                {selectedSubService ? (
                                  <>
                                    <Text style={styles.subServiceName}>
                                      {t(`subServices.${category}.${selectedSubService.id}`) || selectedSubService.name}
                                    </Text>
                                    {subService.price && (
                                      <Text style={styles.subServicePricePreview}>
                                        ₹{subService.price}
                                      </Text>
                                    )}
                                  </>
                                ) : (
                                  <View style={styles.subServicePlaceholder}>
                                    <Text style={styles.subServicePlaceholderText}>
                                    {t('serviceRegistration.selectServiceAndAddPrice')}
                                  </Text>
                                  <Text style={styles.subServicePlaceholderHint}>
                                    {t('serviceRegistration.chooseFromOptionsBelow')}
                                  </Text>
                                  </View>
                                )}
                              </View>
                            </View>
                            {!isViewMode && (
                              <TouchableOpacity
                                style={styles.subServiceDeleteButton}
                                onPress={() => handleRemoveSubService(subService.id)}
                                activeOpacity={0.6}
                              >
                                <Trash2 size={18} color="#EF4444" />
                              </TouchableOpacity>
                            )}
                          </View>
                          
                          <View style={styles.subServiceCardBody}>
                            <View style={styles.subServiceInputGroup}>
                              <Text style={styles.subServiceInputLabel}>{t('serviceRegistration.serviceType')}</Text>
                              <SubServiceSelector
                                value={subService.serviceId}
                                onSelect={(subServiceId) => handleSubServiceChange(subService.id, 'serviceId', subServiceId)}
                                placeholder={t('serviceRegistration.chooseRelatedService')}
                                disabled={isViewMode}
                                mainServiceId={category as string}
                                excludeSubServiceIds={otherSelectedSubServiceIds}
                                error={errors.subServices && !subService.serviceId.trim() ? t('serviceRegistration.serviceTypeRequired') : undefined}
                                style={styles.subServiceSelector}
                              />
                            </View>
                            
                            <View style={styles.subServiceInputGroup}>
                              <Text style={styles.subServiceInputLabel}>{t('serviceRegistration.servicePrice')}</Text>
                              <View style={[
                                styles.priceInputContainer,
                                errors.subServices && !subService.price.trim() && styles.priceInputError
                              ]}>
                                <View style={styles.priceInputPrefix}>
                                  <Text style={styles.priceInputPrefixText}>₹</Text>
                                </View>
                                <TextInput
                                  style={[
                                    styles.priceInput,
                                    isViewMode && styles.priceInputDisabled
                                  ]}
                                  value={subService.price}
                                  onChangeText={(value) => handleSubServiceChange(subService.id, 'price', value)}
                                  placeholder={t('serviceRegistration.enterPrice')}
                                  placeholderTextColor="#9CA3AF"
                                  keyboardType="numeric"
                                  editable={!isViewMode}
                                />
                              </View>
                              {errors.subServices && !subService.price.trim() && (
                                <Text style={styles.subServiceErrorText}>{t('serviceRegistration.priceRequired')}</Text>
                              )}
                            </View>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                  
                  {!isViewMode && (
                    <TouchableOpacity
                      style={styles.addAnotherButton}
                      onPress={handleAddSubService}
                      activeOpacity={0.8}
                    >
                      <View style={styles.addAnotherButtonIcon}>
                        <Plus size={20} color="#3B82F6" />
                      </View>
                      <Text style={styles.addAnotherButtonText}>{t('serviceRegistration.addAnotherService')}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                !isViewMode && (
                  <TouchableOpacity
                    style={styles.emptyStateContainer}
                    onPress={handleAddSubService}
                    activeOpacity={0.9}
                  >
                    <View style={styles.emptyStateContent}>
                      <View style={styles.emptyStateIconContainer}>
                        <View style={styles.emptyStateIconCircle}>
                          <Plus size={28} color="#3B82F6" strokeWidth={2.5} />
                        </View>
                      </View>
                      <Text style={styles.emptyStateTitle}>{t('serviceRegistration.noAdditionalServicesYet')}</Text>
                      <Text style={styles.emptyStateDescription}>
                        {t('serviceRegistration.addServicesDescription')}
                      </Text>
                      <View style={styles.emptyStateButton}>
                        <Plus size={18} color="#FFFFFF" />
                        <Text style={styles.emptyStateButtonText}>{t('serviceRegistration.addYourFirstService')}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                )
              )}
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
                      onError={() => {
                        // PRODUCTION FIX: Handle image loading errors gracefully
                        // Image loading failures are expected (network issues, invalid URLs, etc.)
                      }}
                      onLoad={() => {
                        // Image loaded successfully
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
                        // PRODUCTION: Filter out invalid URLs
                        if (!photo || typeof photo !== 'string' || photo.trim() === '') {
                          return false;
                        }
                        return true;
                      })
                      .map((photo, index) => {
                        // PRODUCTION FIX: Ensure photo URL is valid before rendering
                        if (!photo || typeof photo !== 'string' || photo.trim() === '') {
                          return null;
                        }
                        
                        return (
                          <View key={`photo-${index}-${photo.substring(0, 20)}`} style={styles.photoWrapper}>
                            <Image 
                              source={{ uri: photo }} 
                              style={styles.photo} 
                              resizeMode="cover"
                              onError={() => {
                                // PRODUCTION FIX: Handle image loading errors gracefully
                                // Image loading failures are expected (network issues, invalid URLs, etc.)
                                // Optionally remove the broken image from the list
                                // Uncomment the line below if you want to auto-remove broken images
                                // handleRemovePhoto(index);
                              }}
                              onLoadStart={() => {
                                // Image loading started
                              }}
                              onLoad={() => {
                                // Image loaded successfully
                              }}
                              onLoadEnd={() => {
                                // Image load ended
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
  // Sub-Services Styles - Premium UI/UX
  subServicesHeaderContainer: {
    marginBottom: getResponsiveSpacing(20, 24, 28),
    paddingBottom: getResponsiveSpacing(16, 20, 24),
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  subServicesHeaderContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  subServicesHeaderIcon: {
    width: getResponsiveSpacing(44, 48, 52),
    height: getResponsiveSpacing(44, 48, 52),
    borderRadius: getResponsiveSpacing(12, 14, 16),
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: getResponsiveSpacing(12, 14, 16),
  },
  subServicesHeaderIconText: {
    fontSize: getResponsiveSpacing(20, 22, 24),
  },
  subServicesHeaderText: {
    flex: 1,
  },
  subServicesTitle: {
    fontSize: getResponsiveSpacing(17, 19, 21),
    fontFamily: 'Inter-SemiBold',
    color: '#111827',
    marginBottom: getResponsiveSpacing(6, 8, 10),
    ...Platform.select({
      ios: {
        letterSpacing: -0.3,
      },
      android: {
        letterSpacing: -0.2,
      },
    }),
  },
  subServicesDescription: {
    fontSize: getResponsiveSpacing(13, 14, 15),
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
    lineHeight: getResponsiveSpacing(20, 22, 24),
  },
  subServicesContainer: {
    gap: getResponsiveSpacing(16, 20, 24),
  },
  subServicesList: {
    gap: getResponsiveSpacing(16, 20, 24),
  },
  subServiceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: getResponsiveSpacing(16, 18, 20),
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  subServiceCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: getResponsiveSpacing(16, 18, 20),
    paddingBottom: getResponsiveSpacing(12, 14, 16),
    backgroundColor: '#FAFBFC',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  subServiceCardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: getResponsiveSpacing(12, 14, 16),
    marginRight: getResponsiveSpacing(12, 16, 20), // Space between content and delete button
  },
  subServiceIndexBadge: {
    width: getResponsiveSpacing(32, 36, 40),
    height: getResponsiveSpacing(32, 36, 40),
    borderRadius: getResponsiveSpacing(10, 12, 14),
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#3B82F6',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  subServiceIndexText: {
    fontSize: getResponsiveSpacing(14, 15, 16),
    fontFamily: 'Inter-Bold',
    color: '#FFFFFF',
  },
  subServiceInfo: {
    flex: 1,
  },
  subServiceName: {
    fontSize: getResponsiveSpacing(15, 16, 17),
    fontFamily: 'Inter-SemiBold',
    color: '#111827',
    marginBottom: getResponsiveSpacing(2, 4, 6),
  },
  subServicePricePreview: {
    fontSize: getResponsiveSpacing(13, 14, 15),
    fontFamily: 'Inter-Medium',
    color: '#059669',
  },
  subServicePlaceholder: {
    flex: 1,
  },
  subServicePlaceholderText: {
    fontSize: getResponsiveSpacing(14, 15, 16),
    fontFamily: 'Inter-Medium',
    color: '#6B7280',
    marginBottom: getResponsiveSpacing(2, 4, 6),
  },
  subServicePlaceholderHint: {
    fontSize: getResponsiveSpacing(12, 13, 14),
    fontFamily: 'Inter-Regular',
    color: '#9CA3AF',
    ...Platform.select({
      ios: {
        fontStyle: 'italic',
      },
      android: {
        fontStyle: 'italic',
      },
    }),
  },
  subServiceDeleteButton: {
    width: getResponsiveSpacing(36, 40, 44), // Minimum 44px for iOS touch target
    height: getResponsiveSpacing(36, 40, 44),
    borderRadius: getResponsiveSpacing(8, 10, 12),
    backgroundColor: '#FEF2F2',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FEE2E2',
    minWidth: 44, // Ensure minimum touch target size
    minHeight: 44,
  },
  subServiceCardBody: {
    padding: getResponsiveSpacing(16, 18, 20),
    gap: getResponsiveSpacing(16, 20, 24),
  },
  subServiceInputGroup: {
    gap: getResponsiveSpacing(8, 10, 12),
  },
  subServiceInputLabel: {
    fontSize: getResponsiveSpacing(13, 14, 15),
    fontFamily: 'Inter-Medium',
    color: '#374151',
    ...Platform.select({
      ios: {
        letterSpacing: -0.2,
      },
      android: {
        letterSpacing: -0.1,
      },
    }),
  },
  subServiceSelector: {
    marginBottom: 0,
  },
  subServiceErrorText: {
    fontSize: getResponsiveSpacing(11, 12, 13),
    fontFamily: 'Inter-Regular',
    color: '#EF4444',
    marginTop: getResponsiveSpacing(4, 6, 8),
    marginLeft: getResponsiveSpacing(4, 6, 8),
  },
  priceInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    borderRadius: getResponsiveSpacing(12, 14, 16),
    overflow: 'hidden',
    minHeight: getResponsiveSpacing(52, 56, 60),
  },
  priceInputError: {
    borderColor: '#EF4444',
  },
  priceInputPrefix: {
    paddingHorizontal: getResponsiveSpacing(16, 18, 20),
    paddingVertical: getResponsiveSpacing(14, 16, 18),
    backgroundColor: '#F9FAFB',
    borderRightWidth: 1,
    borderRightColor: '#E5E7EB',
  },
  priceInputPrefixText: {
    fontSize: getResponsiveSpacing(16, 17, 18),
    fontFamily: 'Inter-SemiBold',
    color: '#374151',
  },
  priceInput: {
    flex: 1,
    fontSize: getResponsiveSpacing(15, 16, 17),
    fontFamily: 'Inter-Regular',
    color: '#111827',
    paddingHorizontal: getResponsiveSpacing(16, 18, 20),
    paddingVertical: getResponsiveSpacing(14, 16, 18),
    minHeight: getResponsiveSpacing(52, 56, 60),
    ...Platform.select({
      ios: {
        paddingVertical: getResponsiveSpacing(14, 16, 18),
      },
      android: {
        paddingVertical: getResponsiveSpacing(12, 14, 16),
        textAlignVertical: 'center',
      },
    }),
  },
  priceInputDisabled: {
    backgroundColor: '#F9FAFB',
    color: '#9CA3AF',
  },
  addAnotherButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F9FAFB',
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderStyle: 'dashed',
    borderRadius: getResponsiveSpacing(14, 16, 18),
    paddingVertical: getResponsiveSpacing(16, 18, 20),
    gap: getResponsiveSpacing(10, 12, 14),
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  addAnotherButtonIcon: {
    width: getResponsiveSpacing(32, 36, 40),
    height: getResponsiveSpacing(32, 36, 40),
    borderRadius: getResponsiveSpacing(8, 10, 12),
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addAnotherButtonText: {
    fontSize: getResponsiveSpacing(15, 16, 17),
    fontFamily: 'Inter-SemiBold',
    color: '#3B82F6',
  },
  emptyStateContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: getResponsiveSpacing(20, 22, 24),
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderStyle: 'dashed',
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  emptyStateContent: {
    padding: getResponsiveSpacing(40, 48, 56),
    alignItems: 'center',
  },
  emptyStateIconContainer: {
    marginBottom: getResponsiveSpacing(20, 24, 28),
  },
  emptyStateIconCircle: {
    width: getResponsiveSpacing(72, 80, 88),
    height: getResponsiveSpacing(72, 80, 88),
    borderRadius: getResponsiveSpacing(36, 40, 44),
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#DBEAFE',
  },
  emptyStateTitle: {
    fontSize: getResponsiveSpacing(18, 20, 22),
    fontFamily: 'Inter-SemiBold',
    color: '#111827',
    marginBottom: getResponsiveSpacing(10, 12, 14),
    textAlign: 'center',
    ...Platform.select({
      ios: {
        letterSpacing: -0.3,
      },
      android: {
        letterSpacing: -0.2,
      },
    }),
  },
  emptyStateDescription: {
    fontSize: getResponsiveSpacing(14, 15, 16),
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: getResponsiveSpacing(22, 24, 26),
    marginBottom: getResponsiveSpacing(24, 28, 32),
    paddingHorizontal: getResponsiveSpacing(8, 12, 16),
  },
  emptyStateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3B82F6',
    borderRadius: getResponsiveSpacing(12, 14, 16),
    paddingHorizontal: getResponsiveSpacing(24, 28, 32),
    paddingVertical: getResponsiveSpacing(14, 16, 18),
    gap: getResponsiveSpacing(8, 10, 12),
    ...Platform.select({
      ios: {
        shadowColor: '#3B82F6',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  emptyStateButtonText: {
    fontSize: getResponsiveSpacing(15, 16, 17),
    fontFamily: 'Inter-SemiBold',
    color: '#FFFFFF',
    ...Platform.select({
      ios: {
        letterSpacing: -0.2,
      },
      android: {
        letterSpacing: -0.1,
      },
    }),
  },
});