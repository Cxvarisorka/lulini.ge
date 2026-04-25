import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Dimensions,
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  Platform,
  Animated,
  PanResponder,
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
import { useDriver } from '../context/DriverContext';
import { useLocation } from '../context/LocationContext';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { useMap } from '../context/MapContext';
import { rideAPI } from '../services/api';
import { getNavigationRoute, getManeuverIcon, getManeuverInstruction, formatDistance as formatNavDistance } from '../services/directions';
import { colors, shadows, radius, spacing, useTypography } from '../theme/colors';
import { safeFitToCoordinates, safeAnimateToRegion } from '../utils/mapSafety';
import { haversineM } from '../utils/distance';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// Navigation camera constants
const NAV_ZOOM = 16.5;
const NAV_PITCH = 45;
const NAV_CAMERA_DURATION = 800;

// Bottom sheet snap points
const COLLAPSED_HEIGHT = 76; // Just enough for the go online button
const EXPANDED_HEIGHT = SCREEN_HEIGHT * 0.55;

/**
 * Countdown progress bar for ETA dispatch offers.
 * Shrinks from full width to zero over the timeout period.
 */
function OfferCountdownBar({ timeoutMs }) {
  const progress = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    progress.setValue(1);
    Animated.timing(progress, {
      toValue: 0,
      duration: timeoutMs,
      useNativeDriver: false,
    }).start();
  }, [timeoutMs]);

  return (
    <View style={{ height: 4, backgroundColor: '#e5e7eb', borderRadius: 2, marginBottom: 8, overflow: 'hidden' }}>
      <Animated.View
        style={{
          height: 4,
          borderRadius: 2,
          backgroundColor: '#f59e0b',
          width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
        }}
      />
    </View>
  );
}

