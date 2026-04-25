const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/auth.middleware');
const catchAsync = require('../utils/catchAsync');
const { getRecentLocations } = require('../services/recentLocations.service');
const geocoding = require('../services/geocoding.service');
const cache = require('../services/cache.service');
const metrics = require('../services/metrics.service');
const places = require('../services/places.service');
const { getAllFlags } = require('../utils/featureFlags');

// All routes require authentication
router.use(protect);

// Map unified geocoding result → legacy shape used by existing clients.
function toLegacy(r) {
    if (!r) return null;
    return {
        displayName: r.address,
        formattedAddress: r.address,
        lat: r.coords.lat,
        lng: r.coords.lng,
        osmType: r.canonicalId?.startsWith('osm:') ? r.canonicalId.split(':')[1] : null,
        osmId:   r.canonicalId?.startsWith('osm:') ? r.canonicalId.split(':')[2] : null,
        googlePlaceId: r.canonicalId?.startsWith('goog:') ? r.canonicalId.slice(5) : null,
        canonicalId: r.canonicalId,
        sourceProvider: r.provider,
        addressComponents: r.components,
        boundingBox: r.boundingBox || null,
        confidence: r.confidence ?? 0.5,
    };
}

// ── GET /api/locations/recent ──
router.get('/recent', catchAsync(async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 20);
    const locations = await getRecentLocations(req.user.id, limit);
    res.json({ success: true, count: locations.length, data: { locations } });
}));

// ── GET /api/locations/search ──
router.get('/search', catchAsync(async (req, res) => {
    const { q, countryCode, language, viewbox, limit } = req.query;

    if (!q || q.length < 2) {
        return res.json({ success: true, count: 0, data: { results: [] } });
    }

    const { results, provider } = await geocoding.forwardGeocode(q, {
        countryCode: countryCode || 'GE',
        language: language || 'ka,en',
        viewbox: viewbox || null,
        limit: Math.min(parseInt(limit, 10) || 5, 10),
    });

    const legacy = results.map(toLegacy);
    res.json({ success: true, count: legacy.length, data: { results: legacy, provider } });
}));

// ── GET /api/locations/reverse ──
router.get('/reverse', catchAsync(async (req, res) => {
    const { lat, lng, language } = req.query;
    if (!lat || !lng) {
        return res.status(400).json({ success: false, message: 'lat and lng query parameters are required' });
    }

    const result = await geocoding.reverseGeocode(
        parseFloat(lat),
        parseFloat(lng),
        { language: language || 'ka,en' }
    );
    res.json({ success: true, data: { result: toLegacy(result) } });
}));

// ── GET /api/locations/provider-stats ──
router.get('/provider-stats', catchAsync(async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Admin only' });
    }
    const providers = await cache.getProviderHealth();
    res.json({ success: true, data: { providers, featureFlags: getAllFlags() } });
}));

// ── GET /api/locations/nearby-popular ──
// Geo-sorted popular places — used by the search-sheet empty state. Zero API cost.
router.get('/nearby-popular', catchAsync(async (req, res) => {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    const limit = Math.min(parseInt(req.query.limit, 10) || 5, 10);
    const maxDistanceMeters = Math.min(parseInt(req.query.radius, 10) || 5000, 25000);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return res.status(400).json({ success: false, message: 'lat and lng are required' });
    }

    const docs = await places.nearbyPopular({ lat, lng, limit, maxDistanceMeters });
    const results = docs.map(places.toPrediction).filter(Boolean);
    res.json({ success: true, count: results.length, data: { results } });
}));

// ── GET /api/locations/cost-metrics ──
// Last N days (default 7) of provider call counts + cache hit ratios.
router.get('/cost-metrics', catchAsync(async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Admin only' });
    }
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 7, 1), 14);
    const data = await metrics.getMetrics(days);
    res.json({ success: true, data });
}));

module.exports = router;
