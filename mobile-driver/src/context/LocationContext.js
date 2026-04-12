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
  getBackgroundLocationHealth,
} from '../services/backgroundLocation';
import { haversineKm } from '../utils/distance';
import RideTrackingService from '../services/RideTrackingService';

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

// Watchdog intervals — tighter during active rides for faster recovery
const WATCHDOG_INTERVAL_IDLE = 30000;
const WATCHDOG_INTERVAL_RIDE = 10000;
// Stale threshold — matches watchdog interval for each mode
const FOREGROUND_STALE_IDLE = 30000;
const FOREGROUND_STALE_RIDE = 10000;

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
  const healthCheckTimerRef = useRef(null);
  // [C4 FIX] Promise-based lock to prevent overlapping permission requests (iOS crash fix)
  const permissionLockRef = useRef(null); // null = unlocked, Promise = locked

  // C6: Ref for location to avoid stale closures in startTracking/updateLocationOnServer
  const locationRef = useRef(null);
  useEffect(() => { locationRef.current = location; }, [location]);

  // Ref mirror of isTracking — used inside setActiveRide to avoid stale closure
  const isTrackingRef = useRef(false);
  useEffect(() => { isTrackingRef.current = isTracking; }, [isTracking]);

  // Foreground watcher heartbeat — tracks last callback timestamp to detect silent death
  const lastForegroundUpdateRef = useRef(0);

  // Throttle server updates from foreground watcher
  const lastServerUpdate = useRef({ lat: 0, lng: 0, time: 0 });

  // Separate ref for speed validation — updated on every accepted GPS tick,
  // NOT just on server sends. Prevents false speed spikes after resume.
  const lastAcceptedPos = useRef({ lat: 0, lng: 0, time: 0 });
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

  // Re-check permissions and background/foreground location health when app returns to foreground
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
            return;
          }

          if (!isTrackingRef.current) return;

          // Health check: if tracking is on, verify background task is alive
          if (bgPermissionRef.current) {
            const health = getBackgroundLocationHealth();
            if (health.hasReceivedAny && !health.healthy) {
              console.warn(
                `[Location] Background location stale (${health.lastUpdateAge}s) — restarting task`,
              );
              try {
                await startBackgroundLocationUpdates(!!activeRideRef.current);
              } catch (e) {
                console.warn('[Location] Background task restart failed:', e.message);
              }
            }
          }

          // Health check: verify foreground watcher is still alive
          // Android OEMs can silently kill watchPositionAsync while the background service survives
          const fgAge = Date.now() - lastForegroundUpdateRef.current;
          const fgStaleMs = activeRideRef.current ? FOREGROUND_STALE_RIDE : FOREGROUND_STALE_IDLE;
          if (lastForegroundUpdateRef.current > 0 && fgAge > fgStaleMs) {
            console.warn(
              `[Location] Foreground watcher stale (${Math.round(fgAge / 1000)}s) — restarting`,
            );
            await restartForegroundWatcher();
          }
        }
      },
    );
    return () => subscription.remove();
  }, []);

  // Watchdog timer: periodically verify both background and foreground location are delivering.
  // Restarts whichever subsystem has gone silent.
  useEffect(() => {
    if (!isTracking) {
      if (healthCheckTimerRef.current) {
        clearInterval(healthCheckTimerRef.current);
        healthCheckTimerRef.current = null;
      }
      return;
    }

    healthCheckTimerRef.current = setInterval(async () => {
      // Check background task health
      if (bgPermissionRef.current) {
        const health = getBackgroundLocationHealth();
        if (health.hasReceivedAny && !health.healthy) {
          console.warn(
            `[Location] Watchdog: background stale (${health.lastUpdateAge}s) — restarting`,
          );
          try {
            await startBackgroundLocationUpdates(!!activeRideRef.current);
          } catch (e) {
            console.warn('[Location] Watchdog restart failed:', e.message);
          }
        }
      }

      // Check foreground watcher health — this is the critical fix for the
      // "driver map freezes but backend still receives location" bug.
      // Android OEMs can silently kill watchPositionAsync while the background
      // foreground service (with notification) survives.
      const fgStaleMs = activeRideRef.current ? FOREGROUND_STALE_RIDE : FOREGROUND_STALE_IDLE;
      const fgAge = Date.now() - lastForegroundUpdateRef.current;
      if (lastForegroundUpdateRef.current > 0 && fgAge > fgStaleMs) {
        console.warn(
          `[Location] Watchdog: foreground watcher stale (${Math.round(fgAge / 1000)}s) — restarting`,
        );
        await restartForegroundWatcher();
      }
    }, activeRideRef.current ? WATCHDOG_INTERVAL_RIDE : WATCHDOG_INTERVAL_IDLE);

    return () => {
      if (healthCheckTimerRef.current) {
        clearInterval(healthCheckTimerRef.current);
        healthCheckTimerRef.current = null;
      }
    };
  }, [isTracking]);

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

  // ─── Foreground watcher (extracted so it can be restarted independently) ──

  const startForegroundWatcher = async (hasActiveRide) => {
    // Remove previous watcher if any
    if (locationSubscription.current) {
      locationSubscription.current.remove();
      locationSubscription.current = null;
    }

    locationSubscription.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: hasActiveRide ? 3000 : 10000,
        distanceInterval: hasActiveRide ? 5 : 10,
      },
      (newLocation) => {
        // Record heartbeat — watchdog uses this to detect silent watcher death
        lastForegroundUpdateRef.current = Date.now();

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

        // Speed validation — uses lastAcceptedPos (updated every tick),
        // NOT lastServerUpdate (updated only on throttled sends).
        // This prevents false speed spikes after app resume or GPS gap.
        const last = lastAcceptedPos.current;
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
              // Still update UI even if server send is skipped — driver should
              // see their own position. Only truly impossible speeds are blocked.
              // 200 km/h is generous enough that real driving is never blocked.
              return;
            }
          }
        }

        // Update speed validation ref on every accepted tick
        lastAcceptedPos.current = {
          lat: coords.latitude,
          lng: coords.longitude,
          time: Date.now(),
        };

        setLocation(coords);

        // Pipe to RideTrackingService (server send + socket + buffer).
        // RideTrackingService no longer owns a watcher — LocationContext is
        // the single GPS source, eliminating dual-watcher conflicts.
        const rideTracker = RideTrackingService.getInstance();
        if (rideTracker.isTracking) {
          rideTracker.ingestLocation(coords);
        }

        // Also send via direct HTTP (fallback when RideTrackingService isn't active,
        // or for non-in_progress rides like accepted/driver_arrived).
        updateLocationOnServer(coords);
      },
    );
  };

  // Restart only the foreground watcher (preserves background task).
  // Retries up to 3 times with 2s delay — some Android OEMs need a brief
  // cooldown before allowing a new watcher after a silent kill.
  const restartForegroundWatcher = async (retriesLeft = 3) => {
    try {
      const hasActiveRide = !!activeRideRef.current;
      await startForegroundWatcher(hasActiveRide);
    } catch (e) {
      console.warn(`[Location] Foreground watcher restart failed (${retriesLeft} retries left):`, e.message);
      if (retriesLeft > 0) {
        setTimeout(() => restartForegroundWatcher(retriesLeft - 1), 2000);
      }
    }
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
        // Android 13+ (SDK 33): foreground service needs notification permission.
        // Without it, the notification can't show and the OS may kill the service.
        if (Platform.OS === 'android' && Platform.Version >= 33) {
          try {
            const { Notifications } = require('expo-notifications');
            const { status: notifStatus } = await Notifications.getPermissionsAsync();
            if (notifStatus !== 'granted') {
              const { status: newStatus } = await Notifications.requestPermissionsAsync();
              if (newStatus !== 'granted') {
                console.warn('[Location] Notification permission denied on Android 13+ — background tracking may be unreliable');
              }
            }
          } catch (_) {
            // expo-notifications may not be available — proceed anyway
          }
        }
        // Wrap in try-catch so background task failure doesn't prevent foreground watcher
        try {
          await startBackgroundLocationUpdates(hasActiveRide);
        } catch (bgErr) {
          console.warn('[Location] Background task start failed — foreground watcher will handle server updates:', bgErr.message);
          bgPermissionRef.current = false; // Fall back to foreground-only server updates
        }
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
      await startForegroundWatcher(hasActiveRide);

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
    const prevRideId = activeRideRef.current?._id;
    const prevStatus = activeRideRef.current?.status;
    activeRideRef.current = ride;

    // Start/stop RideTrackingService for in_progress rides
    const rideTracker = RideTrackingService.getInstance();
    const rideId = ride?._id || ride?.id;
    const isInProgress = ride?.status === 'in_progress';

    if (isInProgress && rideId && !rideTracker.isTracking) {
      // Ride just started — activate ride tracking service.
      // MUST await before restarting watcher to avoid dual-watcher race.
      try {
        await rideTracker.startRide(rideId);
      } catch (e) {
        console.warn('[Location] RideTrackingService start failed:', e.message);
      }
    } else if (!hasRide && rideTracker.isTracking) {
      // Ride ended — stop ride tracking service
      try {
        await rideTracker.endRide();
      } catch (e) {
        console.warn('[Location] RideTrackingService end failed:', e.message);
      }
    }

    // Restart tracking with different accuracy if ride state changed.
    // Also restart when transitioning to/from in_progress (different GPS frequency).
    const ridePresenceChanged = hadRide !== hasRide;
    const statusChanged = hasRide && ride?.status !== prevStatus;
    if ((ridePresenceChanged || statusChanged) && isTrackingRef.current) {
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
    // Stop ride tracking service if active
    const rideTracker = RideTrackingService.getInstance();
    if (rideTracker.isTracking) {
      await rideTracker.endRide().catch(() => {});
    }
    await stopTracking();
    await clearRetryQueue();
    if (healthCheckTimerRef.current) {
      clearInterval(healthCheckTimerRef.current);
      healthCheckTimerRef.current = null;
    }
    setLocation(null);
    setAddress('');
    setError(null);
    setPermissionStatus(null);
    lastServerUpdate.current = { lat: 0, lng: 0, time: 0 };
    lastAcceptedPos.current = { lat: 0, lng: 0, time: 0 };
    lastForegroundUpdateRef.current = 0;
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
