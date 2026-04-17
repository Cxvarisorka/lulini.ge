'use strict';

/**
 * Driver Matching Service — nearest-driver ranking by REAL ROAD distance.
 *
 * Current dispatch (driverDispatch.service.js) uses MongoDB $near (straight-line).
 * This service adds road-distance refinement via routing.service.getMatrix (OSRM /table).
 *
 * Typical flow:
 *   1. DB $near pulls top-N candidates inside a coarse radius (cheap, indexed).
 *   2. OSRM /table refines them by real driving duration.
 *   3. Return drivers sorted ascending by ETA.
 *
 * Keeps the DB index useful AND gets accurate road-distance ordering without
 * exploding the matrix size.
 */

const routing = require('./routing.service');
const logger = require('../utils/logger');

const DEFAULT_CANDIDATE_LIMIT = 10;
const MAX_MATRIX_SIZE = 25; // never send more than this to OSRM

/**
 * Rank candidate drivers by real-road ETA to pickup.
 *
 * @param {object} pickup - { lat, lng }
 * @param {Array}  candidates - Drivers with .location.coordinates = [lng, lat]
 * @param {object} [opts] - { limit }
 * @returns {Promise<Array>} Candidates sorted by durationSeconds ascending,
 *                           each annotated with { etaSeconds, distanceMeters }.
 */
async function rankByRoadDistance(pickup, candidates, { limit = DEFAULT_CANDIDATE_LIMIT } = {}) {
    if (!pickup || !Array.isArray(candidates) || candidates.length === 0) return [];

    const slice = candidates.slice(0, MAX_MATRIX_SIZE);

    const origins = [{ lat: pickup.lat, lng: pickup.lng }];
    const destinations = slice.map(d => {
        const [lng, lat] = d.location?.coordinates || [];
        return { lat, lng };
    });

    // If any candidate has malformed coords, skip OSRM and return DB order
    if (destinations.some(d => typeof d.lat !== 'number' || typeof d.lng !== 'number')) {
        logger.warn('Skipping matrix rank — malformed candidate coords', 'matching.service');
        return slice.slice(0, limit);
    }

    let matrix;
    try {
        matrix = await routing.getMatrix(origins, destinations);
    } catch (err) {
        // Hard fallback: return DB (straight-line) order
        logger.warn(`Matrix call failed, using straight-line order: ${err.message}`, 'matching.service');
        return slice.slice(0, limit);
    }

    const durations = matrix.durations[0] || [];
    const distances = matrix.distances?.[0] || [];

    const annotated = slice.map((driver, i) => ({
        ...driver,
        etaSeconds: durations[i],
        distanceMeters: distances[i] ?? null,
    }));

    // Drivers with null ETA (OSRM couldn't route) go last
    annotated.sort((a, b) => {
        if (a.etaSeconds == null) return 1;
        if (b.etaSeconds == null) return -1;
        return a.etaSeconds - b.etaSeconds;
    });

    return annotated.slice(0, limit);
}

module.exports = {
    rankByRoadDistance,
    MAX_MATRIX_SIZE,
};
