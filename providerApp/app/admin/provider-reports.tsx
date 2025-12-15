import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, StatusBar, Animated, Platform, Alert, TextInput, RefreshControl, BackHandler, Modal } from 'react-native';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { ArrowLeft, UserCheck, Phone, Mail, Calendar, MapPin, Briefcase, UserX, Search, Filter, Trash2, Shield, Eye, Star } from 'lucide-react-native';
import { SafeView } from '@/components/SafeView';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '@/constants/api';
import { LinearGradient } from 'expo-linear-gradient';

// Responsive design utilities
const { width: screenWidth } = require('react-native').Dimensions.get('window');
const isSmallScreen = screenWidth < 375;

const getResponsiveValue = (small: number, medium: number, large: number) => {
  if (isSmallScreen) return small;
  if (screenWidth >= 375 && screenWidth < 414) return medium;
  return large;
};

const getResponsiveSpacing = (small: number, medium: number, large: number) => {
  if (isSmallScreen) return small;
  if (screenWidth >= 375 && screenWidth < 414) return medium;
  return large;
};

const getResponsiveFontSize = (small: number, medium: number, large: number) => {
  if (isSmallScreen) return small;
  if (screenWidth >= 375 && screenWidth < 414) return medium;
  return large;
};

// Updated palette to match provided blue reference
const PRIMARY_BLUE = '#4E8EF7';
const PRIMARY_BLUE_BORDER = '#3B82F6';
const DANGER_RED = '#EF4444';
const DANGER_RED_BORDER = '#DC2626';

interface Provider {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  role: string;
  is_verified: boolean;
  created_at: string;
  last_login: string;
  state: string;
  city: string;
  years_of_experience: number;
  service_description: string;
  registered_services_count: number;
}

