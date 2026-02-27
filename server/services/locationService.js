// Dedicated location service using Redis GEO for high-performance location tracking.
// Bypasses MongoDB for the hottest write path (driver location updates).
//
// Redis GEO writes are ~0.1ms vs MongoDB's ~5-20ms.
// Falls back to MongoDB if Redis is not available.

const LOCATION_KEY = 'driver:locations';
const META_PREFIX = 'driver:meta:';

let _redisClient = null;

async function getRedis() {
    if (_redisClient && _redisClient.isReady) return _redisClient;
    try {
        const { getRedisClient } = require('../configs/redis.config');
        _redisClient = await getRedisClient();
        return _redisClient;
    } catch {
        return null;
    }
}

/**
 * Update driver location in Redis GEO.
 * Also stores metadata (lat, lng, timestamp) for speed validation.
 */
async function updateLocation(driverId, latitude, longitude) {
    const redis = await getRedis();
    if (!redis) return false;

    const id = driverId.toString();
    await Promise.all([
        redis.geoAdd(LOCATION_KEY, {
            longitude,
            latitude,
            member: id
        }),
        redis.hSet(`${META_PREFIX}${id}`, {
            lat: latitude.toString(),
            lng: longitude.toString(),
            ts: Date.now().toString()
        })
    ]);
    return true;
}

/**
 * Get previous location + timestamp for speed validation.
 */
async function getPreviousLocation(driverId) {
    const redis = await getRedis();
    if (!redis) return null;

    const meta = await redis.hGetAll(`${META_PREFIX}${driverId.toString()}`);
    if (!meta || !meta.lat) return null;

    return {
        lat: parseFloat(meta.lat),
        lng: parseFloat(meta.lng),
        ts: parseInt(meta.ts, 10)
    };
}

/**
 * Find nearby drivers within a radius using Redis GEOSEARCH.
 * Returns array of { member, coordinates: { longitude, latitude }, distance }.
 */
async function getNearbyDrivers(latitude, longitude, radiusKm = 10) {
    const redis = await getRedis();
    if (!redis) return null; // Caller should fall back to MongoDB

    const results = await redis.geoSearchWith(
        LOCATION_KEY,
        { longitude, latitude },
        { radius: radiusKm, unit: 'km' },
        ['WITHCOORD', 'WITHDIST'],
        { SORT: 'ASC' }
    );

    return results.map(r => ({
        driverId: r.member,
        lat: r.coordinates.latitude,
        lng: r.coordinates.longitude,
        distanceKm: parseFloat(r.distance)
    }));
}

/**
 * Get a single driver's location from Redis.
 */
async function getDriverLocation(driverId) {
    const redis = await getRedis();
    if (!redis) return null;

    const pos = await redis.geoPos(LOCATION_KEY, driverId.toString());
    if (!pos || !pos[0]) return null;

    return {
        lat: pos[0].latitude,
        lng: pos[0].longitude
    };
}

/**
 * Remove a driver from the location index (when going offline).
 */
async function removeDriver(driverId) {
    const redis = await getRedis();
    if (!redis) return false;

    const id = driverId.toString();
    await Promise.all([
        redis.zRem(LOCATION_KEY, id),
        redis.del(`${META_PREFIX}${id}`)
    ]);
    return true;
}

module.exports = {
    updateLocation,
    getPreviousLocation,
    getNearbyDrivers,
    getDriverLocation,
    removeDriver
};
