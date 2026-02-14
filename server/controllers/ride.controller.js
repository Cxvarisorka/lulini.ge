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

    // Set ride expiration time (1 hour from now)
    const RIDE_EXPIRATION_MINUTES = 60;
    const expiresAt = new Date(Date.now() + RIDE_EXPIRATION_MINUTES * 60 * 1000);

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
        status: 'pending',
        expiresAt
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
            const driverRoom = `driver:${driver.user._id}`;
            const userRoom = `user:${driver.user._id}`;

            // Check how many sockets are in each room
            const driverRoomSockets = io.sockets.adapter.rooms.get(driverRoom);
            const userRoomSockets = io.sockets.adapter.rooms.get(userRoom);
            const driverCount = driverRoomSockets ? driverRoomSockets.size : 0;
            const userCount = userRoomSockets ? userRoomSockets.size : 0;

            console.log(`Emitting ride:request to driver ${driver.user._id} - driver room: ${driverCount} sockets, user room: ${userCount} sockets`);

            if (driverCount === 0 && userCount === 0) {
                console.log(`WARNING: No sockets found for driver ${driver.user.firstName} ${driver.user.lastName} (${driver.user._id}) - event will be lost!`);
            }

            // Emit to BOTH rooms for redundancy (Socket.io deduplicates if socket is in both)
            io.to(driverRoom).to(userRoom).emit('ride:request', populatedRide);
        });

        // Notify admin of new ride request
        io.to('admin').emit('ride:request', populatedRide);
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

    // Check if ride has expired
    if (ride.expiresAt && new Date() > ride.expiresAt) {
        return next(new AppError('This ride request has expired', 400));
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

        // Notify admin of accepted ride
        io.to('admin').emit('ride:accepted', populatedRide);

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

// @desc    Notify customer of driver arrival
// @route   PATCH /api/rides/:id/arrive
// @access  Private/Driver
const notifyArrival = catchAsync(async (req, res, next) => {
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
        return next(new AppError('Ride must be in accepted status to notify arrival', 400));
    }

    // Update ride status and record arrival time
    // Waiting time: 1 min free + 2 min paid = 3 min total before auto-cancel
    const TOTAL_WAITING_MINUTES = 3;
    const now = new Date();

    ride.status = 'driver_arrived';
    ride.arrivalTime = now;
    ride.waitingExpiresAt = new Date(now.getTime() + TOTAL_WAITING_MINUTES * 60 * 1000);
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

    // Emit socket event to user and admin
    const io = req.app.get('io');
    if (io) {
        io.to(`user:${ride.user}`).emit('ride:arrived', populatedRide);

        // Notify admin of driver arrival
        io.to('admin').emit('ride:arrived', populatedRide);
    }

    res.json({
        success: true,
        message: 'Customer notified of arrival',
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

    // Check if ride is in accepted or driver_arrived status
    if (ride.status !== 'accepted' && ride.status !== 'driver_arrived') {
        return next(new AppError('Ride must be in accepted or driver_arrived status to start', 400));
    }

    // Calculate waiting fee if driver had arrived and waited
    const FREE_WAITING_MINUTES = 1;
    const WAITING_FEE_PER_MINUTE = 0.50; // $0.50 per minute after free waiting
    let waitingFee = 0;

    if (ride.arrivalTime) {
        const now = new Date();
        const waitingMinutes = (now.getTime() - ride.arrivalTime.getTime()) / (60 * 1000);

        // Charge for minutes after the free waiting period
        if (waitingMinutes > FREE_WAITING_MINUTES) {
            const paidMinutes = Math.min(waitingMinutes - FREE_WAITING_MINUTES, 2); // Max 2 paid minutes
            waitingFee = Math.round(paidMinutes * WAITING_FEE_PER_MINUTE * 100) / 100;
        }
    }

    // Update ride status
    ride.status = 'in_progress';
    ride.startTime = new Date();
    ride.waitingFee = waitingFee;
    ride.waitingExpiresAt = null; // Clear the expiration since ride started
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

        // Notify admin of started ride
        io.to('admin').emit('ride:started', populatedRide);
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
        // Notify the user that their ride is completed and they can review the driver
        io.to(`user:${ride.user}`).emit('ride:completed', {
            ...populatedRide.toObject(),
            canReview: true,
            reviewPrompt: 'How was your ride? Rate your driver!'
        });

        // Notify the driver with updated stats
        io.to(`driver:${driver.user}`).emit('ride:completed', {
            rideId: ride._id,
            updatedStats: {
                totalTrips: driver.totalTrips,
                totalEarnings: driver.totalEarnings,
                status: driver.status
            }
        });

        // Notify admin
        io.to('admin').emit('ride:completed', populatedRide);

        // Notify admin about driver stats update
        io.to('admin').emit('driver:updated', populatedRide.driver);
    }

    res.json({
        success: true,
        message: 'Ride completed successfully',
        data: {
            ride: populatedRide,
            canReview: true,
            reviewPrompt: 'How was your ride? Rate your driver!'
        }
    });
});

// @desc    Cancel a ride
// @route   PATCH /api/rides/:id/cancel
// @access  Private
const cancelRide = catchAsync(async (req, res, next) => {
    const { reason, note } = req.body;

    const ride = await Ride.findById(req.params.id);

    if (!ride) {
        return next(new AppError('Ride not found', 404));
    }

    // Store original status and driver assignment before update
    const wasPending = ride.status === 'pending';
    const hadNoDriver = !ride.driver;

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

    // Validate cancellation reason (required for passengers)
    if (cancelledBy === 'user' && !reason) {
        return next(new AppError('Cancellation reason is required', 400));
    }

    // Validate reason is from allowed enum values
    const validReasons = [
        'waiting_time_too_long',
        'driver_not_moving',
        'wrong_pickup_location',
        'changed_my_mind',
        'found_alternative',
        'price_too_high',
        'driver_requested_cancel',
        'passenger_not_responding',
        'passenger_not_at_pickup',
        'emergency',
        'other'
    ];

    if (reason && !validReasons.includes(reason)) {
        return next(new AppError('Invalid cancellation reason', 400));
    }

    // Update ride status
    ride.status = 'cancelled';
    ride.cancelledBy = cancelledBy;
    ride.cancellationReason = reason || null;
    ride.cancellationNote = note || null;
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

        // If ride was pending (no driver assigned yet), notify all drivers that it's unavailable
        if (wasPending && hadNoDriver) {
            console.log(`Notifying drivers that ride ${ride._id} is no longer available (cancelled by ${cancelledBy})`);
            const allDrivers = await Driver.find({
                status: { $in: ['online', 'busy'] },
                isActive: true,
                isApproved: true,
                'vehicle.type': ride.vehicleType
            }).populate('user', '_id');

            console.log(`Found ${allDrivers.length} drivers to notify`);
            allDrivers.forEach(driver => {
                console.log(`Emitting ride:unavailable to driver ${driver.user._id}`);
                io.to(`driver:${driver.user._id}`).emit('ride:unavailable', { rideId: ride._id });
            });
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

// @desc    Get available pending rides for driver
// @route   GET /api/rides/driver/available
// @access  Private/Driver
const getAvailableRides = catchAsync(async (req, res, next) => {
    console.log('===== GET AVAILABLE RIDES =====');
    console.log('User ID:', req.user.id);

    // Get driver profile to check vehicle type
    const driver = await Driver.findOne({ user: req.user.id });
    if (!driver) {
        console.log('Driver profile not found for user:', req.user.id);
        return next(new AppError('Driver profile not found', 404));
    }

    console.log('Driver found:', {
        id: driver._id,
        vehicleType: driver.vehicle?.type,
        status: driver.status
    });

    // Check if driver has vehicle info
    if (!driver.vehicle || !driver.vehicle.type) {
        console.log('Driver has no vehicle information');
        return res.json({
            success: true,
            count: 0,
            data: { rides: [] }
        });
    }

    // Find all pending rides matching driver's vehicle type that haven't expired
    const now = new Date();
    const availableRides = await Ride.find({
        status: 'pending',
        vehicleType: driver.vehicle.type,
        $or: [
            { expiresAt: { $gt: now } },  // Not expired yet
            { expiresAt: null }            // Legacy rides without expiration (will be handled by cleanup)
        ]
    })
        .populate('user', 'firstName lastName email phone')
        .sort({ createdAt: -1 });

    console.log(`Found ${availableRides.length} non-expired pending rides for vehicle type ${driver.vehicle.type}`);

    res.json({
        success: true,
        count: availableRides.length,
        data: { rides: availableRides }
    });
});

// @desc    Get all rides (admin)
// @route   GET /api/rides
// @access  Private/Admin
const getAllRides = catchAsync(async (req, res, next) => {
    console.log('===== GET ALL RIDES (ADMIN) =====');
    const { status, startDate, endDate, page = 1, limit = 10 } = req.query;

    const query = {};
    if (status && status !== 'all') query.status = status;
    if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    console.log('Query:', query);
    console.log('Pagination:', { page, limit });

    // Convert to numbers
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    // Get total count for pagination
    const totalRides = await Ride.countDocuments(query);

    const rides = await Ride.find(query)
        .populate('user', 'firstName lastName email phone')
        .populate({
            path: 'driver',
            populate: {
                path: 'user',
                select: 'firstName lastName phone'
            }
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum);

    console.log(`Found ${rides.length} rides out of ${totalRides} total`);

    res.json({
        success: true,
        count: rides.length,
        total: totalRides,
        page: pageNum,
        pages: Math.ceil(totalRides / limitNum),
        data: { rides }
    });
});

// @desc    Review driver after ride completion
// @route   POST /api/rides/:id/review
// @access  Private
const reviewDriver = catchAsync(async (req, res, next) => {
    const { rating, review } = req.body;

    // Validate rating
    if (!rating || rating < 1 || rating > 5) {
        return next(new AppError('Rating must be between 1 and 5', 400));
    }

    const ride = await Ride.findById(req.params.id);

    if (!ride) {
        return next(new AppError('Ride not found', 404));
    }

    // Check if user is the passenger of this ride
    if (ride.user.toString() !== req.user.id) {
        return next(new AppError('You can only review rides you were a passenger on', 403));
    }

    // Check if ride is completed
    if (ride.status !== 'completed') {
        return next(new AppError('You can only review completed rides', 400));
    }

    // Check if ride has already been reviewed
    if (ride.rating) {
        return next(new AppError('You have already reviewed this ride', 400));
    }

    // Check if ride has a driver assigned
    if (!ride.driver) {
        return next(new AppError('This ride has no assigned driver to review', 400));
    }

    // Update ride with review
    ride.rating = rating;
    ride.review = review || null;
    ride.reviewedAt = new Date();
    await ride.save();

    // Update driver's rating
    const driver = await Driver.findById(ride.driver);
    if (driver) {
        const newTotalReviews = driver.totalReviews + 1;
        const newRating = ((driver.rating * driver.totalReviews) + rating) / newTotalReviews;

        driver.rating = Math.round(newRating * 10) / 10; // Round to 1 decimal place
        driver.totalReviews = newTotalReviews;
        await driver.save();
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

    // Emit socket event to driver about the new review
    const io = req.app.get('io');
    if (io && driver) {
        io.to(`driver:${driver.user}`).emit('ride:reviewed', {
            rideId: ride._id,
            rating,
            review,
            updatedStats: {
                rating: driver.rating,
                totalReviews: driver.totalReviews
            }
        });

        // Notify admin about the new review
        io.to('admin').emit('ride:reviewed', populatedRide);

        // Notify admin about driver stats update
        io.to('admin').emit('driver:updated', populatedRide.driver);
    }

    res.json({
        success: true,
        message: 'Driver reviewed successfully',
        data: { ride: populatedRide }
    });
});

// @desc    Auto-expire old pending rides
// @access  Internal (called by scheduler or on server startup)
const expireOldRides = async (io) => {
    try {
        const now = new Date();

        // Find all expired pending rides
        const expiredRides = await Ride.find({
            status: 'pending',
            expiresAt: { $lte: now }
        });

        if (expiredRides.length === 0) {
            return { expired: 0 };
        }

        console.log(`Found ${expiredRides.length} expired rides to cancel`);

        // Update all expired rides to cancelled status
        await Ride.updateMany(
            {
                status: 'pending',
                expiresAt: { $lte: now }
            },
            {
                $set: {
                    status: 'cancelled',
                    cancelledBy: 'admin',
                    cancellationReason: 'other',
                    cancellationNote: 'Ride request expired'
                }
            }
        );

        // Notify users and drivers about expired rides via socket
        if (io) {
            for (const ride of expiredRides) {
                // Notify user
                io.to(`user:${ride.user}`).emit('ride:expired', { rideId: ride._id });

                // Notify drivers that ride is no longer available
                const drivers = await Driver.find({
                    status: { $in: ['online', 'busy'] },
                    isActive: true,
                    isApproved: true,
                    'vehicle.type': ride.vehicleType
                }).populate('user', '_id');

                drivers.forEach(driver => {
                    io.to(`driver:${driver.user._id}`).emit('ride:unavailable', { rideId: ride._id });
                });
            }
        }

        return { expired: expiredRides.length };
    } catch (error) {
        console.error('Error expiring old rides:', error);
        return { expired: 0, error: error.message };
    }
};

// @desc    Auto-cancel rides where driver waited too long (3 minutes)
// @access  Internal (called by scheduler)
const expireWaitingRides = async (io) => {
    try {
        const now = new Date();

        // Find all rides where driver is waiting and time has expired
        const waitingExpiredRides = await Ride.find({
            status: 'driver_arrived',
            waitingExpiresAt: { $lte: now }
        }).populate({
            path: 'driver',
            populate: {
                path: 'user',
                select: '_id'
            }
        });

        if (waitingExpiredRides.length === 0) {
            return { cancelled: 0 };
        }

        console.log(`Found ${waitingExpiredRides.length} rides with expired waiting time`);

        // Update all waiting-expired rides to cancelled status
        await Ride.updateMany(
            {
                status: 'driver_arrived',
                waitingExpiresAt: { $lte: now }
            },
            {
                $set: {
                    status: 'cancelled',
                    cancelledBy: 'admin',
                    cancellationReason: 'waiting_timeout',
                    cancellationNote: 'Passenger did not show up within 3 minutes'
                }
            }
        );

        // Set drivers back to online and notify via socket
        for (const ride of waitingExpiredRides) {
            // Set driver back to online
            if (ride.driver) {
                await Driver.findByIdAndUpdate(ride.driver._id, { status: 'online' });
            }

            if (io) {
                // Notify user that ride was cancelled due to waiting timeout
                io.to(`user:${ride.user}`).emit('ride:waitingTimeout', {
                    rideId: ride._id,
                    message: 'Ride cancelled - you did not arrive within 3 minutes'
                });

                // Notify driver that ride was cancelled
                if (ride.driver && ride.driver.user) {
                    io.to(`driver:${ride.driver.user._id}`).emit('ride:waitingTimeout', {
                        rideId: ride._id,
                        message: 'Ride cancelled - passenger did not show up'
                    });
                }

                // Notify admin
                io.to('admin').emit('ride:waitingTimeout', { rideId: ride._id });
            }
        }

        return { cancelled: waitingExpiredRides.length };
    } catch (error) {
        console.error('Error expiring waiting rides:', error);
        return { cancelled: 0, error: error.message };
    }
};

module.exports = {
    createRide,
    acceptRide,
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
    expireOldRides,
    expireWaitingRides
};
