import * as SecureStore from 'expo-secure-store';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://api.lulini.ge/api';

// LRU-style cache with max size and TTL
const MAX_CACHE_ENTRIES = 50;
const DIRECTIONS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const directionsCache = new Map();

function cacheSet(cache, key, value) {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }
  cache.set(key, value);
}

// [H5 FIX] Periodic TTL cleanup to prevent memory growth
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of directionsCache) {
    if (now - entry._ts > DIRECTIONS_CACHE_TTL) {
      directionsCache.delete(key);
    }
  }
}, DIRECTIONS_CACHE_TTL);

async function getAuthToken() {
  try {
    return await SecureStore.getItemAsync('token');
  } catch {
    return null;
  }
}

/**
 * Get directions via server proxy, falls back to OSRM
 */
export async function getDirections(origin, destination) {
  const oLat = origin.latitude.toFixed(4);
  const oLng = origin.longitude.toFixed(4);
  const dLat = destination.latitude.toFixed(4);
  const dLng = destination.longitude.toFixed(4);
  const cacheKey = `${oLat},${oLng}-${dLat},${dLng}`;

  const cached = directionsCache.get(cacheKey);
  if (cached && (Date.now() - cached._ts < DIRECTIONS_CACHE_TTL)) {
    return cached;
  }

  try {
    const token = await getAuthToken();
    if (!token) return getDirectionsOSRM(origin, destination);

    const url = `${API_URL}/maps/directions?` +
      `originLat=${origin.latitude}&originLng=${origin.longitude}` +
      `&destLat=${destination.latitude}&destLng=${destination.longitude}`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();

    if (!data.success) return getDirectionsOSRM(origin, destination);

    const result = {
      distance: data.data.distance,
      duration: data.data.duration,
      distanceText: data.data.distanceText,
      durationText: data.data.durationText,
      polyline: data.data.polyline,
      _ts: Date.now(),
    };

    cacheSet(directionsCache, cacheKey, result);
    return result;
  } catch {
    return getDirectionsOSRM(origin, destination);
  }
}

/**
 * Get directions using OSRM (free fallback)
 */
export async function getDirectionsOSRM(origin, destination) {
  const cacheKey = `osrm:${origin.latitude.toFixed(4)},${origin.longitude.toFixed(4)}-${destination.latitude.toFixed(4)},${destination.longitude.toFixed(4)}`;

  const cached = directionsCache.get(cacheKey);
  if (cached && (Date.now() - cached._ts < DIRECTIONS_CACHE_TTL)) {
    return cached;
  }

  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}?overview=full&geometries=geojson`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.code !== 'Ok' || !data.routes?.length) return null;

    const route = data.routes[0];
    const result = {
      distance: route.distance / 1000,
      duration: Math.round(route.duration / 60),
      distanceText: `${(route.distance / 1000).toFixed(1)} km`,
      durationText: `${Math.round(route.duration / 60)} min`,
      polyline: route.geometry.coordinates.map(c => [c[1], c[0]]),
      _ts: Date.now(),
    };

    cacheSet(directionsCache, cacheKey, result);
    return result;
  } catch {
    return null;
  }
}
