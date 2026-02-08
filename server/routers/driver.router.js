const express = require('express');
const { protect, authorize, isDriver } = require('../middlewares/auth.middleware');
const {
    createDriver,
    getAllDrivers,
    getDriver,
    updateDriver,
    deleteDriver,
    getDriverProfile,
    updateDriverStatus,
    updateDriverLocation,
    getDriverStats,
    getDriverEarnings,
    getDriverReviews,
    getAllDriverStatistics,
    getNearbyDrivers
} = require('../controllers/driver.controller');

const router = express.Router();

// Protect all routes - require authentication
router.use(protect);

// Passenger route - get nearby online drivers for map display
router.get('/nearby', getNearbyDrivers);

// Driver routes (for logged in drivers)
router.get('/profile', isDriver, getDriverProfile);
router.patch('/status', isDriver, updateDriverStatus);
router.patch('/location', isDriver, updateDriverLocation);
router.get('/stats', isDriver, getDriverStats);
router.get('/earnings', isDriver, getDriverEarnings);

// Admin routes
router.get('/admin/statistics', authorize('admin'), getAllDriverStatistics);
router.post('/', authorize('admin'), createDriver);
router.get('/', authorize('admin'), getAllDrivers);
router.get('/:id', authorize('admin'), getDriver);
router.get('/:id/reviews', getDriverReviews); // Admin or driver can access their own reviews
router.patch('/:id', authorize('admin'), updateDriver);
router.delete('/:id', authorize('admin'), deleteDriver);

module.exports = router;
