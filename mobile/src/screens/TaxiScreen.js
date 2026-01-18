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

const { width, height } = Dimensions.get('window');

// Default location (Tbilisi, Georgia)
const DEFAULT_LOCATION = {
  latitude: 41.7151,
  longitude: 44.8271,
};

const VEHICLE_TYPES = [
  { id: 'economy', icon: 'car-outline', priceMultiplier: 1 },
  { id: 'comfort', icon: 'car', priceMultiplier: 1.5 },
  { id: 'business', icon: 'car-sport', priceMultiplier: 2 },
];

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

  useEffect(() => {
    requestLocationPermission();
  }, []);

  // Socket event listeners
  useEffect(() => {
    if (!socket) return;

    socket.on('ride:accepted', (ride) => {
      console.log('Ride accepted:', ride);
      setCurrentRide(ride);
      setRideStatus('found');
      Alert.alert(
        t('taxi.driverFound'),
        `${ride.driver?.user?.firstName} ${t('taxi.isOnTheWay')}`,
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

    socket.on('ride:completed', (ride) => {
      console.log('Ride completed:', ride);
      setCurrentRide(null);
      setRideStatus(null);
      setDestination('');
      setDestinationCoords(null);
      setEstimatedPrice(null);
      setEstimatedDuration(null);
      Alert.alert(
        t('taxi.rideCompleted'),
        `${t('taxi.totalFare')}: $${ride.fare}`,
        [
          {
            text: t('common.ok'),
            onPress: () => navigation.navigate('TaxiHistory')
          }
        ]
      );
    });

    socket.on('ride:cancelled', (ride) => {
      console.log('Ride cancelled:', ride);
      setCurrentRide(null);
      setRideStatus(null);
      Alert.alert(
        t('taxi.rideCancelled'),
        ride.cancelledBy === 'driver'
          ? t('taxi.driverCancelledRide')
          : t('taxi.rideCancelledMessage'),
        [{ text: t('common.ok') }]
      );
    });

    return () => {
      socket.off('ride:accepted');
      socket.off('ride:started');
      socket.off('ride:completed');
      socket.off('ride:cancelled');
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
    Alert.alert(
      t('taxi.cancelRide'),
      t('taxi.confirmCancel'),
      [
        { text: t('common.no'), style: 'cancel' },
        {
          text: t('common.yes'),
          style: 'destructive',
          onPress: async () => {
            if (currentRide && currentRide._id) {
              try {
                await taxiAPI.cancelRide(currentRide._id, t('taxi.cancelledByUser'));
              } catch (error) {
                console.log('Error cancelling ride:', error);
              }
            }
            setCurrentRide(null);
            setRideStatus(null);
            setDestination('');
            setDestinationCoords(null);
            setEstimatedPrice(null);
            setEstimatedDuration(null);
          },
        },
      ]
    );
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

          var pickupMarker = L.marker([${lat}, ${lng}], {icon: pickupIcon}).addTo(map);
          var destinationMarker = null;
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
        </script>
      </body>
      </html>
    `;
  };

  return (
    <View style={styles.container}>
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
        {rideStatus === 'searching' || rideStatus === 'found' ? (
          <View style={styles.rideStatusContainer}>
            <View style={styles.rideStatusHeader}>
              <View style={styles.statusIndicator}>
                {rideStatus === 'searching' ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Ionicons name="checkmark-circle" size={24} color={colors.success} />
                )}
              </View>
              <Text style={styles.rideStatusText}>
                {rideStatus === 'searching' ? t('taxi.lookingForDriver') : t('taxi.driverFound')}
              </Text>
            </View>

            <View style={styles.rideDetailsRow}>
              <View style={styles.rideDetailItem}>
                <Text style={styles.rideDetailLabel}>{t('taxi.estimatedFare')}</Text>
                <Text style={styles.rideDetailValue}>${estimatedPrice}</Text>
              </View>
              <View style={styles.rideDetailItem}>
                <Text style={styles.rideDetailLabel}>{t('taxi.duration')}</Text>
                <Text style={styles.rideDetailValue}>{estimatedDuration} {t('taxi.minutes')}</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.cancelButton} onPress={handleCancelRide}>
              <Text style={styles.cancelButtonText}>{t('taxi.cancelRide')}</Text>
            </TouchableOpacity>
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
});
