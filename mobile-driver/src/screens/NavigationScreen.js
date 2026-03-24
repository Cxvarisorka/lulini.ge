import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StatusBar,
  Platform,
  Animated,
} from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import MapView from '../components/map/MapViewWrapper';
import Marker from '../components/map/MarkerWrapper';
import AnimatedMarker from '../components/map/AnimatedMarkerWrapper';
import Polyline from '../components/map/PolylineWrapper';
import { markerImages } from '../components/map/markerImages';
import { mapStyle } from '../components/map/mapStyle';
import { useLocation } from '../context/LocationContext';
import { useSocket } from '../context/SocketContext';
import { useDriver } from '../context/DriverContext';
import { rideAPI } from '../services/api';
import { safeFitToCoordinates, safeAnimateToRegion } from '../utils/mapSafety';
import { colors, shadows, radius, spacing, useTypography } from '../theme/colors';
import {
  getNavigationRoute,
  formatDistance,
  formatDuration,
  getManeuverIcon,
  getManeuverInstruction,
} from '../services/directions';
import { haversineM } from '../utils/distance';

const STEP_ARRIVAL_THRESHOLD = 25; // meters — snappy step changes
const ROUTE_DEVIATION_THRESHOLD = 50; // meters — Bolt-like sensitivity
const RECALC_COOLDOWN = 5000; // ms
const ARRIVAL_RADIUS = 50; // meters — proximity for action buttons

// Camera follow-mode constants
const NAV_ZOOM = 17;
const NAV_PITCH = 45;
const CAMERA_ANIM_DURATION = 1000; // ms

