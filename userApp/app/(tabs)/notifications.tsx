import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  Platform,
  Modal,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Bell,
  CircleCheck as CheckCircle,
  Calendar,
  MessageCircle,
  CreditCard,
  Gift,
  Clock,
  X,
} from 'lucide-react-native';
import { useNotifications } from '@/context/NotificationContext';
import { useLanguage } from '@/context/LanguageContext';
import dayjs from 'dayjs';
import { SafeView } from '@/components/SafeView';

// Add 'read' to Notification interface
declare interface Notification {
  id: string;
  title: string;
  message: string;
  created_at: string;
  is_read?: boolean;
  read?: boolean;
  formatted_date?: string;
  formatted_time?: string;
  relative_time?: string;
}

const getNotificationIcon = (type: string) => {
  switch (type) {
    case 'booking':
      return <Calendar size={24} color="#3B82F6" />;
    case 'payment':
      return <CreditCard size={24} color="#10B981" />;
    case 'service':
      return <CheckCircle size={24} color="#10B981" />;
    case 'message':
      return <MessageCircle size={24} color="#3B82F6" />;
    case 'reminder':
      return <Clock size={24} color="#F59E0B" />;
    case 'offer':
      return <Gift size={24} color="#EF4444" />;
    default:
      return <Bell size={24} color="#64748B" />;
  }
};

const getNotificationColor = (type: string) => {
  switch (type) {
    case 'booking':
      return '#EFF6FF';
    case 'payment':
      return '#ECFDF5';
    case 'service':
      return '#ECFDF5';
    case 'message':
      return '#EFF6FF';
    case 'reminder':
      return '#FFFBEB';
    case 'offer':
      return '#FEF2F2';
    default:
      return '#F8FAFC';
  }
};

