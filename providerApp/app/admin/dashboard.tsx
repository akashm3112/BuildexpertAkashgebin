import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, StatusBar, RefreshControl, Platform, BackHandler, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { ArrowLeft, Users, FileText, BarChart3, Settings, LogOut, RefreshCw, TrendingUp, DollarSign, AlertCircle, ChevronRight } from 'lucide-react-native';
import { SafeView } from '@/components/SafeView';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
  const { user, logout } = useAuth();
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalProviders: 0,
    totalBookings: 0,
    totalRevenue: 0,
    pendingReports: 0
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchDashboardStats();
  }, []);

  useEffect(() => {
    if (user && user.role !== 'admin') {
      router.replace('/(tabs)');
    }
  }, [user?.role]);

  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => backHandler.remove();
  }, []);

  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      setRefreshing(prev => !prev);
    });
    return () => subscription?.remove();
  }, []);

  const fetchDashboardStats = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const token = await AsyncStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/api/admin/stats`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setStats(data.data);
      } else {
        console.error('Failed to fetch dashboard stats:', response.status);
      }
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
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

  const MenuCard = ({ title, description, icon: Icon, onPress, color }: any) => {
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.8}
        style={styles.menuCard}
      >
        <View style={styles.menuCardContent}>
          <View style={[styles.menuIconContainer, { backgroundColor: color + '15' }]}>
            <Icon size={getResponsiveFontSize(22, 24, 26)} color={color} strokeWidth={2} />
          </View>
          <View style={styles.menuTextContainer}>
            <Text style={styles.menuTitle}>{title}</Text>
            <Text style={styles.menuDescription}>{description}</Text>
          </View>
          <View style={[styles.menuArrowContainer, { backgroundColor: color + '15' }]}>
            <ChevronRight size={18} color={color} strokeWidth={2.5} />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeView backgroundColor="#F8FAFC">
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
                style={styles.headerButton}
                activeOpacity={0.7}
              >
                <RefreshCw size={getResponsiveFontSize(18, 20, 20)} color="#FFFFFF" />
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
            colors={Platform.OS === 'android' ? ['#667EEA'] : undefined}
            tintColor={Platform.OS === 'ios' ? '#667EEA' : undefined}
          />
        }
      >
        {/* Stats Overview */}
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

        {/* Management Section */}
        <View style={styles.section}>
          <View style={styles.sectionTitleContainer}>
            <View style={styles.sectionTitleDot} />
            <Text style={styles.sectionTitle}>Management</Text>
          </View>
          
          <View style={styles.menuGrid}>
            <MenuCard
              title="Reports & Complaints"
              description="View and manage user reports"
              icon={FileText}
              color="#EF4444"
              onPress={() => router.push('/admin/reports')}
            />
            <MenuCard
              title="User Management"
              description="View and manage all users"
              icon={Users}
              color="#3B82F6"
              onPress={() => router.push('/admin/user-reports')}
            />
            <MenuCard
              title="Provider Management"
              description="View and manage service providers"
              icon={Settings}
              color="#10B981"
              onPress={() => router.push('/admin/provider-reports')}
            />
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
  scrollContent: {
    paddingBottom: getResponsiveSpacing(20, 24, 24),
  },
  headerGradient: {
    paddingTop: Platform.OS === 'ios' ? 50 : StatusBar.currentHeight || 0,
    paddingBottom: getResponsiveSpacing(20, 22, 24),
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
    paddingTop: getResponsiveSpacing(20, 24, 24),
  },
  sectionTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: getResponsiveSpacing(16, 18, 20),
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
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: getResponsiveSpacing(12, 14, 16),
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
  menuGrid: {
    gap: getResponsiveSpacing(12, 14, 16),
  },
  menuCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 0,
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
  menuCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: getResponsiveSpacing(16, 18, 20),
  },
  menuIconContainer: {
    width: getResponsiveSpacing(48, 52, 56),
    height: getResponsiveSpacing(48, 52, 56),
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: getResponsiveSpacing(14, 16, 16),
  },
  menuTextContainer: {
    flex: 1,
  },
  menuTitle: {
    fontSize: getResponsiveFontSize(16, 17, 18),
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: getResponsiveSpacing(4, 4, 6),
  },
  menuDescription: {
    fontSize: getResponsiveFontSize(13, 13, 14),
    color: '#6B7280',
    fontWeight: '500',
  },
  menuArrowContainer: {
    width: getResponsiveSpacing(32, 36, 36),
    height: getResponsiveSpacing(32, 36, 36),
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: getResponsiveSpacing(10, 12, 12),
  },
});
