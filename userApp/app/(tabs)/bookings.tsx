import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert, RefreshControl, Dimensions, StatusBar, Platform, Modal, ScrollView, TextInput, useWindowDimensions } from 'react-native';
import { BookingItem } from '@/components/bookings/BookingItem';
import { useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/context/NotificationContext';
import { useLanguage } from '@/context/LanguageContext';
import { format } from 'date-fns';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { io as socketIOClient } from 'socket.io-client';
import { router } from 'expo-router';
import { API_BASE_URL } from '@/constants/api';
import { Bell, Search, Filter, Calendar, Clock, MapPin, X, Check, ChevronDown, ChevronUp, CreditCard } from 'lucide-react-native';
import { SafeView } from '@/components/SafeView';

const getBookingStatuses = (t: any) => [t('bookings.all'), t('bookings.upcoming'), t('bookings.completed'), t('bookings.cancelled')];

const getDateRangeOptions = (t: any) => [
  { label: t('bookings.allTime'), value: 'all' },
  { label: t('bookings.today'), value: 'today' },
  { label: t('bookings.thisWeek'), value: 'week' },
  { label: t('bookings.thisMonth'), value: 'month' }
];

const getSortOptions = (t: any) => [
  { label: t('bookings.date'), value: 'date' },
  { label: t('bookings.status'), value: 'status' },
  { label: t('bookings.provider'), value: 'provider' }
];

const getSortOrderOptions = (t: any) => [
  { label: t('bookings.newestFirst'), value: 'desc' },
  { label: t('bookings.oldestFirst'), value: 'asc' }
];
const DEFAULT_PROVIDER_IMAGE = 'https://images.pexels.com/photos/1216589/pexels-photo-1216589.jpeg?auto=compress&cs=tinysrgb&w=600';
const SCREEN_HEIGHT = Dimensions.get('window').height;
const SCREEN_WIDTH = Dimensions.get('window').width;

// Responsive design constants - will be updated dynamically
let isSmallDevice = SCREEN_WIDTH < 375;
let isMediumDevice = SCREEN_WIDTH >= 375 && SCREEN_WIDTH < 414;
let isLargeDevice = SCREEN_WIDTH >= 414;

// Responsive spacing
const getResponsiveSpacing = (small: number, medium: number, large: number) => {
  if (isSmallDevice) return small;
  if (isMediumDevice) return medium;
  return large;
};

// Responsive font sizes
const getResponsiveFontSize = (small: number, medium: number, large: number) => {
  if (isSmallDevice) return small;
  if (isMediumDevice) return medium;
  return large;
};

export default function BookingsScreen() {
  const { t } = useLanguage();
  const { user, isLoading: authLoading } = useAuth();
  const { unreadCount } = useNotifications();
  const { width, height } = useWindowDimensions();
  const [selectedStatus, setSelectedStatus] = useState(t('bookings.all'));
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [dimensions, setDimensions] = useState(Dimensions.get('window'));
  
  // Filter state - Initialize with translated values
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [filterStatus, setFilterStatus] = useState(t('bookings.all'));
  const [filterDateRange, setFilterDateRange] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [filterServiceType, setFilterServiceType] = useState(t('bookings.all'));
  const [filterProvider, setFilterProvider] = useState(t('bookings.all'));
  const [filterSortBy, setFilterSortBy] = useState<'date' | 'status' | 'provider'>('date');
  const [filterSortOrder, setFilterSortOrder] = useState<'asc' | 'desc'>('desc');
  const [activeFilters, setActiveFilters] = useState(0);

  // Get dynamic arrays with translations
  const bookingStatuses = getBookingStatuses(t);
  const dateRangeOptions = getDateRangeOptions(t);
  const sortOptions = getSortOptions(t);
  const sortOrderOptions = getSortOrderOptions(t);

  // Update state when language changes
  useEffect(() => {
    setSelectedStatus(t('bookings.all'));
    setFilterStatus(t('bookings.all'));
    setFilterServiceType(t('bookings.all'));
    setFilterProvider(t('bookings.all'));
  }, [t]);

  // Helper function to get English status from translated status
  const getEnglishStatus = (translatedStatus: string) => {
    const statusMap: { [key: string]: string } = {
      [t('bookings.all')]: 'all',
      [t('bookings.upcoming')]: 'upcoming', // Special case - will be handled in filter
      [t('bookings.completed')]: 'completed',
      [t('bookings.cancelled')]: 'cancelled',
      [t('bookings.pending')]: 'pending',
      [t('bookings.accepted')]: 'accepted',
      [t('bookings.rejected')]: 'rejected',
    };
    return statusMap[translatedStatus] || translatedStatus.toLowerCase();
  };

  // Helper function to get translated status from English status
  const getTranslatedStatus = (englishStatus: string) => {
    const statusMap: { [key: string]: string } = {
      'all': t('bookings.all'),
      'upcoming': t('bookings.upcoming'),
      'completed': t('bookings.completed'),
      'cancelled': t('bookings.cancelled'),
      'pending': t('bookings.pending'),
      'accepted': t('bookings.accepted'),
      'rejected': t('bookings.rejected'),
    };
    return statusMap[englishStatus.toLowerCase()] || englishStatus;
  };

  // Handle screen size changes (orientation, etc.)
  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      setDimensions(window);
    });

    return () => subscription?.remove();
  }, []);

  // Update responsive constants when dimensions change
  useEffect(() => {
    isSmallDevice = width < 375;
    isMediumDevice = width >= 375 && width < 414;
    isLargeDevice = width >= 414;
  }, [width]);

  useEffect(() => {
    // Wait for auth to finish loading before fetching data
    if (!authLoading && user?.id) {
      fetchBookings(true);
      
      // Setup socket connection
      const socket = socketIOClient(`${API_BASE_URL}`);
      socket.on('connect', () => console.log('Socket connected:', socket.id));
      socket.emit('join', user.id);
      socket.on('booking_created', () => {
        fetchBookings(false).catch((error) => {
          // Errors are already handled in fetchBookings, but catch here to prevent unhandled rejections
          const isSessionExpired = error?.message === 'Session expired' || 
                                   error?.status === 401 && error?.message?.includes('Session expired');
          if (!isSessionExpired) {
            console.warn('fetchBookings error on booking_created (handled):', error?.message || error);
          }
        });
      });
      socket.on('booking_updated', () => {
        fetchBookings(false).catch((error) => {
          // Errors are already handled in fetchBookings, but catch here to prevent unhandled rejections
          const isSessionExpired = error?.message === 'Session expired' || 
                                   error?.status === 401 && error?.message?.includes('Session expired');
          if (!isSessionExpired) {
            console.warn('fetchBookings error on booking_updated (handled):', error?.message || error);
          }
        });
      });
      socket.on('disconnect', () => console.log('Socket disconnected'));
      socket.on('error', (error) => {
        // Handle socket errors silently - they're usually connection issues
        console.warn('Socket error (handled):', error);
      });
      return () => {
        socket.disconnect();
      };
    } else if (!authLoading && !user?.id) {
      // Auth finished loading but no user, set loading to false
      setLoading(false);
    }
  }, [user?.id, authLoading]);

  const fetchBookings = async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      // Use centralized API client so token refresh and reconnection are handled globally
      const { apiGet } = await import('@/utils/apiClient');

      const response = await apiGet<{ status: string; data: { bookings: any[] } }>('/api/bookings');

      if (response.ok && response.data && response.data.status === 'success') {
        // Map backend fields to BookingItem props
        const mapped = response.data.data.bookings.map((b: any) => ({
          id: b.id,
          serviceName: b.service_name,
          providerName: b.provider_name,
          appointmentDate: b.appointment_date,
          appointmentTime: b.appointment_time,
          status: b.status,
          imageUrl: b.provider_profile_pic_url || DEFAULT_PROVIDER_IMAGE,
          reportReason: b.report_reason,
          reportDescription: b.report_description,
          rating: b.rating,
        }));
        setBookings(mapped);
      } else {
        const message =
          (response.data && (response.data as any).message) ||
          'Failed to fetch bookings. Please pull to refresh.';
        setError(message);
      }
    } catch (err: any) {
      // apiClient already handled token refresh / logout; just show a soft, generic message
      setError('Unable to load bookings right now. Please check your connection and try again.');
    } finally {
      if (showSpinner) setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchBookings(false);
  };

  const handleStatusChange = (bookingId: string, newStatus: string) => {
    setBookings(prevBookings => 
      prevBookings.map(booking => 
        booking.id === bookingId 
          ? { ...booking, status: newStatus }
          : booking
      )
    );
  };

  const handleBookingReported = (bookingId: string) => {
    // Refresh the bookings to get updated report information
    fetchBookings(false);
  };

  const getStatusCount = (status: string) => {
    if (status === t('bookings.all')) return bookings.length;
    
    const englishStatus = getEnglishStatus(status);
    return bookings.filter(booking => {
      const bookingStatus = booking.status.toLowerCase();
      
      if (englishStatus === 'upcoming') {
        // Upcoming includes both pending and accepted bookings
        return bookingStatus === 'pending' || bookingStatus === 'accepted';
      } else {
        // Direct status match
        return bookingStatus === englishStatus;
      }
    }).length;
  };

  // Filter functions
  const getUniqueServiceTypes = () => {
    const serviceTypes = bookings.map(booking => booking.serviceName);
    return [t('bookings.all'), ...Array.from(new Set(serviceTypes))];
  };

  const getUniqueProviders = () => {
    const providers = bookings.map(booking => booking.providerName);
    return [t('bookings.all'), ...Array.from(new Set(providers))];
  };

  const isDateInRange = (dateString: string, range: string) => {
    const bookingDate = new Date(dateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    switch (range) {
      case 'today':
        return bookingDate.toDateString() === today.toDateString();
      case 'week':
        const weekAgo = new Date(today);
        weekAgo.setDate(today.getDate() - 7);
        return bookingDate >= weekAgo && bookingDate <= today;
      case 'month':
        const monthAgo = new Date(today);
        monthAgo.setMonth(today.getMonth() - 1);
        return bookingDate >= monthAgo && bookingDate <= today;
      default:
        return true;
    }
  };

  const applyFilters = () => {
    let filtered = bookings;

    // Apply status filter - Check both quick filter (selectedStatus) and modal filter (filterStatus)
    const activeStatus = filterStatus !== t('bookings.all') ? filterStatus : selectedStatus;
    if (activeStatus !== t('bookings.all')) {
      const englishStatus = getEnglishStatus(activeStatus);
      
      filtered = filtered.filter(booking => {
        const bookingStatus = booking.status.toLowerCase();
        
        if (englishStatus === 'upcoming') {
          // Upcoming includes both pending and accepted bookings
          return bookingStatus === 'pending' || bookingStatus === 'accepted';
        } else {
          // Direct status match
          return bookingStatus === englishStatus;
        }
      });
    }

    // Apply date range filter
    if (filterDateRange !== 'all') {
      filtered = filtered.filter(booking => isDateInRange(booking.appointmentDate, filterDateRange));
    }

    // Apply service type filter
    if (filterServiceType !== t('bookings.all')) {
      filtered = filtered.filter(booking => booking.serviceName === filterServiceType);
    }

    // Apply provider filter
    if (filterProvider !== t('bookings.all')) {
      filtered = filtered.filter(booking => booking.providerName === filterProvider);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let comparison = 0;
      switch (filterSortBy) {
        case 'date':
          comparison = new Date(a.appointmentDate).getTime() - new Date(b.appointmentDate).getTime();
          break;
        case 'status':
          comparison = a.status.localeCompare(b.status);
          break;
        case 'provider':
          comparison = a.providerName.localeCompare(b.providerName);
          break;
      }
      return filterSortOrder === 'asc' ? comparison : -comparison;
    });

    return filtered;
  };

  const resetFilters = () => {
    setFilterStatus(t('bookings.all'));
    setFilterDateRange('all');
    setFilterServiceType(t('bookings.all'));
    setFilterProvider(t('bookings.all'));
    setFilterSortBy('date');
    setFilterSortOrder('desc');
  };

  const applyFilterChanges = () => {
    setSelectedStatus(filterStatus);
    setShowFilterModal(false);
  };

  const countActiveFilters = () => {
    let count = 0;
    if (filterStatus !== t('bookings.all')) count++;
    if (filterDateRange !== 'all') count++;
    if (filterServiceType !== t('bookings.all')) count++;
    if (filterProvider !== t('bookings.all')) count++;
    if (filterSortBy !== 'date' || filterSortOrder !== 'desc') count++;
    return count;
  };

  const filteredBookings = applyFilters();

  return (
    <SafeView style={styles.container} backgroundColor="#F8FAFC" excludeBottom={true}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      
             {/* Enhanced Header */}
       <View style={styles.header}>
         <View style={styles.headerTop}>
           <View style={styles.headerLeft}>
             <Text style={styles.title}>{t('bookings.title')}</Text>
             <Text style={styles.subtitle}>{t('bookings.subtitle')}</Text>
           </View>
           <TouchableOpacity 
            style={styles.notificationButton}
            onPress={() => setShowFilterModal(true)}
          >
            <Filter size={24} color={countActiveFilters() > 0 ? "#3B82F6" : "#64748B"} />
            {countActiveFilters() > 0 && (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{countActiveFilters()}</Text>
              </View>
            )}
          </TouchableOpacity>
         </View>
       </View>

             {/* Content Area */}
      {loading && bookings.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>{t('bookings.loadingBookings')}</Text>
        </View>
      ) : error ? (
        <View style={styles.errorContainer}>
          <View style={styles.errorIcon}>
            <Text style={styles.errorIconText}>⚠️</Text>
          </View>
          <Text style={styles.errorTitle}>{t('bookings.oopsSomethingWentWrong')}</Text>
          <Text style={styles.errorMessage}>{error}</Text>
          <TouchableOpacity onPress={() => fetchBookings(true)} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>{t('bookings.tryAgain')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredBookings}
          contentContainerStyle={styles.bookingsList}
          renderItem={({ item }) => (
            <BookingItem 
              booking={item} 
              onStatusChange={handleStatusChange}
              onBookingReported={handleBookingReported}
            />
          )}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl 
              refreshing={refreshing} 
              onRefresh={onRefresh}
              colors={['#3B82F6']}
              tintColor="#3B82F6"
            />
          }
                     ListHeaderComponent={
             <View>
               {/* Labour Access Button */}
               <View style={styles.labourAccessSection}>
                 <TouchableOpacity 
                   style={styles.labourAccessButton}
                   onPress={() => router.push('/labour-access-simple' as any)}
                 >
                   <CreditCard size={20} color="#3B82F6" />
                   <Text style={styles.labourAccessButtonText}>Labour Service Access</Text>
                 </TouchableOpacity>
               </View>

               {/* Enhanced Filter Section */}
               <View style={styles.filterSection}>
                                   <View style={styles.filterHeader}>
                    <Text style={styles.filterTitle}>{t('bookings.filterByStatus')}</Text>
                  </View>
                 <FlatList
                   data={bookingStatuses}
                   horizontal
                   showsHorizontalScrollIndicator={false}
                   contentContainerStyle={styles.filterList}
                   style={styles.filterFlatList}
                   bounces={true}
                   alwaysBounceHorizontal={false}
                   decelerationRate="fast"
                   snapToAlignment="start"
                   renderItem={({ item }: { item: string }) => (
                     <TouchableOpacity
                       style={[
                         styles.filterButton,
                         selectedStatus === item && styles.filterButtonActive,
                       ]}
                       onPress={() => {
                         setSelectedStatus(item);
                         // Reset modal filter to avoid conflicts
                         setFilterStatus(t('bookings.all'));
                       }}
                     >
                       <Text
                         style={[
                           styles.filterButtonText,
                           selectedStatus === item && styles.filterButtonTextActive,
                         ]}
                       >
                         {item}
                       </Text>
                       <View style={[
                         styles.filterCount,
                         selectedStatus === item && styles.filterCountActive
                       ]}>
                         <Text style={[
                           styles.filterCountText,
                           selectedStatus === item && styles.filterCountTextActive
                         ]}>
                           {getStatusCount(item)}
                         </Text>
                       </View>
                     </TouchableOpacity>
                   )}
                   keyExtractor={(item) => item}
                 />
               </View>
               
               {filteredBookings.length > 0 && (
                 <View style={styles.listHeader}>
                   <Text style={styles.listHeaderTitle}>
                     {selectedStatus === t('bookings.all') ? t('bookings.allBookings') : `${selectedStatus} ${t('bookings.allBookings').split(' ')[1]}`}
                   </Text>
                   <Text style={styles.listHeaderSubtitle}>
                     {filteredBookings.length === 1 
                       ? t('bookings.bookingsFound', { count: filteredBookings.length.toString() })
                       : t('bookings.bookingsFoundPlural', { count: filteredBookings.length.toString() })
                     }
                   </Text>
                 </View>
               )}
             </View>
           }
          ListEmptyComponent={
            <View style={styles.emptyStateContainer}>
              <View style={styles.emptyStateIcon}>
                <Calendar size={64} color="#CBD5E1" />
              </View>
              <Text style={styles.emptyStateTitle}>{t('bookings.noBookingsAvailable')}</Text>
              <Text style={styles.emptyStateSubtitle}>
                {selectedStatus === t('bookings.all') 
                  ? t('bookings.noBookingsYet')
                  : t('bookings.noBookingsFound', { status: selectedStatus.toLowerCase() })
                }
              </Text>
              {selectedStatus === t('bookings.all') && (
                <TouchableOpacity
                  style={styles.emptyStateButton}
                  onPress={() => router.push('/')}
                >
                  <Text style={styles.emptyStateButtonText}>{t('bookings.exploreServices')}</Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      )}

      {/* Filter Modal */}
      <Modal
        visible={showFilterModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowFilterModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity 
              onPress={() => setShowFilterModal(false)}
              style={styles.closeButton}
            >
              <X size={24} color="#64748B" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{t('bookings.filterBookings')}</Text>
            <TouchableOpacity 
              onPress={resetFilters}
              style={styles.resetButton}
            >
              <Text style={styles.resetButtonText}>{t('bookings.reset')}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            {/* Status Filter */}
            <View style={styles.filterSection}>
              <Text style={styles.filterSectionTitle}>{t('bookings.status')}</Text>
              <View style={styles.filterOptions}>
                {bookingStatuses.map((status: string) => (
                  <TouchableOpacity
                    key={status}
                    style={[
                      styles.filterOption,
                      filterStatus === status && styles.filterOptionActive
                    ]}
                    onPress={() => setFilterStatus(status)}
                  >
                    <Text style={[
                      styles.filterOptionText,
                      filterStatus === status && styles.filterOptionTextActive
                    ]}>
                      {status}
                    </Text>
                    {filterStatus === status && <Check size={16} color="#3B82F6" />}
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Date Range Filter */}
            <View style={styles.filterSection}>
              <Text style={styles.filterSectionTitle}>{t('bookings.dateRange')}</Text>
              <View style={styles.filterOptions}>
                {dateRangeOptions.map((option: { label: string; value: string }) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.filterOption,
                      filterDateRange === option.value && styles.filterOptionActive
                    ]}
                    onPress={() => setFilterDateRange(option.value as any)}
                  >
                    <Text style={[
                      styles.filterOptionText,
                      filterDateRange === option.value && styles.filterOptionTextActive
                    ]}>
                      {option.label}
                    </Text>
                    {filterDateRange === option.value && <Check size={16} color="#3B82F6" />}
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Service Type Filter */}
            <View style={styles.filterSection}>
              <Text style={styles.filterSectionTitle}>{t('bookings.serviceType')}</Text>
              <View style={styles.filterOptions}>
                {getUniqueServiceTypes().map((serviceType) => (
                  <TouchableOpacity
                    key={serviceType}
                    style={[
                      styles.filterOption,
                      filterServiceType === serviceType && styles.filterOptionActive
                    ]}
                    onPress={() => setFilterServiceType(serviceType)}
                  >
                    <Text style={[
                      styles.filterOptionText,
                      filterServiceType === serviceType && styles.filterOptionTextActive
                    ]}>
                      {serviceType}
                    </Text>
                    {filterServiceType === serviceType && <Check size={16} color="#3B82F6" />}
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Provider Filter */}
            <View style={styles.filterSection}>
              <Text style={styles.filterSectionTitle}>{t('bookings.provider')}</Text>
              <View style={styles.filterOptions}>
                {getUniqueProviders().map((provider) => (
                  <TouchableOpacity
                    key={provider}
                    style={[
                      styles.filterOption,
                      filterProvider === provider && styles.filterOptionActive
                    ]}
                    onPress={() => setFilterProvider(provider)}
                  >
                    <Text style={[
                      styles.filterOptionText,
                      filterProvider === provider && styles.filterOptionTextActive
                    ]}>
                      {provider}
                    </Text>
                    {filterProvider === provider && <Check size={16} color="#3B82F6" />}
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Sort Options */}
            <View style={styles.filterSection}>
              <Text style={styles.filterSectionTitle}>{t('bookings.sortBy')}</Text>
              <View style={styles.sortContainer}>
                <View style={styles.sortRow}>
                  <Text style={styles.sortLabel}>{t('bookings.sortBy')}:</Text>
                  <View style={styles.sortDropdown}>
                    {sortOptions.map((option: { label: string; value: string }) => (
                      <TouchableOpacity
                        key={option.value}
                        style={[
                          styles.sortOption,
                          filterSortBy === option.value && styles.sortOptionActive
                        ]}
                        onPress={() => setFilterSortBy(option.value as any)}
                      >
                        <Text style={[
                          styles.sortOptionText,
                          filterSortBy === option.value && styles.sortOptionTextActive
                        ]}>
                          {option.label}
                        </Text>
                        {filterSortBy === option.value && <Check size={16} color="#3B82F6" />}
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                <View style={styles.sortRow}>
                  <Text style={styles.sortLabel}>{t('bookings.order')}:</Text>
                  <View style={styles.sortDropdown}>
                    {sortOrderOptions.map((option: { label: string; value: string }) => (
                      <TouchableOpacity
                        key={option.value}
                        style={[
                          styles.sortOption,
                          filterSortOrder === option.value && styles.sortOptionActive
                        ]}
                        onPress={() => setFilterSortOrder(option.value as any)}
                      >
                        <Text style={[
                          styles.sortOptionText,
                          filterSortOrder === option.value && styles.sortOptionTextActive
                        ]}>
                          {option.label}
                        </Text>
                        {filterSortOrder === option.value && <Check size={16} color="#3B82F6" />}
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>
            </View>
          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={styles.modalCancelButton}
              onPress={() => setShowFilterModal(false)}
            >
              <Text style={styles.modalCancelButtonText}>{t('bookings.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalApplyButton}
              onPress={applyFilterChanges}
            >
              <Text style={styles.modalApplyButtonText}>{t('bookings.applyFilters')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    minHeight: 0,
  },
  header: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: getResponsiveSpacing(16, 20, 24),
    paddingTop: 16,
    paddingBottom: getResponsiveSpacing(20, 24, 28),
    borderBottomLeftRadius: getResponsiveSpacing(20, 24, 28),
    borderBottomRightRadius: getResponsiveSpacing(20, 24, 28),
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerLeft: {
    flex: 1,
  },
  greeting: {
    fontSize: 16,
    color: '#64748B',
    marginBottom: 2,
  },
  userName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1E293B',
  },
  notificationButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    position: 'relative',
  },
  notificationBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#EF4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    zIndex: 10,
  },
  notificationBadgeText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: 'bold',
  },
  headerBottom: {
    marginTop: 8,
    marginBottom: 8,
  },
  title: {
    fontSize: getResponsiveFontSize(24, 28, 32),
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: getResponsiveSpacing(2, 4, 6),
  },
  subtitle: {
    fontSize: getResponsiveFontSize(14, 16, 18),
    color: '#64748B',
    lineHeight: getResponsiveSpacing(18, 22, 26),
  },
  filterSection: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 0,
    marginTop: getResponsiveSpacing(12, 16, 20),
    marginBottom: getResponsiveSpacing(12, 16, 20),
    borderRadius: getResponsiveSpacing(8, 12, 16),
    padding: getResponsiveSpacing(12, 16, 20),
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    marginBottom: 12,
  },
  filterTitle: {
    fontSize: getResponsiveFontSize(16, 18, 20),
    fontWeight: '600',
    color: '#1E293B',
  },
  filterIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterList: {
    paddingBottom: 4,
  },
  filterFlatList: {
    flexGrow: 0,
    minHeight: 50,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: getResponsiveSpacing(12, 16, 20),
    paddingVertical: getResponsiveSpacing(8, 10, 12),
    borderRadius: getResponsiveSpacing(20, 24, 28),
    backgroundColor: '#F8FAFC',
    marginRight: getResponsiveSpacing(8, 12, 16),
    borderWidth: 1,
    borderColor: '#E2E8F0',
    minWidth: getResponsiveSpacing(70, 80, 90),
    height: getResponsiveSpacing(36, 40, 44),
  },
  filterButtonActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  filterButtonText: {
    fontSize: getResponsiveFontSize(12, 14, 16),
    fontWeight: '600',
    color: '#64748B',
    marginRight: getResponsiveSpacing(6, 8, 10),
  },
  filterButtonTextActive: {
    color: '#FFFFFF',
  },
  filterCount: {
    backgroundColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 20,
    alignItems: 'center',
  },
  filterCountActive: {
    backgroundColor: '#FFFFFF',
  },
  filterCountText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  filterCountTextActive: {
    color: '#3B82F6',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#64748B',
    textAlign: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  errorIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  errorIconText: {
    fontSize: 32,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 16,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  retryButton: {
    backgroundColor: '#3B82F6',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    minWidth: 140,
    alignItems: 'center',
  },
  retryButtonText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 16,
  },
  bookingsList: {
    paddingHorizontal: getResponsiveSpacing(16, 20, 24),
    paddingTop: 0,
    paddingBottom: getResponsiveSpacing(32, 40, 48),
    flexGrow: 1,
  },
  listHeader: {
    marginBottom: 16,
  },
  listHeaderTitle: {
    fontSize: getResponsiveFontSize(18, 20, 22),
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: getResponsiveSpacing(2, 4, 6),
  },
  listHeaderSubtitle: {
    fontSize: getResponsiveFontSize(12, 14, 16),
    color: '#64748B',
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: SCREEN_HEIGHT * 0.4,
    paddingHorizontal: 24,
  },
  emptyStateIcon: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  emptyStateTitle: {
    color: '#1E293B',
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyStateSubtitle: {
    color: '#64748B',
    fontSize: 16,
    marginBottom: 32,
    textAlign: 'center',
    lineHeight: 22,
  },
  emptyStateButton: {
    backgroundColor: '#3B82F6',
    paddingVertical: getResponsiveSpacing(14, 16, 18),
    paddingHorizontal: getResponsiveSpacing(20, 24, 28),
    borderRadius: getResponsiveSpacing(10, 12, 14),
    width: '100%',
    maxWidth: getResponsiveSpacing(240, 280, 320),
    minHeight: getResponsiveSpacing(50, 56, 62),
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
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
  emptyStateButtonText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: getResponsiveFontSize(14, 16, 18),
    textAlign: 'center',
    lineHeight: getResponsiveFontSize(18, 20, 22),
    flexShrink: 1,
    paddingHorizontal: 4,
  },
  // Filter modal styles
  filterBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#3B82F6',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    zIndex: 10,
  },
  filterBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  closeButton: {
    padding: 4,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1E293B',
    flex: 1,
    textAlign: 'center',
  },
  resetButton: {
    padding: 8,
  },
  resetButtonText: {
    color: '#3B82F6',
    fontSize: 16,
    fontWeight: '500',
  },
  modalContent: {
    flex: 1,
    paddingHorizontal: 16,
  },
  filterSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 12,
    marginTop: 16,
  },
  filterOptions: {
    gap: 8,
  },
  filterOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterOptionActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#3B82F6',
  },
  filterOptionText: {
    fontSize: 16,
    color: '#1E293B',
    fontWeight: '500',
  },
  filterOptionTextActive: {
    color: '#3B82F6',
    fontWeight: '600',
  },
  sortContainer: {
    gap: 16,
  },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sortLabel: {
    fontSize: 16,
    color: '#64748B',
    fontWeight: '500',
    minWidth: 80,
  },
  sortDropdown: {
    flex: 1,
    gap: 8,
  },
  sortOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sortOptionActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#3B82F6',
  },
  sortOptionText: {
    fontSize: 14,
    color: '#1E293B',
    fontWeight: '500',
  },
  sortOptionTextActive: {
    color: '#3B82F6',
    fontWeight: '600',
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: getResponsiveSpacing(14, 16, 18),
    paddingHorizontal: getResponsiveSpacing(8, 12, 16),
    backgroundColor: '#F1F5F9',
    borderRadius: getResponsiveSpacing(10, 12, 14),
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: getResponsiveSpacing(48, 52, 56),
  },
  modalCancelButtonText: {
    color: '#64748B',
    fontSize: getResponsiveFontSize(14, 16, 18),
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: getResponsiveFontSize(18, 20, 22),
    flexShrink: 1,
  },
  modalApplyButton: {
    flex: 1,
    paddingVertical: getResponsiveSpacing(14, 16, 18),
    paddingHorizontal: getResponsiveSpacing(8, 12, 16),
    backgroundColor: '#3B82F6',
    borderRadius: getResponsiveSpacing(10, 12, 14),
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: getResponsiveSpacing(48, 52, 56),
  },
  modalApplyButtonText: {
    color: '#FFFFFF',
    fontSize: getResponsiveFontSize(14, 16, 18),
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: getResponsiveFontSize(18, 20, 22),
    flexShrink: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  labourButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F9FF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  labourButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3B82F6',
    marginLeft: 6,
  },
  labourAccessSection: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#F0F9FF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  labourAccessButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3B82F6',
    ...Platform.select({
      ios: {
        shadowColor: '#3B82F6',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  labourAccessButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3B82F6',
    marginLeft: 12,
  },
});