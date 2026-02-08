import Constants from 'expo-constants';

const GOOGLE_MAPS_API_KEY = Constants.expoConfig?.extra?.googleMapsApiKey || '';
const MAPBOX_ACCESS_TOKEN = Constants.expoConfig?.extra?.mapboxAccessToken || '';

/**
 * Maps Services for React Native (Expo Go compatible)
 * Optimized for Georgia/Kutaisi address search
 * Combines Google Geocoding + Mapbox for best coverage
 */

// Cache for directions and search results
const directionsCache = new Map();
const searchCache = new Map();
const SEARCH_CACHE_TTL = 60000; // 1 minute cache

// Kutaisi region configuration - optimized for Georgia
const KUTAISI_CONFIG = {
  // Center of Kutaisi
  latitude: 42.2679,
  longitude: 42.6946,
  // Radius in meters (~30km to cover greater Kutaisi area)
  radius: 30000,
  // Country restriction
  country: 'ge',
  // Bounding box for Kutaisi area [minLng, minLat, maxLng, maxLat]
  // Expanded slightly for better coverage
  bbox: [42.35, 42.05, 43.0, 42.5],
  // Viewport for Google Geocoding (southwest, northeast)
  viewport: {
    southwest: { lat: 42.05, lng: 42.35 },
    northeast: { lat: 42.5, lng: 43.0 },
  },
};

/**
 * Get directions between two points using Google Directions API
 * @param {Object} origin - { latitude, longitude }
 * @param {Object} destination - { latitude, longitude }
 * @returns {Promise<Object>} - { distance, duration, distanceText, durationText, polyline, steps }
 */
