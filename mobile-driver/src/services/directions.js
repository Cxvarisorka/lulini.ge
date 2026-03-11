/**
 * OSRM Navigation Service for Driver App
 * Provides turn-by-turn routing with step-by-step maneuver data
 */

// Cache for route results (bounded LRU)
const routeCache = new Map();
const CACHE_TTL = 300000; // 5 minutes
const MAX_CACHE_ENTRIES = 50;

// Lazy TTL cleanup — called on cache access instead of a module-level setInterval.
// Prevents leaked intervals on hot reload and avoids unnecessary CPU usage.
let lastCleanup = Date.now();
function cleanupExpiredEntries() {
  const now = Date.now();
  if (now - lastCleanup < CACHE_TTL) return; // at most once per TTL period
  lastCleanup = now;
  for (const [key, entry] of routeCache) {
    if (now - entry.timestamp > CACHE_TTL) {
      routeCache.delete(key);
    }
  }
}

/**
 * Fetch OSRM route with full step-by-step maneuver data
 * @param {Object} origin - { latitude, longitude }
 * @param {Object} destination - { latitude, longitude }
 * @returns {Promise<Object|null>}
 */
export async function getNavigationRoute(origin, destination) {
  // Lazy cleanup instead of module-level setInterval
  cleanupExpiredEntries();

  const cacheKey = `${origin.latitude.toFixed(5)},${origin.longitude.toFixed(5)}-${destination.latitude.toFixed(5)},${destination.longitude.toFixed(5)}`;

  const cached = routeCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}?overview=full&geometries=geojson&steps=true`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.code !== 'Ok' || !data.routes?.length) {
      return null;
    }

    const route = data.routes[0];
    const leg = route.legs[0];

    // GeoJSON [lng, lat] -> [lat, lng] for Leaflet
    const polyline = route.geometry.coordinates.map(coord => [coord[1], coord[0]]);

    const steps = leg.steps.map((step, index) => ({
      index,
      maneuver: {
        type: step.maneuver.type,
        modifier: step.maneuver.modifier || null,
        location: [step.maneuver.location[1], step.maneuver.location[0]], // [lat, lng]
      },
      name: step.name || '',
      distance: step.distance, // meters
      duration: step.duration, // seconds
      geometry: step.geometry.coordinates.map(c => [c[1], c[0]]),
    }));

    const result = {
      distance: route.distance,
      duration: route.duration,
      distanceText: formatDistance(route.distance),
      durationText: formatDuration(route.duration),
      polyline,
      steps,
    };

    // LRU eviction when cache exceeds max
    if (routeCache.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = routeCache.keys().next().value;
      routeCache.delete(oldestKey);
    }
    routeCache.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
  } catch (error) {
    // Failed to fetch navigation route
    return null;
  }
}

/**
 * Format distance in meters to human-readable
 */
export function formatDistance(meters) {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

/**
 * Format duration in seconds to human-readable
 */
export function formatDuration(seconds) {
  if (seconds < 60) {
    return `${Math.round(seconds)} sec`;
  }
  const mins = Math.round(seconds / 60);
  if (mins < 60) {
    return `${mins} min`;
  }
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return `${hours}h ${remainingMins}m`;
}


/**
 * Get Ionicons name for a maneuver type/modifier
 */
export function getManeuverIcon(type, modifier) {
  if (type === 'depart') return 'navigate';
  if (type === 'arrive') return 'flag';
  if (type === 'roundabout' || type === 'rotary') return 'refresh';

  switch (modifier) {
    case 'left':
      return 'arrow-back';
    case 'sharp left':
      return 'return-down-back';
    case 'slight left':
      return 'arrow-back';
    case 'right':
      return 'arrow-forward';
    case 'sharp right':
      return 'return-down-forward';
    case 'slight right':
      return 'arrow-forward';
    case 'uturn':
      return 'arrow-undo';
    case 'straight':
    default:
      return 'arrow-up';
  }
}

/**
 * Get human-readable instruction from OSRM step
 */
export function getManeuverInstruction(step, t) {
  const { type, modifier } = step.maneuver;
  const streetName = step.name;

  if (type === 'depart') {
    return t ? t('nav.depart', { street: streetName || '' }) : `Head on ${streetName || 'the road'}`;
  }
  if (type === 'arrive') {
    return t ? t('nav.arrive') : 'You have arrived';
  }

  const directionKey = modifier ? modifier.replace(/ /g, '_') : 'straight';

  if (t) {
    return streetName
      ? t(`nav.${directionKey}_onto`, { street: streetName })
      : t(`nav.${directionKey}`);
  }

  const directionText = modifier || 'straight';
  return streetName
    ? `Turn ${directionText} onto ${streetName}`
    : `Continue ${directionText}`;
}

/**
 * Clear the route cache
 */
export function clearRouteCache() {
  routeCache.clear();
}
