'use strict';

/**
 * Coordinate anonymization utilities for privacy-safe analytics exports.
 *
 * Rounding to 3 decimal places gives ~110m precision — enough for zone-level
 * analytics (heatmaps, demand patterns) but not exact user locations.
 */

/**
 * Round coordinates for privacy-safe export.
 * @param {number} lat
 * @param {number} lng
 * @param {number} [precision=3] - Decimal places (3 ≈ 110m, 4 ≈ 11m)
 * @returns {{ lat: number, lng: number }}
 */
function anonymizeCoords(lat, lng, precision = 3) {
    return {
        lat: parseFloat(parseFloat(lat).toFixed(precision)),
        lng: parseFloat(parseFloat(lng).toFixed(precision)),
    };
}

/**
 * Produce an analytics-safe ride export.
 * Strips: exact addresses, user/driver identity, phone numbers, route trace.
 * Keeps: anonymized coords, vehicle type, fare, timestamps.
 *
 * @param {object} ride - Mongoose ride document or lean object
 * @returns {object} Anonymized ride data
 */
function anonymizeRideForExport(ride) {
    return {
        rideId: ride._id,
        vehicleType: ride.vehicleType,
        status: ride.status,
        pickup: ride.pickup ? anonymizeCoords(ride.pickup.lat, ride.pickup.lng) : null,
        dropoff: ride.dropoff ? anonymizeCoords(ride.dropoff.lat, ride.dropoff.lng) : null,
        distance: ride.quote?.distance,
        duration: ride.quote?.duration,
        fare: ride.fare,
        createdAt: ride.createdAt,
        completedAt: ride.endTime,
        // Excluded: address, user, driver, passengerName, passengerPhone, routePoints
    };
}

module.exports = { anonymizeCoords, anonymizeRideForExport };
