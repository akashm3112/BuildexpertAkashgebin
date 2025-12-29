import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, StatusBar, RefreshControl, Platform, BackHandler, Dimensions, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { Users, BarChart3, LogOut, RefreshCw, TrendingUp, DollarSign, AlertCircle, Activity } from 'lucide-react-native';
import { SafeView } from '@/components/SafeView';
import { API_BASE_URL } from '@/constants/api';
import { LinearGradient } from 'expo-linear-gradient';

// Responsive design utilities
const { width: screenWidth } = Dimensions.get('window');
const isSmallScreen = screenWidth < 375;
const isMediumScreen = screenWidth >= 375 && screenWidth < 414;

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

export default function AdminDashboard() {
  const router = useRouter();
  const { user, logout, isLoading: authLoading } = useAuth();
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalProviders: 0,
    totalBookings: 0,
    totalRevenue: 0,
    pendingReports: 0
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshTime, setLastRefreshTime] = useState<number>(0);
  const [isRateLimited, setIsRateLimited] = useState(false);
  
  // Rate limiting: Minimum 20 seconds between refreshes
  const REFRESH_COOLDOWN_MS = 20000;

  useEffect(() => {
    // First check: Redirect non-admin users immediately
    if (!authLoading && user && user.role !== 'admin') {
      router.replace('/(tabs)');
      return;
    }
    
    // Second check: Only fetch data if user is admin
    if (!authLoading && user?.id && user?.role === 'admin') {
      fetchDashboardStats();
    } else if (!authLoading && !user?.id) {
      setLoading(false);
    }
  }, [user?.id, user?.role, authLoading]);

  // NOTE: Back button handling is now managed by _layout.tsx
  // This ensures consistent behavior across all admin tabs:
  // - On home tab: Prevent back navigation (exit app)
  // - On other tabs: Navigate to home tab
  // No need for separate BackHandler here

  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      setRefreshing(prev => !prev);
    });
    return () => subscription?.remove();
  }, []);

  const fetchDashboardStats = async (isRefresh = false) => {
    // Prevent fetching if user is not admin
    if (!user || user.role !== 'admin') {
      return;
    }
    
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const { tokenManager } = await import('@/utils/tokenManager');
      let token = await tokenManager.getValidToken();
      if (!token) {
        console.error('No authentication token found for dashboard stats');
        setLoading(false);
        setRefreshing(false);
        return;
      }

      let response = await fetch(`${API_BASE_URL}/api/admin/stats`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      // If 401, try to refresh token and retry
      if (response.status === 401) {
        const refreshedToken = await tokenManager.forceRefreshToken();
        if (refreshedToken) {
          response = await fetch(`${API_BASE_URL}/api/admin/stats`, {
            headers: {
              'Authorization': `Bearer ${refreshedToken}`,
              'Content-Type': 'application/json'
            }
          });
        }
      }

      if (response.ok) {
        const data = await response.json();
        
        // Validate response structure
        if (data && data.status === 'success' && data.data) {
          // Ensure all required fields are present with defaults
          setStats({
            totalUsers: data.data.totalUsers ?? 0,
            totalProviders: data.data.totalProviders ?? 0,
            totalBookings: data.data.totalBookings ?? 0,
            totalRevenue: data.data.totalRevenue ?? 0,
            pendingReports: data.data.pendingReports ?? 0
          });
        } else {
          console.error('Invalid response structure from admin stats API:', data);
          // Keep existing stats (don't reset to 0 on invalid response)
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('Failed to fetch dashboard stats:', response.status, errorData.message || '');
        // If 403, it means the user doesn't have admin role
        if (response.status === 403) {
          console.error('Access denied: User does not have admin role. Please log out and log in again.');
        }
        // Don't reset stats on error - keep existing values
      }
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    const now = Date.now();
    const timeSinceLastRefresh = now - lastRefreshTime;
    
    // Check if rate limit is active
    if (timeSinceLastRefresh < REFRESH_COOLDOWN_MS) {
      const remainingSeconds = Math.ceil((REFRESH_COOLDOWN_MS - timeSinceLastRefresh) / 1000);
      setIsRateLimited(true);
      
      // Show rate limit message and reset after cooldown
      setTimeout(() => {
        setIsRateLimited(false);
      }, REFRESH_COOLDOWN_MS - timeSinceLastRefresh);
      
      // Show user-friendly alert
      Alert.alert(
        'Rate Limit',
        `Please wait ${remainingSeconds} second(s) before refreshing again. This helps protect the database from excessive requests.`,
        [{ text: 'OK' }]
      );
      
      console.warn(`Rate limit: Please wait ${remainingSeconds} second(s) before refreshing again`);
      return;
    }
    
    // Reset rate limit state
    setIsRateLimited(false);
    setLastRefreshTime(now);
    fetchDashboardStats(true);
  };

  const handleLogout = async () => {
    try {
      await logout();
      router.replace('/auth');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const StatCard = ({ title, value, icon: Icon, color, fullWidth = false }: any) => {
    return (
      <View style={fullWidth ? styles.statCardFullWidth : styles.statCard}>
        <View style={[styles.statCardContent, { borderLeftColor: color }]}>
          <View style={styles.statHeader}>
            <View style={[styles.statIconContainer, { backgroundColor: color + '15' }]}>
              <Icon size={getResponsiveFontSize(20, 22, 24)} color={color} strokeWidth={2} />
            </View>
            <Text style={styles.statTitle}>{title}</Text>
          </View>
          <Text style={[styles.statValue, { color }]}>{value}</Text>
        </View>
      </View>
    );
  };

  return (
    <SafeView backgroundColor="#F8FAFC" excludeBottom={true}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      
      {/* Simple Gradient Header */}
      <LinearGradient
        colors={['#667EEA', '#764BA2']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.headerGradient}
      >
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <View style={styles.headerLeft}>
              <Text style={styles.title}>Admin Dashboard</Text>
              <Text style={styles.subtitle}>Welcome back, {user?.full_name || 'Kishan'}</Text>
            </View>
            <View style={styles.headerRight}>
              <TouchableOpacity 
                onPress={onRefresh} 
                style={[
                  styles.headerButton,
                  (refreshing || isRateLimited) && styles.headerButtonDisabled
                ]}
                activeOpacity={0.7}
                disabled={refreshing || isRateLimited}
              >
                <RefreshCw 
                  size={getResponsiveFontSize(18, 20, 20)} 
                  color={isRateLimited ? 'rgba(255, 255, 255, 0.5)' : '#FFFFFF'}
                />
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={handleLogout} 
                style={styles.headerButton}
                activeOpacity={0.7}
              >
                <LogOut size={getResponsiveFontSize(18, 20, 20)} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </LinearGradient>

      <ScrollView 
        style={styles.container} 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            enabled={!isRateLimited}
            colors={Platform.OS === 'android' ? ['#667EEA'] : undefined}
            tintColor={Platform.OS === 'ios' ? '#667EEA' : undefined}
          />
        }
      >
        {/* Stats Overview - Centered */}
        <View style={styles.section}>
          <View style={styles.sectionTitleContainer}>
            <View style={styles.sectionTitleDot} />
            <Text style={styles.sectionTitle}>Overview</Text>
          </View>
          
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#667EEA" />
            </View>
          ) : (
            <View style={styles.statsGrid}>
              <StatCard
                title="Total Users"
                value={stats.totalUsers}
                icon={Users}
                color="#3B82F6"
              />
              <StatCard
                title="Providers"
                value={stats.totalProviders}
                icon={TrendingUp}
                color="#10B981"
              />
              <StatCard
                title="Bookings"
                value={stats.totalBookings}
                icon={BarChart3}
                color="#F59E0B"
              />
              <StatCard
                title="Revenue"
                value={`₹${stats.totalRevenue}`}
                icon={DollarSign}
                color="#8B5CF6"
              />
              <StatCard
                title="Pending Reports"
                value={stats.pendingReports}
                icon={AlertCircle}
                color="#EF4444"
                fullWidth={true}
              />
            </View>
          )}
        </View>

        {/* Analytics Charts Section */}
        {!loading && (
          <View style={styles.section}>
            <View style={styles.sectionTitleContainer}>
              <View style={styles.sectionTitleDot} />
              <Text style={styles.sectionTitle}>Analytics</Text>
            </View>
            
            {/* Users vs Providers Comparison Chart */}
            <View style={styles.chartCard}>
              <View style={styles.chartHeader}>
                <View style={styles.chartHeaderLeft}>
                  <Activity size={20} color="#667EEA" />
                  <Text style={styles.chartTitle}>Users vs Providers</Text>
                </View>
              </View>
              <View style={styles.barChartContainer}>
                <View style={styles.barChart}>
                  <View style={styles.barWrapper}>
                    <View style={styles.barLabelContainer}>
                      <Text style={styles.barLabel}>Users</Text>
                      <Text style={styles.barValue}>{stats.totalUsers}</Text>
                    </View>
                    <View style={styles.barTrack}>
                      <View 
                        style={[
                          styles.barFill, 
                          { 
                            width: `${Math.min((stats.totalUsers / Math.max(stats.totalUsers + stats.totalProviders, 1)) * 100, 100)}%`,
                            backgroundColor: '#3B82F6'
                          }
                        ]} 
                      />
                    </View>
                  </View>
                  <View style={styles.barWrapper}>
                    <View style={styles.barLabelContainer}>
                      <Text style={styles.barLabel}>Providers</Text>
                      <Text style={styles.barValue}>{stats.totalProviders}</Text>
                    </View>
                    <View style={styles.barTrack}>
                      <View 
                        style={[
                          styles.barFill, 
                          { 
                            width: `${Math.min((stats.totalProviders / Math.max(stats.totalUsers + stats.totalProviders, 1)) * 100, 100)}%`,
                            backgroundColor: '#10B981'
                          }
                        ]} 
                      />
                    </View>
                  </View>
                </View>
              </View>
            </View>

            {/* Bookings & Revenue Chart */}
            <View style={styles.chartCard}>
              <View style={styles.chartHeader}>
                <View style={styles.chartHeaderLeft}>
                  <BarChart3 size={20} color="#667EEA" />
                  <Text style={styles.chartTitle}>Bookings & Revenue</Text>
                </View>
              </View>
              <View style={styles.metricsGrid}>
                <View style={styles.metricItem}>
                  <View style={styles.metricIconContainer}>
                    <BarChart3 size={24} color="#F59E0B" />
                  </View>
                  <Text style={styles.metricValue}>{stats.totalBookings}</Text>
                  <Text style={styles.metricLabel}>Total Bookings</Text>
                  <View style={styles.metricBar}>
                    <View 
                      style={[
                        styles.metricBarFill, 
                        { 
                          width: `${Math.min((stats.totalBookings / Math.max(stats.totalBookings + stats.totalRevenue, 1)) * 100, 100)}%`,
                          backgroundColor: '#F59E0B'
                        }
                      ]} 
                    />
                  </View>
                </View>
                <View style={styles.metricItem}>
                  <View style={styles.metricIconContainer}>
                    <DollarSign size={24} color="#8B5CF6" />
                  </View>
                  <Text style={styles.metricValue}>₹{stats.totalRevenue}</Text>
                  <Text style={styles.metricLabel}>Total Revenue</Text>
                  <View style={styles.metricBar}>
                    <View 
                      style={[
                        styles.metricBarFill, 
                        { 
                          width: `${Math.min((stats.totalRevenue / Math.max(stats.totalBookings + stats.totalRevenue, 1)) * 100, 100)}%`,
                          backgroundColor: '#8B5CF6'
                        }
                      ]} 
                    />
                  </View>
                </View>
              </View>
            </View>

            {/* Growth Indicators */}
            <View style={styles.chartCard}>
              <View style={styles.chartHeader}>
                <View style={styles.chartHeaderLeft}>
                  <TrendingUp size={20} color="#667EEA" />
                  <Text style={styles.chartTitle}>Growth Metrics</Text>
                </View>
              </View>
              <View style={styles.growthContainer}>
                <View style={styles.growthItem}>
                  <View style={styles.growthHeader}>
                    <Text style={styles.growthLabel}>User Growth</Text>
                    <Text style={styles.growthPercentage}>+{stats.totalUsers > 0 ? Math.round((stats.totalUsers / Math.max(stats.totalUsers + stats.totalProviders, 1)) * 100) : 0}%</Text>
                  </View>
                  <View style={styles.progressBar}>
                    <View 
                      style={[
                        styles.progressFill, 
                        { 
                          width: `${Math.min((stats.totalUsers / Math.max(stats.totalUsers + stats.totalProviders, 1)) * 100, 100)}%`,
                          backgroundColor: '#3B82F6'
                        }
                      ]} 
                    />
                  </View>
                </View>
                <View style={styles.growthItem}>
                  <View style={styles.growthHeader}>
                    <Text style={styles.growthLabel}>Provider Growth</Text>
                    <Text style={styles.growthPercentage}>+{stats.totalProviders > 0 ? Math.round((stats.totalProviders / Math.max(stats.totalUsers + stats.totalProviders, 1)) * 100) : 0}%</Text>
                  </View>
                  <View style={styles.progressBar}>
                    <View 
                      style={[
                        styles.progressFill, 
                        { 
                          width: `${Math.min((stats.totalProviders / Math.max(stats.totalUsers + stats.totalProviders, 1)) * 100, 100)}%`,
                          backgroundColor: '#10B981'
                        }
                      ]} 
                    />
                  </View>
                </View>
                <View style={styles.growthItem}>
                  <View style={styles.growthHeader}>
                    <Text style={styles.growthLabel}>Booking Rate</Text>
                    <Text style={styles.growthPercentage}>{stats.totalBookings > 0 ? Math.round((stats.totalBookings / Math.max(stats.totalUsers, 1)) * 100) : 0}%</Text>
                  </View>
                  <View style={styles.progressBar}>
                    <View 
                      style={[
                        styles.progressFill, 
                        { 
                          width: `${Math.min((stats.totalBookings / Math.max(stats.totalUsers, 1)) * 100, 100)}%`,
                          backgroundColor: '#F59E0B'
                        }
                      ]} 
                    />
                  </View>
                </View>
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    paddingBottom: getResponsiveSpacing(8, 10, 12),
  },
  headerGradient: {
    paddingTop: Platform.OS === 'ios' ? 50 : StatusBar.currentHeight || 0,
    paddingBottom: getResponsiveSpacing(12, 14, 16),
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
  header: {
    paddingHorizontal: getResponsiveSpacing(20, 22, 24),
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerLeft: {
    flex: 1,
    paddingRight: 12,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: getResponsiveSpacing(10, 12, 12),
  },
  headerButton: {
    width: getResponsiveSpacing(40, 44, 44),
    height: getResponsiveSpacing(40, 44, 44),
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerButtonDisabled: {
    opacity: 0.5,
  },
  title: {
    fontSize: getResponsiveFontSize(24, 26, 28),
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: getResponsiveSpacing(4, 6, 6),
  },
  subtitle: {
    fontSize: getResponsiveFontSize(14, 15, 16),
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '500',
  },
  section: {
    paddingHorizontal: getResponsiveSpacing(16, 20, 20),
    paddingTop: getResponsiveSpacing(12, 14, 16),
    paddingBottom: getResponsiveSpacing(4, 6, 8),
    width: '100%',
  },
  sectionTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: getResponsiveSpacing(12, 14, 16),
    alignSelf: 'flex-start',
    width: '100%',
  },
  sectionTitleDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#667EEA',
    marginRight: 10,
  },
  sectionTitle: {
    fontSize: getResponsiveFontSize(18, 20, 20),
    fontWeight: '700',
    color: '#1F2937',
  },
  loadingContainer: {
    paddingVertical: getResponsiveSpacing(60, 80, 80),
    alignItems: 'center',
    width: '100%',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: getResponsiveSpacing(12, 14, 16),
    width: '100%',
    alignSelf: 'stretch',
  },
  statCard: {
    width: (screenWidth - getResponsiveSpacing(48, 56, 56) - getResponsiveSpacing(12, 14, 16)) / 2,
    marginBottom: 0,
  },
  statCardFullWidth: {
    width: '100%',
    marginBottom: 0,
  },
  statCardContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: getResponsiveSpacing(16, 18, 20),
    borderLeftWidth: 4,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  statHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: getResponsiveSpacing(10, 12, 12),
  },
  statIconContainer: {
    width: getResponsiveSpacing(36, 40, 40),
    height: getResponsiveSpacing(36, 40, 40),
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: getResponsiveSpacing(8, 10, 10),
  },
  statTitle: {
    fontSize: getResponsiveFontSize(11, 12, 12),
    color: '#6B7280',
    fontWeight: '600',
    flex: 1,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statValue: {
    fontSize: getResponsiveFontSize(24, 26, 28),
    fontWeight: '700',
  },
  // Chart Styles
  chartCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: getResponsiveSpacing(16, 18, 20),
    marginBottom: getResponsiveSpacing(12, 14, 16),
    width: '100%',
    alignSelf: 'stretch',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: getResponsiveSpacing(16, 18, 20),
  },
  chartHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: getResponsiveSpacing(8, 10, 12),
  },
  chartTitle: {
    fontSize: getResponsiveFontSize(16, 17, 18),
    fontWeight: '700',
    color: '#1F2937',
  },
  barChartContainer: {
    marginTop: getResponsiveSpacing(8, 10, 12),
    width: '100%',
  },
  barChart: {
    width: '100%',
    gap: getResponsiveSpacing(16, 18, 20),
  },
  barWrapper: {
    width: '100%',
    marginBottom: getResponsiveSpacing(4, 6, 8),
  },
  barLabelContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: getResponsiveSpacing(6, 8, 10),
    width: '100%',
  },
  barLabel: {
    fontSize: getResponsiveFontSize(13, 14, 15),
    fontWeight: '600',
    color: '#6B7280',
  },
  barValue: {
    fontSize: getResponsiveFontSize(14, 15, 16),
    fontWeight: '700',
    color: '#1F2937',
  },
  barTrack: {
    width: '100%',
    height: getResponsiveSpacing(12, 14, 16),
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 8,
    minWidth: 4,
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: getResponsiveSpacing(12, 14, 16),
    marginTop: getResponsiveSpacing(8, 10, 12),
    width: '100%',
    justifyContent: 'space-between',
  },
  metricItem: {
    flex: 1,
    alignItems: 'center',
    minWidth: 0,
  },
  metricIconContainer: {
    width: getResponsiveSpacing(48, 52, 56),
    height: getResponsiveSpacing(48, 52, 56),
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: getResponsiveSpacing(8, 10, 12),
  },
  metricValue: {
    fontSize: getResponsiveFontSize(18, 20, 22),
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: getResponsiveSpacing(4, 6, 6),
    textAlign: 'center',
  },
  metricLabel: {
    fontSize: getResponsiveFontSize(10, 11, 12),
    color: '#6B7280',
    fontWeight: '600',
    marginBottom: getResponsiveSpacing(8, 10, 12),
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  metricBar: {
    width: '100%',
    height: getResponsiveSpacing(6, 8, 8),
    backgroundColor: '#F3F4F6',
    borderRadius: 4,
    overflow: 'hidden',
  },
  metricBarFill: {
    height: '100%',
    borderRadius: 4,
    minWidth: 2,
  },
  growthContainer: {
    width: '100%',
    gap: getResponsiveSpacing(16, 18, 20),
    marginTop: getResponsiveSpacing(8, 10, 12),
  },
  growthItem: {
    width: '100%',
    marginBottom: getResponsiveSpacing(4, 6, 8),
  },
  growthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: getResponsiveSpacing(6, 8, 10),
    width: '100%',
  },
  growthLabel: {
    fontSize: getResponsiveFontSize(13, 14, 15),
    fontWeight: '600',
    color: '#6B7280',
  },
  growthPercentage: {
    fontSize: getResponsiveFontSize(13, 14, 15),
    fontWeight: '700',
    color: '#1F2937',
  },
  progressBar: {
    width: '100%',
    height: getResponsiveSpacing(8, 10, 10),
    backgroundColor: '#F3F4F6',
    borderRadius: 5,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 5,
    minWidth: 4,
  },
});

