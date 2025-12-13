import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { SafeView } from '@/components/SafeView';
import { useLocalSearchParams, router } from 'expo-router';
import { 
  ArrowLeft, 
  Calendar, 
  Clock, 
  MapPin, 
  User,
  Phone,
  CreditCard,
  CheckCircle,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react-native';
import { Modal } from '@/components/common/Modal';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { useLabourAccess } from '@/context/LabourAccessContext';
import Toast from 'react-native-toast-message';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '@/constants/api';
import { SERVICE_CATEGORIES } from '@/constants/serviceCategories';

const TIME_SLOTS = [
  '09:00 AM', '10:00 AM', '11:00 AM', '12:00 PM',
  '01:00 PM', '02:00 PM', '03:00 PM', '04:00 PM',
  '05:00 PM', '06:00 PM', '07:00 PM', '08:00 PM'
];

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

// Generate next 7 days
const generateDates = (t: any) => {
  const dates = [];
  const today = new Date();
  
  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayName = dayNames[date.getDay()];
    const dayNumber = date.getDate();
    
    let dateLabel = '';
    if (i === 0) dateLabel = t('booking.today');
    else if (i === 1) dateLabel = t('booking.tomorrow');
    else dateLabel = t(`booking.dayNames.${dayName}`);
    
    dates.push({
      date: dateLabel,
      day: t(`booking.dayNames.${dayName}`),
      number: dayNumber.toString(),
      fullDate: date.toISOString().split('T')[0] // YYYY-MM-DD format
    });
  }
  
  return dates;
};

// Helper to check if a time slot is in the past for today
function isTimeSlotInPast(dateIndex: number, timeSlot: string) {
  if (dateIndex !== 0) return false; // Only check for today
  const today = new Date();
  // Parse the selected time slot into 24-hour format
  const [time, modifier] = timeSlot.split(' ');
  let [hours, minutes] = time.split(':').map(Number);
  if (modifier === 'PM' && hours !== 12) hours += 12;
  if (modifier === 'AM' && hours === 12) hours = 0;
  const slotDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), hours, minutes);
  return slotDate <= today;
}

interface SubService {
  id: string;
  serviceId: string;
  serviceName: string;
  price: number;
  createdAt: string;
  updatedAt: string;
}

interface Provider {
  user_id: string;
  full_name: string;
  phone: string;
  profile_pic_url?: string;
  years_of_experience: number;
  service_description: string;
  provider_service_id: string;
  working_proof_urls?: string[];
  payment_start_date: string;
  payment_end_date: string;
  averageRating?: number;
  totalReviews?: number;
  full_address?: string; // Added for location
  state?: string; // Added for state
  city?: string; // Added for city
  service_name?: string; // Service category name
  sub_services?: SubService[]; // Sub-services with pricing
  pricing?: {
    minPrice: number | null;
    maxPrice: number | null;
    priceRange: string | number | null;
    displayPrice: string;
    subServiceCount: number;
  };
}

