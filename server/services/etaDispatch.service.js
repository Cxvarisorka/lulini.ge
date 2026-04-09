'use strict';

/**
 * ETA-Based Dispatch Service
 *
 * Two-stage dispatch pipeline:
 *   Stage 1: Redis GEOSEARCH for candidate shortlist (fast, O(log N))
 *   Stage 2: Google Distance Matrix API to rank by real driving ETA
 *
 * Falls back to Haversine-estimated ETA when Google API is unavailable or unconfigured.
 *
 * ETA cache key: eta:{lat3},{lng3}:{lat3},{lng3}  TTL 3min
 */

const driverLocService = require('./driverLocation.service');
const { getEligibleDriverTypes } = require('./driverDispatch.service');
const logger = require('../utils/logger');

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const BASE_URL = 'https://maps.googleapis.com/maps/api';
const ETA_CACHE_TTL = 180; // 3 minutes
const MAX_DM_ORIGINS = 10; // Google Distance Matrix limit: 25 origins, but 10 is safe per request

// ── Redis-backed ETA cache ──

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

function etaCacheKey(oLat, oLng, dLat, dLng) {
    return `eta:${oLat.toFixed(3)},${oLng.toFixed(3)}:${dLat.toFixed(3)},${dLng.toFixed(3)}`;
}

async function getCachedEta(oLat, oLng, dLat, dLng) {
    try {
        const redis = await getRedis();
        if (!redis) return null;
        const data = await redis.get(etaCacheKey(oLat, oLng, dLat, dLng));
        return data ? JSON.parse(data) : null;
    } catch {
        return null;
    }
}

async function setCachedEta(oLat, oLng, dLat, dLng, data) {
    try {
        const redis = await getRedis();
        if (!redis) return;
        await redis.set(etaCacheKey(oLat, oLng, dLat, dLng), JSON.stringify(data), { EX: ETA_CACHE_TTL });
    } catch { /* non-fatal */ }
}

// ── Google Distance Matrix batch fetcher ──

/**
 * Fetch real driving ETAs from Google Distance Matrix for multiple driver→pickup pairs.
 * Returns Map<driverId, { etaSeconds, distanceMeters }>.
 */
async function fetchDriverETAs(drivers, pickup) {
    if (!GOOGLE_MAPS_API_KEY || drivers.length === 0) return new Map();

    const results = new Map();
    const uncached = [];

    // Check cache first for each driver
    for (const d of drivers) {
        const cached = await getCachedEta(d.lat, d.lng, pickup.lat, pickup.lng);
        if (cached) {
            results.set(d.driverId, cached);
        } else {
            uncached.push(d);
        }
    }

    if (uncached.length === 0) return results;

    // Batch into Distance Matrix requests (max 10 origins per call)
    const batches = [];
    for (let i = 0; i < uncached.length; i += MAX_DM_ORIGINS) {
        batches.push(uncached.slice(i, i + MAX_DM_ORIGINS));
    }

    for (const batch of batches) {
        const origins = batch.map(d => `${d.lat},${d.lng}`).join('|');
        const destination = `${pickup.lat},${pickup.lng}`;

        const url = `${BASE_URL}/distancematrix/json?` +
            `origins=${encodeURIComponent(origins)}` +
            `&destinations=${encodeURIComponent(destination)}` +
            `&mode=driving&departure_time=now` +
            `&key=${GOOGLE_MAPS_API_KEY}`;

        try {
            const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
            const data = await response.json();

            if (data.status === 'OK') {
                data.rows.forEach((row, idx) => {
                    const el = row.elements[0];
                    if (el.status === 'OK') {
                        const etaData = {
                            etaSeconds: el.duration_in_traffic?.value || el.duration.value,
                            distanceMeters: el.distance.value,
                        };
                        results.set(batch[idx].driverId, etaData);
                        // Cache per origin→destination pair
                        setCachedEta(batch[idx].lat, batch[idx].lng, pickup.lat, pickup.lng, etaData)
                            .catch(() => {});
                    }
                });
            }
        } catch (err) {
            logger.warn('Distance Matrix API call failed', 'etaDispatch', err);
            // Fall through — drivers without ETA will use Haversine fallback
        }
    }

    return results;
}

// ── Main dispatch function ──

/**
 * Find and rank drivers by ETA to a pickup location.
 *
 * Pipeline:
 *   1. Redis GEOSEARCH → shortlist of 15 nearest drivers
 *   2. Google Distance Matrix → rank by real driving ETA
 *   3. Fallback to Haversine estimate (30km/h) for any driver without API ETA
 *
 * @param {object} pickup - { lat, lng }
 * @param {string} vehicleType - Ride vehicle type
 * @param {string[]} excludeDriverIds - Already-offered driver IDs
 * @param {number} limit - Max drivers to return
 * @returns {Promise<Array>} Drivers ranked by ETA, with etaSeconds and etaSource
 */
async function findDriversByETA(pickup, vehicleType, excludeDriverIds = [], limit = 5) {
    const eligibleTypes = getEligibleDriverTypes(vehicleType);

    // Stage 1: Redis GEO shortlist
    const nearby = await driverLocService.findNearbyDrivers(
        pickup.lat, pickup.lng, 15, eligibleTypes, 15
    );

    // If Redis unavailable, fall back to MongoDB via existing dispatch service
    if (nearby === null) {
        const { findNearestDrivers } = require('./driverDispatch.service');
        const mongoDrivers = await findNearestDrivers(pickup, vehicleType, excludeDriverIds, limit);
        return mongoDrivers.map(d => ({
            driverId: d._id.toString(),
            lat: d.location?.coordinates?.[1],
            lng: d.location?.coordinates?.[0],
            vehicleType: d.vehicle?.type,
            etaSeconds: null,
            etaSource: 'mongo_near',
            straightLineKm: null,
        }));
    }

    // Filter excluded drivers
    const candidates = nearby.filter(d => !excludeDriverIds.includes(d.member));
    if (candidates.length === 0) return [];

    // Enrich with metadata from Redis hash
    const enriched = [];
    for (const c of candidates) {
        const meta = await driverLocService.getDriverMeta(c.member);
        enriched.push({
            driverId: c.member,
            lat: meta?.lat ?? c.coordinates?.latitude,
            lng: meta?.lng ?? c.coordinates?.longitude,
            straightLineKm: parseFloat(c.distance),
            vehicleType: meta?.vehicleType || null,
        });
    }

    // Stage 2: Real ETA ranking via Google Distance Matrix
    const etaMap = await fetchDriverETAs(enriched, pickup);

    // Merge ETA data; Haversine fallback for uncached drivers (assume 30km/h city speed)
    const ranked = enriched.map(d => {
        const eta = etaMap.get(d.driverId);
        return {
            ...d,
            etaSeconds: eta?.etaSeconds ?? Math.round((d.straightLineKm / 30) * 3600),
            etaDistanceMeters: eta?.distanceMeters ?? Math.round(d.straightLineKm * 1000),
            etaSource: eta ? 'google_dm' : 'haversine_estimate',
        };
    });

    // Sort by ETA ascending
    ranked.sort((a, b) => a.etaSeconds - b.etaSeconds);

    return ranked.slice(0, limit);
}

module.exports = { findDriversByETA, fetchDriverETAs };
