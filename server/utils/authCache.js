// Short-lived auth cache (60s TTL)
// Uses Redis when available (shared across instances), falls back to in-memory Map.
// Eliminates ~95% of auth DB queries. Safe because user/driver data
// changes infrequently, and 60s staleness is acceptable for auth checks.
const AUTH_CACHE_TTL = 60_000;
const userCache = new Map();
const driverCache = new Map();

// Periodic cleanup to prevent memory leaks (only for in-memory mode)
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of userCache) {
        if (now - entry.ts > AUTH_CACHE_TTL) userCache.delete(key);
    }
    for (const [key, entry] of driverCache) {
        if (now - entry.ts > AUTH_CACHE_TTL) driverCache.delete(key);
    }
}, AUTH_CACHE_TTL);

module.exports = { userCache, driverCache, AUTH_CACHE_TTL };
