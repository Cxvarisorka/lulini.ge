/**
 * Ride Receipt Controller
 *
 * Generates a structured receipt JSON for a completed ride. The mobile app
 * renders this into a human-readable receipt screen. No payment processing
 * occurs here — this is purely a data aggregation endpoint.
 */

'use strict';

const Ride = require('../models/ride.model');
const Driver = require('../models/driver.model');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const { maskPhone } = require('../utils/phoneMask');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format a duration in seconds to a human-readable string.
 * e.g. 3725 → "1h 2m"
 */
function formatDuration(seconds) {
    if (!seconds || seconds <= 0) return null;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

/**
 * Format a distance in meters to a human-readable string.
 * e.g. 12400 → "12.4 km"
 */
function formatDistance(meters) {
    if (!meters || meters <= 0) return null;
    if (meters < 1000) return `${Math.round(meters)}m`;
    return `${(meters / 1000).toFixed(1)} km`;
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

// @desc    Get receipt for a completed ride
// @route   GET /api/receipts/rides/:rideId/receipt
// @access  Private (passenger, assigned driver, or admin)
const getReceipt = catchAsync(async (req, res, next) => {
    const ride = await Ride.findById(req.params.rideId)
        .populate('user', 'firstName lastName email phone')
        .populate({
            path: 'driver',
            populate: {
                path: 'user',
                select: 'firstName lastName phone profileImage'
            }
        })
        .lean();

    if (!ride) {
        return next(new AppError('Ride not found', 404));
    }

    if (ride.status !== 'completed') {
        return next(new AppError('Receipt is only available for completed rides', 400));
    }

    // Authorization: passenger, the assigned driver, or admin
    const userId = (req.user._id || req.user.id).toString();
    const isPassenger = ride.user._id.toString() === userId;
    const isAdmin = req.user.role === 'admin';

    let isDriver = false;
    if (ride.driver) {
        const driverDoc = await Driver.findOne({ user: userId, _id: ride.driver._id }).select('_id').lean();
        isDriver = !!driverDoc;
    }

    if (!isPassenger && !isDriver && !isAdmin) {
        return next(new AppError('You do not have access to this receipt', 403));
    }

    // Fare breakdown — waiting fee is already captured on the ride
    const baseFare = ride.quote?.basePrice ?? 0;
    const distanceCharge = Math.max(0, (ride.fare || 0) - baseFare - (ride.waitingFee || 0));

    // Ride duration in seconds (derived from startTime / endTime)
    let durationSeconds = null;
    if (ride.startTime && ride.endTime) {
        durationSeconds = Math.round((new Date(ride.endTime) - new Date(ride.startTime)) / 1000);
    }

    const receipt = {
        receiptId: ride._id,
        generatedAt: new Date().toISOString(),

        ride: {
            id: ride._id,
            status: ride.status,
            vehicleType: ride.vehicleType,
            pickup: {
                address: ride.pickup.address,
                lat: ride.pickup.lat,
                lng: ride.pickup.lng
            },
            dropoff: {
                address: ride.dropoff.address,
                lat: ride.dropoff.lat,
                lng: ride.dropoff.lng
            },
            stops: (ride.stops || []).map(s => ({
                address: s.address,
                lat: s.lat,
                lng: s.lng
            })),
            distance: {
                meters: ride.quote?.distance ?? null,
                formatted: ride.quote?.distanceText ?? formatDistance(ride.quote?.distance)
            },
            duration: {
                seconds: durationSeconds,
                formatted: durationSeconds
                    ? formatDuration(durationSeconds)
                    : (ride.quote?.durationText ?? null)
            },
            notes: ride.notes ?? null
        },

        driver: ride.driver ? {
            name: `${ride.driver.user?.firstName || ''} ${ride.driver.user?.lastName || ''}`.trim(),
            // Admins see full phone for dispute resolution; passenger + driver see masked.
            phone: isAdmin
                ? (ride.driver.user?.phone ?? null)
                : maskPhone(ride.driver.user?.phone ?? null),
            profileImage: ride.driver.user?.profileImage ?? null,
            vehicle: ride.driver.vehicle
                ? {
                    type: ride.driver.vehicle.type,
                    make: ride.driver.vehicle.make,
                    model: ride.driver.vehicle.model,
                    year: ride.driver.vehicle.year,
                    color: ride.driver.vehicle.color,
                    licensePlate: ride.driver.vehicle.licensePlate
                }
                : null,
            rating: ride.driver.rating ?? null
        } : null,

        passenger: {
            name: ride.passengerName,
            // Admins see full phone; the driver who ran the ride sees masked;
            // the passenger themselves can see their own phone unmasked.
            phone: (isAdmin || isPassenger)
                ? (ride.passengerPhone || null)
                : maskPhone(ride.passengerPhone || null)
        },

        fare: {
            currency: 'GEL',
            total: ride.fare ?? 0,
            breakdown: {
                baseFare,
                distanceCharge: Math.round(distanceCharge * 100) / 100,
                waitingFee: ride.waitingFee ?? 0
            },
            paymentMethod: ride.paymentMethod
        },

        timestamps: {
            requested: ride.createdAt,
            driverArrived: ride.arrivalTime ?? null,
            rideStarted: ride.startTime ?? null,
            rideCompleted: ride.endTime ?? null
        },

        rating: ride.rating ?? null,
        review: ride.review ?? null
    };

    res.json({
        success: true,
        data: { receipt }
    });
});

module.exports = { getReceipt };
