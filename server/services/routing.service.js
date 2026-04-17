'use strict';

/**
 * Routing Service — single entry point for all route / matrix queries.
 *
 * Primary:  OSRM (free, self-host option)
 * Fallback: Google Directions / Distance Matrix
 *
 * Unified response contract:
 *   getRoute(origin, destination)     →
 *     { distanceMeters, durationSeconds, polyline, provider, cached, extras? }
 *   getMatrix(origins, destinations)  →
 *     { durations, distances, provider, cached }
 *
 * Fallback rule (consistent across all services):
 *   primary fails OR timeout > ~2s OR throws → try fallback once, then error.
 *
 * Caching: Redis-only via cache.service (no per-service in-memory).
 */

const osrm = require('../providers/osrm.provider');
const google = require('../providers/google.provider');
const cache = require('./cache.service');
const logger = require('../utils/logger');

async function withHealth(providerName, fn) {
    const start = Date.now();
    try {
        const result = await fn();
        cache.recordProviderOutcome(providerName, true, Date.now() - start);
        return result;
    } catch (err) {
        cache.recordProviderOutcome(providerName, false, Date.now() - start);
        throw err;
    }
}

async function tryChain(primaryName, primaryFn, fallbackName, fallbackFn) {
    try {
        return await withHealth(primaryName, primaryFn);
    } catch (err) {
        logger.warn(`${primaryName} failed, falling back to ${fallbackName}: ${err.message}`, 'routing.service');
        return withHealth(fallbackName, fallbackFn);
    }
}

// ── getRoute ────────────────────────────────────────────────────────────────

async function getRoute(origin, destination, { profile = 'driving', steps = false } = {}) {
    if (!origin || !destination) throw new Error('origin and destination required');

    // Steps bloat the cache — use a separate key namespace for stepped routes.
    const baseKey = cache.keys.route(origin.lat, origin.lng, destination.lat, destination.lng, profile);
    const key = steps ? `${baseKey}:steps` : baseKey;
    const cached = await cache.get(key);
    if (cached) return { ...cached, cached: true };

    const result = await tryChain(
        'osrm',   () => osrm.getRoute({ origin, destination, profile, steps }),
        'google', () => google.getRoute({ origin, destination }),
    );

    await cache.set(key, result, cache.TTL.ROUTE);
    return { ...result, cached: false };
}

// ── getMatrix ───────────────────────────────────────────────────────────────

async function getMatrix(origins, destinations, { profile = 'driving' } = {}) {
    if (!Array.isArray(origins) || !Array.isArray(destinations) ||
        origins.length === 0 || destinations.length === 0) {
        throw new Error('origins and destinations must be non-empty arrays');
    }

    const key = cache.keys.matrix(origins, destinations, profile);
    const cached = await cache.get(key);
    if (cached) return { ...cached, cached: true };

    const result = await tryChain(
        'osrm',   () => osrm.getMatrix({ origins, destinations, profile }),
        'google', () => google.getMatrix({ origins, destinations }),
    );

    await cache.set(key, result, cache.TTL.MATRIX);
    return { ...result, cached: false };
}

module.exports = { getRoute, getMatrix };
