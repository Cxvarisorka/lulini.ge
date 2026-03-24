/**
 * rideStorage.js — Persistent ride state for background task survival.
 *
 * Uses AsyncStorage for disk persistence + module-level cache for fast reads.
 * The background task reads ride state from here instead of React state/context,
 * so it works even after the OS kills and restarts the process.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Module-level cache (survives within same process) ──────────────────────
let _rideStateCache = null;
let _rideConfigCache = null;
let _cacheLoaded = false;

// ─── Keys ───────────────────────────────────────────────────────────────────
const RIDE_STATE_KEY = '@ride:active';
const RIDE_CONFIG_KEY = '@ride:config';
const RIDE_BUFFER_PREFIX = '@ride:buffer:';

// ─── Ride state persistence ─────────────────────────────────────────────────

/**
 * Read ride state from cache (fast) or disk (on first call / after process restart).
 * Returns: { rideId, status, startedAt, serverConfirmed } or null
 */
export async function readRideState() {
  if (_cacheLoaded && _rideStateCache !== undefined) {
    return _rideStateCache;
  }
  try {
    const raw = await AsyncStorage.getItem(RIDE_STATE_KEY);
    _rideStateCache = raw ? JSON.parse(raw) : null;
    _cacheLoaded = true;
    return _rideStateCache;
  } catch (e) {
    console.warn('[RideStorage] Failed to read ride state:', e.message);
    return null;
  }
}

/**
 * Persist ride state to disk + update cache.
 * Call at every state transition: starting → active → ending → null
 */
export async function persistRideState(state) {
  _rideStateCache = state;
  _cacheLoaded = true;
  try {
    if (state === null) {
      await AsyncStorage.removeItem(RIDE_STATE_KEY);
    } else {
      await AsyncStorage.setItem(RIDE_STATE_KEY, JSON.stringify(state));
    }
  } catch (e) {
    console.warn('[RideStorage] Failed to persist ride state:', e.message);
  }
}

/**
 * Read cached ride state synchronously (returns cached value or null).
 * Use only when you know loadCache() has been called.
 */
export function readRideStateSync() {
  return _rideStateCache || null;
}

// ─── Ride config (auth + server URL for background task) ────────────────────

/**
 * Persist server URL and auth token so background task can make REST calls.
 */
export async function persistRideConfig(serverUrl, authToken) {
  const config = { serverUrl, authToken, updatedAt: Date.now() };
  _rideConfigCache = config;
  try {
    await AsyncStorage.setItem(RIDE_CONFIG_KEY, JSON.stringify(config));
  } catch (e) {
    console.warn('[RideStorage] Failed to persist ride config:', e.message);
  }
}

export async function readRideConfig() {
  if (_rideConfigCache) return _rideConfigCache;
  try {
    const raw = await AsyncStorage.getItem(RIDE_CONFIG_KEY);
    _rideConfigCache = raw ? JSON.parse(raw) : null;
    return _rideConfigCache;
  } catch (e) {
    console.warn('[RideStorage] Failed to read ride config:', e.message);
    return null;
  }
}

export async function clearRideConfig() {
  _rideConfigCache = null;
  try {
    await AsyncStorage.removeItem(RIDE_CONFIG_KEY);
  } catch (e) {
    // ignore
  }
}

// ─── Clear all ride data (on ride end or logout) ────────────────────────────

export async function clearAllRideData(rideId) {
  _rideStateCache = null;
  _rideConfigCache = null;
  _cacheLoaded = true;
  const keys = [RIDE_STATE_KEY, RIDE_CONFIG_KEY];
  if (rideId) {
    keys.push(`${RIDE_BUFFER_PREFIX}${rideId}`);
  }
  try {
    await AsyncStorage.multiRemove(keys);
  } catch (e) {
    console.warn('[RideStorage] Failed to clear ride data:', e.message);
  }
}

// ─── Pre-load cache (call on app start) ─────────────────────────────────────

export async function loadCache() {
  try {
    const [stateRaw, configRaw] = await AsyncStorage.multiGet([
      RIDE_STATE_KEY,
      RIDE_CONFIG_KEY,
    ]);
    _rideStateCache = stateRaw[1] ? JSON.parse(stateRaw[1]) : null;
    _rideConfigCache = configRaw[1] ? JSON.parse(configRaw[1]) : null;
    _cacheLoaded = true;
  } catch (e) {
    console.warn('[RideStorage] Cache preload failed:', e.message);
    _cacheLoaded = true;
  }
}

// ─── Buffer key helpers (used by LocationBuffer) ────────────────────────────

export const getBufferKey = (rideId) => `${RIDE_BUFFER_PREFIX}${rideId}`;

export { AsyncStorage };
