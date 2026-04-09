'use strict';

/**
 * Road Snap Service
 *
 * Snaps coordinates to the nearest road using Google Roads API.
 * Used to improve pickup precision after ride creation (async, non-blocking).
 *
 * Nominatim CANNOT snap to roads — it is a geocoder, not a routing engine.
 * Google Roads API or a self-hosted OSRM `nearest` endpoint are required.
 */

const logger = require('../utils/logger');

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const ROADS_URL = 'https://roads.googleapis.com/v1';

/**
 * Snap a single coordinate to the nearest road.
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<{lat: number, lng: number} | null>}
 */
async function snapToRoad(lat, lng) {
    if (!GOOGLE_MAPS_API_KEY) return null;

    try {
        const url = `${ROADS_URL}/snapToRoads?` +
            `path=${lat},${lng}` +
            `&key=${GOOGLE_MAPS_API_KEY}`;

        const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
        const data = await response.json();

        if (data.snappedPoints && data.snappedPoints.length > 0) {
            const snapped = data.snappedPoints[0].location;
            return { lat: snapped.latitude, lng: snapped.longitude };
        }
        return null;
    } catch (err) {
        logger.warn('Road snap API failed', 'roadSnap', err);
        return null;
    }
}

/**
 * Snap a ride's pickup location and persist the snapped coordinates.
 * Fire-and-forget — called after ride creation, does not block the response.
 *
 * @param {string} rideId
 */
async function snapRidePickup(rideId) {
    try {
        const Ride = require('../models/ride.model');
        const ride = await Ride.findById(rideId).select('pickup').lean();
        if (!ride?.pickup) return;

        const snapped = await snapToRoad(ride.pickup.lat, ride.pickup.lng);
        if (snapped) {
            await Ride.updateOne(
                { _id: rideId },
                { $set: { 'pickup.snappedRoadCoords': snapped } }
            );
        }
    } catch (err) {
        logger.warn('Ride pickup snap failed', 'roadSnap', err);
    }
}

module.exports = { snapToRoad, snapRidePickup };