export async function getDirections(origin, destination) {
  if (!GOOGLE_MAPS_API_KEY) {
    console.warn('Google Maps API key not configured');
    return null;
  }

  const cacheKey = `${origin.latitude},${origin.longitude}-${destination.latitude},${destination.longitude}`;

  // Check cache first
  if (directionsCache.has(cacheKey)) {
    return directionsCache.get(cacheKey);
  }

  try {
    const originStr = `${origin.latitude},${origin.longitude}`;
    const destStr = `${destination.latitude},${destination.longitude}`;

    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${originStr}&destination=${destStr}&mode=driving&key=${GOOGLE_MAPS_API_KEY}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== 'OK') {
      console.warn('Directions API error:', data.status, data.error_message);
      return null;
    }

    const route = data.routes[0];
    const leg = route.legs[0];

    const result = {
      distance: leg.distance.value / 1000, // Convert to km
      duration: Math.round(leg.duration.value / 60), // Convert to minutes
      distanceText: leg.distance.text,
      durationText: leg.duration.text,
      polyline: decodePolyline(route.overview_polyline.points),
      startAddress: leg.start_address,
      endAddress: leg.end_address,
      steps: leg.steps.map(step => ({
        distance: step.distance.text,
        duration: step.duration.text,
        instruction: step.html_instructions.replace(/<[^>]*>/g, ''),
        polyline: decodePolyline(step.polyline.points),
      })),
    };

    // Cache the result
    directionsCache.set(cacheKey, result);

    return result;
  } catch (error) {
    console.error('Error fetching directions:', error);
    return null;
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
  const cacheKey = `osrm:${origin.latitude},${origin.longitude}-${destination.latitude},${destination.longitude}`;

  if (directionsCache.has(cacheKey)) {
    return directionsCache.get(cacheKey);
  }

  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}?overview=full&geometries=geojson`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
      console.warn('OSRM error:', data.code);
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
    };

    directionsCache.set(cacheKey, result);
    return result;
  } catch (error) {
    console.error('Error fetching OSRM directions:', error);
    return null;
  }
}

/**
 * Search for places - combines multiple sources for best Georgia/Kutaisi coverage
 * Strategy: Run Google Geocoding + Mapbox in parallel, merge and deduplicate
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

  // Run both services in parallel for speed
  const [googleResults, mapboxResults] = await Promise.all([
    searchPlacesGoogle(query, location),
    MAPBOX_ACCESS_TOKEN ? searchPlacesMapbox(query, location) : Promise.resolve([]),
  ]);

  // Combine and deduplicate results
  const combined = combineSearchResults(googleResults, mapboxResults);

  // Cache the results
  searchCache.set(cacheKey, { results: combined, timestamp: Date.now() });

  return combined;
}

/**
 * Combine and deduplicate results from multiple sources
 * Prioritizes results with coordinates and higher relevance
 */
function combineSearchResults(googleResults, mapboxResults) {
  const seen = new Set();
  const combined = [];

  // Helper to create a normalized key for deduplication
  const normalizeKey = (text) => {
    return text
      .toLowerCase()
      .replace(/[,.\-–]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 50);
  };

  // Add Mapbox results first (they have coordinates)
  for (const result of mapboxResults) {
    const key = normalizeKey(result.mainText);
    if (!seen.has(key)) {
      seen.add(key);
      combined.push({ ...result, source: 'mapbox' });
    }
  }

  // Add Google results that aren't duplicates
  for (const result of googleResults) {
    const key = normalizeKey(result.mainText);
    if (!seen.has(key)) {
      seen.add(key);
      combined.push({ ...result, source: 'google' });
    }
  }

  // Sort: prioritize results with coordinates, then by relevance
  combined.sort((a, b) => {
    // Results with coordinates first
    if (a.coordinates && !b.coordinates) return -1;
    if (!a.coordinates && b.coordinates) return 1;
    // Then by relevance if available
    if (a.relevance && b.relevance) return b.relevance - a.relevance;
    return 0;
  });

  return combined.slice(0, 8); // Return top 8 results
}

/**
 * Search using Mapbox Geocoding API
 * Optimized for Georgian street addresses with house numbers
 */
export async function searchPlacesMapbox(query, location = null) {
  if (!MAPBOX_ACCESS_TOKEN || !query || query.length < 2) {
    return [];
  }

  try {
    const proximity = location
      ? `${location.longitude},${location.latitude}`
      : `${KUTAISI_CONFIG.longitude},${KUTAISI_CONFIG.latitude}`;

    // Detect if query looks like it has a house number
    const hasNumber = /\d+/.test(query);

    const params = new URLSearchParams({
      access_token: MAPBOX_ACCESS_TOKEN,
      // Prioritize addresses for queries with numbers, otherwise include POIs
      types: hasNumber ? 'address' : 'address,poi,place,locality',
      // Strong bias toward Kutaisi
      proximity: proximity,
      // Restrict to expanded Kutaisi bounding box
      bbox: KUTAISI_CONFIG.bbox.join(','),
      // Country restriction
      country: 'GE',
      // More results for better matching
      limit: '10',
      // Georgian primary, English fallback
      language: 'ka,en',
      // Enable autocomplete for partial matches
      autocomplete: 'true',
      // Enable fuzzy matching for typos (important for Georgian)
      fuzzyMatch: 'true',
    });

    const encodedQuery = encodeURIComponent(query);
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedQuery}.json?${params.toString()}`;

    const response = await fetch(url);
    const data = await response.json();

    if (!data.features || data.features.length === 0) {
      return [];
    }

    return data.features.map(feature => {
      // Extract location details from context
      let city = '';
      let district = '';
      let region = '';

      if (feature.context) {
        for (const ctx of feature.context) {
          if (ctx.id.startsWith('place')) city = ctx.text;
          if (ctx.id.startsWith('locality') || ctx.id.startsWith('neighborhood')) district = ctx.text;
          if (ctx.id.startsWith('region')) region = ctx.text;
        }
      }

      // Build better display text for addresses
      let mainText = feature.text || feature.place_name.split(',')[0];

      // Add house number if available
      if (feature.address) {
        mainText = `${mainText} ${feature.address}`;
      }

      // Build secondary text
      const secondaryParts = [district, city, region].filter(Boolean);
      const secondaryText = secondaryParts.length > 0
        ? secondaryParts.join(', ')
        : feature.place_name.split(',').slice(1).join(',').trim();

      return {
        placeId: feature.id,
        description: feature.place_name,
        mainText: mainText,
        secondaryText: secondaryText,
        coordinates: {
          latitude: feature.center[1],
          longitude: feature.center[0],
        },
        // Additional address details
        address: feature.properties?.address || feature.address,
        houseNumber: feature.address,
        street: feature.text,
        city: city,
        district: district,
        relevance: feature.relevance,
        placeType: feature.place_type?.[0],
        context: feature.context,
      };
    });
  } catch (error) {
    console.error('Error searching Mapbox:', error);
    return [];
  }
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
      bounds: `${KUTAISI_CONFIG.viewport.southwest.lat},${KUTAISI_CONFIG.viewport.southwest.lng}|${KUTAISI_CONFIG.viewport.northeast.lat},${KUTAISI_CONFIG.viewport.northeast.lng}`,
      // Language - Georgian for local names
      language: 'ka',
      // Region hint
      region: 'ge',
    });

    const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`;
    const response = await fetch(geocodeUrl);
    const data = await response.json();

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.warn('Geocoding API error:', data.status, data.error_message);
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
        loc.lat >= KUTAISI_CONFIG.viewport.southwest.lat &&
        loc.lat <= KUTAISI_CONFIG.viewport.northeast.lat &&
        loc.lng >= KUTAISI_CONFIG.viewport.southwest.lng &&
        loc.lng <= KUTAISI_CONFIG.viewport.northeast.lng
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
    console.error('Error searching Google:', error);
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
      location: `${KUTAISI_CONFIG.latitude},${KUTAISI_CONFIG.longitude}`,
      // 30km radius
      radius: `${KUTAISI_CONFIG.radius}`,
      // Strict bounds
      strictbounds: 'true',
      // Restrict to Georgia
      components: 'country:ge',
      // Georgian language
      language: 'ka',
    });

    const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?${params.toString()}`;
    const response = await fetch(url);
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
    console.error('Error in Places Autocomplete:', error);
    return [];
  }
}

