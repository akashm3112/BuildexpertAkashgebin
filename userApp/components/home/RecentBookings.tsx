import React, { useEffect, useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  Platform,
  Dimensions,
  ActivityIndicator
} from 'react-native';
import { Calendar, ChevronRight, Clock, CheckCircle, XCircle, AlertTriangle } from 'lucide-react-native';
import { useAuth } from '@/context/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { format, isToday, isTomorrow, parseISO } from 'date-fns';
import { router } from 'expo-router';
import { API_BASE_URL } from '@/constants/api';

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

const getResponsiveFontSize = (small: number, medium: number, large: number) => {
  if (isSmallScreen) return small;
  if (isMediumScreen) return medium;
  return large;
};

export default function RecentBookings() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBookings = async () => {
      setLoading(true);
      let token = user?.token;
      if (!token) {
        const storedToken = await AsyncStorage.getItem('token');
        token = storedToken === null ? undefined : storedToken;
      }
      if (!token) {
        setBookings([]);
        setLoading(false);
        return;
      }
      try {
        console.log('🔍 RecentBookings: Fetching bookings...');
        console.log('🔍 API URL:', `${API_BASE_URL}/api/bookings`);
        console.log('🔍 Token available:', !!token);
        
        const response = await fetch(`${API_BASE_URL}/api/bookings`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        
        console.log('🔍 Response status:', response.status);
        const data = await response.json();
        console.log('🔍 Response data:', data);
        
        if (response.ok && data.status === 'success') {
          const rawBookings = data.data.bookings || [];
          console.log('🔍 Raw bookings count:', rawBookings.length);
          
          setBookings(rawBookings.slice(0, 2).map((b: any) => {
            let dateStr = b.appointment_date;
            let timeStr = b.appointment_time;
            let displayDate = '';
            if (dateStr) {
              try {
                const dateObj = parseISO(dateStr);
                if (isToday(dateObj)) {
                  displayDate = 'Today';
                } else if (isTomorrow(dateObj)) {
                  displayDate = 'Tomorrow';
                } else {
                  displayDate = format(dateObj, 'dd MMM yyyy');
                }
                if (timeStr) {
                  displayDate += ', ' + timeStr;
                }
              } catch {
                displayDate = dateStr + (timeStr ? (', ' + timeStr) : '');
              }
            } else {
              displayDate = timeStr || '';
            }
            return {
              id: b.id,
              serviceName: (b.service_name || '').toUpperCase(),
              date: displayDate,
              status: b.status,
            };
          }));
        } else {
          console.log('❌ RecentBookings: API error or unsuccessful response');
          setBookings([]);
        }
      } catch (err) {
        console.error('❌ RecentBookings: Fetch error:', err);
        setBookings([]);
      } finally {
        setLoading(false);
      }
    };
    fetchBookings();
  }, [user]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color="#3B82F6" />
        <Text style={styles.loadingText}>Loading recent bookings...</Text>
      </View>
    );
  }

  if (bookings.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No recent bookings</Text>
        <TouchableOpacity 
          style={styles.bookButton} 
          onPress={() => {
            console.log('🧭 Navigating to services from recent bookings');
            router.push('/(tabs)'); // Navigate to home tab where services are
          }}
        >
          <Text style={styles.bookButtonText}>Book a Service</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const getStatusStyle = (status: string) => {
    switch (status.toLowerCase()) {
      case 'accepted':
      case 'upcoming':
        return { 
          bg: '#ECFDF5', 
          text: '#10B981', 
          label: 'Accepted',
          icon: CheckCircle
        };
      case 'completed':
        return { 
          bg: '#EEF2FF', 
          text: '#6366F1', 
          label: 'Completed',
          icon: CheckCircle
        };
      case 'cancelled':
        return { 
          bg: '#FEF2F2', 
          text: '#EF4444', 
          label: 'Cancelled',
          icon: XCircle
        };
      case 'rejected':
        return { 
          bg: '#FEF2F2', 
          text: '#EF4444', 
          label: 'Rejected',
          icon: XCircle
        };
      case 'pending':
        return { 
          bg: '#FEF3C7', 
          text: '#F59E0B', 
          label: 'Pending',
          icon: Clock
        };
      default:
        return { 
          bg: '#F1F5F9', 
          text: '#64748B', 
          label: status.charAt(0).toUpperCase() + status.slice(1),
          icon: AlertTriangle
        };
    }
  };

  // Create responsive styles
  const responsiveStyles = {
    container: {
      ...styles.container,
      borderRadius: getResponsiveSpacing(10, 12, 14),
      shadowRadius: getResponsiveSpacing(3, 4, 5),
    },
    bookingItem: {
      ...styles.bookingItem,
      padding: getResponsiveSpacing(14, 16, 18),
    },
    iconContainer: {
      ...styles.iconContainer,
      width: getResponsiveSpacing(44, 48, 52),
      height: getResponsiveSpacing(44, 48, 52),
      borderRadius: getResponsiveSpacing(22, 24, 26),
      marginRight: getResponsiveSpacing(12, 14, 16),
    },
    serviceName: {
      ...styles.serviceName,
      fontSize: getResponsiveFontSize(15, 16, 17),
      lineHeight: getResponsiveFontSize(20, 22, 24),
    },
    bookingDate: {
      ...styles.bookingDate,
      fontSize: getResponsiveFontSize(12, 13, 14),
      lineHeight: getResponsiveFontSize(16, 18, 20),
    },
  };

  return (
    <View style={responsiveStyles.container}>
      {/* Section Header */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Recent Bookings</Text>
        <TouchableOpacity 
          style={styles.viewAllLink}
          onPress={() => {
            console.log('🧭 Navigating to bookings tab from view all link');
            router.push('/(tabs)/bookings');
          }}
        >
          <Text style={styles.viewAllLinkText}>View All</Text>
          <ChevronRight size={14} color="#3B82F6" />
        </TouchableOpacity>
      </View>

      {/* Booking Cards */}
      <View style={styles.bookingsContainer}>
        {bookings.map((booking, index) => {
          const statusStyle = getStatusStyle(booking.status);
          const StatusIcon = statusStyle.icon;
          const isLastItem = index === bookings.length - 1;
          
          return (
            <TouchableOpacity 
              key={booking.id} 
              style={[
                responsiveStyles.bookingItem,
                isLastItem && styles.lastBookingItem
              ]}
              activeOpacity={0.8}
              onPress={() => {
                console.log('🧭 Navigating to bookings tab from recent booking item');
                router.push('/(tabs)/bookings');
              }}
            >
              {/* Left side - Service info */}
              <View style={styles.bookingMainContent}>
                <View style={responsiveStyles.iconContainer}>
                  <Calendar size={getResponsiveSpacing(18, 20, 22)} color="#FFFFFF" />
                </View>
                <View style={styles.bookingInfo}>
                  <Text style={responsiveStyles.serviceName} numberOfLines={1} ellipsizeMode="tail">
                    {booking.serviceName}
                  </Text>
                  <View style={styles.dateRow}>
                    <Clock size={12} color="#64748B" />
                    <Text style={responsiveStyles.bookingDate} numberOfLines={1} ellipsizeMode="tail">
                      {booking.date}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Right side - Status */}
              <View style={styles.statusSection}>
                <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                  <StatusIcon size={10} color={statusStyle.text} />
                  <Text style={[styles.statusText, { color: statusStyle.text }]}>
                    {statusStyle.label}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 0,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
      },
      android: {
        elevation: 6,
      },
      web: {
        boxShadow: '0px 6px 20px rgba(0, 0, 0, 0.1)',
      },
    }),
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
    fontFamily: 'Inter-Bold',
  },
  viewAllLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewAllLinkText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3B82F6',
    fontFamily: 'Inter-SemiBold',
  },
  bookingsContainer: {
    backgroundColor: '#FFFFFF',
  },
  bookingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
  },
  lastBookingItem: {
    borderBottomWidth: 0,
  },
  bookingMainContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  bookingInfo: {
    flex: 1,
  },
  serviceName: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
    color: '#1E293B',
    marginBottom: 6,
    fontWeight: '600',
    lineHeight: 20,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bookingDate: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: '#64748B',
    lineHeight: 16,
  },
  statusSection: {
    alignItems: 'flex-end',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 4,
    minWidth: 80,
    justifyContent: 'center',
  },
  statusText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  loadingContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  loadingText: {
    fontFamily: 'Inter-Medium',
    fontSize: 15,
    color: '#64748B',
    fontWeight: '500',
  },
  emptyContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    marginBottom: 0,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
      },
      android: {
        elevation: 6,
      },
      web: {
        boxShadow: '0px 6px 20px rgba(0, 0, 0, 0.1)',
      },
    }),
  },
  emptyText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
    color: '#64748B',
    marginBottom: 24,
    textAlign: 'center',
    fontWeight: '600',
  },
  bookButton: {
    backgroundColor: '#3B82F6',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  bookButtonText: {
    fontFamily: 'Inter-Bold',
    fontSize: 15,
    color: '#FFFFFF',
    fontWeight: '700',
    textAlign: 'center',
  },
});