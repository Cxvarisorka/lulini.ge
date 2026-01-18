const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middlewares/auth.middleware');
const { uploadCarImages } = require('../configs/cloudinary.config');
const {
    // Tour operations
    getAllTours,
    getTourById,
    createTour,
    updateTour,
    deleteTour,
    deleteTourImage,
    // Tour order operations
    createTourOrder,
    getMyTourOrders,
    getAllTourOrders,
    getTourOrder,
    updateTourOrderStatus,
    cancelTourOrder,
    deleteTourOrder
} = require('../controllers/tour.controller');

// ============ TOUR ROUTES ============

// Public routes
router.get('/tours', getAllTours);
router.get('/tours/:id', getTourById);

// Admin routes for tours
router.post(
    '/tours',
    protect,
    authorize('admin'),
    uploadCarImages.fields([
        { name: 'image', maxCount: 1 },
        { name: 'images', maxCount: 10 }
    ]),
    createTour
);

router.patch(
    '/tours/:id',
    protect,
    authorize('admin'),
    uploadCarImages.fields([
        { name: 'image', maxCount: 1 },
        { name: 'images', maxCount: 10 }
    ]),
    updateTour
);

router.delete('/tours/:id', protect, authorize('admin'), deleteTour);

// Tour image management
router.delete('/tours/:id/images', protect, authorize('admin'), deleteTourImage);

// ============ TOUR ORDER ROUTES ============

// User routes
router.post('/tour-orders', protect, createTourOrder);
router.get('/tour-orders/my', protect, getMyTourOrders);
router.get('/tour-orders/:id', protect, getTourOrder);
router.patch('/tour-orders/:id/cancel', protect, cancelTourOrder);

// Admin routes for orders
router.get('/tour-orders', protect, authorize('admin'), getAllTourOrders);
router.patch('/tour-orders/:id/status', protect, authorize('admin'), updateTourOrderStatus);
router.delete('/tour-orders/:id', protect, authorize('admin'), deleteTourOrder);

module.exports = router;
