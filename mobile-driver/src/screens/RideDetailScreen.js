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
import { colors, shadows, radius } from '../theme/colors';

export default function RideDetailScreen({ navigation, route }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { rideId } = route.params;
  const { updateActiveRide, removeActiveRide } = useDriver();

  const [ride, setRide] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    loadRideDetails();
  }, [rideId]);

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
    const url = Platform.OS === 'ios'
      ? `maps://app?daddr=${lat},${lng}`
      : `google.navigation:q=${lat},${lng}`;
    Linking.openURL(url);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={styles.title}>{t('rides.active')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content}>
        {ride && (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{t('rides.pickup')}</Text>
              <View style={styles.locationRow}>
                <Ionicons name="radio-button-on" size={20} color={colors.success} />
                <Text style={styles.addressText}>{ride.pickup?.address || 'Unknown'}</Text>
              </View>
              <TouchableOpacity
                style={styles.navButton}
                onPress={() => handleNavigate(ride.pickup?.address, ride.pickup?.lat, ride.pickup?.lng)}
              >
                <Ionicons name="navigate" size={18} color={colors.primary} />
                <Text style={styles.navButtonText}>{t('rides.navigation')}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>{t('rides.dropoff')}</Text>
              <View style={styles.locationRow}>
                <Ionicons name="location" size={20} color={colors.destructive} />
                <Text style={styles.addressText}>{ride.dropoff?.address || 'Unknown'}</Text>
              </View>
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
            </View>

            <View style={styles.actionButtons}>
              {ride.status === 'accepted' && (
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
    alignItems: 'center',
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
});