export default function BookingScreen() {
  const { providerId } = useLocalSearchParams<{ providerId: string }>();
  const { user } = useAuth();
  const { t } = useLanguage();
  const { labourAccessStatus } = useLabourAccess();
  const [selectedDate, setSelectedDate] = useState(0);
  const [selectedTime, setSelectedTime] = useState('');
  const [selectedServices, setSelectedServices] = useState<Set<string>>(new Set()); // Multiple sub-service IDs
  const [selectedServicesData, setSelectedServicesData] = useState<Map<string, { name: string; price: number }>>(new Map()); // Store selected services data
  const [loading, setLoading] = useState(false);
  const [fetchingProvider, setFetchingProvider] = useState(true);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertConfig, setAlertConfig] = useState<{
    title: string;
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
    buttons?: { text: string; onPress: () => void; style?: 'primary' | 'secondary' | 'destructive' }[];
  }>({
    title: '',
    message: '',
    type: 'info'
  });
  const [provider, setProvider] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Generate dates with translations
  const DATES = generateDates(t);

  const showAlert = (title: string, message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info', buttons?: { text: string; onPress: () => void; style?: 'primary' | 'secondary' | 'destructive' }[]) => {
    setAlertConfig({ title, message, type, buttons });
    setShowAlertModal(true);
  };

  // Fetch provider details
  useEffect(() => {
    fetchProviderDetails();
  }, [providerId]);

  // Handle screen orientation changes
  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', () => {
      // Force re-render when screen dimensions change
      // This ensures responsive styles are updated
    });

    return () => subscription?.remove();
  }, []);

  const fetchProviderDetails = async () => {
    try {
      setFetchingProvider(true);
      setError(null);

      // Get provider details using provider_service_id
      const response = await fetch(`${API_BASE_URL}/api/public/provider-service/${providerId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch provider details');
      }

      const data = await response.json();
      if (data.status === 'success' && data.data.provider) {
        setProvider(data.data.provider);
      } else {
        throw new Error('Provider not found');
      }
    } catch (err) {
      console.error('Error fetching provider:', err);
      setError('Failed to load provider details');
    } finally {
      setFetchingProvider(false);
    }
  };

  const handleBooking = async () => {
    if (!selectedTime || selectedServices.size === 0 || !provider) {
      showAlert(t('booking.incompleteSelection'), t('booking.selectTimeAndService'), 'warning');
      return;
    }

    // Check labour access for labour services
    if (provider.service_name?.toLowerCase().includes('labors') || provider.service_name?.toLowerCase().includes('labour')) {
      if (!labourAccessStatus?.hasAccess) {
        showAlert(
          'Labour Service Access Required',
          'You need to pay ₹99 for 7-day access to book labour services. Would you like to proceed with payment?',
          'warning',
          [
            {
              text: 'Pay Now',
              onPress: () => {
                setShowAlertModal(false);
                router.push('/labour-payment' as any);
              },
              style: 'primary'
            },
            {
              text: 'Cancel',
              onPress: () => setShowAlertModal(false),
              style: 'secondary'
            }
          ]
        );
        return;
      }
    }

    setLoading(true);
    
    try {
      // For multiple services, send the first selected service ID (backend can be updated later to handle multiple)
      // Or send comma-separated service IDs
      const selectedServiceIds = Array.from(selectedServices);
      const bookingData = {
        providerServiceId: provider.provider_service_id,
        selectedService: selectedServiceIds.length === 1 ? selectedServiceIds[0] : selectedServiceIds.join(','), // Send first service or comma-separated list
        selectedServices: selectedServiceIds, // Send array for future support
        appointmentDate: DATES[selectedDate].fullDate,
        appointmentTime: selectedTime
      };

      // Use API client for better error handling and token management
      const { apiPost } = await import('@/utils/apiClient');
      const response = await apiPost('/api/bookings', bookingData);

      if (response.ok && response.data && response.data.status === 'success') {
        setShowConfirmation(true);
        Toast.show({
          type: 'success',
          text1: t('booking.bookingConfirmed'),
          text2: t('booking.bookingConfirmedMessage', { 
            providerName: provider.full_name, 
            date: DATES[selectedDate].date, 
            time: selectedTime
          })
        });
      } else {
        // Extract error message from response
        const errorMessage = response.data?.message || 
                            (response.data?.error?.message) ||
                            t('booking.failedToCreateBooking');
        showAlert(t('booking.bookingFailed'), errorMessage, 'error');
      }
    } catch (err: any) {
      // Check if it's a validation error (user-friendly message) or a system error
      const errorMessage = err?.message || err?.data?.message || t('booking.failedToCreateBooking');
      
      // Check if it's a validation error (like duplicate booking)
      // These are expected errors that should be shown to the user, not logged as errors
      const isValidationError = errorMessage.includes('already have a booking') ||
                                errorMessage.includes('duplicate') ||
                                errorMessage.includes('same date and time') ||
                                err?.status === 400 ||
                                err?.status === 422;
      
      if (!isValidationError) {
        // Only log non-validation errors (system errors, network errors, etc.)
        // Use console.warn instead of console.error to avoid triggering global error handler
        console.warn('Booking system error:', err);
      }
      
      // Show error to user (validation errors are user-friendly, system errors need translation)
      showAlert(t('booking.bookingFailed'), errorMessage, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleViewBookings = () => {
    setShowConfirmation(false);
    router.push('/(tabs)/bookings');
  };

  const handleGoHome = () => {
    setShowConfirmation(false);
    router.push('/(tabs)');
  };

  // PRODUCTION: Get only provider's sub-services (no fallback)
  const getServices = (): Array<{ id: string; name: string; price: number }> => {
    if (!provider || !provider.sub_services || provider.sub_services.length === 0) {
      return [];
    }
    
    // Map sub-services to display format
    return provider.sub_services.map(subService => {
      // Get display name from serviceCategories or use serviceName
      const serviceCategory = SERVICE_CATEGORIES.find(cat => cat.id === subService.serviceId);
      const displayName = serviceCategory?.name || subService.serviceName || subService.serviceId;
      
      return {
        id: subService.serviceId, // Use serviceId as unique identifier
        name: displayName,
        price: subService.price
      };
    });
  };

  // Calculate total cost from selected services
  const calculateTotalCost = (): number => {
    let total = 0;
    selectedServices.forEach(serviceId => {
      const serviceData = selectedServicesData.get(serviceId);
      if (serviceData) {
        total += serviceData.price;
      }
    });
    return total;
  };

  // Handle service selection/deselection
  const handleServiceToggle = (service: { id: string; name: string; price: number }) => {
    const newSelectedServices = new Set(selectedServices);
    const newSelectedServicesData = new Map(selectedServicesData);
    
    if (newSelectedServices.has(service.id)) {
      // Deselect
      newSelectedServices.delete(service.id);
      newSelectedServicesData.delete(service.id);
    } else {
      // Select
      newSelectedServices.add(service.id);
      newSelectedServicesData.set(service.id, {
        name: service.name,
        price: service.price
      });
    }
    
    setSelectedServices(newSelectedServices);
    setSelectedServicesData(newSelectedServicesData);
  };

  if (fetchingProvider) {
    return (
      <SafeView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <ArrowLeft size={24} color="#1E293B" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('booking.title')}</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>{t('booking.loadingProviderDetails')}</Text>
        </View>
      </SafeView>
    );
  }

  if (error || !provider) {
    return (
      <SafeView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <ArrowLeft size={24} color="#1E293B" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('booking.title')}</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.errorContainer}>
          <AlertTriangle size={48} color="#EF4444" />
          <Text style={styles.errorTitle}>{t('booking.errorLoadingProvider')}</Text>
          <Text style={styles.errorText}>{error || t('booking.providerNotFound')}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchProviderDetails}>
            <Text style={styles.retryButtonText}>{t('booking.tryAgain')}</Text>
          </TouchableOpacity>
        </View>
      </SafeView>
    );
  }

  return (
    <SafeView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <ArrowLeft size={24} color="#1E293B" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('booking.title')}</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Provider Info */}
        <View style={styles.providerCard}>
          <View style={styles.providerInfo}>
            <View style={styles.providerDetails}>
              <Text style={styles.providerName}>{provider.full_name}</Text>
              <Text style={styles.providerSpecialty}>
                {provider.service_name ? `${provider.service_name.charAt(0).toUpperCase() + provider.service_name.slice(1)}` : t('booking.serviceProvider')}
              </Text>
              {/* <Text style={styles.providerDescription}>{provider.service_description}</Text> */}
              <View style={styles.providerMeta}>
                <View style={styles.ratingContainer}>
                  <Text style={styles.rating}>⭐ {provider.averageRating?.toFixed(1) || 'N/A'}</Text>
                </View>
                <View style={styles.locationContainer}>
                  <MapPin size={getResponsiveSpacing(12, 14, 16)} color="#64748B" />
                  <Text 
                    style={styles.location}
                    numberOfLines={2}
                    ellipsizeMode="tail"
                  >
                    {provider.city && provider.state 
                      ? `${provider.city}, ${provider.state}` 
                      : provider.city || provider.state || 'Location not available'}
                  </Text>
                </View>
              </View>
            </View>
            <View style={styles.priceContainer}>
              {provider.pricing && provider.pricing.minPrice !== null && provider.pricing.maxPrice !== null ? (
                <View>
                  {provider.pricing.subServiceCount === 1 ? (
                    <Text style={styles.price}>
                      ₹{provider.pricing.minPrice.toLocaleString('en-IN')}
                    </Text>
                  ) : provider.pricing.minPrice === provider.pricing.maxPrice ? (
                    <Text style={styles.price}>
                      ₹{provider.pricing.minPrice.toLocaleString('en-IN')}
                    </Text>
                  ) : (
                    <>
                      <Text style={styles.price}>
                        ₹{provider.pricing.minPrice.toLocaleString('en-IN')} - ₹{provider.pricing.maxPrice.toLocaleString('en-IN')}
                      </Text>
                      {provider.pricing.subServiceCount > 1 && (
                        <Text style={styles.priceRangeText}>
                          {provider.pricing.subServiceCount} services
                        </Text>
                      )}
                    </>
                  )}
                </View>
              ) : (
                <Text style={styles.price}>Price on request</Text>
              )}
            </View>
          </View>
        </View>

        {/* Labour Access Status (for labour services) */}
        {(provider.service_name?.toLowerCase().includes('labors') || provider.service_name?.toLowerCase().includes('labour')) && (
          <View style={styles.labourAccessCard}>
            <View style={styles.labourAccessHeader}>
              <CreditCard size={20} color="#3B82F6" />
              <Text style={styles.labourAccessTitle}>Labour Service Access</Text>
            </View>
            <TouchableOpacity 
              style={styles.labourAccessButton}
              onPress={() => router.push('/labour-access' as any)}
            >
              <Text style={styles.labourAccessButtonText}>View Access Status & History</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Service Selection - Multiple Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {t('booking.selectService', { serviceName: provider.service_name ? `${provider.service_name.charAt(0).toUpperCase() + provider.service_name.slice(1)}` : t('booking.service') })}
          </Text>
          {selectedServices.size > 0 && (
            <Text style={styles.selectionHint}>
              {selectedServices.size} {selectedServices.size === 1 ? 'service' : 'services'} selected
            </Text>
          )}
          <View style={styles.servicesGrid}>
            {getServices().length > 0 ? (
              getServices().map((service, index) => {
                const isSelected = selectedServices.has(service.id);
                return (
                  <TouchableOpacity
                    key={service.id || index}
                    style={[
                      styles.serviceOption,
                      isSelected && styles.selectedServiceOption
                    ]}
                    onPress={() => handleServiceToggle(service)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.serviceOptionContent}>
                      <Text 
                        style={[
                          styles.serviceText,
                          isSelected && styles.selectedServiceText
                        ]}
                        numberOfLines={2}
                        ellipsizeMode="tail"
                      >
                        {service.name}
                      </Text>
                      <Text 
                        style={[
                          styles.servicePrice,
                          isSelected && styles.selectedServicePrice
                        ]}
                      >
                        ₹{service.price.toLocaleString('en-IN')}
                      </Text>
                    </View>
                    {isSelected && (
                      <CheckCircle size={getResponsiveSpacing(16, 18, 20)} color="#FFFFFF" />
                    )}
                  </TouchableOpacity>
                );
              })
            ) : (
              <View style={styles.noServicesContainer}>
                <Text style={styles.noServicesText}>
                  No sub-services available for this provider
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Date Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('booking.selectDate')}</Text>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.datesContainer}
          >
            {DATES.map((dateItem, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.dateOption,
                  selectedDate === index && styles.selectedDateOption
                ]}
                onPress={() => setSelectedDate(index)}
              >
                <Text style={[
                  styles.dateDay,
                  selectedDate === index && styles.selectedDateText
                ]}>
                  {dateItem.day}
                </Text>
                <Text style={[
                  styles.dateNumber,
                  selectedDate === index && styles.selectedDateText
                ]}>
                  {dateItem.number}
                </Text>
                <Text style={[
                  styles.dateLabel,
                  selectedDate === index && styles.selectedDateText
                ]}>
                  {dateItem.date}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Time Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('booking.selectTime')}</Text>
          <View style={styles.timeGrid}>
            {TIME_SLOTS.map((time, index) => {
              const disabled = isTimeSlotInPast(selectedDate, time);
              return (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.timeOption,
                    selectedTime === time && styles.selectedTimeOption,
                    disabled && { opacity: 0.4 }
                  ]}
                  onPress={() => !disabled && setSelectedTime(time)}
                  disabled={disabled}
                >
                  <Clock size={16} color={selectedTime === time ? '#FFFFFF' : '#64748B'} />
                  <Text 
                    style={[
                      styles.timeText,
                      selectedTime === time && styles.selectedTimeText
                    ]}
                  >
                    {time}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Booking Summary */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>{t('booking.bookingSummary')}</Text>
          
          <View style={styles.summaryRow}>
            <User size={16} color="#64748B" style={styles.summaryIcon} />
            <Text style={styles.summaryLabel}>{t('booking.provider')}:</Text>
            <View style={styles.summaryValueContainer}>
              <Text 
                style={styles.summaryValue}
                numberOfLines={2}
                ellipsizeMode="tail"
              >
                {provider.full_name}
              </Text>
            </View>
          </View>

          <View style={styles.summaryRow}>
            <Calendar size={16} color="#64748B" style={styles.summaryIcon} />
            <Text style={styles.summaryLabel}>{t('booking.date')}:</Text>
            <View style={styles.summaryValueContainer}>
              <Text style={styles.summaryValue}>
                {selectedDate !== null ? DATES[selectedDate].date : t('booking.notSelected')}
              </Text>
            </View>
          </View>

          <View style={styles.summaryRow}>
            <Clock size={16} color="#64748B" style={styles.summaryIcon} />
            <Text style={styles.summaryLabel}>{t('booking.time')}:</Text>
            <View style={styles.summaryValueContainer}>
              <Text style={styles.summaryValue}>
                {selectedTime || t('booking.notSelected')}
              </Text>
            </View>
          </View>

          <View style={styles.summaryRow}>
            <CreditCard size={16} color="#64748B" style={styles.summaryIcon} />
            <Text style={styles.summaryLabel}>{t('booking.service')}:</Text>
            <View style={styles.summaryValueContainer}>
              {selectedServices.size > 0 ? (
                <Text 
                  style={styles.summaryValue}
                  numberOfLines={3}
                  ellipsizeMode="tail"
                >
                  {Array.from(selectedServices)
                    .map((serviceId) => {
                      const serviceData = selectedServicesData.get(serviceId);
                      return serviceData?.name || serviceId;
                    })
                    .join(', ')}
                </Text>
              ) : (
                <Text style={styles.summaryValue}>{t('booking.notSelected')}</Text>
              )}
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>{t('booking.estimatedCost')}:</Text>
            <View style={styles.totalValueContainer}>
              {selectedServices.size > 0 ? (
                <>
                  <Text style={styles.totalValue}>
                    ₹{calculateTotalCost().toLocaleString('en-IN')}
                  </Text>
                  {selectedServices.size > 1 && (
                    <Text style={styles.totalBreakdown}>
                      ({selectedServices.size} services)
                    </Text>
                  )}
                </>
              ) : (
                <Text style={styles.totalValue}>
                  {provider.pricing && provider.pricing.minPrice !== null && provider.pricing.maxPrice !== null
                    ? provider.pricing.subServiceCount === 1
                      ? `₹${provider.pricing.minPrice.toLocaleString('en-IN')}`
                      : provider.pricing.minPrice === provider.pricing.maxPrice
                        ? `₹${provider.pricing.minPrice.toLocaleString('en-IN')}`
                        : `₹${provider.pricing.minPrice.toLocaleString('en-IN')} - ₹${provider.pricing.maxPrice.toLocaleString('en-IN')}`
                    : 'Select services'}
                </Text>
              )}
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Book Button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.bookButton,
            (!selectedTime || selectedServices.size === 0 || loading) && styles.bookButtonDisabled
          ]}
          onPress={handleBooking}
          disabled={!selectedTime || selectedServices.size === 0 || loading}
        >
          <Text style={styles.bookButtonText}>
            {loading ? t('booking.confirmingBooking') : t('booking.confirmBooking')}
          </Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={showConfirmation}
        onClose={() => setShowConfirmation(false)}
        title={t('booking.bookingConfirmed')}
        type="success"
        message={t('booking.bookingConfirmedMessage', { 
          providerName: provider.full_name, 
          date: DATES[selectedDate].date, 
          time: selectedTime
        })}
        buttons={[
          {
            text: t('booking.viewBookings'),
            onPress: handleViewBookings,
            style: 'primary'
          },
          {
            text: t('booking.goHome'),
            onPress: handleGoHome,
            style: 'secondary'
          }
        ]}
      />

      <Modal
        visible={showAlertModal}
        onClose={() => setShowAlertModal(false)}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
        buttons={alertConfig.buttons || [
          {
            text: 'OK',
            onPress: () => setShowAlertModal(false),
            style: 'primary'
          }
        ]}
      />
    </SafeView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: getResponsiveSpacing(20, 28, 32),
    paddingVertical: getResponsiveSpacing(16, 20, 24),
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: getResponsiveSpacing(16, 18, 20),
    fontWeight: '600',
    color: '#1E293B',
  },
  placeholder: {
    width: 32,
  },
  content: {
    flex: 1,
    paddingHorizontal: getResponsiveSpacing(16, 20, 24),
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: getResponsiveSpacing(12, 16, 20),
    fontSize: getResponsiveSpacing(14, 16, 18),
    color: '#64748B',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: getResponsiveSpacing(24, 40, 48),
  },
  errorTitle: {
    fontSize: getResponsiveSpacing(16, 18, 20),
    fontWeight: '600',
    color: '#1E293B',
    marginTop: getResponsiveSpacing(12, 16, 20),
    marginBottom: getResponsiveSpacing(6, 8, 10),
  },
  errorText: {
    fontSize: getResponsiveSpacing(12, 14, 16),
    color: '#64748B',
    textAlign: 'center',
    marginBottom: getResponsiveSpacing(16, 24, 32),
  },
  retryButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: getResponsiveSpacing(20, 24, 28),
    paddingVertical: getResponsiveSpacing(10, 12, 14),
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: getResponsiveSpacing(12, 14, 16),
    fontWeight: '600',
  },
  providerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: getResponsiveSpacing(12, 16, 20),
    marginVertical: getResponsiveSpacing(12, 16, 20),
    ...Platform.select({
      ios: {
        shadowColor: '#CBD5E1',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
      web: {
        boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.05)',
      },
    }),
  },
  providerInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  providerDetails: {
    flex: 1,
  },
  providerName: {
    fontSize: getResponsiveSpacing(16, 18, 20),
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: getResponsiveSpacing(3, 4, 5),
  },
  providerSpecialty: {
    fontSize: getResponsiveSpacing(12, 14, 16),
    color: '#64748B',
    marginBottom: getResponsiveSpacing(3, 4, 5),
    fontWeight: '500',
  },
  providerDescription: {
    fontSize: getResponsiveSpacing(10, 12, 14),
    color: '#94A3B8',
    marginBottom: getResponsiveSpacing(6, 8, 10),
  },
  providerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingContainer: {
    marginRight: getResponsiveSpacing(12, 16, 20),
  },
  rating: {
    fontSize: getResponsiveSpacing(12, 14, 16),
    color: '#1E293B',
    fontWeight: '500',
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0, // Allow text to shrink
  },
  location: {
    fontSize: getResponsiveSpacing(11, 12, 14),
    color: '#64748B',
    marginLeft: getResponsiveSpacing(4, 5, 6),
    flex: 1,
    flexWrap: 'wrap',
  },
  priceContainer: {
    alignItems: 'flex-end',
  },
  price: {
    fontSize: getResponsiveSpacing(14, 16, 18),
    fontWeight: '600',
    color: '#3B82F6',
    marginBottom: 2,
  },
  priceRangeText: {
    fontSize: getResponsiveSpacing(10, 11, 12),
    fontWeight: '400',
    color: '#64748B',
    marginTop: 2,
  },
  section: {
    marginBottom: getResponsiveSpacing(16, 24, 32),
  },
  sectionTitle: {
    fontSize: getResponsiveSpacing(16, 18, 20),
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: getResponsiveSpacing(8, 10, 12),
  },
  selectionHint: {
    fontSize: getResponsiveSpacing(12, 13, 14),
    fontWeight: '500',
    color: '#3B82F6',
    marginBottom: getResponsiveSpacing(10, 12, 14),
  },
  servicesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: getResponsiveSpacing(8, 12, 16),
  },
  serviceOptionContent: {
    flex: 1,
    alignItems: 'flex-start',
  },
  servicePrice: {
    fontSize: getResponsiveSpacing(12, 13, 14),
    fontWeight: '600',
    color: '#64748B',
    marginTop: getResponsiveSpacing(2, 3, 4),
  },
  selectedServicePrice: {
    color: '#FFFFFF',
  },
  serviceOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F1F5F9',
    paddingVertical: getResponsiveSpacing(12, 14, 16),
    paddingHorizontal: getResponsiveSpacing(12, 14, 16),
    borderRadius: getResponsiveSpacing(10, 12, 14),
    borderWidth: 2,
    borderColor: '#E2E8F0',
    marginBottom: getResponsiveSpacing(10, 12, 14),
    width: '48%',
    minHeight: getResponsiveSpacing(70, 80, 90),
  },
  selectedServiceOption: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
    ...Platform.select({
      ios: {
        shadowColor: '#3B82F6',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  serviceText: {
    fontSize: getResponsiveSpacing(13, 14, 15),
    fontWeight: '600',
    color: '#1E293B',
    flex: 1,
    marginBottom: getResponsiveSpacing(4, 5, 6),
    lineHeight: getResponsiveSpacing(18, 20, 22),
  },
  selectedServiceText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  noServicesContainer: {
    width: '100%',
    padding: 20,
    alignItems: 'center',
  },
  noServicesText: {
    fontSize: getResponsiveSpacing(12, 14, 16),
    color: '#94A3B8',
    textAlign: 'center',
  },
  datesContainer: {
    paddingHorizontal: 4,
  },
  dateOption: {
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingVertical: getResponsiveSpacing(10, 12, 14),
    paddingHorizontal: getResponsiveSpacing(12, 16, 18),
    borderRadius: 8,
    marginRight: getResponsiveSpacing(8, 12, 16),
    borderWidth: 1,
    borderColor: '#E2E8F0',
    minWidth: getResponsiveSpacing(50, 60, 70),
  },
  selectedDateOption: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  dateDay: {
    fontSize: getResponsiveSpacing(10, 12, 14),
    color: '#64748B',
    fontWeight: '500',
  },
  dateNumber: {
    fontSize: getResponsiveSpacing(16, 18, 20),
    fontWeight: '600',
    color: '#1E293B',
    marginVertical: getResponsiveSpacing(1, 2, 3),
  },
  dateLabel: {
    fontSize: getResponsiveSpacing(8, 10, 12),
    color: '#64748B',
  },
  selectedDateText: {
    color: '#FFFFFF',
  },
  timeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: getResponsiveSpacing(6, 8, 10),
    justifyContent: 'space-between',
  },
  timeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingVertical: getResponsiveSpacing(6, 8, 10),
    paddingHorizontal: getResponsiveSpacing(8, 12, 14),
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    width: `${(100 / 3) - 2}%`, // Exactly 3 items per row with gap consideration
    justifyContent: 'center',
  },
  selectedTimeOption: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  timeText: {
    fontSize: getResponsiveSpacing(12, 14, 16),
    color: '#64748B',
    marginLeft: getResponsiveSpacing(6, 8, 10),
  },
  selectedTimeText: {
    color: '#FFFFFF',
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: getResponsiveSpacing(12, 16, 20),
    marginBottom: getResponsiveSpacing(16, 24, 32),
    ...Platform.select({
      ios: {
        shadowColor: '#CBD5E1',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
      web: {
        boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.05)',
      },
    }),
  },
  summaryTitle: {
    fontSize: getResponsiveSpacing(16, 18, 20),
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: getResponsiveSpacing(12, 16, 20),
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: getResponsiveSpacing(8, 12, 16),
    minHeight: getResponsiveSpacing(20, 24, 28), // Ensure consistent row height
  },
  summaryIcon: {
    marginTop: getResponsiveSpacing(2, 3, 4), // Align icon with text baseline
    flexShrink: 0, // Prevent icon from shrinking
  },
  summaryLabel: {
    fontSize: getResponsiveSpacing(12, 14, 16),
    color: '#64748B',
    marginLeft: getResponsiveSpacing(6, 8, 10),
    marginRight: getResponsiveSpacing(6, 8, 10),
    minWidth: getResponsiveSpacing(60, 70, 80), // Fixed width for consistent alignment
    flexShrink: 0, // Prevent label from shrinking
  },
  summaryValueContainer: {
    flex: 1,
    minWidth: 0, // Allow flex to shrink below content size
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
  },
  summaryValue: {
    fontSize: getResponsiveSpacing(12, 14, 16),
    color: '#1E293B',
    fontWeight: '500',
    textAlign: 'right',
    flexShrink: 1, // Allow text to shrink
    maxWidth: '100%', // Prevent overflow
  },
  divider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: getResponsiveSpacing(12, 16, 20),
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: getResponsiveSpacing(24, 28, 32), // Ensure consistent height
  },
  totalLabel: {
    fontSize: getResponsiveSpacing(14, 16, 18),
    fontWeight: '600',
    color: '#1E293B',
    flexShrink: 0, // Prevent label from shrinking
  },
  totalValueContainer: {
    alignItems: 'flex-end',
    flex: 1,
    minWidth: 0, // Allow flex to shrink
    marginLeft: getResponsiveSpacing(8, 12, 16), // Add margin for spacing
  },
  totalValue: {
    fontSize: getResponsiveSpacing(16, 18, 20),
    fontWeight: '700',
    color: '#3B82F6',
    textAlign: 'right',
    flexShrink: 1, // Allow text to shrink if needed
  },
  totalBreakdown: {
    fontSize: getResponsiveSpacing(10, 12, 14),
    fontWeight: '400',
    color: '#64748B',
    textAlign: 'right',
    marginTop: 2,
  },
  footer: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingHorizontal: getResponsiveSpacing(16, 20, 24),
    paddingVertical: getResponsiveSpacing(12, 16, 20),
  },
  bookButton: {
    backgroundColor: '#3B82F6',
    paddingVertical: getResponsiveSpacing(12, 16, 20),
    borderRadius: 12,
    alignItems: 'center',
  },
  bookButtonDisabled: {
    backgroundColor: '#CBD5E1',
  },
  bookButtonText: {
    color: '#FFFFFF',
    fontSize: getResponsiveSpacing(14, 16, 18),
    fontWeight: '600',
  },
  labourAccessCard: {
    backgroundColor: '#F0F9FF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  labourAccessHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  labourAccessTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E40AF',
    marginLeft: 8,
  },
  labourAccessButton: {
    backgroundColor: '#3B82F6',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  labourAccessButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});