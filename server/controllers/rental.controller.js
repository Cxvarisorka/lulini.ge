const RentalCar = require('../models/rentalCar.model');
const RentalOrder = require('../models/rentalOrder.model');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const { deleteImage, getPublicIdFromUrl } = require('../configs/cloudinary.config');

// ============ CAR OPERATIONS ============

// @desc    Get all cars
// @route   GET /api/cars
// @access  Public
const getAllCars = catchAsync(async (req, res, next) => {
    const { category, location, available, search } = req.query;

    const query = {};

    if (category && category !== 'all') {
        query.category = category;
    }

    if (location) {
        query.locationId = location;
    }

    if (available !== undefined) {
        query.available = available === 'true';
    }

    if (search) {
        query.$or = [
            { brand: { $regex: search, $options: 'i' } },
            { model: { $regex: search, $options: 'i' } }
        ];
    }

    const cars = await RentalCar.find(query).sort({ createdAt: -1 });

    res.json({
        success: true,
        count: cars.length,
        data: { cars }
    });
});

// @desc    Get single car by ID
// @route   GET /api/cars/:id
// @access  Public
const getCarById = catchAsync(async (req, res, next) => {
    const car = await RentalCar.findById(req.params.id);

    if (!car) {
        return next(new AppError('Car not found', 404));
    }

    res.json({
        success: true,
        data: { car }
    });
});

// @desc    Create new car (Admin)
// @route   POST /api/cars
// @access  Private/Admin
const createCar = catchAsync(async (req, res, next) => {
    const carData = { ...req.body };

    // Handle uploaded images
    if (req.files) {
        if (req.files.image && req.files.image[0]) {
            carData.image = req.files.image[0].path;
        }
        if (req.files.images) {
            carData.images = req.files.images.map(file => file.path);
        }
    }

    // Parse features if sent as string
    if (typeof carData.features === 'string') {
        carData.features = JSON.parse(carData.features);
    }

    const car = await RentalCar.create(carData);

    // Emit real-time event
    const io = req.app.get('io');
    if (io) {
        io.to('admin').emit('car:created', car);
    }

    res.status(201).json({
        success: true,
        message: 'Car created successfully',
        data: { car }
    });
});

// @desc    Update car (Admin)
// @route   PATCH /api/cars/:id
// @access  Private/Admin
const updateCar = catchAsync(async (req, res, next) => {
    let car = await RentalCar.findById(req.params.id);

    if (!car) {
        return next(new AppError('Car not found', 404));
    }

    const updates = { ...req.body };

    // Handle uploaded images
    if (req.files) {
        if (req.files.image && req.files.image[0]) {
            // Delete old main image from Cloudinary
            if (car.image) {
                const publicId = getPublicIdFromUrl(car.image);
                if (publicId) await deleteImage(publicId);
            }
            updates.image = req.files.image[0].path;
        }
        if (req.files.images) {
            // Add new images to gallery (don't delete old ones unless explicitly requested)
            const newImages = req.files.images.map(file => file.path);
            updates.images = [...(car.images || []), ...newImages];
        }
    }

    // Parse features if sent as string
    if (typeof updates.features === 'string') {
        updates.features = JSON.parse(updates.features);
    }

    // Handle explicit images array update (for removing images)
    if (req.body.images && typeof req.body.images === 'string') {
        updates.images = JSON.parse(req.body.images);
    }

    car = await RentalCar.findByIdAndUpdate(
        req.params.id,
        updates,
        { new: true, runValidators: true }
    );

    // Emit real-time event
    const io = req.app.get('io');
    if (io) {
        io.to('admin').emit('car:updated', car);
    }

    res.json({
        success: true,
        message: 'Car updated successfully',
        data: { car }
    });
});

// @desc    Delete car (Admin)
// @route   DELETE /api/cars/:id
// @access  Private/Admin
const deleteCar = catchAsync(async (req, res, next) => {
    const car = await RentalCar.findById(req.params.id);

    if (!car) {
        return next(new AppError('Car not found', 404));
    }

    // Delete images from Cloudinary
    if (car.image) {
        const publicId = getPublicIdFromUrl(car.image);
        if (publicId) await deleteImage(publicId);
    }
    if (car.images && car.images.length > 0) {
        for (const img of car.images) {
            const publicId = getPublicIdFromUrl(img);
            if (publicId) await deleteImage(publicId);
        }
    }

    await RentalCar.findByIdAndDelete(req.params.id);

    // Emit real-time event
    const io = req.app.get('io');
    if (io) {
        io.to('admin').emit('car:deleted', { _id: req.params.id });
    }

    res.json({
        success: true,
        message: 'Car deleted successfully',
        data: null
    });
});

