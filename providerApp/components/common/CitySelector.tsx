import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  Modal,
  Dimensions,
  Platform,
} from 'react-native';
import { ChevronDown, Search, X } from 'lucide-react-native';
import { useLanguage } from '@/context/LanguageContext';
import { INDIAN_CITIES, IndianCity, getCitiesByState } from '@/constants/indianCities';

const { width: screenWidth } = Dimensions.get('window');
const isSmallScreen = screenWidth < 375;
const isMediumScreen = screenWidth >= 375 && screenWidth < 414;
const isLargeScreen = screenWidth >= 414;

const getResponsiveSpacing = (small: number, medium: number, large: number) => {
  if (isSmallScreen) return small;
  if (isMediumScreen) return medium;
  return large;
};

interface CitySelectorProps {
  value: string;
  onSelect: (city: string) => void;
  state: string; // Required: state must be selected first
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  style?: any;
}

export default function CitySelector({
  value,
  onSelect,
  state,
  placeholder,
  error,
  disabled = false,
  style,
}: CitySelectorProps) {
  const { t } = useLanguage();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Get cities for the selected state
  const availableCities = useMemo(() => {
    if (!state) return [];
    return getCitiesByState(state);
  }, [state]);

  const selectedCity = useMemo(() => {
    return availableCities.find(city => city.name === value);
  }, [value, availableCities]);

  const filteredCities = useMemo(() => {
    if (!searchQuery.trim()) {
      return availableCities;
    }
    return availableCities.filter(city => {
      const cityName = city.name.toLowerCase();
      const query = searchQuery.toLowerCase();
      return cityName.includes(query);
    });
  }, [searchQuery, availableCities]);

  const handleCitySelect = (city: IndianCity) => {
    onSelect(city.name);
    setIsModalVisible(false);
    setSearchQuery('');
  };

  const handleOpenModal = () => {
    if (!disabled && state) {
      setIsModalVisible(true);
    }
  };

  const handleCloseModal = () => {
    setIsModalVisible(false);
    setSearchQuery('');
  };

  // Force re-render when language changes
  useEffect(() => {
    // This will trigger a re-render when the language context changes
  }, [t]);

  const renderCityItem = ({ item }: { item: IndianCity }) => (
    <TouchableOpacity
      style={[
        styles.cityItem,
        selectedCity?.name === item.name && styles.selectedCityItem,
      ]}
      onPress={() => handleCitySelect(item)}
    >
      <Text style={[
        styles.cityName,
        selectedCity?.name === item.name && styles.selectedCityName,
      ]}>
        {item.name}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, style]}>
      <TouchableOpacity
        style={[
          styles.selector,
          error && styles.selectorError,
          disabled && styles.selectorDisabled,
          !state && styles.selectorDisabled,
        ]}
        onPress={handleOpenModal}
        disabled={disabled || !state}
      >
        <Text style={[
          styles.selectorText,
          !selectedCity && styles.placeholderText,
          (disabled || !state) && styles.disabledText,
        ]}>
          {!state 
            ? t('cities.selectStateFirst') || 'Please select state first'
            : selectedCity 
              ? selectedCity.name
              : placeholder || t('cities.selectCity') || 'Select city'}
        </Text>
        <ChevronDown size={20} color={(disabled || !state) ? '#9CA3AF' : '#6B7280'} />
      </TouchableOpacity>

      {error && <Text style={styles.errorText}>{error}</Text>}
      {!state && !error && (
        <Text style={styles.helperText}>
          {t('cities.selectStateFirst') || 'Please select state first'}
        </Text>
      )}

      <Modal
        visible={isModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleCloseModal}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {t('cities.citiesIn') || 'Cities in'} {state}
            </Text>
            <TouchableOpacity onPress={handleCloseModal} style={styles.closeButton}>
              <X size={24} color="#6B7280" />
            </TouchableOpacity>
          </View>

          <View style={styles.searchContainer}>
            <Search size={20} color="#9CA3AF" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder={t('cities.searchCity') || 'Search city'}
              placeholderTextColor="#9CA3AF"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
            />
          </View>

          {availableCities.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                {t('cities.noCitiesAvailable') || 'No cities available for this state'}
              </Text>
            </View>
          ) : (
            <FlatList
              data={filteredCities}
              renderItem={renderCityItem}
              keyExtractor={(item, index) => `${item.name}-${index}`}
              style={styles.cityList}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.cityListContent}
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: getResponsiveSpacing(8, 10, 12),
    paddingHorizontal: getResponsiveSpacing(12, 16, 20),
    paddingVertical: getResponsiveSpacing(12, 14, 16),
    minHeight: getResponsiveSpacing(44, 48, 52),
  },
  selectorError: {
    borderColor: '#EF4444',
  },
  selectorDisabled: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E5E7EB',
  },
  selectorText: {
    flex: 1,
    fontSize: getResponsiveSpacing(14, 16, 18),
    color: '#1F2937',
    marginRight: getResponsiveSpacing(8, 10, 12),
  },
  placeholderText: {
    color: '#9CA3AF',
  },
  disabledText: {
    color: '#9CA3AF',
  },
  errorText: {
    color: '#EF4444',
    fontSize: getResponsiveSpacing(12, 14, 16),
    marginTop: getResponsiveSpacing(4, 6, 8),
    marginLeft: getResponsiveSpacing(4, 6, 8),
  },
  helperText: {
    color: '#6B7280',
    fontSize: getResponsiveSpacing(12, 14, 16),
    marginTop: getResponsiveSpacing(4, 6, 8),
    marginLeft: getResponsiveSpacing(4, 6, 8),
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: getResponsiveSpacing(16, 20, 24),
    paddingVertical: getResponsiveSpacing(16, 20, 24),
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: getResponsiveSpacing(18, 20, 22),
    fontWeight: '600',
    color: '#1F2937',
    flex: 1,
  },
  closeButton: {
    padding: getResponsiveSpacing(4, 6, 8),
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    marginHorizontal: getResponsiveSpacing(16, 20, 24),
    marginVertical: getResponsiveSpacing(12, 16, 20),
    borderRadius: getResponsiveSpacing(8, 10, 12),
    paddingHorizontal: getResponsiveSpacing(12, 16, 20),
    paddingVertical: getResponsiveSpacing(8, 10, 12),
  },
  searchIcon: {
    marginRight: getResponsiveSpacing(8, 10, 12),
  },
  searchInput: {
    flex: 1,
    fontSize: getResponsiveSpacing(14, 16, 18),
    color: '#1F2937',
  },
  cityList: {
    flex: 1,
  },
  cityListContent: {
    paddingBottom: getResponsiveSpacing(20, 24, 28),
  },
  cityItem: {
    paddingHorizontal: getResponsiveSpacing(16, 20, 24),
    paddingVertical: getResponsiveSpacing(12, 14, 16),
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  selectedCityItem: {
    backgroundColor: '#EFF6FF',
    borderBottomColor: '#DBEAFE',
  },
  cityName: {
    fontSize: getResponsiveSpacing(14, 16, 18),
    fontWeight: '500',
    color: '#1F2937',
  },
  selectedCityName: {
    color: '#1D4ED8',
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: getResponsiveSpacing(40, 50, 60),
  },
  emptyText: {
    fontSize: getResponsiveSpacing(14, 16, 18),
    color: '#6B7280',
    textAlign: 'center',
  },
});

