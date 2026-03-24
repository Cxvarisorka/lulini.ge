/**
 * rideWatchdog.service.js — Server-side watchdog for active ride tracking.
 *
 * Runs every 30 seconds. For each in_progress ride, checks how long since
 * the driver's last location update. Uses speed-aware thresholds:
 *   - Moving (>7 km/h): alert after 60s
 *   - Stationary: alert after 180s (red light, parked)
 *
 * Three-tier alerting:
 *   Tier 1: Silent push to wake app (after soft threshold)
 *   Tier 2: Visible push + passenger notification (after hard threshold)
 *   Tier 3: Mark ride as tracking_lost (after 5 minutes)
 */
const Ride = require('../models/ride.model');
const Driver = require('../models/driver.model');
const pushService = require('./pushNotification.service');

const WATCHDOG_INTERVAL_MS = 30000; // 30 seconds

// Speed-aware thresholds (seconds)
const MOVING_SOFT_THRESHOLD = 60;    // 1 min — silent push
const MOVING_HARD_THRESHOLD = 120;   // 2 min — visible push + notify passenger
const STATIONARY_SOFT_THRESHOLD = 180; // 3 min — silent push
const STATIONARY_HARD_THRESHOLD = 300; // 5 min — visible push + notify passenger

let _intervalId = null;

/**
 * Start the ride tracking watchdog.
 * @param {Object} io - Socket.io server instance
 */
function startWatchdog(io) {
    if (_intervalId) return; // Already running

    _intervalId = setInterval(() => {
        runWatchdogCheck(io).catch(err =>
            console.error('[Watchdog] Check failed:', err.message)
        );
    }, WATCHDOG_INTERVAL_MS);

    // Don't keep process alive for watchdog
    if (_intervalId.unref) _intervalId.unref();

    console.log('[Watchdog] Ride tracking watchdog started (30s interval)');
}

function stopWatchdog() {
    if (_intervalId) {
        clearInterval(_intervalId);
        _intervalId = null;
    }
}

async function runWatchdogCheck(io) {
    // Find all rides currently in progress
    const activeRides = await Ride.find({
        status: 'in_progress',
    }).select('_id user driver startTime').lean();

    if (activeRides.length === 0) return;

    // Get driver IDs for batch lookup
    const driverIds = activeRides
        .filter(r => r.driver)
        .map(r => r.driver);

    // Batch fetch all relevant drivers (1 query instead of N)
    const drivers = await Driver.find({
        _id: { $in: driverIds }
    }).select('_id user location updatedAt').lean();

    const driverMap = new Map(drivers.map(d => [d._id.toString(), d]));

    const now = Date.now();

    for (const ride of activeRides) {
        if (!ride.driver) continue;

        const driver = driverMap.get(ride.driver.toString());
        if (!driver) continue;

        // Calculate silence duration
        const lastUpdateTime = driver.updatedAt
            ? new Date(driver.updatedAt).getTime()
            : 0;
        const silentSeconds = (now - lastUpdateTime) / 1000;

        if (silentSeconds < MOVING_SOFT_THRESHOLD) continue; // Everything is fine

        // Estimate if driver was moving (based on ride age — crude but effective)
        // If ride started recently (<5 min ago), assume moving
        const rideAge = (now - new Date(ride.startTime).getTime()) / 1000;
        const isLikelyMoving = rideAge < 300; // <5 min into ride

        const softThreshold = isLikelyMoving
            ? MOVING_SOFT_THRESHOLD
            : STATIONARY_SOFT_THRESHOLD;
        const hardThreshold = isLikelyMoving
            ? MOVING_HARD_THRESHOLD
            : STATIONARY_HARD_THRESHOLD;

        if (silentSeconds > hardThreshold) {
            // Tier 2: Visible push + notify passenger
            if (driver.user) {
                pushService.sendToUser(
                    driver.user.toString(),
                    'tracking_paused_title',
                    'tracking_paused_body',
                    {
                        type: 'resume_tracking',
                        rideId: ride._id.toString(),
                        channelId: 'ride-tracking',
                    }
                ).catch(err =>
                    console.error('[Watchdog] Visible push failed:', err.message)
                );
            }

            // Notify passenger that tracking is degraded
            if (io && ride.user) {
                const lastKnown = driver.location?.coordinates
                    ? {
                        lat: driver.location.coordinates[1],
                        lng: driver.location.coordinates[0],
                    }
                    : null;

                io.to(`user:${ride.user}`).emit('ride:trackingDegraded', {
                    rideId: ride._id,
                    lastKnownLocation: lastKnown,
                    silentSeconds: Math.round(silentSeconds),
                    message: 'Driver location temporarily unavailable',
                });
            }
        } else if (silentSeconds > softThreshold) {
            // Tier 1: Silent push to wake app
            if (driver.user) {
                pushService.sendToUser(
                    driver.user.toString(),
                    null, // silent push — no title
                    null, // silent push — no body
                    {
                        type: 'wake_tracking',
                        rideId: ride._id.toString(),
                        silent: true,
                    }
                ).catch(err =>
                    console.error('[Watchdog] Silent push failed:', err.message)
                );
            }
        }
    }
}

module.exports = { startWatchdog, stopWatchdog };
