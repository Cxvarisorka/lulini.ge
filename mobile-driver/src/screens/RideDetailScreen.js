import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { rideAPI } from '../services/api';
import { useDriver } from '../context/DriverContext';
import { useMap } from '../context/MapContext';
import { colors, shadows, radius } from '../theme/colors';

export default function RideDetailScreen({ navigation, route }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { rideId } = route.params;
  const { updateActiveRide, removeActiveRide, invalidateCache } = useDriver();
  const { navigateTo } = useMap();

  const [ride, setRide] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [waitingTimeLeft, setWaitingTimeLeft] = useState(null);
  const [waitingFee, setWaitingFee] = useState(0);

  useEffect(() => {
    loadRideDetails();
  }, [rideId]);

  // Waiting time countdown effect
  useEffect(() => {
    if (!ride || ride.status !== 'driver_arrived' || !ride.waitingExpiresAt) {
      setWaitingTimeLeft(null);
      return;
    }

    const FREE_WAITING_SECONDS = 60; // 1 minute free
    const WAITING_FEE_PER_MINUTE = 0.50;

    const updateWaitingTime = () => {
      const now = new Date();
      const expiresAt = new Date(ride.waitingExpiresAt);
      const arrivalTime = new Date(ride.arrivalTime);
      const timeLeftMs = expiresAt.getTime() - now.getTime();
      const waitedSeconds = (now.getTime() - arrivalTime.getTime()) / 1000;

      if (timeLeftMs <= 0) {
        setWaitingTimeLeft(0);
        return;
      }

      setWaitingTimeLeft(Math.ceil(timeLeftMs / 1000));

      // Calculate waiting fee (after 1 minute free)
      if (waitedSeconds > FREE_WAITING_SECONDS) {
        const paidSeconds = Math.min(waitedSeconds - FREE_WAITING_SECONDS, 120); // Max 2 minutes paid
        const fee = Math.round((paidSeconds / 60) * WAITING_FEE_PER_MINUTE * 100) / 100;
        setWaitingFee(fee);
      } else {
        setWaitingFee(0);
      }
    };

    updateWaitingTime();
    const interval = setInterval(updateWaitingTime, 1000);

    return () => clearInterval(interval);
  }, [ride?.status, ride?.waitingExpiresAt, ride?.arrivalTime]);

  const loadRideDetails = async () => {
    try {
      const response = await rideAPI.getRideById(rideId);
      if (response.data.success) {
        setRide(response.data.data.ride);
      }
    } catch (error) {
      console.log('Error loading ride details:', error);
      Alert.alert(t('common.error'), t('errors.somethingWentWrong'));
    } finally {
      setLoading(false);
    }
  };

  const handleNotifyArrival = async () => {
    setActionLoading(true);
    try {
      const response = await rideAPI.notifyArrival(rideId);
      if (response.data.success) {
        setRide(response.data.data.ride);
        updateActiveRide(rideId, response.data.data.ride);
        Alert.alert(t('common.success'), t('rides.customerNotified'));
      }
    } catch (error) {
      console.log('Error notifying arrival:', error);
      const errorMessage = error.response?.data?.message || t('errors.somethingWentWrong');
      Alert.alert(t('common.error'), errorMessage);
    } finally {
      setActionLoading(false);
    }
  };

  const handleStartRide = async () => {
    setActionLoading(true);
    try {
      const response = await rideAPI.startRide(rideId);
      if (response.data.success) {
        setRide(response.data.data.ride);
        updateActiveRide(rideId, response.data.data.ride);
        Alert.alert(t('common.success'), t('rides.rideStarted'));
      }
    } catch (error) {
      console.log('Error starting ride:', error);
      const errorMessage = error.response?.data?.message || t('errors.somethingWentWrong');
      Alert.alert(t('common.error'), errorMessage);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCompleteRide = async () => {
    if (!ride) return;

    Alert.alert(
      t('rides.completeRide'),
      `${t('rides.confirmComplete')}\n${t('rides.fare')}: $${ride.quote?.totalPrice}`,
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.confirm'),
          onPress: async () => {
            setActionLoading(true);
            try {
              const fare = parseFloat(ride.quote?.totalPrice || 0);
              const response = await rideAPI.completeRide(rideId, fare);
              if (response.data.success) {
                removeActiveRide(rideId);
                invalidateCache(); // Invalidate cache so RidesScreen fetches fresh data
                navigation.goBack();
                Alert.alert(
                  t('common.success'),
                  `${t('rides.rideCompletedSuccess')}\n${t('rides.earned')}: $${fare.toFixed(2)}`
                );
              }
            } catch (error) {
              console.log('Error completing ride:', error);
              const errorMessage = error.response?.data?.message || t('errors.somethingWentWrong');
              Alert.alert(t('common.error'), errorMessage);
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleNavigate = (address, lat, lng) => {
    navigateTo(lat, lng, address, t);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const getRideStatusTitle = () => {
    if (!ride) return t('rides.rideDetails');

    if (ride.status === 'completed') return t('rides.completedRide');
    if (ride.status === 'cancelled') return t('rides.cancelledRide');
    return t('rides.active');
  };

  const isReadOnly = ride && (ride.status === 'completed' || ride.status === 'cancelled');

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={styles.title}>{getRideStatusTitle()}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content}>
        {ride && (
          <>
            {/* Status Badge for completed/cancelled rides */}
            {isReadOnly && (
              <View style={styles.statusCard}>
                <View style={[styles.statusBadgeLarge, { backgroundColor: colors.status[ride.status] + '20' }]}>
                  <Ionicons
                    name={ride.status === 'completed' ? 'checkmark-circle' : 'close-circle'}
                    size={24}
                    color={colors.status[ride.status]}
                  />
                  <Text style={[styles.statusTextLarge, { color: colors.status[ride.status] }]}>
                    {t(`rides.${ride.status}`)}
                  </Text>
                </View>
                {ride.status === 'completed' && ride.fare && (
                  <Text style={styles.completedFare}>
                    {t('rides.earned')}: ${ride.fare.toFixed(2)}
                  </Text>
                )}
                {ride.status === 'cancelled' && ride.cancellationReason && (
                  <Text style={styles.cancelReason}>
                    {t('rides.reason')}: {ride.cancellationReason.replace(/_/g, ' ')}
                  </Text>
                )}
              </View>
            )}

            <View style={styles.card}>
              <Text style={styles.cardTitle}>{t('rides.pickup')}</Text>
              <View style={styles.locationRow}>
                <Ionicons name="radio-button-on" size={20} color={colors.success} />
                <Text style={styles.addressText}>{ride.pickup?.address || 'Unknown'}</Text>
              </View>
              {!isReadOnly && (
                <TouchableOpacity
                  style={styles.navButton}
                  onPress={() => handleNavigate(ride.pickup?.address, ride.pickup?.lat, ride.pickup?.lng)}
                >
                  <Ionicons name="navigate" size={18} color={colors.primary} />
                  <Text style={styles.navButtonText}>{t('rides.navigation')}</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>{t('rides.dropoff')}</Text>
              <View style={styles.locationRow}>
                <Ionicons name="location" size={20} color={colors.destructive} />
                <Text style={styles.addressText}>{ride.dropoff?.address || 'Unknown'}</Text>
              </View>
              {!isReadOnly && (
                <TouchableOpacity
                  style={styles.navButton}
                  onPress={() => handleNavigate(ride.dropoff?.address, ride.dropoff?.lat, ride.dropoff?.lng)}
                >
                  <Ionicons name="navigate" size={18} color={colors.primary} />
                  <Text style={styles.navButtonText}>{t('rides.navigation')}</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>{t('rides.passenger')}</Text>
              <View style={styles.passengerInfo}>
                <View style={styles.passengerDetails}>
                  <Text style={styles.passengerName}>{ride.passengerName || 'Unknown'}</Text>
                  <Text style={styles.passengerPhone}>{ride.passengerPhone || 'No phone'}</Text>
                </View>
                {ride.passengerPhone && (
                  <TouchableOpacity
                    style={styles.contactButton}
                    onPress={() => Linking.openURL(`tel:${ride.passengerPhone}`)}
                  >
                    <Ionicons name="call" size={20} color={colors.primary} />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>{t('rides.rideDetails')}</Text>
              <View style={styles.detailsRow}>
                <Text style={styles.detailLabel}>{t('rides.distance')}:</Text>
                <Text style={styles.detailValue}>{ride.quote?.distanceText || 'N/A'}</Text>
              </View>
              <View style={styles.detailsRow}>
                <Text style={styles.detailLabel}>{t('rides.duration')}:</Text>
                <Text style={styles.detailValue}>{ride.quote?.durationText || 'N/A'}</Text>
              </View>
              <View style={styles.detailsRow}>
                <Text style={styles.detailLabel}>{t('rides.fare')}:</Text>
                <Text style={[styles.detailValue, styles.fareText]}>${ride.quote?.totalPrice || '0'}</Text>
              </View>
              <View style={styles.detailsRow}>
                <Text style={styles.detailLabel}>{t('rides.paymentMethod')}:</Text>
                <Text style={styles.detailValue}>{ride.paymentMethod || 'cash'}</Text>
              </View>
              {ride.rating && (
                <View style={styles.detailsRow}>
                  <Text style={styles.detailLabel}>{t('rides.rating')}:</Text>
                  <View style={styles.ratingContainer}>
                    <Ionicons name="star" size={16} color={colors.warning} />
                    <Text style={styles.detailValue}> {ride.rating.toFixed(1)}</Text>
                  </View>
                </View>
              )}
            </View>

            {/* Waiting Time Card - shown when driver has arrived */}
            {ride.status === 'driver_arrived' && waitingTimeLeft !== null && (
              <View style={[styles.card, styles.waitingCard]}>
                <View style={styles.waitingHeader}>
                  <Ionicons
                    name="time-outline"
                    size={24}
                    color={waitingTimeLeft <= 60 ? colors.destructive : colors.warning}
                  />
                  <Text style={styles.waitingTitle}>{t('rides.waitingForPassenger')}</Text>
                </View>
                <View style={styles.waitingTimeRow}>
                  <Text style={[
                    styles.waitingTimeValue,
                    waitingTimeLeft <= 60 && styles.waitingTimeUrgent
                  ]}>
                    {Math.floor(waitingTimeLeft / 60)}:{(waitingTimeLeft % 60).toString().padStart(2, '0')}
                  </Text>
                  <Text style={styles.waitingTimeLabel}>{t('rides.timeRemaining')}</Text>
                </View>
                <View style={styles.waitingProgressBar}>
                  <View style={[
                    styles.waitingProgressFill,
                    { width: `${(waitingTimeLeft / 180) * 100}%` },
                    waitingTimeLeft <= 60 && styles.waitingProgressUrgent
                  ]} />
                </View>
                <View style={styles.waitingFeeRow}>
                  <Text style={styles.waitingFeeLabel}>
                    {waitingFee > 0 ? t('rides.paidWaiting') : t('rides.freeWaiting')}
                  </Text>
                  {waitingFee > 0 && (
                    <Text style={styles.waitingFeeValue}>+${waitingFee.toFixed(2)}</Text>
                  )}
                </View>
                {waitingTimeLeft <= 60 && (
                  <Text style={styles.waitingWarning}>{t('rides.rideWillCancel')}</Text>
                )}
              </View>
            )}

            {/* Waiting Fee Display - shown after ride started with waiting fee */}
            {ride.waitingFee > 0 && ride.status === 'in_progress' && (
              <View style={[styles.card, styles.waitingFeeCard]}>
                <View style={styles.waitingFeeInfoRow}>
                  <Ionicons name="time" size={20} color={colors.warning} />
                  <Text style={styles.waitingFeeInfoLabel}>{t('rides.waitingFeeAdded')}</Text>
                  <Text style={styles.waitingFeeInfoValue}>+${ride.waitingFee.toFixed(2)}</Text>
                </View>
              </View>
            )}

            {!isReadOnly && (
              <View style={styles.actionButtons}>
                {ride.status === 'accepted' && (
                <TouchableOpacity
                  style={[styles.actionButton, styles.arrivedButton]}
                  onPress={handleNotifyArrival}
                  disabled={actionLoading}
                >
                  {actionLoading ? (
                    <ActivityIndicator color={colors.background} />
                  ) : (
                    <>
                      <Ionicons name="location-sharp" size={20} color={colors.background} />
                      <Text style={styles.actionButtonText}>{t('rides.imHere')}</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}

              {ride.status === 'driver_arrived' && (
                <TouchableOpacity
                  style={[styles.actionButton, styles.startButton]}
                  onPress={handleStartRide}
                  disabled={actionLoading}
                >
                  {actionLoading ? (
                    <ActivityIndicator color={colors.background} />
                  ) : (
                    <>
                      <Ionicons name="play" size={20} color={colors.background} />
                      <Text style={styles.actionButtonText}>{t('rides.startRide')}</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}

              {ride.status === 'in_progress' && (
                <TouchableOpacity
                  style={[styles.actionButton, styles.completeButton]}
                  onPress={handleCompleteRide}
                  disabled={actionLoading}
                >
                  {actionLoading ? (
                    <ActivityIndicator color={colors.background} />
                  ) : (
                    <>
                      <Ionicons name="checkmark" size={20} color={colors.background} />
                      <Text style={styles.actionButtonText}>{t('rides.completeRide')}</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.foreground,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 16,
    marginBottom: 12,
    ...shadows.md,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.mutedForeground,
    marginBottom: 12,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  addressText: {
    flex: 1,
    fontSize: 16,
    color: colors.foreground,
    marginLeft: 12,
  },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  navButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
    marginLeft: 8,
  },
  passengerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  passengerDetails: {
    flex: 1,
  },
  passengerName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: 4,
  },
  passengerPhone: {
    fontSize: 14,
    color: colors.mutedForeground,
  },
  contactButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionButtons: {
    marginTop: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    padding: 16,
    marginBottom: 12,
  },
  arrivedButton: {
    backgroundColor: colors.warning || '#FFA500',
  },
  startButton: {
    backgroundColor: colors.primary,
  },
  completeButton: {
    backgroundColor: colors.success,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.background,
    marginLeft: 8,
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  detailLabel: {
    fontSize: 14,
    color: colors.mutedForeground,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.foreground,
  },
  fareText: {
    fontSize: 16,
    color: colors.primary,
  },
  statusCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 16,
    marginBottom: 12,
    alignItems: 'center',
    ...shadows.md,
  },
  statusBadgeLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: radius.lg,
    gap: 8,
  },
  statusTextLarge: {
    fontSize: 18,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  completedFare: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.success,
    marginTop: 12,
  },
  cancelReason: {
    fontSize: 14,
    color: colors.mutedForeground,
    marginTop: 8,
    textAlign: 'center',
    textTransform: 'capitalize',
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // Waiting time styles
  waitingCard: {
    backgroundColor: colors.warning + '15',
    borderWidth: 1,
    borderColor: colors.warning + '30',
  },
  waitingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  waitingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.foreground,
    marginLeft: 8,
  },
  waitingTimeRow: {
    alignItems: 'center',
    marginBottom: 16,
  },
  waitingTimeValue: {
    fontSize: 48,
    fontWeight: '700',
    color: colors.warning,
  },
  waitingTimeUrgent: {
    color: colors.destructive,
  },
  waitingTimeLabel: {
    fontSize: 14,
    color: colors.mutedForeground,
    marginTop: 4,
  },
  waitingProgressBar: {
    height: 8,
    backgroundColor: colors.secondary,
    borderRadius: radius.full,
    overflow: 'hidden',
    marginBottom: 16,
  },
  waitingProgressFill: {
    height: '100%',
    backgroundColor: colors.warning,
    borderRadius: radius.full,
  },
  waitingProgressUrgent: {
    backgroundColor: colors.destructive,
  },
  waitingFeeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  waitingFeeLabel: {
    fontSize: 14,
    color: colors.mutedForeground,
  },
  waitingFeeValue: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.warning,
  },
  waitingWarning: {
    fontSize: 14,
    color: colors.destructive,
    textAlign: 'center',
    marginTop: 12,
    fontWeight: '500',
  },
  waitingFeeCard: {
    backgroundColor: colors.warning + '10',
    borderWidth: 1,
    borderColor: colors.warning + '20',
  },
  waitingFeeInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  waitingFeeInfoLabel: {
    flex: 1,
    fontSize: 14,
    color: colors.foreground,
    marginLeft: 8,
  },
  waitingFeeInfoValue: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.warning,
  },
});
