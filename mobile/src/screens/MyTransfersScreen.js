import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { transferAPI } from '../services/api';

const STATUS_COLORS = {
  pending: { bg: '#fef3c7', text: '#d97706' },
  confirmed: { bg: '#dbeafe', text: '#2563eb' },
  completed: { bg: '#dcfce7', text: '#16a34a' },
  cancelled: { bg: '#fee2e2', text: '#dc2626' },
};

const VEHICLE_ICONS = {
  economy: 'car-outline',
  business: 'car-sport-outline',
  firstClass: 'car',
  van: 'bus-outline',
  minibus: 'bus',
};

export default function MyTransfersScreen({ navigation }) {
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchTransfers = async () => {
    try {
      const response = await transferAPI.getMyTransfers();
      if (response.data.success) {
        setTransfers(response.data.data.transfers || []);
      }
    } catch (error) {
      console.log('Error fetching transfers:', error.message);
      Alert.alert('Error', 'Failed to load transfers');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Refresh when screen is focused
  useFocusEffect(
    useCallback(() => {
      fetchTransfers();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchTransfers();
  };

  const handleCancel = (transfer) => {
    if (transfer.status !== 'pending' && transfer.status !== 'confirmed') {
      Alert.alert('Cannot Cancel', 'This transfer cannot be cancelled.');
      return;
    }

    Alert.alert(
      'Cancel Transfer',
      'Are you sure you want to cancel this transfer?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await transferAPI.cancel(transfer._id);
              if (response.data.success) {
                fetchTransfers();
                Alert.alert('Success', 'Transfer cancelled successfully');
              }
            } catch (error) {
              Alert.alert('Error', error.response?.data?.message || 'Failed to cancel transfer');
            }
          },
        },
      ]
    );
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatTime = (timeString) => {
    if (!timeString) return '';
    const [hours, minutes] = timeString.split(':');
    const h = parseInt(hours);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour = h % 12 || 12;
    return `${hour}:${minutes} ${ampm}`;
  };

  const renderTransferCard = ({ item }) => {
    const statusStyle = STATUS_COLORS[item.status] || STATUS_COLORS.pending;

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.navigate('TransferDetail', { transfer: item })}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
            <Text style={[styles.statusText, { color: statusStyle.text }]}>
              {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
            </Text>
          </View>
          <View style={styles.tripTypeBadge}>
            <Text style={styles.tripTypeText}>
              {item.tripType === 'roundTrip' ? 'Round Trip' : 'One Way'}
            </Text>
          </View>
        </View>

        <View style={styles.routeContainer}>
          <View style={styles.routePoint}>
            <View style={[styles.routeDot, { backgroundColor: '#16a34a' }]} />
            <Text style={styles.routeAddress} numberOfLines={1}>
              {item.pickupAddress}
            </Text>
          </View>
          <View style={styles.routeLine} />
          <View style={styles.routePoint}>
            <View style={[styles.routeDot, { backgroundColor: '#dc2626' }]} />
            <Text style={styles.routeAddress} numberOfLines={1}>
              {item.dropoffAddress}
            </Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.cardDetails}>
          <View style={styles.detailItem}>
            <Ionicons name="calendar-outline" size={16} color="#666" />
            <Text style={styles.detailText}>{formatDate(item.date)}</Text>
          </View>
          <View style={styles.detailItem}>
            <Ionicons name="time-outline" size={16} color="#666" />
            <Text style={styles.detailText}>{formatTime(item.time)}</Text>
          </View>
          <View style={styles.detailItem}>
            <Ionicons name={VEHICLE_ICONS[item.vehicle] || 'car-outline'} size={16} color="#666" />
            <Text style={styles.detailText}>
              {item.vehicle?.charAt(0).toUpperCase() + item.vehicle?.slice(1)}
            </Text>
          </View>
        </View>

        <View style={styles.cardFooter}>
          <View style={styles.priceContainer}>
            <Text style={styles.priceLabel}>Total</Text>
            <Text style={styles.priceValue}>
              ${item.quote?.totalPrice?.toFixed(2) || '0.00'}
            </Text>
          </View>

          {(item.status === 'pending' || item.status === 'confirmed') && (
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => handleCancel(item)}
            >
              <Ionicons name="close-circle-outline" size={20} color="#dc2626" />
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="car-outline" size={64} color="#ccc" />
      <Text style={styles.emptyTitle}>No Transfers Yet</Text>
      <Text style={styles.emptySubtitle}>
        Your transfer bookings will appear here
      </Text>
      <TouchableOpacity
        style={styles.emptyButton}
        onPress={() => navigation.navigate('BookTransfer')}
      >
        <Text style={styles.emptyButtonText}>Book Your First Transfer</Text>
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={transfers}
        renderItem={renderTransferCard}
        keyExtractor={(item) => item._id}
        contentContainerStyle={[
          styles.listContent,
          transfers.length === 0 && styles.emptyList,
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#2563eb']}
            tintColor="#2563eb"
          />
        }
        ListEmptyComponent={renderEmptyState}
        showsVerticalScrollIndicator={false}
      />

      {transfers.length > 0 && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => navigation.navigate('BookTransfer')}
        >
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  listContent: {
    padding: 16,
  },
  emptyList: {
    flex: 1,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  tripTypeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
  },
  tripTypeText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  routeContainer: {
    marginBottom: 16,
  },
  routePoint: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  routeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 12,
  },
  routeAddress: {
    flex: 1,
    fontSize: 14,
    color: '#1a1a1a',
    fontWeight: '500',
  },
  routeLine: {
    width: 2,
    height: 20,
    backgroundColor: '#e0e0e0',
    marginLeft: 4,
    marginVertical: 4,
  },
  divider: {
    height: 1,
    backgroundColor: '#f0f0f0',
    marginBottom: 12,
  },
  cardDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailText: {
    fontSize: 13,
    color: '#666',
    marginLeft: 4,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  priceLabel: {
    fontSize: 12,
    color: '#666',
    marginRight: 4,
  },
  priceValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
  },
  cancelText: {
    fontSize: 14,
    color: '#dc2626',
    fontWeight: '500',
    marginLeft: 4,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1a1a1a',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  emptyButton: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#2563eb',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
});
