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
      return '#F0F9FF';
    case 'message':
      return '#FEF3C7';
    case 'reminder':
      return '#FEF2F2';
    case 'offer':
      return '#FDF2F8';
    default:
      return '#F8FAFC';
  }
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
              {item.formatted_time && item.formatted_date 
                ? `${item.formatted_date} ${item.formatted_time}` 
                : format(new Date(item.created_at), 'MMM d, yyyy h:mm a')}
            </Text>
          </View>
          <Text style={styles.notificationMessage}>{item.message}</Text>
          {!item.is_read && (
            <View style={styles.newBadge}>
              <Text style={styles.newBadgeText}>New</Text>
            </View>
          )}
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
          contentContainerStyle={styles.notificationsList}
          showsVerticalScrollIndicator={false}
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
  markAllButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 100,
    maxWidth: 180,
    minHeight: 36,
  },
  markAllText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
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
    paddingHorizontal: getResponsiveSpacing(16, 20, 24),
    paddingTop: getResponsiveSpacing(12, 16, 20),
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
});
