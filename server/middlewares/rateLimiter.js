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

// Global: 300 requests per 15 min per IP (20/min)
// Driver location updates are exempted (they have their own limiter).
// Specific stricter limits are applied per-route for sensitive endpoints.
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
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

// OTP send per-phone: 3 per hour per phone number (prevents abuse via IP rotation)
// Uses phone from request body as the key instead of IP
const otpSendPhoneLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 3,
    standardHeaders: true,
    legacyHeaders: false,
    store: makeStore('otp_phone'),
    keyGenerator: (req) => {
        // Use phone number as the rate limit key
        const phone = (req.body && req.body.phone) ? req.body.phone.replace(/\s+/g, '') : '';
        if (phone) return `phone:${phone}`;
        // No phone in body — shouldn't happen (validator catches it), but safe fallback
        return `phone:unknown`;
    },
    // Disable the IPv6 key generator validation since we're keying by phone, not IP
    validate: { xForwardedForHeader: false, default: true },
    message: { success: false, message: 'Too many OTP requests for this phone number. Try again in an hour' }
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
    otpSendPhoneLimiter,
    otpVerifyLimiter,
    rideCreateLimiter,
    driverLocationLimiter,
    chatMessageLimiter
};
