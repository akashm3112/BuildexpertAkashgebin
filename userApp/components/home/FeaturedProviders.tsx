import React, { useEffect, useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  Image, 
  TouchableOpacity, 
  ScrollView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Star } from 'lucide-react-native';
import { API_BASE_URL } from '@/constants/api';
import { router } from 'expo-router';

const DUMMY_PROVIDERS = [
  {
    id: 'dummy-1',
    name: 'John Smith',
    specialty: 'Plumber',
    rating: 4.8,
    reviews: 124,
    price: '₹500/hr',
    verified: true,
    image: 'https://images.pexels.com/photos/8961127/pexels-photo-8961127.jpeg?auto=compress&cs=tinysrgb&w=600',
    category: 'plumber',
  },
  {
    id: 'dummy-2',
    name: 'Mike Johnson',
    specialty: 'Painter',
    rating: 4.7,
    reviews: 98,
    price: '₹450/hr',
    verified: true,
    image: 'https://images.pexels.com/photos/8961367/pexels-photo-8961367.jpeg?auto=compress&cs=tinysrgb&w=600',
    category: 'painting-cleaning',
  },
  {
    id: 'dummy-3',
    name: 'Robert Davis',
    specialty: 'Civil Engineer',
    rating: 4.9,
    reviews: 156,
    price: '₹1200/hr',
    verified: true,
    image: 'https://images.pexels.com/photos/8961382/pexels-photo-8961382.jpeg?auto=compress&cs=tinysrgb&w=600',
    category: 'civil-engineer',
  },
];

function shuffleArray(array: any[]) {
  return array
    .map((a) => ({ sort: Math.random(), value: a }))
    .sort((a, b) => a.sort - b.sort)
    .map((a) => a.value);
}

export default function FeaturedProviders() {
  const [providers, setProviders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromDb, setFromDb] = useState(false);

  useEffect(() => {
    const fetchProviders = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE_URL}/api/public/featured-providers`);
        const data = await res.json();
        if (data.status === 'success' && Array.isArray(data.data.providers) && data.data.providers.length > 0) {
          const processed = data.data.providers.map((p: any) => {
            let workImages: string[] = [];
            if (p.working_proof_urls) {
              if (Array.isArray(p.working_proof_urls)) {
                workImages = p.working_proof_urls;
              } else {
                try {
                  workImages = JSON.parse(p.working_proof_urls);
                } catch {
                  workImages = [];
                }
              }
            }
            return {
              id: p.provider_service_id,
              name: p.full_name,
              specialty: p.service_name,
              rating: p.averageRating || 0,
              reviews: p.totalReviews || 0,
              price: p.pricing?.displayPrice || 'Price on request',
              verified: true,
              image: workImages[0] || p.profile_pic_url || 'https://images.pexels.com/photos/1216589/pexels-photo-1216589.jpeg?auto=compress&cs=tinysrgb&w=600',
              providerServiceId: p.provider_service_id,
              serviceId: p.service_id,
            };
          });
          setProviders(shuffleArray(processed));
          setFromDb(true);
        } else {
          setProviders(shuffleArray(DUMMY_PROVIDERS));
          setFromDb(false);
        }
      } catch (e) {
        setProviders(shuffleArray(DUMMY_PROVIDERS));
        setFromDb(false);
      } finally {
        setLoading(false);
      }
    };
    fetchProviders();
  }, []);

  const handlePress = (provider: any) => {
    if (fromDb) {
      router.push(`/booking/${provider.id}`);
    } else {
      // For dummy, go to the service category booking screen
      router.push(`/services/${provider.category}`);
    }
  };

  if (loading) {
    return (
      <View style={[styles.wrapper, { minHeight: 180, justifyContent: 'center', alignItems: 'center' }]}> 
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.container}
      >
        {providers.map((provider) => (
          <TouchableOpacity 
            key={provider.id} 
            style={styles.providerCard}
            activeOpacity={0.8}
            onPress={() => handlePress(provider)}
          >
            <Image 
              source={{ uri: provider.image }} 
              style={styles.providerImage} 
            />
            <View style={styles.providerInfo}>
              <View style={styles.nameRow}>
                <Text style={styles.providerName}>{provider.name}</Text>
                {provider.verified && (
                  <View style={styles.verifiedBadge}>
                    <Text style={styles.verifiedText}>Verified</Text>
                  </View>
                )}
              </View>
              <Text style={styles.specialty}>{provider.specialty}</Text>
              <View style={styles.ratingRow}>
                <Star size={14} color="#F59E0B" fill="#F59E0B" />
                <Text style={styles.rating}>
                  {fromDb
                    ? (provider.rating === 0 ? '0.0' : (provider.rating ? provider.rating.toFixed(1) : 'N/A'))
                    : (provider.rating ? provider.rating.toFixed(1) : 'N/A')}
                </Text>
                <Text style={styles.reviews}>({provider.reviews})</Text>
              </View>
              <Text style={styles.price}>{provider.price}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 0,
    paddingBottom: 0,
  },
  container: {
    paddingRight: 20,
  },
  providerCard: {
    width: 260,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginRight: 16,
    overflow: 'hidden',
    height: 180,
    ...Platform.select({
      ios: {
        shadowColor: '#CBD5E1',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
      web: {
        boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.05)',
      },
    }),
  },
  providerImage: {
    width: '100%',
    height: 90,
  },
  providerInfo: {
    padding: 12,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  providerName: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
    color: '#1E293B',
  },
  verifiedBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  verifiedText: {
    fontFamily: 'Inter-Medium',
    fontSize: 10,
    color: '#3B82F6',
  },
  specialty: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: '#64748B',
    marginBottom: 8,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  rating: {
    fontFamily: 'Inter-Medium',
    fontSize: 14,
    color: '#1E293B',
    marginLeft: 4,
  },
  reviews: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: '#94A3B8',
    marginLeft: 4,
  },
  price: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
    color: '#3B82F6',
  },
});