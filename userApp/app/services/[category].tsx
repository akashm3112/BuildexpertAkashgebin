import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  TextInput,
  Platform,
  Modal,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  StatusBar,
  Dimensions,
  Animated,
  Pressable,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { ArrowLeft, Search, Star, MapPin, Filter, Heart, Phone, MessageCircle, X, FileSliders as Sliders, AlertTriangle, CreditCard, Lock } from 'lucide-react-native';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { useLabourAccess } from '@/context/LabourAccessContext';
import { useLocation } from '@/context/LocationContext';
import Toast from 'react-native-toast-message';
import { API_BASE_URL } from '@/constants/api';
import { SafeView } from '@/components/SafeView';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

// Premium Location Loading Indicator Component - Modal Popup
const LocationLoadingIndicator = ({ 
  visible, 
  text 
}: { 
  visible: boolean;
  text: string;
}) => {
  const { t } = useLanguage();
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    if (visible) {
      // Fade in and scale up animation
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
      ]).start();

      // Pulse animation
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.1,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      );

      // Rotation animation for map pin
      const rotate = Animated.loop(
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        })
      );

      // Shimmer animation
      const shimmer = Animated.loop(
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        })
      );

      pulse.start();
      rotate.start();
      shimmer.start();

      return () => {
        pulse.stop();
        rotate.stop();
        shimmer.stop();
      };
    } else {
      // Fade out animation
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 0.9,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const rotateInterpolate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const shimmerTranslateX = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-200, 200],
  });

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="none"
      statusBarTranslucent={true}
      onRequestClose={() => {}} // Prevent closing by back button
    >
      <Animated.View
        style={[
          styles.locationLoadingModalBackdrop,
          {
            opacity: fadeAnim,
          },
        ]}
      >
        <Animated.View
          style={[
            styles.locationLoadingModalContainer,
            {
              transform: [{ scale: scaleAnim }],
              opacity: fadeAnim,
            },
          ]}
        >
          <Animated.View
            style={[
              styles.locationLoadingContainer,
              {
                transform: [{ scale: pulseAnim }],
              },
            ]}
          >
            {/* Shimmer effect background */}
            <Animated.View
              style={[
                styles.locationLoadingShimmer,
                {
                  transform: [{ translateX: shimmerTranslateX }],
                },
              ]}
            />
            
            {/* Content */}
            <View style={styles.locationLoadingContent}>
              {/* Animated Map Pin Icon */}
              <Animated.View
                style={{
                  transform: [{ rotate: rotateInterpolate }],
                }}
              >
                <View style={styles.locationLoadingIconContainer}>
                  <MapPin size={32} color="#3B82F6" fill="#3B82F6" />
                  <View style={styles.locationLoadingPulseDot} />
                </View>
              </Animated.View>

              {/* Text Content */}
              <View style={styles.locationLoadingTextContainer}>
                <Text style={styles.locationLoadingTitle}>
                  {text}
                </Text>
                <Text style={styles.locationLoadingSubtitle}>
                  {t('location.pleaseWait') || 'Please wait while we detect your location'}
                </Text>
              </View>

              {/* Loading Dots */}
              <View style={styles.locationLoadingDots}>
                <Animated.View
                  style={[
                    styles.locationLoadingDot,
                    {
                      opacity: pulseAnim,
                    },
                  ]}
                />
                <Animated.View
                  style={[
                    styles.locationLoadingDot,
                    {
                      opacity: pulseAnim,
                    },
                  ]}
                />
                <Animated.View
                  style={[
                    styles.locationLoadingDot,
                    {
                      opacity: pulseAnim,
                    },
                  ]}
                />
              </View>
            </View>
          </Animated.View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
};

interface Provider {
  user_id: string;
  full_name: string;
  phone: string;
  profile_pic_url?: string;
  years_of_experience: number;
  service_description: string;
  provider_service_id: string;
  service_charge_value: number;
  service_charge_unit: string;
  working_proof_urls?: string[];
  payment_start_date: string;
  payment_end_date: string;
  averageRating?: number;
  totalReviews?: number;
  state: string;
  city?: string;
}

