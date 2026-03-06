import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { haversineKm } from '../utils/distance';

// ─── Constants ───────────────────────────────────────────────────────────────

export const BACKGROUND_LOCATION_TASK = 'driver-background-location';

// Batching: accumulate points, flush every N points or M seconds
const BATCH_SIZE = 5;
const BATCH_FLUSH_INTERVAL_MS = 30000; // 30s max hold time

// Speed limits (km/h) — anything above is rejected as implausible
const MAX_SPEED_KMH = 200;
// [L10 FIX] Relaxed from 100m to 150m — urban canyon effect causes 50-100m error
const MIN_ACCURACY_METERS = 150;

// Retry queue
const RETRY_QUEUE_KEY = 'bg_location_retry_queue';
const MAX_RETRY_QUEUE_SIZE = 200;
const RETRY_FLUSH_INTERVAL_MS = 60000; // attempt flush every 60s

// API
const getApiUrl = () => process.env.EXPO_PUBLIC_API_URL || '';

// ─── In-memory state (persists across background invocations within same process) ─

let locationBatch = [];
let lastFlushedAt = Date.now();
let lastValidLocation = null; // { latitude, longitude, timestamp }
let retryFlushTimer = null;

// ─── Spoofing detection (client-side heuristics) ─────────────────────────────

function isSpoofed(coords) {
  // 1. Android: check if location is from mock provider
  if (Platform.OS === 'android' && coords.mocked) {
    console.warn('[BgLocation] Mock location detected');
    return true;
  }

  // 2. Accuracy too poor — likely spoofed or indoor
  if (coords.accuracy && coords.accuracy > MIN_ACCURACY_METERS) {
    return true;
  }

  // 3. Perfectly round coordinates (0 decimal places) are suspicious
  const latStr = String(coords.latitude);
  const lngStr = String(coords.longitude);
  if (!latStr.includes('.') || !lngStr.includes('.')) {
    return true;
  }

  // 4. Altitude anomaly: altitude of exactly 0 with high accuracy is suspicious on Android
  if (
    Platform.OS === 'android' &&
    coords.altitude === 0 &&
    coords.accuracy < 5
  ) {
    return true;
  }

  return false;
}

// ─── Speed validation ────────────────────────────────────────────────────────

function isSpeedValid(coords, timestamp) {
  if (!lastValidLocation) return true;

  const timeDeltaSec = (timestamp - lastValidLocation.timestamp) / 1000;
  if (timeDeltaSec < 1) return true; // too close in time to judge

  const distKm = haversineKm(
    lastValidLocation.latitude,
    lastValidLocation.longitude,
    coords.latitude,
    coords.longitude,
  );
  const speedKmh = (distKm / timeDeltaSec) * 3600;

  if (speedKmh > MAX_SPEED_KMH) {
    console.warn(
      `[BgLocation] Speed ${speedKmh.toFixed(0)} km/h exceeds limit — skipping`,
    );
    return false;
  }

  return true;
}

// ─── Retry queue (persisted via SecureStore) ─────────────────────────────────

