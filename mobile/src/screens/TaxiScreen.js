import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
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
import { taxiAPI, settingsAPI } from '../services/api';
import { persistRideState, loadRideState, clearRideState } from '../services/rideStorage';
import {
  showRideNotification,
  dismissRideNotification,
} from '../services/rideNotification';
import { getDirections, getDirectionsOSRM, reverseGeocode } from '../services/googleMaps';
import { colors, shadows, radius, useTypography } from '../theme/colors';
import CancelRideModal from '../components/CancelRideModal';
import RideReviewModal from '../components/RideReviewModal';
import LocationSearchSheet from '../components/taxi/LocationSearchSheet';
import RideOptionsSheet from '../components/taxi/RideOptionsSheet';
import RideStatusSheet from '../components/taxi/RideStatusSheet';
import DraggableBottomSheet from '../components/taxi/DraggableBottomSheet';
import PaymentMethodModal from '../components/taxi/PaymentMethodModal';
import { VEHICLE_TYPES } from '../components/taxi/VehicleTypeSelector';
import PulsingUserMarker from '../components/map/PulsingUserMarker';
import DestinationMarker from '../components/map/DestinationMarker';
import AnimatedCarMarker from '../components/map/AnimatedCarMarker';
import DriverCluster from '../components/map/DriverCluster';
import StopMarker from '../components/map/StopMarker';
import { ROUTE_STYLE, ROUTE_SHADOW_STYLE, DRIVER_ROUTE_STYLE } from '../components/map/mapStyle';
import { haversineKm } from '../utils/distance';

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

