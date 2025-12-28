import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Dimensions, StatusBar } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { SERVICE_CATEGORIES } from '@/constants/serviceCategories';
import { SafeView } from '@/components/SafeView';
import { Modal } from '@/components/common/Modal';
import { Edit, Eye, Clock, CheckCircle, XCircle, Trash2, AlertTriangle } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '@/constants/api';
import { tokenManager } from '../../utils/tokenManager';

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

interface SubService {
  id: string;
  serviceId: string;
  serviceName: string;
  price: number;
  createdAt: string;
  updatedAt: string;
}

interface PricingSummary {
  minPrice: number | null;
  maxPrice: number | null;
  priceRange: string | number | null;
  subServiceCount: number;
}

interface RegisteredService {
  provider_service_id: string;
  service_id: string;
  service_name: string;
  payment_status: string;
  payment_start_date?: string;
  payment_end_date?: string;
  days_until_expiry?: number;
  created_at: string;
  sub_services?: SubService[];
  pricing?: PricingSummary;
}

interface ServiceStatus {
  id: string;
  status: 'pending' | 'verified' | 'rejected';
  submittedAt: string;
}

export default function ServicesScreen() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { t } = useLanguage();
  const [registeredServices, setRegisteredServices] = useState<RegisteredService[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    // Wait for auth to finish loading before fetching data
    if (!authLoading && user?.id) {
      fetchRegisteredServices();
    } else if (!authLoading && !user?.id) {
      // Auth finished loading but no user, set loading to false
      setIsLoading(false);
    }
  }, [user, authLoading]);

  useFocusEffect(
    React.useCallback(() => {
      // Wait for auth to finish loading before fetching data
      if (!authLoading && user?.id) {
        fetchRegisteredServices();
      }
    }, [user, authLoading])
  );

  // Handle orientation changes for responsive design
  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      // Update responsive constants when orientation changes
      const newWidth = window.width;
      const newIsSmallScreen = newWidth < 375;
      const newIsMediumScreen = newWidth >= 375 && newWidth < 414;
      const newIsLargeScreen = newWidth >= 414;
      
      // Force re-render when orientation changes by updating state
      setIsLoading(prev => prev); // Trigger re-render
    });

    return () => subscription?.remove();
  }, []);

  const fetchRegisteredServices = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Use API client instead of direct fetch - it handles token refresh automatically
      const { apiGet } = await import('@/utils/apiClient');
      
      try {
        const response = await apiGet<{ status: string; data: { registeredServices: RegisteredService[] } }>('/api/services/my-registrations');
        
        if (response.data.status === 'success' && response.data.data.registeredServices) {
          setRegisteredServices(response.data.data.registeredServices);
        } else {
          setError('Invalid response format from server');
        }
      } catch (apiError: any) {
        // Handle API errors
        if (apiError.status === 403) {
          setError('Access denied. Only providers can view registered services.');
        } else if (apiError.status === 401) {
          // Token refresh failed - user needs to login again
          setError('Session expired. Please log in again.');
        } else {
          setError(apiError.message || 'Failed to fetch registered services. Please try again.');
        }
      }
    } catch (error: any) {
      console.error('Error fetching registered services:', error);
      setError(error.message || 'Network error. Please check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchRegisteredServices();
    setRefreshing(false);
  };

  const getStatusInfo = (paymentStatus: string) => {
    switch (paymentStatus) {
      case 'active':
        return { icon: CheckCircle, color: '#10B981', text: t('services.active') };
      case 'pending':
        return { icon: Clock, color: '#F59E0B', text: t('services.pending') };
      case 'expired':
        return { icon: XCircle, color: '#EF4444', text: t('services.expired') };
      default:
        return { icon: Clock, color: '#6B7280', text: 'Unknown' };
    }
  };

  const formatExpiryDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const getExpiryWarning = (daysUntilExpiry: number | undefined) => {
    if (!daysUntilExpiry) return null;
    if (daysUntilExpiry <= 2) {
      return { color: '#EF4444', text: `Expires in ${Math.max(0, Math.floor(daysUntilExpiry))} days!`, urgent: true };
    }
    if (daysUntilExpiry <= 7) {
      return { color: '#F59E0B', text: `Expires in ${Math.floor(daysUntilExpiry)} days`, urgent: false };
    }
    return { color: '#10B981', text: `${Math.floor(daysUntilExpiry)} days remaining`, urgent: false };
  };

  // Removed getTranslatedChargeUnit - no longer needed with sub-services pricing model

  const getServiceCategoryInfo = (serviceName: string) => {
    // Map backend service names to frontend category info
    const serviceNameToCategoryMap: { [key: string]: any } = {
      'labors': { id: 'labor', name: 'Labor', description: 'Skilled and unskilled labor services', icon: '👷' },
      'plumber': { id: 'plumber', name: 'Plumber', description: 'Plumbing and water system services', icon: '🔧' },
      'mason-mastri': { id: 'mason-mastri', name: 'Mason/Mastri', description: 'Masonry and construction work', icon: '🧱' },
      'painting-cleaning': { id: 'painting', name: 'Painting', description: 'Interior and exterior painting services', icon: '🎨' },
      'painting': { id: 'painting', name: 'Painting', description: 'Interior and exterior painting services', icon: '🎨' },
      'granite-tiles': { id: 'granite-tiles', name: 'Granite & Tiles', description: 'Granite and tile installation services', icon: '🏗️' },
      'engineer-interior': { id: 'engineer-interior', name: 'Engineer & Interior', description: 'Engineering and interior design services', icon: '🏛️' },
      'electrician': { id: 'electrician', name: 'Electrician', description: 'Electrical installation and repair services', icon: '⚡' },
      'carpenter': { id: 'carpenter', name: 'Carpenter', description: 'Woodwork and carpentry services', icon: '🔨' },
      'painter': { id: 'painting', name: 'Painter', description: 'Professional painting services', icon: '🎨' },
      'interiors-building': { id: 'interiors-building', name: 'Interiors & Building', description: 'Interior design and building services', icon: '🏠' },
      'stainless-steel': { id: 'stainless-steel', name: 'Stainless Steel', description: 'Stainless steel fabrication services', icon: '🔩' },
      'contact-building': { id: 'contact-building', name: 'Contact Building', description: 'General building and construction services', icon: '🏗️' },
      'cleaning': { id: 'cleaning', name: 'Cleaning', description: 'Professional cleaning services', icon: '🧹' },
      'borewell': { id: 'borewell', name: 'Borewell', description: 'Borewell drilling and maintenance services', icon: '💧' }
    };

    return serviceNameToCategoryMap[serviceName] || { 
      id: serviceName, 
      name: serviceName, 
      description: 'Service description not available', 
      icon: '🔧' 
    };
  };

  const handleCancelService = async (serviceId: string, serviceName: string) => {
    showAlert(
      'Cancel Service Registration',
      `Are you sure you want to cancel your ${serviceName} service registration?`,
      'warning',
      [
        { 
          text: 'Cancel', 
          onPress: () => {
            setShowAlertModal(false);
          }, 
          style: 'secondary' 
        },
        { 
          text: 'Yes, Cancel', 
          onPress: async () => {
            try {
              setShowAlertModal(false);
              const token = await tokenManager.getValidToken();

              if (!token) {
                showAlert(t('alerts.error'), t('alerts.noAuthTokenAvailable'), 'error', [
                  { 
                    text: 'OK', 
                    onPress: () => {
                      setShowAlertModal(false);
                    }, 
                    style: 'primary' 
                  }
                ]);
                return;
              }

              const response = await fetch(`${API_BASE_URL}/api/services/my-registrations/${serviceId}`, {
                method: 'DELETE',
                headers: {
                  'Authorization': `Bearer ${token}`
                }
              });

              if (response.ok) {
                showAlert(t('alerts.success'), t('alerts.serviceRegistrationCancelled'), 'success', [
                  { 
                    text: 'OK', 
                    onPress: () => {
                      setShowAlertModal(false);
                      fetchRegisteredServices();
                    },
                    style: 'primary'
                  }
                ]);
              } else {
                const errorData = await response.json();
                showAlert(t('alerts.error'), errorData.message || t('alerts.failedToCancelService'), 'error', [
                  { 
                    text: 'OK', 
                    onPress: () => {
                      setShowAlertModal(false);
                    }, 
                    style: 'primary' 
                  }
                ]);
              }
            } catch (error) {
              console.error('Error cancelling service:', error);
              showAlert(t('alerts.error'), t('alerts.networkError'), 'error', [
                { 
                  text: 'OK', 
                  onPress: () => {
                    setShowAlertModal(false);
                  }, 
                  style: 'primary' 
                }
              ]);
            }
          }, 
          style: 'destructive' 
        }
      ]
    );
  };

  if (isLoading) {
    return (
      <SafeView backgroundColor="#FFFFFF">
        <View style={styles.header}>
          <Text style={styles.title}>My Services</Text>
          <Text style={styles.subtitle}>Manage your registered services</Text>
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>{t('services.loading')}</Text>
        </View>
      </SafeView>
    );
  }

  if (error) {
    return (
      <SafeView backgroundColor="#FFFFFF">
        <View style={styles.header}>
          <Text style={styles.title}>{t('services.title')}</Text>
          <Text style={styles.subtitle}>{t('services.subtitle')}</Text>
        </View>
        <View style={styles.errorContainer}>
          <AlertTriangle size={48} color="#EF4444" />
          <Text style={styles.errorTitle}>{t('services.errorTitle')}</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchRegisteredServices}>
            <Text style={styles.retryButtonText}>{t('services.retry')}</Text>
          </TouchableOpacity>
        </View>
      </SafeView>
    );
  }

  if (registeredServices.length === 0) {
    return (
      <SafeView backgroundColor="#FFFFFF">
        <View style={styles.header}>
          <Text style={styles.title}>{t('services.title')}</Text>
          <Text style={styles.subtitle}>{t('services.subtitle')}</Text>
        </View>
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>{t('services.emptyTitle')}</Text>
          <Text style={styles.emptySubtitle}>
            {t('services.emptySubtitle')}
          </Text>
          <TouchableOpacity 
            style={styles.primaryButton}
            onPress={() => router.push('/(tabs)')}
          >
            <Text style={styles.primaryButtonText}>{t('services.browseServices')}</Text>
          </TouchableOpacity>
        </View>
      </SafeView>
    );
  }

  return (
    <SafeView backgroundColor="#FFFFFF">
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={styles.header}>
        <Text style={styles.title}>{t('services.title')}</Text>
        <Text style={styles.subtitle}>{t('services.subtitle')}</Text>
      </View>

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.servicesList}>
          {registeredServices.map((service) => {
            const categoryInfo = getServiceCategoryInfo(service.service_name);
            const statusInfo = getStatusInfo(service.payment_status);
            const StatusIcon = statusInfo.icon;

            return (
              <View key={service.provider_service_id} style={styles.serviceCard}>
                {/* Header with icon, service info, and status */}
                <View style={styles.serviceHeader}>
                  <View style={styles.serviceMainInfo}>
                    <View style={styles.serviceIconContainer}>
                      <Text style={styles.serviceIcon}>{categoryInfo.icon}</Text>
                    </View>
                    <View style={styles.serviceDetails}>
                      <Text style={styles.serviceName} numberOfLines={1} ellipsizeMode="tail">
                        {t(`serviceCategories.${categoryInfo.id}`) || categoryInfo.name}
                      </Text>
                      <Text style={styles.serviceDescription} numberOfLines={2} ellipsizeMode="tail">
                        {categoryInfo.description}
                      </Text>
                    </View>
                  </View>
                  
                  <View style={[styles.statusBadge, { backgroundColor: statusInfo.color + '15' }]}>
                    <View style={[styles.statusDot, { backgroundColor: statusInfo.color }]} />
                    <Text style={[styles.statusText, { color: statusInfo.color }]}>
                      {statusInfo.text}
                    </Text>
                  </View>
                </View>

                {/* Price section */}
                <View style={styles.priceSection}>
                  <Text style={styles.priceLabel}>Service Pricing</Text>
                  {service.pricing && service.pricing.minPrice !== null ? (
                    <>
                      {service.pricing.subServiceCount === 1 ? (
                        <Text style={styles.priceValue}>
                          ₹{service.pricing.minPrice}
                        </Text>
                      ) : service.pricing.minPrice === service.pricing.maxPrice ? (
                        <Text style={styles.priceValue}>
                          ₹{service.pricing.minPrice}
                        </Text>
                      ) : (
                        <>
                          <Text style={styles.priceValue}>
                            Starting from ₹{service.pricing.minPrice}
                          </Text>
                          <Text style={styles.priceRange}>
                            Range: ₹{service.pricing.priceRange}
                          </Text>
                        </>
                      )}
                      <Text style={styles.subServiceCount}>
                        {service.pricing.subServiceCount} {service.pricing.subServiceCount === 1 ? 'service' : 'services'} available
                      </Text>
                    </>
                  ) : (
                    <Text style={styles.priceValue}>
                      Pricing not set
                    </Text>
                  )}
                </View>

                {/* Expiry Information */}
                {service.payment_status === 'active' && service.payment_end_date && (
                  <View style={styles.expirySection}>
                    <View style={styles.expiryInfo}>
                      <Text style={styles.expiryLabel}>Valid Until:</Text>
                      <Text style={styles.expiryDate}>{formatExpiryDate(service.payment_end_date)}</Text>
                    </View>
                    {(() => {
                      const warning = getExpiryWarning(service.days_until_expiry);
                      return warning && (
                        <View style={[styles.expiryWarning, { backgroundColor: warning.color + '15' }]}>
                          <Text style={[styles.expiryWarningText, { color: warning.color }]}>
                            {warning.text}
                          </Text>
                        </View>
                      );
                    })()}
                  </View>
                )}

                {service.payment_status === 'pending' && (
                  <View style={styles.pendingPaymentSection}>
                    <Text style={styles.pendingText}>⚠️ Payment pending - Complete payment to activate</Text>
                    <TouchableOpacity 
                      style={styles.payNowButton}
                      onPress={() => router.push({
                        pathname: '/payment',
                        params: {
                          providerServiceId: service.provider_service_id,
                          serviceId: service.service_id,
                          serviceName: categoryInfo.name,
                          amount: 99, // Standard service registration fee
                          category: categoryInfo.id
                        }
                      })}
                    >
                      <Text style={styles.payNowText}>Pay Now</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {service.payment_status === 'expired' && (
                  <View style={styles.expiredSection}>
                    <Text style={styles.expiredText}>❌ Service expired - Renew to receive bookings</Text>
                    <TouchableOpacity 
                      style={styles.renewButton}
                      onPress={() => router.push({
                        pathname: '/payment',
                        params: {
                          providerServiceId: service.provider_service_id,
                          serviceId: service.service_id,
                          serviceName: categoryInfo.name,
                          amount: 99, // Standard service registration fee
                          category: categoryInfo.id
                        }
                      })}
                    >
                      <Text style={styles.renewText}>Renew Now</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Action buttons */}
                <View style={styles.serviceActions}>
                  <TouchableOpacity 
                    style={[styles.actionButton, styles.viewButton]}
                    onPress={() => router.push(`/service-registration/${categoryInfo.id}?mode=view&serviceId=${service.provider_service_id}`)}
                  >
                    <Eye size={14} color="#6366F1" />
                    <Text style={[styles.actionButtonText, styles.viewButtonText]}>{t('services.view')}</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    style={[styles.actionButton, styles.editButton]}
                    onPress={() => router.push(`/service-registration/${categoryInfo.id}?mode=edit&serviceId=${service.provider_service_id}`)}
                  >
                    <Edit size={14} color="#3B82F6" />
                    <Text style={[styles.actionButtonText, styles.editButtonText]}>{t('services.edit')}</Text>
                  </TouchableOpacity>
                  
                  {service.service_name === 'labors' && (
                    <TouchableOpacity
                      style={[styles.actionButton, styles.cancelButton]}
                      onPress={() => handleCancelService(service.provider_service_id, categoryInfo.name)}
                    >
                      <Trash2 size={14} color="#EF4444" />
                      <Text style={[styles.actionButtonText, styles.cancelButtonText]}>{t('services.cancel')}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
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
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    padding: getResponsiveSpacing(16, 20, 24),
    paddingBottom: getResponsiveSpacing(12, 14, 16),
  },
  title: {
    fontSize: getResponsiveSpacing(22, 24, 28),
    fontFamily: 'Inter-Bold',
    color: '#1F2937',
    marginBottom: getResponsiveSpacing(6, 8, 10),
    flexShrink: 1,
  },
  subtitle: {
    fontSize: getResponsiveSpacing(14, 15, 16),
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
    flexShrink: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: getResponsiveSpacing(20, 24, 28), // Add padding at bottom to prevent blank space and account for tab bar
  },
  servicesList: {
    paddingHorizontal: getResponsiveSpacing(16, 20, 24),
  },
  serviceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: getResponsiveSpacing(14, 16, 18),
    padding: getResponsiveSpacing(16, 20, 24),
    marginBottom: getResponsiveSpacing(12, 16, 20),
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: getResponsiveSpacing(2, 4, 6) },
    shadowOpacity: 0.08,
    shadowRadius: getResponsiveSpacing(8, 12, 16),
    elevation: getResponsiveSpacing(2, 4, 6),
  },
  serviceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: getResponsiveSpacing(12, 16, 20),
  },
  serviceMainInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
    marginRight: getResponsiveSpacing(8, 12, 16),
  },
  serviceIconContainer: {
    width: getResponsiveSpacing(40, 48, 56),
    height: getResponsiveSpacing(40, 48, 56),
    borderRadius: getResponsiveSpacing(20, 24, 28),
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: getResponsiveSpacing(8, 12, 16),
  },
  serviceIcon: {
    fontSize: getResponsiveSpacing(20, 24, 28),
  },
  serviceDetails: {
    flex: 1,
  },
  serviceName: {
    fontSize: getResponsiveFontSize(16, 18, 20),
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: getResponsiveSpacing(3, 4, 5),
    lineHeight: getResponsiveFontSize(20, 22, 24),
  },
  serviceDescription: {
    fontSize: getResponsiveFontSize(13, 14, 15),
    color: '#64748B',
    lineHeight: getResponsiveFontSize(18, 20, 22),
  },
  priceSection: {
    backgroundColor: '#F8FAFC',
    borderRadius: getResponsiveSpacing(10, 12, 14),
    padding: getResponsiveSpacing(12, 16, 20),
    marginBottom: getResponsiveSpacing(12, 16, 20),
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  priceLabel: {
    fontSize: getResponsiveFontSize(10, 12, 14),
    fontWeight: '500',
    color: '#64748B',
    marginBottom: getResponsiveSpacing(2, 4, 6),
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  priceValue: {
    fontSize: getResponsiveFontSize(18, 20, 22),
    fontWeight: '700',
    color: '#059669',
    lineHeight: getResponsiveFontSize(22, 24, 26),
    marginBottom: getResponsiveSpacing(2, 4, 6),
  },
  priceRange: {
    fontSize: getResponsiveFontSize(12, 13, 14),
    fontWeight: '500',
    color: '#64748B',
    marginTop: getResponsiveSpacing(2, 4, 6),
  },
  subServiceCount: {
    fontSize: getResponsiveFontSize(11, 12, 13),
    fontWeight: '400',
    color: '#94A3B8',
    marginTop: getResponsiveSpacing(4, 6, 8),
    fontStyle: 'italic',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: getResponsiveSpacing(8, 12, 16),
    paddingVertical: getResponsiveSpacing(4, 6, 8),
    borderRadius: getResponsiveSpacing(16, 20, 24),
    alignSelf: 'flex-start',
  },
  statusDot: {
    width: getResponsiveSpacing(6, 8, 10),
    height: getResponsiveSpacing(6, 8, 10),
    borderRadius: getResponsiveSpacing(3, 4, 5),
    marginRight: getResponsiveSpacing(4, 6, 8),
  },
  statusText: {
    fontSize: getResponsiveFontSize(10, 12, 14),
    fontWeight: '600',
    lineHeight: getResponsiveFontSize(14, 16, 18),
  },
  serviceActions: {
    flexDirection: 'row',
    gap: getResponsiveSpacing(6, 8, 10),
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: getResponsiveSpacing(10, 12, 14),
    paddingHorizontal: getResponsiveSpacing(12, 16, 20),
    borderRadius: getResponsiveSpacing(10, 12, 14),
    minHeight: getResponsiveSpacing(40, 44, 48),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: getResponsiveSpacing(1, 2, 3) },
    shadowOpacity: 0.1,
    shadowRadius: getResponsiveSpacing(2, 4, 6),
    elevation: getResponsiveSpacing(1, 2, 3),
  },
  cancelButton: {
    borderColor: '#FECACA',
    backgroundColor: '#FFF0F0',
    marginLeft: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    minWidth: 0,
    height: undefined,
  },
  actionButtonText: {
    fontSize: getResponsiveFontSize(12, 14, 16),
    fontWeight: '600',
    marginLeft: getResponsiveSpacing(4, 6, 8),
    lineHeight: getResponsiveFontSize(14, 16, 18),
    textAlign: 'center',
  },
  viewButton: {
    backgroundColor: '#EEF2FF',
  },
  viewButtonText: {
    color: '#6366F1',
  },
  editButton: {
    backgroundColor: '#DBEAFE',
  },
  editButtonText: {
    color: '#3B82F6',
  },
  cancelButtonText: {
    color: '#EF4444',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 24,
    fontFamily: 'Inter-Bold',
    color: '#1F2937',
    marginBottom: 12,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  primaryButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: getResponsiveSpacing(20, 24, 28),
    paddingVertical: getResponsiveSpacing(10, 12, 14),
    borderRadius: getResponsiveSpacing(10, 12, 14),
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: getResponsiveSpacing(120, 140, 160),
    minHeight: getResponsiveSpacing(40, 44, 48),
  },
  primaryButtonText: {
    fontSize: getResponsiveSpacing(14, 16, 18),
    fontFamily: 'Inter-SemiBold',
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: getResponsiveSpacing(18, 20, 22),
    flexShrink: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  loadingText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: '#6B7280',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  errorTitle: {
    fontSize: 20,
    fontFamily: 'Inter-Bold',
    color: '#1F2937',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
    marginBottom: 24,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: getResponsiveSpacing(20, 24, 28),
    paddingVertical: getResponsiveSpacing(10, 12, 14),
    borderRadius: getResponsiveSpacing(10, 12, 14),
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: getResponsiveSpacing(100, 120, 140),
    minHeight: getResponsiveSpacing(40, 44, 48),
  },
  retryButtonText: {
    fontSize: getResponsiveSpacing(14, 16, 18),
    fontFamily: 'Inter-SemiBold',
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: getResponsiveSpacing(18, 20, 22),
    flexShrink: 1,
  },
  expirySection: {
    backgroundColor: '#F0F9FF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  expiryInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  expiryLabel: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    color: '#64748B',
  },
  expiryDate: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: '#1E293B',
  },
  expiryWarning: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  expiryWarningText: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
    textAlign: 'center',
  },
  pendingPaymentSection: {
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  pendingText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    color: '#92400E',
    marginBottom: 10,
  },
  payNowButton: {
    backgroundColor: '#F59E0B',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  payNowText: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: '#FFFFFF',
  },
  expiredSection: {
    backgroundColor: '#FEE2E2',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  expiredText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    color: '#991B1B',
    marginBottom: 10,
  },
  renewButton: {
    backgroundColor: '#EF4444',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  renewText: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: '#FFFFFF',
  },
});