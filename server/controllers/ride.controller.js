const Ride = require('../models/ride.model');
const Driver = require('../models/driver.model');
const User = require('../models/user.model');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const pushService = require('../services/pushNotification.service');

// ── Idempotency store (in-memory, 5-min TTL) ──
// Prevents duplicate ride creation when the client retries on flaky networks.
const idempotencyStore = new Map();
const IDEMPOTENCY_TTL = 5 * 60 * 1000;

setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of idempotencyStore) {
        if (now - entry.timestamp > IDEMPOTENCY_TTL) {
            idempotencyStore.delete(key);
        }
    }
}, 60 * 1000);

// @desc    Create a new ride request
// @route   POST /api/rides
// @access  Private
const createRide = catchAsync(async (req, res, next) => {
    // ── Idempotency: return cached response for duplicate requests ──
    const idempotencyKey = req.headers['x-idempotency-key'];
    if (idempotencyKey) {
        const cached = idempotencyStore.get(idempotencyKey);
        if (cached) {
            return res.status(cached.statusCode).json(cached.body);
        }
    }

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

    // Validate required fields
    if (!pickup || !dropoff || !vehicleType || !passengerName) {
        return next(new AppError('All required fields must be provided', 400));
    }

    // ── Server-side quote validation ──
    // Prevent fare manipulation: recalculate distance and validate price range
    if (quote && quote.totalPrice != null) {
        const price = parseFloat(quote.totalPrice);
        if (isNaN(price) || price < 0) {
            return next(new AppError('Invalid quote price', 400));
        }

        // Validate distance if provided — Haversine sanity check
        if (pickup.lat && pickup.lng && dropoff.lat && dropoff.lng) {
            const R = 6371;
            const dLat = ((dropoff.lat - pickup.lat) * Math.PI) / 180;
            const dLon = ((dropoff.lng - pickup.lng) * Math.PI) / 180;
            const a = Math.sin(dLat / 2) ** 2 +
                Math.cos((pickup.lat * Math.PI) / 180) * Math.cos((dropoff.lat * Math.PI) / 180) *
                Math.sin(dLon / 2) ** 2;
            const straightLineDist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            // Road distance is typically 1.2-1.8x straight-line; use 2.5x as generous upper bound
            const maxRoadDist = straightLineDist * 2.5;

            // Base fare range: 3 GEL base + 1-3 GEL/km depending on vehicle type
            const minFare = 3;
            const maxFare = 5 + (maxRoadDist * 4); // generous upper bound per km

            if (price < minFare) {
                return next(new AppError('Quote price is below minimum fare', 400));
            }
            if (price > maxFare && price > 100) {
                return next(new AppError('Quote price is unreasonably high for this distance', 400));
            }
        }
    }

    // ── Duplicate ride guard: one active ride per user ──
    const existingActiveRide = await Ride.findOne({
        user: req.user.id,
        status: { $in: ['pending', 'accepted', 'driver_arrived', 'in_progress'] },
    });
    if (existingActiveRide) {
        return next(new AppError('You already have an active ride', 409));
    }

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

    // Emit socket event to all online drivers with matching vehicle type
    const io = req.app.get('io');
    if (io) {
        onlineDrivers.forEach(driver => {
            const driverRoom = `driver:${driver.user._id}`;
            const userRoom = `user:${driver.user._id}`;
            // Emit to BOTH rooms for redundancy (Socket.io deduplicates if socket is in both)
            io.to(driverRoom).to(userRoom).emit('ride:request', populatedRide);
        });

        // Notify admin of new ride request
        io.to('admin').emit('ride:request', populatedRide);
    }

    // Push notification to all matching drivers
    const driverUserIds = onlineDrivers.map(d => d.user._id.toString());
    if (driverUserIds.length > 0) {
        pushService.sendToUsers(
            driverUserIds,
            'ride_request_title',
            'ride_request_body',
            { rideId: ride._id.toString(), channelId: 'ride-requests' },
            { address: pickup?.address || '' }
        ).catch(err => console.error('Push error (createRide):', err.message));
    }

    const responseBody = {
        success: true,
        message: 'Ride requested successfully',
        data: { ride: populatedRide }
    };

    // Cache response for idempotency replay
    if (idempotencyKey) {
        idempotencyStore.set(idempotencyKey, {
            statusCode: 201,
            body: responseBody,
            timestamp: Date.now(),
        });
    }

    res.status(201).json(responseBody);
});

