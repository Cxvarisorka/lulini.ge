import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  AppState,
  Animated,
} from 'react-native';
import MapView from '../components/map/MapViewWrapper';
import Polyline from '../components/map/PolylineWrapper';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as Crypto from 'expo-crypto';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useNetwork } from '../context/NetworkContext';
import * as WebBrowser from 'expo-web-browser';
import { taxiAPI, settingsAPI, paymentAPI } from '../services/api';
import { persistRideState, loadRideState, clearRideState, persistLastDestination, loadLastDestination } from '../services/rideStorage';
import {
  showRideNotification,
  dismissRideNotification,
} from '../services/rideNotification';
import { getDirections, getDirectionsOSRM, reverseGeocode } from '../services/googleMaps';
import { shadows, radius, useTypography } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';
import { notificationSuccess, notificationWarning, notificationError, mediumImpact } from '../utils/haptics';
import { rideAccepted, rideArrived, rideCompleted, rideCancelled } from '../utils/sounds';
import { maybePromptReview } from '../utils/reviewPrompt';
import CancelRideModal from '../components/CancelRideModal';
import RideReviewModal from '../components/RideReviewModal';
import LocationSearchSheet from '../components/taxi/LocationSearchSheet';
import RideOptionsSheet from '../components/taxi/RideOptionsSheet';
import RideStatusSheet from '../components/taxi/RideStatusSheet';
import DraggableBottomSheet from '../components/taxi/DraggableBottomSheet';
import PaymentMethodModal from '../components/taxi/PaymentMethodModal';
import { VEHICLE_TYPES } from '../components/taxi/VehicleTypeSelector';
// Using native showsUserLocation instead of PulsingUserMarker
import DestinationMarker from '../components/map/DestinationMarker';
import AnimatedCarMarker from '../components/map/AnimatedCarMarker';
import DriverCluster from '../components/map/DriverCluster';
import StopMarker from '../components/map/StopMarker';
import DraggablePickupMarker from '../components/map/DraggablePickupMarker';
import Marker from '../components/map/MarkerWrapper';
import { markerImages } from '../components/map/markerImages';
import { mapStyle, mapStyleDark, ROUTE_STYLE, ROUTE_STYLE_DARK } from '../components/map/mapStyle';
import { haversineKm } from '../utils/distance';

// Safe wrappers for native map calls — prevents iOS crash when map isn't ready
// (e.g. returning from background, screen lock, or during rapid state batches).
function safeFit(mapRef, coords, opts) {
  try { mapRef.current?.fitToCoordinates(coords, opts); } catch (e) {
    if (__DEV__) console.warn('[Map] fitToCoordinates failed:', e.message);
  }
}
function safeAnimate(mapRef, region, duration) {
  try { mapRef.current?.animateToRegion(region, duration); } catch (e) {
    if (__DEV__) console.warn('[Map] animateToRegion failed:', e.message);
  }
}

// In-memory ride cache — survives screen navigation, cleared on ride end.
// Prevents redundant server fetches when user navigates Home → TaxiScreen.
let _rideCache = null;
const RIDE_CACHE_MAX_AGE = 5 * 60 * 1000;

// Module-level search state — survives TaxiScreen unmount/remount.
// Stores metadata needed to resume the progress bar and driver markers.
let _searchStartedAt = null;   // Timestamp when search began (for progress calculation)
let _nearbyDriversCache = [];  // Drivers visible during search

function setCachedRide(ride) {
  _rideCache = ride ? { ride, timestamp: Date.now() } : null;
}
function getCachedRide() {
  if (!_rideCache) return null;
  if (Date.now() - _rideCache.timestamp > RIDE_CACHE_MAX_AGE) {
    _rideCache = null;
    return null;
  }
  return _rideCache.ride;
}
function clearCachedRide() {
  _rideCache = null;
}
function clearSearchMeta() {
  _searchStartedAt = null;
  _nearbyDriversCache = [];
}

// Distance threshold (km) for "driver is close" notification
const DRIVER_CLOSE_THRESHOLD_KM = 0.3; // 300 meters

// Shared hitSlop constant — avoids re-creating objects in JSX on every render
const HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 };

// Stable marker anchor constants — avoids new object allocation per render
const ANCHOR_BOTTOM = { x: 0.5, y: 1 };

// Stable edge padding constants for fitToCoordinates
const EDGE_PAD_RIDE = { top: 80, right: 50, bottom: 250, left: 50 };
const EDGE_PAD_DRIVER = { top: 80, right: 80, bottom: 250, left: 80 };
const EDGE_PAD_ROUTE = { top: 50, right: 50, bottom: 250, left: 50 };

// Map initial region — geographic center of Georgia (Tbilisi).
// Used only for the MapView's initialRegion prop and map-fit calculations.
// Never used as a fallback for the user's actual GPS position.
const DEFAULT_LOCATION = {
  latitude: 41.6938,
  longitude: 44.8015,
};

// Timeout duration for ride request (30 seconds)
const RIDE_REQUEST_TIMEOUT = 30000;

// Booking flow steps
const BOOKING_STEPS = {
  LOCATION_SEARCH: 'location_search',
  RIDE_OPTIONS: 'ride_options',
  SEARCHING: 'searching',
  DRIVER_FOUND: 'driver_found',
  DRIVER_ARRIVED: 'driver_arrived',
  IN_PROGRESS: 'in_progress',
};

// L14: Fetch OSRM route with AbortController timeout + in-memory cache
const _routeCache = new Map();
const ROUTE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const ROUTE_CACHE_MAX = 50;

function routeCacheKey(from, to, waypoints) {
  // Round to 4 decimals (~11m) for better cache hits
  const parts = [
    `${from.latitude.toFixed(4)},${from.longitude.toFixed(4)}`,
    ...waypoints.map(wp => `${wp.latitude.toFixed(4)},${wp.longitude.toFixed(4)}`),
    `${to.latitude.toFixed(4)},${to.longitude.toFixed(4)}`,
  ];
  return parts.join('|');
}

const fetchRouteOSRM = async (from, to, waypoints = []) => {
  const key = routeCacheKey(from, to, waypoints);

  // Check cache first
  const cached = _routeCache.get(key);
  if (cached && Date.now() - cached._ts < ROUTE_CACHE_TTL) {
    return cached.coords;
  }

  try {
    // Build coordinate string: from;wp1;wp2;...;to
    const coords = [
      `${from.longitude},${from.latitude}`,
      ...waypoints.map(wp => `${wp.longitude},${wp.latitude}`),
      `${to.longitude},${to.latitude}`,
    ].join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    const data = await res.json();
    if (data.code === 'Ok' && data.routes?.[0]) {
      const result = data.routes[0].geometry.coordinates.map(([lng, lat]) => ({
        latitude: lat, longitude: lng,
      }));
      // Evict oldest if at capacity
      if (_routeCache.size >= ROUTE_CACHE_MAX) {
        const firstKey = _routeCache.keys().next().value;
        _routeCache.delete(firstKey);
      }
      _routeCache.set(key, { coords: result, _ts: Date.now() });
      return result;
    }
  } catch (e) {
    if (__DEV__) console.warn('[TaxiScreen] OSRM route fetch failed:', e.message);
  }
  return [from, ...waypoints, to];
};

// Extract driver info for ride notification display
function extractDriverInfo(ride) {
  const driver = ride?.driver;
  return {
    driverName: [driver?.user?.firstName, driver?.user?.lastName].filter(Boolean).join(' ')
      || driver?.user?.fullName || '',
    vehicleMakeModel: [driver?.vehicle?.make, driver?.vehicle?.model].filter(Boolean).join(' '),
    vehicleColor: driver?.vehicle?.color || '',
    licensePlate: driver?.vehicle?.licensePlate || '',
    profileImage: driver?.user?.profileImage || null,
  };
}

