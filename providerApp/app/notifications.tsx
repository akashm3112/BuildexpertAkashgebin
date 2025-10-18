import React, { useState } from 'react';
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
import { SafeView } from '@/components/SafeView';

// Responsive design utilities
const { width: screenWidth } = Dimensions.get('window');
const isSmallScreen = screenWidth < 375;
const isMediumScreen = screenWidth >= 375 && screenWidth < 414;

const getResponsiveSpacing = (small: number, medium: number, large: number) => {
  if (isSmallScreen) return small;
  if (isMediumScreen) return medium;
  return large;
};
import { format } from 'date-fns';

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
  const { notifications, markAsRead, markAllAsRead, refreshNotifications } = useNotifications();
  const [refreshing, setRefreshing] = useState(false);

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

  const renderNotification = ({ item }: any) => (
    <TouchableOpacity
      style={[
        styles.notificationCard,
        { backgroundColor: getNotificationColor(item.type) },
        !item.is_read && styles.unreadNotificationCard,
      ]}
      activeOpacity={0.85}
      onPress={() => handleMarkAsRead(item.id)}
    >
      <View style={styles.notificationIcon}>{getNotificationIcon(item.type)}</View>
      <View style={styles.notificationContent}>
        <View style={styles.notificationHeaderRow}>
          <Text style={styles.notificationTitle}>{item.title}</Text>
          <Text style={styles.notificationTime}>
            {(() => {
              try {
                if (item.formatted_time && item.formatted_date) {
                  return `${item.formatted_date} ${item.formatted_time}`;
                }
                // Fallback: parse the created_at timestamp
                const date = new Date(item.created_at);
                if (isNaN(date.getTime())) {
                  return 'Invalid date';
                }
                return format(date, 'MMM d, yyyy h:mm a');
              } catch (error) {
                console.error('Error formatting notification time:', error);
                return 'Invalid date';
              }
            })()}
          </Text>
        </View>
        <Text style={styles.notificationMessage}>{item.message}</Text>
        {item.providerName && (
          <View style={styles.providerInfo}>
            <Image source={{ uri: item.providerImage }} style={styles.providerImage} />
            <Text style={styles.providerName}>{item.providerName}</Text>
          </View>
        )}
        {item.amount && (
          <View style={styles.amountContainer}>
            <Text style={styles.amount}>{item.amount}</Text>
          </View>
        )}
        {item.discount && (
          <View style={styles.discountContainer}>
            <Text style={styles.discount}>{item.discount} OFF</Text>
          </View>
        )}
        {!item.is_read && (
          <View style={styles.newBadge}>
            <Text style={styles.newBadgeText}>New</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeView backgroundColor="#F8FAFC">
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Notifications</Text>
        {notifications.length > 0 && (
          <TouchableOpacity onPress={handleMarkAllAsRead} style={styles.markAllButton}>
            <Text style={styles.markAllText}>Mark All Read</Text>
          </TouchableOpacity>
        )}
      </View>
      
      {notifications.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Bell size={48} color="#94A3B8" />
          <Text style={styles.emptyText}>No notifications yet</Text>
          <Text style={styles.emptySubtext}>
            You'll see notifications about new bookings, ratings, and important updates here.
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
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#1E293B',
  },
  markAllButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  markAllText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748B',
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
    paddingHorizontal: getResponsiveSpacing(16, 20, 24),
    paddingTop: getResponsiveSpacing(12, 16, 20),
    paddingBottom: getResponsiveSpacing(16, 20, 24),
  },
  notificationCard: {
    flexDirection: 'row',
    padding: 18,
    borderRadius: 16,
    marginBottom: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  unreadNotificationCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#3B82F6',
  },
  notificationIcon: {
    marginRight: 16,
    marginTop: 2,
  },
  notificationContent: {
    flex: 1,
  },
  notificationHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
    flex: 1,
    marginRight: 12,
  },
  notificationTime: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '500',
  },
  notificationMessage: {
    fontSize: 14,
    color: '#64748B',
    lineHeight: 20,
    marginBottom: 8,
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
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  amountContainer: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  amount: {
    fontSize: 12,
    color: '#10B981',
    fontWeight: '600',
  },
  discountContainer: {
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  discount: {
    fontSize: 12,
    color: '#EF4444',
    fontWeight: '600',
  },
  newBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: '#EF4444',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  newBadgeText: {
    fontSize: 10,
    color: '#FFFFFF',
    fontWeight: '600',
  },
}); 