import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, StatusBar, Animated, Platform, Alert, TextInput, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { ArrowLeft, Users, Phone, Mail, Calendar, UserCheck, UserX, Search, Filter, MoreVertical, Trash2, Shield, Eye } from 'lucide-react-native';
import { SafeView } from '@/components/SafeView';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '@/constants/api';
import { LinearGradient } from 'expo-linear-gradient';

// Responsive design utilities
const { width: screenWidth } = require('react-native').Dimensions.get('window');
const isSmallScreen = screenWidth < 375;

const getResponsiveValue = (small: number, medium: number, large: number) => {
  if (isSmallScreen) return small;
  if (screenWidth >= 375 && screenWidth < 414) return medium;
  return large;
};

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

interface User {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  role: string;
  is_verified: boolean;
  created_at: string;
  last_login: string;
}

export default function UserReportsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'all' | 'verified' | 'unverified'>('all');
  const [refreshing, setRefreshing] = useState(false);
  
  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const filterAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadUsers();
    // Start entrance animations
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  useEffect(() => {
    // Filter animation
    Animated.timing(filterAnim, {
      toValue: showFilters ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [showFilters]);

  const loadUsers = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) {
        console.error('No authentication token found');
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/admin/all-users`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.status === 'success') {
          setUsers(data.data.users);
        }
      } else {
        console.error('Failed to fetch users:', response.status);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadUsers();
  };

  const removeUser = async (userId: string, userName: string) => {
    Alert.alert(
      'Remove User',
      `Are you sure you want to remove ${userName}? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const token = await AsyncStorage.getItem('token');
              const response = await fetch(`${API_BASE_URL}/api/admin/users/${userId}`, {
                method: 'DELETE',
                headers: {
                  'Authorization': `Bearer ${token}`,
                },
              });

              if (response.ok) {
                setUsers(users.filter(user => user.id !== userId));
                Alert.alert('Success', 'User removed successfully');
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

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         user.phone.includes(searchQuery);
    
    const matchesFilter = filterStatus === 'all' || 
                         (filterStatus === 'verified' && user.is_verified) ||
                         (filterStatus === 'unverified' && !user.is_verified);
    
    return matchesSearch && matchesFilter;
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const renderUser = ({ item, index }: { item: User; index: number }) => (
    <Animated.View 
      style={[
        styles.userCard,
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
        style={styles.userGradient}
      >
        <View style={styles.userHeader}>
          <View style={styles.userInfo}>
            <View style={styles.userNameContainer}>
              <Text style={styles.userName}>{item.full_name}</Text>
              <View style={[
                styles.verificationBadge,
                { backgroundColor: item.is_verified ? '#10B981' : '#EF4444' }
              ]}>
                {item.is_verified ? (
                  <UserCheck size={getResponsiveValue(12, 14, 16)} color="white" />
                ) : (
                  <UserX size={getResponsiveValue(12, 14, 16)} color="white" />
                )}
                <Text style={styles.verificationText}>
                  {item.is_verified ? 'Verified' : 'Unverified'}
                </Text>
              </View>
            </View>
          </View>
          
          <TouchableOpacity style={styles.moreButton}>
            <MoreVertical size={getResponsiveValue(16, 18, 20)} color="#6B7280" />
          </TouchableOpacity>
        </View>

        <View style={styles.userDetails}>
          <View style={styles.detailRow}>
            <View style={styles.detailIconContainer}>
              <Phone size={getResponsiveValue(14, 16, 18)} color="#3B82F6" />
            </View>
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Phone</Text>
              <Text style={styles.detailText}>{item.phone}</Text>
            </View>
          </View>
          
          <View style={styles.detailRow}>
            <View style={styles.detailIconContainer}>
              <Mail size={getResponsiveValue(14, 16, 18)} color="#3B82F6" />
            </View>
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Email</Text>
              <Text style={styles.detailText}>{item.email}</Text>
            </View>
          </View>
          
          <View style={styles.detailRow}>
            <View style={styles.detailIconContainer}>
              <Calendar size={getResponsiveValue(14, 16, 18)} color="#3B82F6" />
            </View>
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Joined</Text>
              <Text style={styles.detailText}>{formatDate(item.created_at)}</Text>
            </View>
          </View>
          
          {item.last_login && (
            <View style={styles.detailRow}>
              <View style={styles.detailIconContainer}>
                <Shield size={getResponsiveValue(14, 16, 18)} color="#3B82F6" />
              </View>
              <View style={styles.detailContent}>
                <Text style={styles.detailLabel}>Last Login</Text>
                <Text style={styles.detailText}>{formatDate(item.last_login)}</Text>
              </View>
            </View>
          )}
        </View>

        <View style={styles.userActions}>
          <TouchableOpacity style={styles.viewButton}>
            <Eye size={getResponsiveValue(14, 16, 18)} color="#3B82F6" />
            <Text style={styles.viewButtonText}>View Details</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.removeButton}
            onPress={() => removeUser(item.id, item.full_name)}
          >
            <Trash2 size={getResponsiveValue(14, 16, 18)} color="white" />
            <Text style={styles.removeButtonText}>Remove</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    </Animated.View>
  );

  return (
    <SafeView backgroundColor="#F8FAFC">
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />
      
      {/* Header */}
      <Animated.View 
        style={[
          styles.header,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }]
          }
        ]}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={getResponsiveValue(20, 22, 24)} color="#374151" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.title}>User Management</Text>
          <Text style={styles.subtitle}>Total: {filteredUsers.length} users</Text>
        </View>
        <TouchableOpacity 
          style={[styles.filterButton, showFilters && styles.filterButtonActive]}
          onPress={() => setShowFilters(!showFilters)}
        >
          <Filter size={getResponsiveValue(18, 20, 22)} color={showFilters ? "white" : "#6B7280"} />
        </TouchableOpacity>
      </Animated.View>

      {/* Search Section */}
      <Animated.View 
        style={[
          styles.searchSection,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }]
          }
        ]}
      >
        <View style={styles.searchContainer}>
          <Search size={getResponsiveValue(16, 18, 20)} color="#9CA3AF" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search users by name, email, or phone..."
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </Animated.View>

      {/* Filter Section */}
      <Animated.View 
        style={[
          styles.filterSection,
          {
            opacity: filterAnim,
            transform: [
              {
                scaleY: filterAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 1]
                })
              },
              {
                translateY: filterAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-20, 0]
                })
              }
            ]
          }
        ]}
      >
        <View style={styles.filterContainer}>
          <TouchableOpacity 
            style={[styles.filterChip, filterStatus === 'all' && styles.filterChipActive]}
            onPress={() => setFilterStatus('all')}
          >
            <Text style={[styles.filterChipText, filterStatus === 'all' && styles.filterChipTextActive]}>
              All Users
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.filterChip, filterStatus === 'verified' && styles.filterChipActive]}
            onPress={() => setFilterStatus('verified')}
          >
            <Text style={[styles.filterChipText, filterStatus === 'verified' && styles.filterChipTextActive]}>
              Verified
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.filterChip, filterStatus === 'unverified' && styles.filterChipActive]}
            onPress={() => setFilterStatus('unverified')}
          >
            <Text style={[styles.filterChipText, filterStatus === 'unverified' && styles.filterChipTextActive]}>
              Unverified
            </Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* Content */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Loading users...</Text>
        </View>
      ) : filteredUsers.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Users size={getResponsiveValue(56, 64, 72)} color="#9CA3AF" />
          <Text style={styles.emptyTitle}>No Users Found</Text>
          <Text style={styles.emptySubtitle}>
            {searchQuery ? 'No users match your search criteria.' : 'No users have registered yet.'}
          </Text>
        </View>
      ) : (
        <FlatList
          style={styles.container}
          data={filteredUsers}
          keyExtractor={(item) => item.id}
          renderItem={renderUser}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
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
  // Header Styles
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: getResponsiveSpacing(16, 18, 20),
    paddingVertical: getResponsiveSpacing(16, 18, 20),
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  backButton: {
    padding: getResponsiveSpacing(8, 10, 12),
    marginRight: getResponsiveSpacing(12, 14, 16),
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  headerInfo: {
    flex: 1,
  },
  title: {
    fontSize: getResponsiveFontSize(20, 22, 24),
    fontWeight: '700',
    color: '#1F2937',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: getResponsiveFontSize(14, 15, 16),
    color: '#6B7280',
    marginTop: 2,
    fontWeight: '500',
  },
  filterButton: {
    padding: getResponsiveSpacing(10, 12, 14),
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    marginLeft: getResponsiveSpacing(8, 10, 12),
  },
  filterButtonActive: {
    backgroundColor: '#3B82F6',
  },

  // Search Section
  searchSection: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: getResponsiveSpacing(16, 18, 20),
    paddingVertical: getResponsiveSpacing(12, 14, 16),
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    paddingHorizontal: getResponsiveSpacing(12, 14, 16),
    paddingVertical: getResponsiveSpacing(10, 12, 14),
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  searchInput: {
    flex: 1,
    fontSize: getResponsiveFontSize(14, 15, 16),
    color: '#374151',
    marginLeft: getResponsiveSpacing(8, 10, 12),
    fontWeight: '500',
  },

  // Filter Section
  filterSection: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: getResponsiveSpacing(16, 18, 20),
    paddingVertical: getResponsiveSpacing(12, 14, 16),
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  filterContainer: {
    flexDirection: 'row',
    gap: getResponsiveSpacing(8, 10, 12),
  },
  filterChip: {
    paddingHorizontal: getResponsiveSpacing(12, 14, 16),
    paddingVertical: getResponsiveSpacing(6, 8, 10),
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  filterChipActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  filterChipText: {
    fontSize: getResponsiveFontSize(12, 13, 14),
    fontWeight: '600',
    color: '#6B7280',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },

  // Container Styles
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  listContainer: {
    padding: getResponsiveSpacing(16, 18, 20),
  },

  // Loading & Empty States
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    fontSize: getResponsiveFontSize(14, 15, 16),
    color: '#6B7280',
    marginTop: 12,
    fontWeight: '500',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: getResponsiveFontSize(18, 20, 22),
    fontWeight: '600',
    color: '#374151',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: getResponsiveFontSize(14, 15, 16),
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },

  // User Card Styles
  userCard: {
    marginBottom: getResponsiveSpacing(16, 18, 20),
    borderRadius: 16,
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
  userGradient: {
    padding: getResponsiveSpacing(16, 18, 20),
  },
  userHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: getResponsiveSpacing(12, 14, 16),
  },
  userInfo: {
    flex: 1,
  },
  userNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: getResponsiveSpacing(8, 10, 12),
  },
  userName: {
    fontSize: getResponsiveFontSize(16, 17, 18),
    fontWeight: '700',
    color: '#1F2937',
    flex: 1,
  },
  verificationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: getResponsiveSpacing(8, 10, 12),
    paddingVertical: getResponsiveSpacing(4, 6, 8),
    borderRadius: 12,
    marginLeft: getResponsiveSpacing(8, 10, 12),
  },
  verificationText: {
    fontSize: getResponsiveFontSize(11, 12, 13),
    fontWeight: '600',
    marginLeft: 4,
    color: 'white',
  },
  moreButton: {
    padding: getResponsiveSpacing(6, 8, 10),
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },

  // User Details
  userDetails: {
    marginBottom: getResponsiveSpacing(12, 14, 16),
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: getResponsiveSpacing(8, 10, 12),
  },
  detailIconContainer: {
    width: getResponsiveValue(32, 36, 40),
    height: getResponsiveValue(32, 36, 40),
    borderRadius: 8,
    backgroundColor: '#EBF4FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: getResponsiveSpacing(10, 12, 14),
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    fontSize: getResponsiveFontSize(11, 12, 13),
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  detailText: {
    fontSize: getResponsiveFontSize(14, 15, 16),
    color: '#374151',
    fontWeight: '500',
  },

  // User Actions
  userActions: {
    flexDirection: 'row',
    gap: getResponsiveSpacing(8, 10, 12),
    paddingTop: getResponsiveSpacing(12, 14, 16),
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  viewButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: getResponsiveSpacing(10, 12, 14),
    borderRadius: 12,
    backgroundColor: '#EBF4FF',
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  viewButtonText: {
    fontSize: getResponsiveFontSize(13, 14, 15),
    fontWeight: '600',
    color: '#3B82F6',
    marginLeft: 6,
  },
  removeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: getResponsiveSpacing(10, 12, 14),
    borderRadius: 12,
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  removeButtonText: {
    fontSize: getResponsiveFontSize(13, 14, 15),
    fontWeight: '600',
    color: '#EF4444',
    marginLeft: 6,
  },
});