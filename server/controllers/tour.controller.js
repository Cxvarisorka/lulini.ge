const Tour = require('../models/tour.model');
const TourOrder = require('../models/tourOrder.model');
const RentalOrder = require('../models/rentalOrder.model');
const Transfer = require('../models/transfer.model');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const { deleteImage, getPublicIdFromUrl } = require('../configs/cloudinary.config');

// ============ TOUR OPERATIONS ============

// @desc    Get all tours
// @route   GET /api/tours
// @access  Public
const getAllTours = catchAsync(async (req, res, next) => {
    const { category, location, available, featured, search } = req.query;

    const query = {};

    if (category && category !== 'all') {
        query.category = category;
    }

    if (location && location !== 'all') {
        query.location = { $regex: location, $options: 'i' };
    }

    if (available !== undefined) {
        query.available = available === 'true';
    }

    if (featured !== undefined) {
        query.featured = featured === 'true';
    }

    if (search) {
        query.$or = [
            { name: { $regex: search, $options: 'i' } },
            { description: { $regex: search, $options: 'i' } },
            { location: { $regex: search, $options: 'i' } }
        ];
    }

    const tours = await Tour.find(query).sort({ featured: -1, createdAt: -1 });

    res.json({
        success: true,
        count: tours.length,
        data: { tours }
    });
});

// @desc    Get single tour by ID
// @route   GET /api/tours/:id
// @access  Public
const getTourById = catchAsync(async (req, res, next) => {
    const tour = await Tour.findById(req.params.id);

    if (!tour) {
        return next(new AppError('Tour not found', 404));
    }

    res.json({
        success: true,
        data: { tour }
    });
});

// @desc    Create new tour (Admin)
// @route   POST /api/tours
// @access  Private/Admin
const createTour = catchAsync(async (req, res, next) => {
    const tourData = { ...req.body };

    // Handle uploaded images
    if (req.files) {
        if (req.files.image && req.files.image[0]) {
            tourData.image = req.files.image[0].path;
        }
        if (req.files.images) {
            tourData.images = req.files.images.map(file => file.path);
        }
    }

    // Parse arrays if sent as strings
    const arrayFields = ['includes', 'excludes', 'availableDays', 'languages'];
    arrayFields.forEach(field => {
        if (typeof tourData[field] === 'string') {
            tourData[field] = JSON.parse(tourData[field]);
        }
    });

    // Parse itinerary if sent as string
    if (typeof tourData.itinerary === 'string') {
        tourData.itinerary = JSON.parse(tourData.itinerary);
    }

    const tour = await Tour.create(tourData);

    // Emit real-time event
    const io = req.app.get('io');
    if (io) {
        io.to('admin').emit('tour:created', tour);
    }

    res.status(201).json({
        success: true,
        message: 'Tour created successfully',
        data: { tour }
    });
});

// @desc    Update tour (Admin)
// @route   PATCH /api/tours/:id
// @access  Private/Admin
const updateTour = catchAsync(async (req, res, next) => {
    let tour = await Tour.findById(req.params.id);

    if (!tour) {
        return next(new AppError('Tour not found', 404));
    }

    const updates = { ...req.body };

    // Handle uploaded images
    if (req.files) {
        if (req.files.image && req.files.image[0]) {
            // Delete old main image from Cloudinary
            if (tour.image) {
                const publicId = getPublicIdFromUrl(tour.image);
                if (publicId) await deleteImage(publicId);
            }
            updates.image = req.files.image[0].path;
        }
        if (req.files.images) {
            const newImages = req.files.images.map(file => file.path);
            updates.images = [...(tour.images || []), ...newImages];
        }
    }

    // Parse arrays if sent as strings
    const arrayFields = ['includes', 'excludes', 'availableDays', 'languages'];
    arrayFields.forEach(field => {
        if (typeof updates[field] === 'string') {
            updates[field] = JSON.parse(updates[field]);
        }
    });

    // Parse itinerary if sent as string
    if (typeof updates.itinerary === 'string') {
        updates.itinerary = JSON.parse(updates.itinerary);
    }

    // Handle explicit images array update
    if (req.body.images && typeof req.body.images === 'string') {
        updates.images = JSON.parse(req.body.images);
    }

    tour = await Tour.findByIdAndUpdate(
        req.params.id,
        updates,
        { new: true, runValidators: true }
    );

    // Emit real-time event
    const io = req.app.get('io');
    if (io) {
        io.to('admin').emit('tour:updated', tour);
    }

    res.json({
        success: true,
        message: 'Tour updated successfully',
        data: { tour }
    });
});

