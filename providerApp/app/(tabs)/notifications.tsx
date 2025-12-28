import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  Platform,
  RefreshControl,
  Dimensions,
  StatusBar,
} from 'react-native';
import {
  Bell,
  CircleCheck as CheckCircle,
  Calendar,
  MessageCircle,
  CreditCard,
  Gift,
  Clock,
  ChevronDown,
  ChevronUp,
} from 'lucide-react-native';
import { useNotifications } from '@/context/NotificationContext';
import { useLanguage } from '@/context/LanguageContext';
import { SafeView } from '@/components/SafeView';
import { format } from 'date-fns';

// Responsive design utilities
const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
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

type NotificationVariant = 'success' | 'error' | 'info';

const getNotificationIcon = (type: string, variant: NotificationVariant = 'info') => {
  const variantColor = '#FFFFFF';

  switch (type) {
    case 'booking':
      return <Calendar size={22} color={variantColor} strokeWidth={2.5} />;
    case 'payment':
      return <CreditCard size={22} color={variantColor} strokeWidth={2.5} />;
    case 'service':
      return <CheckCircle size={22} color={variantColor} strokeWidth={2.5} />;
    case 'message':
      return <MessageCircle size={22} color={variantColor} strokeWidth={2.5} />;
    case 'reminder':
      return <Clock size={22} color={variantColor} strokeWidth={2.5} />;
    case 'offer':
      return <Gift size={22} color={variantColor} strokeWidth={2.5} />;
    default:
      return <Bell size={22} color={variantColor} strokeWidth={2.5} />;
  }
};

const getNotificationIconBg = (type: string, variant: NotificationVariant = 'info') => {
  if (variant === 'success') {
    return '#10B981'; // Green for success
  }
  if (variant === 'error') {
    return '#EF4444'; // Red for error/cancel
  }

  switch (type) {
    case 'booking':
      return '#3B82F6'; // Blue
    case 'payment':
      return '#10B981'; // Green
    case 'service':
      return '#10B981'; // Green
    case 'message':
      return '#3B82F6'; // Blue
    case 'reminder':
      return '#F59E0B'; // Amber
    case 'offer':
      return '#EC4899'; // Pink
    default:
      return '#64748B'; // Gray
  }
};

const getNotificationColor = (
  type: string,
  variant: NotificationVariant = 'info'
) => {
  // Always use white background for modern look
  return '#FFFFFF';
};

const classifyNotification = (title: string, message: string) => {
  const lowerTitle = (title || '').toLowerCase();
  const lowerMessage = (message || '').toLowerCase();
  const combined = `${lowerTitle} ${lowerMessage}`;

  let category = 'service';
  if (combined.includes('payment')) {
    category = 'payment';
  } else if (combined.includes('booking')) {
    category = 'booking';
  } else if (combined.includes('reminder')) {
    category = 'reminder';
  } else if (combined.includes('offer') || combined.includes('discount')) {
    category = 'offer';
  } else if (
    combined.includes('message') ||
    combined.includes('chat') ||
    combined.includes('support')
  ) {
    category = 'message';
  }

  const dangerKeywords = [
    'fail',
    'failed',
    'failure',
    'declined',
    'rejected',
    'unsuccess',
    'error',
    'issue',
    'problem',
    'cancel',
    'cancelled',
    'cancellation',
    'report',
  ];

  const successKeywords = [
    'welcome',
    'completed',
    'accepted',
    'success',
    'successful',
    'activated',
    'approved',
    'confirmed',
    'payment received',
  ];

  let variant: NotificationVariant = 'info';

  if (dangerKeywords.some(keyword => combined.includes(keyword))) {
    variant = 'error';
  } else if (successKeywords.some(keyword => combined.includes(keyword))) {
    variant = 'success';
  }

  return { category, variant };
};

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