/**
 * Get place details including coordinates
 * @param {string} placeId - Place ID (Mapbox or Google format)
 * @param {Object} existingCoords - If Mapbox already provided coordinates
 * @returns {Promise<Object>} - Place details with coordinates
 */
export async function getPlaceDetails(placeId, existingCoords = null) {
  // If coordinates already provided (from Mapbox), return them
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
    const data = await response.json();

    if (data.status !== 'OK') {
      console.warn('Place Details API error:', data.status, data.error_message);
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
    console.error('Error fetching place details:', error);
    return null;
  }
}

/**
 * Reverse geocode coordinates to get address
 * Uses Mapbox first, then Google as fallback
 * @param {number} latitude
 * @param {number} longitude
 * @returns {Promise<Object>} - Address details
 */
export async function reverseGeocode(latitude, longitude) {
  // Try Mapbox first
  if (MAPBOX_ACCESS_TOKEN) {
    const result = await reverseGeocodeMapbox(latitude, longitude);
    if (result) return result;
  }

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
 * Reverse geocode using Mapbox
 * Returns detailed address including house number
 */
async function reverseGeocodeMapbox(latitude, longitude) {
  try {
    const params = new URLSearchParams({
      access_token: MAPBOX_ACCESS_TOKEN,
      types: 'address,poi,place',
      language: 'ka,en',
      limit: '1',
    });

    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?${params.toString()}`;

    const response = await fetch(url);
    const data = await response.json();

    if (!data.features || data.features.length === 0) {
      return null;
    }

    const feature = data.features[0];

    // Extract address components from context
    let street = '';
    let city = '';
    let district = '';

    if (feature.context) {
      for (const ctx of feature.context) {
        if (ctx.id.startsWith('locality')) district = ctx.text;
        if (ctx.id.startsWith('place')) city = ctx.text;
        if (ctx.id.startsWith('neighborhood')) district = ctx.text;
      }
    }

    return {
      address: feature.place_name,
      street: feature.text || '',
      houseNumber: feature.address || '',
      district: district,
      city: city,
      mainText: feature.address
        ? `${feature.text} ${feature.address}`
        : feature.text,
      secondaryText: [district, city].filter(Boolean).join(', '),
      coordinates: { latitude, longitude },
      placeType: feature.place_type?.[0],
    };
  } catch (error) {
    console.error('Error reverse geocoding with Mapbox:', error);
    return null;
  }
}

/**
 * Reverse geocode using Google
 */
async function reverseGeocodeGoogle(latitude, longitude) {
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_MAPS_API_KEY}&language=ka`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== 'OK' || !data.results[0]) {
      return null;
    }

    const result = data.results[0];

    // Extract address components
    let streetNumber = '';
    let route = '';
    let locality = '';

    for (const component of result.address_components) {
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
    console.error('Error reverse geocoding with Google:', error);
    return null;
  }
}

/**
 * Check if Mapbox is configured
 */
export function isMapboxConfigured() {
  return !!MAPBOX_ACCESS_TOKEN;
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
  searchPlacesMapbox,
  searchPlacesGoogle,
  getPlaceDetails,
  reverseGeocode,
  decodePolyline,
  getDirectionsOSRM,
  clearDirectionsCache,
  clearSearchCache,
  clearAllCaches,
  isGoogleMapsConfigured,
  isMapboxConfigured,
};