export default function ProviderReportsScreen() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const handleViewDetails = (provider: Provider) => {
    router.push({
      pathname: '/admin/provider-details',
      params: { provider: JSON.stringify(provider) },
    });
  };
  const [providers, setProviders] = useState<Provider[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'all' | 'verified' | 'unverified'>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<Provider | null>(null);
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successName, setSuccessName] = useState('');
  
  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const filterAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (user && user.role !== 'admin') {
      router.replace('/(tabs)');
      return;
    }

    // Prevent back navigation to provider screens
    // Always navigate to admin dashboard instead
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      // Always navigate to dashboard to prevent going back to provider screens
      router.replace('/admin/dashboard');
      return true;
    });

    // Wait for auth to finish loading before fetching data
    if (!authLoading && user?.id) {
      loadProviders();
    } else if (!authLoading && !user?.id) {
      setIsLoading(false);
    }
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true,
      }),
    ]).start();

    return () => backHandler.remove();
  }, [user?.role]);

  useEffect(() => {
    // Filter animation
    Animated.timing(filterAnim, {
      toValue: showFilters ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [showFilters]);

  const loadProviders = async () => {
    try {
      const { tokenManager } = await import('@/utils/tokenManager');
      const token = await tokenManager.getValidToken();
      if (!token) {
        console.error('No authentication token found');
        setIsLoading(false);
        setRefreshing(false);
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/admin/all-providers`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.status === 'success') {
          setProviders(data.data.providers || []);
        } else {
          console.error('API returned error status:', data.message || 'Unknown error');
          setProviders([]);
        }
      } else if (response.status === 429) {
        // Rate limit exceeded - wait and retry once
        console.warn('Rate limit exceeded, retrying after delay...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        const retryResponse = await fetch(`${API_BASE_URL}/api/admin/all-providers`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        if (retryResponse.ok) {
          const retryData = await retryResponse.json();
          if (retryData.status === 'success') {
            setProviders(retryData.data.providers || []);
          }
        } else {
          console.error('Failed to fetch providers after retry:', retryResponse.status);
          setProviders([]);
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('Failed to fetch providers:', response.status, errorData.message || '');
        setProviders([]);
      }
    } catch (error) {
      console.error('Error fetching providers:', error);
      setProviders([]);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadProviders();
  };

  const performRemove = async (target: Provider) => {
    try {
      const { tokenManager } = await import('@/utils/tokenManager');
      const token = await tokenManager.getValidToken();
      const response = await fetch(`${API_BASE_URL}/api/admin/providers/${target.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        setProviders(prev => prev.filter(provider => provider.id !== target.id));
        setSuccessName(target.full_name);
        setShowSuccessModal(true);
      } else {
        Alert.alert('Error', 'Failed to remove provider');
      }
    } catch (error) {
      console.error('Error removing provider:', error);
      Alert.alert('Error', 'Failed to remove provider');
    } finally {
      setShowRemoveModal(false);
      setRemoveTarget(null);
    }
  };

  const filteredProviders = providers.filter(provider => {
    const matchesSearch = provider.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         provider.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         provider.phone.includes(searchQuery) ||
                         (provider.service_description && provider.service_description.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesFilter = filterStatus === 'all' || 
                         (filterStatus === 'verified' && provider.is_verified) ||
                         (filterStatus === 'unverified' && !provider.is_verified);
    
    return matchesSearch && matchesFilter;
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const renderProvider = ({ item, index }: { item: Provider; index: number }) => (
    <Animated.View 
      style={[
        styles.providerCard,
        {
          opacity: fadeAnim,
          transform: [
            { 
              translateY: slideAnim.interpolate({
                inputRange: [0, 50],
                outputRange: [0, 50 + (index * 10)]
              })
            }
          ]
        }
      ]}
    >
      <LinearGradient
        colors={['#FFFFFF', '#FAFAFA']}
        style={styles.providerGradient}
      >
        <View style={styles.providerHeader}>
          <View style={styles.providerInfo}>
            <View style={styles.providerNameContainer}>
              <Text style={styles.providerName}>{item.full_name}</Text>
              <View style={[
                styles.verificationBadge,
                { backgroundColor: item.is_verified ? '#10B981' : '#EF4444' }
              ]}>
                {item.is_verified ? (
                  <UserCheck size={getResponsiveValue(12, 14, 16)} color="white" />
                ) : (
                  <UserX size={getResponsiveValue(12, 14, 16)} color="white" />
                )}
                <Text style={styles.verificationText}>
                  {item.is_verified ? 'Verified' : 'Unverified'}
                </Text>
              </View>
            </View>
          </View>
          
        </View>

        <View style={styles.providerDetails}>
          <View style={styles.detailRow}>
            <View style={styles.detailIconContainer}>
              <Phone size={getResponsiveValue(14, 16, 18)} color="white" />
            </View>
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Phone</Text>
              <Text style={styles.detailText}>{item.phone}</Text>
            </View>
          </View>
          
          <View style={styles.detailRow}>
            <View style={styles.detailIconContainer}>
              <Mail size={getResponsiveValue(14, 16, 18)} color="white" />
            </View>
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Email</Text>
              <Text style={styles.detailText}>{item.email}</Text>
            </View>
          </View>
          
          {item.state && item.city && (
            <View style={styles.detailRow}>
              <View style={styles.detailIconContainer}>
                <MapPin size={getResponsiveValue(14, 16, 18)} color="white" />
              </View>
              <View style={styles.detailContent}>
                <Text style={styles.detailLabel}>Location</Text>
                <Text style={styles.detailText}>{item.city}, {item.state}</Text>
              </View>
            </View>
          )}
          
          {item.years_of_experience && (
            <View style={styles.detailRow}>
              <View style={styles.detailIconContainer}>
                <Briefcase size={getResponsiveValue(14, 16, 18)} color="white" />
              </View>
              <View style={styles.detailContent}>
                <Text style={styles.detailLabel}>Experience</Text>
                <Text style={styles.detailText}>{item.years_of_experience} years</Text>
              </View>
            </View>
          )}
          
          <View style={styles.detailRow}>
            <View style={styles.detailIconContainer}>
              <Star size={getResponsiveValue(14, 16, 18)} color="white" />
            </View>
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Services</Text>
              <Text style={styles.detailText}>{item.registered_services_count} registered</Text>
            </View>
          </View>
          
          <View style={styles.detailRow}>
            <View style={styles.detailIconContainer}>
              <Calendar size={getResponsiveValue(14, 16, 18)} color="white" />
            </View>
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Joined</Text>
              <Text style={styles.detailText}>{formatDate(item.created_at)}</Text>
            </View>
          </View>
          
          {item.last_login && (
            <View style={styles.detailRow}>
              <View style={styles.detailIconContainer}>
                <Shield size={getResponsiveValue(14, 16, 18)} color="white" />
              </View>
              <View style={styles.detailContent}>
                <Text style={styles.detailLabel}>Last Login</Text>
                <Text style={styles.detailText}>{formatDate(item.last_login)}</Text>
              </View>
            </View>
          )}
        </View>

        {item.service_description && (
          <View style={styles.serviceDescription}>
            <Text style={styles.serviceDescriptionTitle}>Service Description</Text>
            <Text style={styles.serviceDescriptionText}>{item.service_description}</Text>
          </View>
        )}

        <View style={styles.providerActions}>
          <TouchableOpacity style={styles.viewButton} onPress={() => handleViewDetails(item)}>
            <Eye size={getResponsiveValue(14, 16, 18)} color="white" />
            <Text style={styles.viewButtonText}>View Details</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.removeButton}
            onPress={() => {
              setRemoveTarget(item);
              setShowRemoveModal(true);
            }}
          >
            <Trash2 size={getResponsiveValue(14, 16, 18)} color="white" />
            <Text style={styles.removeButtonText}>Remove</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    </Animated.View>
  );

  return (
    <SafeView backgroundColor="#F8FAFC">
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />
      
      {/* Header */}
      <Animated.View 
        style={[
          styles.header,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }]
          }
        ]}
      >
        <TouchableOpacity onPress={() => router.replace('/admin/dashboard')} style={styles.backButton}>
          <ArrowLeft size={getResponsiveValue(20, 22, 24)} color="#374151" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.title}>Provider Management</Text>
          <Text style={styles.subtitle}>Total: {filteredProviders.length} providers</Text>
        </View>
        <TouchableOpacity 
          style={[styles.filterButton, showFilters && styles.filterButtonActive]}
          onPress={() => setShowFilters(!showFilters)}
        >
          <Filter size={getResponsiveValue(18, 20, 22)} color={showFilters ? "white" : "#6B7280"} />
        </TouchableOpacity>
      </Animated.View>

      {/* Search Section */}
      <Animated.View 
        style={[
          styles.searchSection,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }]
          }
        ]}
      >
        <View style={styles.searchContainer}>
          <Search size={getResponsiveValue(16, 18, 20)} color="#9CA3AF" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search providers by name, email, phone, or services..."
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </Animated.View>

      {/* Filter Section */}
      <Animated.View 
        style={[
          styles.filterSection,
          {
            opacity: filterAnim,
            transform: [
              {
                scaleY: filterAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 1]
                })
              },
              {
                translateY: filterAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-20, 0]
                })
              }
            ]
          }
        ]}
      >
        <View style={styles.filterContainer}>
          <TouchableOpacity 
            style={[styles.filterChip, filterStatus === 'all' && styles.filterChipActive]}
            onPress={() => setFilterStatus('all')}
          >
            <Text style={[styles.filterChipText, filterStatus === 'all' && styles.filterChipTextActive]}>
              All Providers
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.filterChip, filterStatus === 'verified' && styles.filterChipActive]}
            onPress={() => setFilterStatus('verified')}
          >
            <Text style={[styles.filterChipText, filterStatus === 'verified' && styles.filterChipTextActive]}>
              Verified
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.filterChip, filterStatus === 'unverified' && styles.filterChipActive]}
            onPress={() => setFilterStatus('unverified')}
          >
            <Text style={[styles.filterChipText, filterStatus === 'unverified' && styles.filterChipTextActive]}>
              Unverified
            </Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* Content */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Loading providers...</Text>
        </View>
      ) : filteredProviders.length === 0 ? (
        <View style={styles.emptyContainer}>
          <UserCheck size={getResponsiveValue(56, 64, 72)} color="#9CA3AF" />
          <Text style={styles.emptyTitle}>No Providers Found</Text>
          <Text style={styles.emptySubtitle}>
            {searchQuery ? 'No providers match your search criteria.' : 'No service providers have registered yet.'}
          </Text>
        </View>
      ) : (
        <FlatList
          style={styles.container}
          data={filteredProviders}
          keyExtractor={(item) => item.id}
          renderItem={renderProvider}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#3B82F6']}
              tintColor="#3B82F6"
            />
          }
        />
      )}

      <Modal
        transparent
        visible={showRemoveModal}
        animationType="fade"
        onRequestClose={() => setShowRemoveModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <BlurView intensity={20} tint="light" style={StyleSheet.absoluteFillObject} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Remove Provider</Text>
            <Text style={styles.modalMessage}>
              {removeTarget ? `Are you sure you want to remove ${removeTarget.full_name}? This action cannot be undone.` : ''}
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => {
                  setShowRemoveModal(false);
                  setRemoveTarget(null);
                }}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonDestructive]}
                onPress={() => removeTarget && performRemove(removeTarget)}
              >
                <Text style={styles.modalButtonText}>Remove</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        visible={showSuccessModal}
        animationType="fade"
        onRequestClose={() => setShowSuccessModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <BlurView intensity={20} tint="light" style={StyleSheet.absoluteFillObject} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Success</Text>
            <Text style={styles.modalMessage}>
              {successName ? `${successName} was removed successfully.` : 'Provider removed successfully.'}
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => setShowSuccessModal(false)}
              >
                <Text style={styles.modalButtonText}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeView>
  );
}

