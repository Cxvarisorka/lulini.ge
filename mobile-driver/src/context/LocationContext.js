import React, {
  createContext,
  useState,
  useContext,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import * as Location from 'expo-location';
import { Alert, AppState, Platform } from 'react-native';
import { driverAPI } from '../services/api';
import {
  startBackgroundLocationUpdates,
  stopBackgroundLocationUpdates,
  clearRetryQueue,
} from '../services/backgroundLocation';
import { haversineKm } from '../utils/distance';

/**
 * LocationContext — Production-grade driver location tracking
 *
 * Features:
 *   - Background GPS via expo-task-manager (works minimized + screen locked)
 *   - Foreground watcher syncs UI state (map marker, heading)
 *   - Batched server updates from background task
 *   - GPS spoofing detection (mock provider, accuracy, speed)
 *   - Speed validation before sending
 *   - Offline retry queue persisted to SecureStore
 *   - Battery-adaptive: tight during rides, loose when idle
 *   - Full cleanup on logout
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

// Throttle for foreground → server updates (background task handles its own batching)
const MIN_MOVEMENT_METERS = 10;
const MIN_SERVER_UPDATE_INTERVAL = 5000;

// Speed limit for foreground validation
const MAX_SPEED_KMH = 200;

export const LocationProvider = ({ children }) => {
  const [location, setLocation] = useState(null);
  const [address, setAddress] = useState('');
  const [isTracking, setIsTracking] = useState(false);
  const [error, setError] = useState(null);
  const [permissionStatus, setPermissionStatus] = useState(null); // 'foreground' | 'background' | null
  const [permissionsReady, setPermissionsReady] = useState(false);

  const locationSubscription = useRef(null);
  const isShowingAlert = useRef(false);
  const activeRideRef = useRef(null);
  // [C4 FIX] Promise-based lock to prevent overlapping permission requests (iOS crash fix)
  const permissionLockRef = useRef(null); // null = unlocked, Promise = locked

  // C6: Ref for location to avoid stale closures in startTracking/updateLocationOnServer
  const locationRef = useRef(null);
  useEffect(() => { locationRef.current = location; }, [location]);

  // Throttle server updates from foreground watcher
  const lastServerUpdate = useRef({ lat: 0, lng: 0, time: 0 });
  // Track background permission status via ref (avoid stale closure in watcher callback)
  const bgPermissionRef = useRef(false);

  // ─── Permission flow ────────────────────────────────────────────────────

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await requestPermissions();
      } catch (e) {
        console.warn('[Location] Initial permission request failed:', e.message);
        if (mounted) setLocation(DEFAULT_LOCATION);
      } finally {
        if (mounted) setPermissionsReady(true);
      }
    })();
    return () => {
      mounted = false;
      stopTracking();
    };
  }, []);

  // Re-check permissions when app returns to foreground
  useEffect(() => {
    const subscription = AppState.addEventListener(
      'change',
      async (nextAppState) => {
        if (nextAppState === 'active') {
          const fg = await Location.getForegroundPermissionsAsync();
          if (fg.status !== 'granted') {
            stopTracking();
            setError('Location permission revoked');
            showAlert(
              'Location Permission Required',
              'Location permission was revoked. Please re-enable it in settings to continue driving.',
            );
          }
        }
      },
    );
    return () => subscription.remove();
  }, []);

  const showAlert = useCallback((title, message) => {
    if (isShowingAlert.current) return;
    isShowingAlert.current = true;
    Alert.alert(title, message, [
      {
        text: 'OK',
        onPress: () => {
          isShowingAlert.current = false;
        },
      },
    ]);
  }, []);

  // Track permission status via ref so concurrent waiters read the latest value
  // (not a stale closure captured before the first caller finished)
  const permissionStatusRef = useRef(permissionStatus);
  useEffect(() => { permissionStatusRef.current = permissionStatus; }, [permissionStatus]);

  const requestPermissions = async () => {
    // [C4 FIX] Promise-based lock — concurrent callers wait for the first to finish.
    // Use ref (not closure) so waiters get the value set by the first caller.
    if (permissionLockRef.current) {
      await permissionLockRef.current;
      return permissionStatusRef.current === 'foreground' || permissionStatusRef.current === 'background';
    }

    let unlockResolve;
    permissionLockRef.current = new Promise((resolve) => { unlockResolve = resolve; });

    try {
      // Check location services
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        showAlert(
          'Location Services Disabled',
          'Please enable location services in your device settings to use this app.',
        );
        setError('Location services disabled');
        setLocation(DEFAULT_LOCATION);
        return false;
      }

      // Step 1: Foreground permission
      const { status: fgStatus } =
        await Location.requestForegroundPermissionsAsync();
      if (fgStatus !== 'granted') {
        showAlert(
          'Location Permission Required',
          'Please enable location permissions in your device settings to use this app.',
        );
        setError('Location permission not granted');
        setLocation(DEFAULT_LOCATION);
        return false;
      }
      setPermissionStatus('foreground');

      // Step 2: Background permission
      // On iOS, defer background permission — iOS requires the user to first
      // interact with foreground location before prompting for "Always".
      // Requesting it too early can crash or silently fail.
      if (Platform.OS !== 'ios') {
        try {
          const { status: bgStatus } =
            await Location.requestBackgroundPermissionsAsync();
          if (bgStatus === 'granted') {
            setPermissionStatus('background');
          } else {
            console.warn(
              '[Location] Background permission not granted — foreground only',
            );
            showAlert(
              'Background Location',
              'For best experience, please allow "All the time" location access in app settings.',
            );
          }
        } catch (bgErr) {
          console.warn('[Location] Background permission request failed:', bgErr.message);
        }
      } else {
        // iOS: just check current status, don't prompt yet
        try {
          const { status: bgStatus } =
            await Location.getBackgroundPermissionsAsync();
          if (bgStatus === 'granted') {
            setPermissionStatus('background');
          }
        } catch (_) {}
      }

      // Get initial location
      const currentLocation = await Promise.race([
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Location timeout')), 15000),
        ),
      ]);

      const coords = {
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude,
      };
      setLocation(coords);
      setError(null);

      // Reverse geocode (non-blocking)
      reverseGeocode(coords);

      return true;
    } catch (err) {
      let msg = 'Failed to get your location. ';
      if (err.message?.includes('timeout')) {
        msg += 'Make sure you have a clear view of the sky and try again.';
      } else if (err.message?.includes('denied')) {
        msg += 'Please enable location permissions in your device settings.';
      } else {
        msg += err.message;
      }
      showAlert('Location Error', msg);
      setError('Location error');
      setLocation(DEFAULT_LOCATION);
      return false;
    } finally {
      permissionLockRef.current = null;
      unlockResolve();
    }
  };

  const reverseGeocode = async (coords) => {
    try {
      const [data] = await Location.reverseGeocodeAsync(coords);
      if (data) {
        const str = [data.street, data.name, data.city]
          .filter(Boolean)
          .join(', ');
        setAddress(str || 'Current Location');
      }
    } catch (_) {}
  };

  // ─── Start tracking (foreground watcher + background task) ──────────────

  const startTracking = async () => {
    try {
      // Ensure foreground permission
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') {
        const ok = await requestPermissions();
        if (!ok) return false;
      }

      // C6: Use ref to avoid stale closure — location state may have changed since startTracking was created
      if (!locationRef.current) {
        try {
          const pos = await Promise.race([
            Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            }),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('timeout')), 10000),
            ),
          ]);
          setLocation({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          });
        } catch (_) {
          setLocation(DEFAULT_LOCATION);
        }
      }

      const hasActiveRide = !!activeRideRef.current;

      // Check background permission — on iOS, request it now (deferred from init)
      let bgPermission = await Location.getBackgroundPermissionsAsync();
      if (bgPermission.status !== 'granted' && Platform.OS === 'ios') {
        try {
          bgPermission = await Location.requestBackgroundPermissionsAsync();
          if (bgPermission.status === 'granted') {
            setPermissionStatus('background');
          }
        } catch (e) {
          console.warn('[Location] iOS background permission request failed:', e.message);
        }
      }

      bgPermissionRef.current = bgPermission.status === 'granted';
      if (bgPermissionRef.current) {
        await startBackgroundLocationUpdates(hasActiveRide);
      } else {
        // Background not granted — foreground watcher will handle server updates instead
        console.warn('[Location] Background permission not granted — using foreground-only tracking');
        if (Platform.OS === 'ios') {
          showAlert(
            'Background Location',
            'For best experience, set location to "Always" in Settings > Lulini Driver > Location. You can still go online with current permissions.',
          );
        }
      }

      // Start foreground watcher for UI updates (map marker position, heading)
      locationSubscription.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: hasActiveRide ? 3000 : 10000,
          distanceInterval: hasActiveRide ? 5 : 10,
        },
        (newLocation) => {
          const coords = {
            latitude: newLocation.coords.latitude,
            longitude: newLocation.coords.longitude,
            heading: newLocation.coords.heading ?? null,
            speed: newLocation.coords.speed ?? null,
            accuracy: newLocation.coords.accuracy ?? null,
          };

          // Client-side spoofing check
          if (
            Platform.OS === 'android' &&
            newLocation.mocked
          ) {
            console.warn('[Location] Mock location detected in foreground');
            return;
          }

          // Speed validation
          const last = lastServerUpdate.current;
          if (last.lat !== 0) {
            const timeDelta = (Date.now() - last.time) / 1000;
            if (timeDelta > 1) {
              const dist = haversineKm(
                last.lat,
                last.lng,
                coords.latitude,
                coords.longitude,
              );
              const speed = (dist / timeDelta) * 3600;
              if (speed > MAX_SPEED_KMH) {
                console.warn(
                  `[Location] Foreground speed ${speed.toFixed(0)} km/h — skipping`,
                );
                return;
              }
            }
          }

          setLocation(coords);

          // Send to server if background isn't handling it
          if (!bgPermissionRef.current) {
            updateLocationOnServer(coords);
          }
        },
      );

      setIsTracking(true);
      return true;
    } catch (err) {
      setError('Failed to start tracking');
      if (
        !err.message?.includes('permission') &&
        !err.message?.includes('denied')
      ) {
        showAlert(
          'Location Tracking Error',
          `Could not start tracking: ${err.message}`,
        );
      }
      return false;
    }
  };

  // ─── Stop tracking ─────────────────────────────────────────────────────

  const stopTracking = useCallback(async () => {
    // Stop foreground watcher
    if (locationSubscription.current) {
      locationSubscription.current.remove();
      locationSubscription.current = null;
    }

    // Stop background task
    await stopBackgroundLocationUpdates();

    setIsTracking(false);
  }, []);

  // ─── Foreground server update (fallback when no background permission) ──

  const updateLocationOnServer = async (coords) => {
    const now = Date.now();
    const last = lastServerUpdate.current;

    if (now - last.time < MIN_SERVER_UPDATE_INTERVAL) return;

    if (last.lat !== 0) {
      const moved =
        haversineKm(last.lat, last.lng, coords.latitude, coords.longitude) *
        1000;
      if (moved < MIN_MOVEMENT_METERS) return;
    }

    lastServerUpdate.current = {
      lat: coords.latitude,
      lng: coords.longitude,
      time: now,
    };

    try {
      await driverAPI.updateLocation(coords);
    } catch (err) {
      console.warn('[Location] Server update failed:', err.message);
    }
  };

  // ─── Ride state changes (adjusts GPS frequency) ────────────────────────

  const setActiveRide = async (ride) => {
    const hadRide = !!activeRideRef.current;
    const hasRide = !!ride;
    activeRideRef.current = ride;

    // Restart tracking with different accuracy if ride state changed
    if (hadRide !== hasRide && isTracking) {
      await stopTracking();
      await startTracking();
    }
  };

  // ─── On-demand location fetch ──────────────────────────────────────────

  const getCurrentLocation = async () => {
    try {
      const pos = await Promise.race([
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Location timeout')), 15000),
        ),
      ]);

      const coords = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      };
      setLocation(coords);
      return coords;
    } catch (err) {
      let msg = 'Failed to get your location. ';
      if (err.message.includes('timeout')) {
        msg += 'Make sure you have a clear view of the sky and try again.';
      } else {
        msg += err.message;
      }
      showAlert('Location Error', msg);
      return null;
    }
  };

  // ─── Full cleanup for logout ───────────────────────────────────────────

  const cleanupForLogout = useCallback(async () => {
    await stopTracking();
    await clearRetryQueue();
    setLocation(null);
    setAddress('');
    setError(null);
    setPermissionStatus(null);
    lastServerUpdate.current = { lat: 0, lng: 0, time: 0 };
    // [H7 FIX] Reset all refs to prevent stale state on next login
    isShowingAlert.current = false;
    activeRideRef.current = null;
    permissionLockRef.current = null;
    bgPermissionRef.current = false;
  }, [stopTracking]);

  // ─── Context value ─────────────────────────────────────────────────────

  const value = useMemo(() => ({
    location,
    address,
    isTracking,
    error,
    permissionStatus,
    permissionsReady,
    requestPermissions,
    startTracking,
    stopTracking,
    getCurrentLocation,
    setActiveRide,
    cleanupForLogout,
  }), [location, address, isTracking, error, permissionStatus, permissionsReady, stopTracking, cleanupForLogout]);

  return (
    <LocationContext.Provider value={value}>{children}</LocationContext.Provider>
  );
};
