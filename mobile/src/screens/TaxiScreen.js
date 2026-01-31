import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  Dimensions,
  Platform,
  Image,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { taxiAPI } from '../services/api';
import { colors, shadows, radius } from '../theme/colors';
import CancelRideModal from '../components/CancelRideModal';
import RideReviewModal from '../components/RideReviewModal';

const { width, height } = Dimensions.get('window');

// Default location (Tbilisi, Georgia)
const DEFAULT_LOCATION = {
  latitude: 41.7151,
  longitude: 44.8271,
};

// Timeout duration for ride request (90 seconds = 1.5 minutes)
const RIDE_REQUEST_TIMEOUT = 90000; // milliseconds

const VEHICLE_TYPES = [
  { id: 'economy', icon: 'car-outline', priceMultiplier: 1 },
  { id: 'comfort', icon: 'car', priceMultiplier: 1.5 },
  { id: 'business', icon: 'car-sport', priceMultiplier: 2 },
];

// Helper function to convert color names to hex
const getColorHex = (colorName) => {
  const colorMap = {
    'white': '#FFFFFF',
    'black': '#000000',
    'silver': '#C0C0C0',
    'gray': '#808080',
    'grey': '#808080',
    'red': '#FF0000',
    'blue': '#0000FF',
    'green': '#008000',
    'yellow': '#FFFF00',
    'orange': '#FFA500',
    'brown': '#8B4513',
    'beige': '#F5F5DC',
    'gold': '#FFD700',
    'purple': '#800080',
    'pink': '#FFC0CB',
  };
  return colorMap[colorName?.toLowerCase()] || '#808080';
};

