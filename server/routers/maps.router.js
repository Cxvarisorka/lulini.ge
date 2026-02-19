const express = require('express');
const router = express.Router();
const { getDirections, getDistanceMatrix, snapToRoad, geocode } = require('../controllers/maps.controller');
const { protect } = require('../middlewares/auth.middleware');

// ---------------------------------------------------------------------------
// Per-user rate limiter for Google API proxy
// Prevents a single user from burning through the API budget
// ---------------------------------------------------------------------------
const userRequestCounts = new Map();
const RATE_WINDOW_MS = 60 * 1000; // 1 minute window
const MAX_REQUESTS_PER_WINDOW = 30; // 30 requests/minute/user

// Clean up stale entries every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of userRequestCounts) {
        if (now > entry.resetAt) {
            userRequestCounts.delete(key);
        }
    }
}, 5 * 60 * 1000);

function mapsRateLimit(req, res, next) {
    const userId = req.user?._id?.toString() || req.ip;
    const now = Date.now();
    let entry = userRequestCounts.get(userId);

    if (!entry || now > entry.resetAt) {
        entry = { count: 0, resetAt: now + RATE_WINDOW_MS };
    }

    entry.count++;
    userRequestCounts.set(userId, entry);

    // Set rate limit headers
    res.set('X-RateLimit-Limit', String(MAX_REQUESTS_PER_WINDOW));
    res.set('X-RateLimit-Remaining', String(Math.max(0, MAX_REQUESTS_PER_WINDOW - entry.count)));
    res.set('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > MAX_REQUESTS_PER_WINDOW) {
        return res.status(429).json({
            success: false,
            message: 'Too many map API requests. Please wait a moment.',
        });
    }

    next();
}

// All routes require authentication + rate limiting
router.use(protect);
router.use(mapsRateLimit);

router.get('/directions', getDirections);
router.get('/distance-matrix', getDistanceMatrix);
router.get('/snap-to-road', snapToRoad);
router.get('/geocode', geocode);

module.exports = router;
