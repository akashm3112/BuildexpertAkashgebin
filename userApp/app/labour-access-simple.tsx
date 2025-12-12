import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { ArrowLeft, CreditCard, CheckCircle, RefreshCw } from 'lucide-react-native';
import { SafeView } from '@/components/SafeView';
import { API_BASE_URL } from '@/constants/api';
import { useLabourAccess } from '@/context/LabourAccessContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

const formatDate = (dateString: string | null | undefined): string => {
  if (!dateString) return 'N/A';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Invalid Date';
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: '2-digit', 
      year: 'numeric' 
    });
  } catch (error) {
    console.warn('Error formatting date:', dateString, error);
    return 'Invalid Date';
  }
};

export default function LabourAccessSimpleScreen() {
  const router = useRouter();
  const { labourAccessStatus, checkLabourAccess } = useLabourAccess();
  const [loading, setLoading] = useState(true);
  const [hasChecked, setHasChecked] = useState(false);

  useEffect(() => {
    let isMounted = true;
    
    const fetchData = async () => {
      try {
        setLoading(true);
        // First check local storage (fast) - this will update context
        await checkLabourAccess().catch((error: any) => {
          // Errors are handled in checkLabourAccess, catch here to prevent unhandled rejections
          // Mark as handled to prevent React Native from logging
          if (error && typeof error === 'object') {
            (error as any)._handled = true;
            (error as any)._suppressUnhandled = true;
          }
          // Don't log - errors are already handled silently in checkLabourAccess
        });
        
        // Also fetch from API to ensure we have latest data
        // Use checkLabourAccess which already uses apiClient and handles errors properly
        // No need for additional direct fetch call - it's redundant
      } catch (error) {
        // Even if checkLabourAccess fails, show the UI
        console.error('Error fetching labour access:', error);
      } finally {
        // Always stop loading and show UI, regardless of success/failure
        if (isMounted) {
          setHasChecked(true);
          setLoading(false);
        }
      }
    };
    
    fetchData();
    
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // Refresh labour access when screen comes into focus (not periodically)
  // REMOVED: This was causing too many API calls and rate limiting
  // The context already checks on mount and app state change, which is sufficient
  // useFocusEffect(
  //   React.useCallback(() => {
  //     // Removed to prevent excessive API calls
  //   }, [checkLabourAccess])
  // );

  if (loading) {
    return (
      <SafeView style={styles.container} backgroundColor="#F8FAFC">
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <ArrowLeft size={24} color="#374151" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Labour Access</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeView>
    );
  }

  return (
    <SafeView style={styles.container} backgroundColor="#F8FAFC">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <ArrowLeft size={24} color="#374151" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Labour Access</Text>
        <TouchableOpacity 
          onPress={() => {
            checkLabourAccess().catch((error: any) => {
              // Errors are handled in checkLabourAccess, catch here to prevent unhandled rejections
              // Mark as handled to prevent React Native from logging
              if (error && typeof error === 'object') {
                (error as any)._handled = true;
                (error as any)._suppressUnhandled = true;
              }
              // Don't log - errors are already handled silently in checkLabourAccess
            });
          }} 
          style={styles.refreshButton}
        >
          <RefreshCw size={20} color="#3B82F6" />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <View style={styles.statusCard}>
          <View style={styles.statusHeader}>
            <View style={styles.statusIcon}>
              {labourAccessStatus?.hasAccess ? (
                <CheckCircle size={24} color="#10B981" />
              ) : (
                <CreditCard size={24} color="#F59E0B" />
              )}
            </View>
            <View style={styles.statusInfo}>
              <Text style={styles.statusTitle}>
                {labourAccessStatus?.hasAccess ? 'Access Active' : 'No Active Access'}
              </Text>
              <Text style={styles.statusSubtitle}>
                {labourAccessStatus?.hasAccess 
                  ? `${labourAccessStatus.daysRemaining ?? 0} days remaining`
                  : 'Pay ₹99 for 7-day access'
                }
              </Text>
            </View>
          </View>

          {labourAccessStatus?.hasAccess && (
            <View style={styles.accessDetails}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Start Date</Text>
                <Text style={styles.detailValue}>
                  {formatDate(labourAccessStatus.startDate)}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Expiry Date</Text>
                <Text style={styles.detailValue}>
                  {formatDate(labourAccessStatus.endDate)}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Days Remaining</Text>
                <Text style={styles.detailValue}>
                  {labourAccessStatus.daysRemaining ?? 0} days
                </Text>
              </View>
            </View>
          )}

          {!labourAccessStatus?.hasAccess && (
            <TouchableOpacity 
              style={styles.payButton} 
              onPress={() => {
                try {
                  router.push('/labour-payment' as any);
                } catch (error) {
                  console.error('Error navigating to labour payment:', error);
                }
              }}
            >
              <CreditCard size={20} color="#FFFFFF" />
              <Text style={styles.payButtonText}>Pay ₹99 for 7 Days</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
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
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginLeft: 16,
    flex: 1,
  },
  refreshButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#F0F9FF',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#64748B',
    marginTop: 16,
  },
  statusCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
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
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  statusIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F0F9FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  statusInfo: {
    flex: 1,
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  statusSubtitle: {
    fontSize: 14,
    color: '#64748B',
  },
  payButton: {
    backgroundColor: '#3B82F6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginTop: 16,
  },
  payButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  accessDetails: {
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 16,
    marginTop: 16,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 14,
    color: '#64748B',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
  },
});
