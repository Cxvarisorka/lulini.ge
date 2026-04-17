'use strict';

/**
 * OSRM Provider — primary routing engine.
 *
 * Unified contract (shared with google.provider):
 *   getRoute({origin, destination}) →
 *     { distanceMeters, durationSeconds, polyline: [[lat,lng],...], provider: 'osrm' }
 *   getMatrix({origins, destinations}) →
 *     { durations: number[][], distances: number[][], provider: 'osrm' }
 *
 * No caching logic here — that is the service layer's responsibility.
 */

const logger = require('../utils/logger');

const OSRM_BASE = process.env.OSRM_URL || 'https://router.project-osrm.org';
const DEFAULT_PROFILE = 'driving';
const FETCH_TIMEOUT_MS = 4000;

function coordStr(p) {
    return `${p.lng},${p.lat}`;
}

function decodePolyline5(encoded) {
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

async function getRoute({ origin, destination, profile = DEFAULT_PROFILE, steps = false }) {
    const url = `${OSRM_BASE}/route/v1/${profile}/${coordStr(origin)};${coordStr(destination)}` +
        `?overview=full&geometries=polyline&steps=${steps ? 'true' : 'false'}`;

    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`OSRM route HTTP ${res.status}`);
    const data = await res.json();

    if (data.code !== 'Ok' || !data.routes?.[0]) {
        throw new Error(`OSRM route code=${data.code}`);
    }

    const route = data.routes[0];
    const result = {
        distanceMeters: Math.round(route.distance),
        durationSeconds: Math.round(route.duration),
        polyline: decodePolyline5(route.geometry),
        provider: 'osrm',
    };

    if (steps && route.legs?.[0]?.steps) {
        result.steps = route.legs[0].steps.map((s, i) => ({
            index: i,
            distanceMeters: Math.round(s.distance),
            durationSeconds: Math.round(s.duration),
            name: s.name || '',
            maneuver: {
                type: s.maneuver.type,
                modifier: s.maneuver.modifier || null,
                location: [s.maneuver.location[1], s.maneuver.location[0]],
            },
            geometry: decodePolyline5(s.geometry),
        }));
    }

    return result;
}

async function getMatrix({ origins, destinations, profile = DEFAULT_PROFILE }) {
    const coords = [...origins, ...destinations].map(coordStr).join(';');
    const src = origins.map((_, i) => i).join(';');
    const dst = destinations.map((_, i) => origins.length + i).join(';');

    const url = `${OSRM_BASE}/table/v1/${profile}/${coords}` +
        `?sources=${src}&destinations=${dst}&annotations=duration,distance`;

    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`OSRM table HTTP ${res.status}`);
    const data = await res.json();

    if (data.code !== 'Ok') throw new Error(`OSRM table code=${data.code}`);

    return {
        durations: data.durations.map(row => row.map(v => v == null ? null : Math.round(v))),
        distances: (data.distances || []).map(row => row.map(v => v == null ? null : Math.round(v))),
        provider: 'osrm',
    };
}

module.exports = {
    name: 'osrm',
    getRoute,
    getMatrix,
};
