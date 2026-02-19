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
} from 'react-native';
import MapView, { Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as Crypto from 'expo-crypto';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useNetwork } from '../context/NetworkContext';
import { taxiAPI } from '../services/api';
import { persistRideState, loadRideState, clearRideState } from '../services/rideStorage';
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
import { ROUTE_STYLE, ROUTE_SHADOW_STYLE, DRIVER_ROUTE_STYLE } from '../components/map/mapStyle';

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

// Haversine distance between two points (km) — module-level, zero allocation per render
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Fetch OSRM route between two coordinates, returns [{latitude, longitude}]
const fetchRouteOSRM = async (from, to) => {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from.longitude},${from.latitude};${to.longitude},${to.latitude}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.code === 'Ok' && data.routes?.[0]) {
      return data.routes[0].geometry.coordinates.map(([lng, lat]) => ({
        latitude: lat, longitude: lng,
      }));
    }
  } catch (e) {
    console.warn('[TaxiScreen] OSRM route fetch failed:', e.message);
  }
  return [from, to];
};

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
  const timeoutTimerRef = useRef(null);
  const [progress, setProgress] = useState(0);

  // Driver tracking states
  const [driverLocation, setDriverLocation] = useState(null);
  const [driverETA, setDriverETA] = useState(null);
  const [driverDistance, setDriverDistance] = useState(null);
  const [waitingTimeLeft, setWaitingTimeLeft] = useState(null);
  const [waitingFee, setWaitingFee] = useState(0);

  // Native map states
  const [nearbyDrivers, setNearbyDrivers] = useState([]);
  const [driverRoute, setDriverRoute] = useState(null);

  // Refs for values used inside socket handlers to avoid re-registering listeners
  const locationRef = useRef(null);
  const currentRideRef = useRef(null);
  const tRef = useRef(t);

  // Tracks last accepted driver location for distance-based throttling in socket handler.
  // Only updated when the position passes the 5m threshold, preventing re-renders from GPS noise.
  const driverLocationRef = useRef(null);

  // Track shown alerts to prevent duplicates (key: "rideId:eventType")
  const shownAlertsRef = useRef(new Set());

  // Saved destination data for restoring after searching state
  const savedDestinationRef = useRef(null);
  const savedDestinationCoordsRef = useRef(null);

  // Route polyline for directions
  const [routePolyline, setRoutePolyline] = useState(null);
  const [isLoadingDirections, setIsLoadingDirections] = useState(false);

  // Map selection mode
  const [isSelectingOnMap, setIsSelectingOnMap] = useState(false);

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
        return ['25%', '45%', '70%'];
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

    return () => {
      // Prevent leaked timers when TaxiScreen unmounts
      if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
      if (zoomDebounceRef.current) clearTimeout(zoomDebounceRef.current);
      shownAlertsRef.current.clear();
    };
  }, []);

  // Fetch nearby drivers while browsing — Uber-like ambient car markers.
  // Refreshes every 30s to keep the map feeling "alive".
  // Only active during LOCATION_SEARCH and RIDE_OPTIONS (no active ride).
  // Pauses when app is backgrounded to save battery and bandwidth.
  const appStateRef = useRef(AppState.currentState);
  useEffect(() => {
    if (!location) return;
    const isBrowsing =
      bookingStep === BOOKING_STEPS.LOCATION_SEARCH ||
      bookingStep === BOOKING_STEPS.RIDE_OPTIONS;
    if (!isBrowsing) return;

    let intervalId = null;

    const fetchNearby = async () => {
      if (appStateRef.current !== 'active') return;
      try {
        const res = await taxiAPI.getNearbyDrivers(
          location.latitude,
          location.longitude
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
  }, [location, bookingStep]);

  // Re-check location permission when app returns to foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextAppState) => {
      if (nextAppState === 'active') {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') {
          setLocation(null);
          Alert.alert(
            t('taxi.locationPermission'),
            t('taxi.locationPermissionDesc'),
            [
              { text: t('common.cancel'), style: 'cancel' },
              { text: t('taxi.enableLocation'), onPress: () => requestLocationPermission() },
            ]
          );
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
        setDestinationCoords({ latitude: ride.dropoff.lat, longitude: ride.dropoff.lng });
      }
    }
    if (ride.pickup?.address) setLocationAddress(ride.pickup.address);
    if (ride.quote) {
      setEstimatedPrice(ride.quote.totalPrice);
      setEstimatedDuration(ride.quote.duration);
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
      if (ride.pickup?.lat && ride.pickup?.lng)
        coords.push({ latitude: ride.pickup.lat, longitude: ride.pickup.lng });
      if (ride.dropoff?.lat && ride.dropoff?.lng)
        coords.push({ latitude: ride.dropoff.lat, longitude: ride.dropoff.lng });
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

  // Two-phase active ride restore:
  //   Phase 1: Instant restore from SecureStore (survives app kill)
  //   Phase 2: Reconcile with server (authoritative source of truth)
  useEffect(() => {
    const restoreAndReconcile = async () => {
      // Phase 1 — instant local restore
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
          },
          driver: savedState.driverLocation
            ? { location: { coordinates: [savedState.driverLocation.longitude, savedState.driverLocation.latitude] } }
            : null,
        };
        applyRideToState(localRide);
      }

      // Phase 2 — server reconciliation
      try {
        const response = await taxiAPI.getMyRides();
        const rides = response.data?.data?.rides || [];
        const activeRide = rides.find(r =>
          !['completed', 'cancelled'].includes(r.status)
        );

        if (activeRide) {
          applyRideToState(activeRide);
          fitMapToRide(activeRide);
          // Persist reconciled state
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
          });
        } else if (savedState) {
          // Ride ended while app was killed — clear stale local state
          resetBookingState();
        }
      } catch (error) {
        // Offline: rely on local state already restored in Phase 1
        console.warn('[TaxiScreen] Offline — using cached ride state');
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
    if (!driverLocation) return;
    const loc = locationRef.current;
    if (!loc) return;
    if (bookingStep !== BOOKING_STEPS.DRIVER_FOUND && bookingStep !== BOOKING_STEPS.DRIVER_ARRIVED) return;

    const now = Date.now();
    if (now - lastDriverRouteFetchRef.current < 15000) return; // 15s throttle (was 5s)
    lastDriverRouteFetchRef.current = now;

    fetchRouteOSRM(driverLocation, loc).then(setDriverRoute);
  }, [driverLocation, bookingStep]);

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

    // Use tRef.current inside all handlers to avoid stale translation closure
    socket.on('ride:accepted', (ride) => {
      console.log('[TaxiScreen] ride:accepted received!', ride?._id);
      clearRideTimeout();
      setCurrentRide(ride);
      setBookingStep(BOOKING_STEPS.DRIVER_FOUND);

      // Clear nearby drivers and destination
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
      });

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
        const distance = calculateDistance(
          latitude,
          longitude,
          loc.latitude,
          loc.longitude
        );
        setDriverDistance(distance);
        setDriverETA(Math.round((distance / 30) * 60));
      }
    });

    socket.on('ride:arrived', (ride) => {
      setCurrentRide(ride);
      setBookingStep(BOOKING_STEPS.DRIVER_ARRIVED);

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
      });

      const tr = tRef.current;
      showAlertOnce(
        ride._id, 'arrived',
        tr('taxi.driverArrived'),
        tr('taxi.driverArrivedMessage'),
        [{ text: tr('common.ok') }]
      );
    });

    socket.on('ride:started', (ride) => {
      setCurrentRide(ride);
      setBookingStep(BOOKING_STEPS.IN_PROGRESS);

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
      });

      // Clear driver marker/route, restore destination
      setDriverLocation(null);
      setDriverRoute(null);

      const savedCoords = savedDestinationCoordsRef.current;
      const loc = locationRef.current;

      if (savedCoords) {
        setDestinationCoords(savedCoords);

        // Fetch pickup-to-destination route
        if (loc) {
          fetchRouteOSRM(loc, savedCoords).then(coords => {
            setRoutePolyline(coords);
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

    socket.on('ride:completed', (data) => {
      const ride = data.ride || data;
      setCompletedRide(ride);
      setShowReviewModal(true);
      resetBookingState();
    });

    socket.on('ride:cancelled', (ride) => {
      resetBookingState();
      if (ride.cancelledBy !== 'user') {
        const tr = tRef.current;
        showAlertOnce(
          ride._id, 'cancelled',
          tr('taxi.rideCancelled'),
          ride.cancelledBy === 'driver'
            ? tr('taxi.driverCancelledRide')
            : tr('taxi.rideCancelledMessage'),
          [{ text: tr('common.ok') }]
        );
      }
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
      try {
        const response = await taxiAPI.getMyRides();
        const rides = response.data?.data?.rides || [];
        const activeRide = rides.find(r =>
          !['completed', 'cancelled'].includes(r.status)
        );

        if (activeRide) {
          applyRideToState(activeRide);
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
          });
        } else if (currentRideRef.current) {
          // Ride ended while offline
          resetBookingState();
        }
      } catch (error) {
        console.warn('[TaxiScreen] Reconnect reconciliation failed:', error.message);
      }
    });
    return unsubscribe;
  }, [onReconnect, applyRideToState]);

  // Progress bar animation for searching
  useEffect(() => {
    if (bookingStep === BOOKING_STEPS.SEARCHING) {
      const startTime = Date.now();

      const interval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const newProgress = Math.min((elapsed / RIDE_REQUEST_TIMEOUT) * 100, 100);
        setProgress(newProgress);
      }, 100);

      return () => clearInterval(interval);
    } else {
      setProgress(0);
    }
  }, [bookingStep]);

  const resetBookingState = () => {
    setCurrentRide(null);
    setBookingStep(BOOKING_STEPS.LOCATION_SEARCH);
    setDestination('');
    setDestinationCoords(null);
    setEstimatedPrice(null);
    setEstimatedDuration(null);
    setDriverLocation(null);
    setDriverETA(null);
    setDriverDistance(null);
    setRoutePolyline(null);
    setNearbyDrivers([]);
    setDriverRoute(null);
    driverLocationRef.current = null;
    savedDestinationRef.current = null;
    savedDestinationCoordsRef.current = null;
    shownAlertsRef.current.clear();
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
    const basePrice = 5 + (distance * 1.5);
    return (basePrice * vehicleType.priceMultiplier).toFixed(2);
  }, []);

  // Fetch directions and update map with route polyline
  const fetchDirectionsAndUpdate = useCallback(async (destCoords) => {
    if (!location || !destCoords) return;

    setIsLoadingDirections(true);

    try {
      // Try Google Directions first, then OSRM as fallback
      let directions = await getDirections(location, destCoords);
      if (!directions) {
        directions = await getDirectionsOSRM(location, destCoords);
      }

      if (directions && directions.polyline && directions.polyline.length > 0) {
        // Use real distance and duration from directions
        setEstimatedPrice(calculatePrice(directions.distance, selectedVehicle));
        setEstimatedDuration(directions.duration);

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
        const distance = calculateDistance(
          location.latitude,
          location.longitude,
          destCoords.latitude,
          destCoords.longitude
        );
        setEstimatedPrice(calculatePrice(distance, selectedVehicle));
        setEstimatedDuration(Math.round(distance * 2.5));
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
      const distance = calculateDistance(
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
  }, [location, selectedVehicle, calculatePrice]);

  // Handle destination selection with coordinates (from Places Autocomplete)
  const handleDestinationSelectWithCoords = useCallback(async (address, coords) => {
    setDestination(address);
    setDestinationCoords(coords);

    await fetchDirectionsAndUpdate(coords);

    // Auto-transition to ride options when destination is selected
    setBookingStep(BOOKING_STEPS.RIDE_OPTIONS);
  }, [fetchDirectionsAndUpdate]);

  const handleDestinationChange = useCallback(async (text) => {
    setDestination(text);

    if (text.length > 3 && location) {
      // Generate approximate coordinates when no Places API coordinates
      const randomOffset = () => (Math.random() - 0.5) * 0.05;
      const destCoords = {
        latitude: location.latitude + randomOffset() + 0.02,
        longitude: location.longitude + randomOffset() + 0.02,
      };
      setDestinationCoords(destCoords);

      await fetchDirectionsAndUpdate(destCoords);

      // Auto-transition to ride options when destination is selected
      setBookingStep(BOOKING_STEPS.RIDE_OPTIONS);
    } else {
      setDestinationCoords(null);
      setEstimatedPrice(null);
      setEstimatedDuration(null);
      setRoutePolyline(null);
    }
  }, [location, fetchDirectionsAndUpdate]);

  const handleDestinationSelect = useCallback((address, coords) => {
    if (coords) {
      handleDestinationSelectWithCoords(address, coords);
    } else {
      handleDestinationChange(address);
    }
  }, [handleDestinationSelectWithCoords, handleDestinationChange]);

  const handleVehicleSelect = useCallback((vehicleId) => {
    setSelectedVehicle(vehicleId);

    if (location && destinationCoords) {
      const distance = calculateDistance(
        location.latitude,
        location.longitude,
        destinationCoords.latitude,
        destinationCoords.longitude
      );
      setEstimatedPrice(calculatePrice(distance, vehicleId));
    }
  }, [location, destinationCoords, calculatePrice]);

  const clearRideTimeout = () => {
    if (timeoutTimerRef.current) {
      clearTimeout(timeoutTimerRef.current);
      timeoutTimerRef.current = null;
    }
    setProgress(0);
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
      resetBookingState();
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

  const submitRideRequest = async (selectedPaymentMethod) => {
    // Duplicate guard: prevent submitting if there's already an active ride
    const existingRide = currentRideRef.current;
    if (existingRide && !['completed', 'cancelled'].includes(existingRide.status)) {
      Alert.alert(t('errors.error'), t('taxi.activeRideExists'));
      return;
    }

    setIsRequesting(true);

    try {
      const distance = calculateDistance(
        location.latitude,
        location.longitude,
        destinationCoords.latitude,
        destinationCoords.longitude
      );

      const totalPrice = parseFloat(calculatePrice(distance, selectedVehicle));
      const basePrice = 5 + (distance * 1.5);
      const duration = Math.round(distance * 2.5);

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
        vehicleType: selectedVehicle,
        quote: {
          distance: distance.toFixed(2),
          distanceText: `${distance.toFixed(2)} km`,
          duration: duration,
          durationText: `${duration} min`,
          basePrice: basePrice.toFixed(2),
          totalPrice: totalPrice.toFixed(2)
        },
        passengerName: `${user.firstName} ${user.lastName}`,
        passengerPhone: user.phone || '',
        paymentMethod: selectedPaymentMethod,
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
        setBookingStep(BOOKING_STEPS.SEARCHING);
        setProgress(0);

        // Persist ride state to survive app kill
        persistRideState({
          rideId: ride._id,
          status: ride.status,
          bookingStep: BOOKING_STEPS.SEARCHING,
          pickup: rideData.pickup,
          dropoff: rideData.dropoff,
          vehicleType: selectedVehicle,
          paymentMethod: selectedPaymentMethod,
          estimatedPrice: totalPrice.toFixed(2),
          estimatedDuration: duration,
          driverLocation: null,
          driverName: null,
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

        // Fetch and show nearby online drivers on map
        try {
          const driversRes = await taxiAPI.getNearbyDrivers(
            location.latitude,
            location.longitude,
            selectedVehicle
          );
          const drivers = driversRes.data?.data?.drivers || [];
          setNearbyDrivers(drivers);
        } catch (err) {
          console.warn('[TaxiScreen] Failed to fetch nearby drivers:', err.message);
        }

        timeoutTimerRef.current = setTimeout(() => {
          handleRideTimeout();
        }, RIDE_REQUEST_TIMEOUT);
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
    try {
      await taxiAPI.cancelRide(currentRide._id, reason, note);
      clearRideTimeout();
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
    setBookingStep(BOOKING_STEPS.LOCATION_SEARCH);
  }, []);

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
        isLoadingLocation={isLoadingLocation || isLoadingDirections}
        userLocation={location}
        onSelectOnMap={handleSelectOnMap}
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
        onSelect={(method) => {
          setShowPaymentMethodModal(false);
          submitRideRequest(method);
        }}
      />

      {/* Full Screen Map */}
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
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
          {/* User location - pulsing blue dot */}
          {location && <PulsingUserMarker coordinate={location} />}

          {/* Destination marker - red pin with flag */}
          {destinationCoords && <DestinationMarker coordinate={destinationCoords} />}

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
            <Polyline coordinates={routePolyline} {...ROUTE_SHADOW_STYLE} />
          )}
          {/* Main route polyline (pickup → destination) */}
          {routePolyline && routePolyline.length > 1 && (
            <Polyline coordinates={routePolyline} {...ROUTE_STYLE} />
          )}

          {/* Driver-to-pickup route */}
          {driverRoute && driverRoute.length > 1 && (
            <Polyline coordinates={driverRoute} {...DRIVER_ROUTE_STYLE} />
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
            <Ionicons name="menu" size={24} color={colors.foreground} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.controlButton}
            onPress={() => navigation.navigate('TaxiHistory')}
          >
            <Ionicons name="time-outline" size={24} color={colors.primary} />
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
        floatingButton={
          <TouchableOpacity style={styles.myLocationButton} onPress={centerOnUser}>
            <Ionicons name="locate" size={24} color={colors.primary} />
          </TouchableOpacity>
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
    position: 'absolute',
    right: 16,
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
    zIndex: 10,
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
