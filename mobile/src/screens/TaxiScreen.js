import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { taxiAPI } from '../services/api';
import { getDirections, getDirectionsOSRM, isGoogleMapsConfigured, reverseGeocode } from '../services/googleMaps';
import { colors, shadows, radius } from '../theme/colors';
import CancelRideModal from '../components/CancelRideModal';
import RideReviewModal from '../components/RideReviewModal';
import LocationSearchSheet from '../components/taxi/LocationSearchSheet';
import RideOptionsSheet from '../components/taxi/RideOptionsSheet';
import RideStatusSheet from '../components/taxi/RideStatusSheet';
import DraggableBottomSheet from '../components/taxi/DraggableBottomSheet';
import { VEHICLE_TYPES } from '../components/taxi/VehicleTypeSelector';

const { width, height } = Dimensions.get('window');

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

export default function TaxiScreen({ navigation }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { socket } = useSocket();
  const webViewRef = useRef(null);
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
  const timeoutTimerRef = useRef(null);
  const [progress, setProgress] = useState(0);

  // Driver tracking states
  const [driverLocation, setDriverLocation] = useState(null);
  const [driverETA, setDriverETA] = useState(null);
  const [driverDistance, setDriverDistance] = useState(null);
  const [waitingTimeLeft, setWaitingTimeLeft] = useState(null);
  const [waitingFee, setWaitingFee] = useState(0);

  // Refs for values used inside socket handlers to avoid re-registering listeners
  const locationRef = useRef(null);
  const currentRideRef = useRef(null);

  // Saved destination data for restoring after searching state
  const savedDestinationRef = useRef(null);
  const savedDestinationCoordsRef = useRef(null);

  // Route polyline for directions
  const [routePolyline, setRoutePolyline] = useState(null);
  const [isLoadingDirections, setIsLoadingDirections] = useState(false);

  // Map selection mode
  const [isSelectingOnMap, setIsSelectingOnMap] = useState(false);

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

  // Initialize location on mount
  useEffect(() => {
    requestLocationPermission();
  }, []);

  // Check for active ride on mount
  useEffect(() => {
    const checkActiveRide = async () => {
      try {
        const response = await taxiAPI.getMyRides();
        const rides = response.data?.data?.rides || [];
        const activeRide = rides.find(r =>
          !['completed', 'cancelled'].includes(r.status)
        );

        if (activeRide) {
          setCurrentRide(activeRide);

          // Restore destination info from ride data
          if (activeRide.dropoff) {
            setDestination(activeRide.dropoff.address || '');
            if (activeRide.dropoff.lat && activeRide.dropoff.lng) {
              setDestinationCoords({
                latitude: activeRide.dropoff.lat,
                longitude: activeRide.dropoff.lng,
              });
            }
          }

          // Restore pickup address
          if (activeRide.pickup?.address) {
            setLocationAddress(activeRide.pickup.address);
          }

          // Restore price and duration from quote
          if (activeRide.quote) {
            setEstimatedPrice(activeRide.quote.totalPrice);
            setEstimatedDuration(activeRide.quote.duration);
          }

          // Restore vehicle type and payment method
          if (activeRide.vehicleType) {
            setSelectedVehicle(activeRide.vehicleType);
          }
          if (activeRide.paymentMethod) {
            setPaymentMethod(activeRide.paymentMethod);
          }

          // Restore driver location if available
          if (activeRide.driver?.location?.coordinates) {
            const [lng, lat] = activeRide.driver.location.coordinates;
            setDriverLocation({ latitude: lat, longitude: lng });
          }

          // Map ride status to booking step
          switch (activeRide.status) {
            case 'pending':
              setBookingStep(BOOKING_STEPS.SEARCHING);
              break;
            case 'accepted':
              setBookingStep(BOOKING_STEPS.DRIVER_FOUND);
              break;
            case 'driver_arrived':
              setBookingStep(BOOKING_STEPS.DRIVER_ARRIVED);
              break;
            case 'in_progress':
              setBookingStep(BOOKING_STEPS.IN_PROGRESS);
              break;
          }

          // Update map markers after WebView has loaded
          setTimeout(() => {
            if (!webViewRef.current) return;

            // Update pickup marker on map
            if (activeRide.pickup?.lat && activeRide.pickup?.lng) {
              webViewRef.current.injectJavaScript(`
                updatePickupMarker(${activeRide.pickup.lat}, ${activeRide.pickup.lng});
                true;
              `);
            }

            // Show destination marker and route
            if (activeRide.dropoff?.lat && activeRide.dropoff?.lng) {
              webViewRef.current.injectJavaScript(`
                updateDestinationMarker(${activeRide.dropoff.lat}, ${activeRide.dropoff.lng});
                true;
              `);

              // Fit bounds to show both pickup and destination
              if (activeRide.pickup?.lat && activeRide.pickup?.lng) {
                webViewRef.current.injectJavaScript(`
                  fitBounds(${activeRide.pickup.lat}, ${activeRide.pickup.lng}, ${activeRide.dropoff.lat}, ${activeRide.dropoff.lng});
                  true;
                `);
              }
            }

            // Show driver marker if driver has location
            if (activeRide.driver?.location?.coordinates) {
              const [dLng, dLat] = activeRide.driver.location.coordinates;
              webViewRef.current.injectJavaScript(`
                updateDriverMarker(${dLat}, ${dLng});
                true;
              `);
            }
          }, 500);
        }
      } catch (error) {
        console.log('Error checking active ride:', error);
      }
    };

    checkActiveRide();
  }, []);

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

  // Socket event listeners - only re-register when socket instance changes
  useEffect(() => {
    if (!socket) return;

    socket.on('ride:accepted', (ride) => {
      console.log('Ride accepted:', ride);
      clearRideTimeout();
      setCurrentRide(ride);
      setBookingStep(BOOKING_STEPS.DRIVER_FOUND);

      // Clear nearby driver markers and destination from map
      if (webViewRef.current) {
        webViewRef.current.injectJavaScript(`
          clearNearbyDrivers();
          clearDestinationMarker();
          true;
        `);
      }

      // Show driver-to-user route on map
      if (ride.driver?.location?.coordinates) {
        const [lng, lat] = ride.driver.location.coordinates;
        setDriverLocation({ latitude: lat, longitude: lng });

        if (webViewRef.current) {
          webViewRef.current.injectJavaScript(`
            updateDriverMarker(${lat}, ${lng});
            true;
          `);
        }
      }

      Alert.alert(
        t('taxi.driverFound'),
        `${ride.driver?.user?.firstName} ${t('taxi.isOnTheWay')}`,
        [{ text: t('common.ok') }]
      );
    });

    socket.on('driver:locationUpdate', (data) => {
      const ride = currentRideRef.current;
      const loc = locationRef.current;
      if (data.rideId !== ride?._id) return;

      const { latitude, longitude } = data.location;
      setDriverLocation({ latitude, longitude });

      if (webViewRef.current) {
        webViewRef.current.injectJavaScript(`
          updateDriverMarker(${latitude}, ${longitude});
          true;
        `);

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
      }
    });

    socket.on('ride:arrived', (ride) => {
      console.log('Driver arrived:', ride);
      setCurrentRide(ride);
      setBookingStep(BOOKING_STEPS.DRIVER_ARRIVED);
      Alert.alert(
        t('taxi.driverArrived'),
        t('taxi.driverArrivedMessage'),
        [{ text: t('common.ok') }]
      );
    });

    socket.on('ride:started', (ride) => {
      console.log('Ride started:', ride);
      setCurrentRide(ride);
      setBookingStep(BOOKING_STEPS.IN_PROGRESS);

      // Switch map to show pickup-to-destination route
      const savedCoords = savedDestinationCoordsRef.current;
      const loc = locationRef.current;
      if (savedCoords && loc && webViewRef.current) {
        webViewRef.current.injectJavaScript(`
          clearDriverMarker();
          updateDestinationMarker(${savedCoords.latitude}, ${savedCoords.longitude});
          fitBounds(${loc.latitude}, ${loc.longitude}, ${savedCoords.latitude}, ${savedCoords.longitude});
          true;
        `);
      }

      Alert.alert(
        t('taxi.rideStarted'),
        t('taxi.enjoyYourRide'),
        [{ text: t('common.ok') }]
      );
    });

    socket.on('ride:completed', (data) => {
      console.log('Ride completed:', data);
      const ride = data.ride || data;
      setCompletedRide(ride);
      setShowReviewModal(true);
      resetBookingState();
    });

    socket.on('ride:cancelled', (ride) => {
      console.log('Ride cancelled:', ride);
      resetBookingState();
      // Only alert if someone else cancelled (driver/admin).
      // When the user cancels, handleConfirmCancel / handleRideTimeout already shows an alert.
      if (ride.cancelledBy !== 'user') {
        Alert.alert(
          t('taxi.rideCancelled'),
          ride.cancelledBy === 'driver'
            ? t('taxi.driverCancelledRide')
            : t('taxi.rideCancelledMessage'),
          [{ text: t('common.ok') }]
        );
      }
    });

    socket.on('ride:expired', (data) => {
      console.log('Ride expired:', data);
      clearRideTimeout();
      resetBookingState();
      Alert.alert(
        t('taxi.rideExpired'),
        t('taxi.rideExpiredMessage'),
        [{ text: t('common.ok') }]
      );
    });

    socket.on('ride:waitingTimeout', (data) => {
      console.log('Ride waiting timeout:', data);
      resetBookingState();
      Alert.alert(
        t('taxi.waitingTimeout'),
        t('taxi.waitingTimeoutMessage'),
        [{ text: t('common.ok') }]
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

  // Progress bar animation for searching
  useEffect(() => {
    if (bookingStep === BOOKING_STEPS.SEARCHING) {
      const startTime = Date.now();
      const duration = RIDE_REQUEST_TIMEOUT;

      const interval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const newProgress = Math.min((elapsed / duration) * 100, 100);
        setProgress(newProgress);

        if (newProgress >= 100) {
          clearInterval(interval);
        }
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
    savedDestinationRef.current = null;
    savedDestinationCoordsRef.current = null;
    clearRideTimeout();

    // Clear nearby drivers and destination from map
    if (webViewRef.current) {
      webViewRef.current.injectJavaScript(`
        clearNearbyDrivers();
        clearDestinationMarker();
        clearDriverMarker();
        true;
      `);
    }
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

      if (webViewRef.current) {
        webViewRef.current.injectJavaScript(`
          updatePickupMarker(${newLocation.latitude}, ${newLocation.longitude});
          true;
        `);
      }

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
      console.log('Error getting location:', error);
      setLocation(DEFAULT_LOCATION);
      setLocationAddress('Kutaisi, Georgia');
    } finally {
      setIsLoadingLocation(false);
    }
  };

  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

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
        const vehicleType = VEHICLE_TYPES.find(v => v.id === selectedVehicle);
        const basePrice = 5 + (directions.distance * 1.5);
        setEstimatedPrice((basePrice * vehicleType.priceMultiplier).toFixed(2));
        setEstimatedDuration(directions.duration);
        setRoutePolyline(directions.polyline);

        // Update map with actual route polyline
        if (webViewRef.current) {
          const polylineJSON = JSON.stringify(directions.polyline);
          webViewRef.current.injectJavaScript(`
            updateRouteWithPolyline(${destCoords.latitude}, ${destCoords.longitude}, ${polylineJSON});
            fitBounds(${location.latitude}, ${location.longitude}, ${destCoords.latitude}, ${destCoords.longitude});
            true;
          `);
        }
      } else {
        // Last resort fallback to straight line
        const distance = calculateDistance(
          location.latitude,
          location.longitude,
          destCoords.latitude,
          destCoords.longitude
        );
        const vehicleType = VEHICLE_TYPES.find(v => v.id === selectedVehicle);
        const basePrice = 5 + (distance * 1.5);
        setEstimatedPrice((basePrice * vehicleType.priceMultiplier).toFixed(2));
        setEstimatedDuration(Math.round(distance * 2.5));
        setRoutePolyline(null);

        // Update map with simple line
        if (webViewRef.current) {
          webViewRef.current.injectJavaScript(`
            updateDestinationMarker(${destCoords.latitude}, ${destCoords.longitude});
            fitBounds(${location.latitude}, ${location.longitude}, ${destCoords.latitude}, ${destCoords.longitude});
            true;
          `);
        }
      }
    } catch (error) {
      console.log('Error fetching directions:', error);
      // Fallback calculation
      const distance = calculateDistance(
        location.latitude,
        location.longitude,
        destCoords.latitude,
        destCoords.longitude
      );
      const vehicleType = VEHICLE_TYPES.find(v => v.id === selectedVehicle);
      const basePrice = 5 + (distance * 1.5);
      setEstimatedPrice((basePrice * vehicleType.priceMultiplier).toFixed(2));
      setEstimatedDuration(Math.round(distance * 2.5));
    } finally {
      setIsLoadingDirections(false);
    }
  }, [location, selectedVehicle]);

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
      if (webViewRef.current) {
        webViewRef.current.injectJavaScript(`
          clearDestinationMarker();
          true;
        `);
      }
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
      const vehicleType = VEHICLE_TYPES.find(v => v.id === vehicleId);
      const basePrice = 5 + (distance * 1.5);
      setEstimatedPrice((basePrice * vehicleType.priceMultiplier).toFixed(2));
    }
  }, [location, destinationCoords]);

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
      await taxiAPI.cancelRide(ride._id, 'waiting_time_too_long', 'No driver accepted within the time limit');
      resetBookingState();
      Alert.alert(
        t('taxi.noDriverFound'),
        t('taxi.noDriverFoundMessage'),
        [{ text: t('common.ok') }]
      );
    } catch (error) {
      console.log('Error auto-cancelling ride:', error);
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

    setIsRequesting(true);

    try {
      const distance = calculateDistance(
        location.latitude,
        location.longitude,
        destinationCoords.latitude,
        destinationCoords.longitude
      );

      const vehicleType = VEHICLE_TYPES.find(v => v.id === selectedVehicle);
      const basePrice = 5 + (distance * 1.5);
      const totalPrice = basePrice * vehicleType.priceMultiplier;
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
        paymentMethod: paymentMethod,
        notes: ''
      };

      const response = await taxiAPI.requestRide(rideData);

      if (response.data.success) {
        setCurrentRide(response.data.data.ride);
        setBookingStep(BOOKING_STEPS.SEARCHING);
        setProgress(0);

        // Save destination data for restoring after driver is found
        savedDestinationRef.current = destination;
        savedDestinationCoordsRef.current = destinationCoords;

        // Clear destination marker and route, center on user with nearby drivers
        if (webViewRef.current && location) {
          webViewRef.current.injectJavaScript(`
            clearDestinationMarker();
            map.setView([${location.latitude}, ${location.longitude}], 14);
            true;
          `);

          // Fetch and show nearby online drivers on map
          try {
            const driversRes = await taxiAPI.getNearbyDrivers(
              location.latitude,
              location.longitude,
              selectedVehicle
            );
            const nearbyDrivers = driversRes.data?.data?.drivers || [];
            if (nearbyDrivers.length > 0) {
              const driversJSON = JSON.stringify(nearbyDrivers);
              webViewRef.current.injectJavaScript(`
                showNearbyDrivers(${driversJSON});
                true;
              `);
            }
          } catch (err) {
            console.log('Error fetching nearby drivers:', err);
          }
        }

        timeoutTimerRef.current = setTimeout(() => {
          handleRideTimeout();
        }, RIDE_REQUEST_TIMEOUT);
      }
    } catch (error) {
      console.log('Error requesting ride:', error);
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
      console.log('Error cancelling ride:', error);
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
      Alert.alert(
        t('taxi.thankYou'),
        t('taxi.reviewSubmitted'),
        [{
          text: t('common.ok'),
          onPress: () => {
            setShowReviewModal(false);
            setCompletedRide(null);
            navigation.replace('TaxiHistory');
          }
        }]
      );
    } catch (error) {
      console.log('Error submitting review:', error);
      const errorMessage = error.response?.data?.message || t('errors.tryAgain');
      Alert.alert(t('errors.error'), errorMessage);
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const handleCloseReviewModal = () => {
    setShowReviewModal(false);
    setCompletedRide(null);
    navigation.replace('TaxiHistory');
  };

  const handleBackToSearch = useCallback(() => {
    // Clear destination to allow entering a new one
    setDestination('');
    setDestinationCoords(null);
    setEstimatedPrice(null);
    setEstimatedDuration(null);
    setRoutePolyline(null);

    // Clear map markers
    if (webViewRef.current) {
      webViewRef.current.injectJavaScript(`
        clearDestinationMarker();
        true;
      `);
    }

    setBookingStep(BOOKING_STEPS.LOCATION_SEARCH);
  }, []);

  const centerOnUser = () => {
    if (location && webViewRef.current) {
      webViewRef.current.injectJavaScript(`
        map.setView([${location.latitude}, ${location.longitude}], 15);
        true;
      `);
    }
  };

  // Handle "Select on Map" button press
  const handleSelectOnMap = useCallback(() => {
    setIsSelectingOnMap(true);
    // Collapse bottom sheet to give more map space
    if (bottomSheetRef.current) {
      bottomSheetRef.current.collapse();
    }
    // Enable map click mode
    if (webViewRef.current) {
      webViewRef.current.injectJavaScript(`
        enableMapClickMode();
        true;
      `);
    }
  }, []);

  // Handle map click message from WebView
  const handleWebViewMessage = useCallback(async (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      if (data.type === 'mapClick' && isSelectingOnMap) {
        const { latitude, longitude } = data;

        // Show loading state
        setIsLoadingDirections(true);

        // Get address from coordinates
        const addressResult = await reverseGeocode(latitude, longitude);

        if (addressResult) {
          const address = addressResult.mainText || addressResult.address;
          const coords = { latitude, longitude };

          // Update destination
          setDestination(address);
          setDestinationCoords(coords);

          // Update map with destination marker
          if (webViewRef.current) {
            webViewRef.current.injectJavaScript(`
              disableMapClickMode();
              updateDestinationMarker(${latitude}, ${longitude});
              true;
            `);
          }

          // Fetch directions and update estimates
          await fetchDirectionsAndUpdate(coords);

          // Expand bottom sheet back and move to ride options
          if (bottomSheetRef.current) {
            bottomSheetRef.current.snapToIndex(1);
          }
          setBookingStep(BOOKING_STEPS.RIDE_OPTIONS);
        }

        setIsSelectingOnMap(false);
        setIsLoadingDirections(false);
      }
    } catch (error) {
      console.log('Error handling map click:', error);
      setIsSelectingOnMap(false);
      setIsLoadingDirections(false);
      // Expand bottom sheet back on error
      if (bottomSheetRef.current) {
        bottomSheetRef.current.snapToIndex(1);
      }
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

  // Map HTML
  const getMapHTML = () => {
    const lat = location?.latitude || DEFAULT_LOCATION.latitude;
    const lng = location?.longitude || DEFAULT_LOCATION.longitude;

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>
          body { margin: 0; padding: 0; }
          #map { width: 100%; height: 100vh; }

          @keyframes pulse-green {
            0% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.6); }
            70% { box-shadow: 0 0 0 12px rgba(34, 197, 94, 0); }
            100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
          }
          @keyframes pulse-dark {
            0% { box-shadow: 0 0 0 0 rgba(23, 23, 23, 0.5); }
            70% { box-shadow: 0 0 0 14px rgba(23, 23, 23, 0); }
            100% { box-shadow: 0 0 0 0 rgba(23, 23, 23, 0); }
          }

          .pickup-marker {
            background: #22c55e;
            border: 3px solid white;
            border-radius: 50%;
            width: 18px;
            height: 18px;
            animation: pulse-green 2s ease-out infinite;
          }
          .destination-marker {
            background: #ef4444;
            border: 3px solid white;
            border-radius: 50%;
            width: 18px;
            height: 18px;
            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
          }
          .driver-marker {
            background: #171717;
            border: 3px solid white;
            border-radius: 50%;
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
            animation: pulse-dark 2s ease-out infinite;
          }
          .nearby-driver-marker {
            background: #374151;
            border: 2px solid white;
            border-radius: 50%;
            width: 20px;
            height: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 11px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
          }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          var map = L.map('map', {
            zoomControl: false,
            attributionControl: false
          }).setView([${lat}, ${lng}], 15);

          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
          }).addTo(map);

          var pickupIcon = L.divIcon({
            className: 'pickup-marker',
            iconSize: [20, 20],
            iconAnchor: [10, 10]
          });

          var destinationIcon = L.divIcon({
            className: 'destination-marker',
            iconSize: [20, 20],
            iconAnchor: [10, 10]
          });

          var driverIcon = L.divIcon({
            className: 'driver-marker',
            html: '🚗',
            iconSize: [24, 24],
            iconAnchor: [12, 12]
          });

          var pickupMarker = L.marker([${lat}, ${lng}], {icon: pickupIcon}).addTo(map);
          var destinationMarker = null;
          var driverMarker = null;
          var routeLine = null;

          function updatePickupMarker(lat, lng) {
            pickupMarker.setLatLng([lat, lng]);
            map.setView([lat, lng], 15);
          }

          function updateDestinationMarker(lat, lng) {
            if (destinationMarker) {
              destinationMarker.setLatLng([lat, lng]);
            } else {
              destinationMarker = L.marker([lat, lng], {icon: destinationIcon}).addTo(map);
            }

            // Fetch real route from OSRM
            var pickup = pickupMarker.getLatLng();
            var url = 'https://router.project-osrm.org/route/v1/driving/' + pickup.lng + ',' + pickup.lat + ';' + lng + ',' + lat + '?overview=full&geometries=geojson';
            fetch(url)
              .then(function(res) { return res.json(); })
              .then(function(data) {
                if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
                  var coords = data.routes[0].geometry.coordinates.map(function(c) {
                    return [c[1], c[0]];
                  });
                  if (routeLine) { map.removeLayer(routeLine); }
                  routeLine = L.polyline(coords, {
                    color: '#171717',
                    weight: 4,
                    opacity: 0.8
                  }).addTo(map);
                } else {
                  // Fallback straight line
                  if (routeLine) { map.removeLayer(routeLine); }
                  routeLine = L.polyline([[pickup.lat, pickup.lng], [lat, lng]], {
                    color: '#171717', weight: 4, opacity: 0.8
                  }).addTo(map);
                }
              })
              .catch(function() {
                if (routeLine) { map.removeLayer(routeLine); }
                routeLine = L.polyline([[pickup.lat, pickup.lng], [lat, lng]], {
                  color: '#171717', weight: 4, opacity: 0.8
                }).addTo(map);
              });
          }

          function updateRouteWithPolyline(destLat, destLng, polylineCoords) {
            // Update destination marker
            if (destinationMarker) {
              destinationMarker.setLatLng([destLat, destLng]);
            } else {
              destinationMarker = L.marker([destLat, destLng], {icon: destinationIcon}).addTo(map);
            }

            // Remove old route line
            if (routeLine) {
              map.removeLayer(routeLine);
            }

            // Draw the actual route polyline from Google Directions
            if (polylineCoords && polylineCoords.length > 0) {
              routeLine = L.polyline(polylineCoords, {
                color: '#171717',
                weight: 5,
                opacity: 0.9,
                lineJoin: 'round',
                lineCap: 'round'
              }).addTo(map);

              // Fit map to the route bounds
              var bounds = routeLine.getBounds();
              map.fitBounds(bounds, {padding: [50, 50]});
            } else {
              // Fallback to straight line
              var pickup = pickupMarker.getLatLng();
              routeLine = L.polyline([[pickup.lat, pickup.lng], [destLat, destLng]], {
                color: '#171717',
                weight: 4,
                opacity: 0.8
              }).addTo(map);
            }
          }

          function clearDestinationMarker() {
            if (destinationMarker) {
              map.removeLayer(destinationMarker);
              destinationMarker = null;
            }
            if (routeLine) {
              map.removeLayer(routeLine);
              routeLine = null;
            }
          }

          function fitBounds(lat1, lng1, lat2, lng2) {
            var bounds = L.latLngBounds([[lat1, lng1], [lat2, lng2]]);
            map.fitBounds(bounds, {padding: [50, 50]});
          }

          var driverRouteCache = null;
          var lastDriverRouteFetch = 0;

          function updateDriverMarker(lat, lng) {
            if (driverMarker) {
              driverMarker.setLatLng([lat, lng]);
            } else {
              driverMarker = L.marker([lat, lng], {icon: driverIcon}).addTo(map);
            }

            var pickup = pickupMarker.getLatLng();
            var bounds = L.latLngBounds([[lat, lng], [pickup.lat, pickup.lng]]);
            map.fitBounds(bounds, {padding: [80, 80]});

            // Fetch real route from OSRM (throttle to once per 5 seconds)
            var now = Date.now();
            if (now - lastDriverRouteFetch > 5000) {
              lastDriverRouteFetch = now;
              fetchDriverRoute(lat, lng, pickup.lat, pickup.lng);
            }
          }

          function fetchDriverRoute(dLat, dLng, pLat, pLng) {
            var url = 'https://router.project-osrm.org/route/v1/driving/' + dLng + ',' + dLat + ';' + pLng + ',' + pLat + '?overview=full&geometries=geojson';
            fetch(url)
              .then(function(res) { return res.json(); })
              .then(function(data) {
                if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
                  var coords = data.routes[0].geometry.coordinates.map(function(c) {
                    return [c[1], c[0]];
                  });
                  if (routeLine) {
                    map.removeLayer(routeLine);
                  }
                  routeLine = L.polyline(coords, {
                    color: '#171717',
                    weight: 4,
                    opacity: 0.8
                  }).addTo(map);
                }
              })
              .catch(function() {
                // Fallback to straight line if OSRM fails
                if (routeLine) {
                  map.removeLayer(routeLine);
                }
                routeLine = L.polyline([[dLat, dLng], [pLat, pLng]], {
                  color: '#171717',
                  weight: 4,
                  opacity: 0.8,
                  dashArray: '10, 10'
                }).addTo(map);
              });
          }

          function clearDriverMarker() {
            if (driverMarker) {
              map.removeLayer(driverMarker);
              driverMarker = null;
            }
          }

          // Nearby drivers markers for searching state
          var nearbyDriverMarkers = [];

          var nearbyDriverIcon = L.divIcon({
            className: 'nearby-driver-marker',
            html: '🚗',
            iconSize: [20, 20],
            iconAnchor: [10, 10]
          });

          function showNearbyDrivers(drivers) {
            clearNearbyDrivers();
            drivers.forEach(function(d) {
              var marker = L.marker([d.lat, d.lng], {icon: nearbyDriverIcon}).addTo(map);
              nearbyDriverMarkers.push(marker);
            });
          }

          function clearNearbyDrivers() {
            nearbyDriverMarkers.forEach(function(m) {
              map.removeLayer(m);
            });
            nearbyDriverMarkers = [];
          }

          // Map click mode for pin selection
          var mapClickMode = false;
          var clickMarker = null;

          function enableMapClickMode() {
            mapClickMode = true;
            map.getContainer().style.cursor = 'crosshair';
          }

          function disableMapClickMode() {
            mapClickMode = false;
            map.getContainer().style.cursor = '';
            if (clickMarker) {
              map.removeLayer(clickMarker);
              clickMarker = null;
            }
          }

          // Handle map clicks
          map.on('click', function(e) {
            if (mapClickMode) {
              var lat = e.latlng.lat;
              var lng = e.latlng.lng;

              // Show temporary marker
              if (clickMarker) {
                clickMarker.setLatLng([lat, lng]);
              } else {
                clickMarker = L.marker([lat, lng], {icon: destinationIcon}).addTo(map);
              }

              // Send coordinates to React Native
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'mapClick',
                latitude: lat,
                longitude: lng
              }));
            }
          });
        </script>
      </body>
      </html>
    `;
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

      {/* Full Screen Map */}
      <View style={styles.mapContainer}>
        <WebView
          ref={webViewRef}
          source={{ html: getMapHTML() }}
          style={styles.map}
          scrollEnabled={false}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          onError={(e) => console.log('WebView error:', e)}
          onMessage={handleWebViewMessage}
        />

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
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color={colors.foreground} />
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
                  // Expand bottom sheet back
                  if (bottomSheetRef.current) {
                    bottomSheetRef.current.snapToIndex(1);
                  }
                  if (webViewRef.current) {
                    webViewRef.current.injectJavaScript(`
                      disableMapClickMode();
                      true;
                    `);
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  map: {
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
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
    ...shadows.md,
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
    ...shadows.md,
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
    fontSize: 14,
    fontWeight: '600',
  },
  phoneAlertMessage: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
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
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 10,
  },
  mapSelectionCancel: {
    padding: 4,
  },
});
