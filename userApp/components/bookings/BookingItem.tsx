import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  Image, 
  Platform,
  Modal as RNModal,
  TextInput,
  ScrollView,
  Dimensions,
  useWindowDimensions
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Calendar, Flag, Star, X, XCircle, Phone, MapPin, CreditCard } from 'lucide-react-native';
import { Modal } from '@/components/common/Modal';
import WebRTCCallButton from '@/components/calls/WebRTCCallButton';
import { format, parseISO } from 'date-fns';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { useBookings } from '@/context/BookingContext';

import { SERVICE_CATEGORIES } from '@/constants/serviceCategories';

// Helper function to get service names from comma-separated service IDs
const getServiceNamesFromIds = (selectedService: string | null | undefined): string => {
  if (!selectedService || selectedService.trim() === '') {
    return 'N/A';
  }
  
  const serviceIds = selectedService.split(',').map(id => id.trim()).filter(id => id);
  if (serviceIds.length === 0) {
    return 'N/A';
  }
  
  const serviceNames = serviceIds.map(id => {
    const service = SERVICE_CATEGORIES.find(s => s.id === id);
    return service ? service.name : id;
  });
  
  return serviceNames.join(', ');
};

interface BookingProps {
  booking: {
    id: string;
    serviceName: string;
    providerName: string;
    appointmentDate: string;
    appointmentTime: string;
    status: string;
    imageUrl: string;
    reportReason?: string;
    reportDescription?: string;
    rating?: {
      rating: number;
      review?: string;
      created_at: string;
    } | null;
    selectedService?: string; // Add selected services
  };
  onStatusChange?: (bookingId: string, newStatus: string) => void;
  onBookingReported?: (bookingId: string) => void;
}

