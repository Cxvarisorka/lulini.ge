import Constants from 'expo-constants';
import api from './api';

const GOOGLE_MAPS_API_KEY = Constants.expoConfig?.extra?.googleMapsApiKey || '';

/**
 * Maps Services for React Native (Expo Go compatible)
 * Optimized for Georgia/Kutaisi address search
 *
 * Search: OSM Nominatim (primary) → Google Geocoding (backup)
 * Directions: Server proxy (primary) → OSRM (fallback) → Haversine (last resort)
 * Reverse geocode: Nominatim → Google
 */

// Nominatim rate limiting - max 1 request per second per usage policy
let lastNominatimRequest = 0;
const NOMINATIM_MIN_INTERVAL = 1000; // 1 second

// LRU-style cache with max size and TTL eviction
const MAX_CACHE_ENTRIES = 100;
const DIRECTIONS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const SEARCH_CACHE_TTL = 60000; // 1 minute

const directionsCache = new Map();
const searchCache = new Map();

function toFiniteNumber(value) {
  if (typeof value === 'number' && isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (isFinite(parsed)) return parsed;
  }
  return null;
}

function normalizeCoordinatePair(coord) {
  if (!coord) return null;
  const latitude = toFiniteNumber(coord.latitude);
  const longitude = toFiniteNumber(coord.longitude);
  if (latitude == null || longitude == null) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

// C8: Periodic TTL cleanup — use .unref() so the timer doesn't prevent JS engine cleanup
const _cacheCleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, value] of directionsCache) {
    if (now - (value._ts || 0) > DIRECTIONS_CACHE_TTL) directionsCache.delete(key);
  }
  for (const [key, value] of searchCache) {
    if (now - (value.timestamp || 0) > SEARCH_CACHE_TTL) searchCache.delete(key);
  }
}, 5 * 60 * 1000);
// In React Native, unref isn't available — but storing the reference allows explicit cleanup if needed
if (typeof _cacheCleanupInterval?.unref === 'function') _cacheCleanupInterval.unref();

// Evict oldest entries when cache exceeds max size
function cacheSet(cache, key, value) {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    // Delete the oldest entry (first key in insertion order)
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }
  cache.set(key, value);
}


// Georgia region configuration - centered on Tbilisi
const GEORGIA_CONFIG = {
  // Center of Tbilisi
  latitude: 41.6938,
  longitude: 44.8015,
  // Radius in meters (~50km to cover greater Tbilisi area)
  radius: 50000,
  // Country restriction
  country: 'ge',
  // Bounding box for Georgia [minLng, minLat, maxLng, maxLat]
  bbox: [40.0, 41.0, 46.8, 43.6],
  // Viewport for Google Geocoding (southwest, northeast)
  viewport: {
    southwest: { lat: 41.0, lng: 40.0 },
    northeast: { lat: 43.6, lng: 46.8 },
  },
};

/**
 * Search for places using OSM Nominatim (free, no API key needed)
 * Optimized for Georgia/Kutaisi address search with Georgian language support
 * @param {string} query - Search text
 * @param {Object} location - Optional bias location { latitude, longitude }
 * @returns {Promise<Array>} - Array of place suggestions
 */
