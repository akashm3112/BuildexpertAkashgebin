import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  FlatList,
  Dimensions,
  Platform,
  TextInput,
  Modal as RNModal,
  Pressable,
  ActivityIndicator,
  StatusBar,
  ScrollView,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { MapPin, Search, CheckCircle, Clock } from 'lucide-react-native';
import { SERVICE_CATEGORIES } from '@/constants/serviceCategories';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '@/constants/api';
import { SafeView } from '@/components/SafeView';
import { Modal } from '@/components/common/Modal';
import io from 'socket.io-client';

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

const ServiceCard = ({ item, onPress, isRegistered, getServiceName, itemWidth }: any) => {
  // Add null checks to prevent errors
  if (!item || !item.id) {
    return null;
  }
  
  const serviceName = getServiceName(item.id);
  
  // Get service details from SERVICE_CATEGORIES to check if it's free
  const serviceDetails = SERVICE_CATEGORIES.find(service => service.id === item.id);
  const isFreeService = serviceDetails?.basePrice === 0; // Check if service is free
  
  return (
    <View style={[styles.categoryWrapper, { width: itemWidth }]}>
      <TouchableOpacity
        style={styles.categoryItem}
        activeOpacity={0.8}
        onPress={onPress}
      >
        <View style={styles.imageContainer}>
          <Image
            source={typeof item.image === 'string' ? { uri: item.image } : item.image}
            style={styles.categoryImage}
            resizeMode="cover"
          />
      {/* Registered Checkmark */}
      {isRegistered && (
        <View style={[styles.tickIconBox, isFreeService && styles.tickIconBoxWithFreeBadge]}>
              <CheckCircle size={14} color="#FFFFFF" />
        </View>
      )}
      
      {/* Free Badge */}
      {isFreeService && (
        <View style={[styles.freeBadge, isRegistered && styles.freeBadgeWithCheckmark]}>
          <Text style={styles.freeBadgeText}>FREE</Text>
        </View>
      )}
        </View>
      </TouchableOpacity>
      <View style={styles.categoryContent}>
        <View style={styles.categoryNameContainer}>
          <Text style={styles.categoryName} numberOfLines={2}>
          {serviceName || 'Unknown Service'}
        </Text>
      </View>
      </View>
    </View>
  );
};

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useLanguage();
  const { width: screenWidth } = useWindowDimensions();
  const [search, setSearch] = useState('');
  
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchSuggestions, setSearchSuggestions] = useState<string[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [filteredServices, setFilteredServices] = useState(SERVICE_CATEGORIES);
  
  const [location, setLocation] = useState('Loading location...');
  const [modalVisible, setModalVisible] = useState(false);
  const [addressModalVisible, setAddressModalVisible] = useState(false);
  const [newLocationName, setNewLocationName] = useState('');
  const [newLocationAddress, setNewLocationAddress] = useState('');
  const [savedLocations, setSavedLocations] = useState([
    { label: 'Home', address: '147, 12th cross, Rachenahalli, Yelahanka, Bengaluru', type: 'home' },
    { label: 'Office', address: 'Tech Park, Whitefield, Bengaluru', type: 'office' },
    { label: 'Current Location', address: 'Using device location', type: 'current' },
  ]);
  const [selectedLocation, setSelectedLocation] = useState('current');
  const [registeredServices, setRegisteredServices] = useState<string[]>([]);
  const [isLoadingServices, setIsLoadingServices] = useState(true);
  const [earnings, setEarnings] = useState({
    thisMonth: '₹0',
    today: '₹0',
    pending: '₹0',
  });
  const [isLoadingEarnings, setIsLoadingEarnings] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Socket connection
  const socketRef = useRef<any>(null);
  const [socketConnected, setSocketConnected] = useState(false);

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

  const getServiceName = (serviceId: string) => {
    if (!serviceId) return 'Unknown Service';
    try {
      return t(`serviceCategories.${serviceId}`);
    } catch (error) {
      return 'Unknown Service';
    }
  };

  const loadLocationPreferences = async () => {
    try {
      const savedLocationsData = await AsyncStorage.getItem('savedLocations');
      const selectedLocationData = await AsyncStorage.getItem('selectedLocation');
      const currentLocationData = await AsyncStorage.getItem('currentLocation');

      let locations = [
        { label: 'Home', address: '147, 12th cross, Rachenahalli, Yelahanka, Bengaluru', type: 'home' },
        { label: 'Office', address: 'Tech Park, Whitefield, Bengaluru', type: 'office' },
        { label: 'Current Location', address: 'Using device location', type: 'current' },
      ];
      
      if (savedLocationsData) {
        locations = JSON.parse(savedLocationsData);
        setSavedLocations(locations);
      }

      if (selectedLocationData) {
        const selectedType = JSON.parse(selectedLocationData);
        setSelectedLocation(selectedType);
        
        // Find the selected location and set it as current
        const selectedLoc = locations.find((loc: any) => loc.type === selectedType);
        if (selectedLoc) {
          setLocation(selectedLoc.address);
        } else {
          setSelectedLocation('current');
          setLocation('Current Location');
        }
      } else {
        // Default to current location
        setSelectedLocation('current');
        if (currentLocationData) {
          const currentLoc = JSON.parse(currentLocationData);
          setLocation(currentLoc);
        } else {
          setLocation('Current Location');
        }
      }
    } catch (error) {
      console.error('Error loading location preferences:', error);
      // Set default values
      setSelectedLocation('current');
      setLocation('Current Location');
    }
  };

  const saveLocationPreferences = async (locations: any[], selectedType: string, currentLocation: string) => {
    try {
      await AsyncStorage.setItem('savedLocations', JSON.stringify(locations));
      await AsyncStorage.setItem('selectedLocation', JSON.stringify(selectedType));
      await AsyncStorage.setItem('currentLocation', JSON.stringify(currentLocation));
    } catch (error) {
      console.error('Error saving location preferences:', error);
    }
  };

  // Load saved location preferences
  useEffect(() => {
    loadLocationPreferences();
  }, []);

  // Debug selectedLocation changes
  useEffect(() => {
    
  }, [selectedLocation, location]);

  // Handle orientation changes for responsive design
  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', () => {
      // Force re-render when orientation changes
      // The responsive utilities will automatically adjust
    });

    return () => subscription?.remove();
  }, []);

  useEffect(() => {
    if (user?.id) {
      // Wait a bit to ensure tokens are loaded
      const timer = setTimeout(() => {
        fetchRegisteredServices();
        // Initial earnings fetch (only once on mount)
        fetchEarnings();
      }, 100);
      
      // Setup socket connection for real-time updates
      if (!socketRef.current) {
        socketRef.current = io(API_BASE_URL, {
          transports: ['websocket', 'polling'],
          timeout: 20000,
          forceNew: true,
          reconnection: true,
          reconnectionAttempts: 5,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000
        });
        
        // Socket connection events
        socketRef.current.on('connect', () => {
          setSocketConnected(true);
        });

        socketRef.current.on('disconnect', (reason: string) => {
          setSocketConnected(false);
          
          // Auto-reconnect for certain disconnect reasons
          if (reason === 'io server disconnect') {
            // Server initiated disconnect, try to reconnect
            socketRef.current.connect();
          }
        });

        socketRef.current.on('connect_error', (error: any) => {
          console.error('🔌 Socket connection error:', error);
          setSocketConnected(false);
          
          // Show user-friendly error message only for persistent errors
          if (error.type === 'TransportError' || error.message.includes('xhr poll error')) {
          }
        });

        socketRef.current.on('reconnect', (attemptNumber: number) => {
          setSocketConnected(true);
        });

        socketRef.current.on('reconnect_error', (error: any) => {
          console.error('🔌 Socket reconnection error:', error);
        });

        socketRef.current.on('reconnect_failed', () => {
          console.error('🔌 Socket reconnection failed after all attempts');
          setSocketConnected(false);
        });
        
        // Join user's room
        socketRef.current.emit('join', user.id);
        
        // Listen for real-time earnings updates
        socketRef.current.on('earnings_updated', (data: any) => {
          if (data.status === 'success' && data.data.earnings) {
            setEarnings(data.data.earnings);
            setIsLoadingEarnings(false); // Stop loading when we get real-time data
          }
        });

        // Listen for booking updates that might affect earnings
        socketRef.current.on('booking_updated', (data: any) => {
          // Earnings will be updated via earnings_updated event
        });
      }
      
      // Cleanup function
      return () => {
        clearTimeout(timer);
        if (socketRef.current) {
          socketRef.current.removeAllListeners();
          socketRef.current.disconnect();
          socketRef.current = null;
        }
      };
    }
    
    // Cleanup when user is not available
    return () => {
      if (socketRef.current) {
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [user]);

  useFocusEffect(
    React.useCallback(() => {
      if (user?.id) {
        // Only fetch registered services on focus, earnings are handled by sockets
        fetchRegisteredServices();
      }
      // Reload location preferences when screen comes into focus
      loadLocationPreferences();
      // Load recent searches
      loadRecentSearches();
    }, [user])
  );

  // Load recent searches from AsyncStorage
  const loadRecentSearches = async () => {
    try {
      const recent = await AsyncStorage.getItem('recent_searches');
      if (recent) {
        setRecentSearches(JSON.parse(recent));
      }
    } catch (error) {
    }
  };

  // Save search to recent searches
  const saveSearchToRecent = async (searchTerm: string) => {
    if (!searchTerm.trim()) return;
    
    try {
      const updated = [searchTerm, ...recentSearches.filter(s => s !== searchTerm)].slice(0, 5);
      setRecentSearches(updated);
      await AsyncStorage.setItem('recent_searches', JSON.stringify(updated));
    } catch (error) {
    }
  };

  // Generate search suggestions based on service categories
  const generateSearchSuggestions = (query: string) => {
    if (!query.trim()) return [];
    
    const suggestions = SERVICE_CATEGORIES
      .filter(category => category && category.id) // Add null check
      .filter(category => {
        const categoryName = t(`serviceCategories.${category.id}`).toLowerCase();
        const categoryId = category.id.toLowerCase();
        const queryLower = query.toLowerCase();
        
        return categoryName.includes(queryLower) || categoryId.includes(queryLower);
      })
      .map(category => t(`serviceCategories.${category.id}`))
      .slice(0, 5);
    
    return suggestions;
  };

  // Handle search input changes
  const handleSearchChange = (text: string) => {
    try {
      setSearch(text);
      
      if (text.trim()) {
        const suggestions = generateSearchSuggestions(text);
        setSearchSuggestions(suggestions);
        
        // Filter services based on search
        const filtered = SERVICE_CATEGORIES.filter(category => {
          if (!category || !category.id) {
            return false;
          }
          
          try {
            const categoryName = t(`serviceCategories.${category.id}`).toLowerCase();
            const categoryId = category.id.toLowerCase();
            const searchLower = text.toLowerCase();
            
            return categoryName.includes(searchLower) || categoryId.includes(searchLower);
          } catch (error) {
            return false;
          }
        });
        setFilteredServices(filtered);
      } else {
        setSearchSuggestions([]);
        setFilteredServices(SERVICE_CATEGORIES);
      }
    } catch (error) {
      setSearchSuggestions([]);
      setFilteredServices(SERVICE_CATEGORIES);
    }
  };

  // Handle search submission
  const handleSearchSubmit = () => {
    if (search.trim()) {
      saveSearchToRecent(search.trim());
      setSearchFocused(false);
      setSearchSuggestions([]);
    }
  };

  // Handle suggestion selection
  const handleSuggestionSelect = (suggestion: string) => {
    setSearch(suggestion);
    saveSearchToRecent(suggestion);
    setSearchFocused(false);
    setSearchSuggestions([]);
    
    // Filter services based on selected suggestion
    const filtered = SERVICE_CATEGORIES.filter(category => {
      if (!category || !category.id) return false;
      
      const categoryName = t(`serviceCategories.${category.id}`);
      return categoryName.toLowerCase().includes(suggestion.toLowerCase());
    });
    setFilteredServices(filtered);
  };

  // Handle recent search selection
  const handleRecentSearchSelect = (recentSearch: string) => {
    setSearch(recentSearch);
    saveSearchToRecent(recentSearch);
    setSearchFocused(false);
    
    // Filter services based on recent search
    const filtered = SERVICE_CATEGORIES.filter(category => {
      if (!category || !category.id) return false;
      
      const categoryName = t(`serviceCategories.${category.id}`);
      return categoryName.toLowerCase().includes(recentSearch.toLowerCase());
    });
    setFilteredServices(filtered);
  };

  // Clear recent searches
  const clearRecentSearches = async () => {
    try {
      setRecentSearches([]);
      await AsyncStorage.removeItem('recent_searches');
    } catch (error) {
    }
  };

  const fetchRegisteredServices = async () => {
    try {
      setIsLoadingServices(true);
      const { tokenManager } = await import('@/utils/tokenManager');
      const token = await tokenManager.getValidToken();
      
      if (!token) {
        setIsLoadingServices(false);
        return;
      }

      
      const response = await fetch(`${API_BASE_URL}/api/services/my-registrations`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });


      if (response.ok) {
        const data = await response.json();
        
        // Map service names to frontend category IDs
        const serviceNameToCategoryMap: { [key: string]: string } = {
          'labors': 'labor',
          'plumber': 'plumber',
          'mason-mastri': 'mason-mastri',
          'painting-cleaning': 'painting-cleaning',
          'granite-tiles': 'granite-tiles',
          'engineer-interior': 'engineer-interior',
          'electrician': 'electrician',
          'carpenter': 'carpenter',
          'painter': 'painter',
          'interiors-building': 'interiors-building',
          'stainless-steel': 'stainless-steel',
          'contact-building': 'contact-building',
          'glass-mirror': 'glass-mirror'
        };

        const registeredCategoryIds = data.data.registeredServices.map((service: any) => {
          const categoryId = serviceNameToCategoryMap[service.service_name];
          return categoryId;
        }).filter(Boolean);

        setRegisteredServices(registeredCategoryIds);
      } else {
        const errorText = await response.text();
        
      }
    } catch (error) {
      console.error('Error fetching registered services:', error);
    } finally {
      setIsLoadingServices(false);
    }
  };

  const fetchEarnings = async () => {
    try {
      setIsLoadingEarnings(true);
      const { tokenManager } = await import('@/utils/tokenManager');
      const token = await tokenManager.getValidToken();
      
      if (!token) {
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/earnings`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        
        if (data.status === 'success' && data.data.earnings) {
          setEarnings(data.data.earnings);
        }
      } else {
        // Set default values if API fails
        setEarnings({
          thisMonth: '₹0',
          today: '₹0',
          pending: '₹0',
        });
      }
    } catch (error) {
      console.error('Error fetching earnings:', error);
      // Set default values if there's an error
      setEarnings({
        thisMonth: '₹0',
        today: '₹0',
        pending: '₹0',
      });
    } finally {
      setIsLoadingEarnings(false);
    }
  };

  const handleServicePress = (serviceId: string) => {
    if (!serviceId) {
      return;
    }
    
    const isRegistered = registeredServices.includes(serviceId);
    if (isRegistered) {
      showAlert(
        'Service Already Registered', 
        'You have already registered for this service. You cannot register for the same service multiple times.',
        'info',
        [{ text: 'OK', onPress: () => {
          setShowAlertModal(false);
        }, style: 'primary' }]
      );
      return;
    }
    router.push(`/service-registration/${serviceId}`);
  };

  const handleLocationPinPress = () => {
    setModalVisible(true);
  };

  const handleUseCurrentLocation = async () => {
    setModalVisible(false);
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        showAlert(t('alerts.permissionDenied'), t('alerts.locationPermissionRequired'), 'error', [
          { text: 'OK', onPress: () => {
            setShowAlertModal(false);
          }, style: 'primary' }
        ]);
        return;
      }
      let loc = await Location.getCurrentPositionAsync({});
      let geocode = await Location.reverseGeocodeAsync(loc.coords);
      if (geocode && geocode.length > 0) {
        const addr = `${geocode[0].name || ''} ${geocode[0].street || ''}, ${geocode[0].city || ''}, ${geocode[0].region || ''}`;
        setLocation(addr);
        setSelectedLocation('current');
        const updatedLocations = savedLocations.map(l => l.type === 'current' ? { ...l, address: addr } : l);
        setSavedLocations(updatedLocations);
        await saveLocationPreferences(updatedLocations, 'current', addr);
      } else {
        setLocation('Current Location');
        setSelectedLocation('current');
        await saveLocationPreferences(savedLocations, 'current', 'Current Location');
      }
    } catch (e) {
      console.error('📍 Error getting current location:', e);
      showAlert(t('alerts.error'), t('alerts.couldNotFetchLocation'), 'error', [
        { text: 'OK', onPress: () => {
          setShowAlertModal(false);
        }, style: 'primary' }
      ]);
    }
  };

  const handleSaveAddress = () => {
    setModalVisible(false);
    setNewLocationName('');
    setNewLocationAddress('');
    setAddressModalVisible(true);
  };

  const handleAddressSubmit = async () => {
    if (!newLocationName.trim() || !newLocationAddress.trim()) {
      showAlert(t('alerts.invalidAddress'), t('alerts.enterLocationAndAddress'), 'error', [
        { text: 'OK', onPress: () => {
          setShowAlertModal(false);
        }, style: 'primary' }
      ]);
      return;
    }
    const newLocation = { label: newLocationName, address: newLocationAddress, type: `custom${savedLocations.length}` };
    const updatedLocations = [...savedLocations, newLocation];
    
    setSavedLocations(updatedLocations);
    setLocation(newLocationAddress);
    setSelectedLocation(newLocation.type);
    setNewLocationName('');
    setNewLocationAddress('');
    setAddressModalVisible(false);
    
    await saveLocationPreferences(updatedLocations, newLocation.type, newLocationAddress);
  };

  const handleSelectLocation = async (loc: any) => {
    
    setSelectedLocation(loc.type);
    setLocation(loc.address);
    setModalVisible(false);
    await saveLocationPreferences(savedLocations, loc.type, loc.address);
  };

  // Handle refresh
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      // Refresh both registered services and earnings
      await Promise.all([
        fetchRegisteredServices(),
        fetchEarnings()
      ]);
    } catch (error) {
      console.error('Error refreshing data:', error);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <SafeView backgroundColor="#F9FAFB">
      <StatusBar barStyle="dark-content" backgroundColor="#F9FAFB" />
      <ScrollView 
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled={true}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={['#3B82F6']} // Android
            tintColor="#3B82F6" // iOS
            title="Pull to refresh" // iOS
            titleColor="#6B7280" // iOS
          />
        }
      >
        {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
            {(() => {
              let title;
              if (selectedLocation === 'current') {
                title = 'Home';
              } else if (selectedLocation === 'home') {
                title = 'Home';
              } else if (selectedLocation === 'office') {
                title = 'Office';
              } else {
                const selectedLoc = savedLocations.find(loc => loc.type === selectedLocation);
                title = selectedLoc?.label || 'Home';
              }
              return title;
            })()}
          </Text>
          <View style={styles.locationRow}>
            <Text style={styles.locationText} numberOfLines={1} ellipsizeMode="tail">
              {location || 'No location set'}
            </Text>
          </View>
        </View>
        <TouchableOpacity style={styles.locationButton} onPress={handleLocationPinPress}>
          <MapPin size={20} color="#3B82F6" />
        </TouchableOpacity>
      </View>

      {/* Enhanced Search Bar */}
      <View style={styles.searchContainer}>
        <View style={[styles.searchBar, searchFocused && styles.searchBarFocused]}>
          <Search size={18} color={searchFocused ? "#3B82F6" : "#9CA3AF"} style={{ marginLeft: 12 }} />
          <TextInput
            style={styles.searchInput}
            placeholder={t('home.searchPlaceholder')}
            placeholderTextColor="#9CA3AF"
            value={search}
            onChangeText={handleSearchChange}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
            onSubmitEditing={handleSearchSubmit}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {search.length > 0 && (
            <TouchableOpacity 
              style={styles.clearButton}
              onPress={() => {
                setSearch('');
                setSearchSuggestions([]);
                setFilteredServices(SERVICE_CATEGORIES);
              }}
            >
              <Text style={styles.clearButtonText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Search Suggestions and Recent Searches */}
        {searchFocused && (
          <View style={styles.searchDropdown}>
            {search.length > 0 && searchSuggestions.length > 0 && (
              <View style={styles.suggestionsSection}>
                <Text style={styles.sectionLabel}>{t('home.searchSuggestions')}</Text>
                {searchSuggestions.map((suggestion, index) => (
                  <TouchableOpacity
                    key={index}
                    style={styles.suggestionItem}
                    onPress={() => handleSuggestionSelect(suggestion)}
                  >
                    <Search size={16} color="#6B7280" style={{ marginRight: 12 }} />
                    <Text style={styles.suggestionText} numberOfLines={1} ellipsizeMode="tail">
                      {suggestion}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {search.length === 0 && recentSearches.length > 0 && (
              <View style={styles.recentSearchesSection}>
                <View style={styles.recentHeader}>
                  <Text style={styles.sectionLabel}>{t('home.recentSearches')}</Text>
                  <TouchableOpacity onPress={clearRecentSearches}>
                    <Text style={styles.clearRecentText}>{t('home.clearAll')}</Text>
                  </TouchableOpacity>
                </View>
                {recentSearches.map((recentSearch, index) => (
                  <TouchableOpacity
                    key={index}
                    style={styles.recentSearchItem}
                    onPress={() => handleRecentSearchSelect(recentSearch)}
                  >
                    <Clock size={16} color="#6B7280" style={{ marginRight: 12 }} />
                    <Text style={styles.recentSearchText} numberOfLines={1} ellipsizeMode="tail">
                      {recentSearch}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {search.length === 0 && recentSearches.length === 0 && (
              <View style={styles.emptySearchState}>
                <Text style={styles.emptySearchText}>{t('home.searchForServices')}</Text>
                <Text style={styles.emptySearchSubtext}>{t('home.searchSubtext')}</Text>
              </View>
            )}
          </View>
        )}
      </View>
      
      {/* Earnings Overview */}
      <View style={styles.earningsHeader}>
        <Text style={styles.sectionTitle}>{t('home.earningsOverview')}</Text>
        {socketConnected && (
          <View style={styles.realtimeIndicator}>
            <View style={styles.realtimeDot} />
            <Text style={styles.realtimeText}>Live</Text>
          </View>
        )}
      </View>
      <View style={styles.earningsCard}>
        <View style={styles.earningBox}>
          {isLoadingEarnings ? (
            <ActivityIndicator size="small" color="#10B981" />
          ) : (
            <Text style={styles.earningAmount}>{earnings.thisMonth}</Text>
          )}
          <Text style={styles.earningLabel}>{t('home.thisMonth')}</Text>
        </View>
        <View style={styles.earningBox}>
          {isLoadingEarnings ? (
            <ActivityIndicator size="small" color="#10B981" />
          ) : (
            <Text style={styles.earningAmount}>{earnings.today}</Text>
          )}
          <Text style={styles.earningLabel}>{t('home.today')}</Text>
        </View>
        <View style={styles.earningBox}>
          {isLoadingEarnings ? (
            <ActivityIndicator size="small" color="#10B981" />
          ) : (
            <Text style={styles.earningAmount}>{earnings.pending}</Text>
          )}
          <Text style={styles.earningLabel}>{t('home.pending')}</Text>
        </View>
      </View>
      
      {/* Spacer for consistent gap */}
      <View style={{ height: 12 }} />
      {/* Grid */}
      <View style={styles.gridContainer}>
        {(() => {
          const numColumns = 3;
          const itemWidth = (screenWidth - 40 - (numColumns - 1) * 12) / numColumns;
          const rows = [];
          
          for (let i = 0; i < filteredServices.length; i += numColumns) {
            const rowItems = filteredServices.slice(i, i + numColumns);
            const isLastRow = i + numColumns >= filteredServices.length;
            const hasSingleItem = isLastRow && rowItems.length === 1;
          
            rows.push(
            <View 
                key={i}
              style={[
                  styles.row,
                  hasSingleItem && styles.centeredRow
              ]}
            >
                {rowItems.map((item) => {
                if (!item || !item.id) return null;
                
                const isRegistered = registeredServices.includes(item.id);
                return (
                  <ServiceCard
                    key={item.id}
                    item={item}
                    onPress={() => handleServicePress(item.id)}
                    isRegistered={isRegistered}
                    getServiceName={getServiceName}
                      itemWidth={itemWidth}
                  />
                );
              })}
            </View>
          );
          }
          return rows;
        })()}
        {filteredServices.length === 0 && (
          <View style={styles.emptySearchResults}>
            <Search size={48} color="#9CA3AF" />
            <Text style={styles.emptySearchResultsTitle}>{t('home.noResultsFound')}</Text>
            <Text style={styles.emptySearchResultsSubtext}>{t('home.tryDifferentSearch')}</Text>
          </View>
        )}
      </View>

      {/* Location Modal */}
      <RNModal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <Pressable style={styles.bottomSheetOverlay} onPress={() => setModalVisible(false)}>
          <Pressable style={styles.bottomSheet} onPress={() => {}}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{t('home.selectLocation')}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Text style={styles.sheetClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.currentLocationBtn} onPress={handleUseCurrentLocation}>
              <MapPin size={18} color="#3B82F6" style={{ marginRight: 8 }} />
              <Text style={styles.currentLocationText}>{t('home.useCurrentLocation')}</Text>
            </TouchableOpacity>
            <View style={styles.savedLocationsHeader}>
              <Text style={styles.savedLocationsTitle}>{t('home.savedLocations')}</Text>
              <TouchableOpacity onPress={handleSaveAddress}>
                <Text style={styles.addLocationBtn}>＋</Text>
              </TouchableOpacity>
            </View>
            {savedLocations.map((loc, idx) => (
              <TouchableOpacity
                key={loc.type}
                style={[styles.locationCard, selectedLocation === loc.type && styles.locationCardSelected]}
                onPress={() => handleSelectLocation(loc)}
                activeOpacity={0.8}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={styles.locationCardLabel}>{loc.label}</Text>
                  {selectedLocation === loc.type && <View style={styles.selectedDot} />}
                </View>
                <Text style={styles.locationCardAddress} numberOfLines={1}>{loc.address}</Text>
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </RNModal>
      {/* Address Input Modal */}
      <RNModal
        visible={addressModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setAddressModalVisible(false)}
      >
        <Pressable style={styles.bottomSheetOverlay} onPress={() => setAddressModalVisible(false)}>
          <Pressable style={styles.addLocationSheet} onPress={() => {}}>
            <View style={styles.addLocationHeader}>
              <Text style={styles.addLocationTitle}>{t('home.addNewLocation')}</Text>
              <TouchableOpacity onPress={() => setAddressModalVisible(false)}>
                <Text style={styles.addLocationClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.addLocationLabel}>{t('home.locationName')}</Text>
            <TextInput
              style={styles.addLocationInput}
              placeholder={t('home.locationNamePlaceholder')}
              value={newLocationName}
              onChangeText={setNewLocationName}
            />
            <Text style={styles.addLocationLabel}>{t('home.address')}</Text>
            <TextInput
              style={[styles.addLocationInput, { minHeight: 48 }]}
              placeholder={t('home.addressPlaceholder')}
              value={newLocationAddress}
              onChangeText={setNewLocationAddress}
              multiline
            />
            <TouchableOpacity
              style={styles.saveLocationBtn}
              onPress={handleAddressSubmit}
            >
              <Text style={styles.saveLocationBtnText}>{t('home.saveLocation')}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </RNModal>
             <Modal
         visible={showAlertModal}
         onClose={() => setShowAlertModal(false)}
         title={alertConfig.title}
         message={alertConfig.message}
         type={alertConfig.type}
         buttons={alertConfig.buttons        }
      />
      </ScrollView>
    </SafeView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: getResponsiveSpacing(12, 14, 16),
    paddingTop: getResponsiveSpacing(8, 10, 12),
    paddingBottom: getResponsiveSpacing(4, 5, 6),
  },
  title: {
    fontSize: getResponsiveSpacing(22, 24, 26),
    fontWeight: '700',
    color: '#1E293B',
    flexShrink: 1,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: getResponsiveSpacing(1, 2, 3),
  },
  locationText: {
    fontSize: getResponsiveSpacing(11, 12, 13),
    color: '#6B7280',
    maxWidth: '85%',
    flexShrink: 1,
  },
  locationButton: {
    backgroundColor: '#E0E7FF',
    padding: getResponsiveSpacing(8, 9, 10),
    borderRadius: getResponsiveSpacing(24, 26, 30),
    minWidth: getResponsiveSpacing(44, 48, 52),
    minHeight: getResponsiveSpacing(44, 48, 52),
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchContainer: {
    position: 'relative',
    zIndex: 1000,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: getResponsiveSpacing(24, 26, 28),
    marginHorizontal: getResponsiveSpacing(12, 14, 16),
    height: getResponsiveSpacing(40, 43, 46),
    marginTop: getResponsiveSpacing(8, 9, 10),
    marginBottom: getResponsiveSpacing(10, 11, 12),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  searchBarFocused: {
    borderColor: '#3B82F6',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  searchInput: {
    flex: 1,
    fontSize: getResponsiveSpacing(14, 15, 16),
    color: '#111827',
    marginLeft: getResponsiveSpacing(6, 7, 8),
    marginRight: getResponsiveSpacing(10, 11, 12),
  },
  clearButton: {
    width: getResponsiveSpacing(32, 36, 40),
    height: getResponsiveSpacing(32, 36, 40),
    borderRadius: getResponsiveSpacing(16, 18, 20),
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: getResponsiveSpacing(8, 9, 10),
  },
  clearButtonText: {
    fontSize: getResponsiveSpacing(14, 15, 16),
    color: '#6B7280',
    fontWeight: '600',
  },
  searchDropdown: {
    position: 'absolute',
    top: '100%',
    left: getResponsiveSpacing(12, 14, 16),
    right: getResponsiveSpacing(12, 14, 16),
    backgroundColor: '#FFFFFF',
    borderRadius: getResponsiveSpacing(12, 14, 16),
    marginTop: getResponsiveSpacing(4, 5, 6),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    maxHeight: getResponsiveSpacing(300, 350, 400),
  },
  suggestionsSection: {
    paddingVertical: getResponsiveSpacing(8, 10, 12),
  },
  recentSearchesSection: {
    paddingVertical: getResponsiveSpacing(8, 10, 12),
  },
  sectionLabel: {
    fontSize: getResponsiveSpacing(12, 13, 14),
    fontWeight: '600',
    color: '#374151',
    paddingHorizontal: getResponsiveSpacing(16, 18, 20),
    paddingVertical: getResponsiveSpacing(8, 9, 10),
    backgroundColor: '#F9FAFB',
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: getResponsiveSpacing(16, 18, 20),
    paddingVertical: getResponsiveSpacing(12, 14, 16),
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  suggestionText: {
    fontSize: getResponsiveSpacing(14, 15, 16),
    color: '#1F2937',
    flex: 1,
  },
  recentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: getResponsiveSpacing(16, 18, 20),
    paddingVertical: getResponsiveSpacing(8, 9, 10),
    backgroundColor: '#F9FAFB',
  },
  clearRecentText: {
    fontSize: getResponsiveSpacing(12, 13, 14),
    color: '#EF4444',
    fontWeight: '500',
  },
  recentSearchItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: getResponsiveSpacing(16, 18, 20),
    paddingVertical: getResponsiveSpacing(12, 14, 16),
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  recentSearchText: {
    fontSize: getResponsiveSpacing(14, 15, 16),
    color: '#1F2937',
    flex: 1,
  },
  emptySearchState: {
    paddingVertical: getResponsiveSpacing(24, 28, 32),
    paddingHorizontal: getResponsiveSpacing(16, 18, 20),
    alignItems: 'center',
  },
  emptySearchText: {
    fontSize: getResponsiveSpacing(16, 17, 18),
    fontWeight: '600',
    color: '#374151',
    marginBottom: getResponsiveSpacing(4, 5, 6),
  },
  emptySearchSubtext: {
    fontSize: getResponsiveSpacing(14, 15, 16),
    color: '#6B7280',
    textAlign: 'center',
  },
  emptySearchResults: {
    paddingVertical: getResponsiveSpacing(40, 48, 56),
    paddingHorizontal: getResponsiveSpacing(16, 18, 20),
    alignItems: 'center',
  },
  emptySearchResultsTitle: {
    fontSize: getResponsiveSpacing(18, 20, 22),
    fontWeight: '600',
    color: '#374151',
    marginTop: getResponsiveSpacing(16, 18, 20),
    marginBottom: getResponsiveSpacing(8, 9, 10),
  },
  emptySearchResultsSubtext: {
    fontSize: getResponsiveSpacing(14, 15, 16),
    color: '#6B7280',
    textAlign: 'center',
  },
  gridContainer: {
    paddingHorizontal: 20,
    paddingBottom: 0,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  centeredRow: {
    justifyContent: 'center',
  },
  categoryWrapper: {
    alignItems: 'center',
  },
  categoryItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
    height: 100,
    width: '100%',
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
  imageContainer: {
    height: 100,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  categoryImage: {
    width: '100%',
    height: '100%',
  },
  categoryContent: {
    paddingTop: 8,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  categoryName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    textAlign: 'center',
    lineHeight: 16,
  },
  categoryNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  sectionTitle: {
    fontSize: getResponsiveSpacing(16, 17, 18),
    fontWeight: '600',
    color: '#1F2937',
    marginLeft: getResponsiveSpacing(12, 14, 16),
    marginTop: getResponsiveSpacing(16, 18, 20),
    marginBottom: getResponsiveSpacing(10, 11, 12),
  },
  earningsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginRight: 16,
  },
  realtimeIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#10B981',
  },
  realtimeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
    marginRight: 4,
  },
  realtimeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#10B981',
  },
  earningsCard: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#fff',
    marginHorizontal: getResponsiveSpacing(12, 14, 16),
    marginBottom: getResponsiveSpacing(16, 18, 20),
    padding: getResponsiveSpacing(12, 14, 16),
    borderRadius: getResponsiveSpacing(10, 11, 12),
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
  },
  earningBox: {
    alignItems: 'center',
  },
  earningAmount: {
    fontSize: getResponsiveSpacing(16, 17, 18),
    fontWeight: '700',
    color: '#10B981',
  },
  earningLabel: {
    fontSize: getResponsiveSpacing(11, 12, 13),
    color: '#6B7280',
    marginTop: getResponsiveSpacing(3, 4, 5),
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    width: 280,
    alignItems: 'center',
    elevation: 5,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 18,
    color: '#1E293B',
  },
  modalButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 24,
    marginVertical: 6,
    width: '100%',
    alignItems: 'center',
  },
  modalButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
  addressInput: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 10,
    width: '100%',
    marginBottom: 14,
    fontSize: 15,
    color: '#1E293B',
  },
  bottomSheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.18)',
    justifyContent: 'flex-end',
  },
  bottomSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: getResponsiveSpacing(18, 20, 22),
    borderTopRightRadius: getResponsiveSpacing(18, 20, 22),
    paddingHorizontal: getResponsiveSpacing(16, 18, 20),
    paddingTop: getResponsiveSpacing(14, 16, 18),
    paddingBottom: getResponsiveSpacing(24, 28, 32),
    minHeight: getResponsiveSpacing(300, 320, 340),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 8,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
  },
  sheetClose: {
    fontSize: 22,
    color: '#6B7280',
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  currentLocationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 18,
  },
  currentLocationText: {
    color: '#3B82F6',
    fontWeight: '600',
    fontSize: 15,
  },
  savedLocationsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  savedLocationsTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1E293B',
  },
  addLocationBtn: {
    fontSize: 22,
    color: '#3B82F6',
    fontWeight: '700',
    paddingHorizontal: 4,
  },
  locationCard: {
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  locationCardSelected: {
    backgroundColor: '#E0E7FF',
  },
  locationCardLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1E293B',
    marginRight: 8,
  },
  selectedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3B82F6',
  },
  locationCardAddress: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  tickIconBox: {
    position: 'absolute',
    top: getResponsiveSpacing(6, 6, 6),
    right: getResponsiveSpacing(6, 6, 6),
    zIndex: 10,
    backgroundColor: '#10B981',
    borderRadius: getResponsiveSpacing(16, 16, 16),
    padding: getResponsiveSpacing(4, 4, 4),
    borderWidth: 3,
    borderColor: '#FFFFFF',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  freeBadge: {
    position: 'absolute',
    top: getResponsiveSpacing(6, 6, 6),
    right: getResponsiveSpacing(6, 6, 6),
    zIndex: 10,
    backgroundColor: '#10B981',
    borderRadius: getResponsiveSpacing(8, 8, 8),
    paddingHorizontal: getResponsiveSpacing(8, 8, 8),
    paddingVertical: getResponsiveSpacing(4, 4, 4),
    borderWidth: 2,
    borderColor: '#FFFFFF',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  freeBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    fontFamily: 'Inter-Bold',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  tickIconBoxWithFreeBadge: {
    top: getResponsiveSpacing(6, 6, 6),
    right: getResponsiveSpacing(6, 6, 6),
  },
  freeBadgeWithCheckmark: {
    top: getResponsiveSpacing(6, 6, 6),
    right: getResponsiveSpacing(50, 50, 50), // Move left to avoid overlap with checkmark
  },
  addLocationSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 32,
    minHeight: 320,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 8,
    width: '100%',
  },
  addLocationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  addLocationTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
  },
  addLocationClose: {
    fontSize: 22,
    color: '#6B7280',
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  addLocationLabel: {
    fontSize: 14,
    color: '#1E293B',
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 8,
  },
  addLocationInput: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: '#1E293B',
    backgroundColor: '#F9FAFB',
    marginBottom: 8,
  },
  saveLocationBtn: {
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 18,
  },
  saveLocationBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
    letterSpacing: 0.2,
  },
});