export default function HomeScreen({ navigation }) {
  useKeepAwake();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const mapRef = useRef(null);
  const hasFitted = useRef(false);
  const mapReadyRef = useRef(false);
  const pendingFitRef = useRef(null); // { coords, opts } queued before map ready
  const typography = useTypography();

  const { user } = useAuth();
  const { isOnline, goOnline, goOffline, loading, stats, addActiveRide, activeRides } = useDriver();
  const { location } = useLocation();
  const { newRideRequest, clearRideRequest, isConnected, fetchPendingRides } = useSocket();
  const { isBuiltinMap } = useMap();

  const [showRideRequest, setShowRideRequest] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  // Break mode state
  const [isOnBreak, setIsOnBreak] = useState(false);
  const [breakTimeLeft, setBreakTimeLeft] = useState(0); // seconds
  const breakTimerRef = useRef(null);
  const BREAK_DURATION_SECONDS = 30 * 60; // 30 minutes
  // Decline with reason state
  const [showDeclineModal, setShowDeclineModal] = useState(false);
  const [selectedDeclineReason, setSelectedDeclineReason] = useState(null);
  const [routePolyline, setRoutePolyline] = useState([]);
  const [routeInfo, setRouteInfo] = useState(null); // { distance, duration, distanceText, durationText }
  const [followMode, setFollowMode] = useState(false); // Camera follows driver during nav
  const [routeSteps, setRouteSteps] = useState([]);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const currentStepIdxRef = useRef(0);

  // Full route stored separately — routePolyline is the trimmed (ahead-of-car) version
  const fullRouteRef = useRef([]);
  useEffect(() => { currentStepIdxRef.current = currentStepIdx; }, [currentStepIdx]);

  // Animated value for bottom sheet position (0 = collapsed, 1 = expanded)
  const sheetAnim = useRef(new Animated.Value(1)).current;

  // Derive actual heights with safe area
  const bottomPadding = insets.bottom || 20;
  const collapsedH = COLLAPSED_HEIGHT + bottomPadding;
  const expandedH = EXPANDED_HEIGHT + bottomPadding;

  const styles = useMemo(() => createStyles(typography), [typography]);

  // Animate sheet to target
  const animateSheet = useCallback((toExpanded) => {
    setIsExpanded(toExpanded);
    Animated.spring(sheetAnim, {
      toValue: toExpanded ? 1 : 0,
      useNativeDriver: false,
      damping: 20,
      stiffness: 200,
      mass: 0.8,
    }).start();
  }, [sheetAnim]);

  const panRef = useRef(null);
  const isExpandedRef = useRef(isExpanded);
  isExpandedRef.current = isExpanded;

  const createPanResponder = useCallback(() => {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) => {
        return Math.abs(gs.dy) > 8 && Math.abs(gs.dy) > Math.abs(gs.dx) * 1.5;
      },
      onPanResponderMove: (_, gs) => {
        const range = expandedH - collapsedH;
        const currentVal = isExpandedRef.current ? 1 : 0;
        const normalizedDy = -gs.dy / range;
        const newVal = Math.max(0, Math.min(1, currentVal + normalizedDy));
        sheetAnim.setValue(newVal);
      },
      onPanResponderRelease: (_, gs) => {
        if (Math.abs(gs.vy) > 0.5) {
          animateSheet(gs.vy < 0);
        } else {
          const threshold = 50;
          if (isExpandedRef.current) {
            animateSheet(gs.dy < threshold);
          } else {
            animateSheet(gs.dy < -threshold);
          }
        }
      },
    });
  }, [expandedH, collapsedH, sheetAnim, animateSheet]);

  if (!panRef.current) {
    panRef.current = createPanResponder();
  }

  // Update pan responder ref
  useEffect(() => {
    panRef.current = createPanResponder();
  }, [createPanResponder]);

  // Interpolated sheet height
  const sheetHeight = sheetAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [collapsedH, expandedH],
  });

  // Content opacity (hide stats/actions when collapsed)
  const contentOpacity = sheetAnim.interpolate({
    inputRange: [0, 0.4, 1],
    outputRange: [0, 0, 1],
  });

  // Collapsed content opacity (show go online btn when collapsed)
  const collapsedOpacity = sheetAnim.interpolate({
    inputRange: [0, 0.3],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  // My location button opacity - visible when collapsed
  useEffect(() => {
    if (newRideRequest) {
      setShowRideRequest(true);
    } else {
      setShowRideRequest(false);
    }
  }, [newRideRequest]);

  // Fit map to ride markers when active ride changes
  const activeRide = activeRides?.[0];
  useEffect(() => {
    if (!activeRide || !mapRef.current) {
      hasFitted.current = false;
      return;
    }
    if (hasFitted.current) return;
    const coords = [];
    if (location) coords.push({ latitude: location.latitude, longitude: location.longitude });

    if (isBuiltinMap) {
      // Built-in nav: fit to car + current target only
      if (activeRide.status === 'in_progress' && activeRide.dropoff?.lat) {
        coords.push({ latitude: activeRide.dropoff.lat, longitude: activeRide.dropoff.lng });
      } else if (activeRide.pickup?.lat) {
        coords.push({ latitude: activeRide.pickup.lat, longitude: activeRide.pickup.lng });
      }
    } else {
      // External nav: fit to all points
      if (activeRide.pickup?.lat) coords.push({ latitude: activeRide.pickup.lat, longitude: activeRide.pickup.lng });
      if (activeRide.dropoff?.lat) coords.push({ latitude: activeRide.dropoff.lat, longitude: activeRide.dropoff.lng });
      activeRide.stops?.forEach(s => {
        if (s.lat) coords.push({ latitude: s.lat, longitude: s.lng });
      });
    }

    if (coords.length >= 2) {
      const fitOpts = { edgePadding: { top: 80, right: 40, bottom: 40, left: 40 } };
      if (!mapReadyRef.current) {
        pendingFitRef.current = { coords, opts: fitOpts };
        return;
      }
      hasFitted.current = true;
      safeFitToCoordinates(mapRef, coords, fitOpts);
    }
  }, [activeRide?._id, activeRide?.status, location, isBuiltinMap]);

  // Re-fit map when ride status transitions (accepted → in_progress)
  // so the view switches from car→pickup to car→dropoff
  const prevStatusRef = useRef(null);
  useEffect(() => {
    if (!activeRide || !isBuiltinMap) {
      prevStatusRef.current = null;
      return;
    }
    if (prevStatusRef.current && prevStatusRef.current !== activeRide.status) {
      hasFitted.current = false; // Force re-fit on status change
    }
    prevStatusRef.current = activeRide.status;
  }, [activeRide?.status, isBuiltinMap]);

  // Fetch route polyline for built-in navigation overlay on HomeScreen
  // Only refetch when ride status/ID changes — not on every GPS tick (directions are cached anyway)
  const routeFetchedForRef = useRef(null); // "rideId:status"
  useEffect(() => {
    if (!isBuiltinMap || !activeRide || !location) {
      setRoutePolyline([]);
      setRouteInfo(null);
      setRouteSteps([]);
      setCurrentStepIdx(0);
      fullRouteRef.current = [];
      routeFetchedForRef.current = null;
      setFollowMode(false);
      return;
    }
    const key = `${activeRide._id}:${activeRide.status}`;
    if (routeFetchedForRef.current === key) return;
    routeFetchedForRef.current = key;

    let mounted = true;
    (async () => {
      try {
        // Determine target: pickup when accepted/driver_arrived, dropoff when in_progress
        let target = null;
        if ((activeRide.status === 'accepted' || activeRide.status === 'driver_arrived') && activeRide.pickup?.lat) {
          target = { latitude: activeRide.pickup.lat, longitude: activeRide.pickup.lng };
        } else if (activeRide.status === 'in_progress' && activeRide.dropoff?.lat) {
          target = { latitude: activeRide.dropoff.lat, longitude: activeRide.dropoff.lng };
        }
        if (!target) return;
        const result = await getNavigationRoute(
          { latitude: location.latitude, longitude: location.longitude },
          target,
        );
        if (result?.polyline && mounted) {
          const coords = result.polyline.map(p => ({
            latitude: Array.isArray(p) ? p[0] : p.latitude,
            longitude: Array.isArray(p) ? p[1] : p.longitude,
          }));
          fullRouteRef.current = coords;
          setRoutePolyline(coords);
          setRouteInfo({
            distance: result.distance,
            duration: result.duration,
            distanceText: result.distanceText,
            durationText: result.durationText,
          });
          setRouteSteps(result.steps || []);
          setCurrentStepIdx(0);
          setFollowMode(true); // Enter follow mode when route loads
        }
      } catch (e) {
        if (__DEV__) console.warn('[HomeScreen] Failed to fetch route:', e.message);
      }
    })();
    return () => { mounted = false; };
  }, [isBuiltinMap, activeRide?.status, activeRide?._id, location]);

  // ─── Trim polyline behind car as driver moves ────────────────────────
  // Find the closest point on the route to the driver, remove everything before it
  useEffect(() => {
    if (!location || fullRouteRef.current.length < 2 || !isBuiltinMap || !activeRide) return;

    const route = fullRouteRef.current;
    const driverLat = location.latitude;
    const driverLng = location.longitude;

    // Find closest point index on the route
    let closestIdx = 0;
    let closestDist = Infinity;
    for (let i = 0; i < route.length; i++) {
      const d = haversineM(driverLat, driverLng, route[i].latitude, route[i].longitude);
      if (d < closestDist) {
        closestDist = d;
        closestIdx = i;
      }
    }

    // Only trim if driver is within 100m of the route (avoids trimming on deviation)
    if (closestDist < 100) {
      // Insert driver's current position as the first point for a smooth line
      const trimmed = [
        { latitude: driverLat, longitude: driverLng },
        ...route.slice(closestIdx + 1),
      ];
      setRoutePolyline(trimmed);
    }
  }, [location?.latitude, location?.longitude, isBuiltinMap, activeRide]);

  // ─── Step advancement for turn-by-turn instructions ────────────────
  useEffect(() => {
    if (!location || routeSteps.length === 0) return;
    const stepIdx = currentStepIdxRef.current;
    if (stepIdx < routeSteps.length - 1) {
      const nextStep = routeSteps[stepIdx + 1];
      const dist = haversineM(
        location.latitude, location.longitude,
        nextStep.maneuver.location[0], nextStep.maneuver.location[1],
      );
      if (dist < 30) {
        setCurrentStepIdx(stepIdx + 1);
      }
    }
  }, [location?.latitude, location?.longitude, routeSteps]);

  // ─── Camera follow mode during active navigation ────────────────────
  useEffect(() => {
    if (!followMode || !location || !mapRef.current || !isBuiltinMap || !activeRide) return;

    try {
      mapRef.current.animateCamera({
        center: { latitude: location.latitude, longitude: location.longitude },
        zoom: NAV_ZOOM,
        pitch: NAV_PITCH,
        heading: (location.heading != null && isFinite(location.heading) && location.heading >= 0)
          ? location.heading : 0,
      }, { duration: NAV_CAMERA_DURATION });
    } catch {
      // Fallback — animateCamera not available
    }
  }, [location?.latitude, location?.longitude, followMode, isBuiltinMap, activeRide]);

  // ─── Break mode timer ───────────────────────────────────────────────
  useEffect(() => {
    if (isOnBreak) {
      setBreakTimeLeft(BREAK_DURATION_SECONDS);
      breakTimerRef.current = setInterval(() => {
        setBreakTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(breakTimerRef.current);
            setIsOnBreak(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      clearInterval(breakTimerRef.current);
    }
    return () => clearInterval(breakTimerRef.current);
  }, [isOnBreak]);

  // When on break, ignore incoming ride requests
  useEffect(() => {
    if (isOnBreak && newRideRequest) {
      // Silently clear the request without showing the modal
      clearRideRequest();
    }
  }, [isOnBreak, newRideRequest, clearRideRequest]);

  const handleStartBreak = () => {
    Alert.alert(
      t('breakMode.confirmBreak'),
      t('breakMode.confirmBreakDesc'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('breakMode.takeBreak'), onPress: () => setIsOnBreak(true) },
      ]
    );
  };

  const handleEndBreak = () => {
    setIsOnBreak(false);
  };

  const formatBreakTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return t('breakMode.breakTimer', { minutes: m, seconds: String(s).padStart(2, '0') });
  };

  // ─── Decline with reason ────────────────────────────────────────────
  const DECLINE_REASONS = useMemo(() => [
    { key: 'too_far', label: t('decline.too_far') },
    { key: 'low_fare', label: t('decline.low_fare') },
    { key: 'wrong_direction', label: t('decline.wrong_direction') },
    { key: 'ending_shift', label: t('decline.ending_shift') },
    { key: 'vehicle_issue', label: t('decline.vehicle_issue') },
    { key: 'other', label: t('decline.other') },
  ], [t]);

  const handleDeclinePress = () => {
    if (!newRideRequest) return;
    setSelectedDeclineReason(null);
    setShowDeclineModal(true);
  };

  const handleConfirmDecline = (reason) => {
    if (!newRideRequest) return;
    const rideIdToDecline = newRideRequest._id;
    setShowDeclineModal(false);
    setShowRideRequest(false);
    clearRideRequest();
    rideAPI.declineRide(rideIdToDecline, reason || undefined).catch(() => {});
  };

  // [H6 FIX] Prevent double-tap race condition with toggling ref
  const togglingRef = useRef(false);
  const handleToggleOnline = async () => {
    if (togglingRef.current) return;
    togglingRef.current = true;
    try {
      if (isOnline) {
        if (activeRides && activeRides.length > 0) {
          Alert.alert(t('common.error'), t('home.cannotGoOfflineActiveRide'));
          return;
        }
        const result = await goOffline();
        if (!result.success) {
          Alert.alert(t('common.error'), result.message);
        }
      } else {
        const result = await goOnline();
        if (!result.success) {
          Alert.alert(t('common.error'), result.message || t('errors.locationError'));
        } else {
          if (fetchPendingRides) {
            setTimeout(() => {
              fetchPendingRides();
            }, 500);
          }
        }
      }
    } finally {
      togglingRef.current = false;
    }
  };

  const handleAcceptRide = async () => {
    if (!newRideRequest || accepting) return;

    setAccepting(true);
    try {
      const response = await rideAPI.acceptRide(newRideRequest._id);
      if (response.data.success) {
        const acceptedRide = response.data.data.ride;
        addActiveRide(acceptedRide);
        setShowRideRequest(false);
        clearRideRequest();
        if (isBuiltinMap) {
          // Stay on HomeScreen — polyline will appear via the route effect
          hasFitted.current = false; // Force re-fit to show route
          animateSheet(false); // Collapse bottom sheet to show more map
        } else {
          navigation.navigate('RideDetail', { rideId: acceptedRide._id });
        }
      }
    } catch (error) {
      const serverMessage = error.response?.data?.message;
      // M9: Close modal on failure so UI doesn't get stuck
      setShowRideRequest(false);
      clearRideRequest();
      Alert.alert(
        t('common.error'),
        serverMessage || t('errors.somethingWentWrong')
      );
    } finally {
      setAccepting(false);
    }
  };

  const handleDeclineRide = () => {
    handleDeclinePress();
  };

  const handleMyLocation = useCallback(() => {
    if (location) {
      safeAnimateToRegion(mapRef, {
        latitude: location.latitude,
        longitude: location.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 400);
    }
  }, [location]);

  // Fallback region (Tbilisi center) used only as initialRegion
  const initialMapRegion = useRef({
    latitude: 41.6938,
    longitude: 44.8015,
    latitudeDelta: 3,
    longitudeDelta: 3,
  }).current;

  // Animate to driver's actual location once GPS resolves
  // Track what we animated to — re-animate if we first got DEFAULT_LOCATION then real GPS
  const animatedToLocationRef = useRef(null); // null | 'default' | 'real'
  useEffect(() => {
    if (!location || !mapRef.current || !mapReadyRef.current) return;

    const isDefault =
      location.latitude === 41.7151 && location.longitude === 44.8271;

    // Skip if we already animated to real GPS
    if (animatedToLocationRef.current === 'real') return;

    // If we got default before and now have real GPS, re-animate
    // If first location is real, animate once
    if (!isDefault || !animatedToLocationRef.current) {
      animatedToLocationRef.current = isDefault ? 'default' : 'real';
      safeAnimateToRegion(mapRef, {
        latitude: location.latitude,
        longitude: location.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 600);
    }
  }, [location]);

  // [L1 FIX] Memoize stats array to avoid recreation on every render
  const quickStats = useMemo(() => [
    {
      id: 'earnings',
      icon: 'cash',
      value: `${stats.last24Hours?.earnings?.toFixed(2) || '0.00'} ₾`,
      label: t('home.last24Hours'),
      color: colors.success,
    },
    {
      id: 'trips',
      icon: 'car',
      value: stats.last24Hours?.trips || 0,
      label: t('home.requests'),
      color: colors.primary,
    },
    {
      id: 'total',
      icon: 'wallet',
      value: `${stats.total?.earnings?.toFixed(2) || '0.00'} ₾`,
      label: t('home.totalEarnings'),
      color: colors.info,
    },
  ], [stats.last24Hours?.earnings, stats.last24Hours?.trips, stats.total?.earnings, t]);

  // Navigation instruction for turn-by-turn banner
  const currentNavStep = routeSteps[currentStepIdx] || null;
  const navStepDistance = useMemo(() => {
    if (!location || !routeSteps[currentStepIdx + 1]) return null;
    const nextStep = routeSteps[currentStepIdx + 1];
    return haversineM(
      location.latitude, location.longitude,
      nextStep.maneuver.location[0], nextStep.maneuver.location[1],
    );
  }, [location?.latitude, location?.longitude, routeSteps, currentStepIdx]);

  return (
    <View style={styles.container}>
      {/* Full-screen Map */}
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        colorScheme="light"
        initialRegion={initialMapRegion}
        onMapReady={() => {
          mapReadyRef.current = true;
          // Flush queued ride fit that arrived before map was ready
          if (pendingFitRef.current) {
            const { coords, opts } = pendingFitRef.current;
            pendingFitRef.current = null;
            hasFitted.current = true;
            safeFitToCoordinates(mapRef, coords, opts);
          } else if (location && !animatedToLocationRef.current) {
            // No pending fit — center on driver location
            const isDefault = location.latitude === 41.7151 && location.longitude === 44.8271;
            animatedToLocationRef.current = isDefault ? 'default' : 'real';
            safeAnimateToRegion(mapRef, {
              latitude: location.latitude,
              longitude: location.longitude,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            }, 600);
          }
        }}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
        onPanDrag={() => { if (followMode) setFollowMode(false); }}
      >
        {/* Driver location marker — rotated with GPS heading */}
        {/* iOS: AnimatedMarker required — Apple Maps ignores coordinate updates on static Marker with tracksViewChanges=false */}
        {/* Android: static Marker works fine with tracksViewChanges=false on Google Maps */}
        {location && (
          Platform.OS === 'ios' ? (
            <AnimatedMarker
              coordinate={{ latitude: location.latitude, longitude: location.longitude }}
              image={activeRide ? markerImages.carAssigned : markerImages.car}
              flat={true}
              rotation={location.heading != null && isFinite(location.heading) && location.heading >= 0 ? location.heading : 0}
              tracksViewChanges={false}
              anchor={{ x: 0.5, y: 0.5 }}
            />
          ) : (
            <Marker
              coordinate={{ latitude: location.latitude, longitude: location.longitude }}
              image={activeRide ? markerImages.carAssigned : markerImages.car}
              flat={true}
              rotation={location.heading != null && isFinite(location.heading) && location.heading >= 0 ? location.heading : 0}
              tracksViewChanges={false}
              anchor={{ x: 0.5, y: 0.5 }}
            />
          )
        )}
        {/* Active ride markers:
             Built-in nav: accepted/driver_arrived → pickup only, in_progress → dropoff only
             External nav: show all markers always */}
        {activeRide?.pickup?.lat &&
          (!isBuiltinMap || activeRide.status === 'accepted' || activeRide.status === 'driver_arrived') ? (
          <Marker
            coordinate={{ latitude: activeRide.pickup.lat, longitude: activeRide.pickup.lng }}
            image={markerImages.pickup}
            tracksViewChanges={false}
            anchor={{ x: 0.5, y: 1 }}
          />
        ) : null}
        {(!isBuiltinMap || activeRide?.status !== 'in_progress') ? (
          activeRide?.stops?.map((stop, i) => stop.lat ? (
            <Marker
              key={`stop-${i}`}
              coordinate={{ latitude: stop.lat, longitude: stop.lng }}
              image={markerImages.stopSmall[Math.min(i + 1, 9)]}
              tracksViewChanges={false}
              anchor={{ x: 0.5, y: 1 }}
            />
          ) : null)
        ) : null}
        {activeRide?.dropoff?.lat &&
          (!isBuiltinMap || activeRide.status === 'in_progress') ? (
          <Marker
            coordinate={{ latitude: activeRide.dropoff.lat, longitude: activeRide.dropoff.lng }}
            image={markerImages.dropoff}
            tracksViewChanges={false}
            anchor={{ x: 0.5, y: 1 }}
          />
        ) : null}
        {/* Route polyline — LineLayer is pinned `aboveLayerID="road-label"`
            inside PolylineWrapper so it sits below the marker SymbolLayers
            regardless of JSX order here. */}
        {routePolyline.length > 1 && (
          <Polyline
            coordinates={routePolyline}
            strokeColor="#10B981"
            strokeWidth={5}
            lineCap="round"
            lineJoin="round"
          />
        )}
      </MapView>

      {/* Top Header Overlay */}
      <View style={[styles.headerOverlay, { paddingTop: insets.top + spacing.sm }]} pointerEvents="box-none">
        <View style={styles.welcomeSection}>
          <TouchableOpacity
            style={styles.settingsButton}
            onPress={() => navigation.navigate('Settings')}
            accessibilityLabel={t('settings.title')}
            accessibilityRole="button"
          >
            <Ionicons name="settings-outline" size={24} color={colors.foreground} />
          </TouchableOpacity>
          <View style={styles.welcomeContent}>
            <Text style={styles.greeting} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
              {t('home.greeting') || 'Hello'}, {user?.firstName || 'Driver'}
            </Text>
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, {
                backgroundColor: isOnBreak ? colors.warning : (isOnline ? colors.online : colors.offline)
              }]} />
              <Text style={styles.statusText} numberOfLines={1}>
                {isOnBreak ? t('breakMode.onBreak') : (isOnline ? t('home.youAreOnline') : t('home.youAreOffline'))}
              </Text>
            </View>
          </View>
          <View
            style={[styles.connectionBadge, { backgroundColor: isConnected ? '#dcfce7' : '#fee2e2' }]}
            accessibilityLabel={isConnected ? t('connection.connected') : t('connection.reconnecting')}
            accessibilityRole="image"
          >
            <Ionicons
              name={isConnected ? 'wifi' : 'wifi-outline'}
              size={20}
              color={isConnected ? colors.success : colors.destructive}
            />
          </View>
        </View>
        {__DEV__ && (
          <View style={styles.debugBanner}>
            <View style={[styles.debugDot, { backgroundColor: isConnected ? colors.success : colors.destructive }]} />
            <Text style={styles.debugText}>
              Socket: {isConnected ? 'Connected' : 'Disconnected'}
            </Text>
          </View>
        )}
      </View>

      {/* Active ride banner — navigation instructions + destination + ETA */}
      {isBuiltinMap && activeRide && (
        <TouchableOpacity
          style={[styles.rideDetailBanner, { top: insets.top + 80 }]}
          onPress={() => navigation.navigate('RideDetail', { rideId: activeRide._id })}
          activeOpacity={0.85}
        >
          {/* Turn-by-turn instruction row */}
          {currentNavStep && (
            <View style={styles.navInstructionRow}>
              <View style={styles.navManeuverIcon}>
                <Ionicons
                  name={getManeuverIcon(currentNavStep.maneuver.type, currentNavStep.maneuver.modifier)}
                  size={22}
                  color={colors.primaryForeground}
                />
              </View>
              <Text style={styles.navInstructionText} numberOfLines={1} ellipsizeMode="tail">
                {getManeuverInstruction(currentNavStep, t)}
              </Text>
              {navStepDistance !== null && (
                <Text style={styles.navStepDistance}>{formatNavDistance(navStepDistance)}</Text>
              )}
            </View>
          )}
          {/* Destination + ETA row */}
          <View style={styles.rideDetailBannerContent}>
            <Ionicons
              name={activeRide.status === 'in_progress' ? 'flag' : 'navigate'}
              size={20}
              color={colors.primaryForeground}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.rideDetailBannerText} numberOfLines={1}>
                {activeRide.status === 'in_progress'
                  ? (activeRide.dropoff?.address || t('rides.dropoff'))
                  : (activeRide.pickup?.address || t('rides.pickup'))}
              </Text>
              {routeInfo && (
                <Text style={styles.rideDetailBannerEta} numberOfLines={1}>
                  {routeInfo.distanceText} · {routeInfo.durationText}
                </Text>
              )}
            </View>
            <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.7)" />
          </View>
        </TouchableOpacity>
      )}

      {/* Recenter button — appears when user pans away during follow mode */}
      {isBuiltinMap && activeRide && !followMode && (
        <TouchableOpacity
          style={[styles.recenterFab, { top: insets.top + (currentNavStep ? 195 : routeInfo ? 145 : 125) }]}
          onPress={() => setFollowMode(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="compass" size={22} color={colors.primary} />
        </TouchableOpacity>
      )}

      {/* My Location FAB - shows above the sheet */}
      <Animated.View
        style={[
          styles.myLocationFab,
          {
            bottom: sheetAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [collapsedH + spacing.md, expandedH + spacing.md],
            }),
          },
        ]}
        pointerEvents="box-none"
      >
        <TouchableOpacity
          style={styles.fabButton}
          onPress={handleMyLocation}
          activeOpacity={0.8}
          accessibilityLabel={t('home.myLocation') || 'My location'}
          accessibilityRole="button"
        >
          <Ionicons name="navigate" size={22} color={colors.primary} />
        </TouchableOpacity>
      </Animated.View>

      {/* Bottom Sheet */}
      <Animated.View
        style={[
          styles.bottomSheet,
          { height: sheetHeight },
        ]}
      >
        {/* Drag Handle */}
        <View {...panRef.current.panHandlers} style={styles.dragHandleArea}>
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => animateSheet(!isExpanded)}
            style={styles.dragHandleTouchable}
          >
            <View style={styles.dragHandle} />
          </TouchableOpacity>
        </View>

        {/* Collapsed content - Go Online button + status */}
        <Animated.View
          style={[styles.collapsedContent, { opacity: collapsedOpacity }]}
          pointerEvents={isExpanded ? 'none' : 'auto'}
        >
          <Pressable
            style={({ pressed }) => [
              styles.collapsedToggle,
              isOnline && styles.collapsedToggleOnline,
              loading && styles.toggleCardDisabled,
              Platform.OS === 'ios' && pressed && { opacity: 0.9 },
            ]}
            onPress={handleToggleOnline}
            disabled={loading}
            android_ripple={{ color: 'rgba(255,255,255,0.25)', borderless: false }}
            accessibilityRole="button"
            accessibilityLabel={isOnline ? t('home.goOffline') : t('home.goOnline')}
          >
            {loading ? (
              <ActivityIndicator color={colors.primaryForeground} size="small" />
            ) : (
              <>
                <View style={styles.collapsedToggleIcon}>
                  <Ionicons
                    name={isOnline ? 'pause' : 'play'}
                    size={22}
                    color={colors.primaryForeground}
                  />
                </View>
                <Text style={styles.collapsedToggleText} numberOfLines={1}>
                  {isOnline ? t('home.goOffline') : t('home.goOnline')}
                </Text>
              </>
            )}
          </Pressable>
        </Animated.View>

        {/* Expanded content */}
        <Animated.View
          style={[styles.expandedContent, { opacity: contentOpacity }]}
          pointerEvents={isExpanded ? 'auto' : 'none'}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[styles.bottomContent, { paddingBottom: bottomPadding + spacing.md }]}
            scrollEnabled={isExpanded}
            nestedScrollEnabled
          >
            {/* Quick Stats */}
            <View style={styles.statsSection}>
              <Text style={styles.sectionTitle} numberOfLines={1}>{t('home.todayStats') || 'TODAY\'S STATS'}</Text>
              <View style={styles.statsGrid}>
                {quickStats.map((stat) => (
                  <View key={stat.id} style={styles.statCard}>
                    <View style={[styles.statIcon, { backgroundColor: `${stat.color}15` }]}>
                      <Ionicons name={stat.icon} size={22} color={stat.color} />
                    </View>
                    <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{stat.value}</Text>
                    <Text style={styles.statLabel} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>{stat.label}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Toggle Button */}
            <Pressable
              style={({ pressed }) => [
                styles.toggleCard,
                isOnline && styles.toggleCardOnline,
                loading && styles.toggleCardDisabled,
                Platform.OS === 'ios' && pressed && { opacity: 0.9 },
              ]}
              onPress={handleToggleOnline}
              disabled={loading}
              android_ripple={{ color: 'rgba(255,255,255,0.25)', borderless: false }}
              accessibilityRole="button"
              accessibilityLabel={isOnline ? t('home.goOffline') : t('home.goOnline')}
              accessibilityState={{ disabled: loading }}
            >
              {loading ? (
                <View style={styles.toggleContent}>
                  <ActivityIndicator color={colors.primaryForeground} size="large" />
                  <Text style={styles.toggleText}>{t('common.loading')}</Text>
                </View>
              ) : (
                <View style={styles.toggleContent}>
                  <View style={styles.toggleIconBadge}>
                    <Ionicons
                      name={isOnline ? 'pause' : 'play'}
                      size={28}
                      color={colors.primaryForeground}
                    />
                  </View>
                  <View style={styles.toggleTextContainer}>
                    <Text style={styles.toggleTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                      {isOnline ? t('home.goOffline') : t('home.goOnline')}
                    </Text>
                    <Text style={styles.toggleSubtitle} numberOfLines={1}>
                      {isOnline ? t('home.waitingForRides') : t('home.noActiveRides')}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={24} color="rgba(255,255,255,0.7)" />
                </View>
              )}
            </Pressable>

            {/* Break Mode Button — only when online and no active ride */}
            {isOnline && (!activeRides || activeRides.length === 0) && (
              isOnBreak ? (
                <View style={styles.breakCard} accessibilityRole="none">
                  <View style={styles.breakCardContent}>
                    <View style={[styles.breakIconBadge, { backgroundColor: colors.warning + '20' }]}>
                      <Ionicons name="pause-circle" size={26} color={colors.warning} />
                    </View>
                    <View style={styles.breakTextContainer}>
                      <Text style={styles.breakTitle} numberOfLines={1}>{t('breakMode.onBreak')}</Text>
                      <Text style={styles.breakSubtitle} numberOfLines={1}>{formatBreakTime(breakTimeLeft)}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.endBreakButton}
                      onPress={handleEndBreak}
                      accessibilityRole="button"
                      accessibilityLabel={t('breakMode.accessEndBreak')}
                    >
                      <Text style={styles.endBreakText}>{t('breakMode.endBreak')}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.breakCard}
                  onPress={handleStartBreak}
                  accessibilityRole="button"
                  accessibilityLabel={t('breakMode.accessBreakButton')}
                >
                  <View style={styles.breakCardContent}>
                    <View style={styles.breakIconBadge}>
                      <Ionicons name="cafe-outline" size={22} color={colors.mutedForeground} />
                    </View>
                    <Text style={styles.breakCardText} numberOfLines={1}>{t('breakMode.takeBreak')}</Text>
                    <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
                  </View>
                </TouchableOpacity>
              )
            )}

            {/* Quick Actions */}
            <View style={styles.actionsSection}>
              <TouchableOpacity
                style={styles.actionCard}
                onPress={() => navigation.navigate('Rides')}
              >
                <View style={styles.actionIcon}>
                  <Ionicons name="car" size={22} color={colors.foreground} />
                </View>
                <View style={styles.actionContent}>
                  <Text style={styles.actionTitle} numberOfLines={1}>{t('rides.myRides')}</Text>
                  <Text style={styles.actionSubtitle} numberOfLines={1}>{t('rides.viewAll') || 'View all rides'}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionCard}
                onPress={() => navigation.navigate('Earnings')}
              >
                <View style={styles.actionIcon}>
                  <Ionicons name="trending-up" size={22} color={colors.foreground} />
                </View>
                <View style={styles.actionContent}>
                  <Text style={styles.actionTitle} numberOfLines={1}>{t('earnings.title')}</Text>
                  <Text style={styles.actionSubtitle} numberOfLines={1}>{t('earnings.viewDetails') || 'View details'}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
          </ScrollView>
        </Animated.View>
      </Animated.View>

      {/* New Ride Request Modal */}
      <Modal
        visible={showRideRequest}
        transparent
        animationType="slide"
        onRequestClose={handleDeclineRide}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.rideRequestModal, { paddingBottom: insets.bottom + spacing['3xl'] }]}>
            <View style={styles.modalDragHandle} />
            {/* ETA offer countdown bar */}
            {newRideRequest?._isOffer && <OfferCountdownBar timeoutMs={newRideRequest.offerTimeoutMs || 15000} />}
            <View style={styles.modalHeader}>
              <View style={styles.modalIconBadge}>
                <Ionicons name="car" size={28} color={colors.primaryForeground} />
              </View>
              <Text style={styles.modalTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t('rides.newRequest')}</Text>
            </View>

            {newRideRequest && (
              <View style={styles.rideDetails}>
                <View style={styles.locationCard}>
                  <View style={styles.rideDetailRow}>
                    <View style={[styles.locationDot, { backgroundColor: colors.success }]} />
                    <View style={styles.rideDetailText}>
                      <Text style={styles.rideDetailLabel} numberOfLines={1}>{t('rides.pickup')}</Text>
                      <Text style={styles.rideDetailValue} numberOfLines={2}>
                        {newRideRequest.pickup?.address || t('common.unknown')}
                      </Text>
                    </View>
                  </View>

                  {newRideRequest.stops?.length > 0 && newRideRequest.stops.map((stop, index) => (
                    <React.Fragment key={`stop-${index}`}>
                      <View style={styles.locationLine} />
                      <View style={styles.rideDetailRow}>
                        <View style={[styles.locationDot, { backgroundColor: colors.stop }]} />
                        <View style={styles.rideDetailText}>
                          <Text style={styles.rideDetailLabel} numberOfLines={1}>{t('rides.stop')} {index + 1}</Text>
                          <Text style={styles.rideDetailValue} numberOfLines={2}>{stop.address}</Text>
                        </View>
                      </View>
                    </React.Fragment>
                  ))}

                  <View style={styles.locationLine} />

                  <View style={styles.rideDetailRow}>
                    <View style={[styles.locationDot, { backgroundColor: colors.destructive }]} />
                    <View style={styles.rideDetailText}>
                      <Text style={styles.rideDetailLabel} numberOfLines={1}>{t('rides.dropoff')}</Text>
                      <Text style={styles.rideDetailValue} numberOfLines={2}>
                        {newRideRequest.dropoff?.address || t('common.unknown')}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Payment Method */}
                <View style={styles.paymentMethodRow}>
                  <Ionicons
                    name={newRideRequest.paymentMethod === 'cash' ? 'cash-outline' : 'card-outline'}
                    size={18}
                    color={colors.mutedForeground}
                  />
                  <Text style={styles.paymentMethodText} numberOfLines={1}>
                    {t(`rides.paymentMethod_${newRideRequest.paymentMethod || 'cash'}`)}
                  </Text>
                </View>

                <View style={styles.rideInfoGrid}>
                  <View style={styles.rideInfoItem}>
                    <Text style={styles.rideInfoLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t('rides.distance')}</Text>
                    <Text style={styles.rideInfoValue} numberOfLines={1}>
                      {newRideRequest.quote?.distanceText || '-'}
                    </Text>
                  </View>
                  <View style={styles.rideInfoItem}>
                    <Text style={styles.rideInfoLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t('rides.estimatedFare')}</Text>
                    <Text style={styles.rideInfoValue} numberOfLines={1}>
                      {newRideRequest.quote?.totalPrice?.toFixed(2) || '0.00'} ₾
                    </Text>
                  </View>
                </View>

                {/* Earnings Breakdown */}
                <View style={styles.earningsBreakdown}>
                  <View style={styles.earningsRow}>
                    <Text style={styles.earningsLabel}>{t('rides.commission')} ({newRideRequest.commissionPercent || 0}%)</Text>
                    <Text style={styles.earningsCommission}>-{(newRideRequest.commissionAmount || 0).toFixed(2)} ₾</Text>
                  </View>
                  <View style={styles.earningsDivider} />
                  <View style={styles.earningsRow}>
                    <Text style={styles.yourEarningsLabel}>{t('rides.yourEarnings')}</Text>
                    <Text style={styles.yourEarningsValue}>{(newRideRequest.driverEarnings || 0).toFixed(2)} ₾</Text>
                  </View>
                </View>
              </View>
            )}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.declineButton}
                onPress={handleDeclineRide}
                disabled={accepting}
                accessibilityRole="button"
                accessibilityLabel={t('rides.decline')}
              >
                <Ionicons name="close" size={20} color={colors.destructive} />
                <Text style={styles.declineButtonText} numberOfLines={1}>{t('rides.decline')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.acceptButton, accepting && styles.acceptButtonDisabled]}
                onPress={handleAcceptRide}
                disabled={accepting}
                accessibilityRole="button"
                accessibilityLabel={t('rides.accept')}
                accessibilityState={{ disabled: accepting }}
              >
                {accepting ? (
                  <ActivityIndicator color={colors.primaryForeground} />
                ) : (
                  <>
                    <Ionicons name="checkmark" size={20} color={colors.primaryForeground} />
                    <Text style={styles.acceptButtonText} numberOfLines={1}>{t('rides.accept')}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Decline with Reason Modal */}
      <Modal
        visible={showDeclineModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDeclineModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.declineReasonModal, { paddingBottom: insets.bottom + spacing.lg }]}>
            <View style={styles.modalDragHandle} />
            <Text style={styles.declineReasonTitle}>{t('decline.selectReason')}</Text>
            <View style={styles.declineReasonsGrid}>
              {DECLINE_REASONS.map((reason) => (
                <TouchableOpacity
                  key={reason.key}
                  style={[
                    styles.declineReasonChip,
                    selectedDeclineReason === reason.key && styles.declineReasonChipSelected,
                  ]}
                  onPress={() => setSelectedDeclineReason(
                    selectedDeclineReason === reason.key ? null : reason.key
                  )}
                  accessibilityRole="button"
                  accessibilityLabel={reason.label}
                  accessibilityState={{ selected: selectedDeclineReason === reason.key }}
                >
                  <Text style={[
                    styles.declineReasonChipText,
                    selectedDeclineReason === reason.key && styles.declineReasonChipTextSelected,
                  ]}>
                    {reason.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={styles.declineConfirmButton}
              onPress={() => handleConfirmDecline(selectedDeclineReason)}
              accessibilityRole="button"
              accessibilityLabel={t('decline.declineWithReason')}
            >
              <Text style={styles.declineConfirmText}>{t('decline.declineWithReason')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.declineSkipButton}
              onPress={() => handleConfirmDecline(null)}
              accessibilityRole="button"
              accessibilityLabel={t('decline.skip')}
            >
              <Text style={styles.declineSkipText}>{t('decline.skip')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (typography) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.muted,
  },
  // Header
  headerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
    zIndex: 10,
  },
  welcomeSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
    ...shadows.md,
  },
  settingsButton: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.muted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  welcomeContent: {
    flex: 1,
  },
  greeting: {
    ...typography.bodyMedium,
    fontWeight: '700',
    color: colors.foreground,
    marginBottom: spacing.xs,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.sm,
  },
  statusText: {
    ...typography.caption,
    fontWeight: '500',
    color: colors.mutedForeground,
  },
  connectionBadge: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.muted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  debugBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    marginTop: spacing.xs,
    alignSelf: 'flex-start',
  },
  debugDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.xs,
  },
  debugText: {
    fontSize: 11,
    color: '#fff',
    fontFamily: 'monospace',
  },

  // Ride detail banner (built-in nav)
  rideDetailBanner: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 10,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadows.md,
  },
  navInstructionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.15)',
  },
  navManeuverIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  navInstructionText: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.primaryForeground,
    flex: 1,
  },
  navStepDistance: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
  },
  rideDetailBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  rideDetailBannerText: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.primaryForeground,
  },
  rideDetailBannerEta: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  recenterFab: {
    position: 'absolute',
    right: spacing.lg,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.md,
  },

  // My Location FAB
  myLocationFab: {
    position: 'absolute',
    right: spacing.lg,
    zIndex: 5,
  },
  fabButton: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.md,
  },

  // Bottom Sheet
  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.background,
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    ...shadows.lg,
    overflow: 'hidden',
  },
  dragHandleArea: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    zIndex: 10,
  },
  dragHandleTouchable: {
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  dragHandle: {
    width: 36,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.border,
  },

  // Collapsed view
  collapsedContent: {
    position: 'absolute',
    top: 28,
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
  },
  collapsedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
    ...shadows.md,
  },
  collapsedToggleOnline: {
    backgroundColor: colors.success,
  },
  collapsedToggleIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  collapsedToggleText: {
    ...typography.bodyMedium,
    fontWeight: '700',
    color: colors.primaryForeground,
  },

  // Expanded view
  expandedContent: {
    flex: 1,
  },
  bottomContent: {
    padding: spacing.lg,
    paddingTop: spacing.xs,
  },
  statsSection: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    ...typography.label,
    fontWeight: '600',
    color: colors.mutedForeground,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.muted,
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: 'center',
  },
  statIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  statValue: {
    ...typography.bodyMedium,
    fontWeight: '700',
    color: colors.foreground,
    marginBottom: 2,
  },
  statLabel: {
    ...typography.captionSmall,
    color: colors.mutedForeground,
    textAlign: 'center',
  },
  toggleCard: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    overflow: 'hidden',
    ...shadows.md,
  },
  toggleCardOnline: {
    backgroundColor: colors.success,
  },
  toggleCardDisabled: {
    opacity: 0.7,
  },
  toggleContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  toggleIconBadge: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  toggleTextContainer: {
    flex: 1,
  },
  toggleTitle: {
    ...typography.h2,
    fontWeight: '700',
    color: colors.primaryForeground,
    marginBottom: 2,
  },
  toggleSubtitle: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.8)',
  },
  toggleText: {
    ...typography.bodySmall,
    color: colors.primaryForeground,
    marginTop: spacing.sm,
  },
  actionsSection: {
    gap: spacing.sm,
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.muted,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  actionContent: {
    flex: 1,
  },
  actionTitle: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.foreground,
  },
  actionSubtitle: {
    ...typography.caption,
    color: colors.mutedForeground,
    marginTop: 2,
  },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  rideRequestModal: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    padding: spacing.xl,
    paddingBottom: spacing['3xl'],
  },
  modalDragHandle: {
    width: 36,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  modalIconBadge: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  modalTitle: {
    ...typography.h1,
    fontWeight: '700',
    color: colors.foreground,
  },
  rideDetails: {
    marginBottom: spacing.xl,
  },
  locationCard: {
    backgroundColor: colors.muted,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  rideDetailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  locationDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 4,
    marginRight: spacing.md,
  },
  locationLine: {
    width: 2,
    height: 24,
    backgroundColor: colors.border,
    marginLeft: 5,
    marginVertical: spacing.sm,
  },
  rideDetailText: {
    flex: 1,
  },
  rideDetailLabel: {
    ...typography.captionSmall,
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  rideDetailValue: {
    ...typography.bodySmall,
    fontWeight: '500',
    color: colors.foreground,
  },
  rideInfoGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  rideInfoItem: {
    flex: 1,
    backgroundColor: colors.muted,
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: 'center',
  },
  rideInfoLabel: {
    ...typography.captionSmall,
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  rideInfoValue: {
    ...typography.bodyMedium,
    fontWeight: '600',
    color: colors.foreground,
  },
  paymentMethodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.muted,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
  },
  paymentMethodText: {
    ...typography.bodySmall,
    color: colors.mutedForeground,
    fontWeight: '500',
  },
  earningsBreakdown: {
    marginTop: spacing.sm,
    backgroundColor: colors.muted,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  earningsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  earningsLabel: {
    ...typography.captionSmall,
    color: colors.mutedForeground,
  },
  earningsCommission: {
    ...typography.bodySmall,
    color: colors.destructive,
    fontWeight: '500',
  },
  earningsDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
  },
  yourEarningsLabel: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.foreground,
  },
  yourEarningsValue: {
    ...typography.bodyMedium,
    fontWeight: '700',
    color: colors.success,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  declineButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${colors.destructive}15`,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  declineButtonText: {
    ...typography.button,
    color: colors.destructive,
  },
  acceptButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.success,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  acceptButtonDisabled: {
    opacity: 0.6,
  },
  acceptButtonText: {
    ...typography.button,
    color: colors.primaryForeground,
  },
  // Break mode
  breakCard: {
    backgroundColor: colors.background,
    borderRadius: radius.xl,
    marginBottom: spacing.md,
    ...shadows.sm,
    overflow: 'hidden',
  },
  breakCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.sm,
  },
  breakIconBadge: {
    width: 40,
    height: 40,
    borderRadius: radius.lg,
    backgroundColor: colors.muted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  breakCardText: {
    ...typography.body,
    color: colors.mutedForeground,
    flex: 1,
    fontWeight: '500',
  },
  breakTitle: {
    ...typography.body,
    color: colors.warning,
    fontWeight: '700',
  },
  breakSubtitle: {
    ...typography.captionSmall,
    color: colors.mutedForeground,
  },
  breakTextContainer: {
    flex: 1,
  },
  endBreakButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  endBreakText: {
    ...typography.captionSmall,
    color: colors.primaryForeground,
    fontWeight: '700',
  },
  // Decline with reason
  declineReasonModal: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    padding: spacing.xl,
  },
  declineReasonTitle: {
    ...typography.h3,
    fontWeight: '700',
    color: colors.foreground,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  declineReasonsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.xl,
    justifyContent: 'center',
  },
  declineReasonChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.muted,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  declineReasonChipSelected: {
    backgroundColor: colors.primary + '15',
    borderColor: colors.primary,
  },
  declineReasonChipText: {
    ...typography.bodySmall,
    color: colors.foreground,
    fontWeight: '500',
  },
  declineReasonChipTextSelected: {
    color: colors.primary,
    fontWeight: '700',
  },
  declineConfirmButton: {
    backgroundColor: colors.destructive,
    borderRadius: radius.xl,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  declineConfirmText: {
    ...typography.button,
    color: colors.primaryForeground,
  },
  declineSkipButton: {
    alignItems: 'center',
    padding: spacing.md,
  },
  declineSkipText: {
    ...typography.bodySmall,
    color: colors.mutedForeground,
  },
});