// @desc    Upload car images (Admin)
// @route   POST /api/cars/:id/images
// @access  Private/Admin
const uploadCarImages = catchAsync(async (req, res, next) => {
    const car = await RentalCar.findById(req.params.id);

    if (!car) {
        return next(new AppError('Car not found', 404));
    }

    if (!req.files || req.files.length === 0) {
        return next(new AppError('Please upload at least one image', 400));
    }

    const newImages = req.files.map(file => file.path);
    car.images = [...(car.images || []), ...newImages];
    await car.save();

    res.json({
        success: true,
        message: 'Images uploaded successfully',
        data: { car }
    });
});

// @desc    Delete car image (Admin)
// @route   DELETE /api/cars/:id/images
// @access  Private/Admin
const deleteCarImage = catchAsync(async (req, res, next) => {
    const { imageUrl } = req.body;

    const car = await RentalCar.findById(req.params.id);

    if (!car) {
        return next(new AppError('Car not found', 404));
    }

    // Delete from Cloudinary
    const publicId = getPublicIdFromUrl(imageUrl);
    if (publicId) {
        await deleteImage(publicId);
    }

    // Remove from car's images array
    car.images = car.images.filter(img => img !== imageUrl);
    await car.save();

    res.json({
        success: true,
        message: 'Image deleted successfully',
        data: { car }
    });
});

// ============ RENTAL ORDER OPERATIONS ============

// @desc    Create rental order
// @route   POST /api/rental-orders
// @access  Private
const createRentalOrder = catchAsync(async (req, res, next) => {
    const { carId, startDate, endDate, pickupTime, returnTime, pickupLocation, returnLocation, name, email, phone, days, extras, notes } = req.body;

    // Get car details
    const car = await RentalCar.findById(carId);
    if (!car) {
        return next(new AppError('Car not found', 404));
    }

    if (!car.available) {
        return next(new AppError('Car is not available for rental', 400));
    }

    // Calculate pricing
    const pricePerDay = car.pricePerDay;
    const totalPrice = pricePerDay * days;

    const orderData = {
        user: req.user.id,
        car: carId,
        carSnapshot: {
            brand: car.brand,
            model: car.model,
            year: car.year,
            image: car.image,
            pricePerDay: car.pricePerDay
        },
        startDate,
        endDate,
        pickupTime,
        returnTime,
        pickupLocation,
        returnLocation: returnLocation || pickupLocation,
        name,
        email,
        phone,
        days,
        pricePerDay,
        totalPrice,
        deposit: car.deposit,
        extras: extras || {},
        notes
    };

    const order = await RentalOrder.create(orderData);

    // Populate for response
    const populatedOrder = await RentalOrder.findById(order._id)
        .populate('user', 'firstName lastName email')
        .populate('car', 'brand model year image');

    // Emit real-time event to admin
    const io = req.app.get('io');
    if (io) {
        io.to('admin').emit('rentalOrder:created', populatedOrder);
    }

    res.status(201).json({
        success: true,
        message: 'Rental order created successfully',
        data: { order: populatedOrder }
    });
});

// @desc    Get current user's rental orders
// @route   GET /api/rental-orders/my
// @access  Private
const getMyRentalOrders = catchAsync(async (req, res, next) => {
    const orders = await RentalOrder.find({ user: req.user.id })
        .populate('car', 'brand model year image')
        .sort({ createdAt: -1 });

    res.json({
        success: true,
        count: orders.length,
        data: { orders }
    });
});

// @desc    Get all rental orders (Admin)
// @route   GET /api/rental-orders
// @access  Private/Admin
const getAllRentalOrders = catchAsync(async (req, res, next) => {
    const { status } = req.query;

    const query = {};
    if (status && status !== 'all') {
        query.status = status;
    }

    const orders = await RentalOrder.find(query)
        .populate('user', 'firstName lastName email')
        .populate('car', 'brand model year image')
        .sort({ createdAt: -1 });

    res.json({
        success: true,
        count: orders.length,
        data: { orders }
    });
});

