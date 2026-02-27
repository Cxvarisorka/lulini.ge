const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const BASE_URL = 'https://maps.googleapis.com/maps/api';
const ROADS_URL = 'https://roads.googleapis.com/v1';

// ---------------------------------------------------------------------------
// Maps cache — uses Redis when available, falls back to in-memory LRU
// ---------------------------------------------------------------------------
const cache = new Map();
const DIRECTIONS_CACHE_TTL = 5 * 60 * 1000;    // 5 minutes
const DISTANCE_MATRIX_CACHE_TTL = 3 * 60 * 1000; // 3 minutes
const MAX_CACHE_SIZE = 2000;

let _redisClient = null;
async function getRedis() {
    if (_redisClient) return _redisClient;
    try {
        const { getRedisClient } = require('../configs/redis.config');
        _redisClient = await getRedisClient();
        return _redisClient;
    } catch {
        return null;
    }
}

async function getCached(key) {
    // Try Redis first
    try {
        const redis = process.env.REDIS_URL ? await getRedis() : null;
        if (redis) {
            const data = await redis.get(`maps:${key}`);
            return data ? JSON.parse(data) : null;
        }
    } catch { /* fall through to in-memory */ }

    // In-memory fallback with LRU
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > entry.ttl) {
        cache.delete(key);
        return null;
    }
    // LRU refresh: delete and re-insert to move to end of Map iteration order
    cache.delete(key);
    cache.set(key, entry);
    return entry.data;
}

async function setCache(key, data, ttl) {
    // Try Redis first
    try {
        const redis = process.env.REDIS_URL ? await getRedis() : null;
        if (redis) {
            await redis.set(`maps:${key}`, JSON.stringify(data), { PX: ttl });
            return;
        }
    } catch { /* fall through to in-memory */ }

    // In-memory fallback with LRU eviction
    if (cache.size >= MAX_CACHE_SIZE) {
        const firstKey = cache.keys().next().value;
        cache.delete(firstKey);
    }
    cache.set(key, { data, ts: Date.now(), ttl });
}

// Proactive cleanup of expired in-memory entries
setInterval(() => {
    if (process.env.REDIS_URL) return; // Redis handles TTL automatically
    const now = Date.now();
    for (const [key, entry] of cache) {
        if (now - entry.ts > entry.ttl) {
            cache.delete(key);
        }
    }
}, 60 * 1000);

