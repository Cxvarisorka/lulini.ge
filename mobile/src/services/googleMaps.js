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

import api from './api';

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

export async function searchPlaces(query, location = null) {
  if (!query || query.length < 2) return [];
  try {
    const params = { input: query };
    if (location?.latitude && location?.longitude) {
      params.lat = location.latitude;
      params.lng = location.longitude;
    }
    const res = await api.get('/maps/autocomplete', { params });
    if (!res.data?.success) return [];
    return (res.data.data?.predictions || []).map(toPlace).filter(Boolean);
  } catch {
    return [];
  }
}

// Back-compat: some callers still import these direct variants.
export const searchPlacesNominatim = searchPlaces;
export const searchPlacesGoogle = searchPlaces;

export async function getPlaceDetails(placeId, existingCoords = null) {
  if (existingCoords) {
    return { name: '', address: '', coordinates: existingCoords };
  }
  if (!placeId) return null;
  try {
    const res = await api.get('/maps/place-details', { params: { placeId } });
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
export async function resolvePlaceCoords(place) {
  if (!place) return null;
  if (place.coordinates) return place;
  if (!place.placeId) return place;
  const details = await getPlaceDetails(place.placeId);
  if (!details?.coordinates) return place;
  return {
    ...place,
    coordinates: details.coordinates,
    description: place.description || details.address,
  };
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

// ── Deprecated stubs (server owns caches now) ───────────────────────────────
export function clearDirectionsCache() {}
export function clearSearchCache() {}
export function clearAllCaches() {}
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
};
