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
import { INDIAN_STATES, IndianState } from '@/constants/indianStates';

const { width: screenWidth } = Dimensions.get('window');
const isSmallScreen = screenWidth < 375;
const isMediumScreen = screenWidth >= 375 && screenWidth < 414;
const isLargeScreen = screenWidth >= 414;

const getResponsiveSpacing = (small: number, medium: number, large: number) => {
  if (isSmallScreen) return small;
  if (isMediumScreen) return medium;
  return large;
};

interface StateSelectorProps {
  value: string;
  onSelect: (state: string) => void;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  style?: any;
}

export default function StateSelector({
  value,
  onSelect,
  placeholder,
  error,
  disabled = false,
  style,
}: StateSelectorProps) {
  const { t } = useLanguage();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const selectedState = useMemo(() => {
    return INDIAN_STATES.find(state => state.name === value);
  }, [value]);

  const filteredStates = useMemo(() => {
    if (!searchQuery.trim()) {
      return INDIAN_STATES;
    }
    return INDIAN_STATES.filter(state => {
      const stateName = state.name.toLowerCase();
      const translatedStateName = (t(`states.${state.name}`) || state.name).toLowerCase();
      const query = searchQuery.toLowerCase();
      return stateName.includes(query) || translatedStateName.includes(query);
    });
  }, [searchQuery, t]);

  const handleStateSelect = (state: IndianState) => {
    onSelect(state.name);
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

  // Force re-render when language changes
  useEffect(() => {
    // This will trigger a re-render when the language context changes
  }, [t]);

  const renderStateItem = ({ item }: { item: IndianState }) => (
    <TouchableOpacity
      style={[
        styles.stateItem,
        selectedState?.name === item.name && styles.selectedStateItem,
      ]}
      onPress={() => handleStateSelect(item)}
    >
      <View style={styles.stateItemContent}>
        <Text style={[
          styles.stateName,
          selectedState?.name === item.name && styles.selectedStateName,
        ]}>
          {t(`states.${item.name}`) || item.name}
        </Text>
        <Text style={[
          styles.stateType,
          selectedState?.name === item.name && styles.selectedStateType,
        ]}>
          {item.type === 'state' ? t('states.states') : t('states.unionTerritories')}
        </Text>
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
          !selectedState && styles.placeholderText,
          disabled && styles.disabledText,
        ]}>
          {selectedState ? (t(`states.${selectedState.name}`) || selectedState.name) : placeholder || t('states.selectState')}
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
            <Text style={styles.modalTitle}>{t('states.allStates')}</Text>
            <TouchableOpacity onPress={handleCloseModal} style={styles.closeButton}>
              <X size={24} color="#6B7280" />
            </TouchableOpacity>
          </View>

          <View style={styles.searchContainer}>
            <Search size={20} color="#9CA3AF" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder={t('states.searchState')}
              placeholderTextColor="#9CA3AF"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
            />
          </View>

          <FlatList
            data={filteredStates}
            renderItem={renderStateItem}
            keyExtractor={(item) => item.code}
            style={styles.stateList}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.stateListContent}
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
  stateList: {
    flex: 1,
  },
  stateListContent: {
    paddingBottom: getResponsiveSpacing(20, 24, 28),
  },
  stateItem: {
    paddingHorizontal: getResponsiveSpacing(16, 20, 24),
    paddingVertical: getResponsiveSpacing(12, 14, 16),
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  selectedStateItem: {
    backgroundColor: '#EFF6FF',
    borderBottomColor: '#DBEAFE',
  },
  stateItemContent: {
    flex: 1,
  },
  stateName: {
    fontSize: getResponsiveSpacing(14, 16, 18),
    fontWeight: '500',
    color: '#1F2937',
    marginBottom: getResponsiveSpacing(2, 4, 6),
  },
  selectedStateName: {
    color: '#1D4ED8',
    fontWeight: '600',
  },
  stateType: {
    fontSize: getResponsiveSpacing(12, 14, 16),
    color: '#6B7280',
  },
  selectedStateType: {
    color: '#3B82F6',
  },
});