export default function NotificationsScreen() {
  const { notifications, unreadCount, markAsRead, markAllAsRead, refreshNotifications } = useNotifications();
  const { t } = useLanguage();
  const [refreshing, setRefreshing] = useState(false);
  const [expandedNotifications, setExpandedNotifications] = useState<Set<string>>(new Set());

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
      padding: getResponsiveSpacing(12, 14, 16),
      borderRadius: getResponsiveSpacing(20, 24, 28),
      marginBottom: getResponsiveSpacing(8, 10, 12),
    },
    collapsedCard: {
      minHeight: getResponsiveSpacing(90, 95, 100),
      maxHeight: getResponsiveSpacing(90, 95, 100),
    },
    notificationIcon: {
      ...styles.notificationIcon,
      width: getResponsiveSpacing(40, 44, 48),
      height: getResponsiveSpacing(40, 44, 48),
      borderRadius: getResponsiveSpacing(20, 22, 24),
      marginRight: getResponsiveSpacing(10, 12, 14),
    },
    notificationTitle: {
      ...styles.notificationTitle,
      fontSize: getResponsiveFontSize(14, 15, 16),
      lineHeight: getResponsiveFontSize(18, 20, 22),
    },
    notificationTime: {
      ...styles.notificationTime,
      fontSize: getResponsiveFontSize(10, 11, 12),
      lineHeight: getResponsiveFontSize(12, 14, 16),
    },
    notificationMessage: {
      ...styles.notificationMessage,
      fontSize: getResponsiveFontSize(12, 13, 14),
      lineHeight: getResponsiveFontSize(16, 18, 20),
      paddingRight: getResponsiveSpacing(20, 24, 28),
    },
    messageContainer: {
      ...styles.messageContainer,
      minHeight: getResponsiveSpacing(32, 36, 40),
      marginTop: getResponsiveSpacing(3, 4, 5),
    },
    notificationHeaderRow: {
      ...styles.notificationHeaderRow,
      marginBottom: getResponsiveSpacing(5, 6, 7),
    },
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshNotifications();
    setRefreshing(false);
  };

  const handleMarkAsRead = async (id: string) => {
    await markAsRead(id);
  };

  const handleMarkAllAsRead = async () => {
    await markAllAsRead();
  };

  const toggleNotificationExpansion = (id: string) => {
    setExpandedNotifications(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  // Handle orientation changes for responsive design
  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      // Update responsive constants when orientation changes
      const newWidth = window.width;
      const newIsSmallScreen = newWidth < 375;
      const newIsMediumScreen = newWidth >= 375 && newWidth < 414;
      const newIsLargeScreen = newWidth >= 414;
      
      // Force re-render when orientation changes
      setRefreshing(prev => prev); // Trigger re-render
    });

    return () => subscription?.remove();
  }, []);

  const renderNotification = ({ item }: any) => {
    // Determine notification type based on title or message content
    const { category, variant } = classifyNotification(item.title, item.message);
    const iconBgColor = getNotificationIconBg(category, variant);
    const isUnread = !item.is_read;
    const isExpanded = expandedNotifications.has(item.id);
    
    // Check if message is long enough to need truncation (roughly 80 characters for 2 lines)
    const messageLength = item.message?.length || 0;
    const needsTruncation = messageLength > 80;
    
    return (
      <TouchableOpacity
        style={[
          responsiveStyles.notificationCard,
          { backgroundColor: getNotificationColor(category, variant) },
          isUnread && styles.unreadNotificationCard,
          !isExpanded && needsTruncation && responsiveStyles.collapsedCard,
        ]}
        activeOpacity={0.7}
        onPress={() => {
          if (!item.is_read) {
            handleMarkAsRead(item.id);
          }
          if (needsTruncation) {
            toggleNotificationExpansion(item.id);
          }
        }}
      >
        <View style={[responsiveStyles.notificationIcon, { backgroundColor: iconBgColor }]}>
          {getNotificationIcon(category, variant)}
        </View>
        <View style={styles.notificationContent}>
          <View style={responsiveStyles.notificationHeaderRow}>
            <View style={styles.titleContainer}>
              <Text style={responsiveStyles.notificationTitle} numberOfLines={1} ellipsizeMode="tail">
                {item.title}
              </Text>
              {isUnread && <View style={styles.unreadDot} />}
            </View>
            <Text style={responsiveStyles.notificationTime}>
              {item.formatted_time && item.formatted_date 
                ? `${item.formatted_date} ${item.formatted_time}` 
                : format(new Date(item.created_at), 'MMM d, yyyy h:mm a')}
            </Text>
          </View>
          <View style={responsiveStyles.messageContainer}>
            <Text 
              style={responsiveStyles.notificationMessage}
              numberOfLines={isExpanded ? undefined : 2}
              ellipsizeMode="tail"
            >
              {item.message}
            </Text>
            {needsTruncation && (
              <View style={styles.expandIndicator}>
                {isExpanded ? (
                  <ChevronUp size={getResponsiveSpacing(16, 18, 20)} color="#94A3B8" />
                ) : (
                  <ChevronDown size={getResponsiveSpacing(16, 18, 20)} color="#94A3B8" />
                )}
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeView backgroundColor="#F8FAFC">
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />
      <View style={responsiveStyles.header}>
        <Text style={responsiveStyles.headerTitle} numberOfLines={1} ellipsizeMode="tail">{t('notifications.title')}</Text>
        {notifications.length > 0 && (
          <TouchableOpacity onPress={handleMarkAllAsRead} style={styles.markAllButton}>
            <Text style={styles.markAllText}>{t('notifications.markAllRead')}</Text>
          </TouchableOpacity>
        )}
      </View>
      
      {notifications.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Bell size={48} color="#94A3B8" />
          <Text style={styles.emptyText}>{t('notifications.noNotificationsYet')}</Text>
          <Text style={styles.emptySubtext}>
            {t('notifications.noNotificationsSubtext')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          renderItem={renderNotification}
          keyExtractor={item => item.id}
          contentContainerStyle={[styles.notificationsList, { 
            paddingHorizontal: getResponsiveSpacing(12, 12, 16), 
            paddingTop: getResponsiveSpacing(16, 20, 24) 
          }]}
          ItemSeparatorComponent={() => <View style={{ height: 0 }} />}
          showsVerticalScrollIndicator={true}
          scrollIndicatorInsets={{ right: 2 }}
          scrollEventThrottle={16}
          decelerationRate={0.98}
          bounces={true}
          bouncesZoom={false}
          alwaysBounceVertical={false}
          removeClippedSubviews={true}
          maxToRenderPerBatch={8}
          updateCellsBatchingPeriod={50}
          initialNumToRender={8}
          windowSize={8}
          getItemLayout={(data, index) => ({
            length: 105,
            offset: 105 * index,
            index,
          })}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={['#3B82F6']}
              tintColor="#3B82F6"
            />
          }
        />
      )}
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
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 18,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 0,
    minHeight: 64,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0F172A',
    flex: 1,
    marginRight: 12,
    letterSpacing: -0.5,
  },
  markAllButton: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 24,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 120,
    maxWidth: 200,
    minHeight: 40,
    ...Platform.select({
      ios: {
        shadowColor: '#3B82F6',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  markAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 18,
    letterSpacing: 0.2,
    flexShrink: 1,
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
  notificationsList: {
    flexGrow: 1,
    paddingHorizontal: getResponsiveSpacing(12, 12, 12),
    paddingTop: getResponsiveSpacing(12, 16, 20),
    paddingBottom: getResponsiveSpacing(20, 24, 28), // Add padding at bottom to prevent blank space and account for tab bar
  },
  notificationCard: {
    flexDirection: 'row',
    padding: 14,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    marginBottom: 10,
    alignItems: 'center',
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
    borderWidth: 0.5,
    borderColor: '#E2E8F0',
  },
  collapsedCard: {
    minHeight: 95,
    maxHeight: 95,
  },
  unreadNotificationCard: {
    borderColor: '#E2E8F0',
    borderWidth: 1.5,
    backgroundColor: '#FAFBFC',
  },
  notificationIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 3,
      },
      android: {
        elevation: 1.5,
      },
    }),
  },
  notificationContent: {
    flex: 1,
    justifyContent: 'center',
  },
  notificationHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
    gap: 8,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 6,
    minWidth: 0,
  },
  notificationTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    flex: 1,
    lineHeight: 20,
    letterSpacing: -0.1,
  },
  unreadDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#3B82F6',
    marginTop: 1,
  },
  notificationTime: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
    lineHeight: 14,
    marginTop: 1,
    flexShrink: 0,
  },
  messageContainer: {
    position: 'relative',
    marginTop: 4,
    minHeight: 36,
  },
  notificationMessage: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
    paddingRight: 24,
  },
  expandIndicator: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    paddingLeft: 6,
    paddingTop: 2,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