export default function TaxiScreen({ navigation }) {
  const typography = useTypography();
  const { colors, isDark } = useTheme();
  const styles = React.useMemo(() => createStyles(typography, colors), [typography, colors]);
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { socket } = useSocket();
  const { onReconnect } = useNetwork();
  const mapRef = useRef(null);
  const bottomSheetRef = useRef(null);
  const insets = useSafeAreaInsets();

  // Location states
  const [location, setLocation] = useState(null);          // True GPS position (blue dot)
  const [customPickup, setCustomPickup] = useState(null);  // Manual pickup override coords
  const [locationAddress, setLocationAddress] = useState('');
  const [destination, setDestination] = useState('');
  const [destinationCoords, setDestinationCoords] = useState(null);
  const [stops, setStops] = useState([]); // Array of { address, coords }
  const [isLoadingLocation, setIsLoadingLocation] = useState(true);

  // Booking states
  const [bookingStep, setBookingStep] = useState(BOOKING_STEPS.LOCATION_SEARCH);
  const [selectedVehicle, setSelectedVehicle] = useState('economy');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [estimatedPrice, setEstimatedPrice] = useState(null);
  const [estimatedDuration, setEstimatedDuration] = useState(null);
  const [isRequesting, setIsRequesting] = useState(false);

  // Ride states
  const [currentRide, setCurrentRide] = useState(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [completedRide, setCompletedRide] = useState(null);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [showPaymentMethodModal, setShowPaymentMethodModal] = useState(false);
  const [paymentModalMode, setPaymentModalMode] = useState('select');
  const [selectedPaymentId, setSelectedPaymentId] = useState(null);
  const [selectedCardId, setSelectedCardId] = useState(null);
  const timeoutTimerRef = useRef(null);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const progress = progressAnim;

  // Driver tracking states
  const [driverLocation, setDriverLocation] = useState(null);
  const [driverETA, setDriverETA] = useState(null);
  const [driverDistance, setDriverDistance] = useState(null);
  const [waitingTimeLeft, setWaitingTimeLeft] = useState(null);
  const [waitingFee, setWaitingFee] = useState(0);

  // Native map states
  const [nearbyDrivers, setNearbyDrivers] = useState([]);
  const [driverRoute, setDriverRoute] = useState(null);
  const [totalDistance, setTotalDistance] = useState(null); // Total route KM (pickup → stops → destination)
  const routeDistanceRef = useRef(null); // Persists route distance across closures

  // Map readiness gate — native map calls (fitToCoordinates, animateToRegion)
  // silently fail when issued before the native map is initialized.
  const mapReadyRef = useRef(false);
  const pendingFitRef = useRef(null); // { coords, opts } queued before map ready

  // Refs for values used inside socket handlers to avoid re-registering listeners
  const locationRef = useRef(null);
  const currentRideRef = useRef(null);
  const tRef = useRef(t);
  const locationWatchRef = useRef(null); // GPS watch subscription during active rides

  // M10: Prevent concurrent reconciliation calls
  const isReconcilingRef = useRef(false);

  // Tracks last accepted driver location for distance-based throttling in socket handler.
  // Only updated when the position passes the 5m threshold, preventing re-renders from GPS noise.
  const driverLocationRef = useRef(null);

  // Time-based throttle for driver location state updates.
  // Limits setDriverLocation to at most once per 2s, with a trailing-edge timer
  // so the final position always arrives (keeps marker accurate when driver stops).
  const DRIVER_LOC_THROTTLE_MS = 2000;
  const driverLocLastFlushRef = useRef(0);
  const driverLocTrailingRef = useRef(null); // setTimeout id for trailing flush
  const pendingDriverLocRef = useRef(null);  // { loc, distance, eta } awaiting flush

  // Track shown alerts to prevent duplicates (key: "rideId:eventType")
  const shownAlertsRef = useRef(new Set());

  // Track whether "driver is close" notification was already sent for current ride
  const driverCloseNotifiedRef = useRef(false);

  // Chat — unread message counter (reset on opening chat screen)
  const [unreadChatCount, setUnreadChatCount] = useState(0);

  // Flag: true while user-initiated cancel is in progress (prevents socket handler from duplicating)
  const userCancellingRef = useRef(false);

  // Saved destination data for restoring after searching state
  const savedDestinationRef = useRef(null);
  const savedDestinationCoordsRef = useRef(null);

  // Tracks when the current search started — used by progress useEffect to resume correctly
  const searchStartedAtRef = useRef(null);

  // Route polyline for directions
  const [routePolyline, setRoutePolyline] = useState(null);
  const [isLoadingDirections, setIsLoadingDirections] = useState(false);

  // Map selection mode — stores which input triggered it: 'pickup', 'destination', or stop index (number)
  const [isSelectingOnMap, setIsSelectingOnMap] = useState(null);

  // Track bottom sheet snap index for fullscreen mode
  const [sheetSnapIndex, setSheetSnapIndex] = useState(1);

  // Dynamic per-category pricing from server
  const [pricingConfig, setPricingConfig] = useState({
    categories: {
      economy: { basePrice: 5, kmPrice: 1.5 },
      comfort: { basePrice: 7.5, kmPrice: 2.25 },
      business: { basePrice: 10, kmPrice: 3 },
      van: { basePrice: 7.5, kmPrice: 2.25 },
      minibus: { basePrice: 10, kmPrice: 3 },
    }
  });

  // Map zoom level for driver clustering
  const [mapZoomLevel, setMapZoomLevel] = useState(15);

  // Cached last destination for instant re-selection
  const [lastDestination, setLastDestination] = useState(null);

  // Debounce zoom level updates to avoid re-renders during pinch/pan
  const zoomDebounceRef = useRef(null);
  // Track whether DriverCluster is visible — avoids wasted setMapZoomLevel
  // re-renders when user pans during driver tracking / in-progress states.
  const driversVisibleRef = useRef(false);

  // Check if user has phone number
  const hasPhoneNumber = user?.phone && user.phone.trim() !== '';

  // Dynamic snap points based on booking step (max 70% to keep map visible)
  const snapPoints = useMemo(() => {
    switch (bookingStep) {
      case BOOKING_STEPS.LOCATION_SEARCH:
        return ['25%', '50%', '100%'];
      case BOOKING_STEPS.RIDE_OPTIONS:
        return ['25%', '50%', '100%'];
      case BOOKING_STEPS.SEARCHING:
      case BOOKING_STEPS.DRIVER_FOUND:
      case BOOKING_STEPS.DRIVER_ARRIVED:
      case BOOKING_STEPS.IN_PROGRESS:
        return ['30%', '50%', '70%'];
      default:
        return ['35%', '55%', '70%'];
    }
  }, [bookingStep]);

  // Initialize location on mount + cleanup all timers/refs on unmount
  useEffect(() => {
    requestLocationPermission();

    // Load cached last destination for instant re-selection
    loadLastDestination().then(dest => { if (dest) setLastDestination(dest); });

    // Fetch dynamic pricing config from server
    settingsAPI.getPricing()
      .then(res => {
        if (res.data?.data?.categories) {
          setPricingConfig({ categories: res.data.data.categories });
        }
      })
      .catch(() => {}); // Use defaults on failure

    return () => {
      // Prevent leaked timers when TaxiScreen unmounts
      if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
      if (zoomDebounceRef.current) clearTimeout(zoomDebounceRef.current);
      if (locationWatchRef.current) locationWatchRef.current.remove();
      shownAlertsRef.current.clear();
    };
  }, []);

  // Fetch nearby drivers while user is choosing ride options.
  // Refreshes every 30s to show driver availability.
  // Only active during RIDE_OPTIONS (after destination is set, before requesting).
  // Pauses when app is backgrounded to save battery and bandwidth.
  const appStateRef = useRef(AppState.currentState);
  useEffect(() => {
    if (!locationRef.current) return;
    if (bookingStep !== BOOKING_STEPS.RIDE_OPTIONS) {
      // Keep nearby drivers visible during SEARCHING so user sees cars on map
      if (bookingStep !== BOOKING_STEPS.SEARCHING) {
        setNearbyDrivers(prev => prev.length > 0 ? [] : prev);
      }
      return;
    }

    let intervalId = null;

    const fetchNearby = async () => {
      if (appStateRef.current !== 'active') return;
      const loc = locationRef.current;
      if (!loc) return;
      try {
        const res = await taxiAPI.getNearbyDrivers(
          loc.latitude,
          loc.longitude
        );
        setNearbyDrivers(res.data?.data?.drivers || []);
      } catch {
        // Ambient drivers are cosmetic — don't alert on failure
      }
    };

    const startPolling = () => {
      stopPolling(); // M5: Clear existing interval before creating new one
      fetchNearby();
      intervalId = setInterval(fetchNearby, 30000);
    };

    const stopPolling = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    // Start polling immediately
    startPolling();

    // Pause/resume on app state changes
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      const wasForeground = appStateRef.current === 'active';
      appStateRef.current = nextAppState;
      if (nextAppState === 'active' && !wasForeground) {
        startPolling(); // Resume when foregrounded
      } else if (nextAppState !== 'active' && wasForeground) {
        stopPolling(); // Pause when backgrounded
      }
    });

    return () => {
      stopPolling();
      subscription.remove();
    };
  }, [bookingStep]);

  // Refresh GPS when app returns to foreground.
  // Only show permission alert if user has no location at all AND permission is denied.
  // This prevents the redundant prompt that occurs when:
  //   - User grants permission → OS dialog closes → app foregrounds → race condition
  //   - User already has a working location but briefly backgrounded
  const permCheckDebounceRef = useRef(false);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextAppState) => {
      if (nextAppState === 'active') {
        // Debounce: skip if we just checked (e.g. rapid background/foreground from OS dialog)
        if (permCheckDebounceRef.current) return;
        permCheckDebounceRef.current = true;
        setTimeout(() => { permCheckDebounceRef.current = false; }, 2000);

        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') {
          // Only alert if user has no location at all — avoids nagging when
          // they denied "always" but granted "while using" (status may be nuanced)
          if (!locationRef.current) {
            Alert.alert(
              t('taxi.locationPermission'),
              t('taxi.locationPermissionDesc'),
              [
                { text: t('common.cancel'), style: 'cancel' },
                { text: t('taxi.enableLocation'), onPress: () => Linking.openSettings() },
              ]
            );
          }
        } else {
          // Permission granted — silently refresh GPS
          refreshLocation();
        }
      }
    });
    return () => subscription.remove();
  }, [t]);

  // Helper: apply ride data to local state (used by both local restore and API reconciliation)
  const applyRideToState = useCallback((ride) => {
    setCurrentRide(ride);

    if (ride.dropoff) {
      setDestination(ride.dropoff.address || '');
      if (ride.dropoff.lat && ride.dropoff.lng) {
        // Only show destination marker during in_progress (ride started).
        // During accepted/driver_arrived, only driver marker + route is shown.
        if (ride.status === 'in_progress') {
          setDestinationCoords({ latitude: ride.dropoff.lat, longitude: ride.dropoff.lng });
        } else {
          setDestinationCoords(null);
        }
        // Always save to refs so ride:started handler can restore it
        savedDestinationRef.current = ride.dropoff.address || '';
        savedDestinationCoordsRef.current = { latitude: ride.dropoff.lat, longitude: ride.dropoff.lng };
      }
    }
    if (ride.pickup?.address) setLocationAddress(ride.pickup.address);
    // Restore stops from ride data
    if (ride.stops?.length > 0) {
      setStops(ride.stops.map(s => ({
        address: s.address || '',
        coords: s.lat && s.lng ? { latitude: s.lat, longitude: s.lng } : null,
      })));
    }
    if (ride.quote) {
      setEstimatedPrice(ride.quote.totalPrice);
      setEstimatedDuration(ride.quote.duration);
      // Restore route distance from quote (sent during ride request)
      if (ride.quote.distance) {
        const dist = Math.round(parseFloat(ride.quote.distance) * 10) / 10;
        setTotalDistance(dist);
        routeDistanceRef.current = dist;
      }
    }
    if (ride.vehicleType) setSelectedVehicle(ride.vehicleType);
    if (ride.paymentMethod) setPaymentMethod(ride.paymentMethod);
    if (ride.driver?.location?.coordinates) {
      const [lng, lat] = ride.driver.location.coordinates;
      setDriverLocation({ latitude: lat, longitude: lng });
    }

    switch (ride.status) {
      case 'pending':   setBookingStep(BOOKING_STEPS.SEARCHING); break;
      case 'accepted':  setBookingStep(BOOKING_STEPS.DRIVER_FOUND); break;
      case 'driver_arrived': setBookingStep(BOOKING_STEPS.DRIVER_ARRIVED); break;
      case 'in_progress': setBookingStep(BOOKING_STEPS.IN_PROGRESS); break;
    }
  }, []);

  const fitMapToRide = useCallback((ride) => {
    setTimeout(() => {
      if (!mapRef.current) return;
      const coords = [];

      // During accepted/driver_arrived: only show pickup + driver (no dropoff)
      // During in_progress: show full route (pickup + stops + dropoff)
      const isDriverEnRoute = ['accepted', 'driver_arrived'].includes(ride.status);

      if (ride.pickup?.lat && ride.pickup?.lng)
        coords.push({ latitude: ride.pickup.lat, longitude: ride.pickup.lng });

      if (!isDriverEnRoute) {
        if (ride.stops?.length > 0) {
          ride.stops.forEach(stop => {
            if (stop.lat && stop.lng)
              coords.push({ latitude: stop.lat, longitude: stop.lng });
          });
        }
        if (ride.dropoff?.lat && ride.dropoff?.lng)
          coords.push({ latitude: ride.dropoff.lat, longitude: ride.dropoff.lng });
      }

      if (ride.driver?.location?.coordinates) {
        const [dLng, dLat] = ride.driver.location.coordinates;
        coords.push({ latitude: dLat, longitude: dLng });
      }
      if (coords.length >= 2) {
        safeFit(mapRef, coords, {
          edgePadding: EDGE_PAD_RIDE,
          animated: true,
        });
      }
    }, 500);
  }, []);

  // Restore active ride on mount:
  //   1. In-memory cache (fastest — screen navigation)
  //   2. SecureStore (survives app kill)
  //   3. Server reconciliation (authoritative)
  useEffect(() => {
    const restoreAndReconcile = async () => {
      if (isReconcilingRef.current) return;
      isReconcilingRef.current = true;

      // Fast path: in-memory cache from previous mount (screen navigation)
      const cached = getCachedRide();
      if (cached && !['completed', 'cancelled'].includes(cached.status)) {
        // Restore search metadata BEFORE applyRideToState so the progress
        // useEffect (triggered by bookingStep change) has the correct start time.
        if (cached.status === 'pending') {
          searchStartedAtRef.current = _searchStartedAt || Date.now();
          setNearbyDrivers(_nearbyDriversCache);
        }

        applyRideToState(cached);
        fitMapToRide(cached);

        if (cached.dropoff?.lat && cached.dropoff?.lng) {
          // Refs already set by applyRideToState

          // During in_progress, driverRoute useEffect handles the live polyline.
          // During accepted/driver_arrived, driverLocation useEffect fetches driver→pickup.
          // No need to set routePolyline here — avoids dual-line flicker.
        }

        isReconcilingRef.current = false;
        return; // Skip server fetch — cache is fresh
      }

      // Phase 1 — instant local restore from SecureStore
      const savedState = await loadRideState();
      if (savedState) {
        const localRide = {
          _id: savedState.rideId,
          status: savedState.status,
          pickup: savedState.pickup,
          dropoff: savedState.dropoff,
          vehicleType: savedState.vehicleType,
          paymentMethod: savedState.paymentMethod,
          quote: {
            totalPrice: savedState.estimatedPrice,
            duration: savedState.estimatedDuration,
            distance: savedState.totalDistance,
          },
          driver: savedState.driverLocation
            ? { location: { coordinates: [savedState.driverLocation.longitude, savedState.driverLocation.latitude] } }
            : null,
        };
        // Set search start time from SecureStore so progress useEffect can resume correctly
        if (savedState.status === 'pending') {
          searchStartedAtRef.current = savedState.savedAt || Date.now();
        }
        applyRideToState(localRide);

        // During in_progress, driverRoute useEffect handles the live polyline.
        // No routePolyline fetch needed here — avoids dual-line flicker.
      }

      // Phase 2 — server reconciliation
      try {
        const response = await taxiAPI.getMyRides();
        const rides = response.data?.data?.rides || [];
        const activeRide = rides.find(r =>
          !['completed', 'cancelled'].includes(r.status)
        );

        if (activeRide) {
          // Set search start time from server BEFORE applyRideToState so the
          // progress useEffect (triggered by bookingStep change) uses correct timing.
          if (activeRide.status === 'pending') {
            const createdAt = activeRide.createdAt
              ? new Date(activeRide.createdAt).getTime()
              : (savedState?.savedAt || Date.now());
            searchStartedAtRef.current = createdAt;
            _searchStartedAt = createdAt;
          }

          applyRideToState(activeRide);
          fitMapToRide(activeRide);
          setCachedRide(activeRide); // Cache for future screen navigation

          if (!activeRide.quote?.distance && !routeDistanceRef.current
              && activeRide.pickup?.lat && activeRide.dropoff?.lat) {
            const fallbackDist = Math.round(haversineKm(
              activeRide.pickup.lat, activeRide.pickup.lng,
              activeRide.dropoff.lat, activeRide.dropoff.lng,
            ) * 10) / 10;
            setTotalDistance(fallbackDist);
            routeDistanceRef.current = fallbackDist;
          }

          // During in_progress, driverRoute useEffect handles the live polyline.
          // No routePolyline fetch needed — avoids dual-line flicker.

          // Progress bar and timeout for pending rides are handled by the
          // consolidated progress useEffect (triggered by bookingStep change).

          const reconciledVehicle = activeRide.driver?.vehicle;
          persistRideState({
            rideId: activeRide._id,
            status: activeRide.status,
            bookingStep: activeRide.status === 'pending' ? BOOKING_STEPS.SEARCHING
              : activeRide.status === 'accepted' ? BOOKING_STEPS.DRIVER_FOUND
              : activeRide.status === 'driver_arrived' ? BOOKING_STEPS.DRIVER_ARRIVED
              : BOOKING_STEPS.IN_PROGRESS,
            pickup: activeRide.pickup,
            dropoff: activeRide.dropoff,
            vehicleType: activeRide.vehicleType,
            paymentMethod: activeRide.paymentMethod,
            estimatedPrice: activeRide.quote?.totalPrice,
            estimatedDuration: activeRide.quote?.duration,
            driverLocation: activeRide.driver?.location?.coordinates
              ? { latitude: activeRide.driver.location.coordinates[1], longitude: activeRide.driver.location.coordinates[0] }
              : null,
            driverName: activeRide.driver?.user?.firstName || null,
            driverVehicle: reconciledVehicle ? { make: reconciledVehicle.make, model: reconciledVehicle.model, color: reconciledVehicle.color, licensePlate: reconciledVehicle.licensePlate } : null,
            totalDistance: activeRide.quote?.distance ? parseFloat(activeRide.quote.distance) : routeDistanceRef.current,
          });
        } else if (savedState) {
          resetBookingState();
          clearCachedRide();
        }
      } catch (error) {
        if (__DEV__) console.warn('[TaxiScreen] Offline — using cached ride state');
        // searchStartedAtRef was already set in Phase 1 from savedState.savedAt.
        // The progress useEffect will handle animation and timeout.
      } finally {
        isReconcilingRef.current = false;
      }
    };

    restoreAndReconcile();
  }, []);

  // Center map on user location immediately when first obtained
  const didInitialCenter = useRef(false);
  useEffect(() => {
    if (location && mapRef.current && !didInitialCenter.current && mapReadyRef.current) {
      didInitialCenter.current = true;
      safeAnimate(mapRef,{
        latitude: location.latitude,
        longitude: location.longitude,
        latitudeDelta: 0.015,
        longitudeDelta: 0.015,
      }, 500);
    }
  }, [location]);

  // Waiting time countdown effect
  useEffect(() => {
    if (bookingStep !== BOOKING_STEPS.DRIVER_ARRIVED || !currentRide?.waitingExpiresAt) {
      setWaitingTimeLeft(null);
      setWaitingFee(0);
      return;
    }

    const FREE_WAITING_SECONDS = 60;
    const WAITING_FEE_PER_MINUTE = 0.50;

    const updateWaitingTime = () => {
      const now = new Date();
      const expiresAt = new Date(currentRide.waitingExpiresAt);
      const arrivalTime = new Date(currentRide.arrivalTime);
      const timeLeftMs = expiresAt.getTime() - now.getTime();
      const waitedSeconds = (now.getTime() - arrivalTime.getTime()) / 1000;

      if (timeLeftMs <= 0) {
        setWaitingTimeLeft(0);
        return;
      }

      setWaitingTimeLeft(Math.ceil(timeLeftMs / 1000));

      if (waitedSeconds > FREE_WAITING_SECONDS) {
        const paidSeconds = Math.min(waitedSeconds - FREE_WAITING_SECONDS, 120);
        const fee = Math.round((paidSeconds / 60) * WAITING_FEE_PER_MINUTE * 100) / 100;
        setWaitingFee(fee);
      } else {
        setWaitingFee(0);
      }
    };

    updateWaitingTime();
    const interval = setInterval(updateWaitingTime, 1000);

    return () => clearInterval(interval);
  }, [bookingStep, currentRide?.waitingExpiresAt, currentRide?.arrivalTime]);

  // Keep refs in sync with state so socket handlers always have fresh values
  useEffect(() => { locationRef.current = location; }, [location]);
  useEffect(() => { currentRideRef.current = currentRide; }, [currentRide]);
  useEffect(() => { tRef.current = t; }, [t]);
  // Sync driversVisibleRef so handleRegionChangeComplete skips zoom tracking
  // when DriverCluster isn't rendered (avoids wasted re-renders during pan/pinch)
  useEffect(() => { driversVisibleRef.current = nearbyDrivers.length > 0; }, [nearbyDrivers.length]);

  // Continuous GPS watch during active ride — keeps user's blue dot accurate.
  // Without this, location is only fetched once on mount and on AppState changes,
  // causing the blue dot to lag or appear stale when the driver accepts / ride is in progress.
  useEffect(() => {
    const isActiveRide =
      bookingStep === BOOKING_STEPS.SEARCHING ||
      bookingStep === BOOKING_STEPS.DRIVER_FOUND ||
      bookingStep === BOOKING_STEPS.DRIVER_ARRIVED ||
      bookingStep === BOOKING_STEPS.IN_PROGRESS;

    if (!isActiveRide) {
      // Stop watching when not in a ride
      if (locationWatchRef.current) {
        locationWatchRef.current.remove();
        locationWatchRef.current = null;
      }
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted' || cancelled) return;

        const sub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            distanceInterval: 10, // Only fire when moved ≥10m
            timeInterval: 5000,   // At most every 5s
          },
          (pos) => {
            // Reject low-accuracy fixes (cell-tower/WiFi can be 100m+ off)
            if (pos.coords.accuracy != null && pos.coords.accuracy > 50) return;
            const newLat = pos.coords.latitude;
            const newLng = pos.coords.longitude;
            const prev = locationRef.current;
            // Distance-based dedup: skip if moved <10m (matches distanceInterval)
            if (prev) {
              const dlat = (newLat - prev.latitude) * 111320;
              const dlng = (newLng - prev.longitude) * 111320 * Math.cos(prev.latitude * 0.01745329);
              if (Math.sqrt(dlat * dlat + dlng * dlng) < 10) return;
            }
            setLocation({ latitude: newLat, longitude: newLng });
          }
        );
        if (cancelled) {
          sub.remove();
        } else {
          locationWatchRef.current = sub;
        }
      } catch {
        // Keep last known location on error
      }
    })();

    return () => {
      cancelled = true;
      if (locationWatchRef.current) {
        locationWatchRef.current.remove();
        locationWatchRef.current = null;
      }
    };
  }, [bookingStep]);

  // Fetch driver route on a fixed interval (reads from driverLocationRef, not state).
  // This avoids re-running the effect on every driver location state update.
  //   - DRIVER_FOUND / DRIVER_ARRIVED → driver → pickup (every 15s)
  //   - IN_PROGRESS → driver → destination (every 10s)
  useEffect(() => {
    const isTracking =
      bookingStep === BOOKING_STEPS.DRIVER_FOUND ||
      bookingStep === BOOKING_STEPS.DRIVER_ARRIVED ||
      bookingStep === BOOKING_STEPS.IN_PROGRESS;
    if (!isTracking) return;

    const intervalMs = bookingStep === BOOKING_STEPS.IN_PROGRESS ? 10000 : 15000;

    const fetchRoute = () => {
      const dLoc = driverLocationRef.current;
      if (!dLoc) return;

      if (bookingStep === BOOKING_STEPS.DRIVER_FOUND || bookingStep === BOOKING_STEPS.DRIVER_ARRIVED) {
        const pickup = customPickup || locationRef.current;
        if (!pickup) return;
        fetchRouteOSRM(dLoc, pickup).then(setDriverRoute);
      } else {
        const dest = savedDestinationCoordsRef.current || destinationCoords;
        if (!dest) return;
        fetchRouteOSRM(dLoc, dest).then(setDriverRoute);
      }
    };

    // Fetch once immediately, then on interval
    fetchRoute();
    const id = setInterval(fetchRoute, intervalMs);
    return () => clearInterval(id);
  }, [bookingStep, destinationCoords, customPickup]);

  // Fit map to driver + pickup — only on first driver location, not every update.
  // Constant fitToCoordinates prevents user from panning the map manually.
  const didFitToDriverRef = useRef(false);
  useEffect(() => {
    if (!driverLocation || !mapRef.current) return;
    if (bookingStep !== BOOKING_STEPS.DRIVER_FOUND && bookingStep !== BOOKING_STEPS.DRIVER_ARRIVED) return;

    // Only auto-fit once when driver is first found, let user pan freely after
    if (didFitToDriverRef.current) return;

    const loc = locationRef.current;
    if (!loc) return;

    const fitData = { coords: [driverLocation, loc], opts: { edgePadding: EDGE_PAD_DRIVER, animated: true } };

    if (!mapReadyRef.current) {
      // Map not ready yet — queue for onMapReady
      pendingFitRef.current = fitData;
      return;
    }

    didFitToDriverRef.current = true;
    safeFit(mapRef, fitData.coords, fitData.opts);
  }, [driverLocation, bookingStep]);

  // Reset fit flag when booking state changes (new ride = new fit)
  useEffect(() => {
    if (bookingStep === BOOKING_STEPS.LOCATION_SEARCH || bookingStep === BOOKING_STEPS.RIDE_OPTIONS) {
      didFitToDriverRef.current = false;
    }
  }, [bookingStep]);

  // Show alert only once per ride+event combination
  const showAlertOnce = useCallback((rideId, eventType, title, message, buttons) => {
    const key = `${rideId}:${eventType}`;
    if (shownAlertsRef.current.has(key)) return;
    shownAlertsRef.current.add(key);
    Alert.alert(title, message, buttons);
  }, []);

  // Flush pending driver location to state (called by throttle logic).
  // Batches setDriverLocation + setDriverDistance + setDriverETA into one render.
  const flushDriverLoc = useCallback(() => {
    driverLocLastFlushRef.current = Date.now();
    driverLocTrailingRef.current = null;
    const pending = pendingDriverLocRef.current;
    if (!pending) return;
    pendingDriverLocRef.current = null;
    setDriverLocation(pending.loc);
    if (pending.distance != null) setDriverDistance(pending.distance);
    if (pending.eta != null) setDriverETA(pending.eta);
  }, []);

  // Socket event listeners - only re-register when socket instance changes
  useEffect(() => {
    if (!socket) return;
    if (__DEV__) console.log('[TaxiScreen] Registering socket listeners');

    // Remove ALL existing listeners for these events FIRST to prevent
    // accumulation if this effect fires multiple times on the same socket.
    const RIDE_EVENTS = [
      'ride:accepted', 'driver:locationUpdate', 'ride:arrived',
      'ride:started', 'ride:completed', 'ride:cancelled',
      'ride:expired', 'ride:waitingTimeout',
    ];
    RIDE_EVENTS.forEach(e => socket.removeAllListeners(e));

    // Use tRef.current inside all handlers to avoid stale translation closure
    socket.on('ride:accepted', (ride) => {
      if (__DEV__) console.log('[TaxiScreen] ride:accepted received!', ride?._id);
      clearRideTimeout();
      notificationSuccess();
      rideAccepted();
      setCurrentRide(ride);
      setBookingStep(BOOKING_STEPS.DRIVER_FOUND);
      setCachedRide(ride);

      // Clear nearby drivers, destination, and search metadata
      _nearbyDriversCache = [];
      _searchStartedAt = null;
      searchStartedAtRef.current = null;
      setNearbyDrivers([]);
      setDestinationCoords(null);
      setRoutePolyline(null);

      // Show driver marker
      let driverLoc = null;
      if (ride.driver?.location?.coordinates) {
        const [lng, lat] = ride.driver.location.coordinates;
        driverLoc = { latitude: lat, longitude: lng };
        setDriverLocation(driverLoc);
      }

      // Persist ride state to survive app kill
      const vehicle = ride.driver?.vehicle;
      persistRideState({
        rideId: ride._id,
        status: ride.status,
        bookingStep: BOOKING_STEPS.DRIVER_FOUND,
        pickup: ride.pickup,
        dropoff: ride.dropoff,
        vehicleType: ride.vehicleType,
        paymentMethod: ride.paymentMethod,
        estimatedPrice: ride.quote?.totalPrice,
        estimatedDuration: ride.quote?.duration,
        driverLocation: driverLoc,
        driverName: ride.driver?.user?.firstName || null,
        driverVehicle: vehicle ? { make: vehicle.make, model: vehicle.model, color: vehicle.color, licensePlate: vehicle.licensePlate } : null,
        totalDistance: ride.quote?.distance ? parseFloat(ride.quote.distance) : routeDistanceRef.current,
      });

      // Show persistent notification (visible outside app)
      showRideNotification('accepted', extractDriverInfo(ride), null);

      const tr = tRef.current;
      showAlertOnce(
        ride._id, 'accepted',
        tr('taxi.driverFound'),
        `${ride.driver?.user?.firstName} ${tr('taxi.isOnTheWay')}`,
        [{ text: tr('common.ok') }]
      );
    });

    socket.on('driver:locationUpdate', (data) => {
      const ride = currentRideRef.current;
      const loc = locationRef.current;
      if (data.rideId !== ride?._id) return;

      const { latitude, longitude, heading, ts, type } = data.location;

      // Reject stale updates (timestamp older than last accepted)
      if (ts && driverLocationRef.current?._ts && ts <= driverLocationRef.current._ts) {
        return;
      }

      // Distance-based throttle: skip state updates if driver moved < 5 meters.
      // This prevents TaxiScreen re-renders from GPS noise (1-3m jitter)
      // while AnimatedCarMarker handles smooth interpolation independently.
      const prev = driverLocationRef.current;
      if (prev) {
        const dlat = (latitude - prev.latitude) * 111320;
        const dlng = (longitude - prev.longitude) * 111320 * Math.cos(prev.latitude * 0.01745329);
        const distM = Math.sqrt(dlat * dlat + dlng * dlng);

        // Skip minor jitter (heartbeats and GPS noise)
        if (distM < 5 && type !== 'heartbeat') return;
      }

      const newLoc = { latitude, longitude, _ts: ts || Date.now() };
      // Pass heading separately so AnimatedCarMarker can use server heading
      // when GPS-derived bearing is unavailable (short movements)
      if (heading != null && isFinite(heading)) {
        newLoc.heading = heading;
      }
      driverLocationRef.current = newLoc;

      // Compute ETA/distance for the pending flush
      const dest = savedDestinationCoordsRef.current;
      const measureTo = (ride?.status === 'in_progress' && dest) ? dest : loc;
      let distance = null;
      let eta = null;
      if (measureTo) {
        distance = haversineKm(latitude, longitude, measureTo.latitude, measureTo.longitude);
        eta = Math.round((distance / 30) * 60);

        // One-time "driver is close" notification — fires immediately (not throttled)
        if (ride && !driverCloseNotifiedRef.current && distance <= DRIVER_CLOSE_THRESHOLD_KM) {
          driverCloseNotifiedRef.current = true;
          showRideNotification('accepted', extractDriverInfo(ride), eta);
        }
      }

      // Time-based throttle: batch state updates to max ~1 per 2s.
      // Keeps the ref (used by AnimatedCarMarker) always fresh,
      // but limits expensive TaxiScreen re-renders.
      pendingDriverLocRef.current = { loc: newLoc, distance, eta };

      const now = Date.now();
      const elapsed = now - driverLocLastFlushRef.current;

      if (elapsed >= DRIVER_LOC_THROTTLE_MS) {
        // Enough time passed — flush immediately
        flushDriverLoc();
      } else if (!driverLocTrailingRef.current) {
        // Schedule trailing flush so final position always arrives
        driverLocTrailingRef.current = setTimeout(flushDriverLoc, DRIVER_LOC_THROTTLE_MS - elapsed);
      }
    });

    // Auto-notification when driver is approaching pickup or dropoff
    socket.on('ride:driverApproaching', (data) => {
      const cur = currentRideRef.current;
      if (!data?.rideId || (cur && cur._id !== data.rideId)) return;

      const tr = tRef.current;
      if (data.type === 'pickup') {
        showAlertOnce(
          data.rideId, 'approaching_pickup',
          tr('taxi.driverApproaching'),
          tr('taxi.driverApproachingPickup', { minutes: data.etaMinutes }),
          [{ text: tr('common.ok') }]
        );
      } else if (data.type === 'dropoff') {
        showAlertOnce(
          data.rideId, 'approaching_dropoff',
          tr('taxi.almostThere'),
          tr('taxi.approachingDropoff', { minutes: data.etaMinutes }),
          [{ text: tr('common.ok') }]
        );
      }
    });

    socket.on('ride:arrived', (ride) => {
      // Guard: ignore events for a different ride (stale reconnection buffer)
      const cur = currentRideRef.current;
      if (!ride?._id || (cur && cur._id !== ride._id)) return;

      notificationWarning();
      rideArrived();
      setCurrentRide(ride);
      setBookingStep(BOOKING_STEPS.DRIVER_ARRIVED);
      setCachedRide(ride);

      const vehicle = ride.driver?.vehicle;
      persistRideState({
        rideId: ride._id,
        status: ride.status,
        bookingStep: BOOKING_STEPS.DRIVER_ARRIVED,
        pickup: ride.pickup,
        dropoff: ride.dropoff,
        vehicleType: ride.vehicleType,
        paymentMethod: ride.paymentMethod,
        estimatedPrice: ride.quote?.totalPrice,
        estimatedDuration: ride.quote?.duration,
        driverLocation: null,
        driverName: ride.driver?.user?.firstName || null,
        driverVehicle: vehicle ? { make: vehicle.make, model: vehicle.model, color: vehicle.color, licensePlate: vehicle.licensePlate } : null,
        totalDistance: ride.quote?.distance ? parseFloat(ride.quote.distance) : routeDistanceRef.current,
      });

      // Update persistent notification
      showRideNotification('driver_arrived', extractDriverInfo(ride), null);

      const tr = tRef.current;
      showAlertOnce(
        ride._id, 'arrived',
        tr('taxi.driverArrived'),
        tr('taxi.driverArrivedMessage'),
        [{ text: tr('common.ok') }]
      );
    });

    socket.on('ride:started', (ride) => {
      // Guard: ignore events for a different ride (stale reconnection buffer)
      const cur = currentRideRef.current;
      if (!ride?._id || (cur && cur._id !== ride._id)) return;

      setCurrentRide(ride);
      setBookingStep(BOOKING_STEPS.IN_PROGRESS);
      setCachedRide(ride);

      const vehicle = ride.driver?.vehicle;
      persistRideState({
        rideId: ride._id,
        status: ride.status,
        bookingStep: BOOKING_STEPS.IN_PROGRESS,
        pickup: ride.pickup,
        dropoff: ride.dropoff,
        vehicleType: ride.vehicleType,
        paymentMethod: ride.paymentMethod,
        estimatedPrice: ride.quote?.totalPrice,
        estimatedDuration: ride.quote?.duration,
        driverLocation: null,
        driverName: ride.driver?.user?.firstName || null,
        driverVehicle: vehicle ? { make: vehicle.make, model: vehicle.model, color: vehicle.color, licensePlate: vehicle.licensePlate } : null,
        totalDistance: ride.quote?.distance ? parseFloat(ride.quote.distance) : routeDistanceRef.current,
      });

      // Update persistent notification
      showRideNotification('in_progress', extractDriverInfo(ride), ride.quote?.duration || null);

      // Clear driver-to-pickup route (no longer relevant).
      // Keep driverLocation so the car marker stays visible during the ride.
      setDriverRoute(null);

      const savedCoords = savedDestinationCoordsRef.current;
      const loc = locationRef.current;

      // Restore stops from server ride data (authoritative)
      const rideStops = ride.stops?.length > 0
        ? ride.stops.map(s => ({
            address: s.address || '',
            coords: s.lat && s.lng ? { latitude: s.lat, longitude: s.lng } : null,
          }))
        : [];
      if (rideStops.length > 0) setStops(rideStops);

      if (savedCoords) {
        setDestinationCoords(savedCoords);

        // Build waypoints from stops for the full route
        const waypoints = rideStops
          .filter(s => s.coords)
          .map(s => s.coords);

        // Fetch full route for distance calculation only — driverRoute
        // useEffect handles the live polyline during IN_PROGRESS.
        if (loc) {
          fetchRouteOSRM(loc, savedCoords, waypoints).then(coords => {
            // Calculate total distance from polyline (don't set routePolyline —
            // driverRoute takes priority during IN_PROGRESS via render logic)
            let totalDist = 0;
            for (let i = 1; i < coords.length; i++) {
              totalDist += haversineKm(
                coords[i - 1].latitude, coords[i - 1].longitude,
                coords[i].latitude, coords[i].longitude,
              );
            }
            setTotalDistance(Math.round(totalDist * 10) / 10);
            routeDistanceRef.current = Math.round(totalDist * 10) / 10;
          });
        }
      }

      const tr = tRef.current;
      showAlertOnce(
        ride._id, 'started',
        tr('taxi.rideStarted'),
        tr('taxi.enjoyYourRide'),
        [{ text: tr('common.ok') }]
      );
    });

    socket.on('ride:completed', async (data) => {
      const ride = data.ride || data;
      // Skip driver-targeted events (shape: { rideId, updatedStats }) or malformed data
      if (!ride._id || !ride.driver) return;
      // Dedup: prevent double-fire from admin room or reconnection buffer
      const key = `${ride._id}:completed`;
      if (shownAlertsRef.current.has(key)) return;
      shownAlertsRef.current.add(key);

      let completedData = ride;
      // If driver info is missing (not populated), fetch full ride from API
      if (!ride.driver?.user) {
        try {
          const res = await taxiAPI.getRideById(ride._id);
          if (res.data?.data?.ride) completedData = res.data.data.ride;
        } catch (e) {
          if (__DEV__) console.warn('[TaxiScreen] Failed to fetch ride details for review:', e.message);
        }
      }

      setCompletedRide(completedData);
      setShowReviewModal(true);
      resetBookingState();
      notificationSuccess();
      rideCompleted();
      maybePromptReview();
    });

    socket.on('ride:cancelled', (ride) => {
      // Skip entirely when the cancel was initiated by this client — handleConfirmCancel
      // already reset state and showed an alert.
      if (userCancellingRef.current) {
        return;
      }
      // Ignore cancellations for rides that don't belong to this user
      const cur = currentRideRef.current;
      if (!cur || cur._id !== ride._id) {
        return;
      }
      notificationError();
      rideCancelled();
      resetBookingState();
      const tr = tRef.current;
      showAlertOnce(
        ride._id, 'cancelled',
        tr('taxi.rideCancelled'),
        ride.cancelledBy === 'driver'
          ? tr('taxi.driverCancelledRide')
          : tr('taxi.rideCancelledMessage'),
        [{ text: tr('common.ok') }]
      );
    });

    socket.on('ride:expired', (data) => {
      clearRideTimeout();
      resetBookingState();
      const tr = tRef.current;
      showAlertOnce(
        data.rideId, 'expired',
        tr('taxi.rideExpired'),
        tr('taxi.rideExpiredMessage'),
        [{ text: tr('common.ok') }]
      );
    });

    socket.on('ride:waitingTimeout', (data) => {
      resetBookingState();
      const tr = tRef.current;
      showAlertOnce(
        data.rideId, 'waitingTimeout',
        tr('taxi.waitingTimeout'),
        tr('taxi.waitingTimeoutMessage'),
        [{ text: tr('common.ok') }]
      );
    });

    // Chat — increment unread count for incoming messages from driver
    socket.on('chat:message', (data) => {
      const msg = data?.message || data;
      // Only count messages not sent by us
      if (msg?.senderId !== currentRideRef.current?.userId) {
        setUnreadChatCount(prev => prev + 1);
      }
    });

    return () => {
      // Clear trailing driver location flush timer
      if (driverLocTrailingRef.current) {
        clearTimeout(driverLocTrailingRef.current);
        driverLocTrailingRef.current = null;
      }
      socket.off('ride:accepted');
      socket.off('driver:locationUpdate');
      socket.off('ride:driverApproaching');
      socket.off('ride:arrived');
      socket.off('ride:started');
      socket.off('ride:completed');
      socket.off('ride:cancelled');
      socket.off('ride:expired');
      socket.off('ride:waitingTimeout');
      socket.off('chat:message');
    };
  }, [socket]);

  // Reconcile ride state when connectivity is restored
  useEffect(() => {
    const unsubscribe = onReconnect(async () => {
      // M10: Skip if another reconciliation is in progress
      if (isReconcilingRef.current) return;
      isReconcilingRef.current = true;
      try {
        const response = await taxiAPI.getMyRides();
        const rides = response.data?.data?.rides || [];
        const activeRide = rides.find(r =>
          !['completed', 'cancelled'].includes(r.status)
        );

        if (activeRide) {
          // Update search start time for pending rides before applying state
          if (activeRide.status === 'pending' && activeRide.createdAt) {
            const createdAt = new Date(activeRide.createdAt).getTime();
            searchStartedAtRef.current = createdAt;
            _searchStartedAt = createdAt;
          }

          applyRideToState(activeRide);
          setCachedRide(activeRide);

          // Restore destination refs for socket handlers
          if (activeRide.dropoff?.lat && activeRide.dropoff?.lng) {
            savedDestinationRef.current = activeRide.dropoff.address || '';
            savedDestinationCoordsRef.current = {
              latitude: activeRide.dropoff.lat,
              longitude: activeRide.dropoff.lng,
            };
          }

          const reconnVehicle = activeRide.driver?.vehicle;
          persistRideState({
            rideId: activeRide._id,
            status: activeRide.status,
            bookingStep: activeRide.status === 'pending' ? BOOKING_STEPS.SEARCHING
              : activeRide.status === 'accepted' ? BOOKING_STEPS.DRIVER_FOUND
              : activeRide.status === 'driver_arrived' ? BOOKING_STEPS.DRIVER_ARRIVED
              : BOOKING_STEPS.IN_PROGRESS,
            pickup: activeRide.pickup,
            dropoff: activeRide.dropoff,
            vehicleType: activeRide.vehicleType,
            paymentMethod: activeRide.paymentMethod,
            estimatedPrice: activeRide.quote?.totalPrice,
            estimatedDuration: activeRide.quote?.duration,
            driverLocation: activeRide.driver?.location?.coordinates
              ? { latitude: activeRide.driver.location.coordinates[1], longitude: activeRide.driver.location.coordinates[0] }
              : null,
            driverName: activeRide.driver?.user?.firstName || null,
            driverVehicle: reconnVehicle ? { make: reconnVehicle.make, model: reconnVehicle.model, color: reconnVehicle.color, licensePlate: reconnVehicle.licensePlate } : null,
            totalDistance: activeRide.quote?.distance ? parseFloat(activeRide.quote.distance) : routeDistanceRef.current,
          });

          // Reconnect reconciliation: no notification — avoid spamming
        } else if (currentRideRef.current) {
          // Ride ended while offline
          resetBookingState();
        }
      } catch (error) {
        if (__DEV__) console.warn('[TaxiScreen] Reconnect reconciliation failed:', error.message);
      } finally {
        isReconcilingRef.current = false;
      }
    });
    return unsubscribe;
  }, [onReconnect, applyRideToState]);

  // Safety-net polling during SEARCHING: check ride status every 10s.
  // Catches missed socket events (e.g. brief disconnect during driver acceptance).
  useEffect(() => {
    if (bookingStep !== BOOKING_STEPS.SEARCHING) return;
    const rideId = currentRideRef.current?._id;
    if (!rideId) return;

    const poll = async () => {
      try {
        const res = await taxiAPI.getRideById(rideId);
        const ride = res.data?.data?.ride;
        if (ride && ride.status !== 'pending') {
          if (__DEV__) console.log('[TaxiScreen] Poll detected status change:', ride.status);
          applyRideToState(ride);
          setCachedRide(ride);
        }
      } catch {
        // silent — socket is primary, this is just a fallback
      }
    };

    const id = setInterval(poll, 10000);
    return () => clearInterval(id);
  }, [bookingStep, applyRideToState]);

  // Unified progress bar + timeout for SEARCHING state.
  // Uses searchStartedAtRef to calculate elapsed time, so it works correctly for:
  //   - Fresh search (elapsed ≈ 0, full 30s animation)
  //   - Resume after navigation (elapsed > 0, animation continues from correct position)
  //   - Resume after app kill (elapsed from server createdAt or SecureStore savedAt)
  useEffect(() => {
    if (bookingStep === BOOKING_STEPS.SEARCHING) {
      const startedAt = searchStartedAtRef.current || Date.now();
      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(0, RIDE_REQUEST_TIMEOUT - elapsed);
      const startProgress = Math.min(100, (elapsed / RIDE_REQUEST_TIMEOUT) * 100);

      progressAnim.stopAnimation();
      progressAnim.setValue(startProgress);

      if (remaining > 0) {
        Animated.timing(progressAnim, {
          toValue: 100,
          duration: remaining,
          useNativeDriver: false,
        }).start();
        timeoutTimerRef.current = setTimeout(handleRideTimeout, remaining);
      } else {
        handleRideTimeout();
      }

      return () => {
        progressAnim.stopAnimation();
        if (timeoutTimerRef.current) {
          clearTimeout(timeoutTimerRef.current);
          timeoutTimerRef.current = null;
        }
      };
    } else {
      progressAnim.stopAnimation();
      progressAnim.setValue(0);
    }
  }, [bookingStep]);

  // ETA countdown — no longer sends notifications, just kept as state for UI display

  const resetBookingState = () => {
    dismissRideNotification();
    clearCachedRide();
    clearSearchMeta();
    setCurrentRide(null);
    setBookingStep(BOOKING_STEPS.LOCATION_SEARCH);
    setDestination('');
    setDestinationCoords(null);
    setStops([]);
    setEstimatedPrice(null);
    setEstimatedDuration(null);
    setDriverLocation(null);
    setDriverETA(null);
    setDriverDistance(null);
    setRoutePolyline(null);
    setNearbyDrivers([]);
    setDriverRoute(null);
    setTotalDistance(null);
    routeDistanceRef.current = null;
    driverLocationRef.current = null;
    driverCloseNotifiedRef.current = false;
    pendingDriverLocRef.current = null;
    driverLocLastFlushRef.current = 0;
    if (driverLocTrailingRef.current) {
      clearTimeout(driverLocTrailingRef.current);
      driverLocTrailingRef.current = null;
    }
    setUnreadChatCount(0);
    savedDestinationRef.current = null;
    savedDestinationCoordsRef.current = null;
    searchStartedAtRef.current = null;
    // Do NOT clear shownAlertsRef here — it must persist across resetBookingState
    // calls to prevent duplicate alerts from reconnection re-delivery or admin-room
    // double-emit. Old entries are harmless (keyed by rideId, new rides have new IDs).
    clearRideTimeout();
    clearRideState();
  };

  // Refresh GPS position without re-requesting permission.
  // Used when we know permission is already granted (e.g. returning from ride options).
  const refreshLocation = async () => {
    try {
      const currentLocation = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('GPS timeout')), 10000)),
      ]);
      if (currentLocation.coords.accuracy != null && currentLocation.coords.accuracy > 50) {
        if (!locationRef.current) {
          setLocation({ latitude: currentLocation.coords.latitude, longitude: currentLocation.coords.longitude });
        }
        return;
      }
      const newLocation = { latitude: currentLocation.coords.latitude, longitude: currentLocation.coords.longitude };
      const prev = locationRef.current;
      if (prev) {
        const dlat = (newLocation.latitude - prev.latitude) * 111320;
        const dlng = (newLocation.longitude - prev.longitude) * 111320 * Math.cos(prev.latitude * 0.01745329);
        if (Math.sqrt(dlat * dlat + dlng * dlng) < 20) return;
      }
      setLocation(newLocation);
      setCustomPickup(null);
      const result = await reverseGeocode(newLocation.latitude, newLocation.longitude);
      if (result) {
        setLocationAddress(result.mainText || result.address || t('taxi.currentLocation'));
      }
    } catch {
      // GPS timeout/error — keep last known position, don't show permission alert
      if (__DEV__) console.warn('[TaxiScreen] refreshLocation failed');
    } finally {
      setIsLoadingLocation(false);
    }
  };

  const requestLocationPermission = async () => {
    try {
      // Check current permission status first — avoid showing the OS dialog
      // when permission was already granted (prevents redundant prompts on
      // Android when navigating back or returning from background).
      let { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') {
        // Only request (show OS dialog) if not yet granted
        const result = await Location.requestForegroundPermissionsAsync();
        status = result.status;
      }
      if (status !== 'granted') {
        Alert.alert(
          t('taxi.locationPermission'),
          t('taxi.locationPermissionDesc'),
          [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('taxi.enableLocation'), onPress: () => Linking.openSettings() },
          ]
        );
        setIsLoadingLocation(false);
        return;
      }

      // 1. Try cached location first — only if recent (<60s) and accurate (<100m)
      const lastKnown = await Location.getLastKnownPositionAsync();
      if (lastKnown && !locationRef.current) {
        const ageMs = Date.now() - lastKnown.timestamp;
        const accuracy = lastKnown.coords.accuracy;
        if (ageMs < 60000 && (accuracy == null || accuracy < 100)) {
          const cachedLocation = {
            latitude: lastKnown.coords.latitude,
            longitude: lastKnown.coords.longitude,
          };
          setLocation(cachedLocation);
          setCustomPickup(null);
          setIsLoadingLocation(false);

          try {
            const result = await reverseGeocode(cachedLocation.latitude, cachedLocation.longitude);
            if (result) {
              setLocationAddress(result.mainText || result.address || t('taxi.currentLocation'));
            }
          } catch (e) {
            if (__DEV__) console.warn('[TaxiScreen] Reverse geocode failed:', e.message);
          }
        }
      }

      // 2. Get fresh high-accuracy position (with timeout to prevent hanging)
      await refreshLocation();
    } catch (error) {
      // Only show permission alert if it's actually a permission issue, not a GPS error
      if (__DEV__) console.warn('[TaxiScreen] requestLocationPermission error:', error.message);
      if (!locationRef.current) {
        // No location at all — prompt user
        Alert.alert(
          t('taxi.locationPermission'),
          t('taxi.locationPermissionDesc'),
          [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('taxi.enableLocation'), onPress: () => Linking.openSettings() },
          ]
        );
      }
    } finally {
      setIsLoadingLocation(false);
    }
  };

  const calculatePrice = useCallback((distance, vehicleId) => {
    const cat = pricingConfig.categories[vehicleId] || pricingConfig.categories.economy;
    const fare = cat.basePrice + (distance * cat.kmPrice);
    return fare.toFixed(2);
  }, [pricingConfig]);

  // Fetch directions and update map with route polyline
  // Reads location from ref to avoid recreating this callback on every GPS tick.
  const fetchDirectionsAndUpdate = useCallback(async (destCoords) => {
    const pickup = customPickup || locationRef.current;
    if (!pickup || !destCoords) return;

    setIsLoadingDirections(true);

    // Collect valid stop waypoints
    const waypoints = stops
      .filter(s => s.coords)
      .map(s => ({ latitude: s.coords.latitude, longitude: s.coords.longitude }));

    try {
      let directions = null;

      if (waypoints.length > 0) {
        // With stops: use OSRM directly (supports waypoints via fetchRouteOSRM)
        const polylineCoords = await fetchRouteOSRM(pickup, destCoords, waypoints);
        if (polylineCoords && polylineCoords.length > 1) {
          // Estimate total distance from polyline
          let totalDist = 0;
          for (let i = 1; i < polylineCoords.length; i++) {
            totalDist += haversineKm(
              polylineCoords[i - 1].latitude, polylineCoords[i - 1].longitude,
              polylineCoords[i].latitude, polylineCoords[i].longitude,
            );
          }
          setEstimatedPrice(calculatePrice(totalDist, selectedVehicle));
          setEstimatedDuration(Math.round(totalDist * 2.5));
          setTotalDistance(Math.round(totalDist * 10) / 10);
          routeDistanceRef.current = Math.round(totalDist * 10) / 10;
          setRoutePolyline(polylineCoords);

          setTimeout(() => {
            if (mapRef.current && polylineCoords.length > 0) {
              safeFit(mapRef,polylineCoords, {
                edgePadding: EDGE_PAD_ROUTE,
                animated: true,
              });
            }
          }, 100);
          return;
        }
      }

      // No stops: try Google Directions first, then OSRM as fallback
      directions = await getDirections(pickup, destCoords);
      if (!directions) {
        directions = await getDirectionsOSRM(pickup, destCoords);
      }

      if (directions && directions.polyline && directions.polyline.length > 0) {
        // Use real distance and duration from directions
        setEstimatedPrice(calculatePrice(directions.distance, selectedVehicle));
        setEstimatedDuration(directions.duration);
        setTotalDistance(Math.round(directions.distance * 10) / 10);
        routeDistanceRef.current = Math.round(directions.distance * 10) / 10;

        // Convert polyline to {latitude, longitude} format for react-native-maps
        const polyline = directions.polyline.map(p => ({
          latitude: Array.isArray(p) ? p[0] : p.latitude || p.lat,
          longitude: Array.isArray(p) ? p[1] : p.longitude || p.lng,
        }));
        setRoutePolyline(polyline);

        // Fit map to route
        setTimeout(() => {
          if (mapRef.current && polyline.length > 0) {
            safeFit(mapRef,polyline, {
              edgePadding: EDGE_PAD_ROUTE,
              animated: true,
            });
          }
        }, 100);
      } else {
        // Last resort fallback to straight line
        const distance = haversineKm(
          pickup.latitude,
          pickup.longitude,
          destCoords.latitude,
          destCoords.longitude
        );
        setEstimatedPrice(calculatePrice(distance, selectedVehicle));
        setEstimatedDuration(Math.round(distance * 2.5));
        setTotalDistance(Math.round(distance * 10) / 10);
        routeDistanceRef.current = Math.round(distance * 10) / 10;
        setRoutePolyline([
          { latitude: pickup.latitude, longitude: pickup.longitude },
          { latitude: destCoords.latitude, longitude: destCoords.longitude },
        ]);

        setTimeout(() => {
          if (mapRef.current) {
            safeFit(mapRef,[pickup, destCoords], {
              edgePadding: EDGE_PAD_ROUTE,
              animated: true,
            });
          }
        }, 100);
      }
    } catch (error) {
      // Fallback calculation — use ref since location is not in deps
      const loc = locationRef.current;
      if (loc) {
        const distance = haversineKm(
          loc.latitude,
          loc.longitude,
          destCoords.latitude,
          destCoords.longitude
        );
        setEstimatedPrice(calculatePrice(distance, selectedVehicle));
        setEstimatedDuration(Math.round(distance * 2.5));
      }
    } finally {
      setIsLoadingDirections(false);
    }
  }, [customPickup, stops, selectedVehicle, calculatePrice]);

  // Handle destination selection with coordinates (from Places Autocomplete)
  const handleDestinationSelectWithCoords = useCallback(async (address, coords) => {
    setDestination(address);
    setDestinationCoords(coords);

    await fetchDirectionsAndUpdate(coords);

    // Auto-transition to ride options when destination is selected
    setBookingStep(BOOKING_STEPS.RIDE_OPTIONS);
  }, [fetchDirectionsAndUpdate]);

  // H3: No random coordinates — only update text; require Places selection for coords
  const handleDestinationChange = useCallback(async (text) => {
    setDestination(text);

    if (text.length <= 3 || !locationRef.current) {
      setDestinationCoords(null);
      setEstimatedPrice(null);
      setEstimatedDuration(null);
      setRoutePolyline(null);
    }
    // Coordinates are only set via handleDestinationSelectWithCoords (Places autocomplete)
  }, []);

  const handleDestinationSelect = useCallback((address, coords) => {
    if (coords) {
      handleDestinationSelectWithCoords(address, coords);
    } else {
      handleDestinationChange(address);
    }
  }, [handleDestinationSelectWithCoords, handleDestinationChange]);

  // H2: Use stored route distance (totalDistance / ref) instead of Haversine straight-line
  const handleVehicleSelect = useCallback((vehicleId) => {
    setSelectedVehicle(vehicleId);

    const dist = totalDistance || routeDistanceRef.current;
    if (dist) {
      setEstimatedPrice(calculatePrice(dist, vehicleId));
    } else {
      const pickup = customPickup || locationRef.current;
      if (pickup && destinationCoords) {
        // Fallback to Haversine only if no route distance available yet
        const distance = haversineKm(
          pickup.latitude,
          pickup.longitude,
          destinationCoords.latitude,
          destinationCoords.longitude
        );
        setEstimatedPrice(calculatePrice(distance, vehicleId));
      }
    }
  }, [totalDistance, customPickup, destinationCoords, calculatePrice]);

  const clearRideTimeout = () => {
    if (timeoutTimerRef.current) {
      clearTimeout(timeoutTimerRef.current);
      timeoutTimerRef.current = null;
    }
    progressAnim.setValue(0);
  };

  const handleRideTimeout = async () => {
    const ride = currentRideRef.current;
    if (!ride || !ride._id) return;

    // Flag so late-arriving socket events don't show a second alert
    userCancellingRef.current = true;

    try {
      // Check server-side ride status before cancelling — the ride may have been
      // accepted between the timeout firing and now (race condition)
      const response = await taxiAPI.getMyRides();
      const rides = response.data?.data?.rides || [];
      const serverRide = rides.find(r => r._id === ride._id);

      if (serverRide && serverRide.status !== 'pending') {
        // Ride was accepted/updated — apply the real state instead of cancelling
        applyRideToState(serverRide);
        return;
      }

      await taxiAPI.cancelRide(ride._id, 'waiting_time_too_long', 'No driver accepted within the time limit');
      // Pre-register so socket ride:cancelled and ride:expired are suppressed
      shownAlertsRef.current.add(`${ride._id}:cancelled`);
      shownAlertsRef.current.add(`${ride._id}:expired`);
      resetBookingState();
      Alert.alert(
        t('taxi.noDriverFound'),
        t('taxi.noDriverFoundMessage'),
        [{ text: t('common.ok') }]
      );
    } catch (error) {
      resetBookingState(); // C7: Reset state unconditionally, not just on alert dismiss
      Alert.alert(
        t('errors.error'),
        t('taxi.noDriverFoundMessage'),
        [{ text: t('common.ok') }]
      );
    } finally {
      setTimeout(() => { userCancellingRef.current = false; }, 2000);
    }
  };

  const handleRequestRide = async () => {
    mediumImpact();
    if (!location) {
      Alert.alert(t('errors.error'), t('errors.locationError'));
      return;
    }

    if (!destination || !destinationCoords) {
      Alert.alert(t('errors.error'), t('taxi.enterDestination'));
      return;
    }

    if (!user) {
      Alert.alert(t('errors.error'), t('auth.pleaseLogin'));
      return;
    }

    // Check if user has phone number
    if (!hasPhoneNumber) {
      Alert.alert(
        t('taxi.phoneNumberRequired'),
        t('taxi.phoneNumberRequiredMessage'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('taxi.addPhoneNumber'),
            onPress: () => navigation.navigate('MainTabs', { screen: 'Profile' })
          }
        ]
      );
      return;
    }

    // Cash: submit ride directly. Non-cash: preauthorize payment first.
    if (paymentMethod === 'cash') {
      submitRideRequest('cash', null);
      return;
    }

    // Non-cash: preauthorize (hold funds) before submitting ride
    const price = estimatedPrice ? parseFloat(estimatedPrice) : 0;
    if (!price || price <= 0) {
      Alert.alert(t('errors.error'), t('taxi.enterDestination'));
      return;
    }

    setIsRequesting(true);
    try {
      const lang = i18n.language === 'ka' ? 'ka' : 'en';
      let preauthResult;

      if (paymentMethod === 'saved_card' && selectedCardId) {
        // Saved card: preauth via recurrent charge with capture: manual
        const res = await paymentAPI.preauthRide(selectedCardId, price, lang);
        preauthResult = res.data?.data;
      } else {
        // Apple Pay / Google Pay: preauth via one-time order with capture: manual
        const method = paymentMethod === 'apple_pay' ? ['apple_pay'] : ['google_pay'];
        const res = await paymentAPI.payRide(price, null, method, lang, 'manual');
        preauthResult = res.data?.data;
      }

      if (!preauthResult?.orderId) {
        throw new Error('No order ID returned');
      }

      // Redirect to BOG payment page if needed (saved card or Apple/Google Pay)
      if (preauthResult.redirectUrl) {
        await WebBrowser.openAuthSessionAsync(preauthResult.redirectUrl, 'lulini://');
      }

      // Verify the preauth status
      const verifyRes = await paymentAPI.verifyRidePayment(preauthResult.orderId);
      const status = verifyRes.data?.data?.status;
      const confirmedPaymentId = verifyRes.data?.data?.paymentId || preauthResult.paymentId;

      if (status === 'blocked' || status === 'completed') {
        // Funds held successfully — now submit the ride
        setIsRequesting(false);
        submitRideRequest(paymentMethod, confirmedPaymentId);
      } else if (status === 'rejected') {
        const errorKey = verifyRes.data?.data?.errorKey;
        Alert.alert(t('errors.error'), t(errorKey || 'payment.cardPaymentFailed'));
        setIsRequesting(false);
      } else {
        Alert.alert(t('payment.cardPaymentProcessing'), t('payment.paymentPendingMessage'));
        setIsRequesting(false);
      }
    } catch (err) {
      Alert.alert(
        t('errors.error'),
        err.response?.data?.message || t('payment.cardPaymentFailed')
      );
      setIsRequesting(false);
    }
  };

  const handlePaymentMethodSelect = (method, cardId, paymentId) => {
    if (method === 'card' && cardId) {
      setPaymentMethod('saved_card');
      setSelectedCardId(cardId);
    } else {
      setPaymentMethod(method);
      setSelectedCardId(null);
    }
    setSelectedPaymentId(paymentId || null);
  };

  const submitRideRequest = async (method, paymentId) => {
    // Duplicate guard: prevent submitting if there's already an active ride
    const existingRide = currentRideRef.current;
    if (existingRide && !['completed', 'cancelled'].includes(existingRide.status)) {
      Alert.alert(t('errors.error'), t('taxi.activeRideExists'));
      return;
    }

    setIsRequesting(true);

    try {
      // Use route distance (from directions API) for consistency with estimatedPrice shown to passenger.
      // Fall back to straight-line only if route distance is unavailable.
      const pickupCoords = customPickup || location;
      const distance = totalDistance || haversineKm(
        pickupCoords.latitude,
        pickupCoords.longitude,
        destinationCoords.latitude,
        destinationCoords.longitude
      );

      const price = estimatedPrice
        ? parseFloat(estimatedPrice)
        : parseFloat(calculatePrice(distance, selectedVehicle));
      const cat = pricingConfig.categories[selectedVehicle] || pricingConfig.categories.economy;
      const basePrice = cat.basePrice + (distance * cat.kmPrice);
      const duration = estimatedDuration || Math.round(distance * 2.5);

      const rideData = {
        pickup: {
          lat: pickupCoords.latitude,
          lng: pickupCoords.longitude,
          address: locationAddress || 'Current Location'
        },
        dropoff: {
          lat: destinationCoords.latitude,
          lng: destinationCoords.longitude,
          address: destination
        },
        stops: stops.filter(s => s.coords).map(s => ({
          lat: s.coords.latitude,
          lng: s.coords.longitude,
          address: s.address,
        })),
        vehicleType: selectedVehicle,
        quote: {
          distance: parseFloat(distance).toFixed(2),
          distanceText: `${parseFloat(distance).toFixed(2)} km`,
          duration: duration,
          durationText: `${duration} min`,
          basePrice: parseFloat(basePrice).toFixed(2),
          totalPrice: price.toFixed(2)
        },
        passengerName: `${user.firstName} ${user.lastName}`,
        passengerPhone: user.phone || '',
        paymentMethod: method || paymentMethod,
        paymentId: paymentId || selectedPaymentId || undefined,
        cardId: selectedCardId || undefined,
        notes: ''
      };

      // Idempotency key prevents duplicate rides on network retry
      const idempotencyKey = Crypto.randomUUID();
      const response = await taxiAPI.requestRide(rideData, {
        headers: { 'X-Idempotency-Key': idempotencyKey },
      });

      if (response.data.success) {
        const ride = response.data.data.ride;
        setCurrentRide(ride);
        setCachedRide(ride);

        // Record search start time BEFORE setting bookingStep so the
        // progress useEffect has the correct value when it fires.
        const now = Date.now();
        searchStartedAtRef.current = now;
        _searchStartedAt = now;

        setBookingStep(BOOKING_STEPS.SEARCHING);

        // Persist ride state to survive app kill
        persistRideState({
          rideId: ride._id,
          status: ride.status,
          bookingStep: BOOKING_STEPS.SEARCHING,
          pickup: rideData.pickup,
          dropoff: rideData.dropoff,
          vehicleType: selectedVehicle,
          paymentMethod: method || paymentMethod,
          estimatedPrice: price.toFixed(2),
          estimatedDuration: duration,
          driverLocation: null,
          driverName: null,
          totalDistance: totalDistance || routeDistanceRef.current,
        });

        // Save destination data for restoring after driver is found
        savedDestinationRef.current = destination;
        savedDestinationCoordsRef.current = destinationCoords;

        // Cache last destination for instant re-selection next time
        persistLastDestination(destination, destinationCoords);

        // Clear destination marker and route, center on user
        setDestinationCoords(null);
        setRoutePolyline(null);

        if (location && mapRef.current) {
          safeAnimate(mapRef,{
            latitude: location.latitude,
            longitude: location.longitude,
            latitudeDelta: 0.03,
            longitudeDelta: 0.03,
          }, 300);
        }

        // Fetch and show nearby online drivers on map, cache for navigation resilience
        try {
          const driversRes = await taxiAPI.getNearbyDrivers(
            location.latitude,
            location.longitude,
            selectedVehicle
          );
          const drivers = driversRes.data?.data?.drivers || [];
          _nearbyDriversCache = drivers;
          setNearbyDrivers(drivers);
        } catch (err) {
          if (__DEV__) console.warn('[TaxiScreen] Failed to fetch nearby drivers:', err.message);
        }

        // Timeout is handled by the progress useEffect (triggered by bookingStep change).
      }
    } catch (error) {
      // Offline-specific error handling
      if (error.code === 'ERR_OFFLINE') {
        Alert.alert(
          t('errors.networkError'),
          t('errors.noInternetConnection'),
          [{ text: t('common.ok') }]
        );
        return;
      }
      const errorMessage = error.response?.data?.message || t('errors.tryAgain');
      Alert.alert(t('errors.somethingWentWrong'), errorMessage);
    } finally {
      setIsRequesting(false);
    }
  };

  const handleOpenChat = useCallback(() => {
    setUnreadChatCount(0);
    const ride = currentRideRef.current;
    const rideId = ride?._id || ride?.id;
    const driverName = [ride?.driver?.user?.firstName, ride?.driver?.user?.lastName].filter(Boolean).join(' ')
      || ride?.driver?.user?.fullName || tRef.current('taxi.driver');
    navigation.navigate('Chat', { rideId, driverName });
  }, [navigation]);

  const handleCancelRide = useCallback(() => {
    mediumImpact();
    setShowCancelModal(true);
  }, []);
  const closeCancelModal = useCallback(() => setShowCancelModal(false), []);
  const closePaymentModal = useCallback(() => setShowPaymentMethodModal(false), []);

  const handleConfirmCancel = async (reason, note) => {
    if (!currentRide || !currentRide._id) {
      setShowCancelModal(false);
      return;
    }

    const rideId = currentRide._id;
    setIsCancelling(true);
    // Prevent race: clear timeout before API call so handleRideTimeout can't fire mid-flight
    clearRideTimeout();
    // Flag so the socket ride:cancelled handler skips (we handle UI here)
    userCancellingRef.current = true;
    try {
      await taxiAPI.cancelRide(rideId, reason, note);
      // Pre-register in shownAlertsRef so the socket event (which may arrive after
      // userCancellingRef is cleared) is also suppressed by showAlertOnce.
      shownAlertsRef.current.add(`${rideId}:cancelled`);
      resetBookingState();
      setShowCancelModal(false);
      Alert.alert(
        t('taxi.rideCancelled'),
        t('taxi.rideCancelledSuccessfully'),
        [{ text: t('common.ok') }]
      );
    } catch (error) {
      const errorMessage = error.response?.data?.message || t('errors.tryAgain');
      Alert.alert(t('errors.error'), errorMessage);
    } finally {
      setIsCancelling(false);
      // Delay clearing the flag so late-arriving socket events are still caught
      setTimeout(() => { userCancellingRef.current = false; }, 2000);
    }
  };

  const handleSubmitReview = async (rating, reviewText) => {
    if (!completedRide || !completedRide._id) {
      setShowReviewModal(false);
      return;
    }

    setIsSubmittingReview(true);
    try {
      await taxiAPI.reviewDriver(completedRide._id, rating, reviewText);
      setShowReviewModal(false);
      setCompletedRide(null);
      Alert.alert(
        t('taxi.thankYou'),
        t('taxi.reviewSubmitted'),
        [{ text: t('common.ok') }]
      );
    } catch (error) {
      const errorMessage = error.response?.data?.message || t('errors.tryAgain');
      Alert.alert(t('errors.error'), errorMessage);
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const handleCloseReviewModal = () => {
    setShowReviewModal(false);
    setCompletedRide(null);
  };

  const handleBackToSearch = useCallback(() => {
    setDestination('');
    setDestinationCoords(null);
    setEstimatedPrice(null);
    setEstimatedDuration(null);
    setRoutePolyline(null);
    setStops([]);
    setCustomPickup(null);
    setBookingStep(BOOKING_STEPS.LOCATION_SEARCH);
    // Refresh pickup address from GPS — don't re-request permission
    refreshLocation();
  }, []);

  const handlePickupSelect = useCallback((address, coords) => {
    setLocationAddress(address);
    setCustomPickup(coords);
  }, []);

  // Handle draggable pickup pin drop — reverse geocode to get address
  const handlePickupDragEnd = useCallback(async (coords) => {
    setCustomPickup(coords);
    try {
      const result = await reverseGeocode(coords.latitude, coords.longitude);
      if (result) {
        setLocationAddress(result.mainText || result.address);
      }
    } catch (e) {
      if (__DEV__) console.warn('[TaxiScreen] Reverse geocode on drag error:', e.message);
    }
  }, []);

  const handleAddStop = useCallback(() => {
    setStops(prev => {
      if (prev.length >= 2) return prev;
      return [...prev, { address: '', coords: null }];
    });
  }, []);

  const handleRemoveStop = useCallback((index) => {
    setStops(prev => prev.filter((_, i) => i !== index));
    // Re-fetch route after stop removed — use ref to avoid stale closure
    const currentDestCoords = savedDestinationCoordsRef.current || destinationCoords;
    if (currentDestCoords) {
      setTimeout(() => fetchDirectionsAndUpdate(currentDestCoords), 100);
    }
  }, [destinationCoords, fetchDirectionsAndUpdate]);

  const handleStopSelect = useCallback((index, address, coords) => {
    setStops(prev => {
      const updated = [...prev];
      updated[index] = { address, coords };
      return updated;
    });
    // Re-fetch route through the new stop
    if (coords && destinationCoords) {
      setTimeout(() => fetchDirectionsAndUpdate(destinationCoords), 100);
    }
  }, [destinationCoords, fetchDirectionsAndUpdate]);

  const centerOnUser = useCallback(() => {
    if (!mapRef.current) return;

    // During driver tracking, recenter to show both driver and user
    const dLoc = driverLocationRef.current;
    const loc = locationRef.current;
    if (
      dLoc &&
      (bookingStep === BOOKING_STEPS.DRIVER_FOUND ||
        bookingStep === BOOKING_STEPS.DRIVER_ARRIVED)
    ) {
      safeFit(mapRef, [dLoc, loc || DEFAULT_LOCATION], {
        edgePadding: EDGE_PAD_DRIVER,
        animated: true,
      });
      return;
    }

    if (loc) {
      safeAnimate(mapRef,
        {
          latitude: loc.latitude,
          longitude: loc.longitude,
          latitudeDelta: 0.015,
          longitudeDelta: 0.015,
        },
        300
      );
    }
  }, [bookingStep]);

  // Handle "Select on Map" icon press — target: 'pickup', 'destination', or stop index
  const handleSelectOnMap = useCallback((target = 'destination') => {
    setIsSelectingOnMap(target);
    if (bottomSheetRef.current) {
      bottomSheetRef.current.collapse();
    }
  }, []);

  // Handle map press for location selection (routed to the correct input)
  // Sets pin immediately, then reverse geocodes address in background
  const handleRegionChangeComplete = useCallback((region) => {
    // Only track zoom when DriverCluster is rendered (RIDE_OPTIONS / SEARCHING)
    if (!driversVisibleRef.current) return;
    if (zoomDebounceRef.current) clearTimeout(zoomDebounceRef.current);
    zoomDebounceRef.current = setTimeout(() => {
      if (region.latitudeDelta > 0) {
        const zoom = Math.round(Math.log2(360 / region.latitudeDelta));
        setMapZoomLevel(prev => prev === zoom ? prev : zoom);
      }
    }, 500);
  }, []);

  const handleMapPress = useCallback(async (event) => {
    if (isSelectingOnMap == null) return;

    const { latitude, longitude } = event.nativeEvent.coordinate;
    const target = isSelectingOnMap;
    const coords = { latitude, longitude };

    // Immediately place the pin and dismiss selection mode
    setIsSelectingOnMap(null);
    if (bottomSheetRef.current) {
      bottomSheetRef.current.snapToIndex(1);
    }

    if (target === 'pickup') {
      setCustomPickup(coords);
      setLocationAddress(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
    } else if (typeof target === 'number') {
      setStops(prev => {
        const updated = [...prev];
        updated[target] = { address: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`, coords };
        return updated;
      });
    } else {
      setDestinationCoords(coords);
      setDestination(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
    }

    // Reverse geocode in background to get real address
    try {
      const addressResult = await reverseGeocode(latitude, longitude);
      const address = addressResult?.mainText || addressResult?.address || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;

      if (target === 'pickup') {
        setLocationAddress(address);
      } else if (typeof target === 'number') {
        setStops(prev => {
          const updated = [...prev];
          if (updated[target]) updated[target] = { ...updated[target], address };
          return updated;
        });
      } else {
        setDestination(address);
      }
    } catch (e) {
      if (__DEV__) console.warn('[TaxiScreen] Reverse geocode error:', e.message);
    }

    // Fetch directions after pin is placed
    if (target === 'destination') {
      setIsLoadingDirections(true);
      try {
        await fetchDirectionsAndUpdate(coords);
        setBookingStep(BOOKING_STEPS.RIDE_OPTIONS);
      } finally {
        setIsLoadingDirections(false);
      }
    } else if (typeof target === 'number' && destinationCoords) {
      setTimeout(() => fetchDirectionsAndUpdate(destinationCoords), 100);
    }
  }, [isSelectingOnMap, fetchDirectionsAndUpdate, destinationCoords]);

  // Get ride status for RideStatusSheet
  const getRideStatus = () => {
    switch (bookingStep) {
      case BOOKING_STEPS.SEARCHING:
        return 'searching';
      case BOOKING_STEPS.DRIVER_FOUND:
        return 'found';
      case BOOKING_STEPS.DRIVER_ARRIVED:
        return 'driver_arrived';
      case BOOKING_STEPS.IN_PROGRESS:
        return 'in_progress';
      default:
        return null;
    }
  };

  // Memoized sheet content — only re-creates when booking step or its dependencies change,
  // avoiding unnecessary React element allocation on unrelated re-renders.
  const sheetContent = useMemo(() => {
    const rideStatus = getRideStatus();

    if (rideStatus) {
      return (
        <RideStatusSheet
          rideStatus={rideStatus}
          currentRide={currentRide}
          estimatedPrice={estimatedPrice}
          estimatedDuration={estimatedDuration}
          totalDistance={totalDistance}
          progress={progress}
          driverETA={driverETA}
          driverDistance={driverDistance}
          waitingTimeLeft={waitingTimeLeft}
          waitingFee={waitingFee}
          onCancel={handleCancelRide}
          onOpenChat={handleOpenChat}
          unreadChatCount={unreadChatCount}
        />
      );
    }

    if (bookingStep === BOOKING_STEPS.RIDE_OPTIONS) {
      return (
        <RideOptionsSheet
          selectedVehicle={selectedVehicle}
          paymentMethod={paymentMethod}
          estimatedPrice={estimatedPrice}
          estimatedDuration={estimatedDuration}
          onVehicleChange={handleVehicleSelect}
          onPaymentPress={() => {
            setPaymentModalMode('select');
            setShowPaymentMethodModal(true);
          }}
          onRequestRide={handleRequestRide}
          onBack={handleBackToSearch}
          isRequesting={isRequesting}
          pricingConfig={pricingConfig}
          routeDistance={totalDistance || routeDistanceRef.current}
        />
      );
    }

    return (
      <LocationSearchSheet
        pickup={{ address: locationAddress }}
        destination={destination}
        onDestinationChange={handleDestinationChange}
        onDestinationSelect={handleDestinationSelect}
        onPickupRefresh={requestLocationPermission}
        onPickupSelect={handlePickupSelect}
        isLoadingLocation={isLoadingLocation || isLoadingDirections}
        userLocation={locationRef.current}
        onSelectOnMap={handleSelectOnMap}
        stops={stops}
        onAddStop={handleAddStop}
        onRemoveStop={handleRemoveStop}
        onStopSelect={handleStopSelect}
        lastDestination={lastDestination}
      />
    );
  }, [
    bookingStep, currentRide, estimatedPrice, estimatedDuration, totalDistance,
    driverETA, driverDistance, waitingTimeLeft, waitingFee,
    unreadChatCount,
    selectedVehicle, isRequesting, pricingConfig,
    locationAddress, destination, isLoadingLocation, isLoadingDirections,
    stops, lastDestination,
  ]);

  // Memoize showsUserLocation — avoids native map reconfiguration on unrelated re-renders.
  // Only actually changes when entering/leaving IN_PROGRESS.
  const showsUserLocation = useMemo(
    () => bookingStep !== BOOKING_STEPS.IN_PROGRESS,
    [bookingStep]
  );

  // Stable ref — initialRegion is only read on mount, must not change per-render
  const initialRegion = useRef({
    latitude: DEFAULT_LOCATION.latitude,
    longitude: DEFAULT_LOCATION.longitude,
    latitudeDelta: 0.02,
    longitudeDelta: 0.02,
  }).current;

  return (
    <View style={styles.container}>
      {/* Cancel Ride Modal */}
      <CancelRideModal
        visible={showCancelModal}
        onClose={closeCancelModal}
        onConfirm={handleConfirmCancel}
        isLoading={isCancelling}
      />

      {/* Ride Review Modal */}
      <RideReviewModal
        visible={showReviewModal}
        ride={completedRide}
        onClose={handleCloseReviewModal}
        onSubmit={handleSubmitReview}
        isLoading={isSubmittingReview}
      />

      <PaymentMethodModal
        visible={showPaymentMethodModal}
        onClose={closePaymentModal}
        onSelect={handlePaymentMethodSelect}
        amount={estimatedPrice ? parseFloat(estimatedPrice) : 0}
        mode={paymentModalMode}
      />

      {/* Full Screen Map */}
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          style={styles.map}
          customMapStyle={isDark ? mapStyleDark : mapStyle}
          initialRegion={initialRegion}
          onMapReady={() => {
            mapReadyRef.current = true;
            // Flush queued fit (driver+pickup) that arrived before map was ready
            if (pendingFitRef.current) {
              const { coords, opts } = pendingFitRef.current;
              pendingFitRef.current = null;
              didFitToDriverRef.current = true;
              safeFit(mapRef, coords, opts);
            } else if (!didInitialCenter.current && locationRef.current) {
              // No pending fit — center on user location
              didInitialCenter.current = true;
              safeAnimate(mapRef, {
                latitude: locationRef.current.latitude,
                longitude: locationRef.current.longitude,
                latitudeDelta: 0.015,
                longitudeDelta: 0.015,
              }, 500);
            }
          }}
          onPress={isSelectingOnMap != null ? handleMapPress : undefined}
          showsUserLocation={showsUserLocation}
          showsMyLocationButton={false}
          toolbarEnabled={false}
          showsCompass={false}
          moveOnMarkerPress={false}
          rotateEnabled={false}
          onRegionChangeComplete={handleRegionChangeComplete}
        >
          {/* User location — native blue dot (hidden during IN_PROGRESS, only car visible) */}

          {/* Custom pickup pin — only when user chose a different starting location */}
          {customPickup && (bookingStep === BOOKING_STEPS.LOCATION_SEARCH || bookingStep === BOOKING_STEPS.RIDE_OPTIONS) && (
            <DraggablePickupMarker
              coordinate={customPickup}
              onDragEnd={handlePickupDragEnd}
            />
          )}

          {/* Static pickup pin — during active ride steps (not draggable) */}
          {customPickup && bookingStep !== BOOKING_STEPS.LOCATION_SEARCH && bookingStep !== BOOKING_STEPS.RIDE_OPTIONS && (
            <Marker
              coordinate={customPickup}
              image={markerImages.pickup}
              anchor={ANCHOR_BOTTOM}
              tracksViewChanges={false}
              zIndex={6}
            />
          )}

          {/* Destination marker - red pin with flag */}
          {destinationCoords && <DestinationMarker coordinate={destinationCoords} />}

          {/* Stop markers - custom orange pins (not pinColor, which Apple Maps hides on zoom out) */}
          {stops.map((stop, index) => stop.coords && (
            <StopMarker
              key={`stop-${index}`}
              coordinate={stop.coords}
              index={index}
            />
          ))}

          {/* Driver marker - animated car with rotation */}
          {driverLocation && (
            <AnimatedCarMarker coordinate={driverLocation} isAssigned={true} />
          )}

          {/* Nearby drivers while searching - clustered when zoomed out */}
          {nearbyDrivers.length > 0 && (
            <DriverCluster drivers={nearbyDrivers} zoomLevel={mapZoomLevel} />
          )}

          {/* Route polyline — only ONE line on screen at a time.
              driverRoute (live) takes priority over routePolyline (static). */}
          {driverRoute && driverRoute.length > 1 ? (
            <Polyline id="driver-route" coordinates={driverRoute} {...(isDark ? ROUTE_STYLE_DARK : ROUTE_STYLE)} />
          ) : routePolyline && routePolyline.length > 1 ? (
            <Polyline id="route-main" coordinates={routePolyline} {...(isDark ? ROUTE_STYLE_DARK : ROUTE_STYLE)} />
          ) : null}
        </MapView>

        {/* Loading Overlay */}
        {isLoadingLocation && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>{t('taxi.gettingLocation')}</Text>
          </View>
        )}

        {/* Map Controls */}
        <View style={[styles.mapControls, { top: insets.top + 10 }]}>
          <TouchableOpacity
            style={styles.controlButton}
            onPress={() => navigation.navigate('MainTabs')}
          >
            <Ionicons name="arrow-back" size={24} color={colors.foreground} />
          </TouchableOpacity>
        </View>

        {/* Map Selection Mode Overlay */}
        {isSelectingOnMap != null && (
          <View style={[styles.mapSelectionOverlay, { top: insets.top + 10 }]}>
            <View style={styles.mapSelectionBanner}>
              <Ionicons name="location" size={20} color={colors.background} />
              <Text style={styles.mapSelectionText}>{t('taxi.tapToSelectLocation')}</Text>
              <TouchableOpacity
                style={styles.mapSelectionCancel}
                onPress={() => {
                  setIsSelectingOnMap(null);
                  if (bottomSheetRef.current) {
                    bottomSheetRef.current.snapToIndex(1);
                  }
                }}
              >
                <Ionicons name="close" size={20} color={colors.background} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Phone Number Required Alert Banner */}
        {!hasPhoneNumber && user && (
          <TouchableOpacity
            style={[styles.phoneAlertBanner, { top: insets.top + 64 }]}
            onPress={() => navigation.navigate('MainTabs', { screen: 'Profile' })}
            activeOpacity={0.9}
          >
            <View style={styles.phoneAlertContent}>
              <Ionicons name="warning" size={20} color="#fff" />
              <View style={styles.phoneAlertTextContainer}>
                <Text style={styles.phoneAlertTitle}>{t('taxi.phoneNumberRequired')}</Text>
                <Text style={styles.phoneAlertMessage}>{t('taxi.addPhoneNumber')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#fff" />
            </View>
          </TouchableOpacity>
        )}

      </View>

      {/* Draggable Bottom Sheet */}
      <DraggableBottomSheet
        ref={bottomSheetRef}
        snapPoints={snapPoints}
        initialSnapIndex={1}
        onChange={setSheetSnapIndex}
        isFullscreen={sheetSnapIndex === snapPoints.length - 1 && (bookingStep === BOOKING_STEPS.LOCATION_SEARCH || bookingStep === BOOKING_STEPS.RIDE_OPTIONS)}
        floatingButton={
          sheetSnapIndex === snapPoints.length - 1 && bookingStep === BOOKING_STEPS.LOCATION_SEARCH
            ? null
            : (
              <TouchableOpacity style={styles.myLocationButton} onPress={centerOnUser}>
                <Ionicons name="location" size={22} color={colors.primary} />
              </TouchableOpacity>
            )
        }
        headerBar={
          sheetSnapIndex === snapPoints.length - 1 && bookingStep === BOOKING_STEPS.LOCATION_SEARCH
            ? (
              <View style={styles.sheetHeaderBar}>
                <TouchableOpacity
                  style={styles.sheetHeaderSide}
                  onPress={() => bottomSheetRef.current?.snapToIndex(1)}
                  hitSlop={HIT_SLOP}
                >
                  <Ionicons name="close" size={24} color={colors.foreground} />
                </TouchableOpacity>
                <Text style={styles.sheetHeaderTitle}>{t('taxi.yourRoute')}</Text>
                <TouchableOpacity
                  style={styles.sheetHeaderSide}
                  onPress={handleAddStop}
                  hitSlop={HIT_SLOP}
                >
                  <Ionicons name="add" size={24} color={colors.foreground} />
                </TouchableOpacity>
              </View>
            )
            : null
        }
      >
        {sheetContent}
      </DraggableBottomSheet>
    </View>
  );
}

const createStyles = (typography, colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  mapContainer: {
    flex: 1,
    position: 'relative',
    backgroundColor: colors.muted,
  },
  map: {
    flex: 1,
    backgroundColor: colors.muted,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    ...typography.h2,
    color: colors.foreground,
  },
  mapControls: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    zIndex: 10,
  },
  controlButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  myLocationButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  sheetHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  sheetHeaderTitle: {
    flex: 1,
    textAlign: 'center',
    ...typography.bodyMedium,
    fontWeight: '600',
    color: colors.foreground,
  },
  sheetHeaderSide: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  phoneAlertBanner: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: '#dc2626',
    borderRadius: radius.lg,
    padding: 12,
    zIndex: 10,
    ...shadows.lg,
  },
  phoneAlertContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  phoneAlertTextContainer: {
    flex: 1,
    marginLeft: 10,
  },
  phoneAlertTitle: {
    color: '#fff',
    ...typography.body,
    fontWeight: '600',
  },
  phoneAlertMessage: {
    color: 'rgba(255,255,255,0.9)',
    ...typography.caption,
    marginTop: 2,
  },
  mapSelectionOverlay: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 20,
  },
  mapSelectionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: 12,
    paddingHorizontal: 16,
    ...shadows.lg,
  },
  mapSelectionText: {
    flex: 1,
    color: colors.background,
    ...typography.body,
    fontWeight: '600',
    marginLeft: 10,
  },
  mapSelectionCancel: {
    padding: 4,
  },
});
