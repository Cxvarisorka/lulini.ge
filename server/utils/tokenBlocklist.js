/**
 * JWT Token Blocklist
 *
 * When a token is revoked (logout, password change, account deletion),
 * its JTI (JWT ID) is added to a blocklist stored in Redis (cross-process)
 * with an in-memory fallback for single-process mode.
 *
 * Entries auto-expire when the original token would have expired,
 * so the blocklist doesn't grow unbounded.
 */

const TOKEN_BLOCKLIST_PREFIX = 'token:blocked:';

// In-memory fallback when Redis is unavailable
const memoryBlocklist = new Map();
const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes

let _redisClient = null;
async function getRedis() {
    if (_redisClient && _redisClient.isReady) return _redisClient;
    try {
        if (!process.env.REDIS_URL) return null;
        const { getRedisClient } = require('../configs/redis.config');
        _redisClient = await getRedisClient();
        return _redisClient;
    } catch {
        return null;
    }
}

/**
 * Add a token to the blocklist.
 * @param {string} jti - JWT ID (unique token identifier)
 * @param {number} expiresInSeconds - Seconds until the token naturally expires
 */
async function blockToken(jti, expiresInSeconds) {
    if (!jti) return;

    const ttl = Math.max(Math.ceil(expiresInSeconds), 60); // At least 60s

    try {
        const redis = await getRedis();
        if (redis) {
            await redis.set(`${TOKEN_BLOCKLIST_PREFIX}${jti}`, '1', { EX: ttl });
            return;
        }
    } catch {
        // Fall through to in-memory
    }

    // In-memory fallback
    memoryBlocklist.set(jti, Date.now() + ttl * 1000);
}

/**
 * Check if a token has been revoked.
 * @param {string} jti - JWT ID
 * @returns {Promise<boolean>} true if the token is blocked
 */
async function isTokenBlocked(jti) {
    if (!jti) return false;

    try {
        const redis = await getRedis();
        if (redis) {
            const result = await redis.get(`${TOKEN_BLOCKLIST_PREFIX}${jti}`);
            return result !== null;
        }
    } catch {
        // Fall through to in-memory
    }

    // In-memory fallback
    const expiresAt = memoryBlocklist.get(jti);
    if (!expiresAt) return false;
    if (Date.now() > expiresAt) {
        memoryBlocklist.delete(jti);
        return false;
    }
    return true;
}

/**
 * Revoke all tokens for a user by blocking a user-level key.
 * All tokens issued before this timestamp are considered invalid.
 * @param {string} userId - User ID
 */
async function revokeAllUserTokens(userId) {
    if (!userId) return;

    const key = `${TOKEN_BLOCKLIST_PREFIX}user:${userId}`;
    const ttl = 7 * 24 * 60 * 60; // 7 days (max token lifetime)

    try {
        const redis = await getRedis();
        if (redis) {
            await redis.set(key, String(Math.floor(Date.now() / 1000)), { EX: ttl });
            return;
        }
    } catch {
        // Fall through to in-memory
    }

    memoryBlocklist.set(`user:${userId}`, Date.now() + ttl * 1000);
}

/**
 * Check if all tokens for a user have been revoked.
 * @param {string} userId - User ID
 * @param {number} tokenIssuedAt - Token iat (issued-at) in seconds
 * @returns {Promise<boolean>} true if the token was issued before the revocation
 */
async function isUserTokensRevoked(userId, tokenIssuedAt) {
    if (!userId || !tokenIssuedAt) return false;

    const key = `${TOKEN_BLOCKLIST_PREFIX}user:${userId}`;

    try {
        const redis = await getRedis();
        if (redis) {
            const revokedAt = await redis.get(key);
            if (revokedAt && tokenIssuedAt < parseInt(revokedAt, 10)) {
                return true;
            }
            return false;
        }
    } catch {
        // Fall through to in-memory
    }

    // In-memory: simplified check — if user key exists and not expired, block
    const expiresAt = memoryBlocklist.get(`user:${userId}`);
    if (expiresAt && Date.now() < expiresAt) {
        return true;
    }
    return false;
}

// Periodic cleanup of expired in-memory entries
const _cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, expiresAt] of memoryBlocklist) {
        if (now > expiresAt) {
            memoryBlocklist.delete(key);
        }
    }
}, CLEANUP_INTERVAL);
_cleanupInterval.unref();

module.exports = {
    blockToken,
    isTokenBlocked,
    revokeAllUserTokens,
    isUserTokensRevoked,
};
