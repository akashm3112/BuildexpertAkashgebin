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
import { SERVICE_CATEGORIES } from '@/constants/serviceCategories';

const { width: screenWidth } = Dimensions.get('window');
const isSmallScreen = screenWidth < 375;
const isMediumScreen = screenWidth >= 375 && screenWidth < 414;
const isLargeScreen = screenWidth >= 414;

const getResponsiveSpacing = (small: number, medium: number, large: number) => {
  if (isSmallScreen) return small;
  if (isMediumScreen) return medium;
  return large;
};

interface ServiceSelectorProps {
  value: string;
  onSelect: (serviceId: string) => void;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  style?: any;
  excludeServiceId?: string; // Exclude the current main service from the list
  excludeServiceIds?: string[]; // Exclude multiple service IDs (for sub-services to prevent duplicates)
  allowedServiceIds?: string[]; // Only show these service IDs (for sub-services related to main service)
}

export default function ServiceSelector({
  value,
  onSelect,
  placeholder,
  error,
  disabled = false,
  style,
  excludeServiceId,
  excludeServiceIds = [],
  allowedServiceIds,
}: ServiceSelectorProps) {
  const { t } = useLanguage();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Filter services based on:
  // 1. If allowedServiceIds is provided, only show those services (for sub-services)
  // 2. Exclude the main service being registered
  // 3. Exclude any already selected sub-services (but keep the current value)
  const availableServices = useMemo(() => {
    let services = SERVICE_CATEGORIES;
    
    // If allowedServiceIds is provided, filter to only those services
    if (allowedServiceIds && allowedServiceIds.length > 0) {
      services = services.filter(service => allowedServiceIds.includes(service.id));
    }
    
    // Exclude the main service and other selected sub-services
    const excludedIds = new Set([
      ...(excludeServiceId ? [excludeServiceId] : []),
      ...excludeServiceIds.filter(id => id !== value), // Exclude others but not the current value
    ]);
    
    return services.filter(service => !excludedIds.has(service.id));
  }, [excludeServiceId, excludeServiceIds, value, allowedServiceIds]);

  const selectedService = useMemo(() => {
    return availableServices.find(service => service.id === value);
  }, [value, availableServices]);

  const filteredServices = useMemo(() => {
    if (!searchQuery.trim()) {
      return availableServices;
    }
    return availableServices.filter(service => {
      const serviceName = service.name.toLowerCase();
      const translatedName = (t(`serviceCategories.${service.id}`) || service.name).toLowerCase();
      const query = searchQuery.toLowerCase();
      return serviceName.includes(query) || translatedName.includes(query) || service.id.includes(query);
    });
  }, [searchQuery, availableServices, t]);

  const handleServiceSelect = (serviceId: string) => {
    onSelect(serviceId);
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

  const renderServiceItem = ({ item }: { item: typeof SERVICE_CATEGORIES[0] }) => (
    <TouchableOpacity
      style={[
        styles.serviceItem,
        selectedService?.id === item.id && styles.selectedServiceItem,
      ]}
      onPress={() => handleServiceSelect(item.id)}
    >
      <View style={styles.serviceItemContent}>
        <Text style={styles.serviceIcon}>{item.icon}</Text>
        <View style={styles.serviceTextContainer}>
          <Text style={[
            styles.serviceName,
            selectedService?.id === item.id && styles.selectedServiceName,
          ]}>
            {t(`serviceCategories.${item.id}`) || item.name}
          </Text>
          <Text style={[
            styles.serviceDescription,
            selectedService?.id === item.id && styles.selectedServiceDescription,
          ]}>
            {item.description}
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
          !selectedService && styles.placeholderText,
          disabled && styles.disabledText,
        ]}>
          {selectedService 
            ? `${selectedService.icon} ${t(`serviceCategories.${selectedService.id}`) || selectedService.name}` 
            : placeholder || 'Select Service'}
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
            <Text style={styles.modalTitle}>Select Service</Text>
            <TouchableOpacity onPress={handleCloseModal} style={styles.closeButton}>
              <X size={24} color="#6B7280" />
            </TouchableOpacity>
          </View>

          <View style={styles.searchContainer}>
            <Search size={20} color="#9CA3AF" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search services..."
              placeholderTextColor="#9CA3AF"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
            />
          </View>

          <FlatList
            data={filteredServices}
            renderItem={renderServiceItem}
            keyExtractor={(item) => item.id}
            style={styles.serviceList}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.serviceListContent}
          />
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
  serviceList: {
    flex: 1,
  },
  serviceListContent: {
    paddingBottom: getResponsiveSpacing(20, 24, 28),
  },
  serviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: getResponsiveSpacing(16, 20, 24),
    paddingVertical: getResponsiveSpacing(12, 14, 16),
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  selectedServiceItem: {
    backgroundColor: '#EFF6FF',
    borderBottomColor: '#DBEAFE',
  },
  serviceItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  serviceIcon: {
    fontSize: getResponsiveSpacing(24, 28, 32),
    marginRight: getResponsiveSpacing(12, 16, 20),
  },
  serviceTextContainer: {
    flex: 1,
  },
  serviceName: {
    fontSize: getResponsiveSpacing(14, 16, 18),
    fontWeight: '500',
    color: '#1F2937',
    marginBottom: getResponsiveSpacing(2, 4, 6),
  },
  selectedServiceName: {
    color: '#1D4ED8',
    fontWeight: '600',
  },
  serviceDescription: {
    fontSize: getResponsiveSpacing(12, 14, 16),
    color: '#6B7280',
  },
  selectedServiceDescription: {
    color: '#3B82F6',
  },
});

