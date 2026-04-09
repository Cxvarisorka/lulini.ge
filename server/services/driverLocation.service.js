'use strict';

/**
 * Redis-backed Driver Live-Location Service
 *
 * Replaces direct MongoDB writes for driver position updates with Redis GEO
 * as the primary hot-path store, flushing to MongoDB periodically.
 *
 * Redis key structure:
 *   drivers:geo                     — GEOADD sorted set (all online drivers)
 *   drivers:geo:{vehicleType}       — per-type GEO set
 *   driver:loc:{driverId}           — HASH {lat, lng, heading, speed, ts, vehicleType}
 *   driver:loc:dirty                — SET of driverIds pending MongoDB sync
 *
 * All operations fail silently if Redis is unavailable — callers should
 * fall back to the existing MongoDB direct-write path.
 */

const logger = require('../utils/logger');

const GEO_KEY = 'drivers:geo';
const DIRTY_SET = 'driver:loc:dirty';
const LOC_TTL = 120; // seconds — auto-expire hash if driver stops sending

const VEHICLE_TYPES = ['economy', 'comfort', 'business', 'van', 'minibus'];

function geoKeyByType(type) {
    return `drivers:geo:${type}`;
}

function locHashKey(driverId) {
    return `driver:loc:${driverId}`;
}

// ── Redis client accessor (lazy, cached) ──

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

// ── Write operations ──

/**
 * Update a driver's live position in Redis.
 *
 * @param {string} driverId - MongoDB ObjectId string
 * @param {object} data - { lat, lng, heading, speed, vehicleType }
 * @returns {Promise<boolean>} true if written to Redis, false on failure
 */
async function updateDriverLocation(driverId, { lat, lng, heading, speed, vehicleType }) {
    const redis = await getRedis();
    if (!redis) return false;

    try {
        const ts = Date.now();
        const id = String(driverId);

        const pipeline = redis.multi();

        // GEO index — global + per-vehicle-type
        pipeline.geoAdd(GEO_KEY, { longitude: lng, latitude: lat, member: id });
        if (vehicleType) {
            pipeline.geoAdd(geoKeyByType(vehicleType), { longitude: lng, latitude: lat, member: id });
        }

        // Metadata hash
        pipeline.hSet(locHashKey(id), {
            lat: String(lat),
            lng: String(lng),
            heading: String(heading ?? 0),
            speed: String(speed ?? 0),
            ts: String(ts),
            vehicleType: vehicleType || '',
        });
        pipeline.expire(locHashKey(id), LOC_TTL);

        // Mark dirty for periodic MongoDB flush
        pipeline.sAdd(DIRTY_SET, id);

        await pipeline.exec();
        return true;
    } catch (err) {
        logger.warn('Redis driver location update failed', 'driverLoc', err);
        return false;
    }
}

/**
 * Remove a driver from all GEO indexes (on going offline or disconnect).
 */
async function removeDriver(driverId, vehicleType) {
    const redis = await getRedis();
    if (!redis) return;

    try {
        const id = String(driverId);
        const pipeline = redis.multi();
        pipeline.zRem(GEO_KEY, id);
        if (vehicleType) {
            pipeline.zRem(geoKeyByType(vehicleType), id);
        }
        pipeline.del(locHashKey(id));
        pipeline.sRem(DIRTY_SET, id);
        await pipeline.exec();
    } catch (err) {
        logger.warn('Redis driver removal failed', 'driverLoc', err);
    }
}

// ── Read operations ──

/**
 * Find nearby drivers using Redis GEOSEARCH.
 * Returns drivers sorted by distance — O(log(N) + M).
 *
 * @param {number} lat
 * @param {number} lng
 * @param {number} [radiusKm=15]
 * @param {string[]} [vehicleTypes=[]] - If empty, searches all drivers
 * @param {number} [limit=20]
 * @returns {Promise<Array<{member: string, distance: number, coordinates: {latitude, longitude}}>>}
 */
