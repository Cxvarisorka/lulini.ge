const Ride = require('../models/ride.model');
const Driver = require('../models/driver.model');
const User = require('../models/user.model');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');

// @desc    Create a new ride request
// @route   POST /api/rides
// @access  Private
const createRide = catchAsync(async (req, res, next) => {
    const {
        pickup,
        dropoff,
        vehicleType,
        quote,
        passengerName,
        passengerPhone,
        paymentMethod,
        notes
    } = req.body;

    console.log('===== CREATE RIDE REQUEST =====');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    console.log('User:', req.user.email);

    // Validate required fields
    if (!pickup || !dropoff || !vehicleType || !passengerName) {
        console.log('Validation failed - missing fields');
        return next(new AppError('All required fields must be provided', 400));
    }

    console.log('Validation passed');

    // Create the ride
    const ride = await Ride.create({
        user: req.user.id,
        pickup,
        dropoff,
        vehicleType,
        quote,
        passengerName,
        passengerPhone,
        paymentMethod: paymentMethod || 'cash',
        notes,
        status: 'pending'
    });

    const populatedRide = await Ride.findById(ride._id)
        .populate('user', 'firstName lastName email phone');

    // Find all online drivers with matching vehicle type
    const onlineDrivers = await Driver.find({
        status: 'online',
        isActive: true,
        isApproved: true,
        'vehicle.type': vehicleType
    }).populate('user', 'firstName lastName phone');

    console.log(`Found ${onlineDrivers.length} online drivers with vehicle type ${vehicleType}`);

    // Emit socket event to all online drivers with matching vehicle type
    const io = req.app.get('io');
    if (io) {
        onlineDrivers.forEach(driver => {
            const roomName = `driver:${driver.user._id}`;
            console.log(`Emitting ride request to room: ${roomName}`);
            io.to(roomName).emit('ride:request', populatedRide);
        });
    } else {
        console.log('Socket.io instance not found!');
    }

    res.status(201).json({
        success: true,
        message: 'Ride requested successfully',
        data: { ride: populatedRide }
    });
});

// @desc    Accept a ride request (driver)
// @route   PATCH /api/rides/:id/accept
// @access  Private/Driver
const acceptRide = catchAsync(async (req, res, next) => {
    const ride = await Ride.findById(req.params.id);

    if (!ride) {
        return next(new AppError('Ride not found', 404));
    }

    // Check if ride is still pending
    if (ride.status !== 'pending') {
        return next(new AppError('This ride is no longer available', 400));
    }

    // Get driver profile
    const driver = await Driver.findOne({ user: req.user.id });
    if (!driver) {
        return next(new AppError('Driver profile not found', 404));
    }

    // Check if driver is online
    if (driver.status !== 'online') {
        return next(new AppError('Driver must be online to accept rides', 400));
    }

    // Update ride status and assign driver
    ride.status = 'accepted';
    ride.driver = driver._id;
    await ride.save();

    // Update driver status to busy
    driver.status = 'busy';
    await driver.save();

    const populatedRide = await Ride.findById(ride._id)
        .populate('user', 'firstName lastName email phone')
        .populate({
            path: 'driver',
            populate: {
                path: 'user',
                select: 'firstName lastName phone'
            }
        });

    // Emit socket events
    const io = req.app.get('io');
    if (io) {
        // Notify the user that their ride was accepted
        io.to(`user:${ride.user}`).emit('ride:accepted', populatedRide);

        // Notify all other drivers that this ride is no longer available
        const allDrivers = await Driver.find({
            status: { $in: ['online', 'busy'] },
            isActive: true,
            isApproved: true,
            _id: { $ne: driver._id }
        }).populate('user', '_id');

        allDrivers.forEach(otherDriver => {
            io.to(`driver:${otherDriver.user._id}`).emit('ride:unavailable', { rideId: ride._id });
        });
    }

    res.json({
        success: true,
        message: 'Ride accepted successfully',
        data: { ride: populatedRide }
    });
});

