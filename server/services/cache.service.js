'use strict';

/**
 * Cache Service — single source of truth for all maps/geocoding caching.
 *
 * Replaces:
 *   - In-memory LRU in maps.controller.js
 *   - geocodingCache.service.js (still exists, will be removed in Phase 3)
 *
 * Design:
 *   - Redis-only. If Redis is unavailable, every call no-ops (get → null, set → noop).
 *   - Single namespace + key builder policy → unified TTLs, unified coord rounding.
 *   - No per-caller key construction; callers pass the logical kind + identifying fields.
 */

const crypto = require('crypto');
const { getRedisClient } = require('../configs/redis.config');
const logger = require('../utils/logger');

// ── TTL policy (seconds) ──
const TTL = Object.freeze({
    ROUTE:           300,        // 5 min
    MATRIX:          120,        // 2 min — freshness matters for dispatch
    GEO_FWD:         86400,      // 24h
    GEO_REV:         86400,      // 24h
    AUTOCOMPLETE:    86400,      // 24h — predictions are stable (Phase 2.4 bumped from 10 min)
    AUTOCOMPLETE_NEG: 300,       // 5 min — negative results: short TTL to recover fast
    PLACE_DETAILS:   86400 * 30, // 30d — Google place details rarely change
    SNAP:            3600,       // 1h
});

const COORD_PRECISION = 4; // ~11m

function roundCoord(n) {
    return parseFloat(n).toFixed(COORD_PRECISION);
}

function hash(input) {
    return crypto.createHash('sha256').update(input).digest('hex').slice(0, 16);
}

// Phase 2.5: Unicode NFC normalization collapses duplicate cache entries from
// differently-composed Georgian (and other) characters. Trim + lowercase to
// match server-side casing rules.
function normalizeQuery(s) {
    if (!s) return '';
    return s.trim().normalize('NFC').toLowerCase();
}

// ── Key builders ──
const keys = {
    route: (oLat, oLng, dLat, dLng, profile = 'driving') =>
        `route:${profile}:${roundCoord(oLat)},${roundCoord(oLng)}-${roundCoord(dLat)},${roundCoord(dLng)}`,

    matrix: (origins, destinations, profile = 'driving') => {
        const o = origins.map(p => `${roundCoord(p.lat)},${roundCoord(p.lng)}`).join('|');
        const d = destinations.map(p => `${roundCoord(p.lat)},${roundCoord(p.lng)}`).join('|');
        return `matrix:${profile}:${hash(`${o}>${d}`)}`;
    },

    geoFwd: (provider, query, countryCode = 'GE', language = 'ka') =>
        `geo:fwd:${provider}:${hash(`${normalizeQuery(query)}|${countryCode.toUpperCase()}|${language}`)}`,

    geoRev: (provider, lat, lng, language = 'ka') =>
        `geo:rev:${provider}:${roundCoord(lat)},${roundCoord(lng)}:${language}`,

    autocomplete: (provider, query, biasKey = '', language = 'ka') =>
        `autocomplete:${provider}:${hash(`${normalizeQuery(query)}|${biasKey}|${language}`)}`,

    placeDetails: (placeId, language = 'ka') =>
        `placeDetails:${hash(`${placeId}|${language}`)}`,

    snap: (points) =>
        `snap:${hash(points.map(p => `${roundCoord(p.lat)},${roundCoord(p.lng)}`).join('|'))}`,

    providerHealth: (name) => `provider:health:${name}`,
};

// ── Redis access (silent on failure) ──

let _redis = null;
async function redis() {
    if (_redis && _redis.isReady) return _redis;
    try {
        _redis = await getRedisClient();
        return _redis;
    } catch {
        return null;
    }
}

async function get(key) {
    try {
        const r = await redis();
        if (!r) return null;
        const raw = await r.get(key);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

async function set(key, value, ttlSeconds) {
    try {
        const r = await redis();
        if (!r) return;
        await r.set(key, JSON.stringify(value), { EX: ttlSeconds });
    } catch { /* non-fatal */ }
}

// ── Provider health counters (replaces in-process stats in locationService) ──

async function recordProviderOutcome(name, success, latencyMs) {
    try {
        const r = await redis();
        if (!r) return;
        const key = keys.providerHealth(name);
        const field = success ? 'success' : 'failure';
        await r.hIncrBy(key, field, 1);
        await r.hIncrBy(key, 'totalMs', Math.max(0, Math.round(latencyMs)));
        await r.hIncrBy(key, 'calls', 1);
        await r.expire(key, 86400); // 24h rolling window
    } catch { /* non-fatal */ }
}

async function getProviderHealth() {
    try {
        const r = await redis();
        if (!r) return {};
        const names = ['osrm', 'google', 'nominatim'];
        const out = {};
        for (const name of names) {
            const h = await r.hGetAll(keys.providerHealth(name));
            if (!h || !h.calls) continue;
            const calls = +h.calls, success = +h.success || 0, totalMs = +h.totalMs || 0;
            out[name] = {
                calls,
                success,
                failure: +h.failure || 0,
                avgLatencyMs: calls > 0 ? Math.round(totalMs / calls) : 0,
                successRate: calls > 0 ? Math.round((success / calls) * 1000) / 10 : 0,
            };
        }
        return out;
    } catch (err) {
        logger.warn('getProviderHealth failed', 'cache.service', err);
        return {};
    }
}

module.exports = {
    keys,
    TTL,
    get,
    set,
    roundCoord,
    recordProviderOutcome,
    getProviderHealth,
};