export async function searchPlacesNominatim(query, location = null) {
  if (!query || query.length < 2) {
    return [];
  }

  // Rate limiting - wait if needed to respect 1 req/sec policy
  const now = Date.now();
  const timeSinceLastRequest = now - lastNominatimRequest;
  if (timeSinceLastRequest < NOMINATIM_MIN_INTERVAL) {
    await new Promise(resolve => setTimeout(resolve, NOMINATIM_MIN_INTERVAL - timeSinceLastRequest));
  }
  lastNominatimRequest = Date.now();

  try {
    // viewbox format: <x1>,<y1>,<x2>,<y2> (lon1,lat1,lon2,lat2)
    const viewbox = `${GEORGIA_CONFIG.viewport.southwest.lng},${GEORGIA_CONFIG.viewport.southwest.lat},${GEORGIA_CONFIG.viewport.northeast.lng},${GEORGIA_CONFIG.viewport.northeast.lat}`;

    const params = new URLSearchParams({
      q: query,
      format: 'jsonv2',
      addressdetails: '1',
      countrycodes: 'ge',
      viewbox: viewbox,
      bounded: '0', // prefer viewbox results but don't exclude others
      limit: '8',
      dedupe: '1',
      'accept-language': 'ka,en',
    });

    const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'LuliniApp/1.0',
      },
    });

    if (!response.ok) {
      if (__DEV__) console.warn('[googleMaps] Nominatim search failed:', response.status);
      return [];
    }

    const data = await response.json();

    if (!data || data.length === 0) {
      return [];
    }

    return data.map(item => {
      const addr = item.address || {};

      // Build main text - prefer street + house number
      let mainText = '';
      if (addr.road) {
        mainText = addr.house_number ? `${addr.road} ${addr.house_number}` : addr.road;
      } else if (item.name && item.name !== item.display_name) {
        mainText = item.name;
      } else {
        mainText = item.display_name.split(',')[0].trim();
      }

      // Build secondary text from address components
      const secondaryParts = [
        addr.suburb || addr.neighbourhood || addr.district,
        addr.city || addr.town || addr.village,
        addr.state,
      ].filter(Boolean);
      const secondaryText = secondaryParts.length > 0
        ? secondaryParts.join(', ')
        : item.display_name.split(',').slice(1, 3).join(',').trim();

      return {
        placeId: `nominatim:${item.place_id}`,
        description: item.display_name,
        mainText: mainText,
        secondaryText: secondaryText,
        coordinates: {
          latitude: parseFloat(item.lat),
          longitude: parseFloat(item.lon),
        },
        houseNumber: addr.house_number || '',
        street: addr.road || '',
        city: addr.city || addr.town || addr.village || '',
        district: addr.suburb || addr.neighbourhood || '',
        placeType: item.type,
        category: item.category,
        importance: item.importance,
      };
    });
  } catch (error) {
    if (__DEV__) console.warn('[googleMaps] Nominatim search error:', error.message);
    return [];
  }
}

/**
 * Reverse geocode using OSM Nominatim (free, no API key needed)
 * @param {number} latitude
 * @param {number} longitude
 * @returns {Promise<Object|null>} - Address details
 */
export async function reverseGeocodeNominatim(latitude, longitude) {
  // Rate limiting
  const now = Date.now();
  const timeSinceLastRequest = now - lastNominatimRequest;
  if (timeSinceLastRequest < NOMINATIM_MIN_INTERVAL) {
    await new Promise(resolve => setTimeout(resolve, NOMINATIM_MIN_INTERVAL - timeSinceLastRequest));
  }
  lastNominatimRequest = Date.now();

  try {
    const params = new URLSearchParams({
      lat: latitude.toString(),
      lon: longitude.toString(),
      format: 'jsonv2',
      addressdetails: '1',
      zoom: '18',
      'accept-language': 'ka,en',
    });

    const url = `https://nominatim.openstreetmap.org/reverse?${params.toString()}`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'LuliniApp/1.0',
      },
    });

    if (!response.ok) {
      if (__DEV__) console.warn('[googleMaps] Nominatim reverse geocode failed:', response.status);
      return null;
    }

    const data = await response.json();

    if (data.error) {
      return null;
    }

    const addr = data.address || {};
    const street = addr.road || '';
    const houseNumber = addr.house_number || '';
    const city = addr.city || addr.town || addr.village || '';
    const district = addr.suburb || addr.neighbourhood || '';

    return {
      address: data.display_name,
      street: street,
      houseNumber: houseNumber,
      district: district,
      city: city,
      mainText: houseNumber ? `${street} ${houseNumber}` : (street || data.display_name.split(',')[0].trim()),
      secondaryText: [district, city].filter(Boolean).join(', '),
      coordinates: { latitude, longitude },
      placeType: data.type,
    };
  } catch (error) {
    if (__DEV__) console.warn('[googleMaps] Nominatim reverse geocode error:', error.message);
    return null;
  }
}

/**
 * Get directions between two points via server proxy (API key stays server-side)
 * Falls back to OSRM if server proxy fails
 * @param {Object} origin - { latitude, longitude }
 * @param {Object} destination - { latitude, longitude }
 * @returns {Promise<Object>} - { distance, duration, distanceText, durationText, polyline, steps }
 */
