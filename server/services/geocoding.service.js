'use strict';

/**
 * Geocoding Service — single entry point for address ↔ coordinates.
 *
 * Primary:  Nominatim (free)
 * Fallback: Google Geocoding
 *
 * Supersedes: locationService.js + geocodingCache.service.js
 * (both kept in place until Phase 3 migration is complete)
 *
 * Unified response:
 *   { coords:{lat,lng}, address, components, canonicalId, provider, cached, confidence }
 */

const nominatim = require('../providers/nominatim.provider');
const google = require('../providers/google.provider');
const cache = require('./cache.service');
const logger = require('../utils/logger');

async function withHealth(name, fn) {
    const start = Date.now();
    try {
        const r = await fn();
        cache.recordProviderOutcome(name, true, Date.now() - start);
        return r;
    } catch (err) {
        cache.recordProviderOutcome(name, false, Date.now() - start);
        throw err;
    }
}

/**
 * Forward geocode with provider fallback.
 * Returns the first non-empty result set.
 */
async function forwardGeocode(query, opts = {}) {
    if (!query || query.trim().length < 2) return { results: [], provider: null, cached: false };

    const countryCode = (opts.countryCode || 'GE').toUpperCase();

    // Primary cache (Nominatim)
    const nomKey = cache.keys.geoFwd('nominatim', query, countryCode);
    const nomCached = await cache.get(nomKey);
    if (nomCached && nomCached.length > 0) {
        return { results: nomCached, provider: 'nominatim', cached: true };
    }

    try {
        const results = await withHealth('nominatim', () => nominatim.forwardGeocode(query, opts));
        if (results.length > 0) {
            await cache.set(nomKey, results, cache.TTL.GEO_FWD);
            return { results, provider: 'nominatim', cached: false };
        }
    } catch (err) {
        logger.warn(`Nominatim fwd failed, trying Google: ${err.message}`, 'geocoding.service');
    }

    // Fallback: Google
    const gKey = cache.keys.geoFwd('google', query, countryCode);
    const gCached = await cache.get(gKey);
    if (gCached && gCached.length > 0) {
        return { results: gCached, provider: 'google', cached: true };
    }

    try {
        const results = await withHealth('google', () => google.forwardGeocode(query, opts));
        if (results.length > 0) {
            await cache.set(gKey, results, cache.TTL.GEO_FWD);
        }
        return { results, provider: 'google', cached: false };
    } catch (err) {
        logger.warn(`Google fwd also failed: ${err.message}`, 'geocoding.service');
        return { results: [], provider: null, cached: false };
    }
}

/**
 * Reverse geocode with provider fallback.
 */
async function reverseGeocode(lat, lng, opts = {}) {
    if (typeof lat !== 'number' || typeof lng !== 'number') {
        throw new Error('lat and lng must be numbers');
    }

    const nomKey = cache.keys.geoRev('nominatim', lat, lng);
    const nomCached = await cache.get(nomKey);
    if (nomCached) return { ...nomCached, cached: true };

    try {
        const r = await withHealth('nominatim', () => nominatim.reverseGeocode(lat, lng, opts));
        if (r) {
            await cache.set(nomKey, r, cache.TTL.GEO_REV);
            return { ...r, cached: false };
        }
    } catch (err) {
        logger.warn(`Nominatim rev failed, trying Google: ${err.message}`, 'geocoding.service');
    }

    const gKey = cache.keys.geoRev('google', lat, lng);
    const gCached = await cache.get(gKey);
    if (gCached) return { ...gCached, cached: true };

    try {
        const r = await withHealth('google', () => google.reverseGeocode(lat, lng, opts));
        if (r) {
            await cache.set(gKey, r, cache.TTL.GEO_REV);
            return { ...r, cached: false };
        }
    } catch (err) {
        logger.warn(`Google rev also failed: ${err.message}`, 'geocoding.service');
    }

    return null;
}

module.exports = { forwardGeocode, reverseGeocode };
