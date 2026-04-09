'use strict';

/**
 * Google Maps Location Provider
 *
 * Fallback provider for when Nominatim returns empty or fails.
 * Results are cached via the shared geocodingCache service (24h TTL).
 *
 * Google identity: place_id is stable and suitable for canonicalId.
 */

const { getCachedForward, setCachedForward, getCachedReverse, setCachedReverse } = require('../geocodingCache.service');
const logger = require('../../utils/logger');

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const BASE_URL = 'https://maps.googleapis.com/maps/api';

const provider = {
    name: 'google',
    priority: 2, // fallback — paid, requires API key

    /**
     * Forward geocode: text query → array of location results.
     */
    async search(query, { countryCode = 'GE', language = 'ka' } = {}) {
        if (!GOOGLE_MAPS_API_KEY) return [];
        if (!query || query.length < 2) return [];

        const cached = await getCachedForward('google', query, countryCode);
        if (cached) return cached;

        const params = new URLSearchParams({
            address: query,
            key: GOOGLE_MAPS_API_KEY,
            language,
            components: `country:${countryCode}`,
        });

        const response = await fetch(`${BASE_URL}/geocode/json?${params}`, {
            signal: AbortSignal.timeout(10000),
        });
        const data = await response.json();

        if (data.status !== 'OK') {
            if (data.status !== 'ZERO_RESULTS') {
                logger.warn(`Google Geocoding returned: ${data.status}`, 'googleProvider');
            }
            return [];
        }

        const normalized = data.results.map(r => ({
            displayName: r.formatted_address,
            formattedAddress: r.formatted_address,
            lat: r.geometry.location.lat,
            lng: r.geometry.location.lng,
            osmType: null,
            osmId: null,
            googlePlaceId: r.place_id,
            canonicalId: `goog:${r.place_id}`,
            sourceProvider: 'google',
            addressComponents: r.address_components,
            boundingBox: r.geometry.viewport ? [
                r.geometry.viewport.southwest.lat,
                r.geometry.viewport.northeast.lat,
                r.geometry.viewport.southwest.lng,
                r.geometry.viewport.northeast.lng,
            ] : null,
            confidence: r.geometry.location_type === 'ROOFTOP' ? 1.0 : 0.7,
        }));

        await setCachedForward('google', query, countryCode, normalized);
        return normalized;
    },

    /**
     * Reverse geocode: coordinates → single location result.
     */
    async reverseGeocode(lat, lng, { language = 'ka' } = {}) {
        if (!GOOGLE_MAPS_API_KEY) return null;

        const cached = await getCachedReverse('google', lat, lng);
        if (cached) return cached;

        const params = new URLSearchParams({
            latlng: `${lat},${lng}`,
            key: GOOGLE_MAPS_API_KEY,
            language,
        });

        const response = await fetch(`${BASE_URL}/geocode/json?${params}`, {
            signal: AbortSignal.timeout(10000),
        });
        const data = await response.json();

        if (data.status !== 'OK' || !data.results[0]) return null;

        const r = data.results[0];
        const normalized = {
            displayName: r.formatted_address,
            formattedAddress: r.formatted_address,
            lat: r.geometry.location.lat,
            lng: r.geometry.location.lng,
            osmType: null,
            osmId: null,
            googlePlaceId: r.place_id,
            canonicalId: `goog:${r.place_id}`,
            sourceProvider: 'google',
            addressComponents: r.address_components,
            confidence: 1.0,
        };

        await setCachedReverse('google', lat, lng, normalized);
        return normalized;
    },
};

module.exports = provider;
