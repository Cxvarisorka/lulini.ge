'use strict';

/**
 * Geocoding Cache Service
 *
 * Redis-backed cache for forward and reverse geocoding results.
 * Falls back silently (returns null) if Redis is unavailable — callers
 * always proceed to the live API when the cache misses.
 *
 * Key strategy:
 *   Forward:  geo:fwd:{provider}:{sha256(query|country)[:16]}   TTL 24h
 *   Reverse:  geo:rev:{provider}:{lat4},{lng4}                  TTL 24h
 */

const crypto = require('crypto');

// TTLs in seconds
const FWD_TTL = 86400;  // 24 hours
const REV_TTL = 86400;  // 24 hours
const COORD_PRECISION = 4; // ~11m — matches maps.controller.js rounding

let _redis = null;
async function getRedis() {
    if (_redis && _redis.isReady) return _redis;
    try {
        const { getRedisClient } = require('../configs/redis.config');
        _redis = await getRedisClient();
        return _redis;
    } catch {
        return null;
    }
}

// ── Key builders ──

function fwdKey(provider, query, countryCode = 'GE') {
    const hash = crypto.createHash('sha256')
        .update(`${query.trim().toLowerCase()}|${countryCode.toUpperCase()}`)
        .digest('hex')
        .slice(0, 16);
    return `geo:fwd:${provider}:${hash}`;
}

function revKey(provider, lat, lng) {
    const rLat = parseFloat(lat).toFixed(COORD_PRECISION);
    const rLng = parseFloat(lng).toFixed(COORD_PRECISION);
    return `geo:rev:${provider}:${rLat},${rLng}`;
}

// ── Forward geocode cache ──

async function getCachedForward(provider, query, countryCode) {
    try {
        const redis = await getRedis();
        if (!redis) return null;
        const data = await redis.get(fwdKey(provider, query, countryCode));
        return data ? JSON.parse(data) : null;
    } catch {
        return null;
    }
}

async function setCachedForward(provider, query, countryCode, results) {
    try {
        const redis = await getRedis();
        if (!redis) return;
        await redis.set(
            fwdKey(provider, query, countryCode),
            JSON.stringify(results),
            { EX: FWD_TTL }
        );
    } catch { /* non-fatal */ }
}

// ── Reverse geocode cache ──

async function getCachedReverse(provider, lat, lng) {
    try {
        const redis = await getRedis();
        if (!redis) return null;
        const data = await redis.get(revKey(provider, lat, lng));
        return data ? JSON.parse(data) : null;
    } catch {
        return null;
    }
}

async function setCachedReverse(provider, lat, lng, results) {
    try {
        const redis = await getRedis();
        if (!redis) return;
        await redis.set(
            revKey(provider, lat, lng),
            JSON.stringify(results),
            { EX: REV_TTL }
        );
    } catch { /* non-fatal */ }
}

module.exports = {
    getCachedForward, setCachedForward,
    getCachedReverse, setCachedReverse,
    // Exported for testing
    fwdKey, revKey,
};
