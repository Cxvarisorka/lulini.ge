'use strict';

/**
 * Maps Controller — thin HTTP layer over the service modules.
 *
 * All provider selection, caching, and fallback logic lives in:
 *   - services/routing.service
 *   - services/geocoding.service
 *   - services/autocomplete.service
 *   - providers/google.provider (for snap-to-road, which has no fallback)
 *
 * Response shapes emit BOTH new unified fields (distanceMeters, durationSeconds)
 * AND legacy fields (distance [km], duration [min], distanceText, durationText)
 * during the client migration window. Legacy fields can be removed once
 * mobile/mobile-driver are updated.
 */

const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

const routing = require('../services/routing.service');
const geocoding = require('../services/geocoding.service');
const autocomplete = require('../services/autocomplete.service');
const google = require('../providers/google.provider');

function fmtDistance(m) {
    if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
    return `${Math.round(m)} m`;
}
function fmtDuration(s) {
    const min = Math.round(s / 60);
    if (min >= 60) {
        const h = Math.floor(min / 60);
        const rem = min % 60;
        return rem ? `${h} h ${rem} min` : `${h} h`;
    }
    return `${min} min`;
}

// ── GET /api/maps/directions ────────────────────────────────────────────────
// Query: originLat, originLng, destLat, destLng [, steps=true]
exports.getDirections = catchAsync(async (req, res, next) => {
    const { originLat, originLng, destLat, destLng, steps } = req.query;
    if (!originLat || !originLng || !destLat || !destLng) {
        return next(new AppError('Missing coordinates: originLat, originLng, destLat, destLng', 400));
    }

    const route = await routing.getRoute(
        { lat: +originLat, lng: +originLng },
        { lat: +destLat,  lng: +destLng },
        { steps: steps === 'true' || steps === '1' },
    );

    res.json({
        success: true,
        cached: !!route.cached,
        data: {
            // Unified contract
            distanceMeters: route.distanceMeters,
            durationSeconds: route.durationSeconds,
            polyline: route.polyline,
            provider: route.provider,
            steps: route.steps || [],
            // Legacy fields (deprecated — remove after Phase 4 ships)
            distance: route.distanceMeters / 1000,
            duration: Math.round(route.durationSeconds / 60),
            distanceText: fmtDistance(route.distanceMeters),
            durationText: fmtDuration(route.durationSeconds),
            startAddress: route.startAddress || null,
            endAddress: route.endAddress || null,
        },
    });
});

// ── GET /api/maps/distance-matrix ───────────────────────────────────────────
// Query: origins=lat,lng|lat,lng  destinations=lat,lng|lat,lng
exports.getDistanceMatrix = catchAsync(async (req, res, next) => {
    const { origins, destinations } = req.query;
    if (!origins || !destinations) {
        return next(new AppError('Missing origins or destinations parameter', 400));
    }

    const parse = (s) => s.split('|').map(pair => {
        const [lat, lng] = pair.split(',').map(Number);
        return { lat, lng };
    });

    const O = parse(origins);
    const D = parse(destinations);

    const matrix = await routing.getMatrix(O, D);

    // Legacy shape: 2D array of {distance, distanceText, duration, durationText, status}
    const legacyRows = matrix.durations.map((durRow, i) =>
        durRow.map((dur, j) => {
            const dist = matrix.distances?.[i]?.[j] ?? null;
            const ok = dur != null && dist != null;
            return {
                distance: ok ? dist / 1000 : 0,
                distanceText: ok ? fmtDistance(dist) : '',
                duration: ok ? Math.round(dur / 60) : 0,
                durationText: ok ? fmtDuration(dur) : '',
                status: ok ? 'OK' : 'ZERO_RESULTS',
                // Unified fields
                distanceMeters: dist,
                durationSeconds: dur,
            };
        })
    );

    res.json({
        success: true,
        cached: !!matrix.cached,
        data: legacyRows,
        meta: { provider: matrix.provider },
    });
});

// ── GET /api/maps/geocode ───────────────────────────────────────────────────
// Query: address=... [&countryCode=GE&language=ka]
//   OR:  latlng=lat,lng [&language=ka]
exports.geocode = catchAsync(async (req, res, next) => {
    const { address, latlng, language, countryCode } = req.query;
    if (!address && !latlng) {
        return next(new AppError('Missing address or latlng parameter', 400));
    }

    if (address) {
        const { results, provider, cached } = await geocoding.forwardGeocode(address, {
            countryCode: countryCode || 'GE',
            language: language || 'ka',
        });
        return res.json({ success: true, cached, data: { results, provider } });
    }

    const [lat, lng] = latlng.split(',').map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return next(new AppError('Invalid latlng value', 400));
    }
    const result = await geocoding.reverseGeocode(lat, lng, { language: language || 'ka' });
    res.json({
        success: true,
        cached: !!result?.cached,
        data: { result, provider: result?.provider || null },
    });
});

// ── GET /api/maps/autocomplete ──────────────────────────────────────────────
// Query: input=... [&language=ka&countryCode=GE&lat&lng&radius&sessionToken]
exports.autocomplete = catchAsync(async (req, res, next) => {
    const { input, language, countryCode, lat, lng, radius, sessionToken } = req.query;
    if (!input) return next(new AppError('Missing input parameter', 400));

    const opts = {
        language: language || 'ka',
        countryCode: countryCode || 'GE',
        sessionToken,
        radius: radius ? +radius : undefined,
    };
    if (lat && lng) opts.location = { lat: +lat, lng: +lng };

    const result = await autocomplete.getPredictions(input, opts);
    res.json({
        success: true,
        cached: result.cached,
        data: { predictions: result.predictions, provider: result.provider },
    });
});

// ── GET /api/maps/place-details ─────────────────────────────────────────────
// Resolve a prediction placeId → coords + address.
exports.placeDetails = catchAsync(async (req, res, next) => {
    const { placeId, language, sessionToken } = req.query;
    if (!placeId) return next(new AppError('Missing placeId', 400));

    const result = await autocomplete.resolvePrediction(placeId, { language, sessionToken });
    res.json({ success: true, data: { result } });
});

// ── GET /api/maps/snap-to-road ──────────────────────────────────────────────
// Google-only; no fallback.
exports.snapToRoad = catchAsync(async (req, res, next) => {
    const { path } = req.query;
    if (!path) return next(new AppError('Missing path parameter (lat,lng|lat,lng|...)', 400));

    const points = path.split('|').map(pair => {
        const [lat, lng] = pair.split(',').map(Number);
        return { lat, lng };
    });
    if (points.length > 100) return next(new AppError('Maximum 100 points per request', 400));

    const snapped = await google.snapToRoads(points);

    // Legacy response shape
    res.json({
        success: true,
        data: {
            snappedPoints: snapped.map(p => ({
                location: { latitude: p.coords.lat, longitude: p.coords.lng },
                originalIndex: p.originalIndex,
                placeId: p.placeId,
            })),
        },
    });
});