export async function getDirections(origin, destination) {
  const safeOrigin = normalizeCoordinatePair(origin);
  const safeDestination = normalizeCoordinatePair(destination);
  if (!safeOrigin || !safeDestination) return null;

  // Round to 4 decimals for better cache hits (~11m precision)
  const oLat = safeOrigin.latitude.toFixed(4);
  const oLng = safeOrigin.longitude.toFixed(4);
  const dLat = safeDestination.latitude.toFixed(4);
  const dLng = safeDestination.longitude.toFixed(4);
  const cacheKey = `${oLat},${oLng}-${dLat},${dLng}`;

  // Check cache first (with TTL)
  const cached = directionsCache.get(cacheKey);
  if (cached && (Date.now() - cached._ts < DIRECTIONS_CACHE_TTL)) {
    return cached;
  }

  try {
    const response = await api.get('/maps/directions', {
      params: {
        originLat: safeOrigin.latitude,
        originLng: safeOrigin.longitude,
        destLat: safeDestination.latitude,
        destLng: safeDestination.longitude,
      },
    });

    const data = response.data;

    if (!data.success) {
      // Server proxy failed — fallback to OSRM
      return getDirectionsOSRM(origin, destination);
    }

    const result = {
      distance: data.data.distance,
      duration: data.data.duration,
      distanceText: data.data.distanceText,
      durationText: data.data.durationText,
      polyline: data.data.polyline,
      startAddress: data.data.startAddress || '',
      endAddress: data.data.endAddress || '',
      steps: data.data.steps || [],
      _ts: Date.now(),
    };

    cacheSet(directionsCache, cacheKey, result);
    return result;
  } catch (error) {
    // Network/auth error — fallback to OSRM
    return getDirectionsOSRM(origin, destination);
  }
}

/**
 * Get directions using OSRM (free, no API key needed)
 * Used as fallback when Google Directions is unavailable
 * @param {Object} origin - { latitude, longitude }
 * @param {Object} destination - { latitude, longitude }
 * @returns {Promise<Object|null>}
 */
export async function getDirectionsOSRM(origin, destination) {
  const safeOrigin = normalizeCoordinatePair(origin);
  const safeDestination = normalizeCoordinatePair(destination);
  if (!safeOrigin || !safeDestination) return null;

  // Round OSRM coordinates too for better cache hits
  const oLat = safeOrigin.latitude.toFixed(4);
  const oLng = safeOrigin.longitude.toFixed(4);
  const dLat = safeDestination.latitude.toFixed(4);
  const dLng = safeDestination.longitude.toFixed(4);
  const cacheKey = `osrm:${oLat},${oLng}-${dLat},${dLng}`;

  const cachedOsrm = directionsCache.get(cacheKey);
  if (cachedOsrm && (Date.now() - cachedOsrm._ts < DIRECTIONS_CACHE_TTL)) {
    return cachedOsrm;
  }

  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${safeOrigin.longitude},${safeOrigin.latitude};${safeDestination.longitude},${safeDestination.latitude}?overview=full&geometries=geojson`;

    const response = await fetch(url);

    if (!response.ok) {
      if (__DEV__) console.warn('[googleMaps] OSRM directions failed:', response.status);
      return null;
    }

    const data = await response.json();

    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
      return null;
    }

    const route = data.routes[0];
    const polyline = route.geometry.coordinates.map(coord => [coord[1], coord[0]]); // [lng, lat] -> [lat, lng]

    const result = {
      distance: route.distance / 1000, // meters to km
      duration: Math.round(route.duration / 60), // seconds to minutes
      distanceText: `${(route.distance / 1000).toFixed(1)} km`,
      durationText: `${Math.round(route.duration / 60)} min`,
      polyline: polyline,
      startAddress: '',
      endAddress: '',
      steps: [],
      _ts: Date.now(),
    };

    cacheSet(directionsCache, cacheKey, result);
    return result;
  } catch (error) {
    if (__DEV__) console.warn('[googleMaps] OSRM directions error:', error.message);
    return null;
  }
}

/**
 * Search for places using OSM Nominatim as primary provider
 * Falls back to Google Geocoding when Nominatim returns no results
 * @param {string} query - Search text
 * @param {Object} location - Optional bias location { latitude, longitude }
 * @returns {Promise<Array>} - Array of place predictions
 */
export async function searchPlaces(query, location = null) {
  if (!query || query.length < 2) {
    return [];
  }

  // Check cache first
  const cacheKey = `search:${query}:${location?.latitude || ''}`;
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < SEARCH_CACHE_TTL) {
    return cached.results;
  }

  // Primary: Nominatim (free, no API key needed)
  let results = await searchPlacesNominatim(query, location);

  // Backup: Google Geocoding if Nominatim returns nothing
  if (results.length === 0 && GOOGLE_MAPS_API_KEY) {
    results = await searchPlacesGoogle(query, location);
  }

  // Cache the results (bounded)
  cacheSet(searchCache, cacheKey, { results, timestamp: Date.now() });

  return results;
}

/**
 * Search using Google Geocoding API - better for street addresses in Georgia
 * Uses viewport biasing to restrict to Kutaisi area
 */
export async function searchPlacesGoogle(query, location = null) {
  if (!GOOGLE_MAPS_API_KEY || !query || query.length < 2) {
    return [];
  }

  try {
    // Add "Kutaisi" to query if not present for better local results
    const normalizedQuery = query.toLowerCase();
    const searchQuery = (
      normalizedQuery.includes('kutaisi') ||
      normalizedQuery.includes('ქუთაისი') ||
      normalizedQuery.includes('georgia') ||
      normalizedQuery.includes('საქართველო')
    ) ? query : `${query}, Kutaisi, Georgia`;

    // Use Google Geocoding API with bounds for address search
    const params = new URLSearchParams({
      address: searchQuery,
      key: GOOGLE_MAPS_API_KEY,
      // Restrict to Georgia
      components: 'country:GE',
      // Bounds for Kutaisi area (southwest|northeast)
      bounds: `${GEORGIA_CONFIG.viewport.southwest.lat},${GEORGIA_CONFIG.viewport.southwest.lng}|${GEORGIA_CONFIG.viewport.northeast.lat},${GEORGIA_CONFIG.viewport.northeast.lng}`,
      // Language - Georgian for local names
      language: 'ka',
      // Region hint
      region: 'ge',
    });

    const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`;
    const response = await fetch(geocodeUrl);

    if (!response.ok) {
      if (__DEV__) console.warn('[googleMaps] Google geocode failed:', response.status);
      return searchPlacesAutocomplete(query, location);
    }

    const data = await response.json();

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      // Fallback to Places Autocomplete
      return searchPlacesAutocomplete(query, location);
    }

    if (!data.results || data.results.length === 0) {
      // Fallback to Places Autocomplete for POIs
      return searchPlacesAutocomplete(query, location);
    }

    // Filter results to Kutaisi area only
    const filteredResults = data.results.filter(result => {
      const loc = result.geometry?.location;
      if (!loc) return false;
      // Check if within Kutaisi bounds
      return (
        loc.lat >= GEORGIA_CONFIG.viewport.southwest.lat &&
        loc.lat <= GEORGIA_CONFIG.viewport.northeast.lat &&
        loc.lng >= GEORGIA_CONFIG.viewport.southwest.lng &&
        loc.lng <= GEORGIA_CONFIG.viewport.northeast.lng
      );
    });

    return filteredResults.map(result => {
      // Extract address components for better display
      let streetNumber = '';
      let route = '';
      let locality = '';

      for (const component of result.address_components || []) {
        if (component.types.includes('street_number')) {
          streetNumber = component.long_name;
        }
        if (component.types.includes('route')) {
          route = component.long_name;
        }
        if (component.types.includes('locality') || component.types.includes('sublocality')) {
          locality = component.long_name;
        }
      }

      // Build display text
      const mainText = streetNumber && route
        ? `${route} ${streetNumber}`
        : route || result.formatted_address.split(',')[0];

      return {
        placeId: result.place_id,
        description: result.formatted_address,
        mainText: mainText,
        secondaryText: locality || 'Kutaisi',
        coordinates: {
          latitude: result.geometry.location.lat,
          longitude: result.geometry.location.lng,
        },
        addressComponents: result.address_components,
        types: result.types,
      };
    });
  } catch (error) {
    if (__DEV__) console.warn('[googleMaps] Google geocode error:', error.message);
    return [];
  }
}

