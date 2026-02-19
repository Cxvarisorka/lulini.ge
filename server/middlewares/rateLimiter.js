const rateLimit = require('express-rate-limit');

// Global: 200 requests per 15 min per IP
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests, please try again later' }
});

// Auth (login/register): 10 per 15 min per IP
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many authentication attempts, please try again later' }
});

// OTP send: 3 per hour per IP
const otpSendLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 3,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many OTP requests. Try again in an hour' }
});

// OTP verify: 5 per 15 min per IP
const otpVerifyLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many verification attempts, please try again later' }
});

// Ride creation: 5 per minute per IP
const rideCreateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many ride requests, please wait a moment' }
});

module.exports = {
    globalLimiter,
    authLimiter,
    otpSendLimiter,
    otpVerifyLimiter,
    rideCreateLimiter
};
