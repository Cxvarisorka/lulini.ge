/**
 * useRideRecovery — Recovers active ride tracking on app start.
 *
 * Runs once on mount. Checks AsyncStorage for persisted ride state.
 * If an active ride is found:
 *   1. Validates with server (is ride still in_progress?)
 *   2. Restarts tracking if needed
 *   3. Flushes any buffered locations from before the kill
 *
 * If the server says ride is completed/cancelled, cleans up local state.
 */
import { useEffect, useRef } from 'react';
import * as Location from 'expo-location';
import RideTrackingService from '../services/RideTrackingService';
import { readRideState, clearAllRideData, loadCache } from '../services/rideStorage';
import { rideAPI } from '../services/api';
import { BACKGROUND_LOCATION_TASK } from '../services/backgroundLocation';
import LocationBuffer from '../services/LocationBuffer';

/**
 * @param {Function} onRideRecovered - (rideState) => void — called when active ride found
 * @param {Function} onNoRide - () => void — called when no ride to recover
 */
export default function useRideRecovery(onRideRecovered, onNoRide) {
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    (async () => {
      try {
        // Pre-load cache from AsyncStorage
        await loadCache();

        const rideState = await readRideState();
        if (!rideState || rideState.status === 'completed' || rideState.status === 'ending') {
          onNoRide?.();
          return;
        }

        // Check permissions first
        const { status: fgStatus } = await Location.getForegroundPermissionsAsync();
        if (fgStatus !== 'granted') {
          // Can't track — clean up and notify
          await clearAllRideData(rideState.rideId);
          onNoRide?.();
          return;
        }

        // Validate with server (5s timeout — don't block app start forever)
        let serverStatus = null;
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);
          const response = await rideAPI.getRideById(rideState.rideId);
          clearTimeout(timeoutId);
          serverStatus = response.data?.data?.ride?.status;
        } catch (e) {
          // Network unavailable — assume ride still active (safe default)
          serverStatus = null;
        }

        // Server says ride is over — clean up
        if (serverStatus === 'completed' || serverStatus === 'cancelled') {
          // Flush any remaining buffer before cleanup
          const buffer = new LocationBuffer(rideState.rideId);
          await buffer.flushToServer(async (chunk) => {
            try {
              await rideAPI.sendLocationBatch(rideState.rideId, chunk, {});
              return true;
            } catch (_) {
              return false;
            }
          });

          // Stop background tracking if still running
          const isTracking = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK)
            .catch(() => false);
          if (isTracking) {
            await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
          }

          await clearAllRideData(rideState.rideId);
          onNoRide?.();
          return;
        }

        // Ride still active — restart tracking
        const service = RideTrackingService.getInstance();
        await service.startRide(rideState.rideId, { isRecovery: true });

        onRideRecovered?.(rideState);
      } catch (e) {
        console.warn('[RideRecovery] Recovery failed:', e.message);
        onNoRide?.();
      }
    })();
  }, [onRideRecovered, onNoRide]);
}