/**
 * Search using Google Places Autocomplete API (for POIs and businesses)
 */
async function searchPlacesAutocomplete(query, location = null) {
  try {
    const params = new URLSearchParams({
      input: query,
      key: GOOGLE_MAPS_API_KEY,
      // Both addresses and establishments
      types: 'geocode|establishment',
      // Center on Kutaisi
      location: `${GEORGIA_CONFIG.latitude},${GEORGIA_CONFIG.longitude}`,
      // 30km radius
      radius: `${GEORGIA_CONFIG.radius}`,
      // Strict bounds
      strictbounds: 'true',
      // Restrict to Georgia
      components: 'country:ge',
      // Georgian language
      language: 'ka',
    });

    const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?${params.toString()}`;
    const response = await fetch(url);

    if (!response.ok) {
      if (__DEV__) console.warn('[googleMaps] Places autocomplete failed:', response.status);
      return [];
    }

    const data = await response.json();

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      return [];
    }

    return (data.predictions || []).map(prediction => ({
      placeId: prediction.place_id,
      description: prediction.description,
      mainText: prediction.structured_formatting?.main_text || prediction.description,
      secondaryText: prediction.structured_formatting?.secondary_text || '',
      coordinates: null, // Need getPlaceDetails for coordinates
    }));
  } catch (error) {
    if (__DEV__) console.warn('[googleMaps] Places autocomplete error:', error.message);
    return [];
  }
}

/**
 * Get place details including coordinates
 * @param {string} placeId - Google Place ID
 * @param {Object} existingCoords - If coordinates already provided (e.g. from Nominatim)
 * @returns {Promise<Object>} - Place details with coordinates
 */
export async function getPlaceDetails(placeId, existingCoords = null) {
  // If coordinates already provided, return them
  if (existingCoords) {
    return {
      name: '',
      address: '',
      coordinates: existingCoords,
    };
  }

  // For Google Place IDs
  if (!GOOGLE_MAPS_API_KEY || !placeId) {
    return null;
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=geometry,formatted_address,name&key=${GOOGLE_MAPS_API_KEY}`;

    const response = await fetch(url);

    if (!response.ok) {
      if (__DEV__) console.warn('[googleMaps] Place details failed:', response.status);
      return null;
    }

    const data = await response.json();

    if (data.status !== 'OK') {
      return null;
    }

    const result = data.result;
    return {
      name: result.name,
      address: result.formatted_address,
      coordinates: {
        latitude: result.geometry.location.lat,
        longitude: result.geometry.location.lng,
      },
    };
  } catch (error) {
    if (__DEV__) console.warn('[googleMaps] Place details error:', error.message);
    return null;
  }
}

