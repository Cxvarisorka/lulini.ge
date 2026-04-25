'use strict';

/**
 * Google Provider — single consolidated client for all Google Maps APIs.
 *
 * Replaces / absorbs:
 *   - server/services/locationProviders/google.provider.js (geocoding only)
 *   - Inline Google fetches in maps.controller.js (directions, matrix, snap)
 *
 * Role in the stack: FALLBACK for routing + geocoding, PRIMARY for autocomplete (POIs).
 *
 * Unified contracts (shared with osrm.provider and nominatim.provider):
 *   getRoute({origin, destination})        → {distanceMeters, durationSeconds, polyline, provider}
 *   getMatrix({origins, destinations})     → {durations, distances, provider}
 *   forwardGeocode(query, opts)            → Array<UnifiedPlace>
 *   reverseGeocode(lat, lng, opts)         → UnifiedPlace | null
 *   autocomplete(input, opts)              → Array<Prediction>
 *   snapToRoads(points)                    → Array<SnappedPoint>
 *
 * No caching here — service layer owns that via cache.service.
 */

const logger = require('../utils/logger');
const metrics = require('../services/metrics.service');

const API_KEY   = process.env.GOOGLE_MAPS_API_KEY;
const MAPS_BASE = 'https://maps.googleapis.com/maps/api';
const ROADS_BASE = 'https://roads.googleapis.com/v1';
const FETCH_TIMEOUT_MS = 8000;

function requireKey() {
    if (!API_KEY) throw new Error('GOOGLE_MAPS_API_KEY not configured');
}

// ── Polyline decoder (Google uses precision 5) ──
function decodePolyline5(encoded) {
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

async function fetchJson(url) {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`Google HTTP ${res.status}`);
    return res.json();
}

// ── Routing ─────────────────────────────────────────────────────────────────

async function getRoute({ origin, destination }) {
    requireKey();
    const url = `${MAPS_BASE}/directions/json?` +
        `origin=${origin.lat},${origin.lng}` +
        `&destination=${destination.lat},${destination.lng}` +
        `&mode=driving&departure_time=now&key=${API_KEY}`;
    metrics.apiCall.googleDirections();
    const data = await fetchJson(url);
    if (data.status !== 'OK' || !data.routes?.[0]) {
        throw new Error(`Google Directions status=${data.status}`);
    }
    const route = data.routes[0];
    const leg = route.legs[0];
    return {
        distanceMeters: leg.distance.value,
        durationSeconds: (leg.duration_in_traffic?.value) || leg.duration.value,
        polyline: decodePolyline5(route.overview_polyline.points),
        provider: 'google',
        // Extras useful for UI (not part of unified contract but passed through)
        startAddress: leg.start_address,
        endAddress:   leg.end_address,
        steps: leg.steps.map(s => ({
            distanceMeters: s.distance.value,
            durationSeconds: s.duration.value,
            instruction: s.html_instructions.replace(/<[^>]*>/g, ''),
            maneuver: s.maneuver || null,
        })),
    };
}

async function getMatrix({ origins, destinations }) {
    requireKey();
    const o = origins.map(p => `${p.lat},${p.lng}`).join('|');
    const d = destinations.map(p => `${p.lat},${p.lng}`).join('|');
    const url = `${MAPS_BASE}/distancematrix/json?` +
        `origins=${encodeURIComponent(o)}&destinations=${encodeURIComponent(d)}` +
        `&mode=driving&key=${API_KEY}`;
    metrics.apiCall.googleMatrix();
    const data = await fetchJson(url);
    if (data.status !== 'OK') throw new Error(`Google Matrix status=${data.status}`);

    const durations = [];
    const distances = [];
    for (const row of data.rows) {
        const durRow = [], distRow = [];
        for (const el of row.elements) {
            if (el.status === 'OK') {
                durRow.push(el.duration.value);
                distRow.push(el.distance.value);
            } else {
                durRow.push(null);
                distRow.push(null);
            }
        }
        durations.push(durRow);
        distances.push(distRow);
    }
    return { durations, distances, provider: 'google' };
}

// ── Geocoding ───────────────────────────────────────────────────────────────

