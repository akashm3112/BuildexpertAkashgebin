import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, StatusBar, RefreshControl, Platform, BackHandler } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { ArrowLeft, Users, FileText, BarChart3, Settings, LogOut, RefreshCw } from 'lucide-react-native';
import { SafeView } from '@/components/SafeView';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '@/constants/api';

// Responsive design utilities
const { width: screenWidth } = require('react-native').Dimensions.get('window');
const isSmallScreen = screenWidth < 375;

const getResponsiveSpacing = (small: number, medium: number, large: number) => {
  if (isSmallScreen) return small;
  if (screenWidth >= 375 && screenWidth < 414) return medium;
  return large;
};

const getResponsiveFontSize = (small: number, medium: number, large: number) => {
  if (isSmallScreen) return small;
  if (screenWidth >= 375 && screenWidth < 414) return medium;
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

  const StatCard = ({ title, value, icon: Icon, color, fullWidth = false }: any) => (
    <View style={[fullWidth ? styles.statCardFullWidth : styles.statCard, { borderLeftColor: color }]}>
      <View style={styles.statHeader}>
        <Icon size={24} color={color} />
        <Text style={styles.statTitle}>{title}</Text>
      </View>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
    </View>
  );

  const MenuCard = ({ title, description, icon: Icon, onPress, color }: any) => (
    <TouchableOpacity style={styles.menuCard} onPress={onPress}>
      <View style={[styles.menuIcon, { backgroundColor: color + '20' }]}>
        <Icon size={24} color={color} />
      </View>
      <View style={styles.menuContent}>
        <Text style={styles.menuTitle}>{title}</Text>
        <Text style={styles.menuDescription}>{description}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeView backgroundColor="#F8FAFC">
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />
      
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <View style={styles.headerLeft}>
            <Text style={styles.title}>Admin Dashboard</Text>
            <Text style={styles.subtitle}>Welcome back, {user?.full_name || 'Admin'}</Text>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity onPress={onRefresh} style={styles.refreshButton}>
              <RefreshCw size={20} color="#3B82F6" />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
              <LogOut size={20} color="#EF4444" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <ScrollView 
        style={styles.container} 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#3B82F6']}
            tintColor="#3B82F6"
          />
        }
      >
        {/* Stats Overview */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Overview</Text>
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#3B82F6" />
            </View>
          ) : (
            <View style={styles.statsGrid}>
              {/* First Row - 2 cards */}
              <StatCard
                title="Total Users"
                value={stats.totalUsers}
                icon={Users}
                color="#3B82F6"
              />
              <StatCard
                title="Providers"
                value={stats.totalProviders}
                icon={FileText}
                color="#10B981"
              />
              
              {/* Second Row - 2 cards */}
              <StatCard
                title="Bookings"
                value={stats.totalBookings}
                icon={BarChart3}
                color="#F59E0B"
              />
              <StatCard
                title="Revenue"
                value={`₹${stats.totalRevenue}`}
                icon={BarChart3}
                color="#8B5CF6"
              />
              
              {/* Third Row - 1 full width card */}
              <StatCard
                title="Pending Reports"
                value={stats.pendingReports}
                icon={FileText}
                color="#EF4444"
                fullWidth={true}
              />
            </View>
          )}
        </View>

        {/* Admin Menu */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Management</Text>
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
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    paddingHorizontal: 20,
    paddingBottom: 20,
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
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerLeft: {
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  refreshButton: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#EBF4FF',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  logoutButton: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#FEF2F2',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  title: {
    fontSize: getResponsiveFontSize(24, 28, 32),
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: getResponsiveSpacing(4, 6, 8),
  },
  subtitle: {
    fontSize: getResponsiveFontSize(14, 16, 18),
    color: '#6B7280',
  },
  section: {
    paddingHorizontal: getResponsiveSpacing(16, 20, 24),
    paddingVertical: getResponsiveSpacing(16, 20, 24),
  },
  sectionTitle: {
    fontSize: getResponsiveFontSize(18, 20, 22),
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: getResponsiveSpacing(12, 16, 20),
  },
  loadingContainer: {
    paddingVertical: getResponsiveSpacing(40, 50, 60),
    alignItems: 'center',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  statCard: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    borderLeftWidth: 4,
    marginBottom: 16,
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
  statCardFullWidth: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    borderLeftWidth: 4,
    marginBottom: 16,
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
  statHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  statTitle: {
    fontSize: 14,
    color: '#6B7280',
    marginLeft: 8,
    fontWeight: '500',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
  },
  menuGrid: {
    gap: 16,
  },
  menuCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
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
  menuIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  menuContent: {
    flex: 1,
  },
  menuTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  menuDescription: {
    fontSize: 14,
    color: '#6B7280',
  },
});


