/**
 * usePermissionMonitor — Watches location permission during active ride.
 *
 * Checks every 10 seconds + on every AppState change (foreground return).
 * If permission is downgraded/revoked mid-ride:
 *   1. Alerts driver with options (open settings or end trip)
 *   2. Notifies server that tracking is degraded
 *
 * iOS/Android can silently revoke permission at any time.
 */
import { useEffect, useRef } from 'react';
import { Alert, AppState, Linking } from 'react-native';
import * as Location from 'expo-location';
import { driverAPI } from '../services/api';

const CHECK_INTERVAL_MS = 10000; // 10 seconds

/**
 * @param {boolean} isRideActive - true when driver has an in_progress ride
 * @param {string|null} rideId - current ride ID
 * @param {Function} onPermissionLost - callback when permission is lost
 */
export default function usePermissionMonitor(isRideActive, rideId, onPermissionLost) {
  const lastPermissionRef = useRef(null);
  const alertShownRef = useRef(false);

  useEffect(() => {
    if (!isRideActive) {
      lastPermissionRef.current = null;
      alertShownRef.current = false;
      return;
    }

    const checkPermission = async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();

        // Detect permission downgrade
        if (
          lastPermissionRef.current === 'granted' &&
          status !== 'granted' &&
          !alertShownRef.current
        ) {
          alertShownRef.current = true;

          Alert.alert(
            'Location Permission Required',
            'Trip tracking requires location access. Without it, the passenger cannot see your position.',
            [
              {
                text: 'Open Settings',
                onPress: () => {
                  Linking.openSettings();
                  alertShownRef.current = false;
                },
              },
              {
                text: 'Continue Anyway',
                style: 'cancel',
                onPress: () => {
                  alertShownRef.current = false;
                },
              },
            ],
            { cancelable: false },
          );

          // Notify server
          if (rideId) {
            driverAPI.updateLocation({
              latitude: 0,
              longitude: 0,
              trackingDegraded: true,
              reason: 'permission_lost',
            }).catch(() => {});
          }

          onPermissionLost?.();
        }

        // Detect permission restore
        if (
          lastPermissionRef.current !== null &&
          lastPermissionRef.current !== 'granted' &&
          status === 'granted'
        ) {
          alertShownRef.current = false;
        }

        lastPermissionRef.current = status;
      } catch (e) {
        // Permission check failed — don't alert
      }
    };

    // Initial check
    checkPermission();

    // Periodic check
    const interval = setInterval(checkPermission, CHECK_INTERVAL_MS);

    // Check on foreground return
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        checkPermission();
      }
    });

    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [isRideActive, rideId, onPermissionLost]);
}