function normalizeGeocode(r) {
    if (!r) return null;
    return {
        coords: { lat: r.geometry.location.lat, lng: r.geometry.location.lng },
        address: r.formatted_address,
        components: r.address_components,
        canonicalId: `goog:${r.place_id}`,
        provider: 'google',
        confidence: r.geometry.location_type === 'ROOFTOP' ? 1.0 : 0.7,
        boundingBox: r.geometry.viewport ? [
            r.geometry.viewport.southwest.lat, r.geometry.viewport.northeast.lat,
            r.geometry.viewport.southwest.lng, r.geometry.viewport.northeast.lng,
        ] : null,
        types: r.types,
    };
}

async function forwardGeocode(query, { countryCode = 'GE', language = 'ka' } = {}) {
    if (!API_KEY || !query || query.length < 2) return [];
    const params = new URLSearchParams({
        address: query, key: API_KEY, language,
        components: `country:${countryCode}`,
    });
    metrics.apiCall.googleGeocode();
    const data = await fetchJson(`${MAPS_BASE}/geocode/json?${params}`);
    if (data.status !== 'OK') {
        if (data.status !== 'ZERO_RESULTS') {
            logger.warn(`Google Geocoding status=${data.status}`, 'google.provider');
        }
        return [];
    }
    return data.results.map(normalizeGeocode).filter(Boolean);
}

async function reverseGeocode(lat, lng, { language = 'ka' } = {}) {
    if (!API_KEY) return null;
    const params = new URLSearchParams({
        latlng: `${lat},${lng}`, key: API_KEY, language,
    });
    metrics.apiCall.googleGeocode();
    const data = await fetchJson(`${MAPS_BASE}/geocode/json?${params}`);
    if (data.status !== 'OK' || !data.results?.[0]) return null;
    return normalizeGeocode(data.results[0]);
}

// ── Autocomplete (Places) ───────────────────────────────────────────────────

async function autocomplete(input, { language = 'ka', countryCode = 'GE', location, radius = 50000, sessionToken } = {}) {
    requireKey();
    if (!input || input.length < 2) return [];

    const params = new URLSearchParams({
        input, key: API_KEY, language,
        components: `country:${countryCode}`,
    });
    if (location) {
        params.set('location', `${location.lat},${location.lng}`);
        params.set('radius', String(radius));
    }
    if (sessionToken) params.set('sessiontoken', sessionToken);

    metrics.apiCall.googleAutocomplete();
    const data = await fetchJson(`${MAPS_BASE}/place/autocomplete/json?${params}`);
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
        throw new Error(`Google Places status=${data.status}`);
    }
    return (data.predictions || []).map(p => ({
        placeId: p.place_id,
        description: p.description,
        mainText: p.structured_formatting?.main_text || p.description,
        secondaryText: p.structured_formatting?.secondary_text || '',
        types: p.types || [],
        provider: 'google',
    }));
}

async function placeDetails(placeId, { language = 'ka', sessionToken } = {}) {
    requireKey();
    const params = new URLSearchParams({
        place_id: placeId, key: API_KEY, language,
        fields: 'place_id,formatted_address,geometry,address_components,name,types',
    });
    if (sessionToken) params.set('sessiontoken', sessionToken);

    metrics.apiCall.googleDetails();
    const data = await fetchJson(`${MAPS_BASE}/place/details/json?${params}`);
    if (data.status !== 'OK' || !data.result) return null;
    const r = data.result;
    return {
        coords: { lat: r.geometry.location.lat, lng: r.geometry.location.lng },
        address: r.formatted_address,
        name: r.name || null,
        components: r.address_components,
        canonicalId: `goog:${r.place_id}`,
        provider: 'google',
        types: r.types || [],
    };
}

// ── Roads (snap-to-road) ────────────────────────────────────────────────────

async function snapToRoads(points, { interpolate = true } = {}) {
    requireKey();
    if (!Array.isArray(points) || points.length === 0) return [];
    if (points.length > 100) throw new Error('Max 100 points per snap request');

    const path = points.map(p => `${p.lat},${p.lng}`).join('|');
    const url = `${ROADS_BASE}/snapToRoads?path=${encodeURIComponent(path)}` +
        `&interpolate=${interpolate}&key=${API_KEY}`;

    const data = await fetchJson(url);
    if (data.error) throw new Error(`Google Roads: ${data.error.message}`);
    return (data.snappedPoints || []).map(p => ({
        coords: { lat: p.location.latitude, lng: p.location.longitude },
        originalIndex: p.originalIndex,
        placeId: p.placeId,
    }));
}

module.exports = {
    name: 'google',
    getRoute,
    getMatrix,
    forwardGeocode,
    reverseGeocode,
    autocomplete,
    placeDetails,
    snapToRoads,
};