export default function TaxiScreen({ navigation }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { socket } = useSocket();
  const webViewRef = useRef(null);
  const insets = useSafeAreaInsets();

  const [location, setLocation] = useState(null);
  const [locationAddress, setLocationAddress] = useState('');
  const [destination, setDestination] = useState('');
  const [destinationCoords, setDestinationCoords] = useState(null);
  const [selectedVehicle, setSelectedVehicle] = useState('economy');
  const [isLoadingLocation, setIsLoadingLocation] = useState(true);
  const [isRequesting, setIsRequesting] = useState(false);
  const [estimatedPrice, setEstimatedPrice] = useState(null);
  const [estimatedDuration, setEstimatedDuration] = useState(null);
  const [rideStatus, setRideStatus] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [currentRide, setCurrentRide] = useState(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [completedRide, setCompletedRide] = useState(null);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [timeoutTimer, setTimeoutTimer] = useState(null);
  const [progress, setProgress] = useState(0);
  const [driverLocation, setDriverLocation] = useState(null);
  const [driverETA, setDriverETA] = useState(null);
  const [driverDistance, setDriverDistance] = useState(null);
  const [waitingTimeLeft, setWaitingTimeLeft] = useState(null);
  const [waitingFee, setWaitingFee] = useState(0);

  useEffect(() => {
    requestLocationPermission();
  }, []);

  // Waiting time countdown effect
  useEffect(() => {
    if (rideStatus !== 'driver_arrived' || !currentRide?.waitingExpiresAt) {
      setWaitingTimeLeft(null);
      setWaitingFee(0);
      return;
    }

    const FREE_WAITING_SECONDS = 60; // 1 minute free
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

      // Calculate waiting fee (after 1 minute free)
      if (waitedSeconds > FREE_WAITING_SECONDS) {
        const paidSeconds = Math.min(waitedSeconds - FREE_WAITING_SECONDS, 120); // Max 2 minutes paid
        const fee = Math.round((paidSeconds / 60) * WAITING_FEE_PER_MINUTE * 100) / 100;
        setWaitingFee(fee);
      } else {
        setWaitingFee(0);
      }
    };

    updateWaitingTime();
    const interval = setInterval(updateWaitingTime, 1000);

    return () => clearInterval(interval);
  }, [rideStatus, currentRide?.waitingExpiresAt, currentRide?.arrivalTime]);

  // Socket event listeners
  useEffect(() => {
    if (!socket) return;

    socket.on('ride:accepted', (ride) => {
      console.log('Ride accepted:', ride);
      clearRideTimeout(); // Clear timeout when driver accepts
      setCurrentRide(ride);
      setRideStatus('found');

      // Initialize driver location if available
      if (ride.driver?.location?.coordinates) {
        const [lng, lat] = ride.driver.location.coordinates;
        setDriverLocation({ latitude: lat, longitude: lng });
      }

      Alert.alert(
        t('taxi.driverFound'),
        `${ride.driver?.user?.firstName} ${t('taxi.isOnTheWay')}`,
        [{ text: t('common.ok') }]
      );
    });

    socket.on('driver:locationUpdate', (data) => {
      console.log('Driver location updated:', data);
      if (data.rideId === currentRide?._id) {
        const { latitude, longitude } = data.location;
        setDriverLocation({ latitude, longitude });

        // Update driver marker on map
        if (webViewRef.current && location) {
          webViewRef.current.injectJavaScript(`
            updateDriverMarker(${latitude}, ${longitude});
            true;
          `);

          // Calculate distance and ETA to pickup location
          const distance = calculateDistance(
            latitude,
            longitude,
            location.latitude,
            location.longitude
          );
          setDriverDistance(distance);

          // Estimate ETA (assuming average speed of 30 km/h in city)
          const eta = Math.round((distance / 30) * 60); // Convert to minutes
          setDriverETA(eta);
        }
      }
    });

    socket.on('ride:arrived', (ride) => {
      console.log('Driver arrived:', ride);
      setCurrentRide(ride);
      setRideStatus('driver_arrived');
      Alert.alert(
        t('taxi.driverArrived'),
        t('taxi.driverArrivedMessage'),
        [{ text: t('common.ok') }]
      );
    });

    socket.on('ride:started', (ride) => {
      console.log('Ride started:', ride);
      setCurrentRide(ride);
      setRideStatus('in_progress');
      Alert.alert(
        t('taxi.rideStarted'),
        t('taxi.enjoyYourRide'),
        [{ text: t('common.ok') }]
      );
    });

    socket.on('ride:completed', (data) => {
      console.log('Ride completed:', data);
      const ride = data.ride || data;

      // Store the completed ride and show review modal
      setCompletedRide(ride);
      setShowReviewModal(true);

      // Reset ride state
      setCurrentRide(null);
      setRideStatus(null);
      setDestination('');
      setDestinationCoords(null);
      setEstimatedPrice(null);
      setEstimatedDuration(null);
      setDriverLocation(null);
      setDriverETA(null);
      setDriverDistance(null);
    });

    socket.on('ride:cancelled', (ride) => {
      console.log('Ride cancelled:', ride);
      setCurrentRide(null);
      setRideStatus(null);
      setDriverLocation(null);
      setDriverETA(null);
      setDriverDistance(null);
      Alert.alert(
        t('taxi.rideCancelled'),
        ride.cancelledBy === 'driver'
          ? t('taxi.driverCancelledRide')
          : t('taxi.rideCancelledMessage'),
        [{ text: t('common.ok') }]
      );
    });

    socket.on('ride:expired', (data) => {
      console.log('Ride expired:', data);
      clearRideTimeout();
      setCurrentRide(null);
      setRideStatus(null);
      setDestination('');
      setDestinationCoords(null);
      setEstimatedPrice(null);
      setEstimatedDuration(null);
      setDriverLocation(null);
      setDriverETA(null);
      setDriverDistance(null);
      Alert.alert(
        t('taxi.rideExpired'),
        t('taxi.rideExpiredMessage'),
        [{ text: t('common.ok') }]
      );
    });

    socket.on('ride:waitingTimeout', (data) => {
      console.log('Ride waiting timeout:', data);
      setCurrentRide(null);
      setRideStatus(null);
      setDestination('');
      setDestinationCoords(null);
      setEstimatedPrice(null);
      setEstimatedDuration(null);
      setDriverLocation(null);
      setDriverETA(null);
      setDriverDistance(null);
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
  }, [socket, navigation, t]);

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

      // Update map
      if (webViewRef.current) {
        webViewRef.current.injectJavaScript(`
          updatePickupMarker(${newLocation.latitude}, ${newLocation.longitude});
          true;
        `);
      }

      // Get address from coordinates
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
      setLocationAddress('Tbilisi, Georgia');
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

  const handleDestinationChange = async (text) => {
    setDestination(text);

    if (text.length > 3 && location) {
      const randomOffset = () => (Math.random() - 0.5) * 0.05;
      const destCoords = {
        latitude: location.latitude + randomOffset() + 0.02,
        longitude: location.longitude + randomOffset() + 0.02,
      };
      setDestinationCoords(destCoords);

      // Update map with destination
      if (webViewRef.current) {
        webViewRef.current.injectJavaScript(`
          updateDestinationMarker(${destCoords.latitude}, ${destCoords.longitude});
          fitBounds(${location.latitude}, ${location.longitude}, ${destCoords.latitude}, ${destCoords.longitude});
          true;
        `);
      }

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
    } else {
      setDestinationCoords(null);
      setEstimatedPrice(null);
      setEstimatedDuration(null);
      if (webViewRef.current) {
        webViewRef.current.injectJavaScript(`
          clearDestinationMarker();
          true;
        `);
      }
    }
  };

  const handleVehicleSelect = (vehicleId) => {
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
  };

  // Clear timeout timer
  const clearRideTimeout = () => {
    if (timeoutTimer) {
      clearTimeout(timeoutTimer);
      setTimeoutTimer(null);
    }
    setProgress(0);
  };

  // Handle timeout when no driver accepts
  const handleRideTimeout = async () => {
    if (!currentRide || !currentRide._id) return;

    try {
      // Auto-cancel the ride with timeout reason
      await taxiAPI.cancelRide(currentRide._id, 'waiting_time_too_long', 'No driver accepted within the time limit');

      // Reset state
      setCurrentRide(null);
      setRideStatus(null);
      setDestination('');
      setDestinationCoords(null);
      setEstimatedPrice(null);
      setEstimatedDuration(null);
      clearRideTimeout();

      Alert.alert(
        t('taxi.noDriverFound'),
        t('taxi.noDriverFoundMessage'),
        [{ text: t('common.ok') }]
      );
    } catch (error) {
      console.log('Error auto-cancelling ride:', error);
      // Still reset the state even if cancel fails
      setCurrentRide(null);
      setRideStatus(null);
      clearRideTimeout();
    }
  };

  // Progress bar animation
  useEffect(() => {
    if (rideStatus === 'searching') {
      const startTime = Date.now();
      const duration = RIDE_REQUEST_TIMEOUT;

      const interval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const newProgress = Math.min((elapsed / duration) * 100, 100);
        setProgress(newProgress);

        if (newProgress >= 100) {
          clearInterval(interval);
        }
      }, 100); // Update every 100ms for smooth animation

      return () => clearInterval(interval);
    } else {
      setProgress(0);
    }
  }, [rideStatus]);

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

    setIsRequesting(true);
    setRideStatus('requesting');

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
        setRideStatus('searching');
        setProgress(0);

        // Start timeout timer (90 seconds)
        const timeout = setTimeout(() => {
          handleRideTimeout();
        }, RIDE_REQUEST_TIMEOUT);
        setTimeoutTimer(timeout);

        Alert.alert(
          t('taxi.rideRequested'),
          t('taxi.searchingForDriver'),
          [{ text: t('common.ok') }]
        );
      }

    } catch (error) {
      console.log('Error requesting ride:', error);
      const errorMessage = error.response?.data?.message || t('errors.tryAgain');
      Alert.alert(t('errors.somethingWentWrong'), errorMessage);
      setRideStatus(null);
      setCurrentRide(null);
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

      // Clear timeout timer
      clearRideTimeout();

      // Reset state
      setCurrentRide(null);
      setRideStatus(null);
      setDestination('');
      setDestinationCoords(null);
      setEstimatedPrice(null);
      setEstimatedDuration(null);
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
        [
          {
            text: t('common.ok'),
            onPress: () => {
              setShowReviewModal(false);
              setCompletedRide(null);
              navigation.navigate('TaxiHistory');
            }
          }
        ]
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
    navigation.navigate('TaxiHistory');
  };

  const centerOnUser = () => {
    if (location && webViewRef.current) {
      webViewRef.current.injectJavaScript(`
        map.setView([${location.latitude}, ${location.longitude}], 15);
        true;
      `);
    }
  };

  // OpenStreetMap with Leaflet - works in WebView
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
          .pickup-marker {
            background: #22c55e;
            border: 3px solid white;
            border-radius: 50%;
            width: 20px;
            height: 20px;
            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
          }
          .destination-marker {
            background: #ef4444;
            border: 3px solid white;
            border-radius: 50%;
            width: 20px;
            height: 20px;
            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
          }
          .driver-marker {
            background: #171717;
            border: 3px solid white;
            border-radius: 50%;
            width: 24px;
            height: 24px;
            box-shadow: 0 3px 8px rgba(0,0,0,0.4);
            position: relative;
          }
          .driver-marker::after {
            content: '🚗';
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            font-size: 14px;
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

            // Draw route line
            if (routeLine) {
              map.removeLayer(routeLine);
            }
            var pickup = pickupMarker.getLatLng();
            routeLine = L.polyline([[pickup.lat, pickup.lng], [lat, lng]], {
              color: '#171717',
              weight: 4,
              opacity: 0.8
            }).addTo(map);
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

          function updateDriverMarker(lat, lng) {
            if (driverMarker) {
              driverMarker.setLatLng([lat, lng]);
            } else {
              driverMarker = L.marker([lat, lng], {icon: driverIcon}).addTo(map);
            }

            // Update route line from driver to pickup
            if (routeLine) {
              map.removeLayer(routeLine);
            }
            var pickup = pickupMarker.getLatLng();
            routeLine = L.polyline([[lat, lng], [pickup.lat, pickup.lng]], {
              color: '#171717',
              weight: 4,
              opacity: 0.8,
              dashArray: '10, 10'
            }).addTo(map);

            // Fit map to show both driver and pickup
            var bounds = L.latLngBounds([[lat, lng], [pickup.lat, pickup.lng]]);
            map.fitBounds(bounds, {padding: [80, 80]});
          }

          function clearDriverMarker() {
            if (driverMarker) {
              map.removeLayer(driverMarker);
              driverMarker = null;
            }
          }
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

      {/* Map */}
      <View style={styles.mapContainer}>
        <WebView
          ref={webViewRef}
          source={{ html: getMapHTML() }}
          style={styles.map}
          scrollEnabled={false}
          onError={(e) => console.log('WebView error:', e)}
        />

        {/* Loading Overlay */}
        {isLoadingLocation && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>{t('taxi.gettingLocation')}</Text>
          </View>
        )}

        {/* Back Button */}
        <TouchableOpacity
          style={[styles.backButton, { top: insets.top + 10 }]}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>

        {/* My Location Button */}
        <TouchableOpacity
          style={styles.myLocationButton}
          onPress={centerOnUser}
        >
          <Ionicons name="locate" size={24} color={colors.primary} />
        </TouchableOpacity>

        {/* History Button */}
        <TouchableOpacity
          style={[styles.historyButton, { top: insets.top + 10 }]}
          onPress={() => navigation.navigate('TaxiHistory')}
        >
          <Ionicons name="time-outline" size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Bottom Sheet */}
      <View style={[styles.bottomSheet, { paddingBottom: insets.bottom }]}>
        {rideStatus === 'searching' || rideStatus === 'found' || rideStatus === 'driver_arrived' || rideStatus === 'in_progress' ? (
          <View style={styles.rideStatusContainer}>
            <View style={styles.rideStatusHeader}>
              <View style={styles.statusIndicator}>
                {rideStatus === 'searching' ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : rideStatus === 'in_progress' ? (
                  <Ionicons name="car" size={24} color={colors.primary} />
                ) : (
                  <Ionicons name="checkmark-circle" size={24} color={colors.success} />
                )}
              </View>
              <Text style={styles.rideStatusText}>
                {rideStatus === 'searching'
                  ? t('taxi.lookingForDriver')
                  : rideStatus === 'driver_arrived'
                  ? t('taxi.driverArrived')
                  : rideStatus === 'in_progress'
                  ? t('taxi.rideInProgress')
                  : t('taxi.driverFound')}
              </Text>
            </View>

            {/* Progress Bar */}
            {rideStatus === 'searching' && (
              <View style={styles.progressContainer}>
                <Text style={styles.progressLabel}>{t('taxi.searchingForDriver')}</Text>
                <View style={styles.progressBarBackground}>
                  <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
                </View>
              </View>
            )}

            {/* Driver Info Card - shown when driver is found */}
            {rideStatus === 'found' && currentRide?.driver && (
              <View style={styles.driverInfoCard}>
                {/* Driver is coming indicator */}
                <View style={styles.driverComingBanner}>
                  <View style={styles.driverComingIconContainer}>
                    <Ionicons name="car" size={20} color={colors.primary} />
                  </View>
                  <View style={styles.driverComingTextContainer}>
                    <Text style={styles.driverComingTitle}>{t('taxi.driverIsOnTheWay')}</Text>
                    {driverETA !== null && driverDistance !== null && (
                      <Text style={styles.driverComingSubtitle}>
                        {driverDistance < 1
                          ? `${(driverDistance * 1000).toFixed(0)}m`
                          : `${driverDistance.toFixed(1)}km`} • {driverETA} {t('taxi.minutesAway')}
                      </Text>
                    )}
                  </View>
                </View>

                <View style={styles.divider} />

                <View style={styles.driverInfoHeader}>
                  <View style={styles.driverAvatarContainer}>
                    {currentRide.driver.user?.profileImage ? (
                      <Image
                        source={{ uri: currentRide.driver.user.profileImage }}
                        style={styles.driverAvatar}
                      />
                    ) : (
                      <View style={styles.driverAvatarPlaceholder}>
                        <Ionicons name="person" size={32} color={colors.mutedForeground} />
                      </View>
                    )}
                  </View>
                  <View style={styles.driverInfoMain}>
                    <Text style={styles.driverName}>
                      {currentRide.driver.user?.firstName} {currentRide.driver.user?.lastName}
                    </Text>
                    <View style={styles.driverRatingRow}>
                      <Ionicons name="star" size={14} color="#FFA500" />
                      <Text style={styles.driverRating}>
                        {currentRide.driver.rating?.toFixed(1) || '5.0'}
                      </Text>
                      <Text style={styles.driverTrips}>
                        • {currentRide.driver.totalTrips || 0} {t('taxi.trips')}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity style={styles.callButton}>
                    <Ionicons name="call" size={20} color={colors.primary} />
                  </TouchableOpacity>
                </View>

                <View style={styles.divider} />

                <View style={styles.vehicleInfo}>
                  <View style={styles.vehicleIconContainer}>
                    <Ionicons name="car-sport" size={24} color={colors.primary} />
                  </View>
                  <View style={styles.vehicleDetails}>
                    <Text style={styles.vehicleName}>
                      {currentRide.driver.vehicle?.make} {currentRide.driver.vehicle?.model}
                    </Text>
                    <View style={styles.vehicleMetaRow}>
                      <View style={styles.vehiclePlate}>
                        <Text style={styles.vehiclePlateText}>
                          {currentRide.driver.vehicle?.licensePlate}
                        </Text>
                      </View>
                      <View style={styles.vehicleColor}>
                        <View style={[
                          styles.colorDot,
                          { backgroundColor: getColorHex(currentRide.driver.vehicle?.color) }
                        ]} />
                        <Text style={styles.vehicleColorText}>
                          {currentRide.driver.vehicle?.color}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              </View>
            )}

            {/* Waiting Time Countdown - shown when driver has arrived */}
            {rideStatus === 'driver_arrived' && waitingTimeLeft !== null && (
              <View style={styles.waitingContainer}>
                <View style={styles.waitingHeader}>
                  <Ionicons name="time-outline" size={20} color={waitingTimeLeft <= 60 ? colors.destructive : colors.warning} />
                  <Text style={styles.waitingTitle}>{t('taxi.waitingForYou')}</Text>
                </View>
                <View style={styles.waitingTimeRow}>
                  <Text style={[
                    styles.waitingTimeValue,
                    waitingTimeLeft <= 60 && styles.waitingTimeUrgent
                  ]}>
                    {Math.floor(waitingTimeLeft / 60)}:{(waitingTimeLeft % 60).toString().padStart(2, '0')}
                  </Text>
                  <Text style={styles.waitingTimeLabel}>{t('taxi.timeRemaining')}</Text>
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
                    {waitingFee > 0 ? t('taxi.paidWaiting') : t('taxi.freeWaiting')}
                  </Text>
                  {waitingFee > 0 && (
                    <Text style={styles.waitingFeeValue}>+${waitingFee.toFixed(2)}</Text>
                  )}
                </View>
                {waitingTimeLeft <= 60 && (
                  <Text style={styles.waitingWarning}>{t('taxi.hurryUp')}</Text>
                )}
              </View>
            )}

            {/* In Progress Status */}
            {rideStatus === 'in_progress' && (
              <View style={styles.inProgressContainer}>
                <Ionicons name="navigate" size={24} color={colors.primary} />
                <Text style={styles.inProgressText}>{t('taxi.enjoyYourRide')}</Text>
              </View>
            )}

            <View style={styles.rideDetailsRow}>
              <View style={styles.rideDetailItem}>
                <Text style={styles.rideDetailLabel}>{t('taxi.estimatedFare')}</Text>
                <Text style={styles.rideDetailValue}>
                  ${estimatedPrice}{waitingFee > 0 ? ` (+$${waitingFee.toFixed(2)})` : ''}
                </Text>
              </View>
              <View style={styles.rideDetailItem}>
                <Text style={styles.rideDetailLabel}>{t('taxi.duration')}</Text>
                <Text style={styles.rideDetailValue}>{estimatedDuration} {t('taxi.minutes')}</Text>
              </View>
            </View>

            {rideStatus !== 'in_progress' && (
              <TouchableOpacity style={styles.cancelButton} onPress={handleCancelRide}>
                <Text style={styles.cancelButtonText}>{t('taxi.cancelRide')}</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            {/* Pickup Location */}
            <View style={styles.locationRow}>
              <View style={styles.locationDot}>
                <Ionicons name="radio-button-on" size={16} color={colors.success} />
              </View>
              <View style={styles.locationInputContainer}>
                <Text style={styles.locationLabel}>{t('taxi.currentLocation')}</Text>
                <Text style={styles.locationText} numberOfLines={1}>
                  {locationAddress || t('taxi.gettingLocation')}
                </Text>
              </View>
              <TouchableOpacity onPress={requestLocationPermission}>
                <Ionicons name="refresh" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <View style={styles.locationLine} />

            {/* Destination */}
            <View style={styles.locationRow}>
              <View style={styles.locationDot}>
                <Ionicons name="location" size={16} color={colors.destructive} />
              </View>
              <View style={styles.locationInputContainer}>
                <Text style={styles.locationLabel}>{t('taxi.destination')}</Text>
                <TextInput
                  style={styles.destinationInput}
                  placeholder={t('taxi.enterDestination')}
                  placeholderTextColor={colors.mutedForeground}
                  value={destination}
                  onChangeText={handleDestinationChange}
                />
              </View>
            </View>

            {/* Vehicle Types */}
            <Text style={styles.sectionTitle}>{t('taxi.vehicleType')}</Text>
            <View style={styles.vehicleTypes}>
              {VEHICLE_TYPES.map((vehicle) => (
                <TouchableOpacity
                  key={vehicle.id}
                  style={[
                    styles.vehicleCard,
                    selectedVehicle === vehicle.id && styles.vehicleCardSelected,
                  ]}
                  onPress={() => handleVehicleSelect(vehicle.id)}
                >
                  <View style={[
                    styles.vehicleIconContainer,
                    selectedVehicle === vehicle.id && styles.vehicleIconContainerSelected,
                  ]}>
                    <Ionicons
                      name={vehicle.icon}
                      size={28}
                      color={selectedVehicle === vehicle.id ? colors.background : colors.primary}
                    />
                  </View>
                  <Text style={[
                    styles.vehicleName,
                    selectedVehicle === vehicle.id && styles.vehicleNameSelected,
                  ]}>
                    {t(`taxi.${vehicle.id}`)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Payment Method */}
            <Text style={styles.sectionTitle}>{t('taxi.paymentMethod')}</Text>
            <View style={styles.paymentMethods}>
              <TouchableOpacity
                style={[
                  styles.paymentOption,
                  paymentMethod === 'cash' && styles.paymentOptionSelected,
                ]}
                onPress={() => setPaymentMethod('cash')}
              >
                <Ionicons
                  name="cash-outline"
                  size={20}
                  color={paymentMethod === 'cash' ? colors.primary : colors.mutedForeground}
                />
                <Text style={[
                  styles.paymentText,
                  paymentMethod === 'cash' && styles.paymentTextSelected,
                ]}>
                  {t('taxi.cash')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.paymentOption,
                  paymentMethod === 'card' && styles.paymentOptionSelected,
                ]}
                onPress={() => setPaymentMethod('card')}
              >
                <Ionicons
                  name="card-outline"
                  size={20}
                  color={paymentMethod === 'card' ? colors.primary : colors.mutedForeground}
                />
                <Text style={[
                  styles.paymentText,
                  paymentMethod === 'card' && styles.paymentTextSelected,
                ]}>
                  {t('taxi.card')}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Estimated Price */}
            {estimatedPrice && (
              <View style={styles.estimateContainer}>
                <View style={styles.estimateRow}>
                  <Text style={styles.estimateLabel}>{t('taxi.estimatedFare')}</Text>
                  <Text style={styles.estimateValue}>${estimatedPrice}</Text>
                </View>
                <View style={styles.estimateRow}>
                  <Text style={styles.estimateLabel}>{t('taxi.duration')}</Text>
                  <Text style={styles.estimateValue}>{estimatedDuration} {t('taxi.minutes')}</Text>
                </View>
              </View>
            )}

            {/* Request Button */}
            <TouchableOpacity
              style={[
                styles.requestButton,
                !destination && styles.requestButtonDisabled,
              ]}
              onPress={handleRequestRide}
              disabled={isRequesting || !destination}
            >
              {isRequesting ? (
                <ActivityIndicator color={colors.background} />
              ) : (
                <>
                  <Ionicons name="car" size={20} color={colors.background} />
                  <Text style={styles.requestButtonText}>{t('taxi.requestRide')}</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  mapContainer: {
    height: height * 0.45,
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
  backButton: {
    position: 'absolute',
    left: 16,
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
    bottom: 30,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.md,
  },
  historyButton: {
    position: 'absolute',
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.md,
  },
  bottomSheet: {
    flex: 1,
    backgroundColor: colors.background,
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    padding: 20,
    marginTop: -20,
    ...shadows.lg,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  locationDot: {
    width: 32,
    alignItems: 'center',
  },
  locationLine: {
    width: 2,
    height: 20,
    backgroundColor: colors.border,
    marginLeft: 15,
  },
  locationInputContainer: {
    flex: 1,
    marginLeft: 8,
  },
  locationLabel: {
    fontSize: 12,
    color: colors.mutedForeground,
    marginBottom: 2,
  },
  locationText: {
    fontSize: 15,
    color: colors.foreground,
    fontWeight: '500',
  },
  destinationInput: {
    fontSize: 15,
    color: colors.foreground,
    fontWeight: '500',
    padding: 0,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: 12,
    marginTop: 16,
  },
  vehicleTypes: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  vehicleCard: {
    flex: 1,
    alignItems: 'center',
    padding: 12,
    marginHorizontal: 4,
    borderRadius: radius.lg,
    backgroundColor: colors.secondary,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  vehicleCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.background,
  },
  vehicleIconContainer: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  vehicleIconContainerSelected: {
    backgroundColor: colors.primary,
  },
  vehicleName: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.mutedForeground,
  },
  vehicleNameSelected: {
    color: colors.primary,
    fontWeight: '600',
  },
  paymentMethods: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  paymentOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    marginHorizontal: 4,
    borderRadius: radius.lg,
    backgroundColor: colors.secondary,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  paymentOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.background,
  },
  paymentText: {
    marginLeft: 8,
    fontSize: 14,
    color: colors.mutedForeground,
  },
  paymentTextSelected: {
    color: colors.primary,
    fontWeight: '600',
  },
  estimateContainer: {
    backgroundColor: colors.secondary,
    borderRadius: radius.lg,
    padding: 16,
    marginBottom: 16,
  },
  estimateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  estimateLabel: {
    fontSize: 14,
    color: colors.mutedForeground,
  },
  estimateValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.foreground,
  },
  requestButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    padding: 16,
    borderRadius: radius.lg,
    marginBottom: 20,
  },
  requestButtonDisabled: {
    opacity: 0.5,
  },
  requestButtonText: {
    color: colors.background,
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  rideStatusContainer: {
    paddingVertical: 8,
  },
  rideStatusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  statusIndicator: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rideStatusText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.foreground,
    marginLeft: 8,
  },
  progressContainer: {
    marginBottom: 16,
  },
  progressLabel: {
    fontSize: 13,
    color: colors.mutedForeground,
    marginBottom: 8,
    textAlign: 'center',
  },
  progressBarBackground: {
    height: 6,
    backgroundColor: colors.secondary,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: radius.full,
  },
  rideDetailsRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  rideDetailItem: {
    flex: 1,
    backgroundColor: colors.secondary,
    padding: 16,
    borderRadius: radius.lg,
    marginHorizontal: 4,
  },
  rideDetailLabel: {
    fontSize: 12,
    color: colors.mutedForeground,
    marginBottom: 4,
  },
  rideDetailValue: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.foreground,
  },
  cancelButton: {
    backgroundColor: colors.destructive + '15',
    padding: 16,
    borderRadius: radius.lg,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: colors.destructive,
    fontSize: 16,
    fontWeight: '600',
  },
  driverInfoCard: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.md,
  },
  driverComingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary + '10',
    padding: 12,
    borderRadius: radius.md,
    marginBottom: 12,
  },
  driverComingIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  driverComingTextContainer: {
    flex: 1,
  },
  driverComingTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary,
    marginBottom: 2,
  },
  driverComingSubtitle: {
    fontSize: 13,
    color: colors.mutedForeground,
    fontWeight: '500',
  },
  driverInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  driverAvatarContainer: {
    marginRight: 12,
  },
  driverAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  driverAvatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  driverInfoMain: {
    flex: 1,
  },
  driverName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: 4,
  },
  driverRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  driverRating: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.foreground,
    marginLeft: 4,
  },
  driverTrips: {
    fontSize: 13,
    color: colors.mutedForeground,
    marginLeft: 4,
  },
  callButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginBottom: 12,
  },
  vehicleInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  vehicleIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  vehicleDetails: {
    flex: 1,
  },
  vehicleName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: 6,
  },
  vehicleMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  vehiclePlate: {
    backgroundColor: colors.secondary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.md,
    marginRight: 12,
  },
  vehiclePlateText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.foreground,
    letterSpacing: 1,
  },
  vehicleColor: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  vehicleColorText: {
    fontSize: 12,
    color: colors.mutedForeground,
    textTransform: 'capitalize',
  },
  // Waiting time styles
  waitingContainer: {
    backgroundColor: colors.warning + '15',
    borderRadius: radius.lg,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.warning + '30',
  },
  waitingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  waitingTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.foreground,
    marginLeft: 8,
  },
  waitingTimeRow: {
    alignItems: 'center',
    marginBottom: 12,
  },
  waitingTimeValue: {
    fontSize: 36,
    fontWeight: '700',
    color: colors.warning,
  },
  waitingTimeUrgent: {
    color: colors.destructive,
  },
  waitingTimeLabel: {
    fontSize: 12,
    color: colors.mutedForeground,
    marginTop: 4,
  },
  waitingProgressBar: {
    height: 6,
    backgroundColor: colors.secondary,
    borderRadius: radius.full,
    overflow: 'hidden',
    marginBottom: 12,
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
    fontSize: 13,
    color: colors.mutedForeground,
  },
  waitingFeeValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.warning,
  },
  waitingWarning: {
    fontSize: 13,
    color: colors.destructive,
    textAlign: 'center',
    marginTop: 8,
    fontWeight: '500',
  },
  inProgressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary + '15',
    borderRadius: radius.lg,
    padding: 16,
    marginBottom: 16,
  },
  inProgressText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
    marginLeft: 8,
  },
});
