import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { transferAPI } from '../services/api';

const STATUS_COLORS = {
  pending: { bg: '#fef3c7', text: '#d97706' },
  confirmed: { bg: '#dbeafe', text: '#2563eb' },
  completed: { bg: '#dcfce7', text: '#16a34a' },
  cancelled: { bg: '#fee2e2', text: '#dc2626' },
};

const VEHICLE_LABELS = {
  economy: 'Economy',
  business: 'Business',
  firstClass: 'First Class',
  van: 'Van',
  minibus: 'Minibus',
};

export default function TransferDetailScreen({ route, navigation }) {
  const { transfer } = route.params;
  const statusStyle = STATUS_COLORS[transfer.status] || STATUS_COLORS.pending;

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
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

  const handleCancel = () => {
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
                Alert.alert('Success', 'Transfer cancelled successfully', [
                  { text: 'OK', onPress: () => navigation.goBack() },
                ]);
              }
            } catch (error) {
              Alert.alert('Error', error.response?.data?.message || 'Failed to cancel transfer');
            }
          },
        },
      ]
    );
  };

  const handleCall = () => {
    Linking.openURL(`tel:${transfer.phone}`);
  };

  const handleEmail = () => {
    Linking.openURL(`mailto:${transfer.email}`);
  };

  const openMaps = (address, lat, lng) => {
    const url = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    Linking.openURL(url);
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Status Header */}
      <View style={styles.statusHeader}>
        <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
          <Text style={[styles.statusText, { color: statusStyle.text }]}>
            {transfer.status.charAt(0).toUpperCase() + transfer.status.slice(1)}
          </Text>
        </View>
        <Text style={styles.bookingId}>
          Booking #{transfer._id?.slice(-8).toUpperCase()}
        </Text>
      </View>

      {/* Route Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Route Details</Text>

        <TouchableOpacity
          style={styles.locationItem}
          onPress={() => openMaps(transfer.pickupAddress, transfer.pickup?.lat, transfer.pickup?.lng)}
        >
          <View style={styles.locationIcon}>
            <Ionicons name="location" size={24} color="#16a34a" />
          </View>
          <View style={styles.locationContent}>
            <Text style={styles.locationLabel}>Pickup</Text>
            <Text style={styles.locationAddress}>{transfer.pickupAddress}</Text>
          </View>
          <Ionicons name="navigate-outline" size={20} color="#999" />
        </TouchableOpacity>

        <View style={styles.routeConnector}>
          <View style={styles.routeLine} />
          <View style={styles.routeInfo}>
            <Text style={styles.routeInfoText}>
              {transfer.quote?.distanceText} • {transfer.quote?.durationText}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.locationItem}
          onPress={() => openMaps(transfer.dropoffAddress, transfer.dropoff?.lat, transfer.dropoff?.lng)}
        >
          <View style={styles.locationIcon}>
            <Ionicons name="location" size={24} color="#dc2626" />
          </View>
          <View style={styles.locationContent}>
            <Text style={styles.locationLabel}>Dropoff</Text>
            <Text style={styles.locationAddress}>{transfer.dropoffAddress}</Text>
          </View>
          <Ionicons name="navigate-outline" size={20} color="#999" />
        </TouchableOpacity>
      </View>

      {/* Trip Details Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Trip Details</Text>

        <View style={styles.detailRow}>
          <View style={styles.detailItem}>
            <Ionicons name="swap-horizontal" size={20} color="#666" />
            <Text style={styles.detailLabel}>Trip Type</Text>
            <Text style={styles.detailValue}>
              {transfer.tripType === 'roundTrip' ? 'Round Trip' : 'One Way'}
            </Text>
          </View>
        </View>

        <View style={styles.detailRow}>
          <View style={styles.detailItem}>
            <Ionicons name="calendar" size={20} color="#666" />
            <Text style={styles.detailLabel}>Date</Text>
            <Text style={styles.detailValue}>{formatDate(transfer.date)}</Text>
          </View>
        </View>

        <View style={styles.detailRow}>
          <View style={styles.detailItem}>
            <Ionicons name="time" size={20} color="#666" />
            <Text style={styles.detailLabel}>Time</Text>
            <Text style={styles.detailValue}>{formatTime(transfer.time)}</Text>
          </View>
        </View>

        {transfer.tripType === 'roundTrip' && transfer.returnDate && (
          <>
            <View style={styles.detailRow}>
              <View style={styles.detailItem}>
                <Ionicons name="calendar-outline" size={20} color="#666" />
                <Text style={styles.detailLabel}>Return Date</Text>
                <Text style={styles.detailValue}>{formatDate(transfer.returnDate)}</Text>
              </View>
            </View>
            <View style={styles.detailRow}>
              <View style={styles.detailItem}>
                <Ionicons name="time-outline" size={20} color="#666" />
                <Text style={styles.detailLabel}>Return Time</Text>
                <Text style={styles.detailValue}>{formatTime(transfer.returnTime)}</Text>
              </View>
            </View>
          </>
        )}

        <View style={styles.divider} />

        <View style={styles.detailGrid}>
          <View style={styles.gridItem}>
            <Ionicons name="people" size={24} color="#2563eb" />
            <Text style={styles.gridValue}>{transfer.passengers}</Text>
            <Text style={styles.gridLabel}>Passengers</Text>
          </View>
          <View style={styles.gridItem}>
            <Ionicons name="briefcase" size={24} color="#2563eb" />
            <Text style={styles.gridValue}>{transfer.luggage}</Text>
            <Text style={styles.gridLabel}>Luggage</Text>
          </View>
          <View style={styles.gridItem}>
            <Ionicons name="car" size={24} color="#2563eb" />
            <Text style={styles.gridValue}>{VEHICLE_LABELS[transfer.vehicle] || transfer.vehicle}</Text>
            <Text style={styles.gridLabel}>Vehicle</Text>
          </View>
        </View>

        {transfer.flightNumber && (
          <View style={styles.flightInfo}>
            <Ionicons name="airplane" size={20} color="#666" />
            <Text style={styles.flightLabel}>Flight:</Text>
            <Text style={styles.flightNumber}>{transfer.flightNumber}</Text>
          </View>
        )}
      </View>

      {/* Contact Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Contact Information</Text>

        <View style={styles.contactRow}>
          <View style={styles.contactInfo}>
            <Text style={styles.contactName}>{transfer.name}</Text>
            <Text style={styles.contactDetail}>{transfer.email}</Text>
            <Text style={styles.contactDetail}>{transfer.phone}</Text>
          </View>
          <View style={styles.contactActions}>
            <TouchableOpacity style={styles.contactButton} onPress={handleCall}>
              <Ionicons name="call" size={20} color="#16a34a" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.contactButton} onPress={handleEmail}>
              <Ionicons name="mail" size={20} color="#2563eb" />
            </TouchableOpacity>
          </View>
        </View>

        {transfer.notes && (
          <View style={styles.notesSection}>
            <Text style={styles.notesLabel}>Notes</Text>
            <Text style={styles.notesText}>{transfer.notes}</Text>
          </View>
        )}
      </View>

      {/* Price Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Pricing</Text>

        <View style={styles.priceRow}>
          <Text style={styles.priceLabel}>Base Price</Text>
          <Text style={styles.priceValue}>${transfer.quote?.basePrice?.toFixed(2)}</Text>
        </View>

        <View style={styles.priceDivider} />

        <View style={styles.priceRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>${transfer.quote?.totalPrice?.toFixed(2)}</Text>
        </View>
      </View>

      {/* Cancel Button */}
      {(transfer.status === 'pending' || transfer.status === 'confirmed') && (
        <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
          <Ionicons name="close-circle-outline" size={24} color="#dc2626" />
          <Text style={styles.cancelButtonText}>Cancel Transfer</Text>
        </TouchableOpacity>
      )}

      <View style={styles.bottomPadding} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  statusHeader: {
    backgroundColor: '#fff',
    padding: 20,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  statusBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 8,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600',
  },
  bookingId: {
    fontSize: 14,
    color: '#666',
  },
  card: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 16,
  },
  locationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  locationIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  locationContent: {
    flex: 1,
  },
  locationLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
  },
  locationAddress: {
    fontSize: 15,
    color: '#1a1a1a',
    fontWeight: '500',
  },
  routeConnector: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 20,
    paddingVertical: 4,
  },
  routeLine: {
    width: 2,
    height: 30,
    backgroundColor: '#e0e0e0',
  },
  routeInfo: {
    marginLeft: 30,
  },
  routeInfoText: {
    fontSize: 13,
    color: '#666',
  },
  detailRow: {
    marginBottom: 12,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 14,
    color: '#666',
    marginLeft: 12,
    flex: 1,
  },
  detailValue: {
    fontSize: 14,
    color: '#1a1a1a',
    fontWeight: '500',
  },
  divider: {
    height: 1,
    backgroundColor: '#f0f0f0',
    marginVertical: 16,
  },
  detailGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  gridItem: {
    alignItems: 'center',
  },
  gridValue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
    marginTop: 8,
    marginBottom: 4,
  },
  gridLabel: {
    fontSize: 12,
    color: '#666',
  },
  flightInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    padding: 12,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
  },
  flightLabel: {
    fontSize: 14,
    color: '#666',
    marginLeft: 8,
  },
  flightNumber: {
    fontSize: 14,
    color: '#1a1a1a',
    fontWeight: '600',
    marginLeft: 4,
  },
  contactRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  contactDetail: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  contactActions: {
    flexDirection: 'row',
  },
  contactButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  notesSection: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
  },
  notesLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  notesText: {
    fontSize: 14,
    color: '#1a1a1a',
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  priceLabel: {
    fontSize: 14,
    color: '#666',
  },
  priceValue: {
    fontSize: 14,
    color: '#1a1a1a',
  },
  priceDivider: {
    height: 1,
    backgroundColor: '#f0f0f0',
    marginVertical: 12,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  totalValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2563eb',
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fef2f2',
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#dc2626',
    marginLeft: 8,
  },
  bottomPadding: {
    height: 32,
  },
});