// @desc    Start a ride (driver)
// @route   PATCH /api/rides/:id/start
// @access  Private/Driver
const startRide = catchAsync(async (req, res, next) => {
    const ride = await Ride.findById(req.params.id);

    if (!ride) {
        return next(new AppError('Ride not found', 404));
    }

    // Get driver profile
    const driver = await Driver.findOne({ user: req.user.id });
    if (!driver) {
        return next(new AppError('Driver profile not found', 404));
    }

    // Check if this driver is assigned to this ride
    if (!ride.driver || ride.driver.toString() !== driver._id.toString()) {
        return next(new AppError('You are not assigned to this ride', 403));
    }

    // Check if ride is in accepted status
    if (ride.status !== 'accepted') {
        return next(new AppError('Ride must be in accepted status to start', 400));
    }

    // Update ride status
    ride.status = 'in_progress';
    ride.startTime = new Date();
    await ride.save();

    const populatedRide = await Ride.findById(ride._id)
        .populate('user', 'firstName lastName email phone')
        .populate({
            path: 'driver',
            populate: {
                path: 'user',
                select: 'firstName lastName phone'
            }
        });

    // Emit socket event to user
    const io = req.app.get('io');
    if (io) {
        io.to(`user:${ride.user}`).emit('ride:started', populatedRide);
    }

    res.json({
        success: true,
        message: 'Ride started successfully',
        data: { ride: populatedRide }
    });
});

// @desc    Complete a ride (driver)
// @route   PATCH /api/rides/:id/complete
// @access  Private/Driver
const completeRide = catchAsync(async (req, res, next) => {
    const { fare } = req.body;

    const ride = await Ride.findById(req.params.id);

    if (!ride) {
        return next(new AppError('Ride not found', 404));
    }

    // Get driver profile
    const driver = await Driver.findOne({ user: req.user.id });
    if (!driver) {
        return next(new AppError('Driver profile not found', 404));
    }

    // Check if this driver is assigned to this ride
    if (!ride.driver || ride.driver.toString() !== driver._id.toString()) {
        return next(new AppError('You are not assigned to this ride', 403));
    }

    // Check if ride is in progress
    if (ride.status !== 'in_progress') {
        return next(new AppError('Ride must be in progress to complete', 400));
    }

    // Update ride status
    ride.status = 'completed';
    ride.endTime = new Date();
    ride.fare = fare || ride.quote?.totalPrice || 0;
    ride.paymentStatus = 'completed';
    await ride.save();

    // Update driver stats
    driver.status = 'online';
    driver.totalTrips += 1;
    driver.totalEarnings += ride.fare;
    await driver.save();

    const populatedRide = await Ride.findById(ride._id)
        .populate('user', 'firstName lastName email phone')
        .populate({
            path: 'driver',
            populate: {
                path: 'user',
                select: 'firstName lastName phone'
            }
        });

    // Emit socket events
    const io = req.app.get('io');
    if (io) {
        // Notify the user that their ride is completed
        io.to(`user:${ride.user}`).emit('ride:completed', populatedRide);

        // Notify admin
        io.to('admin').emit('ride:completed', populatedRide);
    }

    res.json({
        success: true,
        message: 'Ride completed successfully',
        data: { ride: populatedRide }
    });
});

