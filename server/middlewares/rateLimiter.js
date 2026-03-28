const rateLimit = require('express-rate-limit');

// Build a Redis store if REDIS_URL is configured, so rate limit counters are
// shared across all PM2 cluster instances. Falls back to the default in-memory
// store when Redis is unavailable (e.g. local development without Redis).
function makeStore(prefix) {
    if (process.env.REDIS_URL) {
        try {
            const { RedisStore } = require('rate-limit-redis');
            const { getRedisClient } = require('../configs/redis.config');
            return new RedisStore({
                prefix: `rl:${prefix}:`,
                // sendCommand is the redis v4+ compatible interface
                sendCommand: async (...args) => {
                    const client = await getRedisClient();
                    return client.sendCommand(args);
                },
            });
        } catch (err) {
            // rate-limit-redis or Redis unavailable — degrade gracefully
            console.warn('[rateLimiter] Redis store unavailable, using memory store:', err.message);
        }
    }
    // Default: in-memory store (works fine for single-process / dev)
    return undefined;
}

// Global: 1500 requests per 15 min per IP
// Real-time apps (driver location every 5s + polling + API calls) need generous limits.
// Specific stricter limits are applied per-route for sensitive endpoints.
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1500,
    standardHeaders: true,
    legacyHeaders: false,
    store: makeStore('global'),
    // Skip rate limiting for high-frequency driver location updates
    // (they have their own per-route limiter)
    skip: (req) => req.path === '/api/drivers/location/batch' || req.path === '/api/drivers/location',
    message: { success: false, message: 'Too many requests, please try again later' }
});

// Driver location updates: 30 per minute per IP (one every 2s — generous for batch endpoint)
const driverLocationLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    store: makeStore('driver_loc'),
    message: { success: false, message: 'Too many location updates, please slow down' }
});

// Auth (login/register): 10 per 15 min per IP
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    store: makeStore('auth'),
    message: { success: false, message: 'Too many authentication attempts, please try again later' }
});

// OTP send: 3 per hour per IP
const otpSendLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 3,
    standardHeaders: true,
    legacyHeaders: false,
    store: makeStore('otp_send'),
    message: { success: false, message: 'Too many OTP requests. Try again in an hour' }
});

// OTP verify: 5 per 15 min per IP
const otpVerifyLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    store: makeStore('otp_verify'),
    message: { success: false, message: 'Too many verification attempts, please try again later' }
});

// Ride creation: 5 per minute per IP
const rideCreateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    store: makeStore('ride_create'),
    message: { success: false, message: 'Too many ride requests, please wait a moment' }
});

// Chat messages: 30 per minute per IP (prevents message flooding)
const chatMessageLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    store: makeStore('chat_msg'),
    message: { success: false, message: 'Too many messages, please slow down' }
});

module.exports = {
    globalLimiter,
    authLimiter,
    otpSendLimiter,
    otpVerifyLimiter,
    rideCreateLimiter,
    driverLocationLimiter,
    chatMessageLimiter
};