async function enqueueForRetry(batch) {
  try {
    const raw = await SecureStore.getItemAsync(RETRY_QUEUE_KEY);
    let queue = raw ? JSON.parse(raw) : [];
    queue.push(...batch);
    // Cap size to prevent unbounded growth
    if (queue.length > MAX_RETRY_QUEUE_SIZE) {
      queue = queue.slice(-MAX_RETRY_QUEUE_SIZE);
    }
    await SecureStore.setItemAsync(RETRY_QUEUE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.warn('[BgLocation] Failed to persist retry queue:', e.message);
  }
}

async function flushRetryQueue(token) {
  try {
    const raw = await SecureStore.getItemAsync(RETRY_QUEUE_KEY);
    if (!raw) return;
    const queue = JSON.parse(raw);
    if (queue.length === 0) return;

    const success = await sendBatchToServer(queue, token);
    if (success) {
      await SecureStore.deleteItemAsync(RETRY_QUEUE_KEY);
    }
  } catch (e) {
    console.warn('[BgLocation] Retry flush failed:', e.message);
  }
}

// ─── Server communication ────────────────────────────────────────────────────

async function sendBatchToServer(batch, token) {
  try {
    const response = await fetch(`${getApiUrl()}/drivers/location/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ locations: batch }),
    });

    if (response.status === 401) {
      // Token expired — re-queue batch so it can be sent after foreground re-auth
      console.warn('[BgLocation] Token expired (401), re-queuing batch');
      return false; // return false so the batch is preserved in retry queue
    }

    return response.ok;
  } catch (e) {
    console.warn('[BgLocation] Network error sending batch:', e.message);
    return false;
  }
}

async function flushBatch() {
  if (locationBatch.length === 0) return;

  const batch = [...locationBatch];
  locationBatch = [];
  lastFlushedAt = Date.now();

  try {
    const token = await SecureStore.getItemAsync('token');
    if (!token) return;

    // Send current batch first (fresh data has priority over stale retries)
    const success = await sendBatchToServer(batch, token);
    if (!success) {
      await enqueueForRetry(batch);
    }

    // Then drain retry queue
    await flushRetryQueue(token);
  } catch (e) {
    await enqueueForRetry(batch);
  }
}

// ─── TaskManager task definition ─────────────────────────────────────────────
// IMPORTANT: This must be called at module load time (outside any component).

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.error('[BgLocation] Task error:', error.message);
    return;
  }

  if (!data?.locations?.length) return;

  for (const loc of data.locations) {
    const { coords, timestamp } = loc;

    // 1. Spoofing check
    if (isSpoofed(coords)) {
      console.warn('[BgLocation] Spoofed location rejected');
      continue;
    }

    // 2. Speed validation
    if (!isSpeedValid(coords, timestamp)) {
      continue;
    }

    // 3. Accept and record
    lastValidLocation = {
      latitude: coords.latitude,
      longitude: coords.longitude,
      timestamp,
    };

    locationBatch.push({
      latitude: coords.latitude,
      longitude: coords.longitude,
      heading: coords.heading ?? null,
      speed: coords.speed ?? null,
      accuracy: coords.accuracy ?? null,
      timestamp,
    });
  }

  // Flush if batch full or timer expired
  const timeSinceFlush = Date.now() - lastFlushedAt;
  if (
    locationBatch.length >= BATCH_SIZE ||
    timeSinceFlush >= BATCH_FLUSH_INTERVAL_MS
  ) {
    await flushBatch();
  }
});

// ─── Start / Stop helpers (called from LocationContext) ──────────────────────

export async function startBackgroundLocationUpdates(hasActiveRide = false) {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(
    BACKGROUND_LOCATION_TASK,
  );
  if (isRegistered) {
    // Already running — just update accuracy if ride state changed
    await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(
      () => {},
    );
  }

  await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
    accuracy: hasActiveRide
      ? Location.Accuracy.High
      : Location.Accuracy.Balanced,
    timeInterval: hasActiveRide ? 3000 : 10000,
    distanceInterval: hasActiveRide ? 5 : 15,
    deferredUpdatesInterval: hasActiveRide ? 3000 : 15000,
    deferredUpdatesDistance: hasActiveRide ? 5 : 15,
    showsBackgroundLocationIndicator: true, // iOS blue bar
    foregroundService: {
      notificationTitle: 'Lulini Driver',
      notificationBody: hasActiveRide
        ? 'Navigating to passenger...'
        : 'You are online and receiving ride requests',
      notificationColor: '#171717',
    },
    // iOS: pause when stationary to save battery
    pausesUpdatesAutomatically: !hasActiveRide,
    activityType: Location.ActivityType.AutomotiveNavigation,
  });

  // [C6 FIX] Always clear existing timer before creating new one to prevent duplicates
  if (retryFlushTimer) {
    clearInterval(retryFlushTimer);
  }
  retryFlushTimer = setInterval(async () => {
    try {
      const token = await SecureStore.getItemAsync('token');
      if (token) await flushRetryQueue(token);
    } catch (_) {}
  }, RETRY_FLUSH_INTERVAL_MS);
}

export async function stopBackgroundLocationUpdates() {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(
      BACKGROUND_LOCATION_TASK,
    );
    if (isRegistered) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    }
  } catch (e) {
    console.warn('[BgLocation] Stop error:', e.message);
  }

  // Flush remaining points
  await flushBatch();

  // Stop retry timer
  if (retryFlushTimer) {
    clearInterval(retryFlushTimer);
    retryFlushTimer = null;
  }

  lastValidLocation = null;
}

export async function clearRetryQueue() {
  await SecureStore.deleteItemAsync(RETRY_QUEUE_KEY).catch(() => {});
  locationBatch = [];
  lastValidLocation = null;
}
