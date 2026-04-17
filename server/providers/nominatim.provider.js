'use strict';

/**
 * Nominatim Provider — primary geocoding + fallback autocomplete.
 *
 * Unified contract (shared with google.provider):
 *   forwardGeocode(query, opts) → Array<UnifiedPlace>
 *   reverseGeocode(lat, lng, opts) → UnifiedPlace | null
 *
 * UnifiedPlace shape:
 *   { coords:{lat,lng}, address, components, canonicalId, provider, confidence }
 *
 * Responsibilities:
 *   - Rate limiting (1 req/sec per Nominatim policy) — stays here, transport-level concern
 *   - HTTP transport + response normalization
 *   - NO caching (service layer handles that via cache.service)
 */

const logger = require('../utils/logger');

const NOMINATIM_BASE = process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org';
const USER_AGENT    = process.env.NOMINATIM_USER_AGENT || 'Lulini/1.0 (ride-hailing; contact@lulini.ge)';
const MIN_INTERVAL_MS = 1100;
const FETCH_TIMEOUT_MS = 8000;

// ── Global request serializer: 1 req/sec ──
let lastRequestTime = 0;
let requestQueue = Promise.resolve();

function enqueue(fn) {
    requestQueue = requestQueue.then(async () => {
        const wait = MIN_INTERVAL_MS - (Date.now() - lastRequestTime);
        if (wait > 0) await new Promise(r => setTimeout(r, wait));
        lastRequestTime = Date.now();
        return fn();
    }).catch(err => {
        logger.warn('Nominatim request failed in queue', 'nominatim.provider', err);
        throw err;
    });
    return requestQueue;
}

function normalize(r) {
    if (!r || r.error) return null;
    return {
        coords: { lat: parseFloat(r.lat), lng: parseFloat(r.lon) },
        address: r.display_name,
        components: r.address || null,
        canonicalId: `osm:${r.osm_type}:${r.osm_id}`,
        provider: 'nominatim',
        confidence: typeof r.importance === 'number' ? r.importance : 0.5,
        boundingBox: r.boundingbox ? r.boundingbox.map(Number) : null,
        category: r.category || null,
        type: r.type || null,
    };
}

async function forwardGeocode(query, { countryCode = 'GE', language = 'ka,en', viewbox, limit = 5 } = {}) {
    if (!query || query.length < 2) return [];

    const results = await enqueue(async () => {
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

        const res = await fetch(`${NOMINATIM_BASE}/search?${params}`, {
            headers: { 'User-Agent': USER_AGENT },
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (!res.ok) throw new Error(`Nominatim search HTTP ${res.status}`);
        return res.json();
    });

    return (results || []).map(normalize).filter(Boolean);
}

async function reverseGeocode(lat, lng, { language = 'ka,en' } = {}) {
    const result = await enqueue(async () => {
        const params = new URLSearchParams({
            lat: String(lat),
            lon: String(lng),
            format: 'jsonv2',
            addressdetails: '1',
            'accept-language': language,
        });

        const res = await fetch(`${NOMINATIM_BASE}/reverse?${params}`, {
            headers: { 'User-Agent': USER_AGENT },
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (!res.ok) throw new Error(`Nominatim reverse HTTP ${res.status}`);
        return res.json();
    });

    return normalize(result);
}

module.exports = {
    name: 'nominatim',
    forwardGeocode,
    reverseGeocode,
};
