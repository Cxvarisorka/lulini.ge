/**
 * mapSafety — Defensive utilities for react-native-maps native bridge calls.
 *
 * Prevents NSInvalidArgumentException on iOS and native crashes on Android
 * caused by NaN, Infinity, out-of-range, or zero-area coordinate arguments.
 *
 * Usage:
 *   import { safeFitToCoordinates, safeAnimateToRegion, safeCoord } from '../utils/mapSafety';
 *   safeFitToCoordinates(mapRef, coords, options);
 */

/**
 * Returns true if `n` is a real finite number (not NaN, Infinity, undefined, null).
 */
function isNum(n) {
  return typeof n === 'number' && isFinite(n);
}

/**
 * Validate a single coordinate object.
 * Returns a sanitized { latitude, longitude } or null if invalid.
 */
export function safeCoord(coord) {
  if (!coord) return null;
  const lat = coord.latitude;
  const lng = coord.longitude;
  if (!isNum(lat) || !isNum(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  // Null-island check (perfectly 0,0 is almost certainly invalid GPS)
  if (lat === 0 && lng === 0) return null;
  return { latitude: lat, longitude: lng };
}

/**
 * Filter and validate an array of coordinates.
 * Returns only the valid ones.
 */
export function safeCoords(coords) {
  if (!Array.isArray(coords)) return [];
  const result = [];
  for (let i = 0; i < coords.length; i++) {
    const c = safeCoord(coords[i]);
    if (c) result.push(c);
  }
  return result;
}

/**
 * Validate a region object { latitude, longitude, latitudeDelta, longitudeDelta }.
 * Returns sanitized region or null.
 */
export function safeRegion(region) {
  if (!region) return null;
  const lat = region.latitude;
  const lng = region.longitude;
  const latD = region.latitudeDelta;
  const lngD = region.longitudeDelta;
  if (!isNum(lat) || !isNum(lng) || !isNum(latD) || !isNum(lngD)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  if (latD <= 0 || lngD <= 0) return null;
  return { latitude: lat, longitude: lng, latitudeDelta: latD, longitudeDelta: lngD };
}

// Debounce state: prevents overlapping native map animations (iOS crash source)
let _lastFitTime = 0;
const MIN_FIT_INTERVAL_MS = 250;

/**
 * Safe wrapper around mapRef.current.fitToCoordinates().
 *
 * Guards against:
 *   - Null/deallocated mapRef
 *   - NaN/Infinity coordinates
 *   - Out-of-range lat/lng
 *   - Identical coordinates (zero-area MKMapRect → iOS crash)
 *   - Overlapping calls (debounced to 250ms)
 *   - Native exceptions (caught)
 *
 * @param {React.RefObject} mapRef
 * @param {Array} coordinates
 * @param {Object} [options]  - { edgePadding, animated }
 * @returns {boolean} true if the call was executed
 */
export function safeFitToCoordinates(mapRef, coordinates, options = {}) {
  if (!mapRef?.current) return false;

  const valid = safeCoords(coordinates);
  if (valid.length < 2) {
    // Single point: use animateToRegion instead (fitToCoordinates needs 2+ distinct points)
    if (valid.length === 1) {
      return safeAnimateToRegion(mapRef, {
        ...valid[0],
        latitudeDelta: 0.015,
        longitudeDelta: 0.015,
      }, 300);
    }
    return false;
  }

  // Check if all points are identical (or nearly) — pad to avoid zero-area rect
  let allSame = true;
  for (let i = 1; i < valid.length; i++) {
    if (
      Math.abs(valid[i].latitude - valid[0].latitude) > 0.00005 ||
      Math.abs(valid[i].longitude - valid[0].longitude) > 0.00005
    ) {
      allSame = false;
      break;
    }
  }
  if (allSame) {
    // Pad by ~100m to create a visible rect
    valid.push({
      latitude: valid[0].latitude + 0.001,
      longitude: valid[0].longitude + 0.001,
    });
  }

  // Debounce: avoid overlapping native animations
  const now = Date.now();
  if (now - _lastFitTime < MIN_FIT_INTERVAL_MS) return false;
  _lastFitTime = now;

  try {
    mapRef.current.fitToCoordinates(valid, {
      edgePadding: options.edgePadding || { top: 80, right: 50, bottom: 250, left: 50 },
      animated: options.animated !== false,
    });
    return true;
  } catch (e) {
    if (__DEV__) console.warn('[mapSafety] fitToCoordinates failed:', e.message);
    return false;
  }
}

/**
 * Safe wrapper around mapRef.current.animateToRegion().
 *
 * @param {React.RefObject} mapRef
 * @param {Object} region - { latitude, longitude, latitudeDelta, longitudeDelta }
 * @param {number} [duration=300]
 * @returns {boolean}
 */
export function safeAnimateToRegion(mapRef, region, duration = 300) {
  if (!mapRef?.current) return false;

  const safe = safeRegion(region);
  if (!safe) return false;

  try {
    mapRef.current.animateToRegion(safe, duration);
    return true;
  } catch (e) {
    if (__DEV__) console.warn('[mapSafety] animateToRegion failed:', e.message);
    return false;
  }
}

/**
 * Filter polyline coordinates — removes any invalid points.
 * Use before passing to <Polyline coordinates={...} />.
 */
export function safePolyline(coords) {
  if (!Array.isArray(coords)) return [];
  const valid = safeCoords(coords);
  return valid.length >= 2 ? valid : [];
}