// @desc    Get single rental order
// @route   GET /api/rental-orders/:id
// @access  Private
const getRentalOrder = catchAsync(async (req, res, next) => {
    const order = await RentalOrder.findById(req.params.id)
        .populate('user', 'firstName lastName email')
        .populate('car', 'brand model year image');

    if (!order) {
        return next(new AppError('Order not found', 404));
    }

    // Check if user owns this order or is admin
    if (order.user._id.toString() !== req.user.id && req.user.role !== 'admin') {
        return next(new AppError('Not authorized to access this order', 403));
    }

    res.json({
        success: true,
        data: { order }
    });
});

// @desc    Update rental order status (Admin)
// @route   PATCH /api/rental-orders/:id/status
// @access  Private/Admin
const updateRentalOrderStatus = catchAsync(async (req, res, next) => {
    const { status } = req.body;

    if (!['pending', 'confirmed', 'active', 'completed', 'cancelled'].includes(status)) {
        return next(new AppError('Invalid status value', 400));
    }

    const order = await RentalOrder.findByIdAndUpdate(
        req.params.id,
        { status },
        { new: true, runValidators: true }
    )
        .populate('user', 'firstName lastName email')
        .populate('car', 'brand model year image');

    if (!order) {
        return next(new AppError('Order not found', 404));
    }

    // Emit real-time event
    const io = req.app.get('io');
    if (io) {
        io.to('admin').emit('rentalOrder:updated', order);
        // Notify the user
        if (order.user && order.user._id) {
            io.to(`user:${order.user._id}`).emit('rentalOrder:updated', order);
        }
    }

    res.json({
        success: true,
        message: 'Order status updated successfully',
        data: { order }
    });
});

// @desc    Cancel rental order (User)
// @route   PATCH /api/rental-orders/:id/cancel
// @access  Private
const cancelRentalOrder = catchAsync(async (req, res, next) => {
    const order = await RentalOrder.findById(req.params.id);

    if (!order) {
        return next(new AppError('Order not found', 404));
    }

    // Check if user owns this order
    if (order.user.toString() !== req.user.id) {
        return next(new AppError('Not authorized to cancel this order', 403));
    }

    // Can only cancel pending or confirmed orders
    if (!['pending', 'confirmed'].includes(order.status)) {
        return next(new AppError('Cannot cancel an order that is already active, completed, or cancelled', 400));
    }

    order.status = 'cancelled';
    await order.save();

    const populatedOrder = await RentalOrder.findById(order._id)
        .populate('user', 'firstName lastName email')
        .populate('car', 'brand model year image');

    // Emit real-time event
    const io = req.app.get('io');
    if (io) {
        io.to('admin').emit('rentalOrder:updated', populatedOrder);
    }

    res.json({
        success: true,
        message: 'Order cancelled successfully',
        data: { order: populatedOrder }
    });
});

// @desc    Delete rental order (Admin)
// @route   DELETE /api/rental-orders/:id
// @access  Private/Admin
const deleteRentalOrder = catchAsync(async (req, res, next) => {
    const order = await RentalOrder.findById(req.params.id);

    if (!order) {
        return next(new AppError('Order not found', 404));
    }

    const orderId = order._id;
    const userId = order.user;

    await RentalOrder.findByIdAndDelete(req.params.id);

    // Emit real-time event
    const io = req.app.get('io');
    if (io) {
        io.to('admin').emit('rentalOrder:deleted', { _id: orderId });
        if (userId) {
            io.to(`user:${userId}`).emit('rentalOrder:deleted', { _id: orderId });
        }
    }

    res.json({
        success: true,
        message: 'Order deleted successfully',
        data: null
    });
});

module.exports = {
    // Car operations
    getAllCars,
    getCarById,
    createCar,
    updateCar,
    deleteCar,
    uploadCarImages,
    deleteCarImage,
    // Rental order operations
    createRentalOrder,
    getMyRentalOrders,
    getAllRentalOrders,
    getRentalOrder,
    updateRentalOrderStatus,
    cancelRentalOrder,
    deleteRentalOrder
};
