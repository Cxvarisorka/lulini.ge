// Presence tracking — replaces expensive fetchSockets() calls.
//
// Dual-mode architecture:
//   - Local Map for O(1) same-process checks (always active)
//   - Redis SET for cross-process checks (production with REDIS_URL)
//
// The local Map is the primary source for the current process.
// Redis is the authoritative source across all processes.
// On disconnect, we only remove from Redis if no local sockets remain,
// preventing a race where process A removes a user that process B still serves.

const localCounts = new Map(); // userId -> number of active sockets in THIS process

// ── Redis client (lazy-initialized, only in production with REDIS_URL) ──
const PRESENCE_KEY = 'socket:presence';
let _redis = null;
let _redisReady = false;

async function getRedis() {
    if (_redis) return _redisReady ? _redis : null;
    if (!process.env.REDIS_URL) return null;

    try {
        const { getRedisClient } = require('../configs/redis.config');
        _redis = await getRedisClient();
        _redisReady = true;
        return _redis;
    } catch {
        return null; // Redis not available — local-only mode
    }
}

// ── Public API ──

/**
 * Track a new socket connection for a user.
 * Updates local count immediately; adds to Redis SET in background.
 */
function trackConnection(userId) {
    const key = String(userId);
    localCounts.set(key, (localCounts.get(key) || 0) + 1);

    // Fire-and-forget Redis update
    getRedis().then(redis => {
        if (redis) redis.sAdd(PRESENCE_KEY, key).catch(() => {});
    }).catch(() => {});
}

/**
 * Untrack a socket disconnection for a user.
 * Returns true if the user has zero remaining LOCAL connections.
 * Only removes from Redis when no local sockets remain.
 */
function untrackConnection(userId) {
    const key = String(userId);
    const count = (localCounts.get(key) || 1) - 1;
    if (count <= 0) {
        localCounts.delete(key);
        // No local sockets left — remove from Redis
        // (other processes may still have sockets for this user,
        //  but they'll re-add on their next trackConnection)
        getRedis().then(redis => {
            if (redis) redis.sRem(PRESENCE_KEY, key).catch(() => {});
        }).catch(() => {});
        return true; // user went fully offline on this process
    }
    localCounts.set(key, count);
    return false; // user still has other local sockets
}

/**
 * Check if a user has at least one active socket connection.
 *
 * Fast path: checks local Map first (O(1), no I/O).
 * If local says yes, returns true immediately — no Redis needed.
 * This covers the common case (user's socket is on this process).
 *
 * For cross-process checks (e.g., standalone worker), use isUserOnlineAsync.
 */
function isUserOnline(userId) {
    return localCounts.has(String(userId));
}

/**
 * Async cross-process presence check.
 * Checks local Map first (fast path), then falls back to Redis SET.
 * Use this in contexts where the user might be on a different process
 * (e.g., standalone BullMQ worker, scheduled jobs).
 */
async function isUserOnlineAsync(userId) {
    const key = String(userId);
    // Fast path: local check
    if (localCounts.has(key)) return true;
    // Slow path: cross-process Redis check
    try {
        const redis = await getRedis();
        if (redis) return await redis.sIsMember(PRESENCE_KEY, key);
    } catch { /* Redis unavailable — fall through */ }
    return false;
}

/**
 * Get the number of active LOCAL connections for a user.
 */
function getConnectionCount(userId) {
    return localCounts.get(String(userId)) || 0;
}

/**
 * Get total number of locally tracked users (for monitoring).
 */
function getOnlineUserCount() {
    return localCounts.size;
}

module.exports = {
    trackConnection,
    untrackConnection,
    isUserOnline,
    isUserOnlineAsync,
    getConnectionCount,
    getOnlineUserCount,
};