// Default location (Kutaisi, Georgia)
const DEFAULT_LOCATION = {
  latitude: 42.2679,
  longitude: 42.6946,
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

// L14: Fetch OSRM route with AbortController timeout
const fetchRouteOSRM = async (from, to, waypoints = []) => {
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
      return data.routes[0].geometry.coordinates.map(([lng, lat]) => ({
        latitude: lat, longitude: lng,
      }));
    }
  } catch (e) {
    console.warn('[TaxiScreen] OSRM route fetch failed:', e.message);
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
  const styles = React.useMemo(() => createStyles(typography), [typography]);
  const { t } = useTranslation();
  const { user } = useAuth();
  const { socket } = useSocket();
  const { onReconnect } = useNetwork();
  const mapRef = useRef(null);
  const bottomSheetRef = useRef(null);
  const insets = useSafeAreaInsets();

  // Location states
  const [location, setLocation] = useState(null);
  const [locationAddress, setLocationAddress] = useState('');
  const [destination, setDestination] = useState('');
  const [destinationCoords, setDestinationCoords] = useState(null);
  const [stops, setStops] = useState([]); // Array of { address, coords }
  const [isLoadingLocation, setIsLoadingLocation] = useState(true);

  // Booking states
  const [bookingStep, setBookingStep] = useState(BOOKING_STEPS.LOCATION_SEARCH);
  const [selectedVehicle, setSelectedVehicle] = useState('economy');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [selectedCardId, setSelectedCardId] = useState(null);
  const [confirmedPaymentId, setConfirmedPaymentId] = useState(null);
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

  // Refs for values used inside socket handlers to avoid re-registering listeners
  const locationRef = useRef(null);
  const currentRideRef = useRef(null);
  const tRef = useRef(t);

  // M10: Prevent concurrent reconciliation calls
  const isReconcilingRef = useRef(false);

  // Tracks last accepted driver location for distance-based throttling in socket handler.
  // Only updated when the position passes the 5m threshold, preventing re-renders from GPS noise.
  const driverLocationRef = useRef(null);

  // Track shown alerts to prevent duplicates (key: "rideId:eventType")
  const shownAlertsRef = useRef(new Set());

  // Track whether "driver is close" notification was already sent for current ride
  const driverCloseNotifiedRef = useRef(false);

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

  // Map selection mode
  const [isSelectingOnMap, setIsSelectingOnMap] = useState(false);

  // Track bottom sheet snap index for fullscreen mode
  const [sheetSnapIndex, setSheetSnapIndex] = useState(1);

  // Dynamic pricing from server (defaults match hardcoded fallbacks)
  const [pricingConfig, setPricingConfig] = useState({ basePrice: 5, kmPrice: 1.5 });

  // Map zoom level for driver clustering
  const [mapZoomLevel, setMapZoomLevel] = useState(15);

  // Throttle driver route fetching
  const lastDriverRouteFetchRef = useRef(0);

  // Debounce zoom level updates to avoid re-renders during pinch/pan
  const zoomDebounceRef = useRef(null);

  // Check if user has phone number
  const hasPhoneNumber = user?.phone && user.phone.trim() !== '';

  // Dynamic snap points based on booking step (max 70% to keep map visible)
  const snapPoints = useMemo(() => {
    switch (bookingStep) {
      case BOOKING_STEPS.LOCATION_SEARCH:
        return ['25%', '50%', '100%'];
      case BOOKING_STEPS.RIDE_OPTIONS:
        return ['45%', '55%', '70%'];
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

    // Fetch dynamic pricing config from server
    settingsAPI.getPricing()
      .then(res => {
        if (res.data?.data) {
          setPricingConfig({ basePrice: res.data.data.basePrice, kmPrice: res.data.data.kmPrice });
        }
      })
      .catch(() => {}); // Use defaults on failure

    return () => {
      // Prevent leaked timers when TaxiScreen unmounts
      if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
      if (zoomDebounceRef.current) clearTimeout(zoomDebounceRef.current);
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

  // Re-check location permission when app returns to foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextAppState) => {
      if (nextAppState === 'active') {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') {
          // Don't null location — keep showing last known blue dot.
          // Only prompt user to re-enable permissions.
          Alert.alert(
            t('taxi.locationPermission'),
            t('taxi.locationPermissionDesc'),
            [
              { text: t('common.cancel'), style: 'cancel' },
              { text: t('taxi.enableLocation'), onPress: () => requestLocationPermission() },
            ]
          );
        } else {
          // Permission is still granted — refresh location silently.
          // Only update state if moved >20m to avoid unnecessary re-renders
          // that cause markers (blue dot, cars) to flicker on Android.
          try {
            const currentLocation = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            });
            const newLat = currentLocation.coords.latitude;
            const newLng = currentLocation.coords.longitude;
            const prev = locationRef.current;
            if (prev) {
              const dlat = (newLat - prev.latitude) * 111320;
              const dlng = (newLng - prev.longitude) * 111320 * Math.cos(prev.latitude * 0.01745329);
              if (Math.sqrt(dlat * dlat + dlng * dlng) < 20) return; // <20m — skip
            }
            setLocation({ latitude: newLat, longitude: newLng });
          } catch {
            // Keep last known location
          }
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
        mapRef.current.fitToCoordinates(coords, {
          edgePadding: { top: 80, right: 50, bottom: 250, left: 50 },
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

          // Only fetch pickup→destination route during in_progress.
          // During accepted/driver_arrived, driver-to-pickup route is fetched
          // by the driverLocation useEffect automatically.
          if (cached.status === 'in_progress') {
            const pickupCoords = cached.pickup?.lat
              ? { latitude: cached.pickup.lat, longitude: cached.pickup.lng }
              : locationRef.current;
            if (pickupCoords) {
              const destCoords = { latitude: cached.dropoff.lat, longitude: cached.dropoff.lng };
              const waypoints = (cached.stops || [])
                .filter(s => s.lat && s.lng)
                .map(s => ({ latitude: s.lat, longitude: s.lng }));
              fetchRouteOSRM(pickupCoords, destCoords, waypoints)
                .then(coords => setRoutePolyline(coords));
            }
          }
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

        if (savedState.dropoff?.lat && savedState.dropoff?.lng) {
          // Refs already set by applyRideToState

          // Only fetch pickup→destination route during in_progress
          if (savedState.status === 'in_progress' && savedState.pickup?.lat && savedState.pickup?.lng) {
            const pickupCoords = { latitude: savedState.pickup.lat, longitude: savedState.pickup.lng };
            const destCoords = { latitude: savedState.dropoff.lat, longitude: savedState.dropoff.lng };
            fetchRouteOSRM(pickupCoords, destCoords).then(coords => {
              if (coords) setRoutePolyline(coords);
            }).catch(() => {});
          }
        }
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

          // Refs already set by applyRideToState.
          // Only fetch pickup→destination route during in_progress.
          if (activeRide.status === 'in_progress' && activeRide.dropoff?.lat && activeRide.dropoff?.lng) {
            const destCoords = { latitude: activeRide.dropoff.lat, longitude: activeRide.dropoff.lng };

            const pickupCoords = activeRide.pickup?.lat
              ? { latitude: activeRide.pickup.lat, longitude: activeRide.pickup.lng }
              : locationRef.current;
            if (pickupCoords) {
              const waypoints = (activeRide.stops || [])
                .filter(s => s.lat && s.lng)
                .map(s => ({ latitude: s.lat, longitude: s.lng }));
              fetchRouteOSRM(pickupCoords, destCoords, waypoints).then(coords => {
                setRoutePolyline(coords);
              });
            }
          }

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
        console.warn('[TaxiScreen] Offline — using cached ride state');
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
    if (location && mapRef.current && !didInitialCenter.current) {
      didInitialCenter.current = true;
      mapRef.current.animateToRegion({
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

  // Fetch driver-to-pickup route when driver location updates (throttled to 15s)
  useEffect(() => {
    if (!driverLocation || !location) return;
    if (bookingStep !== BOOKING_STEPS.DRIVER_FOUND && bookingStep !== BOOKING_STEPS.DRIVER_ARRIVED) return;

    const now = Date.now();
    if (now - lastDriverRouteFetchRef.current < 15000) return; // 15s throttle (was 5s)
    lastDriverRouteFetchRef.current = now;

    fetchRouteOSRM(driverLocation, location).then(setDriverRoute);
  }, [driverLocation, bookingStep, location]);

  // Fit map to driver + pickup — only on first driver location, not every update.
  // Constant fitToCoordinates prevents user from panning the map manually.
  const didFitToDriverRef = useRef(false);
  useEffect(() => {
    if (!driverLocation || !mapRef.current) return;
    if (bookingStep !== BOOKING_STEPS.DRIVER_FOUND && bookingStep !== BOOKING_STEPS.DRIVER_ARRIVED) return;

    // Only auto-fit once when driver is first found, let user pan freely after
    if (didFitToDriverRef.current) return;
    didFitToDriverRef.current = true;

    const loc = locationRef.current;
    if (!loc) return;

    mapRef.current.fitToCoordinates([driverLocation, loc], {
      edgePadding: { top: 80, right: 80, bottom: 250, left: 80 },
      animated: true,
    });
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
      console.log('[TaxiScreen] ride:accepted received!', ride?._id);
      clearRideTimeout();
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

      const { latitude, longitude } = data.location;

      // Distance-based throttle: skip state updates if driver moved < 5 meters.
      // This prevents TaxiScreen re-renders from GPS noise (1-3m jitter)
      // while AnimatedCarMarker handles smooth interpolation independently.
      const prev = driverLocationRef.current;
      if (prev) {
        const dlat = (latitude - prev.latitude) * 111320;
        const dlng = (longitude - prev.longitude) * 111320 * Math.cos(prev.latitude * 0.01745329);
        if (Math.sqrt(dlat * dlat + dlng * dlng) < 5) return;
      }

      const newLoc = { latitude, longitude };
      driverLocationRef.current = newLoc;
      setDriverLocation(newLoc);

      if (loc) {
        const distance = haversineKm(
          latitude,
          longitude,
          loc.latitude,
          loc.longitude
        );
        setDriverDistance(distance);
        const eta = Math.round((distance / 30) * 60);
        setDriverETA(eta);

        // One-time "driver is close" notification when within threshold
        if (ride && !driverCloseNotifiedRef.current && distance <= DRIVER_CLOSE_THRESHOLD_KM) {
          driverCloseNotifiedRef.current = true;
          showRideNotification('accepted', extractDriverInfo(ride), eta);
        }
      }
    });

    socket.on('ride:arrived', (ride) => {
      // Guard: ignore events for a different ride (stale reconnection buffer)
      const cur = currentRideRef.current;
      if (!ride?._id || (cur && cur._id !== ride._id)) return;

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

      // Clear driver marker/route, restore destination + stops
      setDriverLocation(null);
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

        // Fetch full route: pickup → stops → destination
        if (loc) {
          fetchRouteOSRM(loc, savedCoords, waypoints).then(coords => {
            setRoutePolyline(coords);

            // Calculate total distance from polyline
            let totalDist = 0;
            for (let i = 1; i < coords.length; i++) {
              totalDist += haversineKm(
                coords[i - 1].latitude, coords[i - 1].longitude,
                coords[i].latitude, coords[i].longitude,
              );
            }
            setTotalDistance(Math.round(totalDist * 10) / 10); // 1 decimal place
            routeDistanceRef.current = Math.round(totalDist * 10) / 10;

            if (mapRef.current) {
              mapRef.current.fitToCoordinates(coords, {
                edgePadding: { top: 50, right: 50, bottom: 250, left: 50 },
                animated: true,
              });
            }
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
          console.warn('[TaxiScreen] Failed to fetch ride details for review:', e.message);
        }
      }

      setCompletedRide(completedData);
      setShowReviewModal(true);
      resetBookingState();
    });

    socket.on('ride:cancelled', (ride) => {
      // Skip entirely when the cancel was initiated by this client — handleConfirmCancel
      // already reset state and showed an alert.
      if (userCancellingRef.current || ride.cancelledBy === 'user') {
        return;
      }
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

    return () => {
      socket.off('ride:accepted');
      socket.off('driver:locationUpdate');
      socket.off('ride:arrived');
      socket.off('ride:started');
      socket.off('ride:completed');
      socket.off('ride:cancelled');
      socket.off('ride:expired');
      socket.off('ride:waitingTimeout');
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
        console.warn('[TaxiScreen] Reconnect reconciliation failed:', error.message);
      } finally {
        isReconcilingRef.current = false;
      }
    });
    return unsubscribe;
  }, [onReconnect, applyRideToState]);

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
    savedDestinationRef.current = null;
    savedDestinationCoordsRef.current = null;
    searchStartedAtRef.current = null;
    // Do NOT clear shownAlertsRef here — it must persist across resetBookingState
    // calls to prevent duplicate alerts from reconnection re-delivery or admin-room
    // double-emit. Old entries are harmless (keyed by rideId, new rides have new IDs).
    clearRideTimeout();
    clearRideState();
  };

  const requestLocationPermission = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          t('taxi.locationPermission'),
          t('taxi.locationPermissionDesc'),
          [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('taxi.enableLocation'), onPress: () => Location.requestForegroundPermissionsAsync() },
          ]
        );
        setIsLoadingLocation(false);
        return;
      }

      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const newLocation = {
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude,
      };

      setLocation(newLocation);

      const [address] = await Location.reverseGeocodeAsync({
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude,
      });

      if (address) {
        const addressString = [
          address.street,
          address.name,
          address.city,
        ].filter(Boolean).join(', ');
        setLocationAddress(addressString || t('taxi.currentLocation'));
      }
    } catch (error) {
      setLocation(DEFAULT_LOCATION);
      setLocationAddress('Kutaisi, Georgia');
    } finally {
      setIsLoadingLocation(false);
    }
  };

  const calculatePrice = useCallback((distance, vehicleId) => {
    const vehicleType = VEHICLE_TYPES.find(v => v.id === vehicleId);
    const basePrice = pricingConfig.basePrice + (distance * pricingConfig.kmPrice);
    return (basePrice * vehicleType.priceMultiplier).toFixed(2);
  }, [pricingConfig]);

  // Fetch directions and update map with route polyline
  const fetchDirectionsAndUpdate = useCallback(async (destCoords) => {
    if (!location || !destCoords) return;

    setIsLoadingDirections(true);

    // Collect valid stop waypoints
    const waypoints = stops
      .filter(s => s.coords)
      .map(s => ({ latitude: s.coords.latitude, longitude: s.coords.longitude }));

    try {
      let directions = null;

      if (waypoints.length > 0) {
        // With stops: use OSRM directly (supports waypoints via fetchRouteOSRM)
        const polylineCoords = await fetchRouteOSRM(location, destCoords, waypoints);
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
              mapRef.current.fitToCoordinates(polylineCoords, {
                edgePadding: { top: 50, right: 50, bottom: 250, left: 50 },
                animated: true,
              });
            }
          }, 100);
          return;
        }
      }

      // No stops: try Google Directions first, then OSRM as fallback
      directions = await getDirections(location, destCoords);
      if (!directions) {
        directions = await getDirectionsOSRM(location, destCoords);
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
            mapRef.current.fitToCoordinates(polyline, {
              edgePadding: { top: 50, right: 50, bottom: 250, left: 50 },
              animated: true,
            });
          }
        }, 100);
      } else {
        // Last resort fallback to straight line
        const distance = haversineKm(
          location.latitude,
          location.longitude,
          destCoords.latitude,
          destCoords.longitude
        );
        setEstimatedPrice(calculatePrice(distance, selectedVehicle));
        setEstimatedDuration(Math.round(distance * 2.5));
        setTotalDistance(Math.round(distance * 10) / 10);
        routeDistanceRef.current = Math.round(distance * 10) / 10;
        setRoutePolyline([
          { latitude: location.latitude, longitude: location.longitude },
          { latitude: destCoords.latitude, longitude: destCoords.longitude },
        ]);

        setTimeout(() => {
          if (mapRef.current) {
            mapRef.current.fitToCoordinates([location, destCoords], {
              edgePadding: { top: 50, right: 50, bottom: 250, left: 50 },
              animated: true,
            });
          }
        }, 100);
      }
    } catch (error) {
      // Fallback calculation
      const distance = haversineKm(
        location.latitude,
        location.longitude,
        destCoords.latitude,
        destCoords.longitude
      );
      setEstimatedPrice(calculatePrice(distance, selectedVehicle));
      setEstimatedDuration(Math.round(distance * 2.5));
    } finally {
      setIsLoadingDirections(false);
    }
  }, [location, stops, selectedVehicle, calculatePrice]);

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

    if (text.length <= 3 || !location) {
      setDestinationCoords(null);
      setEstimatedPrice(null);
      setEstimatedDuration(null);
      setRoutePolyline(null);
    }
    // Coordinates are only set via handleDestinationSelectWithCoords (Places autocomplete)
  }, [location]);

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
    } else if (location && destinationCoords) {
      // Fallback to Haversine only if no route distance available yet
      const distance = haversineKm(
        location.latitude,
        location.longitude,
        destinationCoords.latitude,
        destinationCoords.longitude
      );
      setEstimatedPrice(calculatePrice(distance, vehicleId));
    }
  }, [totalDistance, location, destinationCoords, calculatePrice]);

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
      resetBookingState();
      Alert.alert(
        t('taxi.noDriverFound'),
        t('taxi.noDriverFoundMessage'),
        [{ text: t('common.ok') }]
      );
    } catch (error) {
      Alert.alert(
        t('errors.error'),
        t('taxi.noDriverFoundMessage'),
        [{ text: t('common.ok'), onPress: () => resetBookingState() }]
      );
    }
  };

  const handleRequestRide = async () => {
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

    // If card payment is selected, show payment method modal first
    if (paymentMethod === 'card') {
      setShowPaymentMethodModal(true);
      return;
    }

    // Otherwise proceed with cash payment
    submitRideRequest(paymentMethod);
  };

  const submitRideRequest = async (selectedPaymentMethod, paymentId = null) => {
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
      const distance = totalDistance || haversineKm(
        location.latitude,
        location.longitude,
        destinationCoords.latitude,
        destinationCoords.longitude
      );

      const price = estimatedPrice
        ? parseFloat(estimatedPrice)
        : parseFloat(calculatePrice(distance, selectedVehicle));
      const basePrice = pricingConfig.basePrice + (distance * pricingConfig.kmPrice);
      const duration = estimatedDuration || Math.round(distance * 2.5);

      const rideData = {
        pickup: {
          lat: location.latitude,
          lng: location.longitude,
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
        paymentMethod: selectedPaymentMethod,
        paymentId: paymentId || undefined,
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
          paymentMethod: selectedPaymentMethod,
          estimatedPrice: price.toFixed(2),
          estimatedDuration: duration,
          driverLocation: null,
          driverName: null,
          totalDistance: totalDistance || routeDistanceRef.current,
        });

        // Save destination data for restoring after driver is found
        savedDestinationRef.current = destination;
        savedDestinationCoordsRef.current = destinationCoords;

        // Clear destination marker and route, center on user
        setDestinationCoords(null);
        setRoutePolyline(null);

        if (location && mapRef.current) {
          mapRef.current.animateToRegion({
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
          console.warn('[TaxiScreen] Failed to fetch nearby drivers:', err.message);
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

  const handleCancelRide = () => {
    setShowCancelModal(true);
  };

  const handleConfirmCancel = async (reason, note) => {
    if (!currentRide || !currentRide._id) {
      setShowCancelModal(false);
      return;
    }

    setIsCancelling(true);
    // Prevent race: clear timeout before API call so handleRideTimeout can't fire mid-flight
    clearRideTimeout();
    // Flag so the socket ride:cancelled handler skips (we handle UI here)
    userCancellingRef.current = true;
    try {
      await taxiAPI.cancelRide(currentRide._id, reason, note);
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
      userCancellingRef.current = false;
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
    setBookingStep(BOOKING_STEPS.LOCATION_SEARCH);
  }, []);

  const handlePickupSelect = useCallback((address, coords) => {
    setLocationAddress(address);
    setLocation(coords);
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

  const centerOnUser = () => {
    if (!mapRef.current) return;

    // During driver tracking, recenter to show both driver and user
    if (
      driverLocation &&
      (bookingStep === BOOKING_STEPS.DRIVER_FOUND ||
        bookingStep === BOOKING_STEPS.DRIVER_ARRIVED)
    ) {
      const loc = location || DEFAULT_LOCATION;
      mapRef.current.fitToCoordinates([driverLocation, loc], {
        edgePadding: { top: 80, right: 80, bottom: 250, left: 80 },
        animated: true,
      });
      return;
    }

    if (location) {
      mapRef.current.animateToRegion(
        {
          latitude: location.latitude,
          longitude: location.longitude,
          latitudeDelta: 0.015,
          longitudeDelta: 0.015,
        },
        300
      );
    }
  };

  // Handle "Select on Map" button press
  const handleSelectOnMap = useCallback(() => {
    setIsSelectingOnMap(true);
    if (bottomSheetRef.current) {
      bottomSheetRef.current.collapse();
    }
  }, []);

  // Handle map press for destination selection
  const handleMapPress = useCallback(async (event) => {
    if (!isSelectingOnMap) return;

    const { latitude, longitude } = event.nativeEvent.coordinate;

    setIsLoadingDirections(true);

    try {
      const addressResult = await reverseGeocode(latitude, longitude);

      if (addressResult) {
        const address = addressResult.mainText || addressResult.address;
        const coords = { latitude, longitude };

        setDestination(address);
        setDestinationCoords(coords);
        setIsSelectingOnMap(false);

        await fetchDirectionsAndUpdate(coords);

        if (bottomSheetRef.current) {
          bottomSheetRef.current.snapToIndex(1);
        }
        setBookingStep(BOOKING_STEPS.RIDE_OPTIONS);
      }
    } catch (error) {
      if (bottomSheetRef.current) {
        bottomSheetRef.current.snapToIndex(1);
      }
    } finally {
      setIsSelectingOnMap(false);
      setIsLoadingDirections(false);
    }
  }, [isSelectingOnMap, fetchDirectionsAndUpdate]);

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

  // Render sheet content based on step
  const renderSheetContent = () => {
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
          onPaymentChange={setPaymentMethod}
          onRequestRide={handleRequestRide}
          onBack={handleBackToSearch}
          isRequesting={isRequesting}
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
        userLocation={location}
        onSelectOnMap={handleSelectOnMap}
        stops={stops}
        onAddStop={handleAddStop}
        onRemoveStop={handleRemoveStop}
        onStopSelect={handleStopSelect}
      />
    );
  };

  const initialRegion = {
    latitude: location?.latitude || DEFAULT_LOCATION.latitude,
    longitude: location?.longitude || DEFAULT_LOCATION.longitude,
    latitudeDelta: 0.02,
    longitudeDelta: 0.02,
  };

  return (
    <View style={styles.container}>
      {/* Cancel Ride Modal */}
      <CancelRideModal
        visible={showCancelModal}
        onClose={() => setShowCancelModal(false)}
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

      {/* Payment Method Modal */}
      <PaymentMethodModal
        visible={showPaymentMethodModal}
        onClose={() => setShowPaymentMethodModal(false)}
        amount={estimatedPrice ? parseFloat(estimatedPrice) : 0}
        onSelect={(method, cardId, paymentId) => {
          setShowPaymentMethodModal(false);
          setSelectedCardId(cardId || null);
          setConfirmedPaymentId(paymentId || null);
          submitRideRequest(method, paymentId);
        }}
      />

      {/* Full Screen Map */}
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={initialRegion}
          onPress={handleMapPress}
          showsUserLocation={false}
          showsMyLocationButton={false}
          toolbarEnabled={false}
          showsCompass={false}
          onRegionChangeComplete={(region) => {
            // Debounce zoom level calculation — avoids re-renders during pan/pinch
            if (zoomDebounceRef.current) clearTimeout(zoomDebounceRef.current);
            zoomDebounceRef.current = setTimeout(() => {
              if (region.latitudeDelta > 0) {
                const zoom = Math.round(Math.log2(360 / region.latitudeDelta));
                setMapZoomLevel(prev => prev === zoom ? prev : zoom);
              }
            }, 300);
          }}
        >
          {/* User location - pulsing blue dot (fallback to ref for resilience) */}
          {(location || locationRef.current) && (
            <PulsingUserMarker coordinate={location || locationRef.current} />
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

          {/* Main route shadow (rendered behind for depth) */}
          {routePolyline && routePolyline.length > 1 && (
            <Polyline id="route-shadow" coordinates={routePolyline} {...ROUTE_SHADOW_STYLE} />
          )}
          {/* Main route polyline (pickup → destination) */}
          {routePolyline && routePolyline.length > 1 && (
            <Polyline id="route-main" coordinates={routePolyline} {...ROUTE_STYLE} />
          )}

          {/* Driver-to-pickup route */}
          {driverRoute && driverRoute.length > 1 && (
            <Polyline id="driver-route" coordinates={driverRoute} {...DRIVER_ROUTE_STYLE} />
          )}
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
        {isSelectingOnMap && (
          <View style={[styles.mapSelectionOverlay, { top: insets.top + 10 }]}>
            <View style={styles.mapSelectionBanner}>
              <Ionicons name="location" size={20} color={colors.background} />
              <Text style={styles.mapSelectionText}>{t('taxi.tapToSelectLocation')}</Text>
              <TouchableOpacity
                style={styles.mapSelectionCancel}
                onPress={() => {
                  setIsSelectingOnMap(false);
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
        isFullscreen={sheetSnapIndex === snapPoints.length - 1 && bookingStep === BOOKING_STEPS.LOCATION_SEARCH}
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
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="close" size={24} color={colors.foreground} />
                </TouchableOpacity>
                <Text style={styles.sheetHeaderTitle}>{t('taxi.yourRoute')}</Text>
                <TouchableOpacity
                  style={styles.sheetHeaderSide}
                  onPress={handleAddStop}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="add" size={24} color={colors.foreground} />
                </TouchableOpacity>
              </View>
            )
            : null
        }
      >
        {renderSheetContent()}
      </DraggableBottomSheet>
    </View>
  );
}

const createStyles = (typography) => StyleSheet.create({
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
