/**
 * RideTrackingService — Singleton that manages the full ride tracking lifecycle.
 *
 * Lives OUTSIDE the React component tree. Screen navigation, component unmounts,
 * and context changes do NOT affect it. React components subscribe via callbacks.
 *
 * Owns:
 *   - LocationThrottle (time + distance filtering)
 *   - LocationHeartbeat (30s stationary keepalive)
 *   - LocationBuffer (disk-backed, survives app kill)
 *   - Foreground location subscription (high-frequency UI updates)
 *   - Ride state machine (persisted to AsyncStorage)
 *
 * Does NOT own:
 *   - Background task (owned by TaskManager — defined at module scope)
 *   - Socket connection (owned by SocketContext — we call into it)
 *   - React state (components subscribe here)
 */
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import LocationThrottle from './LocationThrottle';
import LocationHeartbeat from './LocationHeartbeat';
import LocationBuffer from './LocationBuffer';
import {
  persistRideState,
  persistRideConfig,
  readRideState,
  clearAllRideData,
} from './rideStorage';
import { driverAPI, rideAPI } from './api';
import { BACKGROUND_LOCATION_TASK } from './backgroundLocation';

// ─── Singleton ──────────────────────────────────────────────────────────────

let _instance = null;

export default class RideTrackingService {
  static getInstance() {
    if (!_instance) {
      _instance = new RideTrackingService();
    }
    return _instance;
  }

  constructor() {
    if (_instance) {
      throw new Error('Use RideTrackingService.getInstance()');
    }
    this.rideId = null;
    this.isTracking = false;
    this.throttle = null;
    this.heartbeat = null;
    this.buffer = null;
    this._listeners = new Set();
    this._socketEmitFn = null; // Set by SocketContext integration
  }

  // ─── Socket integration ─────────────────────────────────────────────────

  /**
   * Set the function used to emit location updates via socket.
   * Called by SocketContext when socket connects.
   * @param {Function|null} fn - (eventName, data) => void
   */
  setSocketEmitter(fn) {
    this._socketEmitFn = fn;
  }

  // ─── Start ride tracking ────────────────────────────────────────────────

  /**
   * Start tracking for an active ride (in_progress).
   * Called when driver taps "Start Ride" and server confirms.
   *
   * @param {string} rideId
   * @param {Object} opts
   * @param {boolean} opts.isRecovery - true if recovering after app restart
   */
  async startRide(rideId, { isRecovery = false } = {}) {
    if (this.isTracking && this.rideId === rideId) {
      return; // Already tracking this ride
    }

    this.rideId = rideId;
    this.isTracking = true;

    // Initialize components
    this.throttle = new LocationThrottle({ minTimeMs: 3000, minDistanceM: 10 });
    this.buffer = new LocationBuffer(rideId);
    this.heartbeat = new LocationHeartbeat((data) => {
      // Send heartbeat via REST (socket may not be available)
      this._sendHeartbeat(data);
    });
    this.heartbeat.start();

    // Persist ride state to disk (survives app kill)
    const serverUrl = process.env.EXPO_PUBLIC_API_URL || 'https://api.lulini.ge/api';
    const authToken = await SecureStore.getItemAsync('token');
    await persistRideConfig(serverUrl, authToken);
    await persistRideState({
      rideId,
      status: 'active',
      startedAt: Date.now(),
      serverConfirmed: !isRecovery,
    });

    // NOTE: No foreground watcher here — LocationContext owns the single GPS
    // subscription and pipes updates via ingestLocation(). This eliminates
    // the dual-watcher conflict that caused silent watcher death on Android OEMs.

    // Ensure background task is running with ride-active params
    try {
      const isRunning = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK)
        .catch(() => false);

      // Restart with ride-active params if not running or if params need update
      if (!isRunning) {
        await this._startBackgroundTask();
      }
    } catch (e) {
      console.warn('[RideTracking] Background task check failed:', e.message);
    }

    // Register significant location change monitoring (iOS crash recovery)
    if (Platform.OS === 'ios') {
      this._registerSignificantChangeMonitoring();
    }

