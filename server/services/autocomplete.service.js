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
const metrics = require('./metrics.service');
const places = require('./places.service');
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

// Phase 2.2: bias coord precision dropped from ~11m (4 decimals) to ~11km
// (1 decimal). Most autocomplete results are stable across that range and
// dropping precision dramatically reduces cache key churn from a moving GPS.
function biasKey(opts) {
    if (!opts?.location) return '';
    const lat = parseFloat(opts.location.lat).toFixed(1);
    const lng = parseFloat(opts.location.lng).toFixed(1);
    return `${lat},${lng}:${opts.radius || 50000}`;
}

// ── Providers wrapped as "get predictions" ────────────────────────────────

async function nominatimPredictions(input, opts) {
    const viewbox = opts.location
        ? `${opts.location.lng - 0.3},${opts.location.lat + 0.3},${opts.location.lng + 0.3},${opts.location.lat - 0.3}`
        : undefined;

    const results = await nominatim.forwardGeocode(input, {
        countryCode: opts.countryCode || 'GE',
        language: opts.language || 'ka,en',
        viewbox,
        limit: 8,
    });

    return results.map(p => {
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

function merge(mongoList, nominatimList, googleList) {
    const byKey = new Map();
    const byCanonical = new Set();

    // Phase 3.3: Mongo "known" places first — they're verified, popular, and
    // come with coords pre-attached so the client skips /place-details.
    for (const p of mongoList) {
        const k = dedupeKey(p);
        if (!byKey.has(k)) {
            byKey.set(k, p);
            if (p.placeId) byCanonical.add(p.placeId);
        }
    }

    // Nominatim — they already have coords (cheap for the client).
    for (const p of nominatimList) {
        if (p.placeId && byCanonical.has(p.placeId)) continue;
        const k = dedupeKey(p);
        if (!byKey.has(k)) byKey.set(k, p);
    }

    // Google POIs only added if mainText doesn't already exist.
    for (const p of googleList) {
        if (p.placeId && byCanonical.has(p.placeId)) continue;
        const k = dedupeKey(p);
        if (!byKey.has(k)) byKey.set(k, p);
    }

    // Order: known places first, then addresses, then POIs.
    const rank = (kind) => kind === 'known' ? 0 : kind === 'address' ? 1 : 2;
    const list = Array.from(byKey.values());
    list.sort((a, b) => rank(a.kind) - rank(b.kind));
    return list.slice(0, MAX_RESULTS);
}

// ── Public API ────────────────────────────────────────────────────────────

// Phase 2.1: tiered strategy — when the query reads as an address (most common
// rideshare case in Georgia), Nominatim alone is enough and we avoid Google.
// We only call Google when (a) Nominatim is sparse OR (b) the query reads
// like a POI / brand name. Heuristic must be cheap; tune via feature flag.
const POI_KEYWORDS = [
    // EN
    'cafe', 'café', 'hotel', 'pharmacy', 'restaurant', 'bar', 'mall',
    'market', 'bank', 'gym', 'clinic', 'station', 'shop', 'store',
    'church', 'museum', 'park', 'school', 'library',
    // KA
    'კაფე', 'სასტუმრო', 'აფთიაქი', 'რესტორანი', 'ბარი', 'მოლი',
    'ბაზარი', 'ბანკი', 'სავარჯიშო', 'კლინიკა', 'სადგური', 'მაღაზია',
    'ეკლესია', 'მუზეუმი', 'პარკი', 'სკოლა', 'ბიბლიოთეკა',
];
const MIN_RESULTS_BEFORE_GOOGLE = 4;

function looksLikePOI(input) {
    const q = input.trim().toLowerCase();
    if (!q) return false;
    // No digits AND ≤2 tokens → likely brand / single-word POI
    const noDigits = !/\d/.test(q);
    const tokens = q.split(/\s+/);
    if (noDigits && tokens.length <= 2) return true;
    // Contains a known POI keyword
    return POI_KEYWORDS.some(k => q.includes(k));
}

function tieringEnabled() {
    const v = process.env.MAPS_TIERED_AUTOCOMPLETE;
    return v === '1' || (typeof v === 'string' && v.toLowerCase() === 'true');
}

async function getPredictions(input, opts = {}) {
    // Phase 1.4: align with client min-chars (3). Reduces noise + saves API hits.
    if (!input || input.trim().length < 3) {
        return { predictions: [], provider: null, cached: false };
    }

    const language = opts.language || 'ka';
    const key = cache.keys.autocomplete('merged', input, biasKey(opts), language);
    const cached = await cache.get(key);
    if (cached !== null) {
        metrics.cacheOutcome('autocomplete', true);
        return { predictions: cached, provider: 'merged', cached: true };
    }
    metrics.cacheOutcome('autocomplete', false);

    // Phase 3.3: MongoDB warm cache — known places hit before any provider.
    // Mongo predictions arrive with coords already attached, so the client
    // never needs to call /place-details for them.
    let mongoPredictions = [];
    try {
        const docs = await places.searchPlaces(input, 4);
        mongoPredictions = docs.map(places.toPrediction).filter(Boolean);
    } catch { /* non-fatal */ }
    metrics.cacheOutcome('placeMongo', mongoPredictions.length > 0);

    let predictions;

    if (tieringEnabled()) {
        // Tiered: Nominatim first; only call Google if we have to.
        let nominatimList = [];
        try {
            nominatimList = await withHealth('nominatim', () => nominatimPredictions(input, opts));
        } catch (err) {
            logger.warn(`Nominatim autocomplete failed: ${err.message}`, 'autocomplete.service');
        }

        const haveEnough = (mongoPredictions.length + nominatimList.length) >= MIN_RESULTS_BEFORE_GOOGLE;
        const skipGoogle = haveEnough && !looksLikePOI(input);

        let googleList = [];
        if (!skipGoogle) {
            try {
                googleList = await withHealth('google', () => googlePredictions(input, opts));
            } catch (err) {
                logger.warn(`Google autocomplete failed: ${err.message}`, 'autocomplete.service');
            }
        }

        predictions = merge(mongoPredictions, nominatimList, googleList);
    } else {
        // Legacy: Nominatim + Google in parallel.
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

        predictions = merge(mongoPredictions, nominatimList, googleList);
    }

    // Phase 1.3: cache empty results too (short TTL) — stops repeated typos
    // from re-hitting Google on every keystroke. Full TTL when populated.
    const ttl = predictions.length > 0 ? cache.TTL.AUTOCOMPLETE : cache.TTL.AUTOCOMPLETE_NEG;
    await cache.set(key, predictions, ttl);
    return { predictions, provider: 'merged', cached: false };
}

/**
 * Resolve a prediction placeId → coords + full address.
 *
 * Lookup order:
 *   1. Redis cache (placeDetails:{placeId}, 30d TTL) — Phase 1.2
 *   2. MongoDB Place by canonicalId — Phase 3.3 (warm + free)
 *   3. Google Place Details API (only for goog:* placeIds)
 *
 * Nominatim/known placeIds are resolved locally — no Google call ever.
 * Google results are written through to both Redis (hot) and Mongo (warm).
 */
async function resolvePrediction(placeId, opts = {}) {
    if (!placeId) return null;

    const language = opts.language || 'ka';
    const key = cache.keys.placeDetails(placeId, language);

    // 1. Redis hot cache
    const cached = await cache.get(key);
    if (cached !== null) {
        metrics.cacheOutcome('details', true);
        return cached;
    }
    metrics.cacheOutcome('details', false);

    // 2. Mongo warm cache (covers both osm: and goog: ids that we've seen before)
    const mongoDoc = await places.findByCanonicalId(placeId);
    if (mongoDoc) {
        const result = places.toDetails(mongoDoc);
        // Promote to Redis so the next lookup is a hot hit
        await cache.set(key, result, cache.TTL.PLACE_DETAILS);
        return result;
    }

    // 3. Cold path: Google (only goog:* IDs go to Google)
    if (!placeId.startsWith('goog:')) return null;

    const result = await google.placeDetails(placeId.slice(5), opts);
    if (result) {
        await cache.set(key, result, cache.TTL.PLACE_DETAILS);
        // Write-through to Mongo (fire-and-forget)
        places.upsertPlace(result).catch(() => {});
    }
    return result;
}

module.exports = { getPredictions, resolvePrediction };
