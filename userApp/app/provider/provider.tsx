import { useLocalSearchParams } from 'expo-router';

export default function ProviderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  //code pending...
} 