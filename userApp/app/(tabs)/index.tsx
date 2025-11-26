import React, { useEffect, useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TextInput, 
  Dimensions, 
  Platform, 
  TouchableOpacity,
  Animated,
  Modal as RNModal,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Search, MapPin, X, Navigation, Edit2, Plus, Clock } from 'lucide-react-native';
import { router } from 'expo-router';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { useLabourAccess } from '@/context/LabourAccessContext';
import { Modal } from '@/components/common/Modal';
import { SafeView } from '@/components/SafeView';

import ServiceCategoryGrid from '@/components/home/ServiceCategoryGrid';
import FeaturedProviders from '@/components/home/FeaturedProviders';
import RecentBookings from '@/components/home/RecentBookings';
import { SERVICE_CATEGORIES } from '@/constants/serviceCategories';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Map new service IDs to old translation keys
const getServiceTranslationKey = (serviceId: string) => {
  const translationMap: { [key: string]: string } = {
    'engineer-interior': 'engineers',
    'plumber': 'plumbersRegistration',
    'granite-tiles': 'graniteTilesLaying',
    'painting-cleaning': 'paintingAndCleaning',
    'contact-building': 'contractorAndBuilding',
    'labor': 'labors',
    'mason-mastri': 'masonMistri',
    'interiors-building': 'interiorsDesigners',
    'stainless-steel': 'stainlessSteelMS',
    'cleaning': 'cleaningServices',
    'glass-mirror': 'glassMirror',
    'borewell': 'borewellServices',
  };
  return translationMap[serviceId] || serviceId;
};

// Mock locations data
const SAVED_LOCATIONS = [
  { id: '1', name: 'Home', address: '147, 12th cross, Rachenahalli, Yelahanka, Bengaluru' },
  { id: '2', name: 'Office', address: 'Tech Park, Whitefield, Bengaluru' },
  { id: '3', name: 'Current Location', address: 'Using device location' },
];

