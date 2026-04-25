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
    getRideQuote,
    receiveLocationBatch
} = require('../controllers/ride.controller');
const { protect, authorize, isDriver } = require('../middlewares/auth.middleware');
const { validateCreateRide } = require('../middlewares/validators');
const { rideCreateLimiter, rideActionLimiter } = require('../middlewares/rateLimiter');

// User routes
router.post('/', protect, rideCreateLimiter, validateCreateRide, createRide);
router.get('/my', protect, getMyRides);
router.get('/scheduled', protect, getScheduledRides);
router.get('/quote', protect, getRideQuote);

// Driver routes
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