// @desc    Accept a ride request (driver)
// @route   PATCH /api/rides/:id/accept
// @access  Private/Driver
const acceptRide = catchAsync(async (req, res, next) => {
    // Get driver profile
    const driver = await Driver.findOne({ user: req.user.id });
    if (!driver) {
        return next(new AppError('Driver profile not found', 404));
    }

    // Check if driver is online
    if (driver.status !== 'online') {
        return next(new AppError('Driver must be online to accept rides', 400));
    }

    // Atomic update: only transitions pending → accepted AND assigns this driver
    // This is the most race-critical transition (multiple drivers competing)
    const ride = await Ride.findOneAndUpdate(
        {
            _id: req.params.id,
            status: 'pending',
            $or: [
                { expiresAt: { $gt: new Date() } },
                { expiresAt: null },
            ],
        },
        {
            $set: {
                status: 'accepted',
                driver: driver._id,
            },
        },
        { new: true }
    );

    if (!ride) {
        const existingRide = await Ride.findById(req.params.id);
        if (!existingRide) return next(new AppError('Ride not found', 404));
        if (existingRide.expiresAt && new Date() > existingRide.expiresAt) {
            return next(new AppError('This ride request has expired', 400));
        }
        return next(new AppError('This ride is no longer available', 400));
    }

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

        // Broadcast ride:unavailable to ALL connected drivers via shared room.
        // This replaces the expensive Driver.find() query that scanned the full collection.
        // The accepting driver's client ignores this since they already have the ride.
        io.to('drivers:all').emit('ride:unavailable', { rideId: ride._id });
    }

    // Push notification to passenger
    const driverName = populatedRide.driver?.user
        ? `${populatedRide.driver.user.firstName || ''} ${populatedRide.driver.user.lastName || ''}`.trim()
        : '';
    pushService.sendToUser(
        ride.user.toString(),
        'ride_accepted_title',
        'ride_accepted_body',
        { rideId: ride._id.toString() },
        { driverName }
    ).catch(err => console.error('Push error (acceptRide):', err.message));

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
    // Get driver profile
    const driver = await Driver.findOne({ user: req.user.id });
    if (!driver) {
        return next(new AppError('Driver profile not found', 404));
    }

    // Atomic update: only transitions accepted → driver_arrived for the assigned driver
    // Prevents race conditions from duplicate taps / retries
    const TOTAL_WAITING_MINUTES = 3;
    const now = new Date();

    const ride = await Ride.findOneAndUpdate(
        {
            _id: req.params.id,
            status: 'accepted',
            driver: driver._id,
        },
        {
            $set: {
                status: 'driver_arrived',
                arrivalTime: now,
                waitingExpiresAt: new Date(now.getTime() + TOTAL_WAITING_MINUTES * 60 * 1000),
            },
        },
        { new: true }
    );

    if (!ride) {
        // Either ride not found, wrong status, or wrong driver
        const existingRide = await Ride.findById(req.params.id);
        if (!existingRide) return next(new AppError('Ride not found', 404));
        if (!existingRide.driver || existingRide.driver.toString() !== driver._id.toString()) {
            return next(new AppError('You are not assigned to this ride', 403));
        }
        return next(new AppError('Ride must be in accepted status to notify arrival', 400));
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

    // Emit socket event to user and admin
    const io = req.app.get('io');
    if (io) {
        io.to(`user:${ride.user}`).emit('ride:arrived', populatedRide);

        // Notify admin of driver arrival
        io.to('admin').emit('ride:arrived', populatedRide);
    }

    // Push notification to passenger
    pushService.sendToUser(
        ride.user.toString(),
        'ride_arrived_title',
        'ride_arrived_body',
        { rideId: ride._id.toString() }
    ).catch(err => console.error('Push error (notifyArrival):', err.message));

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
    // Get driver profile
    const driver = await Driver.findOne({ user: req.user.id });
    if (!driver) {
        return next(new AppError('Driver profile not found', 404));
    }

    // First read the ride to calculate waiting fee (needs arrivalTime)
    const existingRide = await Ride.findOne({
        _id: req.params.id,
        status: { $in: ['accepted', 'driver_arrived'] },
        driver: driver._id,
    });

    if (!existingRide) {
        const anyRide = await Ride.findById(req.params.id);
        if (!anyRide) return next(new AppError('Ride not found', 404));
        if (!anyRide.driver || anyRide.driver.toString() !== driver._id.toString()) {
            return next(new AppError('You are not assigned to this ride', 403));
        }
        return next(new AppError('Ride must be in accepted or driver_arrived status to start', 400));
    }

    // Calculate waiting fee if driver had arrived and waited
    const FREE_WAITING_MINUTES = 1;
    const WAITING_FEE_PER_MINUTE = 0.50;
    let waitingFee = 0;

    if (existingRide.arrivalTime) {
        const now = new Date();
        const waitingMinutes = (now.getTime() - existingRide.arrivalTime.getTime()) / (60 * 1000);
        if (waitingMinutes > FREE_WAITING_MINUTES) {
            const paidMinutes = Math.min(waitingMinutes - FREE_WAITING_MINUTES, 2);
            waitingFee = Math.round(paidMinutes * WAITING_FEE_PER_MINUTE * 100) / 100;
        }
    }

    // Atomic update: only transitions accepted/driver_arrived → in_progress
    const ride = await Ride.findOneAndUpdate(
        {
            _id: req.params.id,
            status: { $in: ['accepted', 'driver_arrived'] },
            driver: driver._id,
        },
        {
            $set: {
                status: 'in_progress',
                startTime: new Date(),
                waitingFee,
                waitingExpiresAt: null,
            },
        },
        { new: true }
    );

    if (!ride) {
        return next(new AppError('Ride transition failed — status may have changed', 409));
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

    // Emit socket event to user
    const io = req.app.get('io');
    if (io) {
        io.to(`user:${ride.user}`).emit('ride:started', populatedRide);

        // Notify admin of started ride
        io.to('admin').emit('ride:started', populatedRide);
    }

    // Push notification to passenger
    pushService.sendToUser(
        ride.user.toString(),
        'ride_started_title',
        'ride_started_body',
        { rideId: ride._id.toString() }
    ).catch(err => console.error('Push error (startRide):', err.message));

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

    // Get driver profile
    const driver = await Driver.findOne({ user: req.user.id });
    if (!driver) {
        return next(new AppError('Driver profile not found', 404));
    }

    // Pre-read the ride for fare validation (needs quote data before atomic update)
    const existingRide = await Ride.findOne({
        _id: req.params.id,
        status: 'in_progress',
        driver: driver._id,
    });

    if (!existingRide) {
        const anyRide = await Ride.findById(req.params.id);
        if (!anyRide) return next(new AppError('Ride not found', 404));
        if (!anyRide.driver || anyRide.driver.toString() !== driver._id.toString()) {
            return next(new AppError('You are not assigned to this ride', 403));
        }
        return next(new AppError('Ride must be in progress to complete', 400));
    }

    // Fare validation: driver-submitted fare must be within 15% of server quote
    if (fare !== undefined && fare !== null && existingRide.quote && existingRide.quote.totalPrice > 0) {
        const quotedPrice = existingRide.quote.totalPrice;
        const maxAllowed = quotedPrice * 1.15;
        const minAllowed = quotedPrice * 0.85;
        if (fare < minAllowed || fare > maxAllowed) {
            return next(new AppError(
                `Fare (${fare}) must be within 15% of quoted price (${quotedPrice}). Allowed: ${minAllowed.toFixed(2)} - ${maxAllowed.toFixed(2)}`,
                400
            ));
        }
    }

    const finalFare = fare || existingRide.quote?.totalPrice || 0;

    // Atomic update: only transitions in_progress → completed
    const ride = await Ride.findOneAndUpdate(
        {
            _id: req.params.id,
            status: 'in_progress',
            driver: driver._id,
        },
        {
            $set: {
                status: 'completed',
                endTime: new Date(),
                fare: finalFare,
                paymentStatus: 'completed',
            },
        },
        { new: true }
    );

    if (!ride) {
        return next(new AppError('Ride transition failed — status may have changed', 409));
    }

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

    // Push notification to passenger
    pushService.sendToUser(
        ride.user.toString(),
        'ride_completed_title',
        'ride_completed_body',
        { rideId: ride._id.toString() },
        { fare: String(finalFare) }
    ).catch(err => console.error('Push error (completeRide/passenger):', err.message));

    // Push notification to driver
    pushService.sendToUser(
        driver.user.toString(),
        'ride_completed_driver_title',
        'ride_completed_driver_body',
        { rideId: ride._id.toString() },
        { fare: String(finalFare) }
    ).catch(err => console.error('Push error (completeRide/driver):', err.message));

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
            const allDrivers = await Driver.find({
                status: { $in: ['online', 'busy'] },
                isActive: true,
                isApproved: true,
                'vehicle.type': ride.vehicleType
            }).populate('user', '_id');

            allDrivers.forEach(driver => {
                io.to(`driver:${driver.user._id}`).emit('ride:unavailable', { rideId: ride._id });
            });
        }

        // Notify admin
        io.to('admin').emit('ride:cancelled', populatedRide);
    }

    // Push notification to passenger
    pushService.sendToUser(
        ride.user.toString(),
        'ride_cancelled_title',
        'ride_cancelled_body',
        { rideId: ride._id.toString() }
    ).catch(err => console.error('Push error (cancelRide/passenger):', err.message));

    // Push notification to driver if assigned
    if (ride.driver) {
        const driverForPush = await Driver.findById(ride.driver).select('user').lean();
        if (driverForPush) {
            pushService.sendToUser(
                driverForPush.user.toString(),
                'ride_cancelled_driver_title',
                'ride_cancelled_driver_body',
                { rideId: ride._id.toString() }
            ).catch(err => console.error('Push error (cancelRide/driver):', err.message));
        }
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
    // Get driver profile to check vehicle type
    const driver = await Driver.findOne({ user: req.user.id });
    if (!driver) {
        return next(new AppError('Driver profile not found', 404));
    }

    // Check if driver has vehicle info
    if (!driver.vehicle || !driver.vehicle.type) {
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
    const { status, startDate, endDate, page = 1, limit = 10 } = req.query;

    const query = {};
    if (status && status !== 'all') query.status = status;
    if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) query.createdAt.$lte = new Date(endDate);
    }

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

        // Notify users and drivers about expired rides via socket + push
        for (const ride of expiredRides) {
            if (io) {
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

            // Push notification to passenger
            pushService.sendToUser(
                ride.user.toString(),
                'ride_expired_title',
                'ride_expired_body',
                { rideId: ride._id.toString() }
            ).catch(err => console.error('Push error (expireOldRides):', err.message));
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

            // Push to passenger
            pushService.sendToUser(
                ride.user.toString(),
                'waiting_timeout_passenger_title',
                'waiting_timeout_passenger_body',
                { rideId: ride._id.toString() }
            ).catch(err => console.error('Push error (waitingTimeout/passenger):', err.message));

            // Push to driver
            if (ride.driver && ride.driver.user) {
                pushService.sendToUser(
                    ride.driver.user._id.toString(),
                    'waiting_timeout_title',
                    'waiting_timeout_body',
                    { rideId: ride._id.toString(), channelId: 'ride-requests' }
                ).catch(err => console.error('Push error (waitingTimeout/driver):', err.message));
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
