import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import MapView from '../components/map/MapViewWrapper';
import Marker from '../components/map/MarkerWrapper';
import Polyline from '../components/map/PolylineWrapper';
import { mapStyle } from '../components/map/mapStyle';
import { markerImages } from '../components/map/markerImages';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { colors, shadows, radius, useTypography } from '../theme/colors';
import { getDirections } from '../services/googleMaps';

const STATUS_COLORS = {
  pending: colors.status.pending,
  accepted: colors.info,
  arrived: colors.info,
  driver_arrived: colors.info,
  in_progress: colors.status.active,
  inProgress: colors.status.active,
  completed: colors.status.completed,
  cancelled: colors.status.cancelled,
};

// M7: Use same key map as TaxiHistoryScreen for consistent status translations
const STATUS_KEY_MAP = {
  in_progress: 'inProgress',
  driver_arrived: 'arrived',
};
function statusTranslationKey(status) {
  return STATUS_KEY_MAP[status] || status;
}

export default function RideDetailScreen({ route }) {
  const { ride } = route.params;
  const typography = useTypography();
  const styles = React.useMemo(() => createStyles(typography), [typography]);
  const { t, i18n } = useTranslation();
  const mapRef = useRef(null);
  const [polylineCoords, setPolylineCoords] = useState([]);
  const [loadingRoute, setLoadingRoute] = useState(true);
  const hasFitted = useRef(false);

  // Fetch route polyline
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (ride.pickup?.lat && ride.dropoff?.lat) {
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
        }
      } catch {}
      if (mounted) setLoadingRoute(false);
    })();
    return () => { mounted = false; };
  }, [ride]);

  // Fit map to all markers once polyline or markers are ready
  const fitMapToMarkers = useCallback(() => {
    if (hasFitted.current || !mapRef.current) return;

    const coords = [];
    if (ride.pickup?.lat) coords.push({ latitude: ride.pickup.lat, longitude: ride.pickup.lng });
    if (ride.dropoff?.lat) coords.push({ latitude: ride.dropoff.lat, longitude: ride.dropoff.lng });
    if (ride.stops?.length) {
      ride.stops.forEach(s => {
        if (s.lat) coords.push({ latitude: s.lat, longitude: s.lng });
      });
    }

    if (coords.length >= 2) {
      hasFitted.current = true;
      mapRef.current.fitToCoordinates(coords, {
        edgePadding: { top: 60, right: 60, bottom: 60, left: 60 },
        animated: false,
      });
    }
  }, [ride]);

  const getStatusColor = (status) => STATUS_COLORS[status] || colors.mutedForeground;

  const formatDate = (dateString) => {
    if (!dateString) return '—';
    const date = new Date(dateString);
    return date.toLocaleDateString(i18n.language, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDuration = (startTime, endTime) => {
    if (!startTime || !endTime) return null;
    const diff = Math.round((new Date(endTime) - new Date(startTime)) / 60000);
    if (diff < 1) return '< 1 min';
    return `${diff} min`;
  };

  const initialRegion = ride.pickup?.lat ? {
    latitude: (ride.pickup.lat + (ride.dropoff?.lat || ride.pickup.lat)) / 2,
    longitude: (ride.pickup.lng + (ride.dropoff?.lng || ride.pickup.lng)) / 2,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  } : {
    latitude: 42.2679,
    longitude: 42.6946,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  };

  const actualDuration = formatDuration(ride.startTime, ride.endTime);

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Map */}
      <View style={styles.mapContainer}>
        {loadingRoute && (
          <View style={styles.mapLoader}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        )}
        <MapView
          ref={mapRef}
          style={styles.map}
          customMapStyle={mapStyle}
          initialRegion={initialRegion}
          onMapReady={fitMapToMarkers}
          onLayout={fitMapToMarkers}
          scrollEnabled={true}
          zoomEnabled={true}
          pitchEnabled={false}
          rotateEnabled={false}
        >
          {/* Pickup Marker */}
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

          {/* Stop Markers */}
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

          {/* Dropoff Marker */}
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

          {/* Route Polyline */}
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

      {/* Status Badge */}
      <View style={styles.statusRow}>
        <View style={[styles.statusBadgeLarge, { backgroundColor: getStatusColor(ride.status) + '15' }]}>
          <View style={[styles.statusDotLarge, { backgroundColor: getStatusColor(ride.status) }]} />
          <Text style={[styles.statusTextLarge, { color: getStatusColor(ride.status) }]}>
            {t(`taxi.status.${statusTranslationKey(ride.status)}`)}
          </Text>
        </View>
        <Text style={styles.rideDate}>{formatDate(ride.createdAt)}</Text>
      </View>

      {/* Route Details */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('history.routeDetails')}</Text>

        <View style={styles.routeTimeline}>
          {/* Pickup */}
          <View style={styles.timelineItem}>
            <View style={styles.timelineDotGreen} />
            <View style={styles.timelineContent}>
              <Text style={styles.timelineLabel}>{t('taxi.pickupPoint')}</Text>
              <Text style={styles.timelineAddress}>{ride.pickup?.address || '—'}</Text>
            </View>
          </View>
          <View style={styles.timelineConnector} />

          {/* Stops */}
          {ride.stops?.map((stop, i) => (
            <React.Fragment key={`detail-stop-${i}`}>
              <View style={styles.timelineItem}>
                <View style={styles.timelineDotOrange}>
                  <Text style={styles.timelineDotOrangeText}>{i + 1}</Text>
                </View>
                <View style={styles.timelineContent}>
                  <Text style={styles.timelineLabel}>{t('taxi.stop')} {i + 1}</Text>
                  <Text style={styles.timelineAddress}>{stop.address || '—'}</Text>
                </View>
              </View>
              <View style={styles.timelineConnector} />
            </React.Fragment>
          ))}

          {/* Dropoff */}
          <View style={styles.timelineItem}>
            <View style={styles.timelineDotRed} />
            <View style={styles.timelineContent}>
              <Text style={styles.timelineLabel}>{t('taxi.dropoffPoint')}</Text>
              <Text style={styles.timelineAddress}>{ride.dropoff?.address || '—'}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Ride Info */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('taxi.rideDetails')}</Text>

        <View style={styles.infoGrid}>
          <View style={styles.infoItem}>
            <Ionicons name="car-outline" size={20} color={colors.primary} />
            <Text style={styles.infoLabel}>{t('taxi.vehicleType')}</Text>
            <Text style={styles.infoValue}>{t(`taxi.${ride.vehicleType || 'economy'}`)}</Text>
          </View>

          <View style={styles.infoItem}>
            <Ionicons name="cash-outline" size={20} color={colors.primary} />
            <Text style={styles.infoLabel}>{t('history.fare')}</Text>
            <Text style={styles.infoValue}>
              {ride.fare ? ride.fare.toFixed(2) : (ride.quote?.totalPrice || '0.00')} ₾
            </Text>
          </View>

          <View style={styles.infoItem}>
            <Ionicons name="navigate-outline" size={20} color={colors.primary} />
            <Text style={styles.infoLabel}>{t('taxi.distance')}</Text>
            <Text style={styles.infoValue}>
              {ride.quote?.distanceText || `${(ride.quote?.distance || 0).toFixed(1)} ${t('taxi.km')}`}
            </Text>
          </View>

          <View style={styles.infoItem}>
            <Ionicons name="time-outline" size={20} color={colors.primary} />
            <Text style={styles.infoLabel}>{t('taxi.duration')}</Text>
            <Text style={styles.infoValue}>
              {actualDuration || ride.quote?.durationText || `${ride.quote?.duration || 0} min`}
            </Text>
          </View>
        </View>
      </View>

      {/* Payment */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('payment.payment')}</Text>
        <View style={styles.paymentRow}>
          <Ionicons
            name={ride.paymentMethod === 'cash' ? 'cash-outline' : 'card-outline'}
            size={20}
            color={colors.primary}
          />
          <Text style={styles.paymentMethod}>
            {t(`taxi.${ride.paymentMethod || 'cash'}`)}
          </Text>
          <Text style={styles.paymentAmount}>
            {ride.fare ? ride.fare.toFixed(2) : (ride.quote?.totalPrice || '0.00')} ₾
          </Text>
        </View>
        {ride.waitingFee > 0 && (
          <View style={styles.paymentRow}>
            <Ionicons name="hourglass-outline" size={20} color={colors.warning} />
            <Text style={styles.paymentMethod}>{t('history.waitingFee')}</Text>
            <Text style={styles.paymentAmount}>{ride.waitingFee.toFixed(2)} ₾</Text>
          </View>
        )}
      </View>

      {/* Driver Info */}
      {ride.driver && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('taxi.driver')}</Text>
          <View style={styles.driverCard}>
            <View style={styles.driverAvatar}>
              <Ionicons name="person" size={24} color={colors.primary} />
            </View>
            <View style={styles.driverInfo}>
              <Text style={styles.driverName}>
                {[ride.driver.user?.firstName, ride.driver.user?.lastName].filter(Boolean).join(' ')
                  || ride.driver.user?.fullName
                  || t('taxi.driver')}
              </Text>
              {ride.driver.vehicle?.licensePlate && (
                <View style={styles.vehicleRow}>
                  <Text style={styles.vehicleText}>
                    {[ride.driver.vehicle?.make, ride.driver.vehicle?.model].filter(Boolean).join(' ')}
                  </Text>
                  <View style={styles.plateBadge}>
                    <Text style={styles.plateText}>{ride.driver.vehicle.licensePlate}</Text>
                  </View>
                </View>
              )}
            </View>
            {ride.driver.rating > 0 && (
              <View style={styles.driverRatingBadge}>
                <Ionicons name="star" size={14} color={colors.warning} />
                <Text style={styles.driverRatingText}>{ride.driver.rating.toFixed(1)}</Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* Timestamps */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('history.timeline')}</Text>
        <View style={styles.timestampList}>
          <TimestampRow
            icon="create-outline"
            label={t('history.requested')}
            value={formatDate(ride.createdAt)}
            styles={styles}
          />
          {ride.startTime && (
            <TimestampRow
              icon="play-outline"
              label={t('history.started')}
              value={formatDate(ride.startTime)}
              styles={styles}
            />
          )}
          {ride.arrivalTime && (
            <TimestampRow
              icon="flag-outline"
              label={t('history.driverArrived')}
              value={formatDate(ride.arrivalTime)}
              styles={styles}
            />
          )}
          {ride.endTime && (
            <TimestampRow
              icon="checkmark-circle-outline"
              label={t('history.ended')}
              value={formatDate(ride.endTime)}
              styles={styles}
            />
          )}
        </View>
      </View>

      {/* Rating */}
      {ride.rating && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('history.yourRating')}</Text>
          <View style={styles.ratingRow}>
            {[1, 2, 3, 4, 5].map(star => (
              <Ionicons
                key={star}
                name={star <= ride.rating ? 'star' : 'star-outline'}
                size={24}
                color={star <= ride.rating ? colors.warning : colors.border}
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
          <Text style={styles.cardTitle}>{t('history.cancellation')}</Text>
          {ride.cancelledBy && (
            <Text style={styles.cancelInfo}>
              {t('history.cancelledBy')}: {t(`history.${ride.cancelledBy}`)}
            </Text>
          )}
          {ride.cancellationReason && (
            <Text style={styles.cancelInfo}>
              {t(`taxi.cancelReasons.${ride.cancellationReason}`)}
            </Text>
          )}
          {ride.cancellationNote && (
            <Text style={styles.cancelNote}>{ride.cancellationNote}</Text>
          )}
        </View>
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
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
  // Map
  mapContainer: {
    height: 260,
    backgroundColor: colors.muted,
    overflow: 'hidden',
  },
  map: {
    flex: 1,
  },
  mapLoader: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 10,
    backgroundColor: colors.background,
    borderRadius: radius.full,
    padding: 8,
    ...shadows.md,
  },
  // Status
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  statusBadgeLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
  },
  statusDotLarge: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusTextLarge: {
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
    backgroundColor: colors.warning,
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
  // Driver
  driverCard: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  driverAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverInfo: {
    flex: 1,
    marginLeft: 12,
  },
  driverName: {
    ...typography.bodyMedium,
    fontWeight: '600',
    color: colors.foreground,
  },
  vehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  vehicleText: {
    ...typography.bodySmall,
    color: colors.mutedForeground,
  },
  plateBadge: {
    backgroundColor: colors.muted,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    marginLeft: 8,
  },
  plateText: {
    ...typography.captionSmall,
    fontWeight: '600',
    color: colors.foreground,
    letterSpacing: 0.5,
  },
  driverRatingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.warning + '15',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  driverRatingText: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.foreground,
    marginLeft: 4,
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
  },
  cancelNote: {
    ...typography.bodySmall,
    color: colors.mutedForeground,
    fontStyle: 'italic',
    marginTop: 4,
  },
});
