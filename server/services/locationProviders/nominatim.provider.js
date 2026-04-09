'use strict';

/**
 * Nominatim Location Provider
 *
 * Server-side Nominatim client with:
 *   - Global rate limiting (1 req/sec per Nominatim usage policy)
 *   - Redis-backed geocoding cache (24h TTL)
 *   - Request serialization (queue prevents concurrent requests)
 *   - Proper User-Agent identification
 *
 * Nominatim identity notes:
 *   - osm_type + osm_id = stable, globally unique within OpenStreetMap
 *   - place_id = Nominatim-internal, NOT stable across rebuilds — never use as persistent key
 */

const { getCachedForward, setCachedForward, getCachedReverse, setCachedReverse } = require('../geocodingCache.service');
const logger = require('../../utils/logger');

const NOMINATIM_BASE = process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org';
const USER_AGENT = process.env.NOMINATIM_USER_AGENT || 'Lulini/1.0 (ride-hailing; contact@lulini.ge)';
const MIN_INTERVAL_MS = 1100; // slightly over 1s to stay safe

// ── Request serializer: enforces 1 req/sec globally ──
let lastRequestTime = 0;
let requestQueue = Promise.resolve();

function enqueueRequest(fn) {
    requestQueue = requestQueue.then(async () => {
        const now = Date.now();
        const wait = MIN_INTERVAL_MS - (now - lastRequestTime);
        if (wait > 0) await new Promise(r => setTimeout(r, wait));
        lastRequestTime = Date.now();
        return fn();
    }).catch(err => {
        // Don't let one failed request kill the queue
        logger.warn('Nominatim request failed in queue', 'nominatim', err);
        throw err;
    });
    return requestQueue;
}

// ── Normalized response builder ──

function normalizeSearchResult(r) {
    return {
        displayName: r.display_name,
        formattedAddress: r.display_name,
        lat: parseFloat(r.lat),
        lng: parseFloat(r.lon),
        osmType: r.osm_type,
        osmId: r.osm_id,
        googlePlaceId: null,
        canonicalId: `osm:${r.osm_type}:${r.osm_id}`,
        sourceProvider: 'nominatim',
        category: r.category,
        type: r.type,
        addressComponents: r.address || null,
        boundingBox: r.boundingbox ? r.boundingbox.map(Number) : null,
        confidence: r.importance ?? 0.5,
    };
}

// ── Public API ──

const provider = {
    name: 'nominatim',
    priority: 1, // primary — free, no API key needed

    /**
     * Forward geocode: text query → array of location results.
     */
    async search(query, { countryCode = 'GE', language = 'ka,en', viewbox, limit = 5 } = {}) {
        if (!query || query.length < 2) return [];

        // Check cache first
        const cached = await getCachedForward('nominatim', query, countryCode);
        if (cached) return cached;

        const results = await enqueueRequest(async () => {
            const params = new URLSearchParams({
                q: query,
                format: 'jsonv2',
                addressdetails: '1',
                limit: String(limit),
                countrycodes: countryCode.toLowerCase(),
                'accept-language': language,
            });
            if (viewbox) {
                params.set('viewbox', viewbox);
                params.set('bounded', '0');
            }

            const response = await fetch(`${NOMINATIM_BASE}/search?${params}`, {
                headers: { 'User-Agent': USER_AGENT },
                signal: AbortSignal.timeout(10000),
            });

            if (!response.ok) {
                throw new Error(`Nominatim search returned ${response.status}`);
            }
            return response.json();
        });

        const normalized = results.map(normalizeSearchResult);

        // Cache for 1 hour
        await setCachedForward('nominatim', query, countryCode, normalized);

        return normalized;
    },

    /**
     * Reverse geocode: coordinates → single location result.
     */
    async reverseGeocode(lat, lng, { language = 'ka,en' } = {}) {
        const cached = await getCachedReverse('nominatim', lat, lng);
        if (cached) return cached;

        const result = await enqueueRequest(async () => {
            const params = new URLSearchParams({
                lat: String(lat),
                lon: String(lng),
                format: 'jsonv2',
                addressdetails: '1',
                'accept-language': language,
            });

            const response = await fetch(`${NOMINATIM_BASE}/reverse?${params}`, {
                headers: { 'User-Agent': USER_AGENT },
                signal: AbortSignal.timeout(10000),
            });

            if (!response.ok) {
                throw new Error(`Nominatim reverse returned ${response.status}`);
            }
            return response.json();
        });

        if (!result || result.error) return null;

        const normalized = {
            displayName: result.display_name,
            formattedAddress: result.display_name,
            lat: parseFloat(result.lat),
            lng: parseFloat(result.lon),
            osmType: result.osm_type,
            osmId: result.osm_id,
            googlePlaceId: null,
            canonicalId: `osm:${result.osm_type}:${result.osm_id}`,
            sourceProvider: 'nominatim',
            addressComponents: result.address || null,
            confidence: 1.0,
        };

        await setCachedReverse('nominatim', lat, lng, normalized);
        return normalized;
    },
};

module.exports = provider;