export function BookingItem({ booking, onStatusChange, onBookingReported }: BookingProps) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { fetchUnreadCount } = useBookings();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // Responsive design constants
  const isSmallDevice = width < 375;
  const isMediumDevice = width >= 375 && width < 414;
  const isLargeDevice = width >= 414;

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
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertConfig, setAlertConfig] = useState<{
    title: string;
    message: string;
    type: 'success' | 'error' | 'info' | 'warning';
    buttons?: { text: string; onPress: () => void; style?: 'primary' | 'secondary' | 'destructive' }[];
  }>({
    title: '',
    message: '',
    type: 'info',
  });
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isReporting, setIsReporting] = useState(false);
  const [selectedReason, setSelectedReason] = useState('');
  const [otherReason, setOtherReason] = useState('');
  const [selectedReportReason, setSelectedReportReason] = useState('');
  const [otherReportReason, setOtherReportReason] = useState('');

  // Dynamic arrays with translations
  const CANCELLATION_REASONS = [
    t('bookingItem.changeOfPlans'),
    t('bookingItem.foundAnotherProvider'),
    t('bookingItem.serviceNoLongerNeeded'),
    t('bookingItem.priceConcerns'),
    t('bookingItem.scheduleConflict'),
    t('bookingItem.other')
  ];

  const REPORT_REASONS = [
    t('bookingItem.unprofessionalBehavior'),
    t('bookingItem.poorServiceQuality'),
    t('bookingItem.noShowOrLateArrival'),
    t('bookingItem.inappropriateConduct'),
    t('bookingItem.safetyConcerns'),
    t('bookingItem.fraudOrScam'),
    t('bookingItem.harassment'),
    t('bookingItem.other')
  ];

  // Format date and time for display
  let formattedDateTime = '';
  try {
    // Format date
    const date = format(parseISO(booking.appointmentDate), 'dd MMM yyyy');
    
    // Format time with proper AM/PM handling
    let time = booking.appointmentTime;
    if (time) {
      // Try to parse and format time if possible
      const timeParts = time.match(/(\d{1,2}):(\d{2}) ?([APMapm]{2})?/);
      if (timeParts) {
        let hours = parseInt(timeParts[1], 10);
        const minutes = timeParts[2];
        let ampm = timeParts[3];
        
        if (!ampm) {
          // If no AM/PM, assume it's already in 12-hour format
          ampm = hours < 12 ? 'AM' : 'PM';
        }
        
        // Convert to 12-hour format for display
        if (hours > 12) {
          hours = hours - 12;
        } else if (hours === 0) {
          hours = 12;
        }
        
        time = `${hours}:${minutes} ${ampm.toUpperCase()}`;
      }
      formattedDateTime = `${date} at ${time}`;
    } else {
      formattedDateTime = date;
    }
  } catch (error) {
    // Fallback: display date and time as strings
    formattedDateTime = booking.appointmentDate + (booking.appointmentTime ? (', ' + booking.appointmentTime) : '');
  }

  // Only show cancel if not confirmed/accepted/completed/cancelled
  const canCancel = !['confirmed', 'accepted', 'completed', 'cancelled'].includes(booking.status);

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'accepted':
        return {
          bg: '#ECFDF5', // light green
          text: '#10B981', // green
        };
      case 'pending':
        return {
          bg: '#FFF7ED', // light orange
          text: '#F59E0B', // orange
        };
      case 'completed':
        return {
          bg: '#EEF2FF', // light purple
          text: '#6366F1', // purple
        };
      case 'cancelled':
      case 'rejected':
        return {
          bg: '#FEF2F2', // light red
          text: '#EF4444', // red
        };
      default:
        return {
          bg: '#F1F5F9',
          text: '#64748B',
        };
    }
  };

  const handleRateService = async () => {
    // Mark booking as viewed when user opens rating modal (viewing booking details)
    if (booking.status && ['accepted', 'cancelled', 'completed'].includes(booking.status)) {
      try {
        const { apiPut } = await import('@/utils/apiClient');
        await apiPut(`/api/bookings/${booking.id}/mark-viewed`);
        // Refresh unread count
        fetchUnreadCount().catch(() => {
          // Errors are already handled in fetchUnreadCount
        });
      } catch (error) {
        // Silently fail - marking as viewed is not critical
      }
    }
    
    // Pre-populate with existing rating if available
    if (booking.rating) {
      setRating(booking.rating.rating);
      setComment(booking.rating.review || '');
    } else {
      setRating(0);
      setComment('');
    }
    setShowRatingModal(true);
  };

  const handleCancelBooking = () => {
    setShowCancelModal(true);
  };

  const handleReportProvider = () => {
    // Check if already reported
    if (booking.reportReason) {
      showAlert(t('bookingItem.alreadyReported'), t('bookingItem.alreadyReportedMessage'), 'warning');
      return;
    }
    setShowReportModal(true);
  };


  const showAlert = (title: string, message: string, type: 'success' | 'error' | 'info' | 'warning', buttons?: { text: string; onPress: () => void; style?: 'primary' | 'secondary' | 'destructive' }[]) => {
    setAlertConfig({ title, message, type, buttons });
    setShowAlertModal(true);
  };

  const handleCancelConfirm = async () => {
    if (!selectedReason || (selectedReason === t('bookingItem.other') && !otherReason.trim())) return;
    setIsCancelling(true);
    try {
      // Use centralized API client so token refresh and reconnection are handled globally
      const { apiPut } = await import('@/utils/apiClient');
      
      const response = await apiPut(`/api/bookings/${booking.id}/cancel`, {
        cancellationReason: selectedReason === t('bookingItem.other') ? otherReason : selectedReason
      });

      if (response.ok && response.data && response.data.status === 'success') {
        if (onStatusChange) onStatusChange(booking.id, 'cancelled');
        setShowCancelModal(false);
        setSelectedReason('');
        setOtherReason('');
        showAlert(t('bookingItem.bookingCancelled'), t('bookingItem.bookingCancelledSuccess'), 'success');
      } else {
        const errorMessage = response.data?.message || t('alerts.error.generic');
        showAlert('Error', errorMessage, 'error');
      }
    } catch (err: any) {
      // apiClient already handled token refresh / logout; show user-friendly error
      const errorMessage = err?.message || err?.data?.message || t('alerts.error.generic');
      showAlert('Error', errorMessage, 'error');
    } finally {
      setIsCancelling(false);
    }
  };

  const handleReportConfirm = async () => {
    if (!selectedReportReason || (selectedReportReason === t('bookingItem.other') && !otherReportReason.trim())) return;
    
    // Check if already reported
    if (booking.reportReason) {
      showAlert(t('bookingItem.alreadyReported'), t('bookingItem.alreadyReportedMessage'), 'warning');
      setShowReportModal(false);
      return;
    }
    
    setIsReporting(true);
    try {
      // Use centralized API client so token refresh and reconnection are handled globally
      const { apiPost } = await import('@/utils/apiClient');
      
      const response = await apiPost(`/api/bookings/${booking.id}/report`, {
        reportReason: selectedReportReason,
        reportDescription: selectedReportReason === t('bookingItem.other') ? otherReportReason : selectedReportReason
      });

      if (response.ok && response.data && response.data.status === 'success') {
        setShowReportModal(false);
        setSelectedReportReason('');
        setOtherReportReason('');
        showAlert(t('bookingItem.reportSubmitted'), t('bookingItem.reportSubmittedSuccess'), 'success');
        // Update the booking to reflect it has been reported
        if (onBookingReported) {
          onBookingReported(booking.id);
        }
      } else {
        const errorMessage = response.data?.message || t('alerts.error.generic');
        showAlert('Error', errorMessage, 'error');
      }
    } catch (err: any) {
      // apiClient already handled token refresh / logout; show user-friendly error
      const errorMessage = err?.message || err?.data?.message || t('alerts.error.generic');
      showAlert('Error', errorMessage, 'error');
    } finally {
      setIsReporting(false);
    }
  };

  const submitRating = async () => {
    if (rating === 0) {
      showAlert(t('bookingItem.ratingRequired'), t('bookingItem.pleaseSelectRating'), 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      // Use centralized API client so token refresh and reconnection are handled globally
      const { apiPost } = await import('@/utils/apiClient');
      
      const response = await apiPost(`/api/bookings/${booking.id}/rate`, {
        rating,
        review: comment || null
      });

      if (response.ok && response.data && response.data.status === 'success') {
        setShowRatingModal(false);
        setRating(0);
        setComment('');
        showAlert(
          t('bookingItem.thankYou'),
          booking.rating 
            ? t('bookingItem.ratingUpdated')
            : t('bookingItem.ratingSubmitted'),
          'success',
          [{ text: 'OK', onPress: () => setShowAlertModal(false), style: 'primary' }]
        );
        // Refresh booking data to show updated rating
        if (onBookingReported) {
          onBookingReported(booking.id);
        }
      } else {
        const errorMessage = response.data?.message || t('alerts.error.generic');
        showAlert('Error', errorMessage, 'error');
      }
    } catch (err: any) {
      // apiClient already handled token refresh / logout; show user-friendly error
      const errorMessage = err?.message || err?.data?.message || t('alerts.error.generic');
      showAlert('Error', errorMessage, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const statusStyle = getStatusColor(booking.status);

  return (
    <>
      <TouchableOpacity 
        style={styles.container}
        activeOpacity={0.8}
      >
        {/* Header with provider info and status */}
        <View style={styles.header}>
          <View style={styles.providerInfo}>
            <View style={styles.imageContainer}>
              <Image source={{ uri: booking.imageUrl }} style={styles.providerImage} />
              <View style={[styles.statusIndicator, { backgroundColor: statusStyle.bg }]} />
            </View>
            <View style={styles.providerDetails}>
              <Text style={styles.serviceName} numberOfLines={1} ellipsizeMode="tail">{booking.providerName}</Text>
              <Text style={styles.providerName} numberOfLines={1} ellipsizeMode="tail">{booking.serviceName}</Text>
              <View style={styles.ratingContainer}>
                <View style={styles.stars}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Text key={star} style={[
                      styles.star,
                      booking.rating && star <= booking.rating.rating && styles.starFilled
                    ]}>
                      {booking.rating && star <= booking.rating.rating ? '⭐' : '☆'}
                    </Text>
                  ))}
                </View>
                <Text style={styles.ratingText}>
                  {booking.rating 
                    ? `${booking.rating.rating.toFixed(1)} (${booking.rating.review ? t('bookingItem.withReview') : t('bookingItem.rated')})`
                    : t('bookingItem.notRatedYet')
                  }
                </Text>
              </View>
            </View>
          </View>
          <View style={[
            styles.statusBadge, 
            { backgroundColor: statusStyle.bg }
          ]}>
            <View style={[styles.statusDot, { backgroundColor: statusStyle.text }]} />
            <Text style={[
              styles.statusText,
              { color: statusStyle.text }
            ]}>
              {getTranslatedStatus(booking.status)}
            </Text>
          </View>
        </View>
        
        {/* Booking details */}
        <View style={styles.details}>
          <View style={styles.detailRow}>
            <View style={styles.detailIcon}>
              <Calendar size={16} color="#3B82F6" />
            </View>
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>{t('bookingItem.appointment')}</Text>
              <Text style={styles.detailText} numberOfLines={1} ellipsizeMode="tail">{formattedDateTime}</Text>
            </View>
          </View>
          
          <View style={styles.detailRow}>
            <View style={styles.detailIcon}>
              <MapPin size={16} color="#10B981" />
            </View>
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>{t('bookingItem.location')}</Text>
              <Text style={styles.detailText} numberOfLines={1} ellipsizeMode="tail">{t('bookingItem.atYourLocation')}</Text>
            </View>
          </View>
          
          {booking.selectedService && (
            <View style={styles.detailRow}>
              <View style={styles.detailIcon}>
                <CreditCard size={16} color="#8B5CF6" />
              </View>
              <View style={styles.detailContent}>
                <Text style={styles.detailLabel}>Sub-Services</Text>
                <Text style={styles.detailText} numberOfLines={2} ellipsizeMode="tail">
                  {getServiceNamesFromIds(booking.selectedService)}
                </Text>
              </View>
            </View>
          )}
        </View>
        
        {/* Action buttons */}
        <View style={styles.actionButtons}>
          {booking.status === 'accepted' && (
            <View style={styles.callButtonContainer}>
              <WebRTCCallButton
                bookingId={booking.id}
                size="small"
                variant="primary"
                style={styles.callButton}
              />
            </View>
          )}
          <View style={styles.secondaryActions}>
            <TouchableOpacity 
              style={[
                styles.actionButton, 
                styles.reportButton,
                booking.reportReason && styles.disabledButton
              ]}
              onPress={handleReportProvider}
              disabled={isReporting || !!booking.reportReason}
            >
              <Flag size={14} color={booking.reportReason ? "#9CA3AF" : "#EF4444"} />
              <Text style={[
                  styles.actionButtonText, 
                  styles.reportButtonText,
                  booking.reportReason && styles.disabledButtonText
                ]}>
                  {booking.reportReason ? t('bookingItem.reported') : t('bookingItem.report')}
                </Text>
            </TouchableOpacity>
            
            {booking.status === 'completed' && (
              <TouchableOpacity 
                style={[styles.actionButton, styles.rateButton]}
                onPress={handleRateService}
              >
                <Star size={14} color="#F59E0B" />
                <Text style={[styles.actionButtonText, styles.rateButtonText]}>
                  {booking.rating ? t('bookingItem.updateRating') : t('bookingItem.rate')}
                </Text>
              </TouchableOpacity>
            )}

            {canCancel && (
              <TouchableOpacity 
                style={[styles.actionButton, styles.cancelButton]}
                onPress={handleCancelBooking}
                disabled={isCancelling}
              >
                <XCircle size={14} color="#EF4444" />
                <Text style={[styles.actionButtonText, styles.cancelButtonText]}>
                  {isCancelling ? t('bookingItem.cancelling') : t('bookingItem.cancel')}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </TouchableOpacity>

      {/* Rating Modal */}
      <RNModal
        visible={showRatingModal}
        animationType="slide"
        onRequestClose={() => setShowRatingModal(false)}
      >
        <View style={styles.modalRatingContainer}>
          <View style={styles.ratingHeader}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowRatingModal(false)}
            >
              <X size={24} color="#64748B" />
            </TouchableOpacity>
            <Text style={styles.ratingTitle}>
              {booking.rating ? t('bookingItem.updateRating') : t('bookingItem.rateService')}
            </Text>
            <View style={styles.placeholder} />
          </View>

          <ScrollView style={styles.ratingContent}>
            <View style={styles.serviceInfo}>
              <Image source={{ uri: booking.imageUrl }} style={styles.modalProviderImage} />
              <View>
                <Text style={styles.modalServiceName}>{booking.providerName}</Text>
                <Text style={styles.modalProviderName}>{booking.serviceName}</Text>
              </View>
            </View>

            <View style={styles.ratingSection}>
              <Text style={styles.ratingLabel}>{t('bookingItem.howWasYourExperience')}</Text>
              <View style={styles.starsContainer}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <TouchableOpacity
                    key={star}
                    style={styles.starButton}
                    onPress={() => setRating(star)}
                  >
                    <Star
                      size={40}
                      color={star <= rating ? '#F59E0B' : '#E2E8F0'}
                      fill={star <= rating ? '#F59E0B' : 'none'}
                    />
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.ratingDescription}>
                {rating === 1 ? t('bookingItem.poor') :
                 rating === 2 ? t('bookingItem.fair') :
                 rating === 3 ? t('bookingItem.good') :
                 rating === 4 ? t('bookingItem.veryGood') :
                 rating === 5 ? t('bookingItem.excellent') : t('bookingItem.selectARating')}
              </Text>
            </View>

            <View style={styles.commentSection}>
              <Text style={styles.commentLabel}>{t('bookingItem.addAComment')}</Text>
              <TextInput
                style={styles.commentInput}
                placeholder={t('bookingItem.shareYourExperience')}
                placeholderTextColor="#94A3B8"
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                value={comment}
                onChangeText={setComment}
              />
            </View>

            <TouchableOpacity
              style={[styles.submitButton, !rating && styles.submitButtonDisabled]}
              onPress={submitRating}
              disabled={!rating}
            >
              <Text style={styles.submitButtonText}>
                {isSubmitting ? t('bookingItem.submitting') : (booking.rating ? t('bookingItem.updateRating') : t('bookingItem.submitRating'))}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </RNModal>

      {/* Cancel Reason Modal */}
      <RNModal
        visible={showCancelModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCancelModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={[
            styles.modalHeader, 
            { 
              paddingTop: Math.max(insets.top + 8, 16),
              paddingHorizontal: getResponsiveSpacing(16, 20, 24),
              paddingBottom: getResponsiveSpacing(16, 18, 20)
            }
          ]}>
            <TouchableOpacity 
              onPress={() => setShowCancelModal(false)}
              style={styles.closeButton}
            >
              <X size={24} color="#64748B" />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { fontSize: getResponsiveFontSize(16, 18, 20) }]}>
              {t('bookingItem.cancelBooking')}
            </Text>
            <View style={styles.placeholder} />
          </View>

          <ScrollView 
            style={styles.modalContent}
            contentContainerStyle={styles.modalContentContainer}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.bookingSummary}>
              <Image source={{ uri: booking.imageUrl }} style={styles.modalProviderImage} />
              <View style={styles.bookingDetails}>
                <Text style={styles.modalServiceName}>{booking.serviceName}</Text>
                <Text style={styles.modalProviderName}>{booking.providerName}</Text>
                <View style={styles.bookingDateContainer}>
                  <Calendar size={16} color="#64748B" />
                  <Text style={styles.modalDate}>{formattedDateTime}</Text>
                </View>
              </View>
            </View>

            <View style={styles.reasonSection}>
              <Text style={styles.reasonTitle}>{t('bookingItem.whyAreYouCancelling')}</Text>
              <Text style={styles.reasonSubtitle}>{t('bookingItem.pleaseSelectReason')}</Text>
               
              <View style={styles.reasonsContainer}>
                {CANCELLATION_REASONS.map((reason) => (
                  <TouchableOpacity
                    key={reason}
                    style={[
                      styles.reasonOption,
                      selectedReason === reason && styles.selectedReasonOption
                    ]}
                    onPress={() => setSelectedReason(reason)}
                  >
                    <View style={styles.reasonContent}>
                      <View style={[
                        styles.reasonRadio,
                        selectedReason === reason && styles.reasonRadioSelected
                      ]}>
                        {selectedReason === reason && (
                          <View style={styles.reasonRadioInner} />
                        )}
                      </View>
                      <Text style={[
                        styles.reasonText,
                        selectedReason === reason && styles.selectedReasonText
                      ]}>
                        {reason}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>

              {selectedReason === t('bookingItem.other') && (
                <View style={styles.otherReasonContainer}>
                  <Text style={styles.otherReasonLabel}>{t('bookingItem.pleaseSpecifyReason')}</Text>
                  <TextInput
                    style={styles.otherReasonInput}
                    placeholder={t('bookingItem.typeYourReason')}
                    placeholderTextColor="#94A3B8"
                    value={otherReason}
                    onChangeText={setOtherReason}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                  />
                </View>
              )}
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.cancelButton, styles.modalButton]}
                onPress={() => setShowCancelModal(false)}
              >
                <Text style={styles.modalButtonText}>{t('bookingItem.keepBooking')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalButton,
                  styles.modalConfirmButton,
                  (!selectedReason || (selectedReason === t('bookingItem.other') && !otherReason)) && styles.disabledButton,
                ]}
                onPress={handleCancelConfirm}
                disabled={!selectedReason || (selectedReason === t('bookingItem.other') && !otherReason)}
              >
                <Text style={[styles.modalButtonText, styles.confirmButtonText]}>
                  {isCancelling ? t('bookingItem.cancelling') : t('bookingItem.confirmCancellation')}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </RNModal>

      {/* Report Reason Modal */}
      <RNModal
        visible={showReportModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowReportModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={[
            styles.modalHeader, 
            { 
              paddingTop: Math.max(insets.top + 8, 16),
              paddingHorizontal: getResponsiveSpacing(16, 20, 24),
              paddingBottom: getResponsiveSpacing(16, 18, 20)
            }
          ]}>
            <TouchableOpacity 
              onPress={() => setShowReportModal(false)}
              style={styles.closeButton}
            >
              <X size={24} color="#64748B" />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { fontSize: getResponsiveFontSize(16, 18, 20) }]}>
              {t('bookingItem.reportProvider')}
            </Text>
            <View style={styles.placeholder} />
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.modalContentContainer}>
            <View style={styles.bookingSummary}>
              <Image source={{ uri: booking.imageUrl }} style={styles.modalProviderImage} />
              <View style={styles.bookingDetails}>
                <Text style={styles.modalServiceName}>{booking.providerName}</Text>
                <Text style={styles.modalProviderName}>{booking.serviceName}</Text>
                <View style={styles.bookingDateContainer}>
                  <Calendar size={16} color="#64748B" />
                  <Text style={styles.modalDate}>{formattedDateTime}</Text>
                </View>
              </View>
            </View>
            <Text style={styles.whyCancelTitle}>{t('bookingItem.whyAreYouReporting')}</Text>
            <Text style={styles.whyCancelSubtitle}>{t('bookingItem.pleaseSelectReason')}</Text>
            <View style={{ marginBottom: 24 }}>
              {REPORT_REASONS.map((reason) => (
                <TouchableOpacity
                  key={reason}
                  style={[
                    styles.reasonOption,
                    selectedReportReason === reason && styles.selectedReasonOption
                  ]}
                  onPress={() => setSelectedReportReason(reason)}
                  activeOpacity={0.8}
                >
                  <View style={styles.reasonContent}>
                    <View style={[
                      styles.reasonRadio,
                      selectedReportReason === reason && styles.reasonRadioSelected
                    ]}>
                      {selectedReportReason === reason && <View style={styles.reasonRadioInner} />}
                    </View>
                    <Text style={[
                      styles.reasonText,
                      selectedReportReason === reason && styles.selectedReasonText
                    ]}>{reason}</Text>
                  </View>
                </TouchableOpacity>
              ))}
              {selectedReportReason === t('bookingItem.other') && (
                <View style={styles.otherReasonContainer}>
                  <Text style={styles.otherReasonLabel}>{t('bookingItem.pleaseSpecifyReason')}</Text>
                  <TextInput
                    style={styles.otherReasonInput}
                    placeholder={t('bookingItem.typeYourReason')}
                    placeholderTextColor="#94A3B8"
                    value={otherReportReason}
                    onChangeText={setOtherReportReason}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                  />
                </View>
              )}
            </View>
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.cancelButton, styles.modalButton]}
                onPress={() => setShowReportModal(false)}
              >
                <Text style={styles.modalButtonText}>{t('bookingItem.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalButton,
                  styles.modalConfirmButton,
                  (!selectedReportReason || (selectedReportReason === t('bookingItem.other') && !otherReportReason)) && styles.disabledButton,
                ]}
                onPress={handleReportConfirm}
                disabled={!selectedReportReason || (selectedReportReason === t('bookingItem.other') && !otherReportReason)}
              >
                <Text style={[styles.modalButtonText, styles.confirmButtonText]}>
                  {isReporting ? t('bookingItem.submitting') : t('bookingItem.reportSubmitted')}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </RNModal>

      <Modal
        visible={showAlertModal}
        onClose={() => setShowAlertModal(false)}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
        buttons={alertConfig.buttons}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    minHeight: 0,
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
    minHeight: 0,
  },
  providerInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
    marginRight: 16,
  },
  imageContainer: {
    position: 'relative',
    width: 56,
    height: 56,
    borderRadius: 28,
    marginRight: 16,
  },
  providerImage: {
    width: '100%',
    height: '100%',
    borderRadius: 28,
  },
  statusIndicator: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  providerDetails: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  serviceName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 4,
    lineHeight: 22,
  },
  providerName: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 8,
    lineHeight: 18,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  stars: {
    flexDirection: 'row',
    marginRight: 8,
  },
  star: {
    fontSize: 14,
    color: '#F59E0B',
    marginRight: 1,
  },
  starFilled: {
    color: '#F59E0B',
  },
  ratingText: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 16,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexShrink: 0,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  details: {
    marginBottom: 20,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  detailIcon: {
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 4,
    lineHeight: 16,
    fontWeight: '500',
  },
  detailText: {
    fontSize: 14,
    color: '#1E293B',
    fontWeight: '500',
    lineHeight: 20,
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingBottom: 18,
  },
  callButtonContainer: {
    alignItems: 'center',
    marginRight: 16,
    alignSelf: 'flex-end',
    position: 'relative',
  },
  callButton: {
    // Let the button size itself based on content
  },
  callButtonLabel: {
    position: 'absolute',
    top: '100%',
    marginTop: 4,
    fontSize: 12,
    fontWeight: '600',
    color: '#2563EB',
    textAlign: 'center',
    width: '100%',
  },
  secondaryActions: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    gap: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    minHeight: 36,
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#64748B',
    marginLeft: 6,
    lineHeight: 16,
  },
  cancelButton: {
    backgroundColor: '#FEF2F2',
  },
  cancelButtonText: {
    color: '#EF4444',
  },
  rateButton: {
    backgroundColor: '#EEF2FF',
  },
  rateButtonText: {
    color: '#6366F1',
  },
  reportButton: {
    backgroundColor: '#FEF2F2',
  },
  reportButtonText: {
    color: '#EF4444',
  },
  disabledButtonText: {
    color: '#9CA3AF',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  closeButton: {
    padding: 4,
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1E293B',
    textAlign: 'center',
    flex: 1,
  },
  placeholder: {
    width: 32,
  },
  modalContent: {
    flex: 1,
  },
  modalContentContainer: {
    padding: 16,
  },
  bookingSummary: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
  },
  modalProviderImage: {
    width: 64,
    height: 64,
    borderRadius: 32,
    marginRight: 16,
  },
  bookingDetails: {
    flex: 1,
    justifyContent: 'center',
  },
  modalServiceName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 4,
  },
  modalProviderName: {
    fontSize: 16,
    color: '#64748B',
    marginBottom: 8,
  },
  bookingDateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalDate: {
    fontSize: 14,
    color: '#64748B',
    marginLeft: 8,
  },
  reasonSection: {
    marginBottom: 24,
  },
  reasonTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 8,
  },
  reasonSubtitle: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 24,
  },
  reasonsContainer: {
    marginBottom: 16,
  },
  reasonOption: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  selectedReasonOption: {
    borderColor: '#3B82F6',
    backgroundColor: '#EFF6FF',
  },
  reasonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  reasonRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reasonRadioSelected: {
    borderColor: '#3B82F6',
  },
  reasonRadioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#3B82F6',
  },
  reasonText: {
    fontSize: 16,
    color: '#1E293B',
    flex: 1,
  },
  selectedReasonText: {
    color: '#3B82F6',
    fontWeight: '500',
  },
  otherReasonContainer: {
    marginTop: 8,
  },
  otherReasonLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1E293B',
    marginBottom: 8,
  },
  otherReasonInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#1E293B',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    minHeight: 100,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelButton: {
    backgroundColor: '#F1F5F9',
  },
  modalConfirmButton: {
    backgroundColor: '#EF4444',
  },
  disabledButton: {
    backgroundColor: '#F3F4F6',
    opacity: 0.6,
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748B',
  },
  confirmButtonText: {
    color: '#FFFFFF',
  },
  serviceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#F8FAFC',
    marginBottom: 24,
  },
  modalRatingContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  ratingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  ratingTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1E293B',
  },
  ratingContent: {
    flex: 1,
  },
  ratingSection: {
    paddingHorizontal: 16,
    marginBottom: 32,
  },
  ratingLabel: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1E293B',
    textAlign: 'center',
    marginBottom: 24,
  },
  starsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 16,
  },
  starButton: {
    marginHorizontal: 8,
  },
  ratingDescription: {
    fontSize: 16,
    fontWeight: '500',
    color: '#3B82F6',
    textAlign: 'center',
  },
  commentSection: {
    paddingHorizontal: 16,
    marginBottom: 32,
  },
  commentLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1E293B',
    marginBottom: 12,
  },
  commentInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#1E293B',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    minHeight: 120,
  },
  submitButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    paddingVertical: 16,
    marginHorizontal: 16,
    marginBottom: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  whyCancelTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 8,
  },
  whyCancelSubtitle: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 24,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#3B82F6',
  },
});