const express = require('express');
const router = express.Router();
const {
    createRide,
    adminCreateRide,
    acceptRide,
    declineRide,
    notifyArrival,
    startRide,
    completeRide,
    cancelRide,
    getMyRides,
    getDriverRides,
    getRide,
    getAllRides,
    getAvailableRides,
    reviewDriver,
    reviewPassenger,
    getScheduledRides,
    receiveLocationBatch
} = require('../controllers/ride.controller');
const { protect, authorize, isDriver } = require('../middlewares/auth.middleware');
const { rideCreateLimiter, rideActionLimiter } = require('../middlewares/rateLimiter');
const { validateCreateRide } = require('../middlewares/validators');

// User routes
router.post('/', protect, rideCreateLimiter, validateCreateRide, createRide);
router.get('/my', protect, getMyRides);
router.get('/scheduled', protect, getScheduledRides);

// Driver routes — accept/decline/arrive/start/complete are gated by rideActionLimiter
// (60 actions/min per user) to stop runaway retry loops or a compromised token
// from flooding the socket layer with fake state transitions.
router.get('/driver/available', protect, isDriver, getAvailableRides);
router.get('/driver/my', protect, isDriver, getDriverRides);
router.patch('/:id/accept', protect, isDriver, rideActionLimiter, acceptRide);
router.patch('/:id/decline', protect, isDriver, rideActionLimiter, declineRide);
router.patch('/:id/arrive', protect, isDriver, rideActionLimiter, notifyArrival);
router.patch('/:id/start', protect, isDriver, rideActionLimiter, startRide);
router.patch('/:id/complete', protect, isDriver, rideActionLimiter, completeRide);
router.post('/:id/locations/batch', protect, isDriver, receiveLocationBatch);

// Shared routes
router.get('/:id', protect, getRide);
router.patch('/:id/cancel', protect, rideActionLimiter, cancelRide);
router.post('/:id/review', protect, reviewDriver);
router.post('/:id/review-passenger', protect, isDriver, reviewPassenger);

// Admin routes
router.post('/admin', protect, authorize('admin'), adminCreateRide);
router.get('/', protect, authorize('admin'), getAllRides);

module.exports = router;