const styles = StyleSheet.create({
  // Header Styles
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: getResponsiveSpacing(16, 18, 20),
    paddingVertical: getResponsiveSpacing(16, 18, 20),
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  backButton: {
    padding: getResponsiveSpacing(8, 10, 12),
    marginRight: getResponsiveSpacing(12, 14, 16),
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  headerInfo: {
    flex: 1,
  },
  title: {
    fontSize: getResponsiveFontSize(20, 22, 24),
    fontWeight: '700',
    color: '#1F2937',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: getResponsiveFontSize(14, 15, 16),
    color: '#6B7280',
    marginTop: 2,
    fontWeight: '500',
  },
  filterButton: {
    padding: getResponsiveSpacing(10, 12, 14),
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    marginLeft: getResponsiveSpacing(8, 10, 12),
  },
  filterButtonActive: {
    backgroundColor: '#3B82F6',
  },

  // Search Section
  searchSection: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: getResponsiveSpacing(16, 18, 20),
    paddingVertical: getResponsiveSpacing(12, 14, 16),
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    paddingHorizontal: getResponsiveSpacing(12, 14, 16),
    paddingVertical: getResponsiveSpacing(10, 12, 14),
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  searchInput: {
    flex: 1,
    fontSize: getResponsiveFontSize(14, 15, 16),
    color: '#374151',
    marginLeft: getResponsiveSpacing(8, 10, 12),
    fontWeight: '500',
  },

  // Filter Section
  filterSection: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: getResponsiveSpacing(16, 18, 20),
    paddingVertical: getResponsiveSpacing(12, 14, 16),
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  filterContainer: {
    flexDirection: 'row',
    gap: getResponsiveSpacing(8, 10, 12),
  },
  filterChip: {
    paddingHorizontal: getResponsiveSpacing(12, 14, 16),
    paddingVertical: getResponsiveSpacing(6, 8, 10),
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  filterChipActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  filterChipText: {
    fontSize: getResponsiveFontSize(12, 13, 14),
    fontWeight: '600',
    color: '#6B7280',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },

  // Container Styles
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  listContainer: {
    padding: getResponsiveSpacing(16, 18, 20),
  },

  // Loading & Empty States
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    fontSize: getResponsiveFontSize(14, 15, 16),
    color: '#6B7280',
    marginTop: 12,
    fontWeight: '500',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: getResponsiveFontSize(18, 20, 22),
    fontWeight: '600',
    color: '#374151',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: getResponsiveFontSize(14, 15, 16),
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },

  // Provider Card Styles
  providerCard: {
    marginBottom: getResponsiveSpacing(16, 18, 20),
    borderRadius: 16,
    overflow: 'hidden',
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
  },
  providerGradient: {
    padding: getResponsiveSpacing(16, 18, 20),
  },
  providerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: getResponsiveSpacing(12, 14, 16),
  },
  providerInfo: {
    flex: 1,
  },
  providerNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: getResponsiveSpacing(8, 10, 12),
  },
  providerName: {
    fontSize: getResponsiveFontSize(16, 17, 18),
    fontWeight: '700',
    color: '#1F2937',
    flex: 1,
  },
  verificationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: getResponsiveSpacing(8, 10, 12),
    paddingVertical: getResponsiveSpacing(4, 6, 8),
    borderRadius: 12,
    marginLeft: getResponsiveSpacing(8, 10, 12),
  },
  verificationText: {
    fontSize: getResponsiveFontSize(11, 12, 13),
    fontWeight: '600',
    marginLeft: 4,
    color: 'white',
  },
  moreButton: {
    padding: getResponsiveSpacing(6, 8, 10),
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },

  // Provider Details
  providerDetails: {
    marginBottom: getResponsiveSpacing(12, 14, 16),
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: getResponsiveSpacing(8, 10, 12),
  },
  detailIconContainer: {
    width: getResponsiveValue(32, 36, 40),
    height: getResponsiveValue(32, 36, 40),
    borderRadius: 8,
    backgroundColor: PRIMARY_BLUE,
    borderWidth: 1,
    borderColor: PRIMARY_BLUE_BORDER,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: getResponsiveSpacing(10, 12, 14),
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    fontSize: getResponsiveFontSize(11, 12, 13),
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  detailText: {
    fontSize: getResponsiveFontSize(14, 15, 16),
    color: '#374151',
    fontWeight: '500',
  },

  // Service Description
  serviceDescription: {
    marginBottom: getResponsiveSpacing(12, 14, 16),
    paddingTop: getResponsiveSpacing(12, 14, 16),
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  serviceDescriptionTitle: {
    fontSize: getResponsiveFontSize(13, 14, 15),
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  serviceDescriptionText: {
    fontSize: getResponsiveFontSize(14, 15, 16),
    color: '#6B7280',
    lineHeight: 20,
    fontWeight: '500',
  },

  // Provider Actions
  providerActions: {
    flexDirection: 'row',
    gap: getResponsiveSpacing(8, 10, 12),
    paddingTop: getResponsiveSpacing(12, 14, 16),
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  viewButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: getResponsiveSpacing(10, 12, 14),
    borderRadius: 12,
    backgroundColor: PRIMARY_BLUE,
    borderWidth: 1,
    borderColor: PRIMARY_BLUE,
  },
  viewButtonText: {
    fontSize: getResponsiveFontSize(13, 14, 15),
    fontWeight: '600',
    color: 'white',
    marginLeft: 6,
  },
  removeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: getResponsiveSpacing(10, 12, 14),
    borderRadius: 12,
    backgroundColor: DANGER_RED,
    borderWidth: 1,
    borderColor: DANGER_RED_BORDER,
  },
  removeButtonText: {
    fontSize: getResponsiveFontSize(13, 14, 15),
    fontWeight: '600',
    color: 'white',
    marginLeft: 6,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    width: '100%',
    borderRadius: 16,
    backgroundColor: '#fff',
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  modalTitle: {
    fontSize: getResponsiveFontSize(18, 19, 20),
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  modalMessage: {
    fontSize: getResponsiveFontSize(14, 15, 16),
    color: '#374151',
    lineHeight: 20,
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  modalButton: {
    minWidth: 100,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalButtonCancel: {
    backgroundColor: PRIMARY_BLUE,
  },
  modalButtonDestructive: {
    backgroundColor: DANGER_RED,
  },
  modalButtonText: {
    color: 'white',
    fontSize: getResponsiveFontSize(13, 14, 15),
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});