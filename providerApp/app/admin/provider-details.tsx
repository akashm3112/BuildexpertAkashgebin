import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeView } from '@/components/SafeView';
import { ArrowLeft, UserCheck, UserX, Phone, Mail, Calendar, MapPin, Briefcase, Shield, Star } from 'lucide-react-native';

const { width: screenWidth } = require('react-native').Dimensions.get('window');
const isSmallScreen = screenWidth < 375;
const getResponsiveValue = (small: number, medium: number, large: number) => {
  if (isSmallScreen) return small;
  if (screenWidth >= 375 && screenWidth < 414) return medium;
  return large;
};

type Provider = {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  role?: string;
  is_verified: boolean;
  created_at?: string;
  last_login?: string;
  state?: string;
  city?: string;
  years_of_experience?: number;
  service_description?: string;
  registered_services_count?: number;
};

const PRIMARY_BLUE = '#4E8EF7';

export default function ProviderDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const providerParam = typeof params.provider === 'string' ? params.provider : params.provider?.[0];

  let provider: Provider | null = null;
  try {
    provider = providerParam ? JSON.parse(providerParam) : null;
  } catch {
    provider = null;
  }

  const formatDate = (date?: string) => {
    if (!date) return '—';
    return new Date(date).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  return (
    <SafeView backgroundColor="#F8FAFC">
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={getResponsiveValue(20, 22, 24)} color="#374151" />
        </TouchableOpacity>
        <Text style={styles.title}>Provider Details</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {!provider ? (
          <Text style={styles.emptyText}>No provider data found.</Text>
        ) : (
          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.name}>{provider.full_name}</Text>
              <View
                style={[
                  styles.badge,
                  { backgroundColor: provider.is_verified ? '#10B981' : '#EF4444' },
                ]}
              >
                {provider.is_verified ? (
                  <UserCheck size={14} color="white" />
                ) : (
                  <UserX size={14} color="white" />
                )}
                <Text style={styles.badgeText}>
                  {provider.is_verified ? 'Verified' : 'Unverified'}
                </Text>
              </View>
            </View>

            <View style={styles.section}>
              <View style={styles.row}>
                <Phone size={16} color={PRIMARY_BLUE} />
                <Text style={styles.label}>Phone</Text>
              </View>
              <Text style={styles.value}>{provider.phone || '—'}</Text>
            </View>

            <View style={styles.section}>
              <View style={styles.row}>
                <Mail size={16} color={PRIMARY_BLUE} />
                <Text style={styles.label}>Email</Text>
              </View>
              <Text style={styles.value}>{provider.email || '—'}</Text>
            </View>

            <View style={styles.section}>
              <View style={styles.row}>
                <Calendar size={16} color={PRIMARY_BLUE} />
                <Text style={styles.label}>Joined</Text>
              </View>
              <Text style={styles.value}>{formatDate(provider.created_at)}</Text>
            </View>

            {provider.last_login ? (
              <View style={styles.section}>
                <View style={styles.row}>
                  <Shield size={16} color={PRIMARY_BLUE} />
                  <Text style={styles.label}>Last Login</Text>
                </View>
                <Text style={styles.value}>{formatDate(provider.last_login)}</Text>
              </View>
            ) : null}

            {(provider.city || provider.state) && (
              <View style={styles.section}>
                <View style={styles.row}>
                  <MapPin size={16} color={PRIMARY_BLUE} />
                  <Text style={styles.label}>Location</Text>
                </View>
                <Text style={styles.value}>{[provider.city, provider.state].filter(Boolean).join(', ')}</Text>
              </View>
            )}

            {provider.years_of_experience ? (
              <View style={styles.section}>
                <View style={styles.row}>
                  <Briefcase size={16} color={PRIMARY_BLUE} />
                  <Text style={styles.label}>Experience</Text>
                </View>
                <Text style={styles.value}>{provider.years_of_experience} years</Text>
              </View>
            ) : null}

            <View style={styles.section}>
              <View style={styles.row}>
                <Star size={16} color={PRIMARY_BLUE} />
                <Text style={styles.label}>Registered Services</Text>
              </View>
              <Text style={styles.value}>{provider.registered_services_count ?? 0}</Text>
            </View>

            {provider.service_description ? (
              <View style={styles.section}>
                <Text style={styles.label}>Service Description</Text>
                <Text style={styles.value}>{provider.service_description}</Text>
              </View>
            ) : null}
          </View>
        )}
      </ScrollView>
    </SafeView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: getResponsiveValue(16, 18, 20),
    paddingVertical: getResponsiveValue(12, 14, 16),
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4 },
      android: { elevation: 3 },
    }),
  },
  backButton: {
    padding: 8,
    marginRight: 12,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  title: {
    fontSize: getResponsiveValue(18, 20, 22),
    fontWeight: '700',
    color: '#111827',
  },
  content: {
    padding: getResponsiveValue(16, 18, 20),
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: getResponsiveValue(16, 18, 20),
    borderWidth: 1,
    borderColor: '#E5E7EB',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 8 },
      android: { elevation: 4 },
    }),
  },
  name: {
    fontSize: getResponsiveValue(18, 20, 22),
    fontWeight: '700',
    color: '#111827',
    flex: 1,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  badgeText: {
    color: 'white',
    marginLeft: 6,
    fontSize: 12,
    fontWeight: '700',
  },
  section: {
    marginTop: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  value: {
    fontSize: getResponsiveValue(14, 15, 16),
    color: '#111827',
    lineHeight: 20,
    fontWeight: '500',
  },
  emptyText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 24,
  },
});
