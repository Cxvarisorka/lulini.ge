'use strict';

/**
 * Location Retention Cleanup Job
 *
 * Strips routePoints from completed/cancelled rides older than the retention period.
 * This preserves privacy while keeping pickup/dropoff/quote permanently for billing.
 *
 * Run daily at 3:00 AM via the background job scheduler in app.js.
 * Only runs when the FF_LOCATION_RETENTION feature flag is enabled.
 */

const logger = require('../utils/logger');

const RETENTION_DAYS = parseInt(process.env.ROUTE_POINTS_RETENTION_DAYS, 10) || 90;

/**
 * Remove routePoints from old completed/cancelled rides.
 * Uses a batch-update approach to avoid loading full ride documents into memory.
 *
 * @returns {Promise<number>} Number of rides cleaned
 */
async function cleanupRoutePoints() {
    const Ride = require('../models/ride.model');

    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

    const result = await Ride.updateMany(
        {
            status: { $in: ['completed', 'cancelled'] },
            createdAt: { $lt: cutoff },
            // Only touch rides that actually have routePoints (avoids unnecessary writes)
            'routePoints.0': { $exists: true },
        },
        {
            $set: { routePoints: [] },
        }
    );

    if (result.modifiedCount > 0) {
        logger.info(
            `Cleared routePoints from ${result.modifiedCount} rides older than ${RETENTION_DAYS} days`,
            'locationRetention'
        );
    }

    return result.modifiedCount;
}

module.exports = { cleanupRoutePoints, RETENTION_DAYS };
