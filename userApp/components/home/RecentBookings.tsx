import React, { useEffect, useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  Platform,
  Dimensions,
  ActivityIndicator,
  Image,
  useWindowDimensions
} from 'react-native';
import { Calendar, ChevronRight, Clock, CheckCircle, XCircle, AlertTriangle, MapPin, User } from 'lucide-react-native';
import { useAuth } from '@/context/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { format, isToday, isTomorrow, parseISO } from 'date-fns';
import { router } from 'expo-router';
import { API_BASE_URL } from '@/constants/api';

// Default provider image fallback
const DEFAULT_PROVIDER_IMAGE = 'https://via.placeholder.com/100/3B82F6/FFFFFF?text=U';

// Responsive design utilities
const getResponsiveValue = (width: number, small: number, medium: number, large: number) => {
  if (width < 375) return small;      // Small devices (iPhone SE, etc.)
  if (width < 414) return medium;     // Medium devices (iPhone 12, 13, etc.)
  return large;                        // Large devices (iPhone Pro Max, tablets, etc.)
};

export default function RecentBookings() {
  const { user, isLoading: authLoading } = useAuth();
  const { width: screenWidth } = useWindowDimensions();
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Responsive values
  const cardPadding = getResponsiveValue(screenWidth, 16, 18, 20);
  const cardMargin = getResponsiveValue(screenWidth, 8, 10, 12);
  const avatarSize = getResponsiveValue(screenWidth, 48, 52, 56);
  const iconSize = getResponsiveValue(screenWidth, 16, 18, 20);
  const titleFontSize = getResponsiveValue(screenWidth, 16, 17, 18);
  const bodyFontSize = getResponsiveValue(screenWidth, 13, 14, 15);
  const captionFontSize = getResponsiveValue(screenWidth, 11, 12, 13);

  useEffect(() => {
    // Wait for auth to finish loading before fetching data
    if (authLoading || !user?.id) {
      if (!authLoading && !user?.id) {
        setBookings([]);
        setLoading(false);
      }
      return;
    }

    const fetchBookings = async () => {
      setLoading(true);
      const { tokenManager } = await import('@/utils/tokenManager');
      const token = await tokenManager.getValidToken();
      if (!token) {
        setBookings([]);
        setLoading(false);
        return;
      }
      try {
        const response = await fetch(`${API_BASE_URL}/api/bookings`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        
        if (!response.ok) {
          // Handle non-OK responses
          const errorData = await response.json().catch(() => ({ message: 'Failed to fetch bookings' }));
          console.error('❌ RecentBookings: API error:', response.status, errorData.message);
          setBookings([]);
          return;
        }
        
        const data = await response.json();
        
        if (data.status === 'success') {
          const rawBookings = data.data.bookings || [];
          
          setBookings(rawBookings.slice(0, 3).map((b: any) => {
            let dateStr = b.appointment_date;
            let timeStr = b.appointment_time;
            let displayDate = '';
            let displayTime = '';
            
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
              } catch {
                displayDate = dateStr;
              }
            }
            
            if (timeStr) {
              // Format time to be more readable
              try {
                const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
                if (timeMatch) {
                  let hours = parseInt(timeMatch[1], 10);
                  const minutes = timeMatch[2];
                  let ampm = timeMatch[3] || (hours < 12 ? 'AM' : 'PM');
                  
                  if (!timeMatch[3]) {
                    // Convert 24-hour to 12-hour if needed
                    if (hours > 12) {
                      hours -= 12;
                      ampm = 'PM';
                    } else if (hours === 0) {
                      hours = 12;
                      ampm = 'AM';
                    } else if (hours === 12) {
                      ampm = 'PM';
                    }
                  }
                  
                  displayTime = `${hours}:${minutes} ${ampm.toUpperCase()}`;
                } else {
                  displayTime = timeStr;
                }
              } catch {
                displayTime = timeStr;
              }
            }
            
            return {
              id: b.id,
              serviceName: b.service_name || 'Service',
              providerName: b.provider_name || 'Provider',
              providerImage: b.provider_profile_pic_url || DEFAULT_PROVIDER_IMAGE,
              date: displayDate,
              time: displayTime,
              status: b.status,
            };
          }));
        } else {
          setBookings([]);
        }
      } catch (err: any) {
        // Check if it's a network error
        const isNetworkError = err instanceof TypeError && 
          (err.message?.includes('Network request failed') || 
           err.message?.includes('Failed to fetch') ||
           err.message?.includes('NetworkError'));
        
        if (isNetworkError) {
          console.error('❌ RecentBookings: Network error - Cannot reach server at', API_BASE_URL);
          console.error('   Make sure the backend server is running and accessible');
        } else {
          console.error('❌ RecentBookings: Fetch error:', err);
        }
        setBookings([]);
      } finally {
        setLoading(false);
      }
    };
    fetchBookings();
  }, [user, authLoading]);

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { padding: cardPadding }]}>
        <ActivityIndicator size="small" color="#3B82F6" />
        <Text style={[styles.loadingText, { fontSize: bodyFontSize }]}>Loading recent bookings...</Text>
      </View>
    );
  }

  if (bookings.length === 0) {
    return (
      <View style={[styles.emptyContainer, { padding: cardPadding * 1.5 }]}>
        <View style={styles.emptyIconContainer}>
          <Calendar size={48} color="#CBD5E1" />
        </View>
        <Text style={[styles.emptyTitle, { fontSize: titleFontSize }]}>No recent bookings</Text>
        <Text style={[styles.emptySubtitle, { fontSize: captionFontSize }]}>
          Start by booking a service to see them here
        </Text>
        <TouchableOpacity 
          style={[styles.bookButton, { paddingVertical: cardPadding * 0.7 }]} 
          onPress={() => router.push('/(tabs)')}
          activeOpacity={0.8}
        >
          <Text style={[styles.bookButtonText, { fontSize: bodyFontSize }]}>Book a Service</Text>
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
          border: '#D1FAE5',
          label: 'Accepted',
          icon: CheckCircle
        };
      case 'completed':
        return { 
          bg: '#EEF2FF', 
          text: '#6366F1', 
          border: '#E0E7FF',
          label: 'Completed',
          icon: CheckCircle
        };
      case 'cancelled':
        return { 
          bg: '#FEF2F2', 
          text: '#EF4444', 
          border: '#FEE2E2',
          label: 'Cancelled',
          icon: XCircle
        };
      case 'rejected':
        return { 
          bg: '#FEF2F2', 
          text: '#EF4444', 
          border: '#FEE2E2',
          label: 'Rejected',
          icon: XCircle
        };
      case 'pending':
        return { 
          bg: '#FFFBEB', 
          text: '#F59E0B', 
          border: '#FEF3C7',
          label: 'Pending',
          icon: Clock
        };
      default:
        return { 
          bg: '#F1F5F9', 
          text: '#64748B', 
          border: '#E2E8F0',
          label: status.charAt(0).toUpperCase() + status.slice(1),
          icon: AlertTriangle
        };
    }
  };

  return (
    <View style={styles.container}>
      {/* Section Header */}
      <View style={[styles.sectionHeader, { paddingHorizontal: cardPadding, paddingVertical: cardPadding * 0.875 }]}>
        <Text style={[styles.sectionTitle, { fontSize: titleFontSize }]}>Recent Bookings</Text>
        <TouchableOpacity 
          style={styles.viewAllLink}
          onPress={() => router.push('/(tabs)/bookings')}
          activeOpacity={0.7}
        >
          <Text style={[styles.viewAllLinkText, { fontSize: captionFontSize }]}>View All</Text>
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
                styles.bookingCard,
                {
                  padding: cardPadding,
                  marginBottom: isLastItem ? 0 : cardMargin,
                }
              ]}
              activeOpacity={0.85}
              onPress={() => router.push('/(tabs)/bookings')}
            >
              {/* Card Content */}
              <View style={styles.cardContent}>
                {/* Left: Provider Avatar */}
                <View style={[styles.avatarContainer, { width: avatarSize, height: avatarSize }]}>
                  {booking.providerImage && booking.providerImage !== DEFAULT_PROVIDER_IMAGE ? (
                    <Image 
                      source={{ uri: booking.providerImage }} 
                      style={[styles.avatar, { width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 }]}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={[styles.avatarPlaceholder, { width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 }]}>
                      <User size={avatarSize * 0.4} color="#94A3B8" />
                    </View>
                  )}
                  <View style={[styles.statusIndicator, { backgroundColor: statusStyle.bg, borderColor: statusStyle.border }]} />
                </View>

                {/* Center: Booking Info */}
                <View style={styles.bookingInfo}>
                  <Text style={[styles.providerName, { fontSize: bodyFontSize }]} numberOfLines={1}>
                    {booking.providerName}
                  </Text>
                  <Text style={[styles.serviceName, { fontSize: captionFontSize }]} numberOfLines={1}>
                    {booking.serviceName}
                  </Text>
                  
                  {/* Date & Time Row */}
                  <View style={styles.dateTimeRow}>
                    <View style={styles.dateTimeItem}>
                      <Calendar size={12} color="#64748B" style={styles.dateTimeIcon} />
                      <Text style={[styles.dateTimeText, { fontSize: captionFontSize }]}>
                        {booking.date}
                      </Text>
                    </View>
                    {booking.time && (
                      <View style={[styles.dateTimeItem, styles.dateTimeItemLast]}>
                        <Clock size={12} color="#64748B" style={styles.dateTimeIcon} />
                        <Text style={[styles.dateTimeText, { fontSize: captionFontSize }]}>
                          {booking.time}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* Right: Status Badge */}
                <View style={styles.statusContainer}>
                  <View style={[
                    styles.statusBadge, 
                    { 
                      backgroundColor: statusStyle.bg,
                      borderColor: statusStyle.border,
                      paddingHorizontal: getResponsiveValue(screenWidth, 8, 10, 12),
                      paddingVertical: getResponsiveValue(screenWidth, 4, 5, 6),
                    }
                  ]}>
                    <StatusIcon size={getResponsiveValue(screenWidth, 10, 11, 12)} color={statusStyle.text} />
                    <Text style={[
                      styles.statusText, 
                      { 
                        color: statusStyle.text,
                        fontSize: getResponsiveValue(screenWidth, 9, 10, 11),
                      }
                    ]}>
                      {statusStyle.label}
                    </Text>
                  </View>
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
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
      },
      android: {
        elevation: 4,
      },
      web: {
        boxShadow: '0px 2px 12px rgba(0, 0, 0, 0.08)',
      },
    }),
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FAFBFC',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  sectionTitle: {
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  viewAllLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  viewAllLinkText: {
    fontWeight: '600',
    color: '#3B82F6',
    letterSpacing: -0.2,
  },
  bookingsContainer: {
    backgroundColor: '#FFFFFF',
  },
  bookingCard: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 12,
  },
  avatar: {
    backgroundColor: '#E2E8F0',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  avatarPlaceholder: {
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  statusIndicator: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  bookingInfo: {
    flex: 1,
    marginRight: 12,
  },
  providerName: {
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 4,
    letterSpacing: -0.2,
  },
  serviceName: {
    fontWeight: '400',
    color: '#64748B',
    marginBottom: 8,
    letterSpacing: -0.1,
  },
  dateTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
    marginTop: 2,
  },
  dateTimeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
  },
  dateTimeItemLast: {
    marginRight: 0,
  },
  dateTimeIcon: {
    marginRight: 4,
  },
  dateTimeText: {
    fontWeight: '500',
    color: '#64748B',
    letterSpacing: -0.1,
    lineHeight: 16,
    ...Platform.select({
      android: {
        includeFontPadding: false,
        textAlignVertical: 'center',
      },
    }),
  },
  statusContainer: {
    alignItems: 'flex-end',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    gap: 4,
    borderWidth: 1,
  },
  statusText: {
    fontWeight: '600',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  loadingContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  loadingText: {
    fontWeight: '500',
    color: '#64748B',
  },
  emptyContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 0,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 8,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  emptySubtitle: {
    fontWeight: '400',
    color: '#64748B',
    marginBottom: 24,
    textAlign: 'center',
    letterSpacing: -0.1,
  },
  bookButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 24,
    borderRadius: 12,
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
  bookButtonText: {
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
});

