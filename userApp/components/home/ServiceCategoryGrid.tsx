import React, { useEffect, useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  FlatList, 
  ScrollView,
  useWindowDimensions,
  Platform,
  Animated,
  Image
} from 'react-native';
import { router } from 'expo-router';
import { API_BASE_URL } from '@/constants/api';
import { useLanguage } from '@/context/LanguageContext';
import { useLabourAccess } from '@/context/LabourAccessContext';
import { CheckCircle } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const getCategoryColor = (categoryId: string) => {
  const colorMap: { [key: string]: string } = {
    'engineer-interior': '#3B82F6',
    'plumber': '#14B8A6',
    'granite-tiles': '#F59E0B',
    'painting-cleaning': '#8B5CF6',
    'painting': '#8B5CF6',
    'contact-building': '#EC4899',
    'labor': '#EF4444',
    'mason-mastri': '#10B981',
    'interiors-building': '#6366F1',
    'stainless-steel': '#F97316',
    'cleaning': '#0EA5E9',
    'glass-mirror': '#06B6D4',
    'borewell': '#A78BFA',
  };
  return colorMap[categoryId] || '#3B82F6';
};

// Map new service IDs to old translation keys
const getServiceTranslationKey = (serviceId: string) => {
  const translationMap: { [key: string]: string } = {
    'engineer-interior': 'engineers',
    'plumber': 'plumbersRegistration',
    'granite-tiles': 'graniteTilesLaying',
    'painting-cleaning': 'paintingAndCleaning',
    'painting': 'paintingAndCleaning',
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

// Map new service IDs to old routes
const getServiceRoute = (serviceId: string) => {
  const routeMap: { [key: string]: string } = {
    'engineer-interior': 'civil-engineer',
    'plumber': 'plumber',
    'granite-tiles': 'marble-provider',
    'painting-cleaning': 'painting-cleaning',
    'painting': 'painting-cleaning',
    'contact-building': 'contractor',
    'labor': 'laborer',
    'mason-mastri': 'mason',
    'interiors-building': 'interiors',
    'stainless-steel': 'stainless-steel',
    'cleaning': 'cleaning',
    'glass-mirror': 'glass-mirror',
    'borewell': 'borewell',
  };
  return routeMap[serviceId] || serviceId;
};


const getCategories = (t: any) => [
  {
    id: '1',
    name: t('serviceCategories.engineers'),
    route: 'civil-engineer',
    image: 'https://via.placeholder.com/100x100/3B82F6/FFFFFF?text=CE',
    color: '#3B82F6',
  },
  {
    id: '2',
    name: t('serviceCategories.plumbersRegistration'),
    route: 'plumber',
    image: 'https://via.placeholder.com/100x100/14B8A6/FFFFFF?text=P',
    color: '#14B8A6',
  },
  {
    id: '3',
    name: t('serviceCategories.graniteTilesLaying'),
    route: 'marble-provider',
    image: 'https://via.placeholder.com/100x100/F59E0B/FFFFFF?text=G',
    color: '#F59E0B',
  },
  {
    id: '4',
    name: t('serviceCategories.paintingAndCleaning'),
    route: 'painting-cleaning',
    image: require('@/assets/images/painting.jpg'),
    color: '#8B5CF6',
  },
  {
    id: '5',
    name: t('serviceCategories.contractorAndBuilding'),
    route: 'contractor',
    image: 'https://via.placeholder.com/100x100/EC4899/FFFFFF?text=C',
    color: '#EC4899',
  },
  {
    id: '6',
    name: t('serviceCategories.labors'),
    route: 'laborer', 
    image: 'https://via.placeholder.com/100x100/EF4444/FFFFFF?text=L',
    color: '#EF4444',
  },
  {
    id: '7',
    name: t('serviceCategories.masonMistri'),
    route: 'mason',
    image: 'https://via.placeholder.com/100x100/10B981/FFFFFF?text=M',
    color: '#10B981',
  },
  {
    id: '8',
    name: t('serviceCategories.interiorsDesigners'),
    route: 'interiors',
    image: 'https://via.placeholder.com/100x100/6366F1/FFFFFF?text=I',
    color: '#6366F1',
  },
  {
    id: '9',
    name: t('serviceCategories.stainlessSteelMS'),
    route: 'stainless-steel',
    image: 'https://via.placeholder.com/100x100/F97316/FFFFFF?text=SS',
    color: '#F97316',
  },
  {
    id: '10',
    name: t('serviceCategories.cleaningServices'),
    route: 'cleaning',
    image: require('@/assets/images/cleaning.jpg'),
    color: '#0EA5E9',
  },
  {
    id: '11',
    name: t('serviceCategories.glassMirror'),
    route: 'glass-mirror',
    image: 'https://via.placeholder.com/100x100/06B6D4/FFFFFF?text=GM',
    color: '#06B6D4',
  },
  {
    id: '12',
    name: t('serviceCategories.borewellServices'),
    route: 'borewell',
    image: require('@/assets/images/borewell.jpg'),
    color: '#A78BFA',
  },
];

interface ServiceCategoryGridProps {
  filteredServices?: any[];
}

export default function ServiceCategoryGrid({ filteredServices }: ServiceCategoryGridProps) {
  const { t } = useLanguage();
  const { width } = useWindowDimensions();
  const numColumns = 3;
  const [routeToUuidMap, setRouteToUuidMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const { labourAccessStatus } = useLabourAccess();
  
  
  // Get categories with translated names - use filtered services if provided, otherwise use default
  const categories = filteredServices && filteredServices.length > 0 
    ? filteredServices.map(service => ({
        id: service.id,
        name: t(`serviceCategories.${getServiceTranslationKey(service.id)}`),
        route: getServiceRoute(service.id),
        image: service.image || service.imageUrl || 'https://via.placeholder.com/100x100/3B82F6/FFFFFF?text=S',
        color: getCategoryColor(service.id),
      }))
    : getCategories(t);
  
  // Calculate item width based on container width and number of columns
  const itemWidth = (width - 40 - (numColumns - 1) * 12) / numColumns;
  
  const fadeAnim = React.useRef(
    categories.map((_, i) => new Animated.Value(0))
  ).current;
  
  React.useEffect(() => {
    const animations = categories.map((_, i) => {
      return Animated.timing(fadeAnim[i], {
        toValue: 1,
        duration: 400,
        delay: i * 50,
        useNativeDriver: true,
      });
    });
    
    Animated.stagger(50, animations).start();
  }, [categories]);

  useEffect(() => {
    const fetchServiceUuids = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/public/services`);
        const data = await response.json();
        if (data.status === 'success' && data.data.services) {
          // Map backend service names to frontend routes
          const nameToRoute = {
            'engineer-interior': 'civil-engineer',
            'plumber': 'plumber',
            'granite-tiles': 'marble-provider',
            'painting-cleaning': 'painting-cleaning',
            'painter': 'painting-cleaning',
            'contact-building': 'contractor',
            'labors': 'laborer',
            'mason-mastri': 'mason',
            'interiors-building': 'interiors',
            'stainless-steel': 'stainless-steel',
            'cleaning': 'cleaning',
            'glass-mirror': 'glass-mirror',
            'borewell': 'borewell',
          };
          const map: any = {};
          data.data.services.forEach((service: { name: keyof typeof nameToRoute; id: string }) => {
            const route = nameToRoute[service.name];
            if (route) map[route] = service.id;
          });
          setRouteToUuidMap(map);
        }
      } catch (e) {
        // fallback: do nothing
      } finally {
        setLoading(false);
      }
    };
    fetchServiceUuids();
  }, []);

  const handleCategoryPress = (category: any) => {
    const serviceUuid = routeToUuidMap[category.route as string];
    if (serviceUuid) {
      router.push(`/services/${serviceUuid}`);
    } else {
      router.push(`/services/${category.route}`);
    }
  };


  // Group categories into rows for custom rendering
  const renderRows = () => {
    const rows = [];
    for (let i = 0; i < categories.length; i += numColumns) {
      const rowItems = categories.slice(i, i + numColumns);
      const isLastRow = i + numColumns >= categories.length;
      const hasSingleItem = isLastRow && rowItems.length === 1;
      
      rows.push(
        <View key={i} style={[
          styles.row,
          hasSingleItem && styles.centeredRow
        ]}>
          {rowItems.map((item, index) => {
            const globalIndex = i + index;
            return (
              <Animated.View
                key={item.id}
                style={{
                  opacity: fadeAnim[globalIndex],
                  transform: [{ 
                    translateY: fadeAnim[globalIndex].interpolate({
                      inputRange: [0, 1],
                      outputRange: [20, 0]
                    })
                  }]
                }}
              >
                <View style={[styles.categoryWrapper, { width: itemWidth }]}>
                  <View style={styles.categoryItemContainer}>
                    <TouchableOpacity
                      style={styles.categoryItem}
                      activeOpacity={0.8}
                      onPress={() => handleCategoryPress(item)}
                    >
                      <View style={styles.imageContainer}>
                        <Image 
                          source={typeof item.image === 'string' ? { uri: item.image } : item.image}
                          style={styles.categoryImage}
                          resizeMode="cover"
                        />
                        {/* Pay ₹99 label on top right corner for labor when no access */}
                        {item.id === 'labor' && !labourAccessStatus?.hasAccess && (
                          <View style={styles.payLabelBadge}>
                            <Text style={styles.payLabelBadgeText}>Pay ₹99</Text>
                          </View>
                        )}
                        {/* Access indicator on top right for labor when access granted */}
                        {item.id === 'labor' && labourAccessStatus?.hasAccess && (
                          <View style={styles.accessBadge}>
                            <CheckCircle size={14} color="#10B981" />
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.categoryContent}>
                    <View style={styles.categoryNameContainer}>
                      <Text style={styles.categoryName} numberOfLines={2}>
                        {item.name}
                      </Text>
                    </View>
                  </View>
                </View>
              </Animated.View>
            );
          })}
        </View>
      );
    }
    return rows;
  };

  return (
    <View style={styles.container}>
      <ScrollView 
        scrollEnabled={false}
        contentContainerStyle={styles.gridContainer}
      >
        {renderRows()}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gridContainer: {
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
  categoryItemContainer: {
    width: '100%',
    height: 100,
    marginBottom: 2,
  },
  categoryItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    height: 100,
    width: '100%',
    ...Platform.select({
      ios: {
        shadowColor: '#3B82F6',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 10,
      },
      android: {
        elevation: 4,
        shadowColor: '#3B82F6',
      },
      web: {
        boxShadow: '0px 4px 14px rgba(59, 130, 246, 0.2), 0px 2px 6px rgba(59, 130, 246, 0.12)',
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
  accessIndicator: {
    backgroundColor: '#F0FDF4',
    borderRadius: 8,
    padding: 2,
  },
  payLabelBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#FEF2F2',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#DC2626',
    zIndex: 10,
  },
  payLabelBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#DC2626',
  },
  accessBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    padding: 4,
    zIndex: 10,
  },
});