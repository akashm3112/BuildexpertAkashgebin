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
import { getRelatedSubServices, SubServiceOption } from '@/constants/serviceSubServices';

const { width: screenWidth } = Dimensions.get('window');
const isSmallScreen = screenWidth < 375;
const isMediumScreen = screenWidth >= 375 && screenWidth < 414;
const isLargeScreen = screenWidth >= 414;

const getResponsiveSpacing = (small: number, medium: number, large: number) => {
  if (isSmallScreen) return small;
  if (isMediumScreen) return medium;
  return large;
};

interface SubServiceSelectorProps {
  value: string; // Sub-service ID
  onSelect: (subServiceId: string) => void;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  style?: any;
  mainServiceId: string; // The main service category ID
  excludeSubServiceIds?: string[]; // Exclude already selected sub-services
}

export default function SubServiceSelector({
  value,
  onSelect,
  placeholder,
  error,
  disabled = false,
  style,
  mainServiceId,
  excludeSubServiceIds = [],
}: SubServiceSelectorProps) {
  const { t } = useLanguage();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Get all available sub-services for the main service
  const allSubServices = useMemo(() => {
    return getRelatedSubServices(mainServiceId);
  }, [mainServiceId]);

  // Filter out excluded sub-services (but keep the current value)
  const availableSubServices = useMemo(() => {
    return allSubServices.filter(
      service => !excludeSubServiceIds.includes(service.id) || service.id === value
    );
  }, [allSubServices, excludeSubServiceIds, value]);

  // Find the selected sub-service
  const selectedSubService = useMemo(() => {
    return availableSubServices.find(service => service.id === value);
  }, [value, availableSubServices]);

  // Filter sub-services based on search query
  const filteredSubServices = useMemo(() => {
    if (!searchQuery.trim()) {
      return availableSubServices;
    }
    return availableSubServices.filter(service => {
      const serviceName = service.name.toLowerCase();
      // Try to get translated name
      const translationKey = `subServices.${mainServiceId}.${service.id}`;
      const translatedName = t(translationKey);
      const displayName = translatedName !== translationKey ? translatedName.toLowerCase() : serviceName;
      const query = searchQuery.toLowerCase();
      return serviceName.includes(query) || displayName.includes(query) || service.id.includes(query);
    });
  }, [searchQuery, availableSubServices, mainServiceId, t]);

  const handleSubServiceSelect = (subServiceId: string) => {
    onSelect(subServiceId);
    setIsModalVisible(false);
    setSearchQuery('');
  };

  const handleOpenModal = () => {
    if (!disabled) {
      setIsModalVisible(true);
    }
  };

  const handleCloseModal = () => {
    setIsModalVisible(false);
    setSearchQuery('');
  };

  useEffect(() => {
    // Trigger re-render when language changes
  }, [t]);

  const getDisplayName = (subService: SubServiceOption) => {
    const translationKey = `subServices.${mainServiceId}.${subService.id}`;
    const translatedName = t(translationKey);
    return translatedName !== translationKey ? translatedName : subService.name;
  };

  const renderSubServiceItem = ({ item }: { item: SubServiceOption }) => (
    <TouchableOpacity
      style={[
        styles.subServiceItem,
        selectedSubService?.id === item.id && styles.selectedSubServiceItem,
      ]}
      onPress={() => handleSubServiceSelect(item.id)}
    >
      <View style={styles.subServiceItemContent}>
        <View style={styles.subServiceTextContainer}>
          <Text style={[
            styles.subServiceName,
            selectedSubService?.id === item.id && styles.selectedSubServiceName,
          ]}>
            {getDisplayName(item)}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, style]}>
      <TouchableOpacity
        style={[
          styles.selector,
          error && styles.selectorError,
          disabled && styles.selectorDisabled,
        ]}
        onPress={handleOpenModal}
        disabled={disabled}
      >
        <Text style={[
          styles.selectorText,
          !selectedSubService && styles.placeholderText,
          disabled && styles.disabledText,
        ]}>
          {selectedSubService 
            ? getDisplayName(selectedSubService)
            : placeholder || 'Select Sub-Service'}
        </Text>
        <ChevronDown size={20} color={disabled ? '#9CA3AF' : '#6B7280'} />
      </TouchableOpacity>

      {error && <Text style={styles.errorText}>{error}</Text>}

      <Modal
        visible={isModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleCloseModal}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t('serviceRegistration.subServices') || 'Select Sub-Service'}</Text>
            <TouchableOpacity onPress={handleCloseModal} style={styles.closeButton}>
              <X size={24} color="#6B7280" />
            </TouchableOpacity>
          </View>

          <View style={styles.searchContainer}>
            <Search size={20} color="#9CA3AF" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder={t('home.searchPlaceholder') || 'Search services...'}
              placeholderTextColor="#9CA3AF"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
            />
          </View>

          {filteredSubServices.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                {searchQuery.trim() 
                  ? t('home.noResultsFound') || 'No results found'
                  : 'No sub-services available'}
              </Text>
            </View>
          ) : (
            <FlatList
              data={filteredSubServices}
              renderItem={renderSubServiceItem}
              keyExtractor={(item) => item.id}
              style={styles.subServiceList}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.subServiceListContent}
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
    borderColor: '#D1D5DB',
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
  subServiceList: {
    flex: 1,
  },
  subServiceListContent: {
    paddingBottom: getResponsiveSpacing(20, 24, 28),
  },
  subServiceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: getResponsiveSpacing(16, 20, 24),
    paddingVertical: getResponsiveSpacing(12, 14, 16),
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  selectedSubServiceItem: {
    backgroundColor: '#EFF6FF',
    borderBottomColor: '#DBEAFE',
  },
  subServiceItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  subServiceTextContainer: {
    flex: 1,
  },
  subServiceName: {
    fontSize: getResponsiveSpacing(14, 16, 18),
    fontWeight: '500',
    color: '#1F2937',
  },
  selectedSubServiceName: {
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