export default function NotificationsScreen() {
  const { notifications, pagination, markAsRead, markAllAsRead, refreshNotifications, fetchNotifications, fetchNotificationHistory } = useNotifications();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = Dimensions.get('window');
  const [refreshing, setRefreshing] = useState(false);

  // Handle orientation changes for responsive design
  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      // Update responsive constants when orientation changes
      const newWidth = window.width;
      const newIsSmallDevice = newWidth < 375;
      const newIsMediumDevice = newWidth >= 375 && newWidth < 414;
      const newIsLargeDevice = newWidth >= 414;
      
      // Force re-render when orientation changes
      setRefreshing(prev => prev); // Trigger re-render
    });

    return () => subscription?.remove();
  }, []);
  
  // Responsive design breakpoints
  const isSmallDevice = screenWidth < 375;
  const isMediumDevice = screenWidth >= 375 && screenWidth < 414;
  const isLargeDevice = screenWidth >= 414;
  
  // Calculate responsive tab bar height (matches tab layout)
  const tabBarHeight = 60 + insets.bottom;
  
  // Calculate responsive padding based on device size
  const getResponsivePadding = () => {
    if (isSmallDevice) return tabBarHeight - 10; // 50px base
    if (isMediumDevice) return tabBarHeight - 5;  // 55px base  
    return tabBarHeight; // 60px base for large devices
  };

  const getResponsiveSpacing = (small: number, medium: number, large: number) => {
    if (isSmallDevice) return small;
    if (isMediumDevice) return medium;
    return large;
  };

  const getResponsiveFontSize = (small: number, medium: number, large: number) => {
    if (isSmallDevice) return small;
    if (isMediumDevice) return medium;
    return large;
  };
  const [loadingMore, setLoadingMore] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyNotifications, setHistoryNotifications] = useState<Notification[]>([]);
  const [historyPagination, setHistoryPagination] = useState(pagination);
  const [historyStatistics, setHistoryStatistics] = useState<any>({});
  const [selectedFilter, setSelectedFilter] = useState<string>('all');

  // Create responsive styles based on current screen dimensions
  const responsiveStyles = {
    header: {
      ...styles.header,
      paddingHorizontal: getResponsiveSpacing(16, 20, 24),
      paddingVertical: getResponsiveSpacing(12, 16, 20),
      minHeight: getResponsiveSpacing(56, 60, 64),
    },
    headerTitle: {
      ...styles.headerTitle,
      fontSize: getResponsiveFontSize(20, 24, 28),
      marginRight: getResponsiveSpacing(8, 12, 16),
    },
    notificationCard: {
      ...styles.notificationCard,
      padding: getResponsiveSpacing(16, 18, 20),
      borderRadius: getResponsiveSpacing(12, 16, 20),
      marginBottom: getResponsiveSpacing(6, 8, 10),
      borderLeftWidth: getResponsiveSpacing(3, 4, 5),
    },
    notificationIcon: {
      ...styles.notificationIcon,
      width: getResponsiveSpacing(36, 40, 44),
      height: getResponsiveSpacing(36, 40, 44),
      borderRadius: getResponsiveSpacing(18, 20, 22),
      marginRight: getResponsiveSpacing(10, 12, 14),
    },
  };

  // Debug logging
  console.log('🔔 NotificationsScreen - Current notifications:', notifications);
  console.log('🔔 NotificationsScreen - Notifications count:', notifications.length);
  console.log('🔔 NotificationsScreen - First notification details:', notifications[0]);
  console.log('🔔 NotificationsScreen - Is first notification read?', notifications[0]?.is_read);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshNotifications();
    setRefreshing(false);
  };

  const handleLoadMore = async () => {
    if (loadingMore || !pagination.hasMore) return;
    
    setLoadingMore(true);
    try {
      await fetchNotifications(pagination.currentPage + 1, 20);
    } catch (error) {
      console.error('Error loading more notifications:', error);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleShowHistory = async () => {
    setShowHistory(true);
    try {
      const result = await fetchNotificationHistory({ page: 1, limit: 50 });
      setHistoryNotifications(result.notifications);
      setHistoryPagination(result.pagination);
      setHistoryStatistics(result.statistics);
    } catch (error) {
      console.error('Error fetching notification history:', error);
    }
  };

  const handleFilterHistory = async (filter: string) => {
    setSelectedFilter(filter);
    try {
      const params: any = { page: 1, limit: 50 };
      if (filter !== 'all') {
        params.type = filter;
      }
      const result = await fetchNotificationHistory(params);
      setHistoryNotifications(result.notifications);
      setHistoryPagination(result.pagination);
    } catch (error) {
      console.error('Error filtering notification history:', error);
    }
  };

  const handleMarkAsRead = async (id: string) => {
    await markAsRead(id);
  };

  const handleMarkAllAsRead = async () => {
    await markAllAsRead();
  };

  const renderNotification = ({ item }: any) => {
    // Determine notification type based on title or message content
    const getNotificationType = (title: string, message: string) => {
      const lowerTitle = title.toLowerCase();
      const lowerMessage = message.toLowerCase();
      
      if (lowerTitle.includes('booking') || lowerMessage.includes('booking')) {
        return 'booking';
      } else if (lowerTitle.includes('welcome') || lowerMessage.includes('welcome')) {
        return 'service';
      } else if (lowerTitle.includes('report') || lowerMessage.includes('report')) {
        return 'service';
      } else if (lowerTitle.includes('rating') || lowerMessage.includes('rating')) {
        return 'service';
      } else {
        return 'service'; // default
      }
    };

    const notificationType = getNotificationType(item.title, item.message);
    
    return (
      <TouchableOpacity
        style={[
          responsiveStyles.notificationCard,
          { backgroundColor: getNotificationColor(notificationType) },
          !item.is_read && styles.unreadNotificationCard,
        ]}
        activeOpacity={0.85}
        onPress={() => handleMarkAsRead(item.id)}
      >
        <View style={responsiveStyles.notificationIcon}>{getNotificationIcon(notificationType)}</View>
        <View style={styles.notificationContent}>
          <View style={styles.notificationHeaderRow}>
            <Text style={styles.notificationTitle}>{item.title}</Text>
            <Text style={styles.notificationTime}>
              {item.formatted_time ? `${item.formatted_date} ${item.formatted_time}` : dayjs(item.created_at).format('MMM D, YYYY h:mm A')}
            </Text>
          </View>
          <Text style={styles.notificationMessage}>{item.message}</Text>
          {!item.is_read && (
            <View style={styles.newBadge}>
              <Text style={styles.newBadgeText}>{t('notifications.newBadge')}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeView style={styles.container} backgroundColor="#F8FAFC" excludeBottom={true}>
      <View style={responsiveStyles.header}>
        <Text style={responsiveStyles.headerTitle}>{t('notifications.title')}</Text>
        <View style={styles.headerActions}>

          {/* History button is disabled for now */}
          {/* <TouchableOpacity style={styles.historyButton} onPress={handleShowHistory}>
            <Text style={styles.historyButtonText} numberOfLines={2} adjustsFontSizeToFit>
              {t('notifications.history')}
            </Text>
          </TouchableOpacity> */}
        
          <TouchableOpacity style={styles.markAllButton} onPress={handleMarkAllAsRead}>
            <Text style={styles.markAllText} numberOfLines={2} adjustsFontSizeToFit>
              {t('notifications.markAllRead')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
      
      <FlatList
        data={notifications}
        renderItem={renderNotification}
        keyExtractor={item => item.id}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: getResponsivePadding() }}
        showsVerticalScrollIndicator={false}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Bell size={48} color="#CBD5E1" />
            <Text style={styles.emptyText}>{t('notifications.noNotificationsYet')}</Text>
            <Text style={styles.emptySubtext}>{t('notifications.noNotificationsSubtext')}</Text>
          </View>
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.1}
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.loadingMoreContainer}>
              <Text style={styles.loadingMoreText}>{t('notifications.loadingMore')}</Text>
            </View>
          ) : null
        }
      />

      {/* Notification History Modal */}
      <Modal
        visible={showHistory}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowHistory(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('notifications.history')}</Text>
              <TouchableOpacity onPress={() => setShowHistory(false)} style={styles.closeButton}>
                <X size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Statistics */}
            <View style={styles.statisticsContainer}>
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>{historyStatistics.total || 0}</Text>
                <Text style={styles.statLabel}>{t('notifications.total')}</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>{historyStatistics.unread || 0}</Text>
                <Text style={styles.statLabel}>{t('notifications.unread')}</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>{historyStatistics.booking_notifications || 0}</Text>
                <Text style={styles.statLabel}>{t('notifications.bookings')}</Text>
              </View>
            </View>

            {/* Filter Buttons */}
            <View style={styles.filterContainer}>
              {['all', 'Booking', 'Rating', 'Report', 'Welcome'].map((filter) => (
                <TouchableOpacity
                  key={filter}
                  style={[
                    styles.filterButton,
                    selectedFilter === filter && styles.filterButtonActive
                  ]}
                  onPress={() => handleFilterHistory(filter)}
                >
                  <Text style={[
                    styles.filterButtonText,
                    selectedFilter === filter && styles.filterButtonTextActive
                  ]}>
                    {filter === 'all' ? t('notifications.all') : filter}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* History List */}
            <FlatList
              data={historyNotifications}
              renderItem={renderNotification}
              keyExtractor={item => item.id}
              ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
              contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: getResponsivePadding() }}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Bell size={48} color="#CBD5E1" />
                  <Text style={styles.emptyText}>{t('notifications.noHistory')}</Text>
                </View>
              }
            />
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
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    minHeight: 60,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#1E293B',
    flex: 1,
    marginRight: 12,
    flexWrap: 'wrap',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  historyButton: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    minWidth: 60,
    maxWidth: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#3B82F6',
    textAlign: 'center',
    flexWrap: 'wrap',
  },
  markAllButton: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    minWidth: 60,
    maxWidth: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markAllText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748B',
    textAlign: 'center',
    flexWrap: 'wrap',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 32,
  },
  notificationCard: {
    flexDirection: 'row',
    padding: 18,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    marginBottom: 8,
    alignItems: 'flex-start',
    ...Platform.select({
      ios: {
        shadowColor: '#CBD5E1',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 6,
      },
      android: {
        elevation: 3,
      },
    }),
    borderLeftWidth: 4,
    borderLeftColor: 'transparent',
  },
  unreadNotificationCard: {
    borderLeftColor: '#3B82F6',
    backgroundColor: '#F0F6FF',
  },
  notificationIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  notificationContent: {
    flex: 1,
  },
  notificationHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
    flex: 1,
    marginRight: 8,
    lineHeight: 20,
  },
  notificationTime: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
    marginLeft: 8,
    lineHeight: 16,
  },
  notificationMessage: {
    fontSize: 14,
    color: '#475569',
    marginBottom: 8,
    marginTop: 2,
    lineHeight: 20,
  },
  newBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#3B82F6',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 6,
  },
  newBadgeText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    lineHeight: 16,
  },
  providerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  providerImage: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 8,
  },
  providerName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1E293B',
  },
  amountContainer: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  amount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#10B981',
  },
  discountContainer: {
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  discount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#EF4444',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    margin: 20,
    maxHeight: '90%',
    width: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1E293B',
  },
  closeButton: {
    padding: 4,
  },
  // Statistics styles
  statisticsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#F8FAFC',
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: '#3B82F6',
  },
  statLabel: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
  },
  // Filter styles
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,
  },
  filterButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
  },
  filterButtonActive: {
    backgroundColor: '#3B82F6',
  },
  filterButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748B',
  },
  filterButtonTextActive: {
    color: '#FFFFFF',
  },
  // Button styles
  markAllButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 120,
    maxWidth: 200,
    minHeight: 40,
  },
  markAllText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 18,
  },
  historyButton: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 100,
    maxWidth: 180,
    minHeight: 40,
    marginRight: 12,
  },
  historyButtonText: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 18,
  },
  // Loading styles
  loadingMoreContainer: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  loadingMoreText: {
    fontSize: 14,
    color: '#64748B',
  },
});