// @desc    Delete tour (Admin)
// @route   DELETE /api/tours/:id
// @access  Private/Admin
const deleteTour = catchAsync(async (req, res, next) => {
    const tour = await Tour.findById(req.params.id);

    if (!tour) {
        return next(new AppError('Tour not found', 404));
    }

    // Delete images from Cloudinary
    if (tour.image) {
        const publicId = getPublicIdFromUrl(tour.image);
        if (publicId) await deleteImage(publicId);
    }
    if (tour.images && tour.images.length > 0) {
        for (const img of tour.images) {
            const publicId = getPublicIdFromUrl(img);
            if (publicId) await deleteImage(publicId);
        }
    }

    await Tour.findByIdAndDelete(req.params.id);

    // Emit real-time event
    const io = req.app.get('io');
    if (io) {
        io.to('admin').emit('tour:deleted', { _id: req.params.id });
    }

    res.json({
        success: true,
        message: 'Tour deleted successfully',
        data: null
    });
});

// @desc    Delete tour image (Admin)
// @route   DELETE /api/tours/:id/images
// @access  Private/Admin
const deleteTourImage = catchAsync(async (req, res, next) => {
    const { imageUrl } = req.body;

    const tour = await Tour.findById(req.params.id);

    if (!tour) {
        return next(new AppError('Tour not found', 404));
    }

    // Delete from Cloudinary
    const publicId = getPublicIdFromUrl(imageUrl);
    if (publicId) {
        await deleteImage(publicId);
    }

    // Remove from tour's images array
    tour.images = tour.images.filter(img => img !== imageUrl);
    await tour.save();

    res.json({
        success: true,
        message: 'Image deleted successfully',
        data: { tour }
    });
});

// ============ TOUR ORDER OPERATIONS ============

// @desc    Create tour order
// @route   POST /api/tour-orders
// @access  Private
const createTourOrder = catchAsync(async (req, res, next) => {
    const {
        tourId,
        date,
        time,
        participants,
        name,
        email,
        phone,
        language,
        notes,
        specialRequirements,
        carRentalId,
        transferId
    } = req.body;

    // Get tour details
    const tour = await Tour.findById(tourId);
    if (!tour) {
        return next(new AppError('Tour not found', 404));
    }

    if (!tour.available) {
        return next(new AppError('Tour is not available for booking', 400));
    }

    // Validate participants
    if (participants < tour.minGroupSize || participants > tour.maxGroupSize) {
        return next(new AppError(`Group size must be between ${tour.minGroupSize} and ${tour.maxGroupSize}`, 400));
    }

    // Calculate pricing
    const pricePerPerson = tour.priceType === 'perPerson' ? tour.price : tour.price / participants;
    const totalPrice = tour.priceType === 'perPerson' ? tour.price * participants : tour.price;

    const orderData = {
        user: req.user.id,
        tour: tourId,
        tourSnapshot: {
            name: tour.name,
            duration: tour.duration,
            image: tour.image,
            price: tour.price,
            priceType: tour.priceType
        },
        date,
        time: time || '10:00',
        participants,
        name,
        email,
        phone,
        language: language || 'English',
        pricePerPerson,
        totalPrice,
        notes,
        specialRequirements
    };

    // Handle car rental if provided
    if (carRentalId) {
        const carRental = await RentalOrder.findById(carRentalId);
        if (!carRental) {
            return next(new AppError('Car rental not found', 404));
        }
        if (carRental.user.toString() !== req.user.id) {
            return next(new AppError('Not authorized to use this car rental', 403));
        }
        orderData.carRental = carRentalId;
        orderData.carRentalDetails = {
            brand: carRental.carSnapshot.brand,
            model: carRental.carSnapshot.model,
            pickupDate: carRental.startDate,
            returnDate: carRental.endDate,
            totalPrice: carRental.totalPrice
        };
    }

    // Handle transfer if provided
    if (transferId) {
        const transfer = await Transfer.findById(transferId);
        if (!transfer) {
            return next(new AppError('Transfer not found', 404));
        }
        if (transfer.user.toString() !== req.user.id) {
            return next(new AppError('Not authorized to use this transfer', 403));
        }
        orderData.transfer = transferId;
        orderData.transferDetails = {
            tripType: transfer.tripType,
            pickupAddress: transfer.pickupAddress,
            dropoffAddress: transfer.dropoffAddress,
            date: transfer.date,
            totalPrice: transfer.quote.totalPrice
        };
    }

    const order = await TourOrder.create(orderData);

    // Populate for response
    const populatedOrder = await TourOrder.findById(order._id)
        .populate('user', 'firstName lastName email')
        .populate('tour', 'name duration image price')
        .populate('carRental', 'carSnapshot startDate endDate totalPrice')
        .populate('transfer', 'pickupAddress dropoffAddress date quote');

    // Emit real-time event to admin
    const io = req.app.get('io');
    if (io) {
        io.to('admin').emit('tourOrder:created', populatedOrder);
    }

    res.status(201).json({
        success: true,
        message: 'Tour order created successfully',
        data: { order: populatedOrder }
    });
});