// @desc    Cancel a ride
// @route   PATCH /api/rides/:id/cancel
// @access  Private
const cancelRide = catchAsync(async (req, res, next) => {
    const { reason } = req.body;

    const ride = await Ride.findById(req.params.id);

    if (!ride) {
        return next(new AppError('Ride not found', 404));
    }

    // Check if user has permission to cancel
    const isUser = ride.user.toString() === req.user.id;
    const isDriver = ride.driver && await Driver.findOne({
        _id: ride.driver,
        user: req.user.id
    });
    const isAdmin = req.user.role === 'admin';

    if (!isUser && !isDriver && !isAdmin) {
        return next(new AppError('You do not have permission to cancel this ride', 403));
    }

    // Check if ride can be cancelled
    if (ride.status === 'completed') {
        return next(new AppError('Cannot cancel a completed ride', 400));
    }

    if (ride.status === 'cancelled') {
        return next(new AppError('This ride is already cancelled', 400));
    }

    // Determine who cancelled
    let cancelledBy = 'user';
    if (isDriver) cancelledBy = 'driver';
    if (isAdmin) cancelledBy = 'admin';

    // Update ride status
    ride.status = 'cancelled';
    ride.cancelledBy = cancelledBy;
    ride.cancellationReason = reason;
    await ride.save();

    // If driver was assigned, set them back to online
    if (ride.driver) {
        const driver = await Driver.findById(ride.driver);
        if (driver && driver.status === 'busy') {
            driver.status = 'online';
            await driver.save();
        }
    }

    const populatedRide = await Ride.findById(ride._id)
        .populate('user', 'firstName lastName email phone')
        .populate({
            path: 'driver',
            populate: {
                path: 'user',
                select: 'firstName lastName phone'
            }
        });

    // Emit socket events
    const io = req.app.get('io');
    if (io) {
        // Notify user
        io.to(`user:${ride.user}`).emit('ride:cancelled', populatedRide);

        // Notify driver if assigned
        if (ride.driver) {
            const driver = await Driver.findById(ride.driver).populate('user', '_id');
            if (driver) {
                io.to(`driver:${driver.user._id}`).emit('ride:cancelled', populatedRide);
            }
        }

        // Notify admin
        io.to('admin').emit('ride:cancelled', populatedRide);
    }

    res.json({
        success: true,
        message: 'Ride cancelled successfully',
        data: { ride: populatedRide }
    });
});

// @desc    Get user's rides
// @route   GET /api/rides/my
// @access  Private
const getMyRides = catchAsync(async (req, res, next) => {
    const { status } = req.query;

    const query = { user: req.user.id };
    if (status && status !== 'all') query.status = status;

    const rides = await Ride.find(query)
        .populate({
            path: 'driver',
            populate: {
                path: 'user',
                select: 'firstName lastName phone'
            }
        })
        .sort({ createdAt: -1 });

    res.json({
        success: true,
        count: rides.length,
        data: { rides }
    });
});

// @desc    Get driver's rides
// @route   GET /api/rides/driver/my
// @access  Private/Driver
const getDriverRides = catchAsync(async (req, res, next) => {
    const { status } = req.query;

    const driver = await Driver.findOne({ user: req.user.id });
    if (!driver) {
        return next(new AppError('Driver profile not found', 404));
    }

    const query = { driver: driver._id };
    if (status && status !== 'all') query.status = status;

    const rides = await Ride.find(query)
        .populate('user', 'firstName lastName email phone')
        .sort({ createdAt: -1 });

    res.json({
        success: true,
        count: rides.length,
        data: { rides }
    });
});

// @desc    Get single ride
// @route   GET /api/rides/:id
// @access  Private
const getRide = catchAsync(async (req, res, next) => {
    const ride = await Ride.findById(req.params.id)
        .populate('user', 'firstName lastName email phone')
        .populate({
            path: 'driver',
            populate: {
                path: 'user',
                select: 'firstName lastName phone'
            }
        });

    if (!ride) {
        return next(new AppError('Ride not found', 404));
    }

    // Check if user has permission to view this ride
    const isUser = ride.user._id.toString() === req.user.id;
    const isDriver = ride.driver && ride.driver.user._id.toString() === req.user.id;
    const isAdmin = req.user.role === 'admin';

    if (!isUser && !isDriver && !isAdmin) {
        return next(new AppError('You do not have permission to view this ride', 403));
    }

    res.json({
        success: true,
        data: { ride }
    });
});

// @desc    Get all rides (admin)
// @route   GET /api/rides
// @access  Private/Admin
const getAllRides = catchAsync(async (req, res, next) => {
    const { status, startDate, endDate } = req.query;

    const query = {};
    if (status && status !== 'all') query.status = status;
    if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const rides = await Ride.find(query)
        .populate('user', 'firstName lastName email phone')
        .populate({
            path: 'driver',
            populate: {
                path: 'user',
                select: 'firstName lastName phone'
            }
        })
        .sort({ createdAt: -1 });

    res.json({
        success: true,
        count: rides.length,
        data: { rides }
    });
});

module.exports = {
    createRide,
    acceptRide,
    startRide,
    completeRide,
    cancelRide,
    getMyRides,
    getDriverRides,
    getRide,
    getAllRides
};
