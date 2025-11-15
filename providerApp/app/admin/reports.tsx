import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  FlatList, 
  ActivityIndicator, 
  StatusBar, 
  Alert, 
  Dimensions,
  Platform,
  Animated,
  RefreshControl,
  Modal,
  TextInput,
  ScrollView,
  BackHandler
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { 
  ArrowLeft, 
  FileText, 
  User, 
  Phone, 
  Calendar, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  Trash2,
  Filter,
  Search,
  Info,
  Clock,
  Shield,
  Eye,
  MessageSquare,
  TrendingUp,
  Users,
  Star,
  ChevronDown,
  ChevronUp,
  Settings
} from 'lucide-react-native';
import { SafeView } from '@/components/SafeView';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '@/constants/api';
import { LinearGradient } from 'expo-linear-gradient';

interface Report {
  id: string;
  report_type: string;
  description: string;
  status: 'open' | 'resolved' | 'closed';
  created_at: string;
  updated_at: string;
  reported_by_user_id?: string;
  reported_provider_id?: string;
  reporter_name: string;
  reporter_phone: string;
  reported_provider_name: string;
  reported_provider_phone: string;
  reported_provider_business?: string;
  report_source?: 'user_report' | 'provider_report';
  report_category?: string;
  reporter_type?: string;
  reported_type?: string;
  // Provider report specific fields
  provider_id?: string;
  customer_name?: string;
  customer_user_id?: string;
  incident_date?: string;
  incident_time?: string;
  evidence?: any;
}

// Responsive design utilities
const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const isTablet = screenWidth >= 768;
const isSmallScreen = screenWidth < 375;
const isMediumScreen = screenWidth >= 375 && screenWidth < 768;

const getResponsiveValue = (small: number, medium: number, large: number) => {
  if (isSmallScreen) return small;
  if (isTablet) return large;
  return medium;
};

const getResponsiveFontSize = (small: number, medium: number, large: number) => {
  if (isSmallScreen) return small;
  if (isTablet) return large;
  return medium;
};

const getResponsivePadding = () => {
  if (isSmallScreen) return 12;
  if (isTablet) return 24;
  return 16;
};

