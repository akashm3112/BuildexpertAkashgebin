import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Platform,
  Dimensions,
  ActivityIndicator,
  Modal,
  FlatList,
  StatusBar,
  AppState,
  AppStateStatus,
} from 'react-native';
import * as ScreenCapture from 'expo-screen-capture';

import { useLocalSearchParams, router } from 'expo-router';
import { 
  ArrowLeft, 
  Star, 
  MapPin, 
  Phone, 
  MessageCircle,
  Calendar,
  Shield,
  Award,
  Clock
} from 'lucide-react-native';
import { API_BASE_URL } from '@/constants/api';
import { SafeView } from '@/components/SafeView';
import { useLanguage } from '@/context/LanguageContext';

const { width } = Dimensions.get('window');

// Responsive design utilities
const screenWidth = Dimensions.get('window').width;
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

export default function ProviderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useLanguage();
  const [provider, setProvider] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [imageModalVisible, setImageModalVisible] = useState(false);
  const screenCaptureIntervalRef = useRef<number | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // Enhanced screen capture prevention with continuous enforcement
  useEffect(() => {
    if (imageModalVisible) {
      // Immediately prevent screenshots and screen recording
      const enableProtection = async () => {
        try {
          await ScreenCapture.preventScreenCaptureAsync();
          // Continuously re-enforce protection every 100ms to aggressively prevent screen recording
          // This ensures screen recording cannot start even if user tries to initiate it
          screenCaptureIntervalRef.current = setInterval(async () => {
            try {
              await ScreenCapture.preventScreenCaptureAsync();
            } catch (error) {
              // Silently handle errors
            }
          }, 100);
        } catch (error) {
          if (Platform.OS !== 'web') {
            console.warn('Failed to enable screen capture prevention:', error);
          }
        }
      };
      
      enableProtection();

      // Monitor app state changes (screen recording might change app state)
      const handleAppStateChange = (nextAppState: AppStateStatus) => {
        // If app goes to background/inactive while modal is open, close modal for security
        // Screen recording often causes app state changes
        if (nextAppState === 'background' || nextAppState === 'inactive') {
          if (imageModalVisible) {
            // Close modal immediately if app state changes (possible screen recording)
            setImageModalVisible(false);
          }
        }
        appStateRef.current = nextAppState;
      };

      const subscription = AppState.addEventListener('change', handleAppStateChange);

      // Additional protection: Check app state periodically while modal is open
      // Screen recording can sometimes bypass initial protection, so we monitor continuously
      // Also re-enforce protection more frequently to prevent screen recording
      const stateCheckInterval = setInterval(() => {
        const currentState = AppState.currentState;
        // If app state changed unexpectedly, close modal immediately
        if (currentState !== 'active' && imageModalVisible) {
          setImageModalVisible(false);
        }
        // Aggressively re-enforce screen capture prevention on every check
        // This prevents screen recording from starting
        ScreenCapture.preventScreenCaptureAsync().catch(() => {
          // Silently handle errors
        });
      }, 150);

      // Cleanup
      return () => {
        if (screenCaptureIntervalRef.current) {
          clearInterval(screenCaptureIntervalRef.current);
          screenCaptureIntervalRef.current = null;
        }
        if (stateCheckInterval) {
          clearInterval(stateCheckInterval);
        }
        subscription?.remove();
        // Re-enable screen capture when modal closes
        ScreenCapture.allowScreenCaptureAsync().catch(() => {
          // Silently handle cleanup errors
        });
      };
    } else {
      // Re-enable screen capture when modal is closed
      if (screenCaptureIntervalRef.current) {
        clearInterval(screenCaptureIntervalRef.current);
        screenCaptureIntervalRef.current = null;
      }
      ScreenCapture.allowScreenCaptureAsync().catch((error) => {
        // Silently handle errors
        if (Platform.OS !== 'web') {
          console.warn('Failed to disable screen capture prevention:', error);
        }
      });
    }
  }, [imageModalVisible]);

  useEffect(() => {
    const fetchProvider = async () => {
      setLoading(true);
      setError(null);
      try {
        let apiUrl = '';
        // Use EXPO_PUBLIC_API_URL if set, otherwise default to localhost
        // If testing on a physical device, replace 'localhost' with your computer's LAN IP (e.g., 'http://192.168.1.5:5000')
        apiUrl = `${API_BASE_URL}/api/public/provider-service/${id}`;
        const res = await fetch(apiUrl);
        const contentType = res.headers.get('content-type');
        if (!res.ok) {
          const text = await res.text();
          console.error('Non-200 response:', res.status, text);
          setError(`Server error (${res.status}): ${text}`);
          return;
        }
        if (!contentType || !contentType.includes('application/json')) {
          const text = await res.text();
          console.error('Non-JSON response:', text);
          setError('Server did not return JSON. Raw response: ' + text.slice(0, 200));
          return;
        }
        const data = await res.json();
        if (data.status === 'success' && data.data && data.data.provider) {
          setProvider(data.data.provider);
        } else {
          setError(data.message || 'Provider not found');
        }
      } catch (err: any) {
        console.error('Provider fetch error:', err);
        setError(err?.message || 'Failed to fetch provider details');
      } finally {
        setLoading(false);
      }
    };
    if (id) fetchProvider();
  }, [id]);

  if (loading) {
    return (
      <SafeView style={styles.container} backgroundColor="#F8FAFC">
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={{ marginTop: 16 }}>{t('providerDetail.loadingProviderDetails')}</Text>
        </View>
      </SafeView>
    );
  }

  if (error || !provider) {
    return (
      <SafeView style={styles.container} backgroundColor="#F8FAFC">
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error || t('providerDetail.providerNotFound')}</Text>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>{t('providerDetail.goBack')}</Text>
          </TouchableOpacity>
        </View>
      </SafeView>
    );
  }

  const handleBookNow = () => {
    router.push(`/booking/${provider.provider_service_id}`);
  };

  const handleCall = () => {
    // In a real app, you would use Linking.openURL(`tel:${provider.phone}`)
  };

  const handleMessage = () => {
    // Navigate to chat or messaging screen
  };

  // Parse working proof images (portfolio)
  let portfolio: string[] = [];
  if (provider.working_proof_urls) {
    try {
      portfolio = Array.isArray(provider.working_proof_urls)
        ? provider.working_proof_urls
        : JSON.parse(provider.working_proof_urls);
    } catch {
      portfolio = [];
    }
  }

  const renderModalImage = ({ item }: { item: string }) => (
    <View style={styles.modalImageContainer}>
      <Image
        source={{ uri: item }}
        style={styles.modalImage}
        resizeMode="contain"
      />
    </View>
  );

  return (
    <SafeView style={styles.container} backgroundColor="#F8FAFC">
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" translucent={false} />
      {/* Image Modal */}
      <Modal
        visible={imageModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setImageModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          {/* Close Button */}
          <TouchableOpacity
            style={styles.modalCloseButton}
            onPress={() => setImageModalVisible(false)}
            activeOpacity={0.7}
          >
            <Text style={styles.modalCloseText}>✕</Text>
          </TouchableOpacity>
          
          {/* Image Counter */}
          {portfolio.length > 1 && (
            <View style={styles.imageCounter}>
              <Text style={styles.imageCounterText}>
                {selectedImageIndex + 1} / {portfolio.length}
              </Text>
            </View>
          )}
          
          {/* Image FlatList */}
          {portfolio.length > 0 && (
            <FlatList
              data={portfolio}
              renderItem={renderModalImage}
              keyExtractor={(_, idx) => idx.toString()}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              initialScrollIndex={selectedImageIndex}
              onScrollToIndexFailed={() => {}}
              getItemLayout={(_, index) => ({ 
                length: width, 
                offset: width * index, 
                index 
              })}
              onMomentumScrollEnd={(event) => {
                const index = Math.round(event.nativeEvent.contentOffset.x / width);
                setSelectedImageIndex(index);
              }}
              style={styles.modalFlatList}
              contentContainerStyle={styles.modalFlatListContent}
            />
          )}
        </View>
      </Modal>
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.headerBackButton}
          onPress={() => router.back()}
        >
          <ArrowLeft size={24} color="#1E293B" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('providerDetail.providerDetails')}</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Provider Info Card */}
        <View style={styles.providerCard}>
          <View style={styles.providerHeader}>
            <Image source={{ uri: provider.profile_pic_url || 'https://images.pexels.com/photos/1216589/pexels-photo-1216589.jpeg?auto=compress&cs=tinysrgb&w=600' }} style={styles.providerImage} />
            <View style={styles.providerInfo}>
              <View style={styles.nameRow}>
                <View style={styles.nameContainer}>
                  <Text style={styles.providerName}>
                    {provider.full_name}
                  </Text>
                </View>
                <View style={styles.verifiedBadge}>
                  <Shield size={getResponsiveSpacing(14, 16, 18)} color="#10B981" />
                </View>
              </View>
              <Text style={styles.businessName}>{provider.is_engineering_provider ? t('providerDetail.engineeringProvider') : t('providerDetail.serviceProvider')}</Text>
              
              <View style={styles.ratingRow}>
                <Star size={16} color="#F59E0B" fill="#F59E0B" />
                <Text style={styles.rating}>{provider.averageRating?.toFixed(1) || 'N/A'}</Text>
                <Text style={styles.reviews}>({provider.totalReviews || 0} reviews)</Text>
              </View>
              <View style={styles.locationRow}>
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
          <View style={styles.statsContainer}>
            <View style={styles.statItem}>
              <Award size={getResponsiveSpacing(14, 16, 18)} color="#3B82F6" />
              <Text style={styles.statValue}>
                {provider.years_of_experience} {t('serviceListing.years')}
              </Text>
              <Text style={styles.statLabel}>
                {t('providerDetail.experience')}
              </Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Clock size={getResponsiveSpacing(14, 16, 18)} color="#10B981" />
              {provider.pricing && provider.pricing.minPrice !== null && provider.pricing.maxPrice !== null ? (
                <View style={styles.priceContainer}>
                  {provider.pricing.subServiceCount === 1 ? (
                    <Text style={styles.statValue}>
                      ₹{provider.pricing.minPrice.toLocaleString('en-IN')}
                    </Text>
                  ) : provider.pricing.minPrice === provider.pricing.maxPrice ? (
                    <Text style={styles.statValue}>
                      ₹{provider.pricing.minPrice.toLocaleString('en-IN')}
                    </Text>
                  ) : (
                    <>
                      <Text style={styles.statValue}>
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
                <Text style={styles.statValue}>
                  Price on request
                </Text>
              )}
              <Text style={styles.statLabel}>
                {t('providerDetail.startingPrice')}
              </Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Calendar size={getResponsiveSpacing(14, 16, 18)} color="#F59E0B" />
              <Text style={styles.statValue}>
                {t('providerDetail.available')}
              </Text>
              <Text style={styles.statLabel}>
                {t('serviceListing.availability')}
              </Text>
            </View>
          </View>
        </View>
        {/* Description */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('providerDetail.about')}</Text>
          <Text style={styles.description}>
            {t('providerDetail.aboutDescription', {
              providerName: provider.full_name,
              years: provider.years_of_experience.toString(),
              rating: provider.averageRating?.toFixed(1) || '3'
            })}
          </Text>
        </View>
        {/* Portfolio */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('providerDetail.portfolio')}</Text>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.portfolioContainer}
          >
            {portfolio.length > 0 ? portfolio.map((image, index) => (
              <TouchableOpacity
                key={index}
                onPress={() => { setSelectedImageIndex(index); setImageModalVisible(true); }}
              >
                <Image 
                  source={{ uri: image }} 
                  style={[
                    styles.portfolioImage,
                    selectedImageIndex === index && styles.selectedPortfolioImage
                  ]} 
                />
              </TouchableOpacity>
            )) : <Text>{t('providerDetail.noPortfolioImages')}</Text>}
          </ScrollView>
        </View>
        {/* Reviews */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('providerDetail.recentReviews')}</Text>
          {provider.ratings && provider.ratings.length > 0 ? provider.ratings.map((review: any, idx: number) => (
            <View key={idx} style={styles.reviewCard}>
              <View style={styles.reviewHeader}>
                <View>
                  <Text style={styles.reviewerName}>{review.customer_name}</Text>
                  <Text style={styles.reviewService}>{review.review}</Text>
                </View>
                <View style={styles.reviewMeta}>
                  <View style={styles.reviewRating}>
                    <Star size={14} color="#F59E0B" fill="#F59E0B" />
                    <Text style={styles.reviewRatingText}>{review.rating}</Text>
                  </View>
                  <Text style={styles.reviewDate}>{new Date(review.created_at).toLocaleDateString()}</Text>
                </View>
              </View>
              <Text style={styles.reviewComment}>{review.review}</Text>
            </View>
          )) : <Text>{t('providerDetail.noReviewsYet')}</Text>}
        </View>
      </ScrollView>
      {/* Action Buttons */}
      <View style={styles.actionContainer}>
        
        <TouchableOpacity style={styles.bookButton} onPress={handleBookNow}>
          <Text style={styles.bookButtonText}>{t('providerDetail.bookNow')}</Text>
        </TouchableOpacity>
      </View>
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
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerBackButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1E293B',
  },
  placeholder: {
    width: 32,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  providerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: getResponsiveSpacing(14, 16, 18),
    padding: getResponsiveSpacing(16, 20, 24),
    marginVertical: getResponsiveSpacing(12, 16, 20),
    ...Platform.select({
      ios: {
        shadowColor: '#CBD5E1',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: {
        elevation: 3,
      },
      web: {
        boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.08)',
      },
    }),
  },
  providerHeader: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  providerImage: {
    width: getResponsiveSpacing(70, 80, 90),
    height: getResponsiveSpacing(70, 80, 90),
    borderRadius: getResponsiveSpacing(35, 40, 45),
    marginRight: getResponsiveSpacing(12, 16, 20),
  },
  providerInfo: {
    flex: 1,
    minWidth: 0, // Allow flex children to shrink below their content size
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  nameContainer: {
    flex: 1,
    marginRight: getResponsiveSpacing(6, 8, 10),
  },
  providerName: {
    fontSize: getResponsiveFontSize(18, 20, 22),
    fontWeight: '700',
    color: '#1E293B',
  },
  verifiedBadge: {
    backgroundColor: '#ECFDF5',
    borderRadius: getResponsiveSpacing(10, 12, 14),
    padding: getResponsiveSpacing(4, 5, 6),
    flexShrink: 0, // Prevent badge from shrinking
    marginTop: 2, // Align with first line of text when wrapping
  },
  businessName: {
    fontSize: getResponsiveFontSize(14, 16, 18),
    fontWeight: '500',
    color: '#3B82F6',
    marginBottom: getResponsiveSpacing(4, 5, 6),
  },
  specialty: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 8,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  rating: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
    marginLeft: 4,
  },
  reviews: {
    fontSize: 14,
    color: '#64748B',
    marginLeft: 4,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0, // Allow text to shrink
  },
  location: {
    fontSize: getResponsiveFontSize(12, 13, 14),
    color: '#64748B',
    marginLeft: getResponsiveSpacing(4, 5, 6),
    flex: 1,
    flexWrap: 'wrap',
  },
  statsContainer: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: getResponsiveSpacing(8, 10, 12),
    padding: getResponsiveSpacing(8, 10, 12),
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: getResponsiveSpacing(4, 5, 6),
  },
  statValue: {
    fontSize: getResponsiveFontSize(11, 12, 13),
    fontWeight: '600',
    color: '#1E293B',
    marginTop: getResponsiveSpacing(2, 3, 4),
    marginBottom: getResponsiveSpacing(1, 2, 3),
    textAlign: 'center',
    width: '100%',
  },
  priceContainer: {
    alignItems: 'center',
    width: '100%',
  },
  priceRangeText: {
    fontSize: getResponsiveFontSize(8, 9, 10),
    fontWeight: '400',
    color: '#64748B',
    marginTop: getResponsiveSpacing(1, 2, 3),
    textAlign: 'center',
  },
  statLabel: {
    fontSize: getResponsiveFontSize(9, 10, 11),
    color: '#64748B',
    textAlign: 'center',
    width: '100%',
  },
  statDivider: {
    width: 1,
    backgroundColor: '#E2E8F0',
    marginHorizontal: getResponsiveSpacing(6, 8, 10),
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 16,
  },
  description: {
    fontSize: 16,
    color: '#64748B',
    lineHeight: 24,
  },
  servicesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  serviceTag: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 8,
  },
  serviceTagText: {
    fontSize: 14,
    color: '#3B82F6',
    fontWeight: '500',
  },
  portfolioContainer: {
    paddingRight: 20,
  },
  portfolioImage: {
    width: 120,
    height: 120,
    borderRadius: 12,
    marginRight: 12,
  },
  selectedPortfolioImage: {
    borderWidth: 3,
    borderColor: '#3B82F6',
  },
  reviewCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  reviewerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
  },
  reviewService: {
    fontSize: 12,
    color: '#64748B',
  },
  reviewMeta: {
    alignItems: 'flex-end',
  },
  reviewRating: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  reviewRatingText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1E293B',
    marginLeft: 4,
  },
  reviewDate: {
    fontSize: 12,
    color: '#94A3B8',
  },
  reviewComment: {
    fontSize: 14,
    color: '#64748B',
    lineHeight: 20,
  },
  actionContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    gap: 12,
  },
  callButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    paddingVertical: 14,
    borderRadius: 12,
  },
  callButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    marginLeft: 6,
  },
  messageButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
    paddingVertical: 14,
    borderRadius: 12,
  },
  messageButtonText: {
    color: '#3B82F6',
    fontWeight: '600',
    marginLeft: 6,
  },
  // Image Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 40,
    right: 20,
    zIndex: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
      },
      android: {
        elevation: 5,
      },
    }),
  },
  modalCloseText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '300',
    lineHeight: 24,
  },
  imageCounter: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 40,
    left: 20,
    zIndex: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  imageCounterText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  modalFlatList: {
    width: '100%',
    height: '100%',
  },
  modalFlatListContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalImageContainer: {
    width: width,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  modalImage: {
    width: '100%',
    height: '100%',
    maxWidth: width * 0.95,
    maxHeight: Dimensions.get('window').height * 0.85,
  },
  bookButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3B82F6',
    paddingVertical: 14,
    borderRadius: 12,
  },
  bookButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  errorText: {
    fontSize: 18,
    color: '#64748B',
    marginBottom: 20,
  },
  backButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
});