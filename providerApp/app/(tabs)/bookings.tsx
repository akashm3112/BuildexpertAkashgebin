import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  Modal as RNModal,
  TextInput,
  Pressable,
  Linking,
  RefreshControl,
  ActivityIndicator,
  Dimensions,
  StatusBar,
  Platform,
} from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { API_BASE_URL } from '@/constants/api';
import { SERVICE_CATEGORIES } from '@/constants/serviceCategories';
import { tokenManager } from '../../utils/tokenManager';
import { SafeView } from '@/components/SafeView';
import { Modal } from '@/components/common/Modal';
import WebRTCCallButton from '@/components/calls/WebRTCCallButton';
import {
  Calendar,
  Clock,
  MapPin,
  Phone,
  CheckCircle,
  XCircle,
  User,
  AlertTriangle,
  Star, // Import Star icon for ratings
} from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { format, parseISO } from 'date-fns';
import { io as socketIOClient } from 'socket.io-client';

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

interface Booking {
  id: string;
  customer_name: string;
  customer_phone: string;
  service_name: string;
  selected_service: string;
  appointment_date: string;
  appointment_time: string;
  status: 'pending' | 'accepted' | 'rejected' | 'completed' | 'cancelled';
  description?: string;
  estimated_price?: string;
  created_at: string;
  rejection_reason?: string;
  cancellation_reason?: string;
  report_reason?: string;
  report_description?: string;
  customer_address?: string;
  customer_state?: string;
}