export default function HomeScreen() {
  const { t } = useLanguage();
  const { user, isLoading: authLoading } = useAuth();
  const { labourAccessStatus } = useLabourAccess();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = Dimensions.get('window');
  const fadeAnim = React.useRef(new Animated.Value(1)).current;
  
  // Responsive design breakpoints
  const isSmallDevice = screenWidth < 375;
  const isMediumDevice = screenWidth >= 375 && screenWidth < 414;
  const isLargeDevice = screenWidth >= 414;

  // Responsive spacing utilities
  const getResponsiveSpacing = (small: number, medium: number, large: number) => {
    if (isSmallDevice) return small;
    if (isMediumDevice) return medium;
    return large;
  };
  
  // Calculate responsive tab bar height (matches tab layout)
  const tabBarHeight = 60 + insets.bottom;
  
  // Calculate responsive padding based on device size
  const getResponsivePadding = () => {
    if (isSmallDevice) return tabBarHeight - 10; // 50px base
    if (isMediumDevice) return tabBarHeight - 5;  // 55px base  
    return tabBarHeight; // 60px base for large devices
  };
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(SAVED_LOCATIONS[0]);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingLocation, setEditingLocation] = useState<typeof SAVED_LOCATIONS[0] | null>(null);
  const [locationName, setLocationName] = useState('');
  const [locationAddress, setLocationAddress] = useState('');
  const [showAlertModal, setShowAlertModal] = useState(false);
  
  // Enhanced search state management
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchSuggestions, setSearchSuggestions] = useState<string[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [filteredServices, setFilteredServices] = useState(SERVICE_CATEGORIES);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
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

  const showAlert = (title: string, message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info', buttons?: { text: string; onPress: () => void; style?: 'primary' | 'secondary' | 'destructive' }[]) => {
    setAlertConfig({ title, message, type, buttons });
    setShowAlertModal(true);
  };

  const handleLocationSelect = (location: typeof SAVED_LOCATIONS[0]) => {
    setSelectedLocation(location);
    setShowLocationModal(false);
  };

  const handleUseCurrentLocation = () => {
    showAlert(
      t('home.locationAccess'),
      t('home.locationAccessMessage'),
      'info',
      [
        {
          text: t('home.cancel'),
          onPress: () => setShowAlertModal(false),
          style: 'secondary',
        },
        {
          text: t('home.allow'),
          onPress: () => {
            setSelectedLocation(SAVED_LOCATIONS[2]);
            setShowLocationModal(false);
            setShowAlertModal(false);
          },
          style: 'primary',
        },
      ]
    );
  };

  const handleEditLocation = (location: typeof SAVED_LOCATIONS[0]) => {
    setEditingLocation(location);
    setLocationName(location.name);
    setLocationAddress(location.address);
    setShowEditModal(true);
  };

  const handleSaveLocation = () => {
    if (!locationName.trim() || !locationAddress.trim()) {
      showAlert(t('home.error'), t('home.fillAllFields'), 'error');
      return;
    }

    // In a real app, you would update the location in your storage/backend
    showAlert(t('home.success'), t('home.locationUpdated'), 'success');
    setShowEditModal(false);
    setEditingLocation(null);
  };

  const handleAddNewLocation = () => {
    setEditingLocation(null);
    setLocationName('');
    setLocationAddress('');
    setShowEditModal(true);
  };

  // Load recent searches from AsyncStorage
  const loadRecentSearches = async () => {
    try {
      const recent = await AsyncStorage.getItem('user_recent_searches');
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
      await AsyncStorage.setItem('user_recent_searches', JSON.stringify(updated));
    } catch (error) {
    }
  };

  // Generate search suggestions based on service categories
  const generateSearchSuggestions = (query: string) => {
    if (!query.trim()) return [];
    
    const suggestions = SERVICE_CATEGORIES
      .filter(category => category && category.id) // Add null check
      .filter(category => {
        const translationKey = getServiceTranslationKey(category.id);
        const categoryName = t(`serviceCategories.${translationKey}`).toLowerCase();
        const categoryId = category.id.toLowerCase();
        const queryLower = query.toLowerCase();
        
        return categoryName.includes(queryLower) || categoryId.includes(queryLower);
      })
      .map(category => {
        const translationKey = getServiceTranslationKey(category.id);
        return t(`serviceCategories.${translationKey}`);
      })
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
          if (!category || !category.id) return false;
          
          try {
            const translationKey = getServiceTranslationKey(category.id);
            const categoryName = t(`serviceCategories.${translationKey}`).toLowerCase();
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
      
      const translationKey = getServiceTranslationKey(category.id);
      const categoryName = t(`serviceCategories.${translationKey}`);
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
      
      const translationKey = getServiceTranslationKey(category.id);
      const categoryName = t(`serviceCategories.${translationKey}`);
      return categoryName.toLowerCase().includes(recentSearch.toLowerCase());
    });
    setFilteredServices(filtered);
  };

  // Clear recent searches
  const clearRecentSearches = async () => {
    try {
      setRecentSearches([]);
      await AsyncStorage.removeItem('user_recent_searches');
    } catch (error) {
    }
  };

  // Load recent searches on component mount
  useEffect(() => {
    loadRecentSearches();
  }, []);

  // Handle pull-to-refresh
  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      // Trigger refresh by updating refresh key
      // This will cause child components to re-fetch data
      setRefreshKey(prev => prev + 1);
      
      // Wait a bit for components to refresh
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error('Error refreshing home screen:', error);
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Handle orientation changes for responsive spacing
  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      // Force re-render when orientation changes to update responsive spacing
      setSearch(prev => prev); // Trigger re-render
    });

    return () => subscription?.remove();
  }, []);

  return (
    <SafeView style={styles.safeArea} backgroundColor="#F8FAFC" excludeBottom={true}>
      <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View style={styles.locationContainer}>
              <Text style={styles.locationNumber}>{selectedLocation.name}</Text>
              <Text style={styles.locationText} numberOfLines={1}>
                {selectedLocation.address}
              </Text>
            </View>
            <View style={styles.headerActions}>
              <TouchableOpacity 
                style={styles.locationButton}
                onPress={() => setShowLocationModal(true)}
              >
                <MapPin size={24} color="#3B82F6" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
        
        {/* Location Selection Modal */}
        <RNModal
          visible={showLocationModal}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setShowLocationModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{t('home.selectLocation')}</Text>
                <TouchableOpacity 
                  onPress={() => setShowLocationModal(false)}
                  style={styles.closeButton}
                >
                  <X size={24} color="#1E293B" />
                </TouchableOpacity>
              </View>

              <TouchableOpacity 
                style={styles.currentLocationButton}
                onPress={handleUseCurrentLocation}
              >
                <Navigation size={20} color="#3B82F6" />
                <Text style={styles.currentLocationText}>{t('home.useCurrentLocation')}</Text>
              </TouchableOpacity>

              <View style={styles.savedLocationsContainer}>
                <View style={styles.savedLocationsHeader}>
                  <Text style={styles.savedLocationsTitle}>{t('home.savedLocations')}</Text>
                  <TouchableOpacity 
                    style={styles.addLocationButton}
                    onPress={handleAddNewLocation}
                  >
                    <Plus size={20} color="#3B82F6" />
                  </TouchableOpacity>
                </View>
                {SAVED_LOCATIONS.map((location) => (
                  <View key={location.id} style={styles.locationItemContainer}>
                    <TouchableOpacity
                      style={[
                        styles.locationItem,
                        selectedLocation.id === location.id && styles.selectedLocationItem
                      ]}
                      onPress={() => handleLocationSelect(location)}
                    >
                      <View style={styles.locationItemContent}>
                        <Text style={styles.locationItemName}>{location.name}</Text>
                        <Text style={styles.locationItemAddress} numberOfLines={1}>
                          {location.address}
                        </Text>
                      </View>
                      {selectedLocation.id === location.id && (
                        <View style={styles.selectedIndicator} />
                      )}
                    </TouchableOpacity>
                    {location.id !== '3' && ( // Don't show edit button for current location
                      <TouchableOpacity
                        style={styles.editButton}
                        onPress={() => handleEditLocation(location)}
                      >
                        <Edit2 size={18} color="#64748B" />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            </View>
          </View>
        </RNModal>

        {/* Edit Location Modal */}
        <RNModal
          visible={showEditModal}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setShowEditModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {editingLocation ? t('home.editLocation') : t('home.addNewLocation')}
                </Text>
                <TouchableOpacity 
                  onPress={() => setShowEditModal(false)}
                  style={styles.closeButton}
                >
                  <X size={24} color="#1E293B" />
                </TouchableOpacity>
              </View>

              <View style={styles.editForm}>
                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>{t('home.locationName')}</Text>
                  <TextInput
                    style={styles.input}
                    value={locationName}
                    onChangeText={setLocationName}
                    placeholder={t('home.locationNamePlaceholder')}
                    placeholderTextColor="#94A3B8"
                  />
                </View>

                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>{t('home.address')}</Text>
                  <TextInput
                    style={[styles.input, styles.addressInput]}
                    value={locationAddress}
                    onChangeText={setLocationAddress}
                    placeholder={t('home.addressPlaceholder')}
                    placeholderTextColor="#94A3B8"
                    multiline
                  />
                </View>

                <TouchableOpacity
                  style={styles.saveButton}
                  onPress={handleSaveLocation}
                >
                  <Text style={styles.saveButtonText}>{t('home.saveLocation')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </RNModal>

        {/* Enhanced Search Bar */}
        <View style={styles.searchWrapper}>
          <View style={[styles.searchContainer, searchFocused && styles.searchContainerFocused]}>
            <Search size={20} color={searchFocused ? "#3B82F6" : "#94A3B8"} style={styles.searchIcon} />
            <TextInput 
              style={styles.searchInput} 
              placeholder={t('home.searchPlaceholder')}
              placeholderTextColor="#94A3B8"
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
        
        <ScrollView 
          style={styles.scrollView} 
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: getResponsivePadding() }]}
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
          {/* Services Grid */}
          <View style={[styles.sectionContainer, styles.firstSection]}>
            <ServiceCategoryGrid filteredServices={filteredServices} />
          </View>
          
          {/* Featured Professionals */}
          <View style={[
            styles.sectionContainer,
            { marginBottom: getResponsiveSpacing(8, 12, 16) } // Add bottom margin for separation
          ]}>
            <Text style={styles.sectionTitle}>{t('home.featuredProfessionals')}</Text>
            <FeaturedProviders key={`featured-${refreshKey}`} />
          </View>
          
          {/* Recent Bookings - with responsive spacing */}
          <View style={[
            styles.sectionContainer, 
            { 
              marginTop: getResponsiveSpacing(36, 48, 56), // Increased spacing for better separation
              marginBottom: getResponsiveSpacing(16, 20, 24)
            }
          ]}>
            <Text style={styles.sectionTitle}>{t('home.recentBookings')}</Text>
            <RecentBookings key={`bookings-${refreshKey}`} />
          </View>
        </ScrollView>
      </Animated.View>

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
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    marginBottom: 0,
    paddingBottom: 0,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  locationContainer: {
    flex: 1,
  },
  locationNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 2,
  },
  locationText: {
    fontSize: 14,
    color: '#64748B',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  notificationButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
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
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
    zIndex: 10,
  },
  notificationBadgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  locationButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  searchWrapper: {
    position: 'relative',
    zIndex: 1000,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 12,
    paddingHorizontal: 16,
    borderRadius: 25,
    height: 50,
    borderWidth: 1,
    borderColor: '#E2E8F0',
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
  searchContainerFocused: {
    borderColor: '#3B82F6',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    fontSize: 16,
    color: '#1E293B',
  },
  clearButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  clearButtonText: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '600',
  },
  searchDropdown: {
    position: 'absolute',
    top: '100%',
    left: 20,
    right: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginTop: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    maxHeight: 300,
  },
  suggestionsSection: {
    paddingVertical: 8,
  },
  recentSearchesSection: {
    paddingVertical: 8,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#F9FAFB',
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  suggestionText: {
    fontSize: 14,
    color: '#1F2937',
    flex: 1,
  },
  recentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#F9FAFB',
  },
  clearRecentText: {
    fontSize: 12,
    color: '#EF4444',
    fontWeight: '500',
  },
  recentSearchItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  recentSearchText: {
    fontSize: 14,
    color: '#1F2937',
    flex: 1,
  },
  emptySearchState: {
    paddingVertical: 24,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  emptySearchText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
  },
  emptySearchSubtext: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 0, // Will be set dynamically
  },
  sectionContainer: {
    marginTop: 20,
    paddingHorizontal: 20,
    marginBottom: 0,
  },
  firstSection: {
    marginTop: 16,
  },
  lastSection: {
    marginBottom: 0,
    paddingBottom: 0,
    marginTop: 32, // Increased from 16 to 32 for better separation
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1E293B',
  },
  closeButton: {
    padding: 4,
  },
  currentLocationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    gap: 12,
  },
  currentLocationText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#3B82F6',
  },
  savedLocationsContainer: {
    marginTop: 8,
  },
  savedLocationsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 12,
  },
  locationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: '#F8FAFC',
  },
  selectedLocationItem: {
    backgroundColor: '#EFF6FF',
  },
  locationItemContent: {
    flex: 1,
  },
  locationItemName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1E293B',
    marginBottom: 4,
  },
  locationItemAddress: {
    fontSize: 14,
    color: '#64748B',
  },
  selectedIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3B82F6',
  },
  savedLocationsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  addLocationButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationItemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  editButton: {
    padding: 8,
    marginLeft: 8,
  },
  editForm: {
    marginTop: 16,
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1E293B',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#1E293B',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  addressInput: {
    height: 80,
    textAlignVertical: 'top',
  },
  saveButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});