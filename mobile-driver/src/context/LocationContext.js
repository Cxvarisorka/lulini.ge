import React, { createContext, useState, useContext, useEffect, useRef } from 'react';
import * as Location from 'expo-location';
import { Alert } from 'react-native';
import { driverAPI } from '../services/api';

/**
 * LocationContext - Manages location tracking for the driver app
 *
 * Note: Currently uses FOREGROUND location only (works with Expo Go)
 * Background location tracking has been removed to avoid requiring a development build.
 * For production with background tracking, you'll need to build a custom development build.
 */

const LocationContext = createContext();

export const useLocation = () => {
  const context = useContext(LocationContext);
  if (!context) {
    throw new Error('useLocation must be used within LocationProvider');
  }
  return context;
};

// Default location (Tbilisi, Georgia)
const DEFAULT_LOCATION = {
  latitude: 41.7151,
  longitude: 44.8271,
};

export const LocationProvider = ({ children }) => {
  const [location, setLocation] = useState(null);
  const [address, setAddress] = useState('');
  const [isTracking, setIsTracking] = useState(false);
  const [error, setError] = useState(null);
  const locationSubscription = useRef(null);

  useEffect(() => {
    requestLocationPermission();

    return () => {
      stopTracking();
    };
  }, []);

  const requestLocationPermission = async () => {
    try {
      console.log('Requesting location permissions...');

      // First check if location services are enabled
      const locationEnabled = await Location.hasServicesEnabledAsync();
      console.log('Location services enabled:', locationEnabled);

      if (!locationEnabled) {
        Alert.alert(
          'Location Services Disabled',
          'Please enable location services in your device settings to use this app.',
          [{ text: 'OK' }]
        );
        setError('Location services disabled');
        setLocation(DEFAULT_LOCATION);
        return false;
      }

      // Request permission
      const { status } = await Location.requestForegroundPermissionsAsync();
      console.log('Foreground permission status:', status);

      if (status !== 'granted') {
        console.log('Location permission denied');
        Alert.alert(
          'Location Permission Required',
          'Please enable location permissions in your device settings to use this app.',
          [{ text: 'OK' }]
        );
        setError('Location permission not granted');
        setLocation(DEFAULT_LOCATION);
        return false;
      }

      // Get initial location with timeout
      console.log('Getting current position...');
      const currentLocation = await Promise.race([
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 5000,
          distanceInterval: 0,
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Location request timed out')), 15000)
        )
      ]);
      console.log('Current position:', currentLocation.coords);

      const newLocation = {
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude,
      };

      setLocation(newLocation);
      setError(null);

      // Get address
      try {
        const [addressData] = await Location.reverseGeocodeAsync(newLocation);
        if (addressData) {
          const addressString = [
            addressData.street,
            addressData.name,
            addressData.city,
          ].filter(Boolean).join(', ');
          setAddress(addressString || 'Current Location');
        }
      } catch (err) {
        console.log('Error getting address:', err);
      }

      return true;
    } catch (err) {
      console.log('Error requesting location permission:', err);
      console.error('Full error:', err);

      let errorMessage = 'Failed to get your location. ';
      if (err.message.includes('timeout')) {
        errorMessage += 'Make sure you have a clear view of the sky and try again.';
      } else if (err.message.includes('denied')) {
        errorMessage += 'Please enable location permissions in your device settings.';
      } else {
        errorMessage += err.message;
      }

      Alert.alert(
        'Location Error',
        errorMessage,
        [{ text: 'OK' }]
      );
      setError('Location error');
      setLocation(DEFAULT_LOCATION);
      return false;
    }
  };

  const startTracking = async () => {
    try {
      const hasPermission = await requestLocationPermission();
      if (!hasPermission) {
        return false;
      }

      // Note: Background location tracking removed for now
      // Only using foreground location which works with Expo Go
      console.log('Starting foreground location tracking...');

      // Start watching location (foreground only)
      locationSubscription.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 10000, // Update every 10 seconds
          distanceInterval: 10, // Or every 10 meters
        },
        (newLocation) => {
          const coords = {
            latitude: newLocation.coords.latitude,
            longitude: newLocation.coords.longitude,
          };
          console.log('Location updated:', coords);
          setLocation(coords);

          // Send location to backend
          updateLocationOnServer(coords);
        }
      );

      setIsTracking(true);
      console.log('Location tracking started successfully');
      return true;
    } catch (err) {
      console.log('Error starting location tracking:', err);
      console.error('Full error:', err);
      setError('Failed to start tracking');
      Alert.alert(
        'Location Tracking Error',
        `Could not start tracking: ${err.message}`,
        [{ text: 'OK' }]
      );
      return false;
    }
  };

  const stopTracking = () => {
    if (locationSubscription.current) {
      locationSubscription.current.remove();
      locationSubscription.current = null;
    }
    setIsTracking(false);
  };

  const updateLocationOnServer = async (coords) => {
    try {
      await driverAPI.updateLocation(coords);
    } catch (err) {
      console.log('Error updating location on server:', err);
    }
  };

  const getCurrentLocation = async () => {
    try {
      console.log('Getting current location...');
      const currentLocation = await Promise.race([
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 5000,
          distanceInterval: 0,
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Location request timed out')), 15000)
        )
      ]);
      console.log('Got location:', currentLocation.coords);

      const coords = {
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude,
      };

      setLocation(coords);
      return coords;
    } catch (err) {
      console.log('Error getting current location:', err);
      console.error('Full error:', err);

      let errorMessage = 'Failed to get your location. ';
      if (err.message.includes('timeout')) {
        errorMessage += 'Make sure you have a clear view of the sky and try again.';
      } else {
        errorMessage += err.message;
      }

      Alert.alert(
        'Location Error',
        errorMessage,
        [{ text: 'OK' }]
      );
      return null;
    }
  };

  const value = {
    location,
    address,
    isTracking,
    error,
    requestLocationPermission,
    startTracking,
    stopTracking,
    getCurrentLocation,
  };

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
};
