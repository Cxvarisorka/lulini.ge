const express = require('express');
const { protect, authorize, isDriver } = require('../middlewares/auth.middleware');
const {
    uploadDriverPhoto: uploadDriverPhotoMiddleware,
    uploadDriverDocument: uploadDriverDocumentMiddleware
} = require('../configs/cloudinary.config');
const {
    createDriver,
    getAllDrivers,
    getDriver,
    updateDriver,
    deleteDriver,
    uploadDriverPhoto,
    getDriverProfile,
    updateDriverStatus,
    updateDriverLocation,
    batchUpdateDriverLocation,
    getDriverStats,
    getDriverEarnings,
    getDriverReviews,
    getAllDriverStatistics,
    getNearbyDrivers,
    getDriverActivity,
    getDriverOfferStats,
    registerDriver,
    uploadDriverDocument,
    getPendingDrivers,
    approveDriver,
    getOnboardingStatus
} = require('../controllers/driver.controller');

const { validateUpdateDriverLocation } = require('../middlewares/validators');

// NOTE: Rate limiters temporarily removed.

const router = express.Router();

// Protect all routes - require authentication
router.use(protect);

// Passenger route - get nearby online drivers for map display
router.get('/nearby', getNearbyDrivers);

// Self-registration — authenticated user applies to become a driver (no isDriver required)
router.post('/register', registerDriver);

// Onboarding status — any authenticated user can check (no isDriver required)
router.get('/onboarding-status', getOnboardingStatus);

// Document upload — any user with a driver profile (approved or pending) can upload
router.post('/documents/:type', uploadDriverDocumentMiddleware.single('document'), uploadDriverDocument);

// Driver routes (for logged in drivers)
router.get('/profile', isDriver, getDriverProfile);
router.patch('/status', isDriver, updateDriverStatus);
router.patch('/location', isDriver, validateUpdateDriverLocation, updateDriverLocation);
router.post('/location/batch', isDriver, batchUpdateDriverLocation);
router.get('/stats', isDriver, getDriverStats);
router.get('/earnings', isDriver, getDriverEarnings);

// Admin routes
router.get('/admin/pending', authorize('admin'), getPendingDrivers);
router.patch('/admin/:id/approve', authorize('admin'), approveDriver);
router.get('/admin/statistics', authorize('admin'), getAllDriverStatistics);
router.post('/', authorize('admin'), createDriver);
router.get('/', authorize('admin'), getAllDrivers);
router.get('/:id', authorize('admin'), getDriver);
router.get('/:id/activity', authorize('admin'), getDriverActivity);
router.get('/:id/offers', authorize('admin'), getDriverOfferStats);
router.get('/:id/reviews', authorize('admin'), getDriverReviews);
router.patch('/:id', authorize('admin'), updateDriver);
router.post('/:id/photo', authorize('admin'), uploadDriverPhotoMiddleware.single('photo'), uploadDriverPhoto);
router.delete('/:id', authorize('admin'), deleteDriver);

module.exports = router;
