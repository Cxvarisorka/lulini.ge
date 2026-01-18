const express = require('express');
const router = express.Router();
const {
    createRide,
    acceptRide,
    startRide,
    completeRide,
    cancelRide,
    getMyRides,
    getDriverRides,
    getRide,
    getAllRides
} = require('../controllers/ride.controller');
const { protect, authorize, isDriver } = require('../middlewares/auth.middleware');

// User routes
router.post('/', protect, createRide);
router.get('/my', protect, getMyRides);

// Driver routes
router.get('/driver/my', protect, isDriver, getDriverRides);
router.patch('/:id/accept', protect, isDriver, acceptRide);
router.patch('/:id/start', protect, isDriver, startRide);
router.patch('/:id/complete', protect, isDriver, completeRide);

// Shared routes
router.get('/:id', protect, getRide);
router.patch('/:id/cancel', protect, cancelRide);

// Admin routes
router.get('/', protect, authorize('admin'), getAllRides);

module.exports = router;