export default function ServiceListingScreen() {
  const { category } = useLocalSearchParams<{ category: string }>();
  const { user } = useAuth();
  const { t } = useLanguage();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [totalProviders, setTotalProviders] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [favorites, setFavorites] = useState<string[]>([]);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [filters, setFilters] = useState({
    minRating: 0,
    experience: 0,
    city: ''
  });
  const [tempFilters, setTempFilters] = useState(filters);
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [showCitySuggestions, setShowCitySuggestions] = useState(false);
  const cityInputRef = useRef<TextInput>(null);
  const citySuggestionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isSelectingCityRef = useRef(false); // Track when user is selecting from suggestions
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [categoryName, setCategoryName] = useState<string>('Services');
  const [labourAccessStatus, setLabourAccessStatus] = useState<any>(null);
  const [showLabourPaymentModal, setShowLabourPaymentModal] = useState(false);
  
  // Use labour access context - this already uses apiClient and handles errors properly
  const { labourAccessStatus: contextLabourAccessStatus, checkLabourAccess } = useLabourAccess();
  
  // Location context - fetch location when service listing screen loads
  const { location, isLoading: isLoadingLocation, error: locationError, fetchLocation } = useLocation();

  // Sync context status to local state
  useEffect(() => {
    if (contextLabourAccessStatus) {
      setLabourAccessStatus(contextLabourAccessStatus);
    }
  }, [contextLabourAccessStatus]);

  // Track if location error has been shown to user (prevent duplicate toasts)
  const [locationErrorShown, setLocationErrorShown] = useState(false);

  // Fetch location when service listing screen loads (when user clicks on grid)
  useEffect(() => {
    console.log('🔵 Service listing screen mounted, fetching location...');
    // Small delay to ensure UI is rendered
    const timer = setTimeout(() => {
      fetchLocation()
        .then(() => {
          console.log('✅ Location fetch initiated successfully in service listing');
        })
        .catch((err) => {
          // Error is already handled in LocationContext - this catch is just for logging
          console.warn('⚠️ Location fetch completed with error (handled gracefully):', err);
        });
    }, 100);

    return () => clearTimeout(timer);
  }, [fetchLocation]);

  // Show user-friendly error message when location fetch fails (only once)
  useEffect(() => {
    if (locationError && !locationErrorShown && !isLoadingLocation) {
      setLocationErrorShown(true);
      // Show non-intrusive toast message - app continues to work
      Toast.show({
        type: 'info',
        text1: t('location.errorTitle') || 'Location Unavailable',
        text2: locationError || (t('location.errorMessage') || 'Location services are unavailable. You can still browse and book services.'),
        visibilityTime: 4000,
        autoHide: true,
        position: 'top',
      });
    }
  }, [locationError, locationErrorShown, isLoadingLocation, t]);

  useEffect(() => {
    const fetchServiceUuids = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/public/services`);
        const data = await response.json();
        if (data.status === 'success' && data.data.services) {
          // Try to find by UUID directly
          let found = data.data.services.find((service: any) => service.id === category);
          if (!found) {
            // Fallback to route mapping
            const routeToName: Record<string, string> = {
              'civil-engineer': 'engineer-interior',
              'plumber': 'plumber',
              'marble-provider': 'granite-tiles',
              'painting-cleaning': 'painting-cleaning',
              'contractor': 'contact-building',
              'laborer': 'labors',
              'mason': 'mason-mastri',
              'interiors': 'interiors-building',
              'stainless-steel': 'stainless-steel',
              'glass-mirror': 'glass-mirror',
            };
            found = data.data.services.find((service: any) => service.name && routeToName[category as string] === service.name);
          }
          if (found) {
            setServiceId(found.id);
            setCategoryName(found.name.charAt(0).toUpperCase() + found.name.slice(1).replace('-', ' '));
            
            // Check labour access if this is a labour service
            if (found.name === 'labors') {
              await checkLabourAccess().catch((error: any) => {
                // Errors are handled in checkLabourAccess, catch here to prevent unhandled rejections
                const isSessionExpired = error?.message === 'Session expired' || 
                                         error?.status === 401 && error?.message?.includes('Session expired') ||
                                         error?._suppressUnhandled === true ||
                                         error?._handled === true;
                if (!isSessionExpired) {
                  console.warn('checkLabourAccess error (handled):', error?.message || error);
                }
              });
            }
          } else {
            setError('Service category not found');
            setIsLoading(false);
          }
        }
      } catch (e) {
        setError('Failed to fetch service list');
        setIsLoading(false);
      }
    };
    fetchServiceUuids();
  }, [category]);

  // Handle screen orientation changes
  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', () => {
      // Force re-render when screen dimensions change
      // This ensures responsive styles are updated
    });

    return () => subscription?.remove();
  }, []);

  useEffect(() => {
    if (serviceId) {
      // Wait for location to be fetched (or timeout) before fetching providers
      // This ensures we have location data for sorting
      if (isLoadingLocation) {
        // Location is still loading, wait a bit
        const timer = setTimeout(() => {
          // Fetch providers even if location is still loading (will use default sorting)
          fetchProviders(1, false);
        }, 2000); // Max 2 seconds wait for location
        
        return () => clearTimeout(timer);
      } else {
        // Location loaded (or failed), fetch providers now
        fetchProviders(1, false);
      }
    } else if (!isLoading) {
      setError('Service not found. Please try again from the home screen.');
    }
  }, [serviceId, location, isLoadingLocation, fetchProviders]);

  const fetchProviders = useCallback(async (page: number = 1, append: boolean = false) => {
    if (!serviceId) return;
    try {
      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
        setCurrentPage(1);
        setHasMore(true);
      }
      setError(null);

      // Build URL with location parameters if available
      const urlParams = new URLSearchParams();
      if (location?.city) {
        urlParams.append('userCity', location.city);
      }
      if (location?.state) {
        urlParams.append('userState', location.state);
      }
      // Use smaller batches for better performance and infinite scroll
      const pageSize = 30; // Load 30 providers at a time
      urlParams.append('limit', pageSize.toString());
      urlParams.append('page', page.toString());
      
      const queryString = urlParams.toString();
      const url = `${API_BASE_URL}/api/public/services/${serviceId}/providers?${queryString}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        
        if (data.status === 'success' && Array.isArray(data.data.providers)) {
          const rawProviders = data.data.providers;
          const pagination = data.data.pagination || {};
          
          // Update pagination state
          setTotalProviders(pagination.total || 0);
          setHasMore(pagination.currentPage < pagination.totalPages);
          
          // If no providers found, set empty array instead of error
          if (rawProviders.length === 0) {
            if (page === 1) {
              setProviders([]);
            }
            setHasMore(false);
            setIsLoading(false);
            setIsLoadingMore(false);
            return;
          }
          
          // Progressive loading: Display providers immediately, then fetch ratings in background
          // For pagination: append new providers to existing list
          const newProviders = rawProviders.map((provider: Provider) => ({
            ...provider,
            averageRating: 0,
            totalReviews: 0,
          }));
          
          if (page === 1) {
            // First page: replace all providers
            setProviders(newProviders);
            setCurrentPage(1);
          } else {
            // Subsequent pages: append to existing providers
            setProviders((prev) => [...prev, ...newProviders]);
            setCurrentPage(page);
          }
          
          setIsLoading(false);
          setIsLoadingMore(false);
          
          // Fetch ratings in background for newly loaded providers only
          // Batch rating fetches to avoid overwhelming the server
          const batchSize = 10; // Fetch 10 ratings at a time
          for (let i = 0; i < rawProviders.length; i += batchSize) {
            const batch = rawProviders.slice(i, i + batchSize);
            
            Promise.allSettled(
              batch.map(async (provider: Provider) => {
                try {
                  const ratingResponse = await fetch(
                    `${API_BASE_URL}/api/public/services/${serviceId}/providers/${provider.provider_service_id}`,
                    {
                      method: 'GET',
                      headers: {
                        'Content-Type': 'application/json',
                      },
                    }
                  );

                  if (ratingResponse.ok) {
                    const ratingData = await ratingResponse.json();
                    return {
                      providerId: provider.provider_service_id,
                      averageRating: ratingData.data.provider.averageRating || 0,
                      totalReviews: ratingData.data.provider.totalReviews || 0,
                    };
                  }
                  return {
                    providerId: provider.provider_service_id,
                    averageRating: 0,
                    totalReviews: 0,
                  };
                } catch (error) {
                  console.error('Error fetching ratings for provider:', provider.provider_service_id);
                  return {
                    providerId: provider.provider_service_id,
                    averageRating: 0,
                    totalReviews: 0,
                  };
                }
              })
            ).then((results) => {
              // Update providers with ratings as they come in
              setProviders((prevProviders) => {
                return prevProviders.map((provider) => {
                  const result = results.find(
                    (r) => r.status === 'fulfilled' && r.value.providerId === provider.provider_service_id
                  );
                  if (result && result.status === 'fulfilled') {
                    return {
                      ...provider,
                      averageRating: result.value.averageRating,
                      totalReviews: result.value.totalReviews,
                    };
                  }
                  return provider;
                });
              });
            });
            
            // Small delay between batches to avoid overwhelming the server
            if (i + batchSize < rawProviders.length) {
              await new Promise(resolve => setTimeout(resolve, 100));
            }
          }
        } else {
          setError('Invalid response format from server');
        }
      } else {
        const errorText = await response.text();
        
        if (response.status === 404) {
          setError('No providers found for this service');
        } else {
          setError('Failed to fetch providers. Please try again.');
        }
      }
    } catch (error) {
      console.error('Error fetching providers:', error);
      setError('Network error. Please check your connection and try again.');
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [serviceId, location]);

  // Load more providers when user scrolls to bottom
  const loadMoreProviders = useCallback(() => {
    if (!isLoadingMore && hasMore && !isLoading) {
      fetchProviders(currentPage + 1, true);
    }
  }, [isLoadingMore, hasMore, isLoading, currentPage, fetchProviders]);

  const onRefresh = async () => {
    setRefreshing(true);
    setCurrentPage(1);
    setHasMore(true);
    await fetchProviders(1, false);
    setRefreshing(false);
  };

  // Remove duplicate providers by provider_service_id (memoized to prevent infinite loops)
  const uniqueProviders = useMemo(() => {
    return Array.from(
      new Map(providers.map(p => [p.provider_service_id, p])).values()
    );
  }, [providers]);

  // Get all available cities from providers for city filter suggestions
  const availableCities = useMemo(() => {
    const cities = new Set<string>();
    uniqueProviders.forEach(provider => {
      if (provider.city && provider.city.trim()) {
        cities.add(provider.city.trim());
      }
    });
    return Array.from(cities).sort();
  }, [uniqueProviders]);

  // Update city suggestions when user types (but not when selecting from suggestions)
  useEffect(() => {
    // Skip if user is selecting from suggestions to prevent interference
    if (isSelectingCityRef.current) {
      isSelectingCityRef.current = false; // Reset flag
      return;
    }

    if (tempFilters.city && tempFilters.city.trim().length >= 2) {
      const query = tempFilters.city.toLowerCase().trim();
      const suggestions = availableCities.filter(city =>
        city.toLowerCase().includes(query)
      ).slice(0, 5); // Limit to 5 suggestions
      setCitySuggestions(suggestions);
      setShowCitySuggestions(suggestions.length > 0);
    } else {
      setCitySuggestions([]);
      setShowCitySuggestions(false);
    }
  }, [tempFilters.city, availableCities]);

  const filteredProviders = uniqueProviders.filter(provider => {
    // Search filter
    const matchesSearch = provider.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      provider.service_description.toLowerCase().includes(searchQuery.toLowerCase());

    // Rating filter
    const matchesRating = (provider.averageRating || 0) >= filters.minRating;

    // Experience filter
    const matchesExperience = provider.years_of_experience >= filters.experience;

    // City filter (case-insensitive)
    const matchesCity = !filters.city || 
      (provider.city && provider.city.toLowerCase().trim() === filters.city.toLowerCase().trim());

    return matchesSearch && matchesRating && matchesExperience && matchesCity;
  });

 
  if (filteredProviders.length === 0 && providers.length > 0) {
  }

  const toggleFavorite = (providerId: string) => {
    setFavorites(prev => 
      prev.includes(providerId) 
        ? prev.filter(id => id !== providerId)
        : [...prev, providerId]
    );
  };

  const handleBookNow = (providerId: string) => {
    // Check if this is a labour service and user doesn't have access
    if (categoryName.toLowerCase().includes('labors') || categoryName.toLowerCase().includes('labour')) {
      if (!labourAccessStatus?.hasAccess) {
        setShowLabourPaymentModal(true);
        return;
      }
    }
    router.push(`/booking/${providerId}`);
  };

  const handleProviderPress = (providerId: string) => {
    router.push(`/provider/${providerId}`);
  };

  const applyFilters = () => {
    setFilters(tempFilters);
    setShowFilterModal(false);
  };

  const resetFilters = () => {
    const defaultFilters = {
      minRating: 0,
      experience: 0,
      city: ''
    };
    setTempFilters(defaultFilters);
    setFilters(defaultFilters);
    setCitySuggestions([]);
    setShowCitySuggestions(false);
  };

  // Get proper service options based on provider category
  const getProviderServices = (provider: Provider): string[] => {
    if (!provider) return [];
    
    // Get service category from provider and normalize it
    const serviceCategory = (provider.service_description || '').toLowerCase().trim();
    
    // Category mapping to handle variations in service names
    const categoryMapping: Record<string, string> = {
      'plumber': 'plumber',
      'plumbing': 'plumber',
      'mason': 'mason-mastri',
      'mason-mastri': 'mason-mastri',
      'mastri': 'mason-mastri',
      'electrician': 'electrician',
      'electrical': 'electrician',
      'carpenter': 'carpenter',
      'carpentry': 'carpenter',
      'painter': 'painter',
      'painting': 'painter',
      'cleaning': 'cleaning',
      'cleaning services': 'cleaning',
      'deep cleaning': 'cleaning',
      'painting-cleaning': 'painting-cleaning',
      'granite': 'granite-tiles',
      'tiles': 'granite-tiles',
      'granite-tiles': 'granite-tiles',
      'engineer': 'engineer-interior',
      'interior': 'engineer-interior',
      'engineer-interior': 'engineer-interior',
      'labor': 'labors',
      'labors': 'labors',
      'labour': 'labors',
      'labours': 'labors',
      'interiors': 'interiors-building',
      'interiors-building': 'interiors-building',
      'stainless': 'stainless-steel',
      'steel': 'stainless-steel',
      'stainless-steel': 'stainless-steel',
      'construction': 'contact-building',
      'building': 'contact-building',
      'contact-building': 'contact-building',
      'borewell': 'borewell',
      'bore well': 'borewell',
      'bore-well': 'borewell',
      'borewell services': 'borewell',
    };
    
    // Default service options for each category (3 main + Others)
    const serviceOptions: Record<string, string[]> = {
      'plumber': [
        t('serviceOptions.tapRepair'),
        t('serviceOptions.pipeLeakage'),
        t('serviceOptions.bathroomFitting'),
        t('serviceOptions.others')
      ],
      'mason-mastri': [
        t('serviceOptions.wallConstruction'),
        t('serviceOptions.foundationWork'),
        t('serviceOptions.brickLaying'),
        t('serviceOptions.others')
      ],
      'electrician': [
        t('serviceOptions.wiringInstallation'),
        t('serviceOptions.switchSocketInstallation'),
        t('serviceOptions.fanInstallation'),
        t('serviceOptions.others')
      ],
      'carpenter': [
        t('serviceOptions.doorInstallation'),
        t('serviceOptions.windowInstallation'),
        t('serviceOptions.furnitureMaking'),
        t('serviceOptions.others')
      ],
      'painter': [
        t('serviceOptions.interiorPainting'),
        t('serviceOptions.exteriorPainting'),
        t('serviceOptions.wallTexture'),
        t('serviceOptions.others')
      ],
      'painting-cleaning': [
        t('serviceOptions.interiorPainting'),
        t('serviceOptions.exteriorPainting'),
        t('serviceOptions.wallTexture'),
        t('serviceOptions.others')
      ],
      'cleaning': [
        t('serviceOptions.houseCleaning'),
        t('serviceOptions.officeCleaning'),
        t('serviceOptions.deepCleaning'),
        t('serviceOptions.others')
      ],
      'granite-tiles': [
        t('serviceOptions.graniteInstallation'),
        t('serviceOptions.tileInstallation'),
        t('serviceOptions.kitchenCountertop'),
        t('serviceOptions.others')
      ],
      'engineer-interior': [
        t('serviceOptions.interiorDesign'),
        t('serviceOptions.spacePlanning'),
        t('serviceOptions.threeDVisualization'),
        t('serviceOptions.others')
      ],
      'labors': [
        t('serviceOptions.loadingUnloading'),
        t('serviceOptions.materialTransportation'),
        t('serviceOptions.siteCleaning'),
        t('serviceOptions.others')
      ],
      'interiors-building': [
        t('serviceOptions.completeInteriorDesign'),
        t('serviceOptions.modularKitchen'),
        t('serviceOptions.wardrobeDesign'),
        t('serviceOptions.others')
      ],
      'stainless-steel': [
        t('serviceOptions.kitchenSinkInstallation'),
        t('serviceOptions.staircaseRailing'),
        t('serviceOptions.gateInstallation'),
        t('serviceOptions.others')
      ],
      'contact-building': [
        t('serviceOptions.completeHouseConstruction'),
        t('serviceOptions.commercialBuilding'),
        t('serviceOptions.renovationServices'),
        t('serviceOptions.others')
      ],
      'borewell': [
        t('serviceOptions.borewellDrilling'),
        t('serviceOptions.submersiblePumpInstallation'),
        t('serviceOptions.borewellMaintenance'),
        t('serviceOptions.waterTesting')
      ]
    };
    
    // Map the service category to the standardized name
    const mappedCategory = categoryMapping[serviceCategory] || serviceCategory;
    
    // Return services based on mapped category
    if (mappedCategory && serviceOptions[mappedCategory]) {
      return serviceOptions[mappedCategory];
    }
    
    // Fallback: try to match based on partial category name
    for (const [key, value] of Object.entries(categoryMapping)) {
      if (serviceCategory.includes(key) || key.includes(serviceCategory)) {
        if (serviceOptions[value]) {
          return serviceOptions[value];
        }
      }
    }
    
    // Final fallback: parse from service description if category not found
    if (provider.service_description) {
      const descriptionServices = provider.service_description.split(', ').filter((service: string) => service.trim());
      if (descriptionServices.length > 0) {
        return descriptionServices;
      }
    }
    
    // Ultimate fallback: return generic services based on common patterns
    if (serviceCategory.includes('plumb') || serviceCategory.includes('pipe') || serviceCategory.includes('water')) {
      return serviceOptions['plumber'];
    } else if (serviceCategory.includes('electr') || serviceCategory.includes('wiring') || serviceCategory.includes('switch')) {
      return serviceOptions['electrician'];
    } else if (serviceCategory.includes('carpent') || serviceCategory.includes('wood') || serviceCategory.includes('furniture')) {
      return serviceOptions['carpenter'];
    } else if (serviceCategory.includes('paint') || serviceCategory.includes('color')) {
      return serviceOptions['painter'];
    } else if (serviceCategory.includes('clean') || serviceCategory.includes('wash')) {
      return serviceOptions['painting-cleaning'];
    } else if (serviceCategory.includes('labor') || serviceCategory.includes('labour') || serviceCategory.includes('load')) {
      return serviceOptions['labors'];
    } else if (serviceCategory.includes('interior') || serviceCategory.includes('design')) {
      return serviceOptions['engineer-interior'];
    } else if (serviceCategory.includes('granite') || serviceCategory.includes('tile')) {
      return serviceOptions['granite-tiles'];
    } else if (serviceCategory.includes('steel') || serviceCategory.includes('metal')) {
      return serviceOptions['stainless-steel'];
    } else if (serviceCategory.includes('construct') || serviceCategory.includes('build')) {
      return serviceOptions['contact-building'];
    }
    
    // Default fallback: return a generic service list
    return [
      t('serviceOptions.others'),
      t('serviceOptions.others'),
      t('serviceOptions.others'),
      t('serviceOptions.others')
    ];
  };

  const renderProvider = ({ item }: { item: Provider }) => (
    <TouchableOpacity 
      style={styles.providerCard}
      onPress={() => handleProviderPress(item.provider_service_id)}
      activeOpacity={0.7}
    >
      <View style={styles.cardHeader}>
        <Image 
          source={{ 
            uri: item.profile_pic_url || 'https://images.pexels.com/photos/1216589/pexels-photo-1216589.jpeg?auto=compress&cs=tinysrgb&w=600'
          }} 
          style={styles.providerImage} 
        />
        <View style={styles.providerInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.providerName}>{item.full_name}</Text>
            <View style={styles.verifiedBadge}>
              <Text style={styles.verifiedText}>✓</Text>
            </View>
          </View>
          <View style={styles.ratingRow}>
            <Star size={14} color="#F59E0B" fill="#F59E0B" />
            <Text style={styles.rating}>{item.averageRating?.toFixed(1) || 'N/A'}</Text>
            <Text style={styles.reviews}>({item.totalReviews || 0} {t('serviceListing.reviews')})</Text>
          </View>
          <View style={styles.locationRow}>
            <MapPin size={14} color="#64748B" />
            <Text style={styles.location} numberOfLines={1}>
              {item.city && item.state 
                ? `${item.city}, ${item.state}` 
                : item.city || item.state || 'Location not available'}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.favoriteButton}
          onPress={() => toggleFavorite(item.provider_service_id)}
        >
          <Heart 
            size={20} 
            color={favorites.includes(item.provider_service_id) ? "#EF4444" : "#94A3B8"}
            fill={favorites.includes(item.provider_service_id) ? "#EF4444" : "transparent"}
          />
        </TouchableOpacity>
      </View>

      <View style={styles.cardBody}>
        <View style={styles.detailsRow}>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>{t('serviceListing.experience')}</Text>
            <Text style={styles.detailValue}>{item.years_of_experience} {t('serviceListing.years')}</Text>
          </View>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>{t('serviceListing.price')}</Text>
            <Text style={styles.priceValue}>₹{item.service_charge_value}/{item.service_charge_unit}</Text>
          </View>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>{t('serviceListing.availability')}</Text>
            <Text style={styles.availabilityValue}>{t('serviceListing.availableToday')}</Text>
          </View>
        </View>

        <View style={styles.servicesSection}>
          <Text style={styles.servicesLabel}>{t('serviceListing.services')}</Text>
          <View style={styles.servicesTags}>
            {getProviderServices(item).slice(0, 2).map((service: string, index: number) => (
              <View key={index} style={styles.serviceTag}>
                <Text style={styles.serviceTagText}>{service}</Text>
              </View>
            ))}
            {getProviderServices(item).length > 2 && (
              <Text style={styles.moreServices}>{t('serviceListing.moreServices', { count: (getProviderServices(item).length - 2).toString() })}</Text>
            )}
          </View>
        </View>

        <View style={styles.actionButtons}>
          <TouchableOpacity 
            style={styles.bookButton}
            onPress={() => handleBookNow(item.provider_service_id)}
          >
            <Text style={styles.bookButtonText}>{t('serviceListing.bookNow')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );

  if (isLoading) {
    return (
      <SafeView style={styles.container} backgroundColor="#F8FAFC">
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <ArrowLeft size={24} color="#1E293B" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{categoryName}</Text>
          <View style={styles.filterButton} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>{t('serviceListing.loadingProviders')}</Text>
        </View>
      </SafeView>
    );
  }

  if (error) {
    return (
      <SafeView style={styles.container} backgroundColor="#F8FAFC">
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <ArrowLeft size={24} color="#1E293B" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{categoryName}</Text>
          <View style={styles.filterButton} />
        </View>
        <View style={styles.errorContainer}>
          <AlertTriangle size={48} color="#EF4444" />
          <Text style={styles.errorTitle}>{t('serviceListing.errorLoadingProviders')}</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchProviders}>
            <Text style={styles.retryButtonText}>{t('serviceListing.tryAgain')}</Text>
          </TouchableOpacity>
        </View>
      </SafeView>
    );
  }

  return (
    <SafeView style={styles.container} backgroundColor="#F8FAFC">
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" translucent={false} />
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <ArrowLeft size={24} color="#1E293B" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{categoryName}</Text>
        <TouchableOpacity 
          style={styles.filterButton}
          onPress={() => setShowFilterModal(true)}
        >
          <Filter size={24} color="#1E293B" />
        </TouchableOpacity>
      </View>

      {/* Location Loading Indicator - Modal Popup */}
      <LocationLoadingIndicator 
        visible={isLoadingLocation}
        text={t('location.fetching') || 'Fetching your location...'}
      />

      <View style={styles.searchContainer}>
        <Search size={20} color="#94A3B8" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder={t('serviceListing.searchPlaceholder', { category: categoryName.toLowerCase() })}
          placeholderTextColor="#94A3B8"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Labour Access Status */}
      {(categoryName.toLowerCase().includes('labors') || categoryName.toLowerCase().includes('labour')) && (
        <View style={styles.labourAccessContainer}>
          {labourAccessStatus?.hasAccess ? (
            <View style={styles.accessActiveContainer}>
              <View style={styles.accessActiveHeader}>
                <Lock size={20} color="#10B981" />
                <Text style={styles.accessActiveTitle}>Labour Service Access Active</Text>
              </View>
              <Text style={styles.accessActiveText}>
                {labourAccessStatus.daysRemaining > 0 
                  ? `${labourAccessStatus.daysRemaining} days remaining`
                  : 'Access expires today'
                }
              </Text>
            </View>
          ) : (
            <View style={styles.accessInactiveContainer}>
              <View style={styles.accessInactiveHeader}>
                <CreditCard size={20} color="#F59E0B" />
                <Text style={styles.accessInactiveTitle}>Labour Service Access Required</Text>
              </View>
              <Text style={styles.accessInactiveText}>
                Pay ₹99 for 7-day access to book labour services
              </Text>
              <TouchableOpacity 
                style={styles.payNowButton}
                onPress={() => setShowLabourPaymentModal(true)}
              >
                <Text style={styles.payNowButtonText}>Pay Now</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      <View style={styles.resultsHeader}>
        <Text style={styles.resultsCount}>
          {t('serviceListing.resultsFound', { count: (filteredProviders.length > 0 ? filteredProviders.length : uniqueProviders.length).toString(), category: categoryName.toLowerCase() })}
        </Text>
      </View>

      <FlatList
        data={filteredProviders.length > 0 ? filteredProviders : uniqueProviders}
        renderItem={renderProvider}
        keyExtractor={(item) => item.provider_service_id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        onEndReached={loadMoreProviders}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>{t('serviceListing.noResultsFound', { category: categoryName.toLowerCase() })}</Text>
            <Text style={styles.emptySubtext}>{t('serviceListing.tryAdjustingSearch')}</Text>
          </View>
        }
        ListFooterComponent={
          isLoadingMore ? (
            <View style={styles.loadingMoreContainer}>
              <ActivityIndicator size="small" color="#3B82F6" />
              <Text style={styles.loadingMoreText}>{t('serviceListing.loadingMore') || 'Loading more providers...'}</Text>
            </View>
          ) : hasMore ? null : providers.length > 0 ? (
            <View style={styles.endOfListContainer}>
              <Text style={styles.endOfListText}>{t('serviceListing.allProvidersLoaded') || 'All providers loaded'}</Text>
            </View>
          ) : null
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
          />
        }
      />

      {/* Modern Filter Modal */}
      <Modal
        visible={showFilterModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowFilterModal(false)}
      >
        <SafeView style={styles.modalContainer} backgroundColor="#F8FAFC">
          {/* Modern Header */}
          <View style={styles.modalHeader}>
            <TouchableOpacity 
              style={styles.modalCloseButton}
              onPress={() => setShowFilterModal(false)}
              activeOpacity={0.7}
            >
              <X size={getResponsiveSpacing(22, 24, 26)} color="#64748B" />
            </TouchableOpacity>
            <View style={styles.modalTitleContainer}>
              <Filter size={getResponsiveSpacing(20, 22, 24)} color="#3B82F6" />
              <Text style={styles.modalTitle}>{t('serviceListing.filters')}</Text>
            </View>
            <TouchableOpacity 
              style={styles.resetButton}
              onPress={resetFilters}
              activeOpacity={0.7}
            >
              <Text style={styles.resetText}>{t('serviceListing.reset')}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView 
            style={styles.modalContent}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.modalContentContainer}
          >
            {/* City Filter - Text Input with Autocomplete */}
            <View style={styles.filterSection}>
              <View style={styles.filterSectionHeader}>
                <MapPin size={getResponsiveSpacing(18, 20, 22)} color="#3B82F6" fill="#3B82F6" />
                <Text style={styles.filterTitle}>Filter by City</Text>
              </View>
              <View style={styles.cityInputWrapper}>
                <View style={styles.cityInputContainer}>
                  <MapPin 
                    size={getResponsiveSpacing(18, 20, 22)} 
                    color="#94A3B8" 
                    style={styles.cityInputIcon}
                  />
                  <TextInput
                    ref={cityInputRef}
                    style={styles.cityInput}
                    placeholder="Enter city name (e.g., Bangalore, Mumbai)"
                    placeholderTextColor="#94A3B8"
                    value={tempFilters.city}
                    onChangeText={(text) => {
                      // Always allow user typing - the flag only prevents useEffect interference
                      setTempFilters(prev => ({ ...prev, city: text }));
                      // Clear any pending timeout
                      if (citySuggestionTimeoutRef.current) {
                        clearTimeout(citySuggestionTimeoutRef.current);
                      }
                      // Only show suggestions if user is typing (not selecting)
                      if (!isSelectingCityRef.current) {
                        if (text.trim().length >= 2) {
                          setShowCitySuggestions(true);
                        } else {
                          setShowCitySuggestions(false);
                        }
                      }
                    }}
                    onFocus={() => {
                      // Clear any pending timeout
                      if (citySuggestionTimeoutRef.current) {
                        clearTimeout(citySuggestionTimeoutRef.current);
                      }
                      if (tempFilters.city && tempFilters.city.trim().length >= 2 && citySuggestions.length > 0) {
                        setShowCitySuggestions(true);
                      }
                    }}
                    onBlur={() => {
                      // Clear any existing timeout
                      if (citySuggestionTimeoutRef.current) {
                        clearTimeout(citySuggestionTimeoutRef.current);
                      }
                      // Use a longer delay to ensure suggestion tap registers first
                      citySuggestionTimeoutRef.current = setTimeout(() => {
                        // Double check if suggestions are still visible before hiding
                        if (showCitySuggestions) {
                          setShowCitySuggestions(false);
                        }
                        citySuggestionTimeoutRef.current = null;
                      }, 400);
                    }}
                    autoCapitalize="words"
                    autoCorrect={false}
                  />
                  {tempFilters.city ? (
                    <TouchableOpacity
                      style={styles.cityInputClearButton}
                      onPress={() => {
                        setTempFilters(prev => ({ ...prev, city: '' }));
                        setCitySuggestions([]);
                        setShowCitySuggestions(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <X size={getResponsiveSpacing(16, 18, 20)} color="#94A3B8" />
                    </TouchableOpacity>
                  ) : null}
                </View>
                
                {/* City Suggestions Dropdown */}
                {showCitySuggestions && citySuggestions.length > 0 && (
                  <View 
                    style={styles.citySuggestionsContainer}
                    onTouchStart={(e) => {
                      // Prevent the TextInput blur event from firing
                      e.stopPropagation();
                    }}
                    onStartShouldSetResponder={() => true}
                    onMoveShouldSetResponder={() => true}
                    onResponderGrant={() => {
                      // Clear timeout when user starts interacting with suggestions
                      if (citySuggestionTimeoutRef.current) {
                        clearTimeout(citySuggestionTimeoutRef.current);
                        citySuggestionTimeoutRef.current = null;
                      }
                    }}
                  >
                    {citySuggestions.map((city, index) => (
                      <Pressable
                        key={`${city}-${index}`}
                        style={({ pressed }) => [
                          styles.citySuggestionItem,
                          pressed && styles.citySuggestionItemPressed
                        ]}
                        onPress={() => {
                          // Mark that we're selecting from suggestions to prevent useEffect interference
                          isSelectingCityRef.current = true;
                          
                          // Clear the timeout to prevent hiding suggestions
                          if (citySuggestionTimeoutRef.current) {
                            clearTimeout(citySuggestionTimeoutRef.current);
                            citySuggestionTimeoutRef.current = null;
                          }
                          
                          // Update the city filter with the full city name
                          // Use a function to ensure we get the latest state
                          setTempFilters(prev => {
                            const updated = { ...prev, city: city };
                            return updated;
                          });
                          
                          // Clear suggestions list and hide dropdown immediately
                          setCitySuggestions([]);
                          setShowCitySuggestions(false);
                          
                          // Blur the input to dismiss keyboard
                          // Use requestAnimationFrame to ensure state update completes first
                          requestAnimationFrame(() => {
                            setTimeout(() => {
                              cityInputRef.current?.blur();
                              // Reset flag after a short delay to allow state to settle
                              setTimeout(() => {
                                isSelectingCityRef.current = false;
                              }, 100);
                            }, 50);
                          });
                        }}
                      >
                        <MapPin size={getResponsiveSpacing(16, 18, 20)} color="#3B82F6" />
                        <Text style={styles.citySuggestionText}>{city}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            </View>

            {/* Rating Filter */}
            <View style={styles.filterSection}>
              <View style={styles.filterSectionHeader}>
                <Star size={getResponsiveSpacing(18, 20, 22)} color="#F59E0B" fill="#F59E0B" />
                <Text style={styles.filterTitle}>{t('serviceListing.minimumRating')}</Text>
              </View>
              <View style={styles.filterOptionsContainer}>
                {[0, 3, 4, 4.5].map((rating) => (
                  <TouchableOpacity
                    key={rating}
                    style={[
                      styles.modernFilterOption,
                      styles.ratingOptionModern,
                      tempFilters.minRating === rating && styles.selectedFilterOption
                    ]}
                    onPress={() => setTempFilters(prev => ({ ...prev, minRating: rating }))}
                    activeOpacity={0.7}
                  >
                    <Star 
                      size={getResponsiveSpacing(14, 16, 18)} 
                      color={tempFilters.minRating === rating ? "#FFFFFF" : "#F59E0B"} 
                      fill={tempFilters.minRating === rating ? "#FFFFFF" : "#F59E0B"} 
                    />
                    <Text style={[
                      styles.modernFilterOptionText,
                      tempFilters.minRating === rating && styles.selectedFilterOptionText
                    ]}>
                      {rating === 0 ? t('serviceListing.any') : `${rating}+`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Experience Filter */}
            <View style={styles.filterSectionLast}>
              <View style={styles.filterSectionHeader}>
                <View style={styles.experienceIconContainer}>
                  <Text style={styles.experienceIconText}>👤</Text>
                </View>
                <Text style={styles.filterTitle}>{t('serviceListing.minimumExperience')}</Text>
              </View>
              <View style={styles.filterOptionsContainer}>
                {[0, 2, 5, 10, 15].map((exp) => (
                  <TouchableOpacity
                    key={exp}
                    style={[
                      styles.modernFilterOption,
                      tempFilters.experience === exp && styles.selectedFilterOption
                    ]}
                    onPress={() => setTempFilters(prev => ({ ...prev, experience: exp }))}
                    activeOpacity={0.7}
                  >
                    <Text style={[
                      styles.modernFilterOptionText,
                      tempFilters.experience === exp && styles.selectedFilterOptionText
                    ]}>
                      {exp === 0 ? t('serviceListing.any') : `${exp}+ ${t('serviceListing.years')}`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </ScrollView>

          {/* Modern Footer with Apply Button */}
          <View style={styles.modalFooter}>
            <TouchableOpacity 
              style={styles.modernApplyButton} 
              onPress={applyFilters}
              activeOpacity={0.8}
            >
              <Text style={styles.modernApplyButtonText}>{t('serviceListing.applyFilters')}</Text>
              <View style={styles.applyButtonIcon}>
                <Text style={styles.applyButtonArrow}>→</Text>
              </View>
            </TouchableOpacity>
          </View>
        </SafeView>
      </Modal>

      {/* Labour Payment Modal */}
      <Modal
        visible={showLabourPaymentModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowLabourPaymentModal(false)}
      >
        <SafeView style={styles.modalContainer} backgroundColor="#FFFFFF">
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Labour Service Access</Text>
            <TouchableOpacity onPress={() => setShowLabourPaymentModal(false)}>
              <X size={24} color="#64748B" />
            </TouchableOpacity>
          </View>
          
          <View style={styles.paymentModalContent}>
            <View style={styles.paymentInfoContainer}>
              <CreditCard size={48} color="#3B82F6" />
              <Text style={styles.paymentTitle}>Access Labour Services</Text>
              <Text style={styles.paymentDescription}>
                Pay ₹99 for 7-day access to book skilled labour services including loading, transportation, and site cleaning.
              </Text>
            </View>

            <View style={styles.paymentFeatures}>
              <View style={styles.featureItem}>
                <Text style={styles.featureIcon}>✓</Text>
                <Text style={styles.featureText}>7-day unlimited access</Text>
              </View>
              <View style={styles.featureItem}>
                <Text style={styles.featureIcon}>✓</Text>
                <Text style={styles.featureText}>Skilled labour providers</Text>
              </View>
              <View style={styles.featureItem}>
                <Text style={styles.featureIcon}>✓</Text>
                <Text style={styles.featureText}>Secure payment via Paytm</Text>
              </View>
              <View style={styles.featureItem}>
                <Text style={styles.featureIcon}>✓</Text>
                <Text style={styles.featureText}>Expiry reminder notifications</Text>
              </View>
            </View>

            <View style={styles.paymentSummary}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Labour Service Access (7 days)</Text>
                <Text style={styles.summaryValue}>₹99</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Processing Fee</Text>
                <Text style={styles.summaryValue}>₹0</Text>
              </View>
              <View style={[styles.summaryRow, styles.totalRow]}>
                <Text style={styles.totalLabel}>Total Amount</Text>
                <Text style={styles.totalValue}>₹99</Text>
              </View>
            </View>

            <TouchableOpacity 
              style={styles.payButton}
              onPress={() => {
                setShowLabourPaymentModal(false);
                router.push('/labour-payment' as any);
              }}
            >
              <Text style={styles.payButtonText}>Pay ₹99 for 7 Days Access</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.cancelButton}
              onPress={() => setShowLabourPaymentModal(false)}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </SafeView>
      </Modal>
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
    paddingHorizontal: getResponsiveSpacing(16, 20, 24),
    paddingTop: getResponsiveSpacing(2, 2, 4),
    paddingBottom: getResponsiveSpacing(8, 12, 16),
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
  filterButton: {
    padding: 4,
  },
  locationLoadingModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  locationLoadingModalContainer: {
    width: '85%',
    maxWidth: 400,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationLoadingContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: getResponsiveSpacing(24, 28, 32),
    borderWidth: 2,
    borderColor: '#3B82F6',
    width: '100%',
    ...Platform.select({
      ios: {
        shadowColor: '#3B82F6',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 16,
      },
      android: {
        elevation: 12,
      },
      web: {
        boxShadow: '0px 8px 24px rgba(59, 130, 246, 0.4)',
      },
    }),
    overflow: 'hidden',
    position: 'relative',
  },
  locationLoadingShimmer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(59, 130, 246, 0.05)',
    width: '50%',
  },
  locationLoadingContent: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  locationLoadingIconContainer: {
    position: 'relative',
    marginBottom: getResponsiveSpacing(16, 20, 24),
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationLoadingPulseDot: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  locationLoadingTextContainer: {
    alignItems: 'center',
    marginBottom: getResponsiveSpacing(20, 24, 28),
  },
  locationLoadingTitle: {
    fontSize: getResponsiveSpacing(18, 20, 22),
    color: '#1E293B',
    fontWeight: '700',
    marginBottom: getResponsiveSpacing(6, 8, 10),
    textAlign: 'center',
  },
  locationLoadingSubtitle: {
    fontSize: getResponsiveSpacing(13, 14, 15),
    color: '#64748B',
    fontWeight: '400',
    textAlign: 'center',
  },
  locationLoadingDots: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: getResponsiveSpacing(6, 8, 10),
  },
  locationLoadingDot: {
    width: getResponsiveSpacing(6, 7, 8),
    height: getResponsiveSpacing(6, 7, 8),
    borderRadius: getResponsiveSpacing(3, 3.5, 4),
    backgroundColor: '#3B82F6',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: getResponsiveSpacing(16, 20, 24),
    marginTop: getResponsiveSpacing(4, 4, 6),
    marginBottom: getResponsiveSpacing(8, 12, 16),
    paddingHorizontal: getResponsiveSpacing(12, 16, 20),
    borderRadius: 12,
    height: getResponsiveSpacing(44, 50, 56),
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
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    fontSize: getResponsiveSpacing(14, 16, 18),
    color: '#1E293B',
  },
  resultsHeader: {
    paddingHorizontal: getResponsiveSpacing(16, 20, 24),
    marginBottom: getResponsiveSpacing(8, 12, 16),
  },
  resultsCount: {
    fontSize: getResponsiveSpacing(12, 14, 16),
    color: '#64748B',
    fontWeight: '500',
  },
  listContent: {
    paddingHorizontal: getResponsiveSpacing(16, 20, 24),
    paddingBottom: getResponsiveSpacing(16, 24, 32),
  },
  providerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: getResponsiveSpacing(12, 16, 20),
    overflow: 'hidden',
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
  cardHeader: {
    flexDirection: 'row',
    padding: getResponsiveSpacing(12, 16, 20),
    alignItems: 'flex-start',
  },
  providerImage: {
    width: getResponsiveSpacing(50, 60, 70),
    height: getResponsiveSpacing(50, 60, 70),
    borderRadius: getResponsiveSpacing(25, 30, 35),
    marginRight: getResponsiveSpacing(10, 12, 14),
  },
  providerInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  providerName: {
    fontSize: getResponsiveSpacing(14, 16, 18),
    fontWeight: '600',
    color: '#1E293B',
    marginRight: getResponsiveSpacing(6, 8, 10),
  },
  verifiedBadge: {
    backgroundColor: '#10B981',
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifiedText: {
    fontSize: getResponsiveSpacing(12, 14, 16),
    color: '#1E293B',
    fontWeight: '500',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  rating: {
    fontSize: getResponsiveSpacing(12, 14, 16),
    fontWeight: '500',
    color: '#1E293B',
    marginLeft: getResponsiveSpacing(3, 4, 5),
  },
  reviews: {
    fontSize: getResponsiveSpacing(10, 12, 14),
    color: '#94A3B8',
    marginLeft: getResponsiveSpacing(3, 4, 5),
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  location: {
    fontSize: getResponsiveSpacing(10, 12, 14),
    color: '#64748B',
    marginLeft: getResponsiveSpacing(3, 4, 5),
  },
  favoriteButton: {
    padding: 8,
  },
  cardBody: {
    paddingHorizontal: getResponsiveSpacing(12, 16, 20),
    paddingBottom: getResponsiveSpacing(12, 16, 20),
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: getResponsiveSpacing(12, 16, 20),
    paddingVertical: getResponsiveSpacing(10, 12, 14),
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    paddingHorizontal: getResponsiveSpacing(10, 12, 14),
  },
  detailItem: {
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: getResponsiveSpacing(10, 12, 14),
    color: '#64748B',
    marginBottom: getResponsiveSpacing(3, 4, 5),
  },
  detailValue: {
    fontSize: getResponsiveSpacing(12, 14, 16),
    fontWeight: '500',
    color: '#1E293B',
  },
  priceValue: {
    fontSize: getResponsiveSpacing(12, 14, 16),
    fontWeight: '600',
    color: '#3B82F6',
  },
  availabilityValue: {
    fontSize: getResponsiveSpacing(10, 12, 14),
    fontWeight: '500',
    color: '#10B981',
  },
  servicesSection: {
    marginBottom: getResponsiveSpacing(12, 16, 20),
  },
  servicesLabel: {
    fontSize: getResponsiveSpacing(12, 14, 16),
    fontWeight: '500',
    color: '#1E293B',
    marginBottom: getResponsiveSpacing(6, 8, 10),
  },
  servicesTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  serviceTag: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: getResponsiveSpacing(6, 8, 10),
    paddingVertical: getResponsiveSpacing(3, 4, 5),
    borderRadius: 6,
    marginRight: getResponsiveSpacing(6, 8, 10),
    marginBottom: getResponsiveSpacing(3, 4, 5),
  },
  serviceTagText: {
    fontSize: getResponsiveSpacing(10, 12, 14),
    color: '#3B82F6',
    fontWeight: '500',
  },
  moreServices: {
    fontSize: getResponsiveSpacing(10, 12, 14),
    color: '#64748B',
    fontStyle: 'italic',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  bookButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3B82F6',
    paddingVertical: getResponsiveSpacing(10, 12, 14),
    borderRadius: 8,
  },
  bookButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#64748B',
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#94A3B8',
  },
  // Modern Modal Styles
  modalContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: getResponsiveSpacing(20, 24, 28),
    paddingVertical: getResponsiveSpacing(18, 20, 22),
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  modalCloseButton: {
    width: getResponsiveSpacing(36, 40, 44),
    height: getResponsiveSpacing(36, 40, 44),
    borderRadius: getResponsiveSpacing(18, 20, 22),
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: getResponsiveSpacing(8, 10, 12),
    flex: 1,
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: getResponsiveSpacing(18, 20, 22),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  resetButton: {
    paddingHorizontal: getResponsiveSpacing(12, 14, 16),
    paddingVertical: getResponsiveSpacing(6, 8, 10),
    borderRadius: getResponsiveSpacing(8, 10, 12),
    backgroundColor: '#EFF6FF',
  },
  resetText: {
    fontSize: getResponsiveSpacing(14, 15, 16),
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
    color: '#3B82F6',
  },
  modalContent: {
    flex: 1,
  },
  modalContentContainer: {
    paddingHorizontal: getResponsiveSpacing(20, 24, 28),
    paddingTop: getResponsiveSpacing(24, 28, 32),
    paddingBottom: getResponsiveSpacing(100, 120, 140), // Extra padding for footer
  },
  filterSection: {
    marginBottom: getResponsiveSpacing(32, 36, 40),
    paddingBottom: getResponsiveSpacing(24, 28, 32),
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  filterSectionLast: {
    marginBottom: getResponsiveSpacing(32, 36, 40),
    paddingBottom: 0,
    borderBottomWidth: 0,
  },
  filterSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: getResponsiveSpacing(10, 12, 14),
    marginBottom: getResponsiveSpacing(16, 18, 20),
  },
  filterTitle: {
    fontSize: getResponsiveSpacing(16, 18, 20),
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  filterOptionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: getResponsiveSpacing(10, 12, 14),
  },
  modernFilterOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: getResponsiveSpacing(16, 18, 20),
    paddingVertical: getResponsiveSpacing(12, 14, 16),
    borderRadius: getResponsiveSpacing(12, 14, 16),
    borderWidth: 2,
    borderColor: '#E2E8F0',
    minHeight: getResponsiveSpacing(44, 48, 52),
    ...Platform.select({
      ios: {
        shadowColor: '#CBD5E1',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  selectedFilterOption: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
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
  modernFilterOptionText: {
    fontSize: getResponsiveSpacing(14, 15, 16),
    fontFamily: 'Inter-Medium',
    fontWeight: '500',
    color: '#475569',
    marginLeft: getResponsiveSpacing(6, 8, 10),
  },
  selectedFilterOptionText: {
    color: '#FFFFFF',
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
  },
  ratingOptionModern: {
    gap: getResponsiveSpacing(6, 8, 10),
  },
  experienceIconContainer: {
    width: getResponsiveSpacing(20, 22, 24),
    height: getResponsiveSpacing(20, 22, 24),
    alignItems: 'center',
    justifyContent: 'center',
  },
  experienceIconText: {
    fontSize: getResponsiveSpacing(16, 18, 20),
  },
  // City Filter Styles
  cityInputWrapper: {
    position: 'relative',
    zIndex: 10,
  },
  cityInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: getResponsiveSpacing(12, 14, 16),
    borderWidth: 2,
    borderColor: '#E2E8F0',
    paddingHorizontal: getResponsiveSpacing(14, 16, 18),
    paddingVertical: getResponsiveSpacing(4, 6, 8),
    minHeight: getResponsiveSpacing(48, 52, 56),
    ...Platform.select({
      ios: {
        shadowColor: '#CBD5E1',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  cityInputIcon: {
    marginRight: getResponsiveSpacing(10, 12, 14),
  },
  cityInput: {
    flex: 1,
    fontSize: getResponsiveSpacing(15, 16, 17),
    fontFamily: 'Inter-Regular',
    fontWeight: '400',
    color: '#1E293B',
    paddingVertical: getResponsiveSpacing(8, 10, 12),
  },
  cityInputClearButton: {
    padding: getResponsiveSpacing(4, 6, 8),
    marginLeft: getResponsiveSpacing(8, 10, 12),
    borderRadius: getResponsiveSpacing(12, 14, 16),
    backgroundColor: '#F1F5F9',
  },
  citySuggestionsContainer: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: getResponsiveSpacing(4, 6, 8),
    backgroundColor: '#FFFFFF',
    borderRadius: getResponsiveSpacing(12, 14, 16),
    borderWidth: 1,
    borderColor: '#E2E8F0',
    maxHeight: getResponsiveSpacing(200, 240, 280),
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
    zIndex: 1000,
  },
  citySuggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: getResponsiveSpacing(14, 16, 18),
    paddingVertical: getResponsiveSpacing(12, 14, 16),
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
    gap: getResponsiveSpacing(10, 12, 14),
  },
  citySuggestionItemPressed: {
    backgroundColor: '#F1F5F9',
  },
  citySuggestionText: {
    fontSize: getResponsiveSpacing(15, 16, 17),
    fontFamily: 'Inter-Medium',
    fontWeight: '500',
    color: '#1E293B',
    flex: 1,
  },
  modalFooter: {
    paddingHorizontal: getResponsiveSpacing(20, 24, 28),
    paddingTop: getResponsiveSpacing(16, 18, 20),
    paddingBottom: getResponsiveSpacing(20, 24, 28),
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  modernApplyButton: {
    backgroundColor: '#3B82F6',
    borderRadius: getResponsiveSpacing(14, 16, 18),
    paddingVertical: getResponsiveSpacing(16, 18, 20),
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: getResponsiveSpacing(10, 12, 14),
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
  modernApplyButtonText: {
    fontSize: getResponsiveSpacing(16, 17, 18),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  applyButtonIcon: {
    width: getResponsiveSpacing(24, 26, 28),
    height: getResponsiveSpacing(24, 26, 28),
    borderRadius: getResponsiveSpacing(12, 13, 14),
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyButtonArrow: {
    fontSize: getResponsiveSpacing(16, 18, 20),
    color: '#FFFFFF',
    fontWeight: '700',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#64748B',
    marginTop: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#EF4444',
    marginBottom: 16,
  },
  errorText: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#3B82F6',
    padding: 16,
    borderRadius: 8,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  // Labour Access Styles
  labourAccessContainer: {
    marginHorizontal: getResponsiveSpacing(16, 20, 24),
    marginBottom: getResponsiveSpacing(8, 12, 16),
  },
  accessActiveContainer: {
    backgroundColor: '#ECFDF5',
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#10B981',
  },
  accessActiveHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  accessActiveTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#065F46',
    marginLeft: 8,
  },
  accessActiveText: {
    fontSize: 14,
    color: '#047857',
  },
  accessInactiveContainer: {
    backgroundColor: '#FFFBEB',
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
  },
  accessInactiveHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  accessInactiveTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#92400E',
    marginLeft: 8,
  },
  accessInactiveText: {
    fontSize: 14,
    color: '#B45309',
    marginBottom: 12,
  },
  payNowButton: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  payNowButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  // Payment Modal Styles
  paymentModalContent: {
    flex: 1,
    padding: 20,
  },
  paymentInfoContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  paymentTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1E293B',
    marginTop: 12,
    marginBottom: 8,
  },
  paymentDescription: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
  },
  paymentFeatures: {
    marginBottom: 24,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  featureIcon: {
    fontSize: 16,
    color: '#10B981',
    marginRight: 12,
    fontWeight: '600',
  },
  featureText: {
    fontSize: 14,
    color: '#374151',
  },
  paymentSummary: {
    backgroundColor: '#F9FAFB',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1E293B',
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 8,
    marginTop: 8,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
  },
  totalValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#059669',
  },
  payButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  payButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  cancelButton: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#374151',
  },
  loadingMoreContainer: {
    paddingVertical: getResponsiveSpacing(16, 20, 24),
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: getResponsiveSpacing(8, 10, 12),
  },
  loadingMoreText: {
    fontSize: getResponsiveSpacing(13, 14, 15),
    color: '#64748B',
    fontFamily: 'Inter-Medium',
  },
  endOfListContainer: {
    paddingVertical: getResponsiveSpacing(16, 20, 24),
    alignItems: 'center',
    justifyContent: 'center',
  },
  endOfListText: {
    fontSize: getResponsiveSpacing(12, 13, 14),
    color: '#94A3B8',
    fontFamily: 'Inter-Regular',
  },
});