// @desc    Get current user's tour orders
// @route   GET /api/tour-orders/my
// @access  Private
const getMyTourOrders = catchAsync(async (req, res, next) => {
    const orders = await TourOrder.find({ user: req.user.id })
        .populate('tour', 'name duration image price')
        .populate('carRental', 'carSnapshot startDate endDate totalPrice')
        .populate('transfer', 'pickupAddress dropoffAddress date quote')
        .sort({ createdAt: -1 });

    res.json({
        success: true,
        count: orders.length,
        data: { orders }
    });
});

// @desc    Get all tour orders (Admin)
// @route   GET /api/tour-orders
// @access  Private/Admin
const getAllTourOrders = catchAsync(async (req, res, next) => {
    const { status } = req.query;

    const query = {};
    if (status && status !== 'all') {
        query.status = status;
    }

    const orders = await TourOrder.find(query)
        .populate('user', 'firstName lastName email')
        .populate('tour', 'name duration image price')
        .populate('carRental', 'carSnapshot startDate endDate totalPrice')
        .populate('transfer', 'pickupAddress dropoffAddress date quote')
        .sort({ createdAt: -1 });

    res.json({
        success: true,
        count: orders.length,
        data: { orders }
    });
});

// @desc    Get single tour order
// @route   GET /api/tour-orders/:id
// @access  Private
const getTourOrder = catchAsync(async (req, res, next) => {
    const order = await TourOrder.findById(req.params.id)
        .populate('user', 'firstName lastName email')
        .populate('tour', 'name duration image price')
        .populate('carRental', 'carSnapshot startDate endDate totalPrice')
        .populate('transfer', 'pickupAddress dropoffAddress date quote');

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

// @desc    Update tour order status (Admin)
// @route   PATCH /api/tour-orders/:id/status
// @access  Private/Admin
const updateTourOrderStatus = catchAsync(async (req, res, next) => {
    const { status } = req.body;

    if (!['pending', 'confirmed', 'completed', 'cancelled'].includes(status)) {
        return next(new AppError('Invalid status value', 400));
    }

    const order = await TourOrder.findByIdAndUpdate(
        req.params.id,
        { status },
        { new: true, runValidators: true }
    )
        .populate('user', 'firstName lastName email')
        .populate('tour', 'name duration image price')
        .populate('carRental', 'carSnapshot startDate endDate totalPrice')
        .populate('transfer', 'pickupAddress dropoffAddress date quote');

    if (!order) {
        return next(new AppError('Order not found', 404));
    }

    // Emit real-time event
    const io = req.app.get('io');
    if (io) {
        io.to('admin').emit('tourOrder:updated', order);
        // Notify the user
        if (order.user && order.user._id) {
            io.to(`user:${order.user._id}`).emit('tourOrder:updated', order);
        }
    }

    res.json({
        success: true,
        message: 'Order status updated successfully',
        data: { order }
    });
});

// @desc    Cancel tour order (User)
// @route   PATCH /api/tour-orders/:id/cancel
// @access  Private
const cancelTourOrder = catchAsync(async (req, res, next) => {
    const order = await TourOrder.findById(req.params.id);

    if (!order) {
        return next(new AppError('Order not found', 404));
    }

    // Check if user owns this order
    if (order.user.toString() !== req.user.id) {
        return next(new AppError('Not authorized to cancel this order', 403));
    }

    // Can only cancel pending or confirmed orders
    if (!['pending', 'confirmed'].includes(order.status)) {
        return next(new AppError('Cannot cancel an order that is already completed or cancelled', 400));
    }

    order.status = 'cancelled';
    await order.save();

    const populatedOrder = await TourOrder.findById(order._id)
        .populate('user', 'firstName lastName email')
        .populate('tour', 'name duration image price')
        .populate('carRental', 'carSnapshot startDate endDate totalPrice')
        .populate('transfer', 'pickupAddress dropoffAddress date quote');

    // Emit real-time event
    const io = req.app.get('io');
    if (io) {
        io.to('admin').emit('tourOrder:updated', populatedOrder);
    }

    res.json({
        success: true,
        message: 'Order cancelled successfully',
        data: { order: populatedOrder }
    });
});

// @desc    Delete tour order (Admin)
// @route   DELETE /api/tour-orders/:id
// @access  Private/Admin
const deleteTourOrder = catchAsync(async (req, res, next) => {
    const order = await TourOrder.findById(req.params.id);

    if (!order) {
        return next(new AppError('Order not found', 404));
    }

    const orderId = order._id;
    const userId = order.user;

    await TourOrder.findByIdAndDelete(req.params.id);

    // Emit real-time event
    const io = req.app.get('io');
    if (io) {
        io.to('admin').emit('tourOrder:deleted', { _id: orderId });
        if (userId) {
            io.to(`user:${userId}`).emit('tourOrder:deleted', { _id: orderId });
        }
    }

    res.json({
        success: true,
        message: 'Order deleted successfully',
        data: null
    });
});

module.exports = {
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
};
