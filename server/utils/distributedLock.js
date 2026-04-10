'use strict';

/**
 * Distributed lock built on Redis SET NX EX with a safe unlock (Lua CAS).
 *
 * Falls back to an in-process Map when REDIS_URL is not configured. The fallback
 * gives the same "only one holder at a time" guarantee within a single Node
 * process, which is what the single-instance dev and PM2-primary-only background
 * jobs rely on today.
 *
 * Why a Lua unlock:
 *   Naïve `DEL key` unlock is racy — if the lock TTL has already expired and
 *   another worker has taken it, your DEL will kick them out. The Lua script
 *   compares the token first so each holder only ever releases its own lock.
 *
 * Usage:
 *   const { withLock } = require('./distributedLock');
 *   const ran = await withLock('lock:scheduledBroadcast', 50, async () => {
 *     // critical section
 *   });
 *   if (!ran) { /* another instance is running — skipped *\/ }
 */

const crypto = require('crypto');

const memoryLocks = new Map(); // key -> { token, expiresAt }

const UNLOCK_LUA = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

async function getRedis() {
    if (!process.env.REDIS_URL) return null;
    try {
        const { getRedisClient } = require('../configs/redis.config');
        return await getRedisClient();
    } catch {
        return null;
    }
}

/**
 * Try to acquire a lock. Returns a release() function if acquired, or null.
 *
 * @param {string} key              Lock key, e.g. "lock:scheduledBroadcast"
 * @param {number} ttlSeconds       Auto-release TTL (should exceed worst-case critical section)
 * @returns {Promise<(() => Promise<void>) | null>}
 */
async function acquireLock(key, ttlSeconds) {
    const token = crypto.randomBytes(16).toString('hex');
    const redis = await getRedis();

    if (redis) {
        try {
            const result = await redis.set(key, token, { NX: true, EX: ttlSeconds });
            if (result !== 'OK') return null;

            return async () => {
                try {
                    await redis.eval(UNLOCK_LUA, { keys: [key], arguments: [token] });
                } catch { /* best-effort release — TTL will clean up anyway */ }
            };
        } catch {
            // Redis write failed — degrade to memory lock so the critical section
            // still has some protection on this instance.
        }
    }

    // ── Memory fallback ──
    const now = Date.now();
    const existing = memoryLocks.get(key);
    if (existing && existing.expiresAt > now) return null;

    memoryLocks.set(key, { token, expiresAt: now + ttlSeconds * 1000 });

    return async () => {
        const cur = memoryLocks.get(key);
        if (cur && cur.token === token) memoryLocks.delete(key);
    };
}

/**
 * Run `fn` under a distributed lock. Returns true if the lock was acquired and
 * the function ran, false if another holder already owns it.
 *
 * The lock is always released in a `finally` block so a thrown error inside the
 * critical section will never wedge the key. If the function takes longer than
 * `ttlSeconds`, Redis will auto-expire the key — so tune the TTL to exceed the
 * worst-case runtime (but not so long that a crashed holder blocks recovery).
 */
async function withLock(key, ttlSeconds, fn) {
    const release = await acquireLock(key, ttlSeconds);
    if (!release) return false;

    try {
        await fn();
    } finally {
        await release();
    }
    return true;
}

module.exports = { acquireLock, withLock };
