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
      let token = user?.token;
      if (!token) {
        const storedToken = await AsyncStorage.getItem('token');
        token = storedToken || undefined;
      }

      if (!token) {
        showAlert(t('alerts.error'), t('alerts.noAuthTokenAvailable'), 'error');
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
          // Ensure working_proof_urls is always an array
          const workingProofUrls = Array.isArray(serviceData.working_proof_urls) 
            ? serviceData.working_proof_urls 
            : [];
          
          
          // Map backend data to form data
          setFormData({
            fullName: user?.fullName || '',
            phone: user?.phone || '',
            state: serviceData.state || '',
            address: serviceData.full_address || '',
            experience: serviceData.years_of_experience?.toString() || '',
            charges: serviceData.service_charge_value?.toString() || '',
            description: serviceData.service_description || '',
            photos: workingProofUrls,
            engineeringCertificate: serviceData.engineering_certificate_url || undefined,
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
    setFormData((prev) => ({ ...prev, [field]: value }));
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
      
      // If it's already a base64 URL, return as is
      if (uri.startsWith('data:image/')) {
        return uri;
      }
      
      // If it's a file URI, convert to base64
      if (uri.startsWith('file://')) {
        
        try {
          const base64 = await FileSystem.readAsStringAsync(uri, {
            encoding: 'base64' as any,
          });
          
          
          // Determine the file extension from the URI
          const extension = uri.split('.').pop()?.toLowerCase() || 'jpg';
          const mimeType = extension === 'png' ? 'image/png' : 'image/jpeg';
          
          return `data:${mimeType};base64,${base64}`;
        } catch (fileError) {
          return '';
        }
      }
      
      // If it's already a remote URL, return as is
      return uri;
    } catch (error) {
      console.error('Error converting to base64:', error);
      return ''; // Return empty string if conversion fails
    }
  };

  // Convert multiple URIs to base64
  const convertMultipleToBase64 = async (uris: string[]): Promise<string[]> => {
    try {
      const base64Promises = uris.map(uri => convertToBase64(uri));
      const results = await Promise.all(base64Promises);
      // Filter out empty strings (failed conversions)
      return results.filter(result => result.length > 0);
    } catch (error) {
      console.error('Error converting multiple images to base64:', error);
      return [];
    }
  };

  const handleSubmit = async () => {
    const newErrors: Partial<Record<keyof FormData, string>> = {};
    if (!formData.state.trim()) newErrors.state = 'State is required.';
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
      // Get token from user or AsyncStorage
      let token = user?.token;
      if (!token) {
        const storedToken = await AsyncStorage.getItem('token');
        token = storedToken || undefined;
      }
      
      // Convert working proof images to base64
      let workingProofUrls: string[] = [];
      if (formData.photos.length > 0) {
        workingProofUrls = await convertMultipleToBase64(formData.photos);
      }
      
      // Convert engineering certificate to base64 if it's a file URI
      let engineeringCertificateUrl = formData.engineeringCertificate;
      if (engineeringCertificateUrl && engineeringCertificateUrl.startsWith('file://')) {
        engineeringCertificateUrl = await convertToBase64(engineeringCertificateUrl);
      }
      
      // Prepare payload for backend
      const payload: any = {
        yearsOfExperience: parseInt(formData.experience, 10),
        serviceDescription: formData.description,
        serviceChargeValue: parseFloat(formData.charges),
        serviceChargeUnit: 'INR',
        state: formData.state,
        fullAddress: formData.address,
        workingProofUrls: workingProofUrls,
        isEngineeringProvider: isEngineerOrInterior,
        engineeringCertificateUrl: engineeringCertificateUrl || undefined
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
      const data = await response.json();
      setIsLoading(false);
      if (!response.ok) {
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
        } else {
          showAlert(t('alerts.registrationError'), data.message || t('alerts.failedToRegisterService'), 'error', [
            { text: 'OK', onPress: () => {
              setShowAlertModal(false);
            }, style: 'primary' }
          ]);
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
    } catch (error) {
      setIsLoading(false);
      console.error('Submit error:', error);
      showAlert(t('alerts.error'), t('alerts.failedToSubmitRegistration'), 'error', [
        { text: 'OK', onPress: () => {
          setShowAlertModal(false);
        }, style: 'primary' }
      ]);
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

                {formData.engineeringCertificate ? (
                  <View style={styles.certificateContainer}>
                    <Image
                      source={{ uri: formData.engineeringCertificate }}
                      style={styles.certificateImage}
                      resizeMode="cover"
                      onError={(error) => console.error('Error loading engineering certificate:', error)}
                      onLoad={() => console.log('Successfully loaded engineering certificate:', formData.engineeringCertificate)}
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
                  {formData.photos.map((photo, index) => {
                    return (
                      <View key={index} style={styles.photoWrapper}>
                        <Image 
                          source={{ uri: photo }} 
                          style={styles.photo} 
                          resizeMode="cover"
                          onError={(error) => console.error(`Error loading image ${index}:`, error)}
                          onLoad={() => console.log(`Successfully loaded image ${index}:`, photo)}
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
                  })}

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
  },
  photo: {
    width: '100%',
    height: '100%',
    borderRadius: getResponsiveSpacing(8, 10, 12), // Match wrapper border radius
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