// ---------------------------------------------------------------------------
// Polyline decoder (server-side)
// ---------------------------------------------------------------------------
function decodePolyline(encoded) {
    if (!encoded) return [];
    const poly = [];
    let index = 0, lat = 0, lng = 0;

    while (index < encoded.length) {
        let b, shift = 0, result = 0;
        do {
            b = encoded.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        lat += (result & 1) ? ~(result >> 1) : (result >> 1);

        shift = 0; result = 0;
        do {
            b = encoded.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        lng += (result & 1) ? ~(result >> 1) : (result >> 1);

        poly.push([lat / 1e5, lng / 1e5]);
    }
    return poly;
}

// ---------------------------------------------------------------------------
// GET /api/maps/directions
// Proxy Google Directions API — API key stays server-side
// ---------------------------------------------------------------------------
exports.getDirections = catchAsync(async (req, res, next) => {
    const { originLat, originLng, destLat, destLng } = req.query;

    if (!originLat || !originLng || !destLat || !destLng) {
        return next(new AppError('Missing coordinates: originLat, originLng, destLat, destLng required', 400));
    }

    if (!GOOGLE_MAPS_API_KEY) {
        return next(new AppError('Google Maps API key not configured', 503));
    }

    // Round to 4 decimals for cache hits (~11m precision — good enough for routing)
    const oLat = (+originLat).toFixed(4);
    const oLng = (+originLng).toFixed(4);
    const dLat = (+destLat).toFixed(4);
    const dLng = (+destLng).toFixed(4);
    const cacheKey = `dir:${oLat},${oLng}-${dLat},${dLng}`;

    const cached = await getCached(cacheKey);
    if (cached) {
        return res.json({ success: true, data: cached, cached: true });
    }

    const url = `${BASE_URL}/directions/json?` +
        `origin=${originLat},${originLng}` +
        `&destination=${destLat},${destLng}` +
        `&mode=driving` +
        `&departure_time=now` +
        `&key=${GOOGLE_MAPS_API_KEY}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== 'OK') {
        return next(new AppError(`Directions API returned: ${data.status}`, 502));
    }

    const route = data.routes[0];
    const leg = route.legs[0];

    const result = {
        distance: leg.distance.value / 1000,
        duration: Math.round((leg.duration_in_traffic?.value || leg.duration.value) / 60),
        distanceText: leg.distance.text,
        durationText: leg.duration_in_traffic?.text || leg.duration.text,
        polyline: decodePolyline(route.overview_polyline.points),
        startAddress: leg.start_address,
        endAddress: leg.end_address,
        steps: leg.steps.map(s => ({
            distance: s.distance.text,
            duration: s.duration.text,
            instruction: s.html_instructions.replace(/<[^>]*>/g, ''),
            maneuver: s.maneuver || null,
        })),
    };

    await setCache(cacheKey, result, DIRECTIONS_CACHE_TTL);
    res.json({ success: true, data: result });
});

// ---------------------------------------------------------------------------
// GET /api/maps/distance-matrix
// Proxy Google Distance Matrix API — for ETA calculations
// ---------------------------------------------------------------------------
exports.getDistanceMatrix = catchAsync(async (req, res, next) => {
    const { origins, destinations } = req.query;

    if (!origins || !destinations) {
        return next(new AppError('Missing origins or destinations parameter', 400));
    }

    if (!GOOGLE_MAPS_API_KEY) {
        return next(new AppError('Google Maps API key not configured', 503));
    }

    const cacheKey = `dm:${origins}-${destinations}`;
    const cached = await getCached(cacheKey);
    if (cached) {
        return res.json({ success: true, data: cached, cached: true });
    }

    const url = `${BASE_URL}/distancematrix/json?` +
        `origins=${encodeURIComponent(origins)}` +
        `&destinations=${encodeURIComponent(destinations)}` +
        `&mode=driving` +
        `&key=${GOOGLE_MAPS_API_KEY}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== 'OK') {
        return next(new AppError(`Distance Matrix API returned: ${data.status}`, 502));
    }

    const result = data.rows.map(row =>
        row.elements.map(el => ({
            distance: el.distance ? el.distance.value / 1000 : 0,
            distanceText: el.distance?.text || '',
            duration: el.duration ? Math.round(el.duration.value / 60) : 0,
            durationText: el.duration?.text || '',
            status: el.status,
        }))
    );

    await setCache(cacheKey, result, DISTANCE_MATRIX_CACHE_TTL);
    res.json({ success: true, data: result });
});

// ---------------------------------------------------------------------------
// GET /api/maps/snap-to-road
// Proxy Google Roads API — snap GPS points to nearest road
// ---------------------------------------------------------------------------
exports.snapToRoad = catchAsync(async (req, res, next) => {
    const { path } = req.query;

    if (!path) {
        return next(new AppError('Missing path parameter (lat,lng|lat,lng|...)', 400));
    }

    if (!GOOGLE_MAPS_API_KEY) {
        return next(new AppError('Google Maps API key not configured', 503));
    }

    // Google Roads API allows max 100 points per request
    const points = path.split('|');
    if (points.length > 100) {
        return next(new AppError('Maximum 100 points per request', 400));
    }

    const url = `${ROADS_URL}/snapToRoads?` +
        `path=${encodeURIComponent(path)}` +
        `&interpolate=true` +
        `&key=${GOOGLE_MAPS_API_KEY}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.error) {
        return next(new AppError(`Roads API: ${data.error.message}`, 502));
    }

    res.json({
        success: true,
        data: {
            snappedPoints: (data.snappedPoints || []).map(p => ({
                location: {
                    latitude: p.location.latitude,
                    longitude: p.location.longitude,
                },
                originalIndex: p.originalIndex,
                placeId: p.placeId,
            })),
        },
    });
});

// ---------------------------------------------------------------------------
// GET /api/maps/geocode
// Proxy Google Geocoding API — backup for when Nominatim fails
// ---------------------------------------------------------------------------
exports.geocode = catchAsync(async (req, res, next) => {
    const { address, latlng, language } = req.query;

    if (!address && !latlng) {
        return next(new AppError('Missing address or latlng parameter', 400));
    }

    if (!GOOGLE_MAPS_API_KEY) {
        return next(new AppError('Google Maps API key not configured', 503));
    }

    const params = new URLSearchParams({
        key: GOOGLE_MAPS_API_KEY,
        language: language || 'ka',
    });

    if (address) {
        params.set('address', address);
        params.set('components', 'country:GE');
    } else {
        params.set('latlng', latlng);
    }

    const url = `${BASE_URL}/geocode/json?${params.toString()}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
        return next(new AppError(`Geocoding API returned: ${data.status}`, 502));
    }

    res.json({
        success: true,
        data: {
            results: (data.results || []).map(r => ({
                placeId: r.place_id,
                formattedAddress: r.formatted_address,
                coordinates: {
                    latitude: r.geometry.location.lat,
                    longitude: r.geometry.location.lng,
                },
                addressComponents: r.address_components,
                types: r.types,
            })),
        },
    });
});
