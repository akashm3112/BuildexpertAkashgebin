import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, FlatList, ActivityIndicator, StatusBar } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { ArrowLeft, UserCheck, Phone, Mail, Calendar, MapPin, Briefcase, UserX } from 'lucide-react-native';
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

interface Provider {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  role: string;
  is_verified: boolean;
  created_at: string;
  last_login: string;
  state: string;
  city: string;
  years_of_experience: number;
  service_description: string;
  registered_services_count: number;
}

export default function ProviderReportsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadProviders();
  }, []);

  const loadProviders = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) {
        console.error('No authentication token found');
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/admin/all-providers`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.status === 'success') {
          setProviders(data.data.providers);
        }
      } else {
        console.error('Failed to fetch providers:', response.status);
      }
    } catch (error) {
      console.error('Error fetching providers:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const renderProvider = ({ item }: { item: Provider }) => (
    <View style={styles.providerCard}>
      <View style={styles.providerHeader}>
        <View style={styles.providerInfo}>
          <Text style={styles.providerName}>{item.full_name}</Text>
          <View style={styles.verificationBadge}>
            {item.is_verified ? (
              <UserCheck size={16} color="#10B981" />
            ) : (
              <UserX size={16} color="#EF4444" />
            )}
            <Text style={[
              styles.verificationText,
              { color: item.is_verified ? '#10B981' : '#EF4444' }
            ]}>
              {item.is_verified ? 'Verified' : 'Unverified'}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.providerDetails}>
        <View style={styles.detailRow}>
          <Phone size={16} color="#6B7280" />
          <Text style={styles.detailText}>{item.phone}</Text>
        </View>
        
        <View style={styles.detailRow}>
          <Mail size={16} color="#6B7280" />
          <Text style={styles.detailText}>{item.email}</Text>
        </View>
        
        {item.state && item.city && (
          <View style={styles.detailRow}>
            <MapPin size={16} color="#6B7280" />
            <Text style={styles.detailText}>{item.city}, {item.state}</Text>
          </View>
        )}
        
        {item.years_of_experience && (
          <View style={styles.detailRow}>
            <Briefcase size={16} color="#6B7280" />
            <Text style={styles.detailText}>{item.years_of_experience} years experience</Text>
          </View>
        )}
        
        <View style={styles.detailRow}>
          <UserCheck size={16} color="#6B7280" />
          <Text style={styles.detailText}>{item.registered_services_count} services registered</Text>
        </View>
        
        <View style={styles.detailRow}>
          <Calendar size={16} color="#6B7280" />
          <Text style={styles.detailText}>Joined: {formatDate(item.created_at)}</Text>
        </View>
        
        {item.last_login && (
          <View style={styles.detailRow}>
            <Calendar size={16} color="#6B7280" />
            <Text style={styles.detailText}>Last login: {formatDate(item.last_login)}</Text>
          </View>
        )}
      </View>

      {item.service_description && (
        <View style={styles.serviceDescription}>
          <Text style={styles.serviceDescriptionTitle}>Service Description:</Text>
          <Text style={styles.serviceDescriptionText}>{item.service_description}</Text>
        </View>
      )}
    </View>
  );

  return (
    <SafeView backgroundColor="#F8FAFC">
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />
      
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color="#374151" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.title}>All Service Providers</Text>
          <Text style={styles.subtitle}>Total: {providers.length} providers</Text>
        </View>
      </View>

      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#3B82F6" />
            <Text style={styles.loadingText}>Loading providers...</Text>
          </View>
        ) : providers.length === 0 ? (
          <View style={styles.emptyContainer}>
            <UserCheck size={64} color="#9CA3AF" />
            <Text style={styles.emptyTitle}>No Providers Found</Text>
            <Text style={styles.emptySubtitle}>No service providers have registered yet.</Text>
          </View>
        ) : (
          <FlatList
            data={providers}
            keyExtractor={(item) => item.id}
            renderItem={renderProvider}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContainer}
          />
        )}
      </ScrollView>
    </SafeView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: getResponsiveSpacing(16, 18, 20),
    paddingVertical: getResponsiveSpacing(12, 14, 16),
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    padding: 8,
    marginRight: 12,
  },
  headerInfo: {
    flex: 1,
  },
  title: {
    fontSize: getResponsiveFontSize(20, 22, 24),
    fontWeight: '600',
    color: '#1F2937',
  },
  subtitle: {
    fontSize: getResponsiveFontSize(14, 15, 16),
    color: '#6B7280',
    marginTop: 2,
  },
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
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
  },
  listContainer: {
    padding: getResponsiveSpacing(16, 18, 20),
  },
  providerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: getResponsiveSpacing(16, 18, 20),
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  providerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  providerInfo: {
    flex: 1,
  },
  providerName: {
    fontSize: getResponsiveFontSize(16, 17, 18),
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  verificationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  verificationText: {
    fontSize: getResponsiveFontSize(12, 13, 14),
    fontWeight: '500',
    marginLeft: 4,
  },
  providerDetails: {
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailText: {
    fontSize: getResponsiveFontSize(14, 15, 16),
    color: '#6B7280',
    marginLeft: 8,
    flex: 1,
  },
  serviceDescription: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  serviceDescriptionTitle: {
    fontSize: getResponsiveFontSize(14, 15, 16),
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
  },
  serviceDescriptionText: {
    fontSize: getResponsiveFontSize(14, 15, 16),
    color: '#6B7280',
    lineHeight: 20,
  },
});