export default function ReportsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'open' | 'resolved' | 'closed'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(true);
  const [showReportModal, setShowReportModal] = useState(false);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [stats, setStats] = useState({
    total: 0,
    open: 0,
    resolved: 0,
    closed: 0
  });

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const filterAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (user && user.role !== 'admin') {
      router.replace('/(tabs)');
    }
  }, [user?.role]);

  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      router.replace('/admin/dashboard');
      return true;
    });
    return () => backHandler.remove();
  }, [router]);

  useEffect(() => {
    loadReports();
    loadStats();
    
    // Entrance animations
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
  }, [filter]);

  useEffect(() => {
    // Filter animation
    Animated.spring(filterAnim, {
      toValue: showFilters ? 1 : 0,
      tension: 100,
      friction: 8,
      useNativeDriver: true,
    }).start();
  }, [showFilters]);

  const loadReports = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) {
        console.error('No authentication token found');
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      const url = filter === 'all' 
        ? `${API_BASE_URL}/api/admin/reports`
        : `${API_BASE_URL}/api/admin/reports?status=${filter}`;

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.status === 'success') {
          const reportsData = data.data?.reports || [];
          console.log(`Loaded ${reportsData.length} reports`);
          setReports(reportsData);
        } else {
          console.error('API returned error status:', data.message || 'Unknown error');
          setReports([]);
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('Failed to fetch reports:', response.status, errorData.message || '');
        setReports([]);
      }
    } catch (error) {
      console.error('Error fetching reports:', error);
      setReports([]);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const loadStats = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) return;

      const response = await fetch(`${API_BASE_URL}/api/admin/stats`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.status === 'success') {
          // Use the new reportsStats object if available, otherwise fallback to pendingReports
          const reportsStats = data.data.reportsStats || {
            total: data.data.pendingReports || 0,
            open: data.data.pendingReports || 0,
            resolved: 0,
            closed: 0
          };
          setStats(reportsStats);
        }
      }
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const onRefresh = () => {
    setIsRefreshing(true);
    loadReports();
    loadStats();
  };

  const filteredReports = reports.filter(report => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      report.report_type.toLowerCase().includes(query) ||
      report.description.toLowerCase().includes(query) ||
      report.reporter_name.toLowerCase().includes(query) ||
      report.reported_provider_name.toLowerCase().includes(query)
    );
  });

  const updateReportStatus = async (reportId: string, status: 'open' | 'resolved' | 'closed') => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) return;

      const response = await fetch(`${API_BASE_URL}/api/admin/reports/${reportId}/status`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      });

      if (response.ok) {
        // Reload reports
        loadReports();
      } else {
        console.error('Failed to update report status');
      }
    } catch (error) {
      console.error('Error updating report status:', error);
    }
  };

  const removeUser = async (userId: string, userName: string) => {
    Alert.alert(
      'Remove User',
      `Are you sure you want to remove ${userName} from the app? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const token = await AsyncStorage.getItem('token');
              if (!token) return;

              const response = await fetch(`${API_BASE_URL}/api/admin/users/${userId}`, {
                method: 'DELETE',
                headers: {
                  'Authorization': `Bearer ${token}`,
                },
              });

              if (response.ok) {
                Alert.alert('Success', 'User removed successfully');
                loadReports();
              } else {
                Alert.alert('Error', 'Failed to remove user');
              }
            } catch (error) {
              console.error('Error removing user:', error);
              Alert.alert('Error', 'Failed to remove user');
            }
          },
        },
      ]
    );
  };

  const resolveUserRemovalTarget = (report: Report) => {
    if (report.reported_type === 'User') {
      return {
        id: report.customer_user_id || report.reported_provider_id,
        name: report.reported_provider_name || report.customer_name || 'User'
      };
    }

    if (report.reporter_type === 'User') {
      return {
        id: report.reported_by_user_id,
        name: report.reporter_name || 'User'
      };
    }

    return null;
  };

  const resolveProviderRemovalTarget = (report: Report) => {
    if (report.reported_type === 'Provider') {
      return {
        id: report.reported_provider_id,
        name: report.reported_provider_name || 'Provider'
      };
    }

    if (report.reporter_type === 'Provider') {
      return {
        id: report.provider_id || report.reported_provider_id,
        name: report.reporter_name || 'Provider'
      };
    }

    return null;
  };

  const removeProvider = async (providerId: string, providerName: string) => {
    Alert.alert(
      'Remove Provider',
      `Are you sure you want to remove ${providerName} from the app? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const token = await AsyncStorage.getItem('token');
              if (!token) return;

              const response = await fetch(`${API_BASE_URL}/api/admin/providers/${providerId}`, {
                method: 'DELETE',
                headers: {
                  'Authorization': `Bearer ${token}`,
                },
              });

              if (response.ok) {
                Alert.alert('Success', 'Provider removed successfully');
                loadReports();
              } else {
                Alert.alert('Error', 'Failed to remove provider');
              }
            } catch (error) {
              console.error('Error removing provider:', error);
              Alert.alert('Error', 'Failed to remove provider');
            }
          },
        },
      ]
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return '#EF4444';
      case 'resolved': return '#10B981';
      case 'closed': return '#6B7280';
      default: return '#6B7280';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'open': return AlertTriangle;
      case 'resolved': return CheckCircle;
      case 'closed': return XCircle;
      default: return FileText;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderStatsCard = (title: string, value: number, color: string, icon: any) => {
    const IconComponent = icon;
    return (
      <Animated.View 
        style={[
          styles.statsCard,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }]
          }
        ]}
      >
        <LinearGradient
          colors={[color, `${color}CC`]}
          style={styles.statsGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.statsContent}>
            <View style={styles.statsIconContainer}>
              <IconComponent size={getResponsiveValue(20, 24, 28)} color="white" />
            </View>
            <View style={styles.statsTextContainer}>
              <Text style={styles.statsValue}>{value}</Text>
              <Text style={styles.statsTitle}>{title}</Text>
            </View>
          </View>
        </LinearGradient>
      </Animated.View>
    );
  };

  const renderReport = ({ item, index }: { item: Report; index: number }) => {
    const StatusIcon = getStatusIcon(item.status);
    const statusColor = getStatusColor(item.status);
    const userRemovalTarget = resolveUserRemovalTarget(item);
    const providerRemovalTarget = resolveProviderRemovalTarget(item);

    const userRemovalTargetId = userRemovalTarget?.id;
    const userRemovalTargetName = userRemovalTarget?.name || (item.reported_type === 'User' ? 'Reported User' : 'Reporter');
    const providerRemovalTargetId = providerRemovalTarget?.id;
    const providerRemovalTargetName = providerRemovalTarget?.name || (item.reported_type === 'Provider' ? 'Reported Provider' : 'Reporter');

    return (
      <Animated.View 
        style={[
          styles.reportCard,
          {
            opacity: fadeAnim,
            transform: [
              { 
                translateY: slideAnim.interpolate({
                  inputRange: [0, 50],
                  outputRange: [0, 50 + (index * 10)]
                })
              }
            ]
          }
        ]}
      >
        <LinearGradient
          colors={['#FFFFFF', '#FAFAFA']}
          style={styles.reportGradient}
        >
          <View style={styles.reportHeader}>
            <View style={styles.reportInfo}>
              <View style={styles.reportTypeContainer}>
                <MessageSquare size={getResponsiveValue(16, 18, 20)} color="#3B82F6" />
                <Text style={styles.reportType}>{item.report_type}</Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
                <StatusIcon size={getResponsiveValue(12, 14, 16)} color="white" />
                <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.moreButton}
              onPress={() => {
                setSelectedReport(item);
                setShowReportModal(true);
              }}
            >
              <Info size={getResponsiveValue(22, 24, 26)} color="#6B7280" />
            </TouchableOpacity>
          </View>

          <View style={styles.reportDescriptionContainer}>
            <Text style={styles.reportDescription} numberOfLines={3}>
              {item.description}
            </Text>
          </View>

          <View style={styles.reportDetails}>
            <View style={styles.detailRow}>
              <View style={styles.detailIconContainer}>
                <User size={getResponsiveValue(14, 16, 18)} color="#3B82F6" />
              </View>
              <View style={styles.detailContent}>
                <Text style={styles.detailLabel}>Reported by</Text>
                <Text style={styles.detailText}>{item.reporter_name}</Text>
                <Text style={styles.detailPhone}>{item.reporter_phone}</Text>
              </View>
            </View>

            <View style={styles.detailRow}>
              <View style={styles.detailIconContainer}>
                <Shield size={getResponsiveValue(14, 16, 18)} color="#EF4444" />
              </View>
              <View style={styles.detailContent}>
                <Text style={styles.detailLabel}>Reported provider</Text>
                <Text style={styles.detailText}>{item.reported_provider_name}</Text>
                <Text style={styles.detailPhone}>{item.reported_provider_phone}</Text>
              </View>
            </View>

            <View style={styles.detailRow}>
              <View style={styles.detailIconContainer}>
                <Clock size={getResponsiveValue(14, 16, 18)} color="#6B7280" />
              </View>
              <View style={styles.detailContent}>
                <Text style={styles.detailLabel}>Reported on</Text>
                <Text style={styles.detailText}>{formatDate(item.created_at)}</Text>
              </View>
            </View>
          </View>

          <View style={styles.reportActions}>
            {item.status === 'open' && (
              <TouchableOpacity
                style={[styles.actionButton, styles.resolveButton]}
                onPress={() => updateReportStatus(item.id, 'resolved')}
              >
                <CheckCircle size={getResponsiveValue(14, 16, 18)} color="white" />
                <Text style={styles.actionButtonText}>Resolve</Text>
              </TouchableOpacity>
            )}
            
            {item.status === 'resolved' && (
              <TouchableOpacity
                style={[styles.actionButton, styles.closeButton]}
                onPress={() => updateReportStatus(item.id, 'closed')}
              >
                <XCircle size={getResponsiveValue(14, 16, 18)} color="white" />
                <Text style={styles.actionButtonText}>Close</Text>
              </TouchableOpacity>
            )}

            {userRemovalTargetId ? (
              <TouchableOpacity
                style={[styles.actionButton, styles.removeButton]}
                onPress={() => removeUser(userRemovalTargetId, userRemovalTargetName)}
              >
                <Trash2 size={getResponsiveValue(14, 16, 18)} color="white" />
                <Text style={styles.actionButtonText} numberOfLines={1}>
                  {item.reported_type === 'User' ? 'Remove User' : 'Remove Reporter'}
                </Text>
              </TouchableOpacity>
            ) : null}

            {providerRemovalTargetId ? (
              <TouchableOpacity
                style={[styles.actionButton, styles.removeButton]}
                onPress={() => removeProvider(providerRemovalTargetId, providerRemovalTargetName)}
              >
                <Trash2 size={getResponsiveValue(14, 16, 18)} color="white" />
                <Text style={styles.actionButtonText} numberOfLines={1}>
                  {item.reported_type === 'Provider' ? 'Remove Provider' : 'Remove Reporter'}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </LinearGradient>
      </Animated.View>
    );
  };

  return (
    <SafeView backgroundColor="#F8FAFC">
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />
      
      {/* Main Container */}
      <View style={styles.mainContainer}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <TouchableOpacity onPress={() => router.replace('/admin/dashboard')} style={styles.backButton}>
              <ArrowLeft size={24} color="#374151" />
            </TouchableOpacity>
            <View style={styles.headerInfo}>
              <Text style={styles.title}>Reports & Complaints</Text>
              <Text style={styles.subtitle}>Manage user reports and complaints</Text>
            </View>
            <TouchableOpacity
              style={[
                styles.filterToggleButton,
                showFilters && styles.filterToggleButtonActive
              ]}
              onPress={() => setShowFilters(!showFilters)}
            >
              <Filter size={20} color={showFilters ? "#3B82F6" : "#6B7280"} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Stats Cards */}
        <View style={styles.statsSection}>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.statsScrollContent}
          >
            {renderStatsCard('Total', stats.total, '#3B82F6', FileText)}
            {renderStatsCard('Open', stats.open, '#EF4444', AlertTriangle)}
            {renderStatsCard('Resolved', stats.resolved, '#10B981', CheckCircle)}
            {renderStatsCard('Closed', stats.closed, '#6B7280', XCircle)}
          </ScrollView>
        </View>

        {/* Search Bar */}
        <View style={styles.searchSection}>
          <View style={styles.searchBar}>
            <Search size={18} color="#6B7280" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search reports..."
              placeholderTextColor="#9CA3AF"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>
        </View>

        {/* Filter Buttons */}
        {showFilters && (
          <View style={styles.filterSection}>
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterScrollContent}
            >
              {(['all', 'open', 'resolved', 'closed'] as const).map((filterType) => (
                <TouchableOpacity
                  key={filterType}
                  style={[
                    styles.filterButton,
                    filter === filterType && styles.activeFilterButton
                  ]}
                  onPress={() => setFilter(filterType)}
                >
                  <Text style={[
                    styles.filterButtonText,
                    filter === filterType && styles.activeFilterButtonText
                  ]}>
                    {filterType.charAt(0).toUpperCase() + filterType.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Reports List */}
        <View style={styles.reportsSection}>
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#3B82F6" />
              <Text style={styles.loadingText}>Loading reports...</Text>
            </View>
          ) : filteredReports.length === 0 ? (
            <View style={styles.emptyContainer}>
              <FileText size={64} color="#9CA3AF" />
              <Text style={styles.emptyTitle}>No Reports Found</Text>
              <Text style={styles.emptySubtitle}>
                {searchQuery 
                  ? 'No reports match your search criteria.'
                  : filter === 'all' 
                    ? 'No reports have been submitted yet.'
                    : `No ${filter} reports found.`
                }
              </Text>
            </View>
          ) : (
            <FlatList
              data={filteredReports}
              keyExtractor={(item) => item.id}
              renderItem={renderReport}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.listContainer}
              refreshControl={
                <RefreshControl
                  refreshing={isRefreshing}
                  onRefresh={onRefresh}
                  colors={['#3B82F6']}
                  tintColor="#3B82F6"
                />
              }
            />
          )}
        </View>
      </View>

      {/* Report Detail Modal */}
      <Modal
        visible={showReportModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowReportModal(false)}
      >
        {selectedReport && (
          <View style={styles.modalContainer}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderContent}>
                <View style={styles.modalTitleContainer}>
                  <Text style={styles.modalTitle}>Report Details</Text>
                  <View style={[styles.modalStatusBadge, { backgroundColor: getStatusColor(selectedReport.status) + '20' }]}>
                    <Text style={[styles.modalStatusText, { color: getStatusColor(selectedReport.status) }]}>
                      {selectedReport.status.toUpperCase()}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.modalCloseButton}
                  onPress={() => setShowReportModal(false)}
                >
                  <XCircle size={24} color="#6B7280" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Modal Content */}
            <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
              {/* Report Type & Description Section */}
              <View style={styles.modalSection}>
                <View style={styles.modalSectionHeader}>
                  <AlertTriangle size={20} color="#EF4444" />
                  <Text style={styles.modalSectionTitle}>Report Information</Text>
                </View>
                <View style={styles.modalInfoCard}>
                  {selectedReport.report_category && (
                    <>
                      <View style={styles.modalInfoRow}>
                        <Text style={styles.modalInfoLabel}>Report Category</Text>
                        <Text style={styles.modalInfoValue}>{selectedReport.report_category}</Text>
                      </View>
                      <View style={styles.modalDivider} />
                    </>
                  )}
                  <View style={styles.modalInfoRow}>
                    <Text style={styles.modalInfoLabel}>Report Type</Text>
                    <Text style={styles.modalInfoValue}>{selectedReport.report_type}</Text>
                  </View>
                  <View style={styles.modalDivider} />
                  <View style={styles.modalInfoRow}>
                    <Text style={styles.modalInfoLabel}>Description</Text>
                    <Text style={styles.modalInfoValueMultiline}>{selectedReport.description}</Text>
                  </View>
                  {selectedReport.incident_date && (
                    <>
                      <View style={styles.modalDivider} />
                      <View style={styles.modalInfoRow}>
                        <Text style={styles.modalInfoLabel}>Incident Date</Text>
                        <Text style={styles.modalInfoValue}>{formatDate(selectedReport.incident_date)}</Text>
                      </View>
                    </>
                  )}
                  {selectedReport.incident_time && (
                    <>
                      <View style={styles.modalDivider} />
                      <View style={styles.modalInfoRow}>
                        <Text style={styles.modalInfoLabel}>Incident Time</Text>
                        <Text style={styles.modalInfoValue}>{selectedReport.incident_time}</Text>
                      </View>
                    </>
                  )}
                </View>
              </View>

              {/* Timeline Section */}
              <View style={styles.modalSection}>
                <View style={styles.modalSectionHeader}>
                  <Clock size={20} color="#3B82F6" />
                  <Text style={styles.modalSectionTitle}>Timeline</Text>
                </View>
                <View style={styles.modalInfoCard}>
                  <View style={styles.modalInfoRow}>
                    <Text style={styles.modalInfoLabel}>Report Submitted</Text>
                    <Text style={styles.modalInfoValue}>{formatDate(selectedReport.created_at)}</Text>
                  </View>
                  <View style={styles.modalDivider} />
                  <View style={styles.modalInfoRow}>
                    <Text style={styles.modalInfoLabel}>Last Updated</Text>
                    <Text style={styles.modalInfoValue}>{formatDate(selectedReport.updated_at)}</Text>
                  </View>
                </View>
              </View>

              {/* Reporter Information Section */}
              <View style={styles.modalSection}>
                <View style={styles.modalSectionHeader}>
                  <User size={20} color="#10B981" />
                  <Text style={styles.modalSectionTitle}>
                    Reported By ({selectedReport.reporter_type || 'User'})
                  </Text>
                </View>
                <View style={styles.modalInfoCard}>
                  <View style={styles.modalInfoRow}>
                    <Text style={styles.modalInfoLabel}>Name</Text>
                    <Text style={styles.modalInfoValue}>{selectedReport.reporter_name}</Text>
                  </View>
                  <View style={styles.modalDivider} />
                  <View style={styles.modalInfoRow}>
                    <Text style={styles.modalInfoLabel}>Phone</Text>
                    <Text style={styles.modalInfoValue}>{selectedReport.reporter_phone}</Text>
                  </View>
                  <View style={styles.modalDivider} />
                  <View style={styles.modalInfoRow}>
                    <Text style={styles.modalInfoLabel}>User ID</Text>
                    <Text style={styles.modalInfoValueSmall}>{selectedReport.reported_by_user_id}</Text>
                  </View>
                </View>
              </View>

              {/* Reported Person Section */}
              <View style={styles.modalSection}>
                <View style={styles.modalSectionHeader}>
                  <Shield size={20} color="#F59E0B" />
                  <Text style={styles.modalSectionTitle}>
                    Reported {selectedReport.reported_type || 'Provider'}
                  </Text>
                </View>
                <View style={styles.modalInfoCard}>
                  <View style={styles.modalInfoRow}>
                    <Text style={styles.modalInfoLabel}>Name</Text>
                    <Text style={styles.modalInfoValue}>{selectedReport.reported_provider_name}</Text>
                  </View>
                  <View style={styles.modalDivider} />
                  <View style={styles.modalInfoRow}>
                    <Text style={styles.modalInfoLabel}>Phone</Text>
                    <Text style={styles.modalInfoValue}>{selectedReport.reported_provider_phone}</Text>
                  </View>
                  {selectedReport.reported_provider_business && (
                    <>
                      <View style={styles.modalDivider} />
                      <View style={styles.modalInfoRow}>
                        <Text style={styles.modalInfoLabel}>Business</Text>
                        <Text style={styles.modalInfoValueMultiline}>{selectedReport.reported_provider_business}</Text>
                      </View>
                    </>
                  )}
                  <View style={styles.modalDivider} />
                  <View style={styles.modalInfoRow}>
                    <Text style={styles.modalInfoLabel}>Provider ID</Text>
                    <Text style={styles.modalInfoValueSmall}>{selectedReport.reported_provider_id}</Text>
                  </View>
                </View>
              </View>

              {/* Action Buttons Section */}
              <View style={styles.modalSection}>
                <View style={styles.modalSectionHeader}>
                  <Settings size={20} color="#6B7280" />
                  <Text style={styles.modalSectionTitle}>Actions</Text>
                </View>
                <View style={styles.modalActionsCard}>
                  {/* Status Update Actions */}
                  {selectedReport.status === 'open' && (
                    <TouchableOpacity
                      style={[styles.modalActionButton, styles.modalResolveButton]}
                      onPress={() => {
                        updateReportStatus(selectedReport.id, 'resolved');
                        setShowReportModal(false);
                      }}
                    >
                      <CheckCircle size={20} color="white" />
                      <Text style={styles.modalActionButtonText}>Mark as Resolved</Text>
                    </TouchableOpacity>
                  )}
                  
                  {selectedReport.status === 'resolved' && (
                    <TouchableOpacity
                      style={[styles.modalActionButton, styles.modalCloseReportButton]}
                      onPress={() => {
                        updateReportStatus(selectedReport.id, 'closed');
                        setShowReportModal(false);
                      }}
                    >
                      <XCircle size={20} color="white" />
                      <Text style={styles.modalActionButtonText}>Close Report</Text>
                    </TouchableOpacity>
                  )}

                  {selectedReport.status === 'closed' && (
                    <TouchableOpacity
                      style={[styles.modalActionButton, styles.modalReopenButton]}
                      onPress={() => {
                        updateReportStatus(selectedReport.id, 'open');
                        setShowReportModal(false);
                      }}
                    >
                      <AlertTriangle size={20} color="white" />
                      <Text style={styles.modalActionButtonText}>Reopen Report</Text>
                    </TouchableOpacity>
                  )}

                  {/* User/Provider Removal Actions */}
                  <View style={styles.modalDivider} />
                  
                  {selectedReport.reported_by_user_id && (
                    <TouchableOpacity
                      style={[styles.modalActionButton, styles.modalRemoveUserButton]}
                      onPress={() => {
                        const reporterId = selectedReport.reported_by_user_id;
                        if (!reporterId) {
                          return;
                        }
                        removeUser(reporterId, selectedReport.reporter_name || 'Reporter');
                        setShowReportModal(false);
                      }}
                    >
                      <Trash2 size={20} color="white" />
                      <Text style={styles.modalActionButtonText}>Remove Reporter (User)</Text>
                    </TouchableOpacity>
                  )}

                  {selectedReport.reported_provider_id && (
                    <TouchableOpacity
                      style={[styles.modalActionButton, styles.modalRemoveProviderButton]}
                      onPress={() => {
                        const providerId = selectedReport.reported_provider_id;
                        if (!providerId) {
                          return;
                        }
                        removeProvider(providerId, selectedReport.reported_provider_name || 'Provider');
                        setShowReportModal(false);
                      }}
                    >
                      <Trash2 size={20} color="white" />
                      <Text style={styles.modalActionButtonText}>Remove Provider</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Bottom Spacing */}
              <View style={{ height: 20 }} />
            </ScrollView>
          </View>
        )}
      </Modal>
    </SafeView>
  );
}

