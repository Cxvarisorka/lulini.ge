import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Modal,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDriver } from '../context/DriverContext';
import { useSocket } from '../context/SocketContext';
import { rideAPI } from '../services/api';
import { colors, shadows, radius } from '../theme/colors';

export default function RidesScreen({ navigation }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { activeRides, loadActiveRides, addActiveRide } = useDriver();
  const { newRideRequest, clearRideRequest } = useSocket();
  const [refreshing, setRefreshing] = useState(false);
  const [accepting, setAccepting] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadActiveRides();
    setRefreshing(false);
  };

  const handleAcceptRide = async () => {
    if (!newRideRequest) return;

    setAccepting(true);
    try {
      const response = await rideAPI.acceptRide(newRideRequest._id);
      if (response.data.success) {
        addActiveRide(response.data.data.ride);
        clearRideRequest();
        Alert.alert(
          t('rides.rideAccepted'),
          t('rides.navigateToRide'),
          [
            {
              text: t('common.ok'),
              onPress: () => navigation.navigate('RideDetail', { rideId: newRideRequest._id })
            }
          ]
        );
      }
    } catch (error) {
      console.log('Error accepting ride:', error);
      const errorMessage = error.response?.data?.message || t('errors.tryAgain');
      Alert.alert(t('errors.error'), errorMessage);
    } finally {
      setAccepting(false);
    }
  };

  const handleDeclineRide = () => {
    clearRideRequest();
  };

  const renderRideItem = ({ item }) => (
    <TouchableOpacity
      style={styles.rideCard}
      onPress={() => navigation.navigate('RideDetail', { rideId: item._id })}
    >
      <View style={styles.rideHeader}>
        <View style={[styles.statusBadge, { backgroundColor: colors.status[item.status] + '20' }]}>
          <Text style={[styles.statusText, { color: colors.status[item.status] }]}>
            {t(`rides.${item.status}`)}
          </Text>
        </View>
        <Text style={styles.fareText}>${item.quote?.totalPrice?.toFixed(2)}</Text>
      </View>

      <View style={styles.locationRow}>
        <Ionicons name="radio-button-on" size={16} color={colors.success} />
        <Text style={styles.locationText} numberOfLines={1}>
          {item.pickup?.address}
        </Text>
      </View>

      <View style={styles.locationRow}>
        <Ionicons name="location" size={16} color={colors.destructive} />
        <Text style={styles.locationText} numberOfLines={1}>
          {item.dropoff?.address}
        </Text>
      </View>

      <View style={styles.rideFooter}>
        <Text style={styles.distanceText}>{item.quote?.distanceText}</Text>
        <Ionicons name="chevron-forward" size={20} color={colors.mutedForeground} />
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('rides.active')}</Text>
      </View>

      {activeRides.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="car-outline" size={64} color={colors.mutedForeground} />
          <Text style={styles.emptyText}>{t('home.noActiveRides')}</Text>
        </View>
      ) : (
        <FlatList
          data={activeRides}
          renderItem={renderRideItem}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        />
      )}

      {/* New Ride Request Modal */}
      <Modal
        visible={!!newRideRequest}
        animationType="slide"
        transparent={true}
        onRequestClose={handleDeclineRide}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Ionicons name="car" size={40} color={colors.primary} />
              <Text style={styles.modalTitle}>{t('rides.newRequest')}</Text>
            </View>

            {newRideRequest && (
              <>
                <View style={styles.rideInfo}>
                  <View style={styles.locationRow}>
                    <Ionicons name="radio-button-on" size={20} color={colors.success} />
                    <View style={styles.locationTextContainer}>
                      <Text style={styles.locationLabel}>{t('rides.pickup')}</Text>
                      <Text style={styles.locationAddress}>{newRideRequest.pickup?.address}</Text>
                    </View>
                  </View>

                  <View style={styles.locationDivider} />

                  <View style={styles.locationRow}>
                    <Ionicons name="location" size={20} color={colors.destructive} />
                    <View style={styles.locationTextContainer}>
                      <Text style={styles.locationLabel}>{t('rides.dropoff')}</Text>
                      <Text style={styles.locationAddress}>{newRideRequest.dropoff?.address}</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.rideDetails}>
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>{t('rides.distance')}</Text>
                    <Text style={styles.detailValue}>{newRideRequest.quote?.distanceText}</Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>{t('rides.duration')}</Text>
                    <Text style={styles.detailValue}>{newRideRequest.quote?.durationText}</Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>{t('rides.fare')}</Text>
                    <Text style={styles.fareValue}>${newRideRequest.quote?.totalPrice}</Text>
                  </View>
                </View>

                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.declineButton]}
                    onPress={handleDeclineRide}
                    disabled={accepting}
                  >
                    <Ionicons name="close-circle" size={20} color={colors.destructive} />
                    <Text style={styles.declineText}>{t('common.decline')}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionButton, styles.acceptButton]}
                    onPress={handleAcceptRide}
                    disabled={accepting}
                  >
                    {accepting ? (
                      <ActivityIndicator color={colors.background} />
                    ) : (
                      <>
                        <Ionicons name="checkmark-circle" size={20} color={colors.background} />
                        <Text style={styles.acceptText}>{t('common.accept')}</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    padding: 20,
    paddingTop: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.foreground,
  },
  list: {
    padding: 16,
  },
  rideCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 16,
    marginBottom: 12,
    ...shadows.md,
  },
  rideHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  fareText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.foreground,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  locationText: {
    flex: 1,
    fontSize: 14,
    color: colors.foreground,
    marginLeft: 8,
  },
  rideFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  distanceText: {
    fontSize: 12,
    color: colors.mutedForeground,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: colors.mutedForeground,
    marginTop: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    padding: 24,
    paddingBottom: 40,
    ...shadows.lg,
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.foreground,
    marginTop: 12,
  },
  rideInfo: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 16,
    marginBottom: 16,
  },
  locationTextContainer: {
    flex: 1,
    marginLeft: 12,
  },
  locationLabel: {
    fontSize: 12,
    color: colors.mutedForeground,
    marginBottom: 4,
  },
  locationAddress: {
    fontSize: 15,
    color: colors.foreground,
    fontWeight: '500',
  },
  locationDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 12,
  },
  rideDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  detailItem: {
    flex: 1,
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 12,
    color: colors.mutedForeground,
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.foreground,
  },
  fareValue: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.primary,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: radius.lg,
    gap: 8,
  },
  declineButton: {
    backgroundColor: colors.destructive + '15',
  },
  declineText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.destructive,
  },
  acceptButton: {
    backgroundColor: colors.primary,
  },
  acceptText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.background,
  },
});
