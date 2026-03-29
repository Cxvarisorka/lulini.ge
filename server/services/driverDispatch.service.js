/**
 * Driver Dispatch Service
 *
 * Implements nearest-driver-first dispatch for ride requests.
 * Instead of broadcasting to all drivers, offers the ride to the nearest
 * eligible driver first, with a timeout cascade to the next nearest.
 *
 * This replaces the "fastest finger" broadcast model with ordered dispatch.
 */

const Driver = require('../models/driver.model');
const RideOffer = require('../models/rideOffer.model');
const pushService = require('./pushNotification.service');
const { isUserOnlineAsync } = require('../socket/presence');

// Time to wait for each driver to respond before moving to the next
const OFFER_TIMEOUT_MS = 15000; // 15 seconds

// Maximum number of drivers to offer a ride to before giving up
const MAX_OFFER_ROUNDS = 5;

/**
 * Vehicle type hierarchy — which driver types can serve a given ride type.
 */
function getEligibleDriverTypes(rideVehicleType) {
    switch (rideVehicleType) {
        case 'economy': return ['economy', 'comfort', 'business'];
        case 'comfort': return ['comfort', 'business'];
        case 'business': return ['business'];
        default: return [rideVehicleType];
    }
}

/**
 * Find the nearest eligible drivers for a ride.
 *
 * @param {object} pickup - { lat, lng }
 * @param {string} vehicleType - Ride vehicle type
 * @param {string[]} excludeDriverIds - Driver IDs to exclude (already offered/declined)
 * @param {number} limit - Max drivers to return
 * @returns {Promise<Array>} Drivers sorted by proximity
 */
async function findNearestDrivers(pickup, vehicleType, excludeDriverIds = [], limit = MAX_OFFER_ROUNDS) {
    const eligibleTypes = getEligibleDriverTypes(vehicleType);

    const query = {
        status: 'online',
        isActive: true,
        isApproved: true,
        'vehicle.type': { $in: eligibleTypes },
        location: {
            $near: {
                $geometry: {
                    type: 'Point',
                    coordinates: [pickup.lng, pickup.lat],
                },
                $maxDistance: 15000, // 15km radius
            },
        },
    };

    if (excludeDriverIds.length > 0) {
        query._id = { $nin: excludeDriverIds };
    }

    return Driver.find(query)
        .select('_id user vehicle.type location')
        .limit(limit)
        .lean();
}

/**
 * Create a ride offer record for analytics tracking.
 *
 * @param {string} rideId
 * @param {string} driverId
 * @returns {Promise<object>} Created offer
 */
async function createOffer(rideId, driverId) {
    return RideOffer.create({
        ride: rideId,
        driver: driverId,
        status: 'pending',
        offeredAt: new Date(),
    });
}

/**
 * Send a ride offer to a specific driver via socket + push.
 *
 * @param {object} io - Socket.io server instance
 * @param {object} driver - Driver document (with user field)
 * @param {object} rideData - Ride data to send
 */
async function sendOfferToDriver(io, driver, rideData) {
    const driverUserId = driver.user.toString();

    // Socket notification (real-time)
    if (io) {
        io.to(`driver:${driverUserId}`).emit('ride:offer', {
            ...rideData,
            offerTimeoutMs: OFFER_TIMEOUT_MS,
        });
    }

    // Push notification fallback if driver not connected via socket
    const isOnline = await isUserOnlineAsync(driverUserId).catch(() => false);
    if (!isOnline) {
        await pushService.sendToUser(
            driverUserId,
            'ride_request_title',
            'ride_request_body',
            { rideId: rideData.rideId || rideData._id?.toString() || '' },
            { address: rideData.pickupAddress || '' }
        ).catch(() => {});
    }
}

/**
 * Mark timed-out offers as expired.
 *
 * @param {string} rideId
 */
async function expireTimedOutOffers(rideId) {
    await RideOffer.updateMany(
        { ride: rideId, status: 'pending' },
        { status: 'timeout', respondedAt: new Date() }
    );
}

module.exports = {
    getEligibleDriverTypes,
    findNearestDrivers,
    createOffer,
    sendOfferToDriver,
    expireTimedOutOffers,
    OFFER_TIMEOUT_MS,
    MAX_OFFER_ROUNDS,
};
