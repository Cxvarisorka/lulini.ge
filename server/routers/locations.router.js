const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/auth.middleware');
const catchAsync = require('../utils/catchAsync');
const { getRecentLocations } = require('../services/recentLocations.service');
const locationService = require('../services/locationService');
const { isEnabled, getAllFlags } = require('../utils/featureFlags');

// All routes require authentication
router.use(protect);

// ── GET /api/locations/recent ──
// Returns the user's recent location selections (stored in Redis).
router.get('/recent', catchAsync(async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 20);
    const locations = await getRecentLocations(req.user.id, limit);

    res.json({
        success: true,
        count: locations.length,
        data: { locations },
    });
}));

// ── GET /api/locations/search ──
// Server-side geocoding search using the multi-provider location service.
// Replaces direct Nominatim/Google calls from the client with a cached,
// rate-limited server-side endpoint.
router.get('/search', catchAsync(async (req, res) => {
    const { q, countryCode, language, viewbox, limit } = req.query;

    if (!q || q.length < 2) {
        return res.json({ success: true, count: 0, data: { results: [] } });
    }

    const results = await locationService.search(q, {
        countryCode: countryCode || 'GE',
        language: language || 'ka,en',
        viewbox: viewbox || null,
        limit: Math.min(parseInt(limit, 10) || 5, 10),
    });

    res.json({
        success: true,
        count: results.length,
        data: { results },
    });
}));

// ── GET /api/locations/reverse ──
// Server-side reverse geocoding with caching.
router.get('/reverse', catchAsync(async (req, res) => {
    const { lat, lng, language } = req.query;

    if (!lat || !lng) {
        return res.status(400).json({
            success: false,
            message: 'lat and lng query parameters are required',
        });
    }

    const result = await locationService.reverseGeocode(
        parseFloat(lat),
        parseFloat(lng),
        { language: language || 'ka,en' }
    );

    res.json({
        success: true,
        data: { result },
    });
}));

// ── GET /api/locations/provider-stats ──
// Admin-only: provider health metrics for monitoring.
router.get('/provider-stats', catchAsync(async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Admin only' });
    }

    res.json({
        success: true,
        data: {
            providers: locationService.getProviderStats(),
            featureFlags: getAllFlags(),
        },
    });
}));

module.exports = router;
