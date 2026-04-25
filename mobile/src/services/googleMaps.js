/**
 * Maps Client (passenger app) — thin fetch wrapper over the server's /api/maps/*.
 *
 * All provider selection, caching, and fallback logic lives on the server.
 * This file ONLY:
 *   - shapes requests to server endpoints
 *   - adapts server response → the legacy shape existing callers expect
 *   - provides a pure polyline decoder util
 *
 * Filename kept as googleMaps.js so existing imports don't need to change.
 * Conceptually this is maps.client.js.
 */

import * as Crypto from 'expo-crypto';
import api from './api';

// ── Phase 4.1: client-side prefix LRU ──────────────────────────────────────
// Bounded Map of normalized-query → predictions. Two optimizations:
//   1. Exact hit → skip the round-trip entirely.
//   2. Prefix hit → if "tbilisi pla" is cached and user types "tbilisi plaz",
//      filter the cached list locally; only round-trip when fewer than
//      MIN_PREFIX_RESULTS predictions remain.
// Invalidated on app foreground after AUTOCOMPLETE_TTL_MS.
const AUTOCOMPLETE_LRU_MAX = 30;
const AUTOCOMPLETE_TTL_MS = 30 * 60 * 1000; // 30 min
const MIN_PREFIX_RESULTS = 3;
const autocompleteLRU = new Map(); // Map preserves insertion order → cheap LRU

function normalizeQuery(q) {
  if (!q) return '';
  // Match server-side normalization: trim + NFC + lowercase.
  return q.trim().normalize('NFC').toLowerCase();
}

function lruGet(key) {
  const entry = autocompleteLRU.get(key);
  if (!entry) return null;
  if (Date.now() - entry.t > AUTOCOMPLETE_TTL_MS) {
    autocompleteLRU.delete(key);
    return null;
  }
  // Bump recency
  autocompleteLRU.delete(key);
  autocompleteLRU.set(key, entry);
  return entry.v;
}

function lruSet(key, value) {
  if (autocompleteLRU.has(key)) autocompleteLRU.delete(key);
  autocompleteLRU.set(key, { v: value, t: Date.now() });
  while (autocompleteLRU.size > AUTOCOMPLETE_LRU_MAX) {
    const oldest = autocompleteLRU.keys().next().value;
    autocompleteLRU.delete(oldest);
  }
}

// Find the longest cached prefix of `key`. Returns the cached list (so the
// caller can locally filter) or null.
function lruPrefixHit(key) {
  let best = null;
  let bestLen = 0;
  for (const [k, entry] of autocompleteLRU) {
    if (Date.now() - entry.t > AUTOCOMPLETE_TTL_MS) continue;
    if (k.length < key.length && key.startsWith(k) && k.length > bestLen) {
      best = entry.v;
      bestLen = k.length;
    }
  }
  return best;
}

function localFilter(list, key) {
  if (!Array.isArray(list)) return [];
  return list.filter(p => {
    const main = (p?.mainText || '').toLowerCase();
    const desc = (p?.description || '').toLowerCase();
    return main.includes(key) || desc.includes(key);
  });
}

export function clearAutocompleteCache() {
  autocompleteLRU.clear();
}