export default function NavigationScreen({ navigation, route: navRoute }) {
  useKeepAwake();
  const { destination: paramDestination, origin, ride: rideParam } = navRoute.params;
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const typography = useTypography();
  const styles = useMemo(() => createStyles(typography, insets), [typography, insets]);
  const { location, setActiveRide } = useLocation();
  const { socket } = useSocket();
  const { updateActiveRide, removeActiveRide, invalidateCache } = useDriver();

  // ─── Ride state ────────────────────────────────────────────────────
  const [ride, setRide] = useState(rideParam || null);
  const [actionLoading, setActionLoading] = useState(false);
  const rideRef = useRef(ride);
  useEffect(() => { rideRef.current = ride; }, [ride]);

  // Navigation phase from ride status
  const navPhase = useMemo(() => {
    if (!ride) return null;
    if (ride.status === 'accepted') return 'to_pickup';
    if (ride.status === 'driver_arrived') return 'at_pickup';
    if (ride.status === 'in_progress') return 'to_dropoff';
    return null;
  }, [ride?.status]);

  // Compute destination based on ride phase (falls back to explicit param)
  const destination = useMemo(() => {
    if (!ride) return paramDestination;
    if ((navPhase === 'to_pickup' || navPhase === 'at_pickup') && ride.pickup?.lat) {
      return { latitude: ride.pickup.lat, longitude: ride.pickup.lng, address: ride.pickup.address };
    }
    if (navPhase === 'to_dropoff' && ride.dropoff?.lat) {
      return { latitude: ride.dropoff.lat, longitude: ride.dropoff.lng, address: ride.dropoff.address };
    }
    return paramDestination;
  }, [ride, navPhase, paramDestination]);

  // ─── Core navigation state ─────────────────────────────────────────
  const [routeData, setRouteData] = useState(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [polylineCoords, setPolylineCoords] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [hasArrived, setHasArrived] = useState(false);
  const [followMode, setFollowMode] = useState(true);

  const mapRef = useRef(null);
  const carMarkerRef = useRef(null);
  const lastRecalcTimeRef = useRef(0);
  const routeDataRef = useRef(null);
  const currentStepIndexRef = useRef(0);
  const hasFittedRef = useRef(false);
  const mountedRef = useRef(true);
  const headingRef = useRef(0);
  const androidRotation = useRef(new Animated.Value(0)).current;
  const fullRouteRef = useRef([]); // Full untrimmed route for polyline trimming

  // Cleanup on unmount
  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  // Keep refs in sync
  useEffect(() => { routeDataRef.current = routeData; }, [routeData]);
  useEffect(() => { currentStepIndexRef.current = currentStepIndex; }, [currentStepIndex]);

  // Use location from context — the driver's position
  const driverLocation = location || origin;

  // ─── Fetch route on mount ──────────────────────────────────────────
  useEffect(() => {
    if (navPhase === 'at_pickup') {
      // At pickup — no navigation needed, show waiting state
      setIsLoading(false);
      setHasArrived(true);
    } else {
      fetchRoute();
    }
  }, []);

  // ─── Re-route on phase transition ─────────────────────────────────
  const prevPhaseRef = useRef(navPhase);
  useEffect(() => {
    if (!prevPhaseRef.current || !navPhase) {
      prevPhaseRef.current = navPhase;
      return;
    }
    if (navPhase !== prevPhaseRef.current) {
      prevPhaseRef.current = navPhase;
      if (navPhase === 'to_dropoff') {
        // Transition to dropoff phase — re-route
        setHasArrived(false);
        setCurrentStepIndex(0);
        fullRouteRef.current = [];
        hasFittedRef.current = false;
        fetchRoute();
      } else if (navPhase === 'at_pickup') {
        setHasArrived(true);
      }
    }
  }, [navPhase]);

  // ─── Socket listener for ride updates ──────────────────────────────
  useEffect(() => {
    if (!socket || !ride?._id) return;

    const handleRideUpdated = (updatedRide) => {
      if (updatedRide?._id !== ride._id) return;
      setRide(updatedRide);
    };

    const handleCancelled = (data) => {
      const cancelledId = data?._id || data?.rideId;
      if (cancelledId && cancelledId !== ride._id) return;
      setActiveRide(null);
      Alert.alert(t('rides.rideCancelled'), t('rides.passengerCancelledRide'), [
        { text: t('common.ok'), onPress: () => navigation.goBack() },
      ]);
    };

    socket.on('ride:updated', handleRideUpdated);
    socket.on('ride:cancelled', handleCancelled);

    return () => {
      socket.off('ride:updated', handleRideUpdated);
      socket.off('ride:cancelled', handleCancelled);
    };
  }, [socket, ride?._id, navigation, t]);

  // ─── Location-based updates — step advancement, deviation ─────────
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
  }, [driverLocation?.latitude, driverLocation?.longitude, destination]);

  // ─── Polyline trimming — remove traveled portion ───────────────────
  useEffect(() => {
    if (!driverLocation || fullRouteRef.current.length < 2 || hasArrived) return;

    const route = fullRouteRef.current;
    let closestIdx = 0;
    let closestDist = Infinity;
    for (let i = 0; i < route.length; i++) {
      const d = haversineM(
        driverLocation.latitude, driverLocation.longitude,
        route[i].latitude, route[i].longitude
      );
      if (d < closestDist) {
        closestDist = d;
        closestIdx = i;
      }
    }

    // Only trim if driver is within 100m of route (avoids trimming on deviation)
    if (closestDist < 100) {
      const trimmed = [
        { latitude: driverLocation.latitude, longitude: driverLocation.longitude },
        ...route.slice(closestIdx + 1),
      ];
      setPolylineCoords(trimmed);
    }
  }, [driverLocation?.latitude, driverLocation?.longitude, hasArrived]);

  // ─── Proximity to target ───────────────────────────────────────────
  const distanceToTarget = useMemo(() => {
    if (!driverLocation || !destination) return null;
    return haversineM(
      driverLocation.latitude, driverLocation.longitude,
      destination.latitude, destination.longitude,
    );
  }, [driverLocation?.latitude, driverLocation?.longitude, destination?.latitude, destination?.longitude]);

  const isNearTarget = distanceToTarget !== null && distanceToTarget <= ARRIVAL_RADIUS;

  // ─── Route fetching ────────────────────────────────────────────────
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
    if (!mountedRef.current) return;
    if (!result) {
      Alert.alert(t('common.error'), t('nav.routeError'));
      navigation.goBack();
      return;
    }
    setRouteData(result);
    setCurrentStepIndex(0);
    setIsLoading(false);

    if (result.polyline?.length) {
      const coords = result.polyline.map(p => ({
        latitude: Array.isArray(p) ? p[0] : p.latitude,
        longitude: Array.isArray(p) ? p[1] : p.longitude,
      }));
      fullRouteRef.current = coords;
      setPolylineCoords(coords);
    }
  };

  const getMinDistanceToPolyline = (pos, polyline) => {
    let minDist = Infinity;
    for (let i = 0; i < polyline.length; i += 2) {
      const p = polyline[i];
      const lat = Array.isArray(p) ? p[0] : p.latitude;
      const lng = Array.isArray(p) ? p[1] : p.longitude;
      const d = haversineM(pos.latitude, pos.longitude, lat, lng);
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
    if (!mountedRef.current) return;
    if (result) {
      setRouteData(result);
      setCurrentStepIndex(0);
      if (result.polyline?.length) {
        const coords = result.polyline.map(p => ({
          latitude: Array.isArray(p) ? p[0] : p.latitude,
          longitude: Array.isArray(p) ? p[1] : p.longitude,
        }));
        fullRouteRef.current = coords;
        setPolylineCoords(coords);
      }
    }
    setIsRecalculating(false);
  };

  // ─── Ride action handlers ──────────────────────────────────────────
  const handleArrived = async () => {
    if (!ride || actionLoading) return;
    if (!isNearTarget) {
      Alert.alert(t('common.error'), t('rides.tooFarFromPickup', { distance: Math.round(distanceToTarget) }));
      return;
    }
    setActionLoading(true);
    try {
      const response = await rideAPI.notifyArrival(ride._id);
      if (response.data.success) {
        const updatedRide = response.data.data.ride;
        setRide(updatedRide);
        updateActiveRide(ride._id, updatedRide);
      }
    } catch (error) {
      Alert.alert(t('common.error'), error.response?.data?.message || t('errors.somethingWentWrong'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleStartRide = async () => {
    if (!ride || actionLoading) return;
    setActionLoading(true);
    try {
      const response = await rideAPI.startRide(ride._id);
      if (response.data.success) {
        const startedRide = response.data.data.ride;
        setRide(startedRide);
        updateActiveRide(ride._id, startedRide);
        setActiveRide(startedRide);
      }
    } catch (error) {
      Alert.alert(t('common.error'), error.response?.data?.message || t('errors.somethingWentWrong'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleCompleteRide = async () => {
    if (!ride || actionLoading) return;
    if (!isNearTarget) {
      Alert.alert(t('common.error'), t('rides.tooFarFromDropoff', { distance: Math.round(distanceToTarget) }));
      return;
    }
    Alert.alert(
      t('rides.completeRide'),
      t('rides.confirmComplete'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.confirm'),
          onPress: async () => {
            setActionLoading(true);
            try {
              const fare = parseFloat(ride.quote?.totalPrice || 0);
              const response = await rideAPI.completeRide(ride._id, fare);
              if (response.data.success) {
                removeActiveRide(ride._id);
                invalidateCache();
                setActiveRide(null);
                navigation.goBack();
                Alert.alert(t('common.success'), t('rides.rideCompletedSuccess'));
              }
            } catch (error) {
              Alert.alert(t('common.error'), error.response?.data?.message || t('errors.somethingWentWrong'));
            } finally {
              setActionLoading(false);
            }
          },
        },
      ],
    );
  };

  // ─── Map callbacks ─────────────────────────────────────────────────
  const onMapReady = useCallback(() => {
    if (hasFittedRef.current || !mapRef.current) return;
    const coords = [];
    if (driverLocation) coords.push({ latitude: driverLocation.latitude, longitude: driverLocation.longitude });
    coords.push({ latitude: destination.latitude, longitude: destination.longitude });
    if (coords.length >= 2) {
      hasFittedRef.current = true;
      safeFitToCoordinates(mapRef, coords, {
        edgePadding: { top: 120, right: 60, bottom: 100, left: 60 },
        animated: false,
      });
    }
  }, [driverLocation, destination]);

  const handleRecenter = useCallback(() => {
    setFollowMode(true);
    if (driverLocation && mapRef.current) {
      try {
        mapRef.current.animateCamera({
          center: { latitude: driverLocation.latitude, longitude: driverLocation.longitude },
          heading: headingRef.current || 0,
          pitch: NAV_PITCH,
          zoom: NAV_ZOOM,
        }, { duration: 500 });
      } catch {
        safeAnimateToRegion(mapRef, {
          latitude: driverLocation.latitude,
          longitude: driverLocation.longitude,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        }, 300);
      }
    }
  }, [driverLocation]);

  // Camera follow-mode: track driver position + heading in 3D perspective
  useEffect(() => {
    if (!followMode || !driverLocation || !mapRef.current || hasArrived) return;

    const heading = driverLocation.heading;
    if (heading != null && isFinite(heading) && heading >= 0) {
      headingRef.current = heading;
    }

    try {
      mapRef.current.animateCamera({
        center: { latitude: driverLocation.latitude, longitude: driverLocation.longitude },
        heading: headingRef.current || 0,
        pitch: NAV_PITCH,
        zoom: NAV_ZOOM,
      }, { duration: CAMERA_ANIM_DURATION });
    } catch {
      // Fallback if animateCamera is not available
    }
  }, [driverLocation?.latitude, driverLocation?.longitude, driverLocation?.heading, followMode, hasArrived]);

  // Smooth car marker animation on Android
  useEffect(() => {
    if (!driverLocation || !carMarkerRef.current) return;

    if (Platform.OS === 'android' && carMarkerRef.current.animateMarkerToCoordinate) {
      try {
        carMarkerRef.current.animateMarkerToCoordinate(
          { latitude: driverLocation.latitude, longitude: driverLocation.longitude },
          CAMERA_ANIM_DURATION
        );
      } catch {
        // Coordinate prop update handles fallback
      }
    }

    // Smooth heading rotation
    const heading = driverLocation.heading;
    if (heading != null && isFinite(heading) && heading >= 0) {
      const current = headingRef.current;
      let diff = ((heading - current + 540) % 360) - 180;
      const target = current + diff;
      headingRef.current = target;

      Animated.timing(androidRotation, {
        toValue: target,
        duration: 300,
        useNativeDriver: false,
      }).start();
    }
  }, [driverLocation?.latitude, driverLocation?.longitude, driverLocation?.heading]);

  const handleMapPanDrag = useCallback(() => {
    setFollowMode(false);
  }, []);

  const handleExit = () => {
    navigation.goBack();
  };

  // ─── Computed navigation data ──────────────────────────────────────
  const currentStep = routeData?.steps?.[currentStepIndex];
  const nextStep = routeData?.steps?.[currentStepIndex + 1];

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

  // Destination marker image based on ride phase
  const destinationMarkerImage = useMemo(() => {
    if (!ride) return markerImages.dropoff;
    if (navPhase === 'to_pickup' || navPhase === 'at_pickup') return markerImages.pickup;
    return markerImages.dropoff;
  }, [ride, navPhase]);

  // Action button configuration based on ride status + proximity
  const actionButton = useMemo(() => {
    if (!ride) return null;
    switch (ride.status) {
      case 'accepted':
        return {
          label: t('rides.imHere'),
          icon: 'location-sharp',
          color: colors.warning,
          onPress: handleArrived,
          disabled: !isNearTarget,
          hint: !isNearTarget && distanceToTarget !== null
            ? t('rides.tooFarFromPickup', { distance: Math.round(distanceToTarget) })
            : null,
        };
      case 'driver_arrived':
        return {
          label: t('rides.startRide'),
          icon: 'play',
          color: colors.primary,
          onPress: handleStartRide,
          disabled: false,
          hint: null,
        };
      case 'in_progress':
        return {
          label: t('rides.completeRide'),
          icon: 'checkmark',
          color: colors.success,
          onPress: handleCompleteRide,
          disabled: !isNearTarget,
          hint: !isNearTarget && distanceToTarget !== null
            ? t('rides.tooFarFromDropoff', { distance: Math.round(distanceToTarget) })
            : null,
        };
      default:
        return null;
    }
  }, [ride?.status, isNearTarget, distanceToTarget, t]);

  // ─── Render ────────────────────────────────────────────────────────
  if (isLoading && navPhase !== 'at_pickup') {
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
        {navPhase === 'at_pickup' ? (
          <View style={styles.arrivedContainer}>
            <Ionicons name="location-sharp" size={32} color={colors.success} />
            <Text style={styles.arrivedText}>{t('rides.waitingForPassenger')}</Text>
          </View>
        ) : hasArrived ? (
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
        customMapStyle={mapStyle}
        initialRegion={{
          latitude: driverLocation?.latitude || destination.latitude,
          longitude: driverLocation?.longitude || destination.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }}
        onMapReady={onMapReady}
        onPanDrag={handleMapPanDrag}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
      >
        {/* Route polyline — trimmed to show only remaining route */}
        {polylineCoords.length > 0 && (
          <Polyline
            coordinates={polylineCoords}
            strokeColor={colors.primary}
            strokeWidth={5}
            lineCap="round"
            lineJoin="round"
          />
        )}
        {/* Driver marker — animated with heading rotation */}
        {driverLocation && (
          Platform.OS === 'android' ? (
            <AnimatedMarker
              ref={carMarkerRef}
              coordinate={{ latitude: driverLocation.latitude, longitude: driverLocation.longitude }}
              image={markerImages.carAssigned}
              flat={true}
              rotation={androidRotation}
              tracksViewChanges={false}
              anchor={{ x: 0.5, y: 0.5 }}
              zIndex={10}
            />
          ) : (
            <AnimatedMarker
              ref={carMarkerRef}
              coordinate={{ latitude: driverLocation.latitude, longitude: driverLocation.longitude }}
              image={markerImages.carAssigned}
              flat={true}
              rotation={headingRef.current || 0}
              tracksViewChanges={false}
              anchor={{ x: 0.5, y: 0.5 }}
              zIndex={10}
            />
          )
        )}
        {/* Destination marker — pickup or dropoff based on phase */}
        <Marker
          coordinate={{ latitude: destination.latitude, longitude: destination.longitude }}
          image={destinationMarkerImage}
          tracksViewChanges={false}
          anchor={{ x: 0.5, y: 1 }}
        />
      </MapView>

      {/* Bottom Controls */}
      <View style={styles.bottomBar}>
        {/* Ride action button */}
        {actionButton && (
          <View style={styles.actionButtonContainer}>
            <TouchableOpacity
              style={[
                styles.actionButton,
                { backgroundColor: actionButton.color },
                (actionButton.disabled || actionLoading) && styles.actionButtonDisabled,
              ]}
              onPress={actionButton.onPress}
              disabled={actionButton.disabled || actionLoading}
              activeOpacity={0.8}
            >
              {actionLoading ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <>
                  <Ionicons name={actionButton.icon} size={22} color={colors.primaryForeground} />
                  <Text style={styles.actionButtonText}>{actionButton.label}</Text>
                </>
              )}
            </TouchableOpacity>
            {actionButton.hint && (
              <Text style={styles.proximityHint}>{actionButton.hint}</Text>
            )}
          </View>
        )}

        <View style={styles.bottomRow}>
          <View style={styles.etaContainer}>
            <Text style={styles.etaValue}>{formatDuration(remainingDuration)}</Text>
            <Text style={styles.etaLabel}>{formatDistance(remainingDistance)}</Text>
          </View>

          <View style={styles.bottomButtons}>
            <TouchableOpacity
              style={[styles.recenterButton, !followMode && styles.recenterButtonActive]}
              onPress={handleRecenter}
            >
              <Ionicons name={followMode ? 'navigate' : 'locate'} size={24} color={followMode ? colors.mutedForeground : colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.exitButton} onPress={handleExit}>
              <Ionicons name="close" size={24} color={colors.destructive} />
              <Text style={styles.exitText}>{t('nav.exit')}</Text>
            </TouchableOpacity>
          </View>
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
    ...typography.h2,
    fontWeight: '700',
    color: colors.primaryForeground,
    marginTop: spacing.sm,
    textAlign: 'center',
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
    ...shadows.lg,
  },
  actionButtonContainer: {
    marginBottom: spacing.md,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.xl,
    paddingVertical: spacing.lg,
    gap: spacing.sm,
  },
  actionButtonText: {
    ...typography.button,
    fontWeight: '700',
    color: colors.primaryForeground,
  },
  actionButtonDisabled: {
    opacity: 0.4,
  },
  proximityHint: {
    ...typography.captionSmall,
    color: colors.mutedForeground,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  recenterButtonActive: {
    backgroundColor: `${colors.primary}20`,
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
