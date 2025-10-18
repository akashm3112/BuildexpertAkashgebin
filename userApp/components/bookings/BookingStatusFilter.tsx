import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';

interface BookingStatusFilterProps {
  selectedStatus: string;
  onSelectStatus: (status: string) => void;
}

export default function BookingStatusFilter({ 
  selectedStatus, 
  onSelectStatus 
}: BookingStatusFilterProps) {
  const statuses = [
    { id: 'all', label: 'All' },
    { id: 'upcoming', label: 'Upcoming' },
    { id: 'completed', label: 'Completed' },
    { id: 'cancelled', label: 'Cancelled' },
  ];

  return (
    <View style={styles.container}>
      {statuses.map((status) => (
        <TouchableOpacity
          key={status.id}
          style={[
            styles.filterOption,
            selectedStatus === status.id && styles.selectedOption
          ]}
          onPress={() => onSelectStatus(status.id)}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.filterLabel,
              selectedStatus === status.id && styles.selectedLabel
            ]}
          >
            {status.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 4,
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
  filterOption: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
  },
  selectedOption: {
    backgroundColor: '#EFF6FF',
  },
  filterLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 14,
    color: '#64748B',
  },
  selectedLabel: {
    color: '#3B82F6',
  },
});