async function findNearbyDrivers(lat, lng, radiusKm = 15, vehicleTypes = [], limit = 20) {
    const redis = await getRedis();
    if (!redis) return null; // null signals caller to use MongoDB fallback

    try {
        const keys = vehicleTypes.length > 0
            ? vehicleTypes.map(geoKeyByType)
            : [GEO_KEY];

        const allResults = [];
        for (const key of keys) {
            const results = await redis.geoSearchWith(key, {
                longitude: lng,
                latitude: lat,
            }, {
                radius: radiusKm,
                unit: 'km',
            }, ['WITHCOORD', 'WITHDIST'], {
                COUNT: limit,
                SORT: 'ASC',
            });
            allResults.push(...results);
        }

        // Deduplicate by member (driverId), keep closest distance
        const seen = new Map();
        for (const r of allResults) {
            const existing = seen.get(r.member);
            if (!existing || parseFloat(r.distance) < parseFloat(existing.distance)) {
                seen.set(r.member, r);
            }
        }

        return Array.from(seen.values())
            .sort((a, b) => parseFloat(a.distance) - parseFloat(b.distance))
            .slice(0, limit);
    } catch (err) {
        logger.warn('Redis GEOSEARCH failed', 'driverLoc', err);
        return null; // signal fallback
    }
}

/**
 * Get metadata (heading, speed, etc.) for a specific driver.
 */
async function getDriverMeta(driverId) {
    const redis = await getRedis();
    if (!redis) return null;

    try {
        const data = await redis.hGetAll(locHashKey(String(driverId)));
        if (!data || !data.lat) return null;
        return {
            lat: parseFloat(data.lat),
            lng: parseFloat(data.lng),
            heading: parseFloat(data.heading || 0),
            speed: parseFloat(data.speed || 0),
            ts: parseInt(data.ts || 0, 10),
            vehicleType: data.vehicleType || null,
        };
    } catch {
        return null;
    }
}

// ── Background sync: Redis → MongoDB ──

/**
 * Flush dirty driver locations from Redis to MongoDB.
 * Should be called every 30 seconds by a background interval.
 */
async function flushToMongo() {
    const redis = await getRedis();
    if (!redis) return 0;

    const Driver = require('../models/driver.model');

    try {
        // Get and clear dirty set atomically using SMEMBERS + DEL
        const dirtyIds = await redis.sMembers(DIRTY_SET);
        if (dirtyIds.length === 0) return 0;
        await redis.del(DIRTY_SET);

        const bulkOps = [];
        for (const driverId of dirtyIds) {
            const loc = await redis.hGetAll(locHashKey(driverId));
            if (!loc.lat || !loc.lng) continue;

            bulkOps.push({
                updateOne: {
                    filter: { _id: driverId },
                    update: {
                        $set: {
                            location: {
                                type: 'Point',
                                coordinates: [parseFloat(loc.lng), parseFloat(loc.lat)],
                            },
                        },
                    },
                },
            });
        }

        if (bulkOps.length > 0) {
            await Driver.bulkWrite(bulkOps, { ordered: false });
        }

        return bulkOps.length;
    } catch (err) {
        logger.error('Driver location flush to MongoDB failed', 'driverLoc', err);
        return 0;
    }
}

// ── Stale driver cleanup ──

/**
 * Remove drivers whose metadata hash has expired (stopped sending updates >120s).
 * GEO set members do NOT auto-expire, so this cleans up stale entries.
 * Should be called every 60 seconds.
 */
async function cleanupStaleDrivers() {
    const redis = await getRedis();
    if (!redis) return 0;

    try {
        const allMembers = await redis.zRange(GEO_KEY, 0, -1);
        let removed = 0;

        for (const driverId of allMembers) {
            const exists = await redis.exists(locHashKey(driverId));
            if (!exists) {
                // Hash expired → driver stopped sending updates
                const pipeline = redis.multi();
                pipeline.zRem(GEO_KEY, driverId);
                for (const type of VEHICLE_TYPES) {
                    pipeline.zRem(geoKeyByType(type), driverId);
                }
                await pipeline.exec();
                removed++;
            }
        }

        if (removed > 0) {
            logger.info(`Cleaned up ${removed} stale drivers from Redis GEO`, 'driverLoc');
        }
        return removed;
    } catch (err) {
        logger.warn('Stale driver cleanup failed', 'driverLoc', err);
        return 0;
    }
}

module.exports = {
    updateDriverLocation,
    removeDriver,
    findNearbyDrivers,
    getDriverMeta,
    flushToMongo,
    cleanupStaleDrivers,
    // Exported for use by other services
    GEO_KEY,
    geoKeyByType,
    locHashKey,
};