    // If recovering, flush any buffered locations from before the kill
    if (isRecovery) {
      this._flushBuffer();
    }

    this._notifyListeners({ type: 'rideStarted', rideId });
  }

  // ─── End ride tracking ──────────────────────────────────────────────────

  async endRide() {
    if (!this.isTracking) return;

    const rideId = this.rideId;
    this.isTracking = false;

    // Stop heartbeat
    this.heartbeat?.stop();
    this.heartbeat = null;

    // NOTE: No foreground watcher to stop — LocationContext owns it.

    // Flush remaining buffer to server
    if (this.buffer) {
      await this._flushBuffer();
      await this.buffer.clear();
    }

    // Stop iOS significant change monitoring
    if (Platform.OS === 'ios') {
      this._stopSignificantChangeMonitoring();
    }

    // Clear persisted ride state
    await clearAllRideData(rideId);

    // Reset
    this.rideId = null;
    this.throttle = null;
    this.buffer = null;
    this._notifyListeners({ type: 'rideEnded', rideId });
  }

  // ─── Public: receive location from LocationContext ───────────────────────

  /**
   * Called by LocationContext's single foreground watcher on every GPS tick.
   * This replaces the old duplicate watchPositionAsync that lived here.
   * @param {{ latitude, longitude, heading, speed, accuracy }} coords
   */
  ingestLocation(coords) {
    if (!this.isTracking) return;
    this._onForegroundLocation({
      coords: {
        latitude: coords.latitude,
        longitude: coords.longitude,
        heading: coords.heading ?? null,
        speed: coords.speed ?? null,
        accuracy: coords.accuracy ?? null,
      },
      timestamp: Date.now(),
    });
  }

  // ─── Foreground location handler ────────────────────────────────────────

  _onForegroundLocation(rawLocation) {
    const point = {
      lat: rawLocation.coords.latitude,
      lng: rawLocation.coords.longitude,
      heading: rawLocation.coords.heading ?? null,
      speed: rawLocation.coords.speed ?? null,
      accuracy: rawLocation.coords.accuracy ?? null,
      ts: rawLocation.timestamp,
    };

    // Classify GPS quality
    const accuracy = point.accuracy;
    if (accuracy != null && accuracy > 150) {
      point.qualityTier = 'poor';
      point.displayInhibit = true;
    } else if (accuracy != null && accuracy > 20) {
      point.qualityTier = 'degraded';
    } else {
      point.qualityTier = 'good';
    }

    // Update heartbeat with latest position
    this.heartbeat?.updateLocation(point);

    // Notify subscribed React components (for UI: map marker, heading)
    this._notifyListeners({ type: 'location', ...point });

    // Throttle before sending to server
    if (this.throttle && this.throttle.shouldSend(point)) {
      // Send via socket (real-time) — volatile, drop if can't send
      this._emitViaSocket('ride:location', {
        ...point,
        rideId: this.rideId,
      });

      // Also send via REST (persistent delivery)
      driverAPI.updateLocation({
        latitude: point.lat,
        longitude: point.lng,
        heading: point.heading,
      }).catch(() => {});

      // Append to buffer for offline/gap scenarios
      if (this.buffer) {
        this.buffer.append([point]);
      }
    }
  }

  // ─── Background task integration ────────────────────────────────────────

  /**
   * Called from the TaskManager background task (module scope).
   * Processes locations when the app is backgrounded/killed.
   * @param {Array} locations - raw expo-location data
   */
  static async processBackgroundLocations(locations) {
    const service = RideTrackingService.getInstance();
    if (!service.isTracking || !service.rideId) return;

    const points = locations.map((loc) => ({
      lat: loc.coords.latitude,
      lng: loc.coords.longitude,
      heading: loc.coords.heading ?? null,
      speed: loc.coords.speed ?? null,
      accuracy: loc.coords.accuracy ?? null,
      ts: loc.timestamp,
      rideId: service.rideId,
    }));

    // Append to disk buffer
    if (service.buffer) {
      service.buffer.append(points);
      await service.buffer.flushToDisk();
    }
  }

  // ─── Subscription for React components ──────────────────────────────────

  /**
   * Subscribe to ride tracking events.
   * @param {Function} callback - ({ type, ...data }) => void
   * @returns {Function} unsubscribe function
   */
  subscribe(callback) {
    this._listeners.add(callback);
    return () => this._listeners.delete(callback);
  }

  _notifyListeners(data) {
    this._listeners.forEach((cb) => {
      try {
        cb(data);
      } catch (e) {
        // Don't let subscriber errors break the service
      }
    });
  }

  // ─── Helper: emit via socket ────────────────────────────────────────────

  _emitViaSocket(event, data) {
    if (this._socketEmitFn) {
      try {
        this._socketEmitFn(event, data);
      } catch (_) {}
    }
  }

  // ─── Helper: send heartbeat via REST ────────────────────────────────────

  async _sendHeartbeat(data) {
    if (!this.rideId) return;
    try {
      await driverAPI.updateLocation({
        latitude: data.lat,
        longitude: data.lng,
        heading: data.heading,
        heartbeat: true,
      });
    } catch (_) {}
  }

  // ─── Helper: flush buffer to server ─────────────────────────────────────

  async _flushBuffer() {
    if (!this.buffer || !this.rideId) return;

    const rideId = this.rideId;
    await this.buffer.flushToServer(async (chunk, meta) => {
      try {
        const response = await rideAPI.sendLocationBatch(rideId, chunk, meta);
        return response.status >= 200 && response.status < 300;
      } catch (e) {
        return false;
      }
    });
  }

  // ─── Helper: start background location task ─────────────────────────────

  async _startBackgroundTask() {
    try {
      // Check if already running — don't restart to avoid gaps
      const isRunning = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK)
        .catch(() => false);
      if (isRunning) {
        await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
        await new Promise((r) => setTimeout(r, 100));
      }

      await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
        accuracy: Location.Accuracy.High,
        distanceInterval: 5,
        timeInterval: 3000,
        deferredUpdatesInterval: 3000,
        deferredUpdatesDistance: 5,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: 'Lulini Driver',
          notificationBody: 'Trip in progress — navigating to destination',
          notificationColor: '#171717',
        },
        pausesLocationUpdatesAutomatically: false,
        activityType: Location.ActivityType.AutomotiveNavigation,
      });
    } catch (e) {
      console.warn('[RideTracking] Background task start failed:', e.message);
    }
  }

  // ─── iOS significant change monitoring ──────────────────────────────────

  async _registerSignificantChangeMonitoring() {
    try {
      const taskName = 'SIGNIFICANT_CHANGE_RECOVERY';
      const isRunning = await Location.hasStartedLocationUpdatesAsync(taskName)
        .catch(() => false);
      if (!isRunning) {
        await Location.startLocationUpdatesAsync(taskName, {
          accuracy: Location.Accuracy.Low,
          distanceInterval: 100,
          showsBackgroundLocationIndicator: true,
          pausesLocationUpdatesAutomatically: false,
        });
      }
    } catch (e) {
      // Non-critical — just a safety net
      console.warn('[RideTracking] Significant change registration failed:', e.message);
    }
  }

  async _stopSignificantChangeMonitoring() {
    try {
      const taskName = 'SIGNIFICANT_CHANGE_RECOVERY';
      const isRunning = await Location.hasStartedLocationUpdatesAsync(taskName)
        .catch(() => false);
      if (isRunning) {
        await Location.stopLocationUpdatesAsync(taskName);
      }
    } catch (_) {}
  }

  // ─── Static: check if there's an active ride to recover ─────────────────

  /**
   * Check AsyncStorage for a persisted active ride.
   * Called on app start to determine if tracking should resume.
   */
  static async checkForActiveRide() {
    const state = await readRideState();
    if (!state || state.status === 'completed' || state.status === 'ending') {
      return null;
    }
    return state;
  }
}