const styles = StyleSheet.create({
  // Main Container
  mainContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },

  // Header Styles
  header: {
    backgroundColor: '#FFFFFF',
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    paddingHorizontal: getResponsivePadding(),
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  backButton: {
    width: isSmallScreen ? 36 : 40,
    height: isSmallScreen ? 36 : 40,
    borderRadius: isSmallScreen ? 18 : 20,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  headerInfo: {
    flex: 1,
    marginLeft: 12,
    marginRight: 12,
    minWidth: 0, // Allows text to shrink
  },
  title: {
    fontSize: getResponsiveFontSize(18, 20, 24),
    fontWeight: '700',
    color: '#111827',
    flexShrink: 1,
  },
  subtitle: {
    fontSize: getResponsiveFontSize(12, 13, 14),
    color: '#6B7280',
    marginTop: 2,
    fontWeight: '500',
    flexShrink: 1,
  },
  filterToggleButton: {
    width: isSmallScreen ? 36 : 40,
    height: isSmallScreen ? 36 : 40,
    borderRadius: isSmallScreen ? 18 : 20,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  filterToggleButtonActive: {
    backgroundColor: '#EBF4FF',
    borderWidth: 1,
    borderColor: '#3B82F6',
  },

  // Stats Section
  statsSection: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  statsScrollContent: {
    paddingHorizontal: getResponsivePadding(),
    paddingRight: getResponsivePadding() + 4,
  },
  statsCard: {
    width: isSmallScreen ? 140 : isTablet ? 180 : 160,
    height: isSmallScreen ? 90 : isTablet ? 110 : 100,
    borderRadius: 12,
    marginRight: 12,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  statsGradient: {
    flex: 1,
    padding: isSmallScreen ? 12 : 16,
  },
  statsContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statsIconContainer: {
    width: isSmallScreen ? 36 : isTablet ? 44 : 40,
    height: isSmallScreen ? 36 : isTablet ? 44 : 40,
    borderRadius: isSmallScreen ? 18 : isTablet ? 22 : 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  statsTextContainer: {
    flex: 1,
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginLeft: 8,
  },
  statsValue: {
    fontSize: getResponsiveFontSize(20, 22, 26),
    fontWeight: '700',
    color: 'white',
    lineHeight: getResponsiveFontSize(24, 26, 30),
  },
  statsTitle: {
    fontSize: getResponsiveFontSize(11, 12, 13),
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '600',
    marginTop: 2,
    textAlign: 'right',
  },

  // Search Section
  searchSection: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: getResponsivePadding(),
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingHorizontal: isSmallScreen ? 12 : 16,
    paddingVertical: isSmallScreen ? 10 : 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  searchInput: {
    flex: 1,
    fontSize: getResponsiveFontSize(14, 15, 16),
    color: '#111827',
    marginLeft: 10,
    fontWeight: '500',
    minWidth: 0, // Allows text input to shrink
  },

  // Filter Section
  filterSection: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  filterScrollContent: {
    paddingHorizontal: getResponsivePadding(),
    paddingVertical: 12,
    paddingRight: getResponsivePadding() + 4,
  },
  filterButton: {
    paddingHorizontal: isSmallScreen ? 14 : 16,
    paddingVertical: isSmallScreen ? 7 : 8,
    marginRight: 10,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: 'transparent',
    minWidth: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeFilterButton: {
    backgroundColor: '#3B82F6',
    borderColor: '#2563EB',
  },
  filterButtonText: {
    fontSize: getResponsiveFontSize(13, 14, 15),
    fontWeight: '600',
    color: '#6B7280',
  },
  activeFilterButtonText: {
    color: '#FFFFFF',
  },

  // Reports Section
  reportsSection: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  listContainer: {
    padding: getResponsivePadding(),
    paddingBottom: 100,
  },

  // Report Card Styles
  reportCard: {
    marginBottom: 16,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  reportGradient: {
    padding: getResponsivePadding(),
  },
  reportHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
    width: '100%',
  },
  reportInfo: {
    flex: 1,
    marginRight: 8,
    minWidth: 0, // Allows text to shrink
  },
  reportTypeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  reportType: {
    fontSize: getResponsiveFontSize(16, 17, 18),
    fontWeight: '700',
    color: '#111827',
    marginLeft: 6,
    flexShrink: 1,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: isSmallScreen ? 10 : 12,
    paddingVertical: isSmallScreen ? 5 : 6,
    borderRadius: 16,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  statusText: {
    fontSize: getResponsiveFontSize(11, 12, 13),
    fontWeight: '700',
    color: '#FFFFFF',
    marginLeft: 4,
  },
  moreButton: {
    width: isSmallScreen ? 32 : 36,
    height: isSmallScreen ? 32 : 36,
    borderRadius: isSmallScreen ? 16 : 18,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  reportDescriptionContainer: {
    marginBottom: 12,
  },
  reportDescription: {
    fontSize: getResponsiveFontSize(14, 15, 16),
    color: '#374151',
    lineHeight: getResponsiveFontSize(20, 22, 24),
    fontWeight: '500',
  },
  reportDetails: {
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
    width: '100%',
  },
  detailIconContainer: {
    width: isSmallScreen ? 32 : 36,
    height: isSmallScreen ? 32 : 36,
    borderRadius: isSmallScreen ? 16 : 18,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    flexShrink: 0,
  },
  detailContent: {
    flex: 1,
    minWidth: 0, // Allows text to shrink
  },
  detailLabel: {
    fontSize: getResponsiveFontSize(12, 13, 14),
    color: '#6B7280',
    fontWeight: '600',
    marginBottom: 2,
  },
  detailText: {
    fontSize: getResponsiveFontSize(14, 15, 16),
    color: '#111827',
    fontWeight: '600',
    flexWrap: 'wrap',
  },
  detailPhone: {
    fontSize: getResponsiveFontSize(12, 13, 14),
    color: '#6B7280',
    marginTop: 2,
  },
  reportActions: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: isSmallScreen ? 14 : 16,
    paddingVertical: isSmallScreen ? 10 : 12,
    borderRadius: 10,
    minHeight: 40,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  resolveButton: {
    backgroundColor: '#10B981',
    borderColor: '#059669',
  },
  closeButton: {
    backgroundColor: '#6B7280',
    borderColor: '#4B5563',
  },
  removeButton: {
    backgroundColor: '#EF4444',
    borderColor: '#DC2626',
  },
  actionButtonText: {
    fontSize: getResponsiveFontSize(12, 13, 14),
    fontWeight: '700',
    color: '#FFFFFF',
    marginLeft: 6,
    flexShrink: 1,
    textAlign: 'center',
  },

  // Loading and Empty States
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 60,
  },
  loadingText: {
    fontSize: 18,
    color: '#6B7280',
    marginTop: 20,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 60,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#374151',
    marginTop: 20,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
    fontWeight: '500',
    paddingHorizontal: 24,
    marginTop: 12,
  },

  // Modal Styles
  modalContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  modalHeader: {
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    paddingHorizontal: getResponsivePadding(),
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  modalHeaderContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    width: '100%',
  },
  modalTitleContainer: {
    flex: 1,
    marginRight: 12,
    minWidth: 0,
  },
  modalTitle: {
    fontSize: getResponsiveFontSize(20, 22, 24),
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
    flexShrink: 1,
  },
  modalStatusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  modalStatusText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  modalCloseButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    flex: 1,
    padding: getResponsivePadding(),
  },
  modalSection: {
    marginBottom: 16,
  },
  modalSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  modalSectionTitle: {
    fontSize: getResponsiveFontSize(15, 16, 17),
    fontWeight: '700',
    color: '#111827',
    marginLeft: 8,
  },
  modalInfoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: isSmallScreen ? 12 : 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  modalActionsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: isSmallScreen ? 12 : 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  modalInfoRow: {
    flexDirection: 'column',
    paddingVertical: 6,
  },
  modalInfoLabel: {
    fontSize: getResponsiveFontSize(11, 12, 13),
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  modalInfoValue: {
    fontSize: getResponsiveFontSize(14, 15, 16),
    fontWeight: '600',
    color: '#111827',
  },
  modalInfoValueMultiline: {
    fontSize: getResponsiveFontSize(14, 15, 16),
    fontWeight: '500',
    color: '#111827',
    lineHeight: 22,
  },
  modalInfoValueSmall: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6B7280',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  modalDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 6,
  },
  modalActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: isSmallScreen ? 12 : 14,
    paddingHorizontal: isSmallScreen ? 16 : 20,
    borderRadius: 10,
    marginVertical: 6,
    width: '100%',
    borderWidth: 1.5,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  modalActionButtonText: {
    fontSize: getResponsiveFontSize(14, 15, 16),
    fontWeight: '700',
    color: '#FFFFFF',
    marginLeft: 8,
    textAlign: 'center',
  },
  modalResolveButton: {
    backgroundColor: '#10B981',
    borderColor: '#059669',
  },
  modalCloseReportButton: {
    backgroundColor: '#6B7280',
    borderColor: '#4B5563',
  },
  modalReopenButton: {
    backgroundColor: '#F59E0B',
    borderColor: '#D97706',
  },
  modalRemoveUserButton: {
    backgroundColor: '#EF4444',
    borderColor: '#DC2626',
  },
  modalRemoveProviderButton: {
    backgroundColor: '#DC2626',
    borderColor: '#B91C1C',
  },
});
