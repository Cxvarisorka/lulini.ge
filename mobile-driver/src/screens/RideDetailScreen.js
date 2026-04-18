import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Modal,
  TextInput,
} from 'react-native';
import MapView from '../components/map/MapViewWrapper';
import Marker from '../components/map/MarkerWrapper';
import Polyline from '../components/map/PolylineWrapper';
import { markerImages } from '../components/map/markerImages';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { safeFitToCoordinates } from '../utils/mapSafety';

import { rideAPI } from '../services/api';
import { getDirections } from '../services/googleMaps';
import { useDriver } from '../context/DriverContext';
import { useSocket } from '../context/SocketContext';
import { useMap } from '../context/MapContext';
import { useLocation } from '../context/LocationContext';
import { colors, shadows, radius, spacing, useTypography } from '../theme/colors';
import { haversineKm } from '../utils/distance';

const PROXIMITY_THRESHOLD_KM = 0.5; // 500m — must be within this to click arrival/complete buttons

const STATUS_COLORS = {
  pending: colors.status.pending,
  accepted: colors.status.accepted,
  driver_arrived: colors.status.driver_arrived,
  in_progress: colors.status.in_progress,
  completed: colors.status.completed,
  cancelled: colors.status.cancelled,
};

export default function RideDetailScreen({ navigation, route }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { rideId } = route.params;
  const { updateActiveRide, removeActiveRide, invalidateCache } = useDriver();
  const { socket } = useSocket();
  const { navigateTo, isBuiltinMap } = useMap();
  const { location, setActiveRide } = useLocation();

  const typography = useTypography();
  const styles = useMemo(() => createStyles(typography), [typography]);

  const [ride, setRide] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [waitingTimeLeft, setWaitingTimeLeft] = useState(null);
  const [waitingFee, setWaitingFee] = useState(0);
  const [polylineCoords, setPolylineCoords] = useState([]);
  const [distanceToTarget, setDistanceToTarget] = useState(null); // km
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [ratingValue, setRatingValue] = useState(0);
  const [ratingReview, setRatingReview] = useState('');
  const [ratingSubmitting, setRatingSubmitting] = useState(false);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const cancelledHandledRef = useRef(false);
  const mapRef = useRef(null);
  const hasFitted = useRef(false);

  useEffect(() => {
    loadRideDetails();
  }, [rideId]);

  // Fetch route polyline when ride data is available
  useEffect(() => {
    if (!ride?.pickup?.lat || !ride?.dropoff?.lat) return;
    let mounted = true;
    (async () => {
      try {
        const result = await getDirections(
          { latitude: ride.pickup.lat, longitude: ride.pickup.lng },
          { latitude: ride.dropoff.lat, longitude: ride.dropoff.lng },
        );
        if (result?.polyline && mounted) {
          const coords = result.polyline.map(p => ({
            latitude: Array.isArray(p) ? p[0] : p.latitude,
            longitude: Array.isArray(p) ? p[1] : p.longitude,
          }));
          setPolylineCoords(coords);
        }
      } catch (e) {
        if (__DEV__) console.warn('[RideDetail] Failed to fetch route:', e.message);
      }
    })();
    return () => { mounted = false; };
  }, [ride?.pickup?.lat, ride?.dropoff?.lat]);

  // Fit map to markers
  const fitMapToMarkers = useCallback(() => {
    if (hasFitted.current || !mapRef.current || !ride) return;
    const coords = [];
    if (location) coords.push({ latitude: location.latitude, longitude: location.longitude });
    if (ride.pickup?.lat) coords.push({ latitude: ride.pickup.lat, longitude: ride.pickup.lng });
    if (ride.dropoff?.lat) coords.push({ latitude: ride.dropoff.lat, longitude: ride.dropoff.lng });
    ride.stops?.forEach(s => {
      if (s.lat) coords.push({ latitude: s.lat, longitude: s.lng });
    });
    if (coords.length >= 2) {
      hasFitted.current = true;
      safeFitToCoordinates(mapRef, coords, {
        edgePadding: { top: 60, right: 60, bottom: 60, left: 60 },
        animated: false,
      });
    }
  }, [ride, location]);

  // [C5 FIX] Wire up setActiveRide when ride data is loaded/changes
  useEffect(() => {
    if (ride && ['accepted', 'driver_arrived', 'in_progress'].includes(ride.status)) {
      setActiveRide(ride);
    }
    return () => {
      // Clear active ride when leaving detail screen (unless ride is still active —
      // DriverContext handles the persistent active ride tracking)
      if (ride && ['completed', 'cancelled'].includes(ride.status)) {
        setActiveRide(null);
      }
    };
  }, [ride?.status]);

  // Listen for passenger cancelling this ride
  useEffect(() => {
    if (!socket || !rideId) return;
    const handleCancelled = (cancelledRide) => {
      const cancelledId = cancelledRide?._id || cancelledRide?.rideId;
      if (cancelledId && cancelledId !== rideId) return;
      if (cancelledHandledRef.current) return;
      cancelledHandledRef.current = true;
      setActiveRide(null);
      Alert.alert(
        t('rides.rideCancelled'),
        t('rides.passengerCancelledRide'),
        [{ text: t('common.ok'), onPress: () => navigation.goBack() }]
      );
    };

    // [M7 FIX] Listen for live ride status updates so UI stays in sync
    const handleRideUpdated = (updatedRide) => {
      if (!updatedRide?._id || updatedRide._id !== rideId) return;
      setRide(updatedRide);
      updateActiveRide(rideId, updatedRide);
    };
    const handleRideCompleted = (data) => {
      const completedId = data?._id || data?.rideId;
      if (completedId && completedId !== rideId) return;
      setActiveRide(null);
      loadRideDetails(); // Reload to get final fare/data
    };

    socket.on('ride:cancelled', handleCancelled);
    socket.on('ride:updated', handleRideUpdated);
    socket.on('ride:completed', handleRideCompleted);

    return () => {
      socket.off('ride:cancelled', handleCancelled);
      socket.off('ride:updated', handleRideUpdated);
      socket.off('ride:completed', handleRideCompleted);
    };
  }, [socket, rideId, navigation, t]);

  // Waiting time countdown
  useEffect(() => {
    if (!ride || ride.status !== 'driver_arrived' || !ride.waitingExpiresAt) {
      setWaitingTimeLeft(null);
      return;
    }
    const FREE_WAITING_SECONDS = 60;
    const WAITING_FEE_PER_MINUTE = 0.50;
    const updateWaitingTime = () => {
      const now = new Date();
      const expiresAt = new Date(ride.waitingExpiresAt);
      const arrivalTime = new Date(ride.arrivalTime);
      const timeLeftMs = expiresAt.getTime() - now.getTime();
      const waitedSeconds = (now.getTime() - arrivalTime.getTime()) / 1000;
      if (timeLeftMs <= 0) { setWaitingTimeLeft(0); return; }
      setWaitingTimeLeft(Math.ceil(timeLeftMs / 1000));
      if (waitedSeconds > FREE_WAITING_SECONDS) {
        const paidSeconds = Math.min(waitedSeconds - FREE_WAITING_SECONDS, 120);
        setWaitingFee(Math.round((paidSeconds / 60) * WAITING_FEE_PER_MINUTE * 100) / 100);
      } else {
        setWaitingFee(0);
      }
    };
    updateWaitingTime();
    const interval = setInterval(updateWaitingTime, 1000);
    return () => clearInterval(interval);
  }, [ride?.status, ride?.waitingExpiresAt, ride?.arrivalTime]);

  // Calculate distance to target (pickup for accepted, dropoff for in_progress)
  useEffect(() => {
    if (!ride || !location) {
      setDistanceToTarget(null);
      return;
    }
    let target = null;
    if (ride.status === 'accepted' && ride.pickup?.lat) {
      target = ride.pickup;
    } else if (ride.status === 'in_progress' && ride.dropoff?.lat) {
      target = ride.dropoff;
    }
    if (!target) {
      setDistanceToTarget(null);
      return;
    }
    const dist = haversineKm(location.latitude, location.longitude, target.lat, target.lng);
    setDistanceToTarget(dist);
  }, [ride?.status, ride?.pickup?.lat, ride?.dropoff?.lat, location?.latitude, location?.longitude]);

  const isNearTarget = distanceToTarget !== null && distanceToTarget <= PROXIMITY_THRESHOLD_KM;
  const distanceMeters = distanceToTarget !== null ? Math.round(distanceToTarget * 1000) : null;

  const loadRideDetails = async () => {
    try {
      const response = await rideAPI.getRideById(rideId);
      if (response.data.success) setRide(response.data.data.ride);
    } catch {
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
      Alert.alert(t('common.error'), error.response?.data?.message || t('errors.somethingWentWrong'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleStartRide = async () => {
    setActionLoading(true);
    try {
      const response = await rideAPI.startRide(rideId);
      if (response.data.success) {
        const startedRide = response.data.data.ride;
        setRide(startedRide);
        updateActiveRide(rideId, startedRide);
        // [C5 FIX] Update GPS accuracy for active ride
        setActiveRide(startedRide);
        Alert.alert(t('common.success'), t('rides.rideStarted'));
      }
    } catch (error) {
      Alert.alert(t('common.error'), error.response?.data?.message || t('errors.somethingWentWrong'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleCompleteRide = async () => {
    if (!ride) return;
    Alert.alert(
      t('rides.completeRide'),
      `${t('rides.confirmComplete')}\n${t('rides.fare')}: ${ride.quote?.totalPrice} ₾`,
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
                const completedRide = response.data.data.ride;
                setRide(completedRide);
                removeActiveRide(rideId);
                invalidateCache();
                // [C5 FIX] Revert to idle GPS accuracy
                setActiveRide(null);
                const finalFare = completedRide.fare ?? fare;
                navigation.goBack();
                Alert.alert(t('common.success'), `${t('rides.rideCompletedSuccess')}\n${t('rides.earned')}: ${finalFare.toFixed(2)} ₾`);
              }
            } catch (error) {
              Alert.alert(t('common.error'), error.response?.data?.message || t('errors.somethingWentWrong'));
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleSubmitRating = async () => {
    if (ratingValue === 0) return;
    setRatingSubmitting(true);
    try {
      await rideAPI.reviewPassenger(rideId, ratingValue, ratingReview.trim());
      setRatingSubmitted(true);
      setShowRatingModal(false);
      Alert.alert(t('common.success'), t('rating.ratingSubmitted'));
    } catch {
      Alert.alert(t('common.error'), t('errors.somethingWentWrong'));
    } finally {
      setRatingSubmitting(false);
    }
  };

  const handleNavigate = (address, lat, lng) => {
    if (isBuiltinMap) {
      navigation.navigate('Navigation', {
        destination: { latitude: lat, longitude: lng, address },
        origin: location ? { latitude: location.latitude, longitude: location.longitude } : null,
        ride,
      });
    } else {
      navigateTo(lat, lng, address, t);
    }
  };

  const getStatusColor = (status) => STATUS_COLORS[status] || colors.mutedForeground;

  const formatDate = (dateString) => {
    if (!dateString) return '—';
    const date = new Date(dateString);
    // Map i18n language codes to BCP 47 locale tags for toLocaleDateString.
    // Georgian ('ka') maps to 'ka-GE'; fall back to the device default for everything else.
    const localeMap = { ka: 'ka-GE', en: 'en-US' };
    const locale = localeMap[i18n.language] ?? undefined;
    return date.toLocaleDateString(locale, {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const formatDuration = (startTime, endTime) => {
    if (!startTime || !endTime) return null;
    const diff = Math.round((new Date(endTime) - new Date(startTime)) / 60000);
    if (diff < 1) return `< 1 ${t('rides.min')}`;
    return `${diff} ${t('rides.min')}`;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!ride) return null;

  const isReadOnly = ride.status === 'completed' || ride.status === 'cancelled';
  const actualDuration = formatDuration(ride.startTime, ride.endTime);

  const initialRegion = ride.pickup?.lat ? {
    latitude: (ride.pickup.lat + (ride.dropoff?.lat || ride.pickup.lat)) / 2,
    longitude: (ride.pickup.lng + (ride.dropoff?.lng || ride.pickup.lng)) / 2,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  } : {
    latitude: 41.6938, longitude: 44.8015,
    latitudeDelta: 0.05, longitudeDelta: 0.05,
  };

  return (
    <View style={styles.container}>
      {/* Back button overlay on map */}
      <TouchableOpacity
        style={[styles.backButtonOverlay, { top: insets.top + 8 }]}
        onPress={() => navigation.goBack()}
        accessibilityRole="button"
        accessibilityLabel={t('common.back') || 'Go back'}
      >
        <Ionicons name="arrow-back" size={22} color={colors.foreground} />
      </TouchableOpacity>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Map */}
        <View style={styles.mapContainer}>
          <MapView
            ref={mapRef}
            style={styles.map}
            colorScheme="light"
            initialRegion={initialRegion}
            onMapReady={fitMapToMarkers}
            onLayout={fitMapToMarkers}
            scrollEnabled={true}
            zoomEnabled={true}
            pitchEnabled={false}
            rotateEnabled={false}
          >
            {/* Driver location */}
            {location && !isReadOnly && (
              <Marker
                id="driver"
                coordinate={{ latitude: location.latitude, longitude: location.longitude }}
                image={markerImages.carAssigned}
                anchor={{ x: 0.5, y: 0.5 }}
                tracksViewChanges={false}
                zIndex={11}
              />
            )}
            {ride.pickup?.lat && (
              <Marker
                id="pickup"
                coordinate={{ latitude: ride.pickup.lat, longitude: ride.pickup.lng }}
                image={markerImages.pickup}
                anchor={{ x: 0.5, y: 0.5 }}
                tracksViewChanges={false}
                zIndex={10}
              />
            )}
            {ride.stops?.map((stop, i) => (
              stop.lat ? (
                <Marker
                  key={`stop-${i}`}
                  id={`stop-${i}`}
                  coordinate={{ latitude: stop.lat, longitude: stop.lng }}
                  image={markerImages.stopSmall[i + 1] || markerImages.stopSmall[1]}
                  anchor={{ x: 0.5, y: 0.5 }}
                  tracksViewChanges={false}
                  zIndex={9}
                />
              ) : null
            ))}
            {ride.dropoff?.lat && (
              <Marker
                id="dropoff"
                coordinate={{ latitude: ride.dropoff.lat, longitude: ride.dropoff.lng }}
                image={markerImages.dropoff}
                anchor={{ x: 0.5, y: 0.5 }}
                tracksViewChanges={false}
                zIndex={10}
              />
            )}
            {polylineCoords.length > 1 && (
              <Polyline
                id="ride-route"
                coordinates={polylineCoords}
                strokeColor={colors.primary}
                strokeWidth={4}
              />
            )}
          </MapView>
        </View>

        {/* Status Badge Row */}
        <View style={styles.statusRow}>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(ride.status) + '15' }]}>
            <View style={[styles.statusDot, { backgroundColor: getStatusColor(ride.status) }]} />
            <Text style={[styles.statusText, { color: getStatusColor(ride.status) }]}>
              {t(`rides.${ride.status}`)}
            </Text>
          </View>
          <Text style={styles.rideDate}>{formatDate(ride.createdAt)}</Text>
        </View>

        {/* Route Details */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('rides.routeDetails')}</Text>
          <View style={styles.routeTimeline}>
            {/* Pickup */}
            <View style={styles.timelineItem}>
              <View style={styles.timelineDotGreen} />
              <View style={styles.timelineContent}>
                <Text style={styles.timelineLabel}>{t('rides.pickup')}</Text>
                <Text style={styles.timelineAddress}>{ride.pickup?.address || '—'}</Text>
                {!isReadOnly && ride.pickup?.lat && (
                  <TouchableOpacity
                    style={styles.timelineNavButton}
                    onPress={() => handleNavigate(ride.pickup?.address, ride.pickup?.lat, ride.pickup?.lng)}
                  >
                    <Ionicons name="navigate" size={14} color={colors.primary} />
                    <Text style={styles.timelineNavText}>{t('rides.navigation')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
            <View style={styles.timelineConnector} />

            {/* Stops */}
            {ride.stops?.map((stop, i) => (
              <React.Fragment key={`stop-${i}`}>
                <View style={styles.timelineItem}>
                  <View style={styles.timelineDotOrange}>
                    <Text style={styles.timelineDotOrangeText}>{i + 1}</Text>
                  </View>
                  <View style={styles.timelineContent}>
                    <Text style={styles.timelineLabel}>{t('rides.stop')} {i + 1}</Text>
                    <Text style={styles.timelineAddress}>{stop.address || '—'}</Text>
                    {!isReadOnly && stop.lat && (
                      <TouchableOpacity
                        style={styles.timelineNavButton}
                        onPress={() => handleNavigate(stop.address, stop.lat, stop.lng)}
                      >
                        <Ionicons name="navigate" size={14} color={colors.primary} />
                        <Text style={styles.timelineNavText}>{t('rides.navigation')}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
                <View style={styles.timelineConnector} />
              </React.Fragment>
            ))}

            {/* Dropoff */}
            <View style={styles.timelineItem}>
              <View style={styles.timelineDotRed} />
              <View style={styles.timelineContent}>
                <Text style={styles.timelineLabel}>{t('rides.dropoff')}</Text>
                <Text style={styles.timelineAddress}>{ride.dropoff?.address || '—'}</Text>
                {!isReadOnly && ride.dropoff?.lat && (
                  <TouchableOpacity
                    style={styles.timelineNavButton}
                    onPress={() => handleNavigate(ride.dropoff?.address, ride.dropoff?.lat, ride.dropoff?.lng)}
                  >
                    <Ionicons name="navigate" size={14} color={colors.primary} />
                    <Text style={styles.timelineNavText}>{t('rides.navigation')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        </View>

        {/* Ride Info Grid */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('rides.rideDetails')}</Text>
          <View style={styles.infoGrid}>
            <View style={styles.infoItem}>
              <Ionicons name="car-outline" size={20} color={colors.primary} />
              <Text style={styles.infoLabel}>{t('rides.vehicleType')}</Text>
              <Text style={styles.infoValue}>{t(`rides.${ride.vehicleType || 'economy'}`)}</Text>
            </View>
            <View style={styles.infoItem}>
              <Ionicons name="cash-outline" size={20} color={colors.primary} />
              <Text style={styles.infoLabel}>{t('rides.fare')}</Text>
              <Text style={styles.infoValue}>
                {ride.fare ? ride.fare.toFixed(2) : (ride.quote?.totalPrice || '0.00')} ₾
              </Text>
            </View>
            <View style={styles.infoItem}>
              <Ionicons name="navigate-outline" size={20} color={colors.primary} />
              <Text style={styles.infoLabel}>{t('rides.distance')}</Text>
              <Text style={styles.infoValue}>
                {ride.quote?.distanceText || `${(ride.quote?.distance || 0).toFixed(1)} ${t('rides.km')}`}
              </Text>
            </View>
            <View style={styles.infoItem}>
              <Ionicons name="time-outline" size={20} color={colors.primary} />
              <Text style={styles.infoLabel}>{t('rides.duration')}</Text>
              <Text style={styles.infoValue}>
                {actualDuration || ride.quote?.durationText || `${ride.quote?.duration || 0} ${t('rides.min')}`}
              </Text>
            </View>
          </View>
        </View>

        {/* Payment */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('rides.payment')}</Text>
          <View style={styles.paymentRow}>
            <Ionicons
              name={ride.paymentMethod === 'cash' ? 'cash-outline' : 'card-outline'}
              size={20}
              color={colors.primary}
            />
            <Text style={styles.paymentMethod}>
              {t(`rides.${ride.paymentMethod || 'cash'}`)}
            </Text>
            <Text style={styles.paymentAmount}>
              {ride.fare ? ride.fare.toFixed(2) : (ride.quote?.totalPrice || '0.00')} ₾
            </Text>
          </View>
          {ride.waitingFee > 0 && (
            <View style={styles.paymentRow}>
              <Ionicons name="hourglass-outline" size={20} color={colors.warning} />
              <Text style={styles.paymentMethod}>{t('rides.waitingFee')}</Text>
              <Text style={styles.paymentAmount}>{ride.waitingFee.toFixed(2)} ₾</Text>
            </View>
          )}
        </View>

        {/* Passenger Info */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('rides.passenger')}</Text>
          <View style={styles.passengerCard}>
            <View style={styles.passengerAvatar}>
              <Ionicons name="person" size={24} color={colors.primary} />
            </View>
            <View style={styles.passengerInfo}>
              <Text style={styles.passengerName}>{ride.passengerName || t('common.unknown')}</Text>
              {ride.passengerPhone && (
                <Text style={styles.passengerPhone}>{ride.passengerPhone}</Text>
              )}
            </View>
            <View style={styles.contactButtons}>
              {ride.passengerPhone && (
                <TouchableOpacity
                  style={styles.contactButton}
                  onPress={() => Linking.openURL(`tel:${ride.passengerPhone}`)}
                  accessibilityRole="button"
                  accessibilityLabel={t('rides.callPassenger')}
                >
                  <Ionicons name="call" size={18} color={colors.primary} />
                </TouchableOpacity>
              )}
              {!isReadOnly && (
                <TouchableOpacity
                  style={styles.contactButton}
                  onPress={() => navigation.navigate('Chat', {
                    rideId,
                    passengerName: ride.passengerName,
                  })}
                  accessibilityRole="button"
                  accessibilityLabel={t('rides.chatWithPassenger')}
                >
                  <Ionicons name="chatbubble-outline" size={18} color={colors.primary} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>

        {/* Rate Passenger — completed rides only, not yet rated */}
        {ride.status === 'completed' && !ratingSubmitted && !ride.driverRatingForPassenger && (
          <View style={styles.card}>
            <TouchableOpacity
              style={styles.ratePassengerButton}
              onPress={() => setShowRatingModal(true)}
              accessibilityRole="button"
              accessibilityLabel={t('rides.ratePassengerAction')}
            >
              <Ionicons name="star-outline" size={22} color={colors.gold} />
              <Text style={styles.ratePassengerText}>{t('rides.ratePassengerAction')}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
        )}

        {/* Waiting Time Card - active rides only */}
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
            <View style={styles.waitingTimeDisplay}>
              <Text style={[
                styles.waitingTimeValue,
                waitingTimeLeft <= 60 && styles.waitingTimeUrgent
              ]}>
                {Math.floor(Math.max(0, waitingTimeLeft) / 60)}:{(Math.max(0, waitingTimeLeft) % 60).toString().padStart(2, '0')}
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
                <Text style={styles.waitingFeeValue}>+{waitingFee.toFixed(2)} ₾</Text>
              )}
            </View>
            {waitingTimeLeft <= 60 && (
              <Text style={styles.waitingWarning}>{t('rides.rideWillCancel')}</Text>
            )}
          </View>
        )}

        {/* Waiting Fee Display - in_progress with fee */}
        {ride.waitingFee > 0 && ride.status === 'in_progress' && (
          <View style={[styles.card, styles.waitingFeeCard]}>
            <View style={styles.waitingFeeInfoRow}>
              <Ionicons name="time" size={20} color={colors.warning} />
              <Text style={styles.waitingFeeInfoLabel}>{t('rides.waitingFeeAdded')}</Text>
              <Text style={styles.waitingFeeInfoValue}>+{ride.waitingFee.toFixed(2)} ₾</Text>
            </View>
          </View>
        )}

        {/* Timeline */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('rides.timeline')}</Text>
          <View style={styles.timestampList}>
            <TimestampRow icon="create-outline" label={t('rides.requested')} value={formatDate(ride.createdAt)} styles={styles} />
            {ride.arrivalTime && (
              <TimestampRow icon="flag-outline" label={t('rides.driverArrived')} value={formatDate(ride.arrivalTime)} styles={styles} />
            )}
            {ride.startTime && (
              <TimestampRow icon="play-outline" label={t('rides.started')} value={formatDate(ride.startTime)} styles={styles} />
            )}
            {ride.endTime && (
              <TimestampRow icon="checkmark-circle-outline" label={t('rides.ended')} value={formatDate(ride.endTime)} styles={styles} />
            )}
          </View>
        </View>

        {/* Rating */}
        {ride.rating > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('rides.passengerRating')}</Text>
            <View style={styles.ratingRow}>
              {[1, 2, 3, 4, 5].map(star => (
                <Ionicons
                  key={star}
                  name={star <= ride.rating ? 'star' : 'star-outline'}
                  size={24}
                  color={star <= ride.rating ? colors.gold : colors.border}
                  style={{ marginRight: 4 }}
                />
              ))}
            </View>
            {ride.review && <Text style={styles.reviewText}>{ride.review}</Text>}
          </View>
        )}

        {/* Cancellation Info */}
        {ride.status === 'cancelled' && (
          <View style={[styles.card, styles.cancelledCard]}>
            <Text style={styles.cardTitle}>{t('rides.cancellation')}</Text>
            {ride.cancelledBy && (
              <Text style={styles.cancelInfo}>
                {t('rides.cancelledBy')}: {ride.cancelledBy}
              </Text>
            )}
            {ride.cancellationReason && (
              <Text style={styles.cancelInfo}>
                {ride.cancellationReason.replace(/_/g, ' ')}
              </Text>
            )}
            {ride.cancellationNote && (
              <Text style={styles.cancelNote}>{ride.cancellationNote}</Text>
            )}
          </View>
        )}

        {/* Action Buttons - active rides only */}
        {!isReadOnly && (
          <View style={styles.actionButtons}>
            {ride.status === 'accepted' && (
              <>
                <TouchableOpacity
                  style={[styles.actionButton, styles.arrivedButton, !isNearTarget && styles.actionButtonDisabled]}
                  onPress={handleNotifyArrival}
                  disabled={actionLoading || !isNearTarget}
                  accessibilityRole="button"
                  accessibilityLabel={t('rides.imHere')}
                  accessibilityState={{ disabled: actionLoading || !isNearTarget }}
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
                {!isNearTarget && distanceMeters !== null && (
                  <Text style={styles.proximityHint}>
                    {t('rides.tooFarFromPickup', { distance: distanceMeters })}
                  </Text>
                )}
              </>
            )}
            {ride.status === 'driver_arrived' && (
              <TouchableOpacity
                style={[styles.actionButton, styles.startButton]}
                onPress={handleStartRide}
                disabled={actionLoading}
                accessibilityRole="button"
                accessibilityLabel={t('rides.startRide')}
                accessibilityState={{ disabled: actionLoading }}
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
              <>
                <TouchableOpacity
                  style={[styles.actionButton, styles.completeButton, !isNearTarget && styles.actionButtonDisabled]}
                  onPress={handleCompleteRide}
                  disabled={actionLoading || !isNearTarget}
                  accessibilityRole="button"
                  accessibilityLabel={t('rides.completeRide')}
                  accessibilityState={{ disabled: actionLoading || !isNearTarget }}
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
                {!isNearTarget && distanceMeters !== null && (
                  <Text style={styles.proximityHint}>
                    {t('rides.tooFarFromDropoff', { distance: distanceMeters })}
                  </Text>
                )}
              </>
            )}
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Rate Passenger Modal */}
      <Modal
        visible={showRatingModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowRatingModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.ratingModal}>
            <View style={styles.ratingModalHandle} />
            <Text style={styles.ratingModalTitle}>{t('rating.ratePassenger')}</Text>
            <Text style={styles.ratingModalSubtitle}>{t('rating.ratePassengerDesc')}</Text>
            {/* Stars */}
            <View style={styles.starsRow} accessibilityRole="none">
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity
                  key={star}
                  onPress={() => setRatingValue(star)}
                  accessibilityRole="button"
                  accessibilityLabel={t('rating.starLabel', { count: star })}
                  accessibilityState={{ selected: star <= ratingValue }}
                  style={styles.starButton}
                >
                  <Ionicons
                    name={star <= ratingValue ? 'star' : 'star-outline'}
                    size={36}
                    color={star <= ratingValue ? colors.gold : colors.border}
                  />
                </TouchableOpacity>
              ))}
            </View>
            {/* Review text */}
            <TextInput
              style={styles.ratingInput}
              placeholder={t('rating.reviewPlaceholder')}
              placeholderTextColor={colors.mutedForeground}
              value={ratingReview}
              onChangeText={setRatingReview}
              multiline
              maxLength={300}
              accessibilityLabel={t('rating.reviewPlaceholder')}
            />
            <View style={styles.ratingModalButtons}>
              <TouchableOpacity
                style={styles.ratingSkipButton}
                onPress={() => setShowRatingModal(false)}
                accessibilityRole="button"
                accessibilityLabel={t('rating.skipRating')}
              >
                <Text style={styles.ratingSkipText}>{t('rating.skipRating')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.ratingSubmitButton, (ratingValue === 0 || ratingSubmitting) && styles.ratingSubmitDisabled]}
                onPress={handleSubmitRating}
                disabled={ratingValue === 0 || ratingSubmitting}
                accessibilityRole="button"
                accessibilityLabel={t('rating.submitRating')}
                accessibilityState={{ disabled: ratingValue === 0 || ratingSubmitting }}
              >
                {ratingSubmitting ? (
                  <ActivityIndicator color={colors.primaryForeground} size="small" />
                ) : (
                  <Text style={styles.ratingSubmitText}>{t('rating.submitRating')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function TimestampRow({ icon, label, value, styles }) {
  return (
    <View style={styles.timestampRow}>
      <Ionicons name={icon} size={18} color={colors.mutedForeground} />
      <Text style={styles.timestampLabel}>{label}</Text>
      <Text style={styles.timestampValue}>{value}</Text>
    </View>
  );
}

const createStyles = (typography) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  // Map
  mapContainer: {
    height: 260,
    backgroundColor: colors.muted,
    overflow: 'hidden',
  },
  map: {
    flex: 1,
  },
  backButtonOverlay: {
    position: 'absolute',
    left: 16,
    zIndex: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.md,
  },
  // Status row
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusText: {
    ...typography.bodyMedium,
    fontWeight: '600',
  },
  rideDate: {
    ...typography.bodySmall,
    color: colors.mutedForeground,
  },
  // Cards
  card: {
    backgroundColor: colors.background,
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: radius.xl,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelledCard: {
    borderColor: colors.destructive + '30',
    backgroundColor: colors.destructive + '05',
  },
  cardTitle: {
    ...typography.bodyMedium,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: 14,
  },
  // Route timeline
  routeTimeline: {},
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  timelineContent: {
    flex: 1,
    marginLeft: 12,
    paddingBottom: 4,
  },
  timelineLabel: {
    ...typography.captionSmall,
    color: colors.mutedForeground,
    marginBottom: 2,
  },
  timelineAddress: {
    ...typography.bodyMedium,
    color: colors.foreground,
  },
  timelineNavButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    paddingVertical: 10,
  },
  timelineNavText: {
    ...typography.captionSmall,
    fontWeight: '600',
    color: colors.primary,
    marginLeft: 4,
  },
  timelineConnector: {
    width: 2,
    height: 20,
    backgroundColor: colors.border,
    marginLeft: 7,
  },
  timelineDotGreen: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.success,
    borderWidth: 2,
    borderColor: colors.success + '30',
    marginTop: 2,
  },
  timelineDotRed: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.destructive,
    borderWidth: 2,
    borderColor: colors.destructive + '30',
    marginTop: 2,
  },
  timelineDotOrange: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.stop,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  timelineDotOrangeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
  },
  // Info grid
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  infoItem: {
    width: '50%',
    paddingVertical: 10,
    alignItems: 'center',
  },
  infoLabel: {
    ...typography.captionSmall,
    color: colors.mutedForeground,
    marginTop: 6,
  },
  infoValue: {
    ...typography.bodyMedium,
    fontWeight: '600',
    color: colors.foreground,
    marginTop: 2,
  },
  // Payment
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  paymentMethod: {
    ...typography.body,
    color: colors.foreground,
    marginLeft: 12,
    flex: 1,
  },
  paymentAmount: {
    ...typography.bodyMedium,
    fontWeight: '600',
    color: colors.foreground,
  },
  // Passenger
  passengerCard: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  passengerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  passengerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  passengerName: {
    ...typography.bodyMedium,
    fontWeight: '600',
    color: colors.foreground,
  },
  passengerPhone: {
    ...typography.bodySmall,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  contactButtons: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  contactButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ratePassengerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  ratePassengerText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.foreground,
    flex: 1,
  },
  // Timestamps
  timestampList: {},
  timestampRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  timestampLabel: {
    ...typography.bodySmall,
    color: colors.mutedForeground,
    marginLeft: 10,
    flex: 1,
  },
  timestampValue: {
    ...typography.bodySmall,
    color: colors.foreground,
    fontWeight: '500',
  },
  // Rating
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  reviewText: {
    ...typography.body,
    color: colors.mutedForeground,
    fontStyle: 'italic',
    marginTop: 4,
  },
  // Cancellation
  cancelInfo: {
    ...typography.body,
    color: colors.destructive,
    marginBottom: 4,
    textTransform: 'capitalize',
  },
  cancelNote: {
    ...typography.bodySmall,
    color: colors.mutedForeground,
    fontStyle: 'italic',
    marginTop: 4,
  },
  // Waiting time
  waitingCard: {
    backgroundColor: colors.warning + '15',
    borderColor: colors.warning + '30',
  },
  waitingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  waitingTitle: {
    ...typography.body,
    fontWeight: '600',
    color: colors.foreground,
    marginLeft: 8,
  },
  waitingTimeDisplay: {
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
    ...typography.bodySmall,
    color: colors.mutedForeground,
    marginTop: 4,
  },
  waitingProgressBar: {
    height: 8,
    backgroundColor: colors.muted,
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
    ...typography.bodySmall,
    color: colors.mutedForeground,
  },
  waitingFeeValue: {
    ...typography.body,
    fontWeight: '600',
    color: colors.warning,
  },
  waitingWarning: {
    ...typography.bodySmall,
    fontWeight: '500',
    color: colors.destructive,
    textAlign: 'center',
    marginTop: 12,
  },
  waitingFeeCard: {
    backgroundColor: colors.warning + '10',
    borderColor: colors.warning + '20',
  },
  waitingFeeInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  waitingFeeInfoLabel: {
    ...typography.bodySmall,
    flex: 1,
    color: colors.foreground,
    marginLeft: 8,
  },
  waitingFeeInfoValue: {
    ...typography.body,
    fontWeight: '700',
    color: colors.warning,
  },
  // Action buttons
  actionButtons: {
    marginHorizontal: 16,
    marginTop: 4,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.xl,
    padding: 16,
    marginBottom: 12,
  },
  arrivedButton: {
    backgroundColor: colors.warning,
  },
  startButton: {
    backgroundColor: colors.primary,
  },
  completeButton: {
    backgroundColor: colors.success,
  },
  actionButtonText: {
    ...typography.button,
    color: colors.background,
    marginLeft: 8,
  },
  actionButtonDisabled: {
    opacity: 0.4,
  },
  proximityHint: {
    ...typography.captionSmall,
    color: colors.mutedForeground,
    textAlign: 'center',
    marginTop: -4,
    marginBottom: 12,
  },
  // Rating Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  ratingModal: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    padding: spacing.xl,
    paddingBottom: spacing['3xl'],
  },
  ratingModalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  ratingModalTitle: {
    ...typography.h2,
    fontWeight: '700',
    color: colors.foreground,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  ratingModalSubtitle: {
    ...typography.body,
    color: colors.mutedForeground,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  starsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  starButton: {
    padding: spacing.xs,
  },
  ratingInput: {
    backgroundColor: colors.muted,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...typography.body,
    color: colors.foreground,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: spacing.lg,
  },
  ratingModalButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  ratingSkipButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    borderRadius: radius.xl,
    backgroundColor: colors.muted,
  },
  ratingSkipText: {
    ...typography.body,
    color: colors.mutedForeground,
    fontWeight: '600',
  },
  ratingSubmitButton: {
    flex: 2,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    borderRadius: radius.xl,
    backgroundColor: colors.primary,
  },
  ratingSubmitDisabled: {
    opacity: 0.5,
  },
  ratingSubmitText: {
    ...typography.body,
    color: colors.primaryForeground,
    fontWeight: '700',
  },
});
