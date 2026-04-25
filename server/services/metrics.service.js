'use strict';

/**
 * Metrics Service — daily-bucket counters for maps API cost & cache hygiene.
 *
 * Thin Redis INCR wrapper. All keys roll up by UTC day (`YYYY-MM-DD`) so a
 * single fetch across the last N buckets gives a per-day timeseries without
 * scanning Redis or storing per-call rows.
 *
 * Counters used today:
 *   metrics:api:google:autocomplete:{day}
 *   metrics:api:google:details:{day}
 *   metrics:api:google:geocode:{day}
 *   metrics:api:nominatim:{day}
 *   metrics:cache:autocomplete:{hit|miss}:{day}
 *   metrics:cache:details:{hit|miss}:{day}
 *
 * Silent on Redis failure — instrumentation must never break a request.
 */

const { getRedisClient } = require('../configs/redis.config');

const RETENTION_SECONDS = 14 * 86400; // keep ~2 weeks per bucket

function todayKey(d = new Date()) {
    return d.toISOString().slice(0, 10); // UTC YYYY-MM-DD
}

function lastNDays(n) {
    const out = [];
    const ms = 86400 * 1000;
    const now = Date.now();
    for (let i = 0; i < n; i++) {
        out.push(new Date(now - i * ms).toISOString().slice(0, 10));
    }
    return out;
}

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

async function incr(metric, by = 1) {
    try {
        const r = await redis();
        if (!r) return;
        const key = `metrics:${metric}:${todayKey()}`;
        await r.incrBy(key, by);
        await r.expire(key, RETENTION_SECONDS);
    } catch { /* non-fatal */ }
}

// ── Provider call counters ──
const apiCall = {
    googleAutocomplete: () => incr('api:google:autocomplete'),
    googleDetails:      () => incr('api:google:details'),
    googleGeocode:      () => incr('api:google:geocode'),
    googleMatrix:       () => incr('api:google:matrix'),
    googleDirections:   () => incr('api:google:directions'),
    nominatim:          () => incr('api:nominatim'),
};

// ── Cache hit/miss counters ──
function cacheOutcome(kind, hit) {
    return incr(`cache:${kind}:${hit ? 'hit' : 'miss'}`);
}

// ── Read API for admin dashboard ──
async function getMetrics(days = 7) {
    const r = await redis();
    if (!r) return { days: [], totals: {} };

    const dayKeys = lastNDays(days);
    const groups = {
        api: ['google:autocomplete', 'google:details', 'google:geocode', 'google:matrix', 'google:directions', 'nominatim'],
        cache: ['autocomplete:hit', 'autocomplete:miss', 'details:hit', 'details:miss', 'placeMongo:hit', 'placeMongo:miss'],
    };

    const result = { days: dayKeys, daily: {}, totals: {} };

    for (const day of dayKeys) result.daily[day] = {};

    for (const [group, names] of Object.entries(groups)) {
        for (const name of names) {
            const fullName = `${group}:${name}`;
            let total = 0;
            for (const day of dayKeys) {
                const key = `metrics:${fullName}:${day}`;
                let v = 0;
                try { v = parseInt(await r.get(key), 10) || 0; } catch { v = 0; }
                result.daily[day][fullName] = v;
                total += v;
            }
            result.totals[fullName] = total;
        }
    }

    // Derive ratios
    const a = result.totals;
    const acHit = a['cache:autocomplete:hit'] || 0;
    const acMiss = a['cache:autocomplete:miss'] || 0;
    const dHit = a['cache:details:hit'] || 0;
    const dMiss = a['cache:details:miss'] || 0;
    result.ratios = {
        autocompleteHitRate: (acHit + acMiss) > 0 ? Math.round((acHit / (acHit + acMiss)) * 1000) / 10 : 0,
        detailsHitRate:      (dHit + dMiss) > 0 ? Math.round((dHit / (dHit + dMiss)) * 1000) / 10 : 0,
    };

    return result;
}

module.exports = {
    apiCall,
    cacheOutcome,
    getMetrics,
};