// Session token for Google Places autocomplete billing.
// One token covers the full "type → pick" flow; rotated via newSessionToken()
// after each successful place resolution. Reduces per-selection cost from
// (N keystrokes × autocomplete + 1 details) → (1 session billed once + 1 details).
export function newSessionToken() {
  if (typeof Crypto.randomUUID === 'function') return Crypto.randomUUID();
  // Fallback: time-prefixed random hex (Google accepts any opaque string).
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

// ── Shape adapters ──────────────────────────────────────────────────────────

function normalizeCoord(c) {
  if (!c) return null;
  const lat = Number(c.latitude ?? c.lat);
  const lng = Number(c.longitude ?? c.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { latitude: lat, longitude: lng };
}

function toDirectionsResult(d) {
  if (!d) return null;
  return {
    distance: d.distance ?? (d.distanceMeters != null ? d.distanceMeters / 1000 : 0),
    duration: d.duration ?? (d.durationSeconds != null ? Math.round(d.durationSeconds / 60) : 0),
    distanceText: d.distanceText || '',
    durationText: d.durationText || '',
    polyline: d.polyline || [],
    startAddress: d.startAddress || '',
    endAddress: d.endAddress || '',
    steps: d.steps || [],
    provider: d.provider || null,
  };
}

function toPlace(p) {
  if (!p) return null;
  return {
    placeId: p.placeId,
    description: p.description,
    mainText: p.mainText,
    secondaryText: p.secondaryText,
    coordinates: p.coords ? { latitude: p.coords.lat, longitude: p.coords.lng } : null,
    kind: p.kind || null,
    provider: p.provider || null,
  };
}

function toReverseResult(r, lat, lng) {
  if (!r) {
    return {
      address: `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
      street: '', houseNumber: '',
      coordinates: { latitude: lat, longitude: lng },
    };
  }
  const comp = r.components || {};
  const street = comp.road || '';
  const houseNumber = comp.house_number || '';
  const city = comp.city || comp.town || comp.village || '';
  const district = comp.suburb || comp.neighbourhood || '';
  return {
    address: r.address,
    street,
    houseNumber,
    district,
    city,
    mainText: houseNumber ? `${street} ${houseNumber}` : (street || r.address.split(',')[0].trim()),
    secondaryText: [district, city].filter(Boolean).join(', '),
    coordinates: { latitude: r.coords.lat, longitude: r.coords.lng },
  };
}

// ── Public API ──────────────────────────────────────────────────────────────

export async function getDirections(origin, destination) {
  const o = normalizeCoord(origin);
  const d = normalizeCoord(destination);
  if (!o || !d) return null;

  try {
    const res = await api.get('/maps/directions', {
      params: { originLat: o.latitude, originLng: o.longitude, destLat: d.latitude, destLng: d.longitude },
    });
    if (!res.data?.success) return null;
    return toDirectionsResult(res.data.data);
  } catch {
    return null;
  }
}

// Back-compat alias — server owns OSRM→Google fallback; no distinct client path.
export const getDirectionsOSRM = getDirections;

export async function searchPlaces(query, location = null, sessionToken = null) {
  if (!query || query.length < 2) return [];

  const key = normalizeQuery(query);

  // Exact hit — no network.
  const exact = lruGet(key);
  if (exact) return exact;

  // Prefix hit — locally filter; only round-trip if the filtered list is too thin.
  const prefix = lruPrefixHit(key);
  if (prefix) {
    const filtered = localFilter(prefix, key);
    if (filtered.length >= MIN_PREFIX_RESULTS) {
      lruSet(key, filtered);
      return filtered;
    }
  }

  try {
    const params = { input: query };
    if (location?.latitude && location?.longitude) {
      params.lat = location.latitude;
      params.lng = location.longitude;
    }
    if (sessionToken) params.sessionToken = sessionToken;
    const res = await api.get('/maps/autocomplete', { params });
    if (!res.data?.success) return [];
    const predictions = (res.data.data?.predictions || []).map(toPlace).filter(Boolean);
    lruSet(key, predictions);
    return predictions;
  } catch {
    return [];
  }
}

// Back-compat: some callers still import these direct variants.
export const searchPlacesNominatim = searchPlaces;
export const searchPlacesGoogle = searchPlaces;

export async function getPlaceDetails(placeId, existingCoords = null, sessionToken = null) {
  if (existingCoords) {
    return { name: '', address: '', coordinates: existingCoords };
  }
  if (!placeId) return null;
  try {
    const params = { placeId };
    if (sessionToken) params.sessionToken = sessionToken;
    const res = await api.get('/maps/place-details', { params });
    const r = res.data?.data?.result;
    if (!r) return null;
    return {
      name: r.name || '',
      address: r.address,
      coordinates: { latitude: r.coords.lat, longitude: r.coords.lng },
    };
  } catch {
    return null;
  }
}

/**
 * Ensure a selected prediction has coordinates. For Nominatim addresses the
 * coords are already present. For Google POIs, resolve via /maps/place-details.
 *
 * Returns a new place object `{ ...place, coordinates }` or the original if
 * resolution failed (caller should treat that as a soft failure).
 */
export async function resolvePlaceCoords(place, sessionToken = null) {
  if (!place) return null;
  if (place.coordinates) return place;
  if (!place.placeId) return place;
  const details = await getPlaceDetails(place.placeId, null, sessionToken);
  if (!details?.coordinates) return place;
  return {
    ...place,
    coordinates: details.coordinates,
    description: place.description || details.address,
  };
}

/**
 * Geo-sorted popular places near the user. Free (Mongo-only) — useful as the
 * empty-state of the search sheet so the most common "where to today" taps
 * never trigger an autocomplete call.
 */
export async function getNearbyPopular(location, limit = 5) {
  if (!location?.latitude || !location?.longitude) return [];
  try {
    const res = await api.get('/locations/nearby-popular', {
      params: { lat: location.latitude, lng: location.longitude, limit },
    });
    if (!res.data?.success) return [];
    return (res.data.data?.results || []).map(toPlace).filter(Boolean);
  } catch {
    return [];
  }
}

export async function reverseGeocode(latitude, longitude) {
  try {
    const res = await api.get('/maps/geocode', {
      params: { latlng: `${latitude},${longitude}` },
    });
    return toReverseResult(res.data?.data?.result, latitude, longitude);
  } catch {
    return {
      address: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
      street: '', houseNumber: '',
      coordinates: { latitude, longitude },
    };
  }
}

export const reverseGeocodeNominatim = reverseGeocode;

// ── Pure utility (kept for callers that render encoded polylines locally) ──
export function decodePolyline(encoded) {
  if (!encoded) return [];
  const poly = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let b, shift = 0, result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    poly.push([lat / 1e5, lng / 1e5]);
  }
  return poly;
}

// ── Deprecated stubs (server owns most caches now) ──────────────────────────
export function clearDirectionsCache() {}
export function clearSearchCache() { clearAutocompleteCache(); }
export function clearAllCaches() { clearAutocompleteCache(); }
export function isGoogleMapsConfigured() { return true; }

export default {
  getDirections,
  getDirectionsOSRM,
  searchPlaces,
  searchPlacesNominatim,
  searchPlacesGoogle,
  getPlaceDetails,
  resolvePlaceCoords,
  reverseGeocode,
  reverseGeocodeNominatim,
  decodePolyline,
  clearDirectionsCache,
  clearSearchCache,
  clearAllCaches,
  isGoogleMapsConfigured,
  newSessionToken,
  getNearbyPopular,
};