export default function BookingsScreen() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [filter, setFilter] = useState<'pending' | 'accepted' | 'completed'| 'all' >('all');
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Alert Modal State
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertConfig, setAlertConfig] = useState({
    title: '',
    message: '',
    type: 'info' as 'success' | 'error' | 'warning' | 'info',
    buttons: [] as { text: string; onPress: () => void; style?: 'primary' | 'secondary' | 'destructive' }[]
  });

  // Reject Modal State
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectBookingId, setRejectBookingId] = useState<string | null>(null);
  const [customOtherReason, setCustomOtherReason] = useState('');

  // Report Modal State
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportBooking, setReportBooking] = useState<Booking | null>(null);
  const [customReportOtherReason, setCustomReportOtherReason] = useState('');

  // Rating Modal State
  const [ratingModalVisible, setRatingModalVisible] = useState(false);
  const [ratingBookingId, setRatingBookingId] = useState<string | null>(null);
  const [customerRating, setCustomerRating] = useState(0);
  const [ratingFeedback, setRatingFeedback] = useState('');

  const cancelReasons = [
    'Change of plans',
    'Found another provider',
    'Service no longer needed',
    'Price concerns',
    'Schedule conflict',
    'Other',
  ];

  const reportReasons = [
    'Abusive language',
    'Fraudulent activity',
    'No show',
    'Payment issue',
    'Other',
  ];

  const isOtherRejectReason = rejectReason === 'Other';
  const canSubmitReject = (rejectReason && rejectReason !== 'Other') || (isOtherRejectReason && customOtherReason.trim());

  const isOtherReportReason = reportReason === 'Other';
  const canSubmitReport = (reportReason && reportReason !== 'Other') || (isOtherReportReason && customReportOtherReason.trim());

  const canSubmitRating = customerRating > 0;

  const showAlert = (title: string, message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info', buttons?: { text: string; onPress: () => void; style?: 'primary' | 'secondary' | 'destructive' }[]) => {
    setAlertConfig({ title, message, type, buttons: buttons || [] });
    setShowAlertModal(true);
  };


  useEffect(() => {
    // Only show spinner on first load
    loadBookings(true);
    if (!user?.id) return; // Only connect if user id is available
    const socket = socketIOClient(`${API_BASE_URL}`);
    socket.on('connect', () => console.log('Socket connected:', socket.id));
    socket.emit('join', user.id);
    socket.on('booking_created', (data) => {
      if (data && data.booking) {
        setBookings(prev => [data.booking, ...prev]); // Prepend new booking for instant UI
      }
      // Refresh from backend in background (no spinner)
      loadBookings(false);
    });
    socket.on('booking_updated', () => {
      loadBookings(false);
    });
    socket.on('disconnect', () => console.log('Socket disconnected'));
    return () => {
      socket.disconnect();
    };
  }, [user?.id]);

  // Handle orientation changes for responsive design
  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', () => {
      // Force re-render when orientation changes
      // The responsive utilities will automatically adjust
    });

    return () => subscription?.remove();
  }, []);

  // Accepts a showSpinner param (default: false)
  const loadBookings = async (showSpinner = false) => {
    try {
      if (showSpinner) setIsLoading(true);
      setError(null);
      
      const token = await tokenManager.getValidToken();
      if (!token) {
        setError('No authentication token available');
        return;
      }

      
      const response = await fetch(`${API_BASE_URL}/api/providers/bookings`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });


      if (response.ok) {
        const data = await response.json();
        
        if (data.status === 'success' && data.data.bookings) {
          // Debug location data
          data.data.bookings.forEach((booking: any, index: number) => {
            console.log(`Booking ${index + 1} location data:`, {
              customer_state: booking.customer_state,
              customer_address: booking.customer_address,
              customer_name: booking.customer_name
            });
          });
          setBookings(data.data.bookings);
        } else {
          setError('Invalid response format from server');
        }
      } else {
        const errorText = await response.text();
        
        if (response.status === 403) {
          setError('Access denied. Only providers can view bookings.');
        } else {
          setError('Failed to fetch bookings. Please try again.');
        }
      }
    } catch (error) {
      console.error('Error fetching bookings:', error);
      setError('Network error. Please check your connection and try again.');
    } finally {
      if (showSpinner) setIsLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadBookings(false); // No spinner, just refresh
    setRefreshing(false);
  };

  const handleBookingAction = async (bookingId: string, action: 'accept' | 'reject' | 'complete', reason?: string) => {
    try {
      const token = await tokenManager.getValidToken();
      if (!token) {
        showAlert(t('alerts.error'), t('alerts.noAuthTokenAvailable'));
        return;
      }

      const status = action === 'accept' ? 'accepted' : action === 'complete' ? 'completed' : 'rejected';
      const payload: any = { status };
      
      if (action === 'reject' && reason) {
        payload.rejectionReason = reason;
      }

      const response = await fetch(`${API_BASE_URL}/api/providers/bookings/${bookingId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const data = await response.json();
        showAlert(t('alerts.success'), data.message || t('alerts.bookingActionSuccess', { action }));
        // Refresh bookings to get updated data
        loadBookings();
      } else {
        const errorData = await response.json();
        showAlert(t('alerts.error'), errorData.message || t('alerts.failedToActionBooking', { action }));
      }
    } catch (error) {
      console.error('Error updating booking status:', error);
              showAlert(t('alerts.error'), t('alerts.networkError'));
    }
  };

  const openRejectModal = (bookingId: string) => {
    setRejectBookingId(bookingId);
    setRejectReason('');
    setCustomOtherReason('');
    setRejectModalVisible(true);
  };

  const handleRejectSubmit = async () => {
    let reason = rejectReason;
    if (isOtherRejectReason) reason = customOtherReason;
    if (!reason.trim() || !rejectBookingId) return;
    await handleBookingAction(rejectBookingId, 'reject', reason);
    setRejectModalVisible(false);
    setRejectBookingId(null);
    setRejectReason('');
    setCustomOtherReason('');
  };

  const openReportModal = (item: Booking) => {
    setReportBooking(item);
    setReportReason('');
    setCustomReportOtherReason('');
    setReportModalVisible(true);
  };

  const handleReportSubmit = () => {
    let reason = reportReason;
    if (isOtherReportReason) reason = customReportOtherReason;
    if (!reason.trim() || !reportBooking) return;


    setReportModalVisible(false);
    setReportBooking(null);
    setReportReason('');
    setCustomReportOtherReason('');
    showAlert('Report Submitted', 'The user has been reported. Thank you for helping us maintain a safe community.');
  };

  const openRatingModal = (bookingId: string) => {
    setRatingBookingId(bookingId);
    setCustomerRating(0);
    setRatingFeedback('');
    setRatingModalVisible(true);
  };

  const handleRatingSubmit = async () => {
    if (!ratingBookingId || customerRating === 0) return;


    await handleBookingAction(ratingBookingId, 'complete');
    setRatingModalVisible(false);
    setRatingBookingId(null);
    setCustomerRating(0);
    setRatingFeedback('');
            showAlert(t('alerts.success'), t('alerts.bookingCompleted'));
  };

  const handleRatingSkip = async () => {
    if (!ratingBookingId) return;

    await handleBookingAction(ratingBookingId, 'complete');
    setRatingModalVisible(false);
    setRatingBookingId(null);
    setCustomerRating(0);
    setRatingFeedback('');
            showAlert(t('alerts.success'), t('alerts.bookingCompleted'));
  };

  const filteredBookings = bookings.filter((booking) => {
    if (filter === 'all') return true;
    return booking.status === filter;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'accepted':
        return '#10B981';
      case 'rejected':
        return '#EF4444';
      case 'completed':
        return '#6366F1';
      case 'cancelled':
        return '#6B7280';
      case 'pending':
      default:
        return '#F59E0B';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'accepted':
        return CheckCircle;
      case 'rejected':
        return XCircle;
      case 'completed':
        return CheckCircle;
      case 'cancelled':
        return XCircle;
      case 'pending':
      default:
        return Clock;
    }
  };

  const renderBooking = ({ item }: { item: Booking }) => {
    const StatusIcon = getStatusIcon(item.status);
    const statusColor = getStatusColor(item.status);

    // Get status style for better visual hierarchy
    const getStatusStyle = (status: string) => {
      switch (status) {
        case 'accepted':
          return { bg: '#ECFDF5', text: '#10B981' };
        case 'rejected':
          return { bg: '#FEF2F2', text: '#EF4444' };
        case 'completed':
          return { bg: '#EEF2FF', text: '#6366F1' };
        case 'cancelled':
          return { bg: '#F1F5F9', text: '#6B7280' };
        case 'pending':
        default:
          return { bg: '#FEF3C7', text: '#F59E0B' };
      }
    };

    const statusStyle = getStatusStyle(item.status);

    return (
      <View style={styles.bookingCard}>
        {/* Header with customer info and status */}
        <View style={styles.bookingHeader}>
          <View style={styles.customerInfo}>
            <View style={styles.customerAvatar}>
              <User size={20} color="#3B82F6" />
            </View>
            <View style={styles.customerDetails}>
              <Text style={styles.customerName}>{item.customer_name}</Text>
              <Text style={styles.serviceName}>{item.service_name}</Text>
            </View>
          </View>

          <View style={styles.headerActions}>
            <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
              <View style={[styles.statusDot, { backgroundColor: statusStyle.text }]} />
              <Text style={[styles.statusText, { color: statusStyle.text }]}>
                {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
              </Text>
            </View>
            {(item.status === 'accepted' || item.status === 'completed' || item.status === 'rejected') && (
              <TouchableOpacity style={styles.reportUserIconBtn} onPress={() => openReportModal(item)}>
                <AlertTriangle size={16} color="#EF4444" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Booking details */}
        <View style={styles.details}>
          <View style={styles.detailRow}>
            <View style={styles.detailIcon}>
              <Calendar size={16} color="#3B82F6" />
            </View>
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Appointment</Text>
              <Text style={styles.detailText} numberOfLines={1} ellipsizeMode="tail">
                {(() => {
                  try {
                    // Format date and time separately for clarity
                    const date = format(parseISO(item.appointment_date), 'dd MMM yyyy');
                    let time = item.appointment_time;
                    // Try to parse and format time if possible
                    const timeParts = time.match(/(\d{1,2}):(\d{2}) ?([APMapm]{2})?/);
                    if (timeParts) {
                      let hours = parseInt(timeParts[1], 10);
                      const minutes = timeParts[2];
                      let ampm = timeParts[3];
                      if (!ampm) {
                        // If no AM/PM, guess based on hours
                        ampm = hours < 12 ? 'AM' : 'PM';
                      }
                      time = `${hours % 12 === 0 ? 12 : hours % 12}:${minutes} ${ampm.toUpperCase()}`;
                    }
                    return `${date} at ${time}`;
                  } catch {
                    return item.appointment_date + ' ' + item.appointment_time;
                  }
                })()}
              </Text>
            </View>
          </View>

          <View style={styles.detailRow}>
            <View style={styles.detailIcon}>
              <MapPin size={16} color="#10B981" />
            </View>
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Location</Text>
              <Text style={styles.detailText} numberOfLines={1} ellipsizeMode="tail">
                {(() => {
                  // Priority: state > city from address > fallback
                  if (item.customer_state && item.customer_state.trim()) {
                    return item.customer_state.trim();
                  }
                  
                  if (item.customer_address && item.customer_address.trim()) {
                    // Try to extract city from address
                    const addressParts = item.customer_address.split(',').map(part => part.trim());
                    // Look for common city indicators or take the last meaningful part
                    for (let i = addressParts.length - 1; i >= 0; i--) {
                      const part = addressParts[i];
                      // Skip empty parts and common address elements
                      if (part && 
                          !part.match(/^(street|road|lane|avenue|drive|place|nagar|colony|sector|block|area|zone|district|pincode|pin|postal|code)$/i) &&
                          part.length > 2) {
                        return part;
                      }
                    }
                    // If no good city found, return the last non-empty part
                    const lastPart = addressParts.filter(part => part && part.length > 2).pop();
                    return lastPart || 'At customer location';
                  }
                  
                  return 'At customer location';
                })()}
              </Text>
            </View>
          </View>

        </View>

        {item.description && (
          <Text style={styles.description}>{item.description}</Text>
        )}
        
        {item.estimated_price && (
          <Text style={styles.estimatedPrice}>Estimated: ₹{item.estimated_price}</Text>
        )}

        {/* Action buttons */}
        <View style={styles.actionButtons}>
          {item.status === 'pending' && (
            <>
              <TouchableOpacity
                style={[styles.actionButton, styles.acceptButton]}
                onPress={() => handleBookingAction(item.id, 'accept')}
              >
                <CheckCircle size={14} color="#FFFFFF" />
                <Text style={[styles.actionButtonText, styles.acceptButtonText]}>Accept</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.rejectButton]}
                onPress={() => openRejectModal(item.id)}
              >
                <XCircle size={14} color="#FFFFFF" />
                <Text style={[styles.actionButtonText, styles.rejectButtonText]}>Reject</Text>
              </TouchableOpacity>
            </>
          )}
          
          {item.status === 'accepted' && (
            <>
              <WebRTCCallButton
                bookingId={item.id}
                size="small"
                variant="primary"
                style={styles.callButton}
              />
              <TouchableOpacity
                style={[styles.actionButton, styles.completeButton]}
                onPress={() => openRatingModal(item.id)}
              >
                <CheckCircle size={14} color="#FFFFFF" />
                <Text style={[styles.actionButtonText, styles.completeButtonText]}>Complete</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    );
  };

  if (isLoading && bookings.length === 0) {
    return (
      <SafeView backgroundColor="#F8FAFC">
        <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">{t('bookings.title')}</Text>
          <Text style={styles.subtitle} numberOfLines={1} ellipsizeMode="tail">{t('bookings.subtitle')}</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>{t('bookings.loading')}</Text>
        </View>
      </SafeView>
    );
  }

  if (error) {
    return (
      <SafeView backgroundColor="#F8FAFC">
        <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">{t('bookings.title')}</Text>
          <Text style={styles.subtitle} numberOfLines={1} ellipsizeMode="tail">{t('bookings.subtitle')}</Text>
        </View>
        <View style={styles.errorContainer}>
          <AlertTriangle size={48} color="#EF4444" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => loadBookings(true)}>
            <Text style={styles.retryButtonText}>{t('bookings.retry')}</Text>
          </TouchableOpacity>
        </View>
      </SafeView>
    );
  }

  if (bookings.length === 0) {
    return (
      <SafeView backgroundColor="#F8FAFC">
        <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">{t('bookings.title')}</Text>
          <Text style={styles.subtitle} numberOfLines={1} ellipsizeMode="tail">{t('bookings.subtitle')}</Text>
        </View>
        <View style={styles.emptyContainer}>
          <View style={styles.emptyState}>
            <Calendar size={64} color="#9CA3AF" />
            <Text style={styles.emptyTitle}>{t('bookings.emptyTitle')}</Text>
            <Text style={styles.emptySubtitle}>
              {t('bookings.emptySubtitle')}
            </Text>
          </View>
        </View>
      </SafeView>
    );
  }

  return (
    <SafeView backgroundColor="#F8FAFC">
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">{t('bookings.title')}</Text>
        <Text style={styles.subtitle} numberOfLines={1} ellipsizeMode="tail">{t('bookings.subtitle')}</Text>
      </View>

      <View style={styles.filterContainer}>
        {['all', 'pending', 'accepted', 'completed'].map((filterOption) => (
          <TouchableOpacity
            key={filterOption}
            style={[styles.filterButton, filter === filterOption && styles.activeFilter]}
            onPress={() => setFilter(filterOption as any)}
          >
            <Text style={[styles.filterText, filter === filterOption && styles.activeFilterText]}>
              {filterOption.charAt(0).toUpperCase() + filterOption.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filteredBookings}
        renderItem={renderBooking}
        keyExtractor={(item) => item.id}
        style={styles.bookingsList}
        contentContainerStyle={styles.bookingsListContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyBookings}>
            <Clock size={48} color="#D1D5DB" />
            <Text style={styles.emptyBookingsText}>No {filter === 'all' ? '' : filter} bookings found.</Text>
            <Text style={styles.emptyBookingsSubtext}>Check back later for new requests.</Text>
          </View>
        }
      />

      {/* Reject Reason Modal */}
      <RNModal
        visible={rejectModalVisible}
        onRequestClose={() => setRejectModalVisible(false)}
        transparent
        animationType="slide"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Reject Booking</Text>
            <Text style={styles.modalSubtitle}>Please provide a reason for rejecting this booking:</Text>

            <ScrollView style={styles.reasonList}>
              {cancelReasons.map((reason) => (
                <TouchableOpacity
                  key={reason}
                  style={[styles.reasonItem, rejectReason === reason && styles.selectedReason]}
                  onPress={() => setRejectReason(reason)}
                >
                  <Text style={[styles.reasonText, rejectReason === reason && styles.selectedReasonText]}>
                    {reason}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {isOtherRejectReason && (
              <TextInput
                style={styles.customReasonInput}
                placeholder="Please specify the reason..."
                value={customOtherReason}
                onChangeText={setCustomOtherReason}
                multiline
                numberOfLines={3}
              />
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setRejectModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.submitButton, !canSubmitReject && styles.disabledButton]}
                onPress={handleRejectSubmit}
                disabled={!canSubmitReject}
              >
                <Text style={styles.submitButtonText}>Reject Booking</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </RNModal>

      {/* Report User Modal */}
      <RNModal
        visible={reportModalVisible}
        onRequestClose={() => setReportModalVisible(false)}
        transparent
        animationType="slide"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Report User</Text>
            <Text style={styles.modalSubtitle}>Please select a reason for reporting this user:</Text>

            <ScrollView style={styles.reasonList}>
              {reportReasons.map((reason) => (
                <TouchableOpacity
                  key={reason}
                  style={[styles.reasonItem, reportReason === reason && styles.selectedReason]}
                  onPress={() => setReportReason(reason)}
                >
                  <Text style={[styles.reasonText, reportReason === reason && styles.selectedReasonText]}>
                    {reason}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {isOtherReportReason && (
              <TextInput
                style={styles.customReasonInput}
                placeholder="Please specify the reason..."
                value={customReportOtherReason}
                onChangeText={setCustomReportOtherReason}
                multiline
                numberOfLines={3}
              />
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setReportModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.submitButton, !canSubmitReport && styles.disabledButton]}
                onPress={handleReportSubmit}
                disabled={!canSubmitReport}
              >
                <Text style={styles.submitButtonText}>Submit Report</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </RNModal>

      {/* Rating Modal */}
      <RNModal
        visible={ratingModalVisible}
        onRequestClose={() => setRatingModalVisible(false)}
        transparent
        animationType="slide"
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { padding: 28, borderRadius: 20, alignItems: 'center' }]}>
            <Text style={[styles.modalTitle, { fontSize: 22, fontWeight: '700', marginBottom: 8 }]}>Rate Customer</Text>
            <Text style={[styles.modalSubtitle, { fontSize: 15, color: '#64748B', marginBottom: 18, textAlign: 'center' }]}>How would you rate your experience with this customer?</Text>

            <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 18 }}>
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity
                  key={star}
                  onPress={() => setCustomerRating(star)}
                  style={{ marginHorizontal: 4 }}
                >
                  <Star
                    size={38}
                    color={star <= customerRating ? '#F59E0B' : '#D1D5DB'}
                    fill={star <= customerRating ? '#F59E0B' : 'none'}
                  />
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={[styles.feedbackInput, { minHeight: 60, borderRadius: 10, padding: 12, fontSize: 15, marginBottom: 22, backgroundColor: '#F1F5F9', width: '100%' }]}
              placeholder="Optional: Add your feedback..."
              value={ratingFeedback}
              onChangeText={setRatingFeedback}
              multiline
              numberOfLines={3}
              placeholderTextColor="#94A3B8"
            />

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%' }}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton, { flex: 1, marginRight: 10 }]}
                onPress={() => setRatingModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.submitButton, { flex: 2, backgroundColor: '#3B82F6', borderRadius: 10, shadowColor: '#3B82F6', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: 4 }]}
                onPress={handleRatingSubmit}
              >
                <Text style={[styles.submitButtonText, { fontWeight: '700', fontSize: 16 }]}>Submit Rating</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </RNModal>

             {/* Alert Modal */}
       <Modal
         visible={showAlertModal}
         onClose={() => setShowAlertModal(false)}
         title={alertConfig.title}
         message={alertConfig.message}
         type={alertConfig.type}
         buttons={alertConfig.buttons}
       />
    </SafeView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC', // Lighter background for the entire screen
  },
  emptyContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    paddingHorizontal: getResponsiveSpacing(16, 20, 24),
    paddingTop: getResponsiveSpacing(16, 20, 24),
    paddingBottom: getResponsiveSpacing(12, 14, 16),
    backgroundColor: '#FFFFFF', // Header background white
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9', // Subtle border
    shadowColor: '#000', // iOS shadow
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 3, // Android shadow
  },
  title: {
    fontSize: getResponsiveSpacing(22, 24, 26), // Slightly smaller, more refined title
    fontFamily: 'Inter-Bold',
    color: '#1E293B', // Darker text for main titles
    marginBottom: getResponsiveSpacing(2, 3, 4),
    flexShrink: 1,
  },
  subtitle: {
    fontSize: getResponsiveSpacing(13, 14, 15),
    fontFamily: 'Inter-Regular',
    color: '#64748B', // Slightly darker gray for subtitles
    flexShrink: 1,
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: getResponsiveSpacing(16, 20, 24),
    paddingVertical: getResponsiveSpacing(12, 14, 16), // Added vertical padding
    gap: getResponsiveSpacing(8, 9, 10), // Increased gap for better spacing
    backgroundColor: '#FFFFFF', // Filter background white
    borderBottomLeftRadius: getResponsiveSpacing(12, 14, 16), // Rounded bottom corners
    borderBottomRightRadius: getResponsiveSpacing(12, 14, 16),
    marginBottom: getResponsiveSpacing(10, 11, 12), // Space from the list
    shadowColor: '#000', // iOS shadow
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 3, // Android shadow
  },
  filterButton: {
    flex: 1,
    paddingVertical: getResponsiveSpacing(8, 10, 12), // Increased vertical padding
    borderRadius: 25, // More rounded, pill-shaped buttons
    backgroundColor: '#E2E8F0', // Lighter gray for inactive filters
    alignItems: 'center', // Center content horizontally
    justifyContent: 'center', // Center content vertically
    minHeight: getResponsiveSpacing(32, 36, 40),
  },
  activeFilter: {
    backgroundColor: '#3B82F6', // Primary blue for active filter
    shadowColor: '#3B82F6', // Subtle shadow for active filter
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4,
  },
  filterText: {
    fontSize: getResponsiveSpacing(12, 13, 14),
    fontFamily: 'Inter-SemiBold', // Stronger font for filter text
    color: '#64748B', // Darker gray for inactive text
    textAlign: 'center',
    lineHeight: getResponsiveSpacing(16, 18, 20),
    flexShrink: 1,
  },
  activeFilterText: {
    color: '#FFFFFF',
  },
  bookingsList: {
    flex: 1,
    paddingHorizontal: 24,
    // No background here, let container handle it
  },
  bookingsListContent: {
    flexGrow: 1,
    paddingTop: getResponsiveSpacing(6, 8, 10), // Space at the top to separate from filters
  },
  bookingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: getResponsiveSpacing(14, 16, 18),
    padding: getResponsiveSpacing(16, 20, 24),
    marginBottom: getResponsiveSpacing(12, 16, 20),
    minHeight: 0,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: getResponsiveSpacing(1, 2, 3) },
        shadowOpacity: 0.1,
        shadowRadius: getResponsiveSpacing(6, 8, 10),
      },
      android: {
        elevation: getResponsiveSpacing(2, 3, 4),
      },
    }),
  },
  bookingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: getResponsiveSpacing(16, 20, 24),
    minHeight: 0,
  },
  customerInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
    marginRight: getResponsiveSpacing(12, 16, 20),
  },
  customerAvatar: {
    width: getResponsiveSpacing(40, 48, 56),
    height: getResponsiveSpacing(40, 48, 56),
    borderRadius: getResponsiveSpacing(20, 24, 28),
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: getResponsiveSpacing(8, 12, 16),
  },
  customerDetails: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  customerName: {
    fontSize: getResponsiveFontSize(16, 18, 20),
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: getResponsiveSpacing(3, 4, 5),
    lineHeight: getResponsiveFontSize(20, 22, 24),
  },
  serviceName: {
    fontSize: getResponsiveFontSize(13, 14, 15),
    color: '#64748B',
    marginBottom: getResponsiveSpacing(6, 8, 10),
    lineHeight: getResponsiveFontSize(16, 18, 20),
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: getResponsiveSpacing(6, 8, 10),
  },
  statusBadge: {
    paddingHorizontal: getResponsiveSpacing(10, 12, 14),
    paddingVertical: getResponsiveSpacing(6, 8, 10),
    borderRadius: getResponsiveSpacing(16, 20, 24),
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexShrink: 0,
  },
  statusDot: {
    width: getResponsiveSpacing(6, 8, 10),
    height: getResponsiveSpacing(6, 8, 10),
    borderRadius: getResponsiveSpacing(3, 4, 5),
    marginRight: getResponsiveSpacing(4, 6, 8),
  },
  statusText: {
    fontSize: getResponsiveFontSize(10, 12, 14),
    fontWeight: '600',
    lineHeight: getResponsiveFontSize(14, 16, 18),
  },
  details: {
    marginBottom: getResponsiveSpacing(12, 16, 20),
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: getResponsiveSpacing(10, 12, 14),
  },
  detailIcon: {
    width: getResponsiveSpacing(28, 32, 36),
    height: getResponsiveSpacing(28, 32, 36),
    borderRadius: getResponsiveSpacing(14, 16, 18),
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: getResponsiveSpacing(8, 12, 16),
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    fontSize: getResponsiveFontSize(10, 12, 14),
    fontWeight: '500',
    color: '#64748B',
    marginBottom: getResponsiveSpacing(1, 2, 3),
    lineHeight: getResponsiveFontSize(14, 16, 18),
  },
  detailText: {
    fontSize: getResponsiveFontSize(13, 14, 15),
    color: '#1E293B',
    fontWeight: '500',
    lineHeight: getResponsiveFontSize(18, 20, 22),
  },
  description: {
    fontSize: 14.5, // Slightly larger description text
    fontFamily: 'Inter-Regular',
    color: '#475569',
    marginBottom: 12, // More space
    lineHeight: 22, // Better line height for readability
  },
  estimatedPrice: {
    fontSize: 17, // Larger price
    fontFamily: 'Inter-Bold', // Bolder price
    color: '#3B82F6', // Primary blue
    marginBottom: 16,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: getResponsiveSpacing(6, 8, 10),
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: getResponsiveSpacing(12, 16, 20),
    paddingVertical: getResponsiveSpacing(8, 10, 12),
    borderRadius: getResponsiveSpacing(10, 12, 14),
    minHeight: getResponsiveSpacing(36, 40, 44),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: getResponsiveSpacing(1, 1, 2) },
    shadowOpacity: 0.1,
    shadowRadius: getResponsiveSpacing(1, 2, 3),
    elevation: getResponsiveSpacing(1, 2, 3),
  },
  actionButtonText: {
    fontSize: getResponsiveFontSize(12, 14, 16),
    fontWeight: '600',
    marginLeft: getResponsiveSpacing(4, 6, 8),
    lineHeight: getResponsiveFontSize(14, 16, 18),
  },
  acceptButton: {
    backgroundColor: '#10B981',
  },
  acceptButtonText: {
    color: '#FFFFFF',
  },
  rejectButton: {
    backgroundColor: '#EF4444',
  },
  rejectButtonText: {
    color: '#FFFFFF',
  },
  callButton: {
    backgroundColor: '#3B82F6',
  },
  callButtonText: {
    color: '#FFFFFF',
  },
  completeButton: {
    backgroundColor: '#6366F1',
  },
  completeButtonText: {
    color: '#FFFFFF',
  },
  reportUserIconBtn: {
    width: getResponsiveSpacing(28, 32, 36),
    height: getResponsiveSpacing(28, 32, 36),
    borderRadius: getResponsiveSpacing(14, 16, 18),
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: getResponsiveSpacing(1, 1, 2) },
    shadowOpacity: 0.05,
    shadowRadius: getResponsiveSpacing(1, 2, 3),
    elevation: getResponsiveSpacing(1, 1, 2),
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    backgroundColor: '#FFFFFF', // Ensures white background for empty state
  },
  emptyTitle: {
    fontSize: 22,
    fontFamily: 'Inter-Bold',
    color: '#1E293B',
    marginTop: 20,
    marginBottom: 10,
    textAlign: 'center', // Center text horizontally
  },
  emptySubtitle: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    color: '#64748B',
    textAlign: 'center', // Center text horizontally
    lineHeight: 22,
    marginBottom: 24,
  },
  registerServiceButton: {
    backgroundColor: '#3B82F6',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 5,
    alignItems: 'center', // Center button text
    justifyContent: 'center', // Center button text
  },
  registerServiceButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#FFFFFF',
  },
  emptyBookings: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center', // Center content horizontally
    paddingVertical: 60, // More vertical padding
    paddingHorizontal: 20,
  },
  emptyBookingsText: {
    fontSize: 17,
    fontFamily: 'Inter-SemiBold',
    color: '#94A3B8', // A softer gray
    marginTop: 16,
    textAlign: 'center', // Center text horizontally
  },
  emptyBookingsSubtext: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#CBD5E1', // Even lighter gray
    marginTop: 4,
    textAlign: 'center', // Center text horizontally
  },
  // Modal Styles (Unified and refined)
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)', // More opaque for better focus
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 28,
    paddingTop: 28,
    paddingBottom: 40,
    minHeight: 420,
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 16,
  },
  modalTitle: {
    fontSize: 22,
    fontFamily: 'Inter-Bold',
    color: '#1E293B',
    flex: 1,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 17,
    fontFamily: 'Inter-SemiBold',
    color: '#1E293B',
    marginBottom: 8,
    marginTop: 8,
    textAlign: 'center',
  },
  reasonList: {
    maxHeight: 200,
    marginBottom: 16,
  },
  reasonItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#E2E8F0',
  },
  selectedReason: {
    borderColor: '#3B82F6',
    backgroundColor: '#DBEAFE',
  },
  reasonText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: '#1E293B',
    flex: 1,
  },
  selectedReasonText: {
    color: '#3B82F6',
  },
  customReasonInput: {
    marginBottom: 18,
    borderWidth: 2,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 14,
    width: '100%',
    minHeight: 90,
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: '#1E293B',
    backgroundColor: '#F8FAFC',
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 14,
    marginTop: 20,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 2,
  },
  cancelButton: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#F87171',
  },
  submitButton: {
    backgroundColor: '#3B82F6',
    borderWidth: 1,
    borderColor: '#2563EB',
  },
  cancelButtonText: {
    color: '#64748B',
    fontFamily: 'Inter-SemiBold',
    fontSize: 17,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontFamily: 'Inter-Bold',
  },
  disabledButton: {
    opacity: 0.5,
  },
  ratingContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 22,
    gap: 10,
  },
  starButton: {
    padding: 10,
  },
  feedbackInput: {
    marginTop: 10,
    borderWidth: 2,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 14,
    width: '100%',
    minHeight: 90,
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: '#1E293B',
    backgroundColor: '#F8FAFC',
    textAlignVertical: 'top',
  },
  skipButton: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#F87171',
  },
  skipButtonText: {
    color: '#64748B',
    fontFamily: 'Inter-SemiBold',
    fontSize: 17,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 17,
    fontFamily: 'Inter-SemiBold',
    color: '#64748B',
    marginTop: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorText: {
    fontSize: 17,
    fontFamily: 'Inter-SemiBold',
    color: '#DC2626',
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: '#3B82F6',
    paddingVertical: getResponsiveSpacing(12, 14, 16),
    paddingHorizontal: getResponsiveSpacing(20, 24, 28),
    borderRadius: getResponsiveSpacing(10, 12, 14),
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 5,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: getResponsiveSpacing(100, 120, 140),
    minHeight: getResponsiveSpacing(40, 44, 48),
  },
  retryButtonText: {
    fontSize: getResponsiveSpacing(14, 16, 18),
    fontFamily: 'Inter-SemiBold',
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: getResponsiveSpacing(18, 20, 22),
    flexShrink: 1,
  },
});