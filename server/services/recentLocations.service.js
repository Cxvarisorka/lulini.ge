'use strict';

/**
 * Recent Locations Service
 *
 * Stores the last N location selections per user in Redis for quick retrieval.
 * This supplements the existing "recent rides" approach (fetching from ride history)
 * with a dedicated, fast, cross-device recent-locations store.
 *
 * Redis key: user:recent:{userId}  — LIST, max 20 entries, no expiry
 */

const logger = require('../utils/logger');

const MAX_RECENT = 20;

function recentKey(userId) {
    return `user:recent:${userId}`;
}

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

/**
 * Record a location selection for a user.
 * Called when a ride is created — stores the dropoff (most useful for "go again" UX).
 *
 * @param {string} userId
 * @param {object} location - { address, lat, lng, canonicalId? }
 */
async function recordRecentLocation(userId, location) {
    const redis = await getRedis();
    if (!redis) return;

    try {
        const entry = JSON.stringify({
            displayName: location.address || location.displayName,
            lat: location.lat,
            lng: location.lng,
            canonicalId: location.canonicalId || null,
            ts: Date.now(),
        });

        await redis.lPush(recentKey(userId), entry);
        await redis.lTrim(recentKey(userId), 0, MAX_RECENT - 1);
    } catch (err) {
        logger.warn('Failed to record recent location', 'recentLoc', err);
    }
}

/**
 * Get recent location selections for a user.
 *
 * @param {string} userId
 * @param {number} [limit=10]
 * @returns {Promise<Array>}
 */
async function getRecentLocations(userId, limit = 10) {
    const redis = await getRedis();
    if (!redis) return [];

    try {
        const items = await redis.lRange(recentKey(userId), 0, limit - 1);
        return items.map(item => JSON.parse(item));
    } catch (err) {
        logger.warn('Failed to get recent locations', 'recentLoc', err);
        return [];
    }
}

module.exports = { recordRecentLocation, getRecentLocations };
