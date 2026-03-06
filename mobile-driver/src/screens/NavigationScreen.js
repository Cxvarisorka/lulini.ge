import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import MapView from '../components/map/MapViewWrapper';
import Marker from '../components/map/MarkerWrapper';
import Polyline from '../components/map/PolylineWrapper';
import { markerImages } from '../components/map/markerImages';
import { useLocation } from '../context/LocationContext';
import { colors, shadows, radius, spacing, useTypography } from '../theme/colors';
import {
  getNavigationRoute,
  formatDistance,
  formatDuration,
  getManeuverIcon,
  getManeuverInstruction,
} from '../services/directions';
import { haversineM } from '../utils/distance';

const STEP_ARRIVAL_THRESHOLD = 30; // meters
const ROUTE_DEVIATION_THRESHOLD = 100; // meters
const RECALC_COOLDOWN = 15000; // ms

export default function NavigationScreen({ navigation, route: navRoute }) {
  const { destination, origin } = navRoute.params;
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const typography = useTypography();
  const styles = useMemo(() => createStyles(typography, insets), [typography, insets]);
  const { location } = useLocation();

  const [routeData, setRouteData] = useState(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [polylineCoords, setPolylineCoords] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [hasArrived, setHasArrived] = useState(false);

  const mapRef = useRef(null);
  const lastRecalcTimeRef = useRef(0);
  const routeDataRef = useRef(null);
  const currentStepIndexRef = useRef(0);
  const hasFittedRef = useRef(false);

  // Keep refs in sync to avoid stale closures
  useEffect(() => { routeDataRef.current = routeData; }, [routeData]);
  useEffect(() => { currentStepIndexRef.current = currentStepIndex; }, [currentStepIndex]);

  // Use location from context — the driver's position
  const driverLocation = location || origin;

  // Fetch route on mount
  useEffect(() => {
    fetchRoute();
  }, []);

  // React to location changes — step advancement, deviation check
  useEffect(() => {
    if (!driverLocation || !routeDataRef.current || hasArrived) return;

    const route = routeDataRef.current;

    // Check arrival at destination
    const distToDest = haversineM(
      driverLocation.latitude, driverLocation.longitude,
      destination.latitude, destination.longitude
    );
    if (distToDest < STEP_ARRIVAL_THRESHOLD) {
      setHasArrived(true);
      return;
    }

    // Step advancement
    const stepIdx = currentStepIndexRef.current;
    if (stepIdx < route.steps.length - 1) {
      const nextStep = route.steps[stepIdx + 1];
      const distToNextManeuver = haversineM(
        driverLocation.latitude, driverLocation.longitude,
        nextStep.maneuver.location[0], nextStep.maneuver.location[1]
      );
      if (distToNextManeuver < STEP_ARRIVAL_THRESHOLD) {
        setCurrentStepIndex(stepIdx + 1);
      }
    }

    // Route deviation check
    const minDistToRoute = getMinDistanceToPolyline(driverLocation, route.polyline);
    if (minDistToRoute > ROUTE_DEVIATION_THRESHOLD) {
      recalculateRoute(driverLocation);
    }
  }, [driverLocation?.latitude, driverLocation?.longitude]);

  const fetchRoute = async () => {
    const driverPos = driverLocation;
    if (!driverPos) {
      Alert.alert(t('common.error'), t('errors.locationError'));
      navigation.goBack();
      return;
    }
    await fetchRouteFrom(driverPos);
  };

  const fetchRouteFrom = async (fromPos) => {
    setIsLoading(true);
    const result = await getNavigationRoute(fromPos, destination);
    if (!result) {
      Alert.alert(t('common.error'), t('nav.routeError'));
      navigation.goBack();
      return;
    }
    setRouteData(result);
    setCurrentStepIndex(0);
    setIsLoading(false);

    // Convert polyline to coordinate objects for react-native-maps
    if (result.polyline?.length) {
      const coords = result.polyline.map(p => ({
        latitude: Array.isArray(p) ? p[0] : p.latitude,
        longitude: Array.isArray(p) ? p[1] : p.longitude,
      }));
      setPolylineCoords(coords);
    }
  };

  const getMinDistanceToPolyline = (pos, polyline) => {
    let minDist = Infinity;
    for (let i = 0; i < polyline.length; i += 5) {
      const d = haversineM(pos.latitude, pos.longitude, polyline[i][0], polyline[i][1]);
      if (d < minDist) minDist = d;
    }
    return minDist;
  };

  const recalculateRoute = async (pos) => {
    const now = Date.now();
    if (now - lastRecalcTimeRef.current < RECALC_COOLDOWN) return;
    lastRecalcTimeRef.current = now;

    setIsRecalculating(true);
    const result = await getNavigationRoute(pos, destination);
    if (result) {
      setRouteData(result);
      setCurrentStepIndex(0);
      if (result.polyline?.length) {
        const coords = result.polyline.map(p => ({
          latitude: Array.isArray(p) ? p[0] : p.latitude,
          longitude: Array.isArray(p) ? p[1] : p.longitude,
        }));
        setPolylineCoords(coords);
      }
    }
    setIsRecalculating(false);
  };

  // Fit map to route once
  const onMapReady = useCallback(() => {
    if (hasFittedRef.current || !mapRef.current) return;
    const coords = [];
    if (driverLocation) coords.push({ latitude: driverLocation.latitude, longitude: driverLocation.longitude });
    coords.push({ latitude: destination.latitude, longitude: destination.longitude });
    if (coords.length >= 2) {
      hasFittedRef.current = true;
      mapRef.current.fitToCoordinates(coords, {
        edgePadding: { top: 120, right: 60, bottom: 100, left: 60 },
        animated: false,
      });
    }
  }, [driverLocation, destination]);

  const handleRecenter = useCallback(() => {
    if (driverLocation && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: driverLocation.latitude,
        longitude: driverLocation.longitude,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      }, 300);
    }
  }, [driverLocation]);

  const handleExit = () => {
    navigation.goBack();
  };

  // Current step data
  const currentStep = routeData?.steps?.[currentStepIndex];
  const nextStep = routeData?.steps?.[currentStepIndex + 1];

  // [H3 FIX] Memoize navigation computations
  const distanceToNextStep = useMemo(() => {
    if (!currentStep || !driverLocation) return null;
    const target = nextStep
      ? nextStep.maneuver.location
      : [destination.latitude, destination.longitude];
    return haversineM(
      driverLocation.latitude, driverLocation.longitude,
      target[0], target[1]
    );
  }, [currentStep, nextStep, driverLocation?.latitude, driverLocation?.longitude, destination]);

  const remainingDistance = useMemo(() => {
    if (!routeData || currentStepIndex >= routeData.steps.length) return 0;
    return routeData.steps.slice(currentStepIndex).reduce((sum, s) => sum + s.distance, 0);
  }, [routeData, currentStepIndex]);

  const remainingDuration = useMemo(() => {
    if (!routeData || currentStepIndex >= routeData.steps.length) return 0;
    return routeData.steps.slice(currentStepIndex).reduce((sum, s) => sum + s.duration, 0);
  }, [routeData, currentStepIndex]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="dark-content" />
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>{t('nav.calculatingRoute')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Instruction Bar */}
      <View style={styles.instructionBar}>
        {hasArrived ? (
          <View style={styles.arrivedContainer}>
            <Ionicons name="flag" size={32} color={colors.success} />
            <Text style={styles.arrivedText}>{t('nav.arrived')}</Text>
          </View>
        ) : currentStep ? (
          <View style={styles.instructionContent}>
            <View style={styles.maneuverIconContainer}>
              <Ionicons
                name={getManeuverIcon(currentStep.maneuver.type, currentStep.maneuver.modifier)}
                size={32}
                color={colors.primaryForeground}
              />
            </View>
            <View style={styles.instructionTextContainer}>
              <Text style={styles.instructionText} numberOfLines={2}>
                {getManeuverInstruction(currentStep, t)}
              </Text>
              {distanceToNextStep !== null && (
                <Text style={styles.instructionDistance}>
                  {formatDistance(distanceToNextStep)}
                </Text>
              )}
            </View>
          </View>
        ) : null}
        {isRecalculating && (
          <View style={styles.recalcBadge}>
            <ActivityIndicator size="small" color={colors.primaryForeground} />
            <Text style={styles.recalcText}>{t('nav.recalculating')}</Text>
          </View>
        )}
      </View>

      {/* Map */}
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={{
          latitude: driverLocation?.latitude || destination.latitude,
          longitude: driverLocation?.longitude || destination.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }}
        onMapReady={onMapReady}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
      >
        {/* Route polyline */}
        {polylineCoords.length > 0 && (
          <Polyline
            coordinates={polylineCoords}
            strokeColor={colors.primary}
            strokeWidth={5}
            lineCap="round"
            lineJoin="round"
          />
        )}
        {/* Driver marker */}
        {driverLocation && (
          <Marker
            coordinate={{ latitude: driverLocation.latitude, longitude: driverLocation.longitude }}
            image={markerImages.pickup}
            tracksViewChanges={false}
            anchor={{ x: 0.5, y: 0.5 }}
          />
        )}
        {/* Destination marker */}
        <Marker
          coordinate={{ latitude: destination.latitude, longitude: destination.longitude }}
          image={markerImages.dropoff}
          tracksViewChanges={false}
          anchor={{ x: 0.5, y: 1 }}
        />
      </MapView>

      {/* Bottom Controls */}
      <View style={styles.bottomBar}>
        <View style={styles.etaContainer}>
          <Text style={styles.etaValue}>{formatDuration(remainingDuration)}</Text>
          <Text style={styles.etaLabel}>{formatDistance(remainingDistance)}</Text>
        </View>

        <View style={styles.bottomButtons}>
          <TouchableOpacity style={styles.recenterButton} onPress={handleRecenter}>
            <Ionicons name="locate" size={24} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.exitButton} onPress={handleExit}>
            <Ionicons name="close" size={24} color={colors.destructive} />
            <Text style={styles.exitText}>{t('nav.exit')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const createStyles = (typography, insets) => StyleSheet.create({
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
  loadingText: {
    ...typography.body,
    color: colors.mutedForeground,
    marginTop: spacing.md,
  },
  map: {
    flex: 1,
  },

  // Instruction Bar
  instructionBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    backgroundColor: colors.primary,
    paddingTop: insets.top + spacing.sm,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    ...shadows.lg,
  },
  instructionContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  maneuverIconContainer: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  instructionTextContainer: {
    flex: 1,
  },
  instructionText: {
    ...typography.h2,
    fontWeight: '700',
    color: colors.primaryForeground,
  },
  instructionDistance: {
    ...typography.body,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
    marginTop: spacing.xs,
  },
  arrivedContainer: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  arrivedText: {
    ...typography.h1,
    fontWeight: '700',
    color: colors.primaryForeground,
    marginTop: spacing.sm,
  },
  recalcBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  recalcText: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.7)',
  },

  // Bottom Bar
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    backgroundColor: colors.background,
    paddingTop: spacing.md,
    paddingBottom: insets.bottom + spacing.md,
    paddingHorizontal: spacing.lg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...shadows.lg,
  },
  etaContainer: {
    flex: 1,
  },
  etaValue: {
    ...typography.h1,
    fontWeight: '700',
    color: colors.foreground,
  },
  etaLabel: {
    ...typography.caption,
    color: colors.mutedForeground,
  },
  bottomButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  recenterButton: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.muted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  exitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${colors.destructive}15`,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  exitText: {
    ...typography.button,
    fontWeight: '600',
    color: colors.destructive,
  },
});