/**
 * Reverse geocode coordinates to get address
 * Uses Nominatim first (free), then Google as fallback
 * @param {number} latitude
 * @param {number} longitude
 * @returns {Promise<Object>} - Address details
 */
export async function reverseGeocode(latitude, longitude) {
  // Try Nominatim first (free, no API key needed)
  const nominatimResult = await reverseGeocodeNominatim(latitude, longitude);
  if (nominatimResult) return nominatimResult;

  // Fallback to Google
  if (GOOGLE_MAPS_API_KEY) {
    return reverseGeocodeGoogle(latitude, longitude);
  }

  return {
    address: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
    street: '',
    houseNumber: '',
    coordinates: { latitude, longitude },
  };
}

/**
 * Reverse geocode using Google
 */
async function reverseGeocodeGoogle(latitude, longitude) {
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_MAPS_API_KEY}&language=ka`;

    const response = await fetch(url);

    if (!response.ok) {
      if (__DEV__) console.warn('[googleMaps] Google reverse geocode failed:', response.status);
      return null;
    }

    const data = await response.json();

    if (data.status !== 'OK' || !data.results[0]) {
      return null;
    }

    const result = data.results[0];

    // Extract address components
    let streetNumber = '';
    let route = '';
    let locality = '';

    for (const component of (result.address_components || [])) {
      if (component.types.includes('street_number')) {
        streetNumber = component.long_name;
      }
      if (component.types.includes('route')) {
        route = component.long_name;
      }
      if (component.types.includes('locality')) {
        locality = component.long_name;
      }
    }

    return {
      address: result.formatted_address,
      street: route,
      houseNumber: streetNumber,
      city: locality,
      mainText: streetNumber ? `${route} ${streetNumber}` : route || result.formatted_address.split(',')[0],
      secondaryText: locality,
      coordinates: { latitude, longitude },
    };
  } catch (error) {
    if (__DEV__) console.warn('[googleMaps] Google reverse geocode error:', error.message);
    return null;
  }
}

/**
 * Decode a Google Maps encoded polyline
 * @param {string} encoded - Encoded polyline string
 * @returns {Array} - Array of [lat, lng] coordinates
 */
export function decodePolyline(encoded) {
  if (!encoded) return [];

  const poly = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let b;
    let shift = 0;
    let result = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlat = (result & 1) ? ~(result >> 1) : (result >> 1);
    lat += dlat;

    shift = 0;
    result = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlng = (result & 1) ? ~(result >> 1) : (result >> 1);
    lng += dlng;

    poly.push([lat / 1e5, lng / 1e5]);
  }

  return poly;
}

/**
 * Clear directions cache
 */
export function clearDirectionsCache() {
  directionsCache.clear();
}

/**
 * Clear search cache
 */
export function clearSearchCache() {
  searchCache.clear();
}

/**
 * Clear all caches
 */
export function clearAllCaches() {
  directionsCache.clear();
  searchCache.clear();
}

/**
 * Check if Google Maps API key is configured
 */
export function isGoogleMapsConfigured() {
  return !!GOOGLE_MAPS_API_KEY;
}

export default {
  getDirections,
  searchPlaces,
  searchPlacesNominatim,
  searchPlacesGoogle,
  getPlaceDetails,
  reverseGeocode,
  reverseGeocodeNominatim,
  decodePolyline,
  getDirectionsOSRM,
  clearDirectionsCache,
  clearSearchCache,
  clearAllCaches,
  isGoogleMapsConfigured,
};
