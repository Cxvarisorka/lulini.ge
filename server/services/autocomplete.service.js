'use strict';

/**
 * Autocomplete Service — predictive place suggestions.
 *
 * Strategy (split by intent):
 *   - Nominatim → addresses (streets, house numbers, neighborhoods). Primary.
 *   - Google Places → POIs (restaurants, brands, businesses). Primary.
 *   Both run IN PARALLEL and results are merged + deduped.
 *
 * Unified prediction:
 *   { placeId, description, mainText, secondaryText, coords?, provider, kind }
 *      kind: 'address' (from Nominatim) | 'poi' (from Google)
 *
 * Dedupe:
 *   Group by normalized (mainText + secondaryText). When duplicates appear,
 *   keep the one with coordinates (usually Nominatim), drop the other.
 */

const google = require('../providers/google.provider');
const nominatim = require('../providers/nominatim.provider');
const cache = require('./cache.service');
const logger = require('../utils/logger');

const MAX_RESULTS = 8;

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

function biasKey(opts) {
    if (!opts?.location) return '';
    return `${cache.roundCoord(opts.location.lat)},${cache.roundCoord(opts.location.lng)}:${opts.radius || 50000}`;
}

// ── Providers wrapped as "get predictions" ────────────────────────────────

async function nominatimPredictions(input, opts) {
    const viewbox = opts.location
        ? `${opts.location.lng - 0.3},${opts.location.lat + 0.3},${opts.location.lng + 0.3},${opts.location.lat - 0.3}`
        : undefined;

    const places = await nominatim.forwardGeocode(input, {
        countryCode: opts.countryCode || 'GE',
        language: opts.language || 'ka,en',
        viewbox,
        limit: 8,
    });

    return places.map(p => {
        const [mainText, ...restParts] = (p.address || '').split(',');
        return {
            placeId: p.canonicalId,
            description: p.address,
            mainText: (mainText || '').trim() || p.address,
            secondaryText: restParts.slice(0, 2).join(',').trim(),
            coords: p.coords,
            provider: 'nominatim',
            kind: 'address',
        };
    });
}

async function googlePredictions(input, opts) {
    const predictions = await google.autocomplete(input, opts);
    return predictions.map(p => ({
        placeId: `goog:${p.placeId}`,
        description: p.description,
        mainText: p.mainText,
        secondaryText: p.secondaryText,
        coords: null, // requires /place-details to resolve
        provider: 'google',
        kind: 'poi',
    }));
}

// ── Merge + dedupe ────────────────────────────────────────────────────────

function normalize(s) {
    return (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function dedupeKey(p) {
    return `${normalize(p.mainText)}|${normalize(p.secondaryText)}`;
}

function merge(nominatimList, googleList) {
    const byKey = new Map();

    // Nominatim first — they already have coords (cheap for the client).
    for (const p of nominatimList) {
        const k = dedupeKey(p);
        if (!byKey.has(k)) byKey.set(k, p);
    }

    // Google POIs only added if mainText doesn't already exist as an address.
    for (const p of googleList) {
        const k = dedupeKey(p);
        if (!byKey.has(k)) byKey.set(k, p);
    }

    // Order: addresses first, then POIs — matches user's intent
    // (people typing street names want the address, not a nearby business).
    const list = Array.from(byKey.values());
    list.sort((a, b) => {
        if (a.kind === b.kind) return 0;
        return a.kind === 'address' ? -1 : 1;
    });
    return list.slice(0, MAX_RESULTS);
}

// ── Public API ────────────────────────────────────────────────────────────

async function getPredictions(input, opts = {}) {
    if (!input || input.trim().length < 2) {
        return { predictions: [], provider: null, cached: false };
    }

    const key = cache.keys.autocomplete('merged', input, biasKey(opts));
    const cached = await cache.get(key);
    if (cached) return { predictions: cached, provider: 'merged', cached: true };

    // Parallel: Nominatim (addresses) + Google (POIs) — results are merged + deduped.
    const [nomRes, gRes] = await Promise.allSettled([
        withHealth('nominatim', () => nominatimPredictions(input, opts)),
        withHealth('google',    () => googlePredictions(input, opts)),
    ]);

    if (nomRes.status === 'rejected') {
        logger.warn(`Nominatim autocomplete failed: ${nomRes.reason?.message}`, 'autocomplete.service');
    }
    if (gRes.status === 'rejected') {
        logger.warn(`Google autocomplete failed: ${gRes.reason?.message}`, 'autocomplete.service');
    }

    const nominatimList = nomRes.status === 'fulfilled' ? nomRes.value : [];
    const googleList    = gRes.status === 'fulfilled' ? gRes.value : [];

    const predictions = merge(nominatimList, googleList);

    if (predictions.length > 0) {
        await cache.set(key, predictions, cache.TTL.AUTOCOMPLETE);
    }
    return { predictions, provider: 'merged', cached: false };
}

/**
 * Resolve a prediction placeId → coords + full address.
 * Google POIs: Place Details API.
 * Nominatim addresses: coords are already in the prediction (client should keep them).
 */
async function resolvePrediction(placeId, opts = {}) {
    if (!placeId) return null;
    if (placeId.startsWith('goog:')) {
        return google.placeDetails(placeId.slice(5), opts);
    }
    return null;
}

module.exports = { getPredictions, resolvePrediction };
