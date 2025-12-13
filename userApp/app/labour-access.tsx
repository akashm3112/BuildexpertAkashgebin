import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  Platform,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { ArrowLeft, CreditCard, Clock, CheckCircle, AlertTriangle, Calendar, Smartphone } from 'lucide-react-native';
import { SafeView } from '@/components/SafeView';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { API_BASE_URL } from '@/constants/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
// import dayjs from 'dayjs';

interface LabourAccessData {
  accessStatus: string;
  startDate: string;
  endDate: string;
  isExpired: boolean;
  daysRemaining: number;
  hasAccess: boolean;
}

interface Transaction {
  id: string;
  order_id: string;
  amount: number;
  status: string;
  created_at: string;
  completed_at: string;
  transaction_id: string;
}

export default function LabourAccessScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useLanguage();
  const [accessData, setAccessData] = useState<LabourAccessData | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let isMounted = true;
    
    const fetchData = async () => {
      try {
        await fetchLabourAccessData();
      } catch (error: any) {
        // Errors are already handled in fetchLabourAccessData
        // Just ensure we don't leave loading state stuck
        if (isMounted) {
          setLoading(false);
        }
      }
    };
    
    fetchData();
    
    return () => {
      isMounted = false;
    };
  }, []);

  // Refresh data when screen comes into focus (e.g., after payment)
  useFocusEffect(
    React.useCallback(() => {
      let isMounted = true;
      
      const refreshData = async () => {
        try {
          await fetchLabourAccessData();
        } catch (error: any) {
          // Errors are already handled in fetchLabourAccessData
          if (isMounted) {
            // Don't set loading to false here - just refresh silently
          }
        }
      };
      
      // Only refresh if not currently loading (to avoid double fetches)
      if (!loading) {
        refreshData();
      }
      
      return () => {
        isMounted = false;
      };
    }, [loading])
  );

  const fetchLabourAccessData = async () => {
    try {
      // Use API client for automatic token management and error handling
      const { apiGet } = await import('@/utils/apiClient');
      
      // Fetch access status
      try {
        const accessResponse = await apiGet('/api/payments/labour-access-status');
        if (accessResponse.ok && accessResponse.data && accessResponse.data.status === 'success' && accessResponse.data.data) {
          setAccessData(accessResponse.data.data);
        }
      } catch (accessError: any) {
        // Check if it's a "Session expired" error (expected after 30 days)
        const isSessionExpired = accessError?.message === 'Session expired' || 
                                 accessError?.status === 401 && accessError?.message?.includes('Session expired') || 
                                 accessError?._suppressUnhandled === true ||
                                 accessError?._handled === true;
        
        if (!isSessionExpired) {
          // Only log non-session-expired errors
          console.warn('Error fetching labour access status:', accessError?.message || accessError);
        }
        // Session expired errors are handled by apiClient (logout triggered)
        // Don't throw - continue to try fetching transaction history
      }

      // Fetch transaction history with increased limit to show all transactions
      try {
        const historyResponse = await apiGet('/api/payments/labour-transaction-history?limit=100');
        if (historyResponse.ok && historyResponse.data && historyResponse.data.status === 'success') {
          const transactionsData = historyResponse.data.data?.transactions;
          if (Array.isArray(transactionsData)) {
            // Show all transactions, not filtered by date
            setTransactions(transactionsData);
          } else {
            setTransactions([]);
          }
        } else {
          // If response is not ok, set empty array
          setTransactions([]);
        }
      } catch (historyError: any) {
        // Check if it's a "Session expired" error (expected after 30 days)
        const isSessionExpired = historyError?.message === 'Session expired' || 
                                 historyError?.status === 401 && historyError?.message?.includes('Session expired') || 
                                 historyError?._suppressUnhandled === true ||
                                 historyError?._handled === true;
        
        // Mark error as handled to prevent uncaught exception
        if (historyError && typeof historyError === 'object') {
          (historyError as any)._handled = true;
          (historyError as any)._suppressUnhandled = true;
        }
        
        if (!isSessionExpired) {
          // Only log non-session-expired errors
          console.warn('Error fetching transaction history:', historyError?.message || historyError);
        }
        // Set empty array on error to prevent UI issues
        setTransactions([]);
        // Session expired errors are handled by apiClient (logout triggered)
        // Don't throw - we can still show access status
      }
    } catch (error: any) {
      // Check if it's a "Session expired" error (expected after 30 days)
      const isSessionExpired = error?.message === 'Session expired' || 
                               error?.status === 401 && error?.message?.includes('Session expired') || 
                               error?._suppressUnhandled === true ||
                               error?._handled === true;
      
      if (!isSessionExpired) {
        // Only log non-session-expired errors
        console.warn('Error fetching labour access data:', error?.message || error);
      }
      // Session expired errors are handled by apiClient (logout triggered)
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      await fetchLabourAccessData();
    } catch (error: any) {
      // Errors are already handled in fetchLabourAccessData
      // Just ensure we reset refreshing state
      console.warn('Error refreshing labour access data:', error?.message || error);
    } finally {
      setRefreshing(false);
    }
  };

  const handlePayNow = () => {
    try {
      router.push('/labour-payment' as any);
    } catch (error) {
      console.error('Error navigating to labour payment:', error);
    }
  };

  const getStatusColor = (status: string | null | undefined) => {
    if (!status) return '#64748B';
    switch (status.toLowerCase()) {
      case 'completed':
        return '#10B981';
      case 'failed':
        return '#EF4444';
      case 'pending':
        return '#F59E0B';
      default:
        return '#64748B';
    }
  };

  const getStatusIcon = (status: string | null | undefined) => {
    if (!status) return <Clock size={16} color="#64748B" />;
    switch (status.toLowerCase()) {
      case 'completed':
        return <CheckCircle size={16} color="#10B981" />;
      case 'failed':
        return <AlertTriangle size={16} color="#EF4444" />;
      case 'pending':
        return <Clock size={16} color="#F59E0B" />;
      default:
        return <Clock size={16} color="#64748B" />;
    }
  };

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

  const formatDateTime = (dateString: string | null | undefined): string => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'Invalid Date';
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: '2-digit', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } catch (error) {
      console.warn('Error formatting date/time:', dateString, error);
      return 'Invalid Date';
    }
  };

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
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {/* Access Status Card */}
        <View style={styles.statusCard}>
          <View style={styles.statusHeader}>
            <View style={styles.statusIcon}>
              {accessData?.hasAccess ? (
                <CheckCircle size={24} color="#10B981" />
              ) : (
                <AlertTriangle size={24} color="#F59E0B" />
              )}
            </View>
            <View style={styles.statusInfo}>
              <Text style={styles.statusTitle}>
                {accessData?.hasAccess ? 'Access Active' : 'No Active Access'}
              </Text>
              <Text style={styles.statusSubtitle}>
                {accessData?.hasAccess 
                  ? `${accessData.daysRemaining ?? 0} days remaining`
                  : 'Pay ₹99 for 7-day access'
                }
              </Text>
            </View>
          </View>

          {accessData?.hasAccess && (
            <View style={styles.accessDetails}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Start Date</Text>
                <Text style={styles.detailValue}>
                  {formatDate(accessData.startDate)}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Expiry Date</Text>
                <Text style={styles.detailValue}>
                  {formatDate(accessData.endDate)}
                </Text>
              </View>
            </View>
          )}

          {!accessData?.hasAccess && (
            <TouchableOpacity style={styles.payButton} onPress={handlePayNow}>
              <CreditCard size={20} color="#FFFFFF" />
              <Text style={styles.payButtonText}>Pay ₹99 for 7 Days</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Transaction History */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment History</Text>
          {transactions.length > 0 ? (
            transactions.map((transaction) => {
              // Safely extract transaction properties with defaults
              const transactionId = transaction?.id || `txn-${Math.random()}`;
              const orderId = transaction?.order_id || 'N/A';
              const createdAt = transaction?.created_at || null;
              const status = transaction?.status || 'unknown';
              // Safely convert amount to number with proper fallback
              const amountValue = transaction?.amount;
              const amount = typeof amountValue === 'number' && !isNaN(amountValue) 
                ? amountValue 
                : typeof amountValue === 'string' 
                  ? parseFloat(amountValue) || 0 
                  : 0;
              const transactionIdText = transaction?.transaction_id || null;
              
              // Format amount safely
              const formattedAmount = typeof amount === 'number' && !isNaN(amount)
                ? amount.toFixed(2)
                : '0.00';
              
              return (
                <View key={transactionId} style={styles.transactionCard}>
                  <View style={styles.transactionHeader}>
                    <View style={styles.transactionInfo}>
                      <Text style={styles.transactionId}>#{orderId}</Text>
                      <Text style={styles.transactionDate}>
                        {formatDateTime(createdAt)}
                      </Text>
                    </View>
                    <View style={styles.transactionStatus}>
                      {getStatusIcon(status)}
                      <Text style={[styles.statusText, { color: getStatusColor(status) }]}>
                        {status ? status.toUpperCase() : 'UNKNOWN'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.transactionDetails}>
                    <Text style={styles.transactionAmount}>₹{formattedAmount}</Text>
                    {transactionIdText && (
                      <Text style={styles.transactionIdText}>
                        Txn: {transactionIdText}
                      </Text>
                    )}
                  </View>
                </View>
              );
            })
          ) : (
            <View style={styles.emptyContainer}>
              <CreditCard size={48} color="#CBD5E1" />
              <Text style={styles.emptyText}>No payment history</Text>
              <Text style={styles.emptySubtext}>Your labour service payments will appear here</Text>
            </View>
          )}
        </View>

        {/* Information Card */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>About Labour Service Access</Text>
          <View style={styles.infoList}>
            <View style={styles.infoItem}>
              <CheckCircle size={16} color="#10B981" />
              <Text style={styles.infoText}>7-day unlimited access to labour services</Text>
            </View>
            <View style={styles.infoItem}>
              <CheckCircle size={16} color="#10B981" />
              <Text style={styles.infoText}>Access to skilled labour providers</Text>
            </View>
            <View style={styles.infoItem}>
              <CheckCircle size={16} color="#10B981" />
              <Text style={styles.infoText}>Secure payment via Paytm</Text>
            </View>
            <View style={styles.infoItem}>
              <CheckCircle size={16} color="#10B981" />
              <Text style={styles.infoText}>Automatic expiry reminders</Text>
            </View>
          </View>
        </View>
      </ScrollView>
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
    marginBottom: 20,
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
  accessDetails: {
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 16,
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
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },
  transactionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#CBD5E1',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  transactionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  transactionInfo: {
    flex: 1,
  },
  transactionId: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
    marginBottom: 4,
  },
  transactionDate: {
    fontSize: 12,
    color: '#64748B',
  },
  transactionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  transactionDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  transactionAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  transactionIdText: {
    fontSize: 12,
    color: '#64748B',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#64748B',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
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
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },
  infoList: {
    gap: 12,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoText: {
    fontSize: 14,
    color: '#374151',
    marginLeft: 12,
    flex: 1,
  },
});
