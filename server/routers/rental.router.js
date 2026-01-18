const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middlewares/auth.middleware');
const { uploadCarImages } = require('../configs/cloudinary.config');
const {
    // Car operations
    getAllCars,
    getCarById,
    createCar,
    updateCar,
    deleteCar,
    uploadCarImages: uploadCarImagesController,
    deleteCarImage,
    // Rental order operations
    createRentalOrder,
    getMyRentalOrders,
    getAllRentalOrders,
    getRentalOrder,
    updateRentalOrderStatus,
    cancelRentalOrder,
    deleteRentalOrder
} = require('../controllers/rental.controller');

// ============ CAR ROUTES ============

// Public routes
router.get('/cars', getAllCars);
router.get('/cars/:id', getCarById);

// Admin routes for cars
router.post(
    '/cars',
    protect,
    authorize('admin'),
    uploadCarImages.fields([
        { name: 'image', maxCount: 1 },
        { name: 'images', maxCount: 10 }
    ]),
    createCar
);

router.patch(
    '/cars/:id',
    protect,
    authorize('admin'),
    uploadCarImages.fields([
        { name: 'image', maxCount: 1 },
        { name: 'images', maxCount: 10 }
    ]),
    updateCar
);

router.delete('/cars/:id', protect, authorize('admin'), deleteCar);

// Car image management
router.post(
    '/cars/:id/images',
    protect,
    authorize('admin'),
    uploadCarImages.array('images', 10),
    uploadCarImagesController
);

router.delete('/cars/:id/images', protect, authorize('admin'), deleteCarImage);

// ============ RENTAL ORDER ROUTES ============

// User routes
router.post('/rental-orders', protect, createRentalOrder);
router.get('/rental-orders/my', protect, getMyRentalOrders);
router.get('/rental-orders/:id', protect, getRentalOrder);
router.patch('/rental-orders/:id/cancel', protect, cancelRentalOrder);

// Admin routes for orders
router.get('/rental-orders', protect, authorize('admin'), getAllRentalOrders);
router.patch('/rental-orders/:id/status', protect, authorize('admin'), updateRentalOrderStatus);
router.delete('/rental-orders/:id', protect, authorize('admin'), deleteRentalOrder);

module.exports = router;
