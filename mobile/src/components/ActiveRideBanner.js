import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Easing, DeviceEventEmitter } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { loadRideState, RIDE_STATE_EVENT } from '../services/rideStorage';
import { useTheme } from '../context/ThemeContext';
import { radius, spacing } from '../theme/colors';

const STATUS_STEPS = ['pending', 'accepted', 'driver_arrived', 'in_progress'];
const DASH_COUNT = 28;

function stepLabel(t, status) {
  switch (status) {
    case 'pending': return t('taxi.searchingForDriver');
    case 'accepted': return t('taxi.driverFound');
    case 'driver_arrived': return t('taxi.driverArrived');
    case 'in_progress': return t('taxi.rideInProgress');
    default: return '';
  }
}

function statusIcon(status) {
  switch (status) {
    case 'pending': return 'search';
    case 'accepted': return 'car';
    case 'driver_arrived': return 'location';
    case 'in_progress': return 'navigate';
    default: return 'car';
  }
}

function formatVehicle(v) {
  if (!v) return '';
  if (typeof v === 'string') return v;
  const name = [v.make, v.model].filter(Boolean).join(' ');
  return v.licensePlate ? `${name} • ${v.licensePlate}` : name;
}

function shortAddress(addr) {
  if (!addr) return '';
  return addr.split(',')[0].trim();
}

export default function ActiveRideBanner({ navigation }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [ride, setRide] = useState(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const load = async () => {
        const state = await loadRideState();
        if (cancelled) return;
        if (state && STATUS_STEPS.includes(state.status)) {
          setRide(state);
        } else {
          setRide(null);
        }
      };
      load();
      // Real-time refresh on persist/clear from TaxiScreen, plus a slow
      // safety poll in case of missed events (e.g. cold-start races).
      const sub = DeviceEventEmitter.addListener(RIDE_STATE_EVENT, load);
      const id = setInterval(load, 15000);
      return () => {
        cancelled = true;
        sub.remove();
        clearInterval(id);
      };
    }, [])
  );

  useEffect(() => {
    if (!ride) return;
    fadeAnim.setValue(0);
    slideAnim.setValue(30);
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        delay: 150,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        delay: 150,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [ride?.rideId, fadeAnim, slideAnim]);

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.98,
      useNativeDriver: true,
      friction: 8,
      tension: 100,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 8,
      tension: 100,
      useNativeDriver: true,
    }).start();
  };

  if (!ride) return null;

  const stepIndex = STATUS_STEPS.indexOf(ride.status);
  const progressPct = ((stepIndex + 1) / STATUS_STEPS.length);
  const filledDashes = Math.round(progressPct * DASH_COUNT);

  const pickupText = shortAddress(ride.pickup?.address) || t('taxi.currentLocation');
  const dropoffText = shortAddress(ride.dropoff?.address) || '—';
  const vehicleText = formatVehicle(ride.driverVehicle);
  const hasDriver = !!ride.driverName;
  const hasPrice = ride.estimatedPrice != null;
  const hasEta = ride.estimatedDuration != null;
  const hasDistance = ride.totalDistance != null;

  const styles = createStyles(colors);

  const animatedStyle = {
    opacity: fadeAnim,
    transform: [{ translateY: slideAnim }, { scale: scaleAnim }],
  };

  return (
    <Animated.View style={[styles.section, animatedStyle]}>
      <TouchableOpacity
        style={styles.card}
        activeOpacity={1}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={() => navigation.navigate('Taxi')}
        accessibilityRole="button"
        accessibilityLabel={stepLabel(t, ride.status)}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.iconBadge}>
            <Ionicons name={statusIcon(ride.status)} size={18} color="#fff" />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.status} numberOfLines={1}>
              {stepLabel(t, ride.status)}
            </Text>
            {hasDriver ? (
              <Text style={styles.subline} numberOfLines={1}>
                {ride.driverName}{vehicleText ? ` • ${vehicleText}` : ''}
              </Text>
            ) : null}
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.mutedForeground} />
        </View>

        {/* Addresses */}
        <View style={styles.addressBlock}>
          <View style={styles.addressRow}>
            <View style={[styles.dot, { backgroundColor: '#10B981' }]} />
            <Text style={styles.address} numberOfLines={1}>{pickupText}</Text>
          </View>
          <View style={styles.dottedConnector} />
          <View style={styles.addressRow}>
            <View style={[styles.dot, { backgroundColor: '#111827' }]} />
            <Text style={styles.address} numberOfLines={1}>{dropoffText}</Text>
          </View>
        </View>

        {/* Metrics */}
        {(hasEta || hasDistance || hasPrice) && (
          <View style={styles.metricsRow}>
            {hasEta && (
              <View style={styles.metric}>
                <Ionicons name="time-outline" size={14} color={colors.mutedForeground} />
                <Text style={styles.metricText}>{ride.estimatedDuration} min</Text>
              </View>
            )}
            {hasDistance && (
              <View style={styles.metric}>
                <Ionicons name="navigate-outline" size={14} color={colors.mutedForeground} />
                <Text style={styles.metricText}>{ride.totalDistance} km</Text>
              </View>
            )}
            {hasPrice && (
              <View style={styles.metric}>
                <Ionicons name="cash-outline" size={14} color={colors.mutedForeground} />
                <Text style={styles.metricText}>{ride.estimatedPrice} GEL</Text>
              </View>
            )}
          </View>
        )}

        {/* Dashed progress bar */}
        <View style={styles.dashRow}>
          {Array.from({ length: DASH_COUNT }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.dash,
                { backgroundColor: i < filledDashes ? colors.primary : colors.border },
              ]}
            />
          ))}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    section: {
      marginBottom: spacing.xl,
    },
    card: {
      backgroundColor: colors.background,
      borderRadius: radius.lg,
      padding: spacing.lg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    iconBadge: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.sm,
    },
    headerText: {
      flex: 1,
    },
    status: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.foreground,
    },
    subline: {
      fontSize: 12,
      color: colors.mutedForeground,
      marginTop: 2,
    },
    addressBlock: {
      marginTop: spacing.md,
      paddingLeft: 6,
    },
    addressRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      marginRight: 10,
    },
    dottedConnector: {
      width: 2,
      height: 10,
      marginLeft: 3,
      backgroundColor: colors.border,
      marginVertical: 2,
    },
    address: {
      flex: 1,
      fontSize: 13,
      color: colors.foreground,
    },
    metricsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginTop: spacing.sm,
      gap: spacing.md,
    },
    metric: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    metricText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.foreground,
    },
    dashRow: {
      marginTop: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    dash: {
      flex: 1,
      height: 4,
      borderRadius: 2,
    },
  });
}
