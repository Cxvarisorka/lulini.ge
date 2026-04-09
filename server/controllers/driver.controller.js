const mongoose = require('mongoose');
const Driver = require('../models/driver.model');
const User = require('../models/user.model');
const Ride = require('../models/ride.model');
const RideOffer = require('../models/rideOffer.model');
const DriverActivity = require('../models/driverActivity.model');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const { haversineKm } = require('../utils/distance');
const pushService = require('../services/pushNotification.service');
const { pushIfOffline } = require('../utils/socketHelpers');
const analytics = require('../services/analytics.service');
const driverLocService = require('../services/driverLocation.service');
const { isEnabled } = require('../utils/featureFlags');

// Proximity thresholds (km)
const APPROACH_NOTIFY_KM = 0.5;  // 500m — notify passenger that driver is approaching

/**
 * Check driver proximity to pickup/dropoff and emit approach events.
 * Called after every location update when driver has an active ride.
 */
async function checkProximityAndNotify(io, driverLat, driverLng, ride) {
    // Approaching pickup (status: accepted)
    if (ride.status === 'accepted' && !ride.pickupApproachNotified && ride.pickup) {
        const distToPickup = haversineKm(driverLat, driverLng, ride.pickup.lat, ride.pickup.lng);
        if (distToPickup <= APPROACH_NOTIFY_KM) {
            await Ride.updateOne({ _id: ride._id }, { $set: { pickupApproachNotified: true } });
            const etaMinutes = Math.max(1, Math.round((distToPickup / 30) * 60));
            io.to(`user:${ride.user}`).emit('ride:driverApproaching', {
                rideId: ride._id,
                type: 'pickup',
                distanceKm: Math.round(distToPickup * 1000) / 1000,
                etaMinutes,
            });
            pushIfOffline(
                io, ride.user.toString(),
                'driver_approaching_pickup_title',
                'driver_approaching_pickup_body',
                { rideId: ride._id.toString() },
                { minutes: String(etaMinutes) }
            );
        }
    }

    // Approaching dropoff (status: in_progress)
    if (ride.status === 'in_progress' && !ride.dropoffApproachNotified && ride.dropoff) {
        const distToDropoff = haversineKm(driverLat, driverLng, ride.dropoff.lat, ride.dropoff.lng);
        if (distToDropoff <= APPROACH_NOTIFY_KM) {
            await Ride.updateOne({ _id: ride._id }, { $set: { dropoffApproachNotified: true } });
            const etaMinutes = Math.max(1, Math.round((distToDropoff / 30) * 60));
            io.to(`user:${ride.user}`).emit('ride:driverApproaching', {
                rideId: ride._id,
                type: 'dropoff',
                distanceKm: Math.round(distToDropoff * 1000) / 1000,
                etaMinutes,
            });
            pushIfOffline(
                io, ride.user.toString(),
                'driver_approaching_dropoff_title',
                'driver_approaching_dropoff_body',
                { rideId: ride._id.toString() },
                { minutes: String(etaMinutes) }
            );
        }
    }
}

// @desc    Create new driver
// @route   POST /api/drivers
// @access  Private/Admin
const createDriver = catchAsync(async (req, res, next) => {
    const { email, password, firstName, lastName, phone, licenseNumber, vehicle } = req.body;

    // Validate required fields
    if (!email || !password || !firstName || !lastName || !phone || !licenseNumber || !vehicle) {
        return next(new AppError('All required fields must be provided', 400));
    }

    // Check if user with this email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
        return next(new AppError('User with this email already exists', 400));
    }

    // Check if driver with this license already exists
    const existingDriver = await Driver.findOne({ licenseNumber });
    if (existingDriver) {
        return next(new AppError('Driver with this license number already exists', 400));
    }

    // Create user account for driver
    let user;
    try {
        user = await User.create({
            email,
            password,
            firstName,
            lastName,
            phone,
            role: 'driver',
            provider: 'local',
            isVerified: true
        });
    } catch (error) {
        if (error.name === 'ValidationError') {
            const errors = Object.values(error.errors).map(e => e.message).join(', ');
            return next(new AppError(`Validation error: ${errors}`, 400));
        }
        throw error;
    }

    try {
        // Create driver profile
        const driver = await Driver.create({
            user: user._id,
            phone,
            licenseNumber,
            vehicle,
            isApproved: true
        });

        const populatedDriver = await Driver.findById(driver._id).populate('user', 'firstName lastName email profileImage');

        res.status(201).json({
            success: true,
            message: 'Driver created successfully',
            data: { driver: populatedDriver }
        });
    } catch (error) {
        // Clean up orphaned user if driver creation failed
        await User.findByIdAndDelete(user._id).catch(cleanupErr =>
            console.error('Failed to clean up orphaned user:', cleanupErr.message)
        );

        if (error.name === 'ValidationError') {
            const errors = Object.values(error.errors).map(e => e.message).join(', ');
            return next(new AppError(`Validation error: ${errors}`, 400));
        }
        throw error;
    }
});

// @desc    Get all drivers
// @route   GET /api/drivers
// @access  Private/Admin
const getAllDrivers = catchAsync(async (req, res, next) => {
    const { status, isActive, isApproved } = req.query;

    const query = {};
    if (status && status !== 'all') query.status = status;
    if (isActive !== undefined) query.isActive = isActive === 'true';
    if (isApproved !== undefined) query.isApproved = isApproved === 'true';

    const drivers = await Driver.find(query)
        .populate('user', 'firstName lastName email phone profileImage')
        .sort({ createdAt: -1 });

    res.json({
        success: true,
        count: drivers.length,
        data: { drivers }
    });
});

// @desc    Get single driver
// @route   GET /api/drivers/:id
// @access  Private/Admin
const getDriver = catchAsync(async (req, res, next) => {
    const driver = await Driver.findById(req.params.id)
        .populate('user', 'firstName lastName email phone profileImage');

    if (!driver) {
        return next(new AppError('Driver not found', 404));
    }

    res.json({
        success: true,
        data: { driver }
    });
});

// @desc    Update driver
// @route   PATCH /api/drivers/:id
// @access  Private/Admin
const updateDriver = catchAsync(async (req, res, next) => {
    const { firstName, lastName, phone, licenseNumber, vehicle, isActive, isApproved } = req.body;

    const driver = await Driver.findById(req.params.id).populate('user');
    if (!driver) {
        return next(new AppError('Driver not found', 404));
    }

    // Update driver fields
    if (phone) driver.phone = phone;
    if (licenseNumber) driver.licenseNumber = licenseNumber;
    if (vehicle) driver.vehicle = vehicle;
    if (isActive !== undefined) driver.isActive = isActive;
    if (isApproved !== undefined) driver.isApproved = isApproved;

    await driver.save();

    // Update associated user fields
    if (driver.user) {
        if (firstName) driver.user.firstName = firstName;
        if (lastName) driver.user.lastName = lastName;
        if (phone) driver.user.phone = phone;
        await driver.user.save();
    }

    const updatedDriver = await Driver.findById(driver._id)
        .populate('user', 'firstName lastName email phone profileImage');

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
        io.to('admin').emit('driver:updated', updatedDriver);
    }

    res.json({
        success: true,
        message: 'Driver updated successfully',
        data: { driver: updatedDriver }
    });
});

// @desc    Delete driver
// @route   DELETE /api/drivers/:id
// @access  Private/Admin
const deleteDriver = catchAsync(async (req, res, next) => {
    const driver = await Driver.findById(req.params.id);

    if (!driver) {
        return next(new AppError('Driver not found', 404));
    }

    // Check if driver has any active rides
    const activeRides = await Ride.countDocuments({
        driver: driver._id,
        status: { $in: ['pending', 'accepted', 'in_progress'] }
    });

    if (activeRides > 0) {
        return next(new AppError('Cannot delete driver with active rides. Please complete or cancel all rides first.', 400));
    }

    // Store the user ID before deleting driver
    const userId = driver.user;

    // Delete driver first
    await Driver.findByIdAndDelete(req.params.id);

    // Delete associated user account
    if (userId) {
        await User.findByIdAndDelete(userId);
    }

    // Update all historical rides to remove driver reference (set to null)
    await Ride.updateMany(
        { driver: driver._id },
        { $set: { driver: null } }
    );

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
        io.to('admin').emit('driver:deleted', { _id: req.params.id });
    }

    res.json({
        success: true,
        message: 'Driver deleted successfully',
        data: null
    });
});

// @desc    Get driver profile (for logged in driver)
// @route   GET /api/drivers/profile
// @access  Private/Driver
const getDriverProfile = catchAsync(async (req, res, next) => {
    const driver = await Driver.findOne({ user: req.user.id })
        .populate('user', 'firstName lastName email phone profileImage');

    if (!driver) {
        return next(new AppError('Driver profile not found', 404));
    }

    res.json({
        success: true,
        data: { driver }
    });
});

// Helper: get today's date string (YYYY-MM-DD) for daily resting reset
function getTodayDateString() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// Helper: get driver's daily resting seconds, resetting if date changed
function getDailyRestingSeconds(driver) {
    const today = getTodayDateString();
    if (driver.dailyRestingDate !== today) {
        return 0;
    }
    return driver.dailyRestingSeconds || 0;
}

const MAX_DAILY_RESTING_SECONDS = 3 * 60 * 60; // 3 hours

// @desc    Update driver status (online/offline/busy/resting)
// @route   PATCH /api/drivers/status
// @access  Private/Driver
const updateDriverStatus = catchAsync(async (req, res, next) => {
    const { status } = req.body;

    if (!['online', 'offline', 'busy', 'resting'].includes(status)) {
        return next(new AppError('Invalid status', 400));
    }

    const driver = await Driver.findOne({ user: req.user.id });
    if (!driver) {
        return next(new AppError('Driver profile not found', 404));
    }

    // Prevent going offline/resting while driver has active rides
    if (status === 'offline' || status === 'resting') {
        const activeRide = await Ride.findOne({
            driver: driver._id,
            status: { $in: ['accepted', 'driver_arrived', 'in_progress'] }
        });
        if (activeRide) {
            return next(new AppError(`Cannot go ${status} while you have an active ride`, 400));
        }
    }

    // Enforce 3-hour daily resting limit
    if (status === 'resting') {
        const usedSeconds = getDailyRestingSeconds(driver);
        if (usedSeconds >= MAX_DAILY_RESTING_SECONDS) {
            return next(new AppError('Daily resting limit reached (3 hours maximum)', 400));
        }
    }

    const previousStatus = driver.status;

    // Finalize previous resting session: accumulate elapsed rest time
    if (previousStatus === 'resting' && status !== 'resting' && driver.restingStartedAt) {
        const elapsedSeconds = Math.floor((Date.now() - driver.restingStartedAt.getTime()) / 1000);
        const today = getTodayDateString();
        if (driver.dailyRestingDate === today) {
            driver.dailyRestingSeconds = (driver.dailyRestingSeconds || 0) + elapsedSeconds;
        } else {
            // New day — start fresh with only this session's time
            driver.dailyRestingDate = today;
            driver.dailyRestingSeconds = elapsedSeconds;
        }
        driver.restingStartedAt = null;

        DriverActivity.create({ driver: driver._id, type: 'rest_end' }).catch(err =>
            console.error('Failed to log driver rest_end activity:', err.message)
        );
    }

    // Start new resting session
    if (status === 'resting') {
        driver.restingStartedAt = new Date();
        const today = getTodayDateString();
        if (driver.dailyRestingDate !== today) {
            driver.dailyRestingDate = today;
            driver.dailyRestingSeconds = 0;
        }

        DriverActivity.create({ driver: driver._id, type: 'resting' }).catch(err =>
            console.error('Failed to log driver resting activity:', err.message)
        );
    }

    driver.status = status;
    await driver.save();

    // Log activity for online/offline transitions
    if (status === 'online' && previousStatus === 'offline') {
        DriverActivity.create({ driver: driver._id, type: 'online' }).catch(err =>
            console.error('Failed to log driver activity:', err.message)
        );
        analytics.trackEvent(req.user.id, analytics.EVENTS.DRIVER_WENT_ONLINE, { driverId: driver._id.toString() });
    } else if (status === 'offline' && previousStatus !== 'offline') {
        DriverActivity.create({ driver: driver._id, type: 'offline' }).catch(err =>
            console.error('Failed to log driver activity:', err.message)
        );
        analytics.trackEvent(req.user.id, analytics.EVENTS.DRIVER_WENT_OFFLINE, { driverId: driver._id.toString() });
    }

    // Emit socket event and manage driver room membership
    const io = req.app.get('io');
    if (io) {
        // Only notify admin — not every connected socket in the system
        io.to('admin').emit('driver:statusChanged', {
            driverId: driver._id,
            status: status
        });

        const userRoom = `user:${req.user.id}`;
        const driverRoom = `driver:${req.user.id}`;

        const typeRoom = driver.vehicle?.type ? `drivers:${driver.vehicle.type}` : null;
        if (status === 'online') {
            // Ensure only driver-app sockets join driver broadcast rooms
            const rooms = [driverRoom, 'drivers:all'];
            if (typeRoom) rooms.push(typeRoom);
            try {
                const sockets = await io.in(userRoom).fetchSockets();
                for (const s of sockets) {
                    if (s.appType === 'driver') {
                        s.join(rooms);
                    }
                }
            } catch { /* ignore fetch errors */ }
        } else if (status === 'offline' || status === 'resting') {
            // Remove from broadcast rooms when going offline or resting
            const leaveRooms = ['drivers:all'];
            if (typeRoom) leaveRooms.push(typeRoom);
            io.in(userRoom).socketsLeave(leaveRooms);
        }
    }

    res.json({
        success: true,
        message: 'Status updated successfully',
        data: { driver }
    });
});

// @desc    Update driver location
// @route   PATCH /api/drivers/location
// @access  Private/Driver
const updateDriverLocation = catchAsync(async (req, res, next) => {
    const { latitude, longitude, heading, heartbeat } = req.body;

    if (latitude == null || longitude == null) {
        return next(new AppError('Latitude and longitude are required', 400));
    }

    // Validate coordinate ranges
    if (typeof latitude !== 'number' || typeof longitude !== 'number' ||
        latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 ||
        !isFinite(latitude) || !isFinite(longitude)) {
        return next(new AppError('Invalid coordinates: latitude must be -90..90, longitude -180..180', 400));
    }

    // Reuse driver from isDriver middleware (eliminates 1 DB query per request)
    const driver = req.driver;

    // Speed/distance validation against previous location
    if (driver.location && driver.location.coordinates &&
        driver.location.coordinates[0] !== 0 && driver.location.coordinates[1] !== 0) {
        const [prevLng, prevLat] = driver.location.coordinates;
        const distKm = haversineKm(prevLat, prevLng, latitude, longitude);
        const timeDeltaSec = (Date.now() - new Date(driver.updatedAt).getTime()) / 1000;

        // Only validate with reasonable time delta (> 2s) and non-trivial movement
        if (timeDeltaSec > 2 && distKm > 0.01) {
            const speedKmh = (distKm / timeDeltaSec) * 3600;
            if (speedKmh > 200) {
                return next(new AppError('Location update rejected: implausible speed detected', 400));
            }
        }
    }

    // ── Redis GEO dual-write (Phase 3) ──
    // When enabled, write to Redis first (sub-ms), then MongoDB.
    // Redis becomes the primary store; MongoDB flush happens every 30s in background.
    const redisEnabled = isEnabled('REDIS_DRIVER_LOCATIONS');
    if (redisEnabled) {
        driverLocService.updateDriverLocation(driver._id.toString(), {
            lat: latitude,
            lng: longitude,
            heading: heading ?? 0,
            speed: 0,
            vehicleType: driver.vehicle?.type,
        }).catch(err => console.error('Redis driver location write failed:', err.message));
    }

    // Parallelize: update location + check for active ride simultaneously
    const [, activeRide] = await Promise.all([
        Driver.updateOne(
            { _id: driver._id },
            { $set: { location: { type: 'Point', coordinates: [longitude, latitude] } } }
        ),
        Ride.findOne({
            driver: driver._id,
            status: { $in: ['accepted', 'driver_arrived', 'in_progress'] }
        }).select('_id user status pickup dropoff pickupApproachNotified dropoffApproachNotified').lean()
    ]);

    const io = req.app.get('io');
    if (io) {
        // Build location payload — include heading when available for car rotation
        const locationPayload = { latitude, longitude, ts: Date.now() };
        if (heading != null && isFinite(heading)) {
            locationPayload.heading = heading;
        }
        if (heartbeat) {
            locationPayload.type = 'heartbeat';
        }

        // Emit to admin room for real-time tracking
        io.to('admin').emit('driver:locationUpdate', {
            driverId: driver._id,
            location: locationPayload
        });

        if (activeRide) {
            io.to(`user:${activeRide.user}`).emit('driver:locationUpdate', {
                rideId: activeRide._id,
                location: locationPayload
            });

            // Only check proximity for real movement, not heartbeats
            if (!heartbeat) {
                checkProximityAndNotify(io, latitude, longitude, activeRide).catch(
                    err => console.error('Proximity check error:', err.message)
                );
            }
        }
    }

    res.json({
        success: true,
        message: 'Location updated successfully'
    });
});

// @desc    Get driver stats
// @route   GET /api/drivers/stats
// @access  Private/Driver
const getDriverStats = catchAsync(async (req, res, next) => {
    const driver = await Driver.findOne({ user: req.user.id })
        .select('_id totalEarnings totalTrips rating totalReviews status restingStartedAt dailyRestingSeconds dailyRestingDate').lean();
    if (!driver) {
        return next(new AppError('Driver profile not found', 404));
    }

    const now = new Date();
    const today = new Date(now); today.setHours(0, 0, 0, 0);
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const thisWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thisMonth = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Single aggregation replaces 5 separate find() queries
    const [statsResult, pendingRides] = await Promise.all([
        Ride.aggregate([
            { $match: { driver: driver._id, status: 'completed', endTime: { $gte: thisMonth } } },
            { $project: { endTime: 1, fare: 1 } },
            {
                $group: {
                    _id: null,
                    todayEarnings: { $sum: { $cond: [{ $gte: ['$endTime', today] }, '$fare', 0] } },
                    todayTrips: { $sum: { $cond: [{ $gte: ['$endTime', today] }, 1, 0] } },
                    last24hEarnings: { $sum: { $cond: [{ $gte: ['$endTime', last24Hours] }, '$fare', 0] } },
                    last24hTrips: { $sum: { $cond: [{ $gte: ['$endTime', last24Hours] }, 1, 0] } },
                    weekEarnings: { $sum: { $cond: [{ $gte: ['$endTime', thisWeek] }, '$fare', 0] } },
                    weekTrips: { $sum: { $cond: [{ $gte: ['$endTime', thisWeek] }, 1, 0] } },
                    monthEarnings: { $sum: '$fare' },
                    monthTrips: { $sum: 1 },
                }
            }
        ]).read('secondaryPreferred'),
        Ride.countDocuments({ driver: driver._id, status: { $in: ['accepted', 'in_progress'] } })
    ]);

    const s = statsResult[0] || {};

    // Calculate daily resting time (accumulated + current session if resting)
    const todayDateStr = getTodayDateString();
    let dailyRestingSeconds = (driver.dailyRestingDate === todayDateStr) ? (driver.dailyRestingSeconds || 0) : 0;
    if (driver.status === 'resting' && driver.restingStartedAt) {
        dailyRestingSeconds += Math.floor((Date.now() - new Date(driver.restingStartedAt).getTime()) / 1000);
    }
    const dailyRestingRemainingSeconds = Math.max(0, MAX_DAILY_RESTING_SECONDS - dailyRestingSeconds);

    res.json({
        success: true,
        data: {
            stats: {
                today: { earnings: s.todayEarnings || 0, trips: s.todayTrips || 0 },
                last24Hours: { earnings: s.last24hEarnings || 0, trips: s.last24hTrips || 0 },
                week: { earnings: s.weekEarnings || 0, trips: s.weekTrips || 0 },
                month: { earnings: s.monthEarnings || 0, trips: s.monthTrips || 0 },
                total: { earnings: driver.totalEarnings, trips: driver.totalTrips },
                rating: driver.rating,
                totalReviews: driver.totalReviews || 0,
                pendingRides,
                status: driver.status,
                resting: {
                    dailyUsedSeconds: dailyRestingSeconds,
                    dailyRemainingSeconds: dailyRestingRemainingSeconds,
                    maxDailySeconds: MAX_DAILY_RESTING_SECONDS,
                    isResting: driver.status === 'resting'
                }
            }
        }
    });
});

// @desc    Get driver earnings
// @route   GET /api/drivers/earnings
// @access  Private/Driver
const getDriverEarnings = catchAsync(async (req, res, next) => {
    const { period = 'today' } = req.query;

    const driver = await Driver.findOne({ user: req.user.id }).select('_id').lean();
    if (!driver) {
        return next(new AppError('Driver profile not found', 404));
    }

    let startDate = new Date();
    if (period === 'today') {
        startDate.setHours(0, 0, 0, 0);
    } else if (period === 'week') {
        startDate.setDate(startDate.getDate() - 7);
    } else if (period === 'month') {
        startDate.setMonth(startDate.getMonth() - 1);
    }

    // Aggregate in DB instead of fetching all documents to JS
    const result = await Ride.aggregate([
        { $match: { driver: driver._id, status: 'completed', endTime: { $gte: startDate } } },
        { $group: { _id: null, total: { $sum: '$fare' }, trips: { $sum: 1 } } }
    ]);

    const s = result[0] || { total: 0, trips: 0 };

    res.json({
        success: true,
        data: {
            earnings: {
                total: s.total,
                trips: s.trips,
                average: s.trips > 0 ? s.total / s.trips : 0
            }
        }
    });
});

// @desc    Get driver reviews
// @route   GET /api/drivers/:id/reviews
// @access  Private/Admin or Driver (own reviews)
const getDriverReviews = catchAsync(async (req, res, next) => {
    const driverId = req.params.id;

    // Check if user is admin or the driver themselves
    const driver = await Driver.findById(driverId);
    if (!driver) {
        return next(new AppError('Driver not found', 404));
    }

    if (req.user.role !== 'admin' && driver.user.toString() !== req.user.id) {
        return next(new AppError('You do not have permission to view these reviews', 403));
    }

    const reviews = await Ride.find({
        driver: driverId,
        status: 'completed',
        rating: { $exists: true, $ne: null }
    })
        .populate('user', 'firstName lastName')
        .select('rating review reviewedAt pickup dropoff fare createdAt')
        .sort({ reviewedAt: -1 });

    // Calculate review statistics
    const totalReviews = reviews.length;
    const averageRating = totalReviews > 0
        ? reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews
        : 0;

    const ratingDistribution = {
        5: reviews.filter(r => r.rating === 5).length,
        4: reviews.filter(r => r.rating === 4).length,
        3: reviews.filter(r => r.rating === 3).length,
        2: reviews.filter(r => r.rating === 2).length,
        1: reviews.filter(r => r.rating === 1).length,
    };

    res.json({
        success: true,
        data: {
            reviews,
            statistics: {
                totalReviews,
                averageRating: Math.round(averageRating * 10) / 10,
                ratingDistribution
            }
        }
    });
});

// @desc    Get all drivers statistics (Admin)
// @route   GET /api/drivers/admin/statistics
// @access  Private/Admin
const getAllDriverStatistics = catchAsync(async (req, res, next) => {
    const drivers = await Driver.find({ isActive: true })
        .populate('user', 'firstName lastName email profileImage')
        .sort({ createdAt: -1 })
        .lean();

    if (drivers.length === 0) {
        return res.json({ success: true, count: 0, data: { statistics: [] } });
    }

    const driverIds = drivers.map(d => d._id);
    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Ride stats and offer stats in parallel
    const [rideStats, offerStats] = await Promise.all([
        Ride.aggregate([
            { $match: { driver: { $in: driverIds } } },
            { $project: { driver: 1, status: 1, endTime: 1, fare: 1, cancelledBy: 1 } },
            {
                $group: {
                    _id: '$driver',
                    totalTrips: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
                    cancelledTrips: {
                        $sum: { $cond: [{ $and: [{ $eq: ['$status', 'cancelled'] }, { $eq: ['$cancelledBy', 'driver'] }] }, 1, 0] }
                    },
                    earnings24h: {
                        $sum: { $cond: [{ $and: [{ $eq: ['$status', 'completed'] }, { $gte: ['$endTime', last24Hours] }] }, '$fare', 0] }
                    },
                    trips24h: {
                        $sum: { $cond: [{ $and: [{ $eq: ['$status', 'completed'] }, { $gte: ['$endTime', last24Hours] }] }, 1, 0] }
                    },
                    earnings7d: {
                        $sum: { $cond: [{ $and: [{ $eq: ['$status', 'completed'] }, { $gte: ['$endTime', last7Days] }] }, '$fare', 0] }
                    },
                    trips7d: {
                        $sum: { $cond: [{ $and: [{ $eq: ['$status', 'completed'] }, { $gte: ['$endTime', last7Days] }] }, 1, 0] }
                    },
                    earnings30d: {
                        $sum: { $cond: [{ $and: [{ $eq: ['$status', 'completed'] }, { $gte: ['$endTime', last30Days] }] }, '$fare', 0] }
                    },
                    trips30d: {
                        $sum: { $cond: [{ $and: [{ $eq: ['$status', 'completed'] }, { $gte: ['$endTime', last30Days] }] }, 1, 0] }
                    },
                }
            }
        ]).read('secondaryPreferred'),
        // Offer-level stats per driver (last 30 days)
        RideOffer.aggregate([
            { $match: { driver: { $in: driverIds }, offeredAt: { $gte: last30Days } } },
            {
                $group: {
                    _id: '$driver',
                    offered: { $sum: 1 },
                    accepted: { $sum: { $cond: [{ $eq: ['$status', 'accepted'] }, 1, 0] } },
                    declined: { $sum: { $cond: [{ $eq: ['$status', 'declined'] }, 1, 0] } },
                    timedOut: { $sum: { $cond: [{ $eq: ['$status', 'timeout'] }, 1, 0] } },
                    superseded: { $sum: { $cond: [{ $eq: ['$status', 'superseded'] }, 1, 0] } },
                    avgResponseMs: { $avg: '$responseTimeMs' }
                }
            }
        ]).read('secondaryPreferred')
    ]);

    // Index by driver ID for O(1) lookup
    const statsMap = new Map(rideStats.map(s => [s._id.toString(), s]));
    const offerMap = new Map(offerStats.map(s => [s._id.toString(), s]));

    const statistics = drivers
        .filter(d => d.user)
        .map(driver => {
            const s = statsMap.get(driver._id.toString()) || {};
            const o = offerMap.get(driver._id.toString()) || {};
            const offered = o.offered || 0;
            const accepted = o.accepted || 0;
            return {
                driverId: driver._id,
                name: `${driver.user.firstName} ${driver.user.lastName}`,
                email: driver.user.email,
                phone: driver.phone,
                vehicle: driver.vehicle,
                status: driver.status,
                rating: driver.rating || 0,
                totalReviews: driver.totalReviews || 0,
                statistics: {
                    totalTrips: s.totalTrips || 0,
                    cancelledTrips: s.cancelledTrips || 0,
                    totalEarnings: driver.totalEarnings || 0,
                    earnings: {
                        last24Hours: s.earnings24h || 0,
                        last7Days: s.earnings7d || 0,
                        last30Days: s.earnings30d || 0,
                    },
                    trips: {
                        last24Hours: s.trips24h || 0,
                        last7Days: s.trips7d || 0,
                        last30Days: s.trips30d || 0,
                    },
                    // Offer-level metrics (last 30 days)
                    offers: {
                        offered,
                        accepted,
                        declined: o.declined || 0,
                        timedOut: o.timedOut || 0,
                        superseded: o.superseded || 0,
                        acceptanceRate: offered > 0 ? Math.round((accepted / offered) * 1000) / 10 : null,
                        avgResponseMs: o.avgResponseMs ? Math.round(o.avgResponseMs) : null
                    }
                }
            };
        });

    res.json({
        success: true,
        count: statistics.length,
        data: { statistics }
    });
});

// @desc    Get nearby online drivers (for passengers to see on map)
// @route   GET /api/drivers/nearby
// @access  Private
const getNearbyDrivers = catchAsync(async (req, res, next) => {
    const { lat, lng, vehicleType } = req.query;

    if (!lat || !lng) {
        return next(new AppError('Latitude and longitude are required', 400));
    }

    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);

    // ── Phase 3: Try Redis GEO first when enabled ──
    if (isEnabled('REDIS_NEARBY_QUERY')) {
        const vehicleTypes = vehicleType ? [vehicleType] : [];
        const redisResults = await driverLocService.findNearbyDrivers(
            parsedLat, parsedLng, 10, vehicleTypes, 50
        );

        if (redisResults !== null) {
            const locations = redisResults.map(r => ({
                lat: r.coordinates?.latitude ?? parsedLat,
                lng: r.coordinates?.longitude ?? parsedLng,
            }));

            return res.json({
                success: true,
                count: locations.length,
                data: { drivers: locations }
            });
        }
        // Redis returned null (unavailable) — fall through to MongoDB
    }

    // ── MongoDB fallback (existing behavior) ──
    const query = {
        status: 'online',
        isActive: true,
        isApproved: true,
        location: {
            $near: {
                $geometry: {
                    type: 'Point',
                    coordinates: [parsedLng, parsedLat]
                },
                $maxDistance: 10000 // 10km radius
            }
        }
    };

    if (vehicleType) {
        query['vehicle.type'] = vehicleType;
    }

    const drivers = await Driver.find(query).select('location').lean().read('secondaryPreferred');

    const locations = drivers
        .filter(d => d.location && d.location.coordinates)
        .map(d => ({
            lat: d.location.coordinates[1],
            lng: d.location.coordinates[0]
        }));

    res.json({
        success: true,
        count: locations.length,
        data: { drivers: locations }
    });
});

// @desc    Batch update driver location (from background GPS)
// @route   POST /api/drivers/location/batch
// @access  Private/Driver
const batchUpdateDriverLocation = catchAsync(async (req, res, next) => {
    const { locations } = req.body;

    if (!Array.isArray(locations) || locations.length === 0) {
        return next(new AppError('locations array is required', 400));
    }

    if (locations.length > 50) {
        return next(new AppError('Maximum 50 locations per batch', 400));
    }

    // Reuse driver from isDriver middleware (eliminates 1 DB query per request)
    const driver = req.driver;

    // Sort by timestamp ascending so we process in chronological order
    const sorted = [...locations].sort((a, b) => a.timestamp - b.timestamp);

    // Validate and find the latest valid point
    let lastValid = null;
    if (driver.location && driver.location.coordinates &&
        driver.location.coordinates[0] !== 0 && driver.location.coordinates[1] !== 0) {
        lastValid = {
            lat: driver.location.coordinates[1],
            lng: driver.location.coordinates[0],
            time: new Date(driver.updatedAt).getTime(),
        };
    }

    let accepted = null; // will hold the latest accepted point

    for (const loc of sorted) {
        const { latitude, longitude, timestamp } = loc;

        // Basic coordinate validation
        if (latitude == null || longitude == null ||
            latitude < -90 || latitude > 90 ||
            longitude < -180 || longitude > 180) {
            continue;
        }

        // Speed validation against last known position
        if (lastValid) {
            const timeDeltaSec = (timestamp - lastValid.time) / 1000;
            if (timeDeltaSec > 2) {
                const distKm = haversineKm(lastValid.lat, lastValid.lng, latitude, longitude);
                const speedKmh = (distKm / timeDeltaSec) * 3600;
                if (speedKmh > 200) {
                    continue; // skip implausible
                }
            }
        }

        lastValid = { lat: latitude, lng: longitude, time: timestamp };
        accepted = loc;
    }

    if (!accepted) {
        return res.json({ success: true, message: 'No valid locations in batch' });
    }

    // ── Redis GEO dual-write (Phase 3) ──
    if (isEnabled('REDIS_DRIVER_LOCATIONS')) {
        driverLocService.updateDriverLocation(driver._id.toString(), {
            lat: accepted.latitude,
            lng: accepted.longitude,
            heading: accepted.heading ?? 0,
            speed: accepted.speed ?? 0,
            vehicleType: driver.vehicle?.type,
        }).catch(err => console.error('Redis batch location write failed:', err.message));
    }

    // Parallelize: update location + check for active ride simultaneously
    const [, activeRide] = await Promise.all([
        Driver.updateOne(
            { _id: driver._id },
            { $set: { location: { type: 'Point', coordinates: [accepted.longitude, accepted.latitude] } } }
        ),
        Ride.findOne({
            driver: driver._id,
            status: { $in: ['accepted', 'driver_arrived', 'in_progress'] },
        }).select('_id user status pickup dropoff pickupApproachNotified dropoffApproachNotified').lean()
    ]);

    const io = req.app.get('io');
    if (io) {
        // Build location payload — include heading when available for car rotation
        const batchLocationPayload = { latitude: accepted.latitude, longitude: accepted.longitude };
        if (accepted.heading != null && isFinite(accepted.heading)) {
            batchLocationPayload.heading = accepted.heading;
        }

        // Emit to admin room for real-time tracking
        io.to('admin').emit('driver:locationUpdate', {
            driverId: driver._id,
            location: batchLocationPayload,
        });

        if (activeRide) {
            io.to(`user:${activeRide.user}`).emit('driver:locationUpdate', {
                rideId: activeRide._id,
                location: batchLocationPayload,
            });

            // Check proximity and auto-notify passenger
            checkProximityAndNotify(io, accepted.latitude, accepted.longitude, activeRide).catch(
                err => console.error('Proximity check error:', err.message)
            );
        }
    }

    res.json({ success: true, message: 'Batch location updated', accepted: 1 });
});

// @desc    Get driver 7-day activity (active hours, rides accepted/cancelled per day)
// @route   GET /api/drivers/:id/activity
// @access  Private/Admin
const getDriverActivity = catchAsync(async (req, res, next) => {
    const driverId = req.params.id;

    const driver = await Driver.findById(driverId).populate('user', 'firstName lastName email profileImage').lean();
    if (!driver) {
        return next(new AppError('Driver not found', 404));
    }

    const now = new Date();

    // Compute server timezone for MongoDB $dateToString
    const tzOffsetMin = -now.getTimezoneOffset(); // positive = east of UTC
    const tzSign = tzOffsetMin >= 0 ? '+' : '-';
    const tzH = String(Math.floor(Math.abs(tzOffsetMin) / 60)).padStart(2, '0');
    const tzM = String(Math.abs(tzOffsetMin) % 60).padStart(2, '0');
    const timezone = `${tzSign}${tzH}:${tzM}`;

    // Helper: format local date as YYYY-MM-DD
    const fmtDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    // Build 7 days: today + 6 previous days
    const days = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        d.setHours(0, 0, 0, 0);
        const end = new Date(d);
        end.setHours(23, 59, 59, 999);
        days.push({ start: d, end });
    }

    const sevenDaysAgo = days[0].start;

    // Fetch activity logs, rides, and offer stats in parallel
    const [activityLogs, rideStats, offerStats] = await Promise.all([
        DriverActivity.find({
            driver: driverId,
            timestamp: { $gte: sevenDaysAgo }
        }).sort({ timestamp: 1 }).lean(),
        Ride.aggregate([
            {
                $match: {
                    driver: new mongoose.Types.ObjectId(driverId),
                    createdAt: { $gte: sevenDaysAgo }
                }
            },
            {
                $group: {
                    _id: {
                        $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone }
                    },
                    completed: {
                        $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
                    },
                    cancelled: {
                        $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] }
                    },
                    cancelledByDriver: {
                        $sum: {
                            $cond: {
                                if: { $and: [{ $eq: ['$status', 'cancelled'] }, { $eq: ['$cancelledBy', 'driver'] }] },
                                then: 1,
                                else: 0
                            }
                        }
                    },
                    cancelledByUser: {
                        $sum: {
                            $cond: {
                                if: { $and: [{ $eq: ['$status', 'cancelled'] }, { $eq: ['$cancelledBy', 'user'] }] },
                                then: 1,
                                else: 0
                            }
                        }
                    },
                    cancelledByAdmin: {
                        $sum: {
                            $cond: {
                                if: { $and: [{ $eq: ['$status', 'cancelled'] }, { $in: ['$cancelledBy', ['admin', 'system']] }] },
                                then: 1,
                                else: 0
                            }
                        }
                    },
                    totalEarnings: {
                        $sum: { $cond: [{ $eq: ['$status', 'completed'] }, '$fare', 0] }
                    }
                }
            }
        ]),
        // Offer-level stats: how many offers this driver received/accepted/declined/ignored
        RideOffer.aggregate([
            {
                $match: {
                    driver: new mongoose.Types.ObjectId(driverId),
                    offeredAt: { $gte: sevenDaysAgo }
                }
            },
            {
                $group: {
                    _id: {
                        $dateToString: { format: '%Y-%m-%d', date: '$offeredAt', timezone }
                    },
                    offered: { $sum: 1 },
                    accepted: {
                        $sum: { $cond: [{ $eq: ['$status', 'accepted'] }, 1, 0] }
                    },
                    declined: {
                        $sum: { $cond: [{ $eq: ['$status', 'declined'] }, 1, 0] }
                    },
                    timedOut: {
                        $sum: { $cond: [{ $eq: ['$status', 'timeout'] }, 1, 0] }
                    },
                    superseded: {
                        $sum: { $cond: [{ $eq: ['$status', 'superseded'] }, 1, 0] }
                    },
                    avgResponseMs: { $avg: '$responseTimeMs' }
                }
            }
        ])
    ]);

    // Index ride stats and offer stats by date string
    const rideStatsMap = new Map(rideStats.map(s => [s._id, s]));
    const offerStatsMap = new Map(offerStats.map(s => [s._id, s]));

    // Compute active hours per day from activity logs
    // Strategy: for each day, find online/offline transitions and sum active time
    const calendar = days.map(({ start, end }) => {
        const dateStr = fmtDate(start);
        const dayLabel = start.toLocaleDateString('en-US', { weekday: 'short' });

        // Get activity logs for this day
        const dayLogs = activityLogs.filter(
            log => log.timestamp >= start && log.timestamp <= end
        );

        // Determine if driver was online at the start of this day
        // by finding the last log before this day's start
        let wasOnline = false;
        for (let i = activityLogs.length - 1; i >= 0; i--) {
            if (activityLogs[i].timestamp < start) {
                wasOnline = activityLogs[i].type === 'online';
                break;
            }
        }

        let activeMs = 0;
        let currentOnline = wasOnline;
        let lastTime = start;

        for (const log of dayLogs) {
            if (currentOnline) {
                activeMs += log.timestamp.getTime() - lastTime.getTime();
            }
            currentOnline = log.type === 'online';
            lastTime = log.timestamp;
        }

        // If still online at end of day (or now if today)
        if (currentOnline) {
            const cutoff = end < now ? end : now;
            activeMs += cutoff.getTime() - lastTime.getTime();
        }

        const activeHours = Math.round((activeMs / (1000 * 60 * 60)) * 10) / 10;
        const totalHoursInDay = end < now ? 24 : Math.round(((now.getTime() - start.getTime()) / (1000 * 60 * 60)) * 10) / 10;
        const offlineHours = Math.round(Math.max(0, totalHoursInDay - activeHours) * 10) / 10;

        const rs = rideStatsMap.get(dateStr) || {};
        const os = offerStatsMap.get(dateStr) || {};

        return {
            date: dateStr,
            dayLabel,
            activeHours,
            offlineHours,
            // Offer-level metrics (accurate acceptance/rejection tracking)
            offered: os.offered || 0,
            accepted: os.accepted || 0,
            declined: os.declined || 0,
            timedOut: os.timedOut || 0,
            superseded: os.superseded || 0,
            avgResponseMs: os.avgResponseMs ? Math.round(os.avgResponseMs) : null,
            // Ride-level metrics (post-acceptance outcomes)
            completed: rs.completed || 0,
            cancelled: rs.cancelled || 0,
            cancelledByDriver: rs.cancelledByDriver || 0,
            cancelledByUser: rs.cancelledByUser || 0,
            cancelledByAdmin: rs.cancelledByAdmin || 0,
            earnings: rs.totalEarnings || 0
        };
    });

    // Totals
    const totals = calendar.reduce((acc, day) => ({
        activeHours: Math.round((acc.activeHours + day.activeHours) * 10) / 10,
        offlineHours: Math.round((acc.offlineHours + day.offlineHours) * 10) / 10,
        offered: acc.offered + day.offered,
        accepted: acc.accepted + day.accepted,
        declined: acc.declined + day.declined,
        timedOut: acc.timedOut + day.timedOut,
        superseded: acc.superseded + day.superseded,
        completed: acc.completed + day.completed,
        cancelled: acc.cancelled + day.cancelled,
        cancelledByDriver: acc.cancelledByDriver + day.cancelledByDriver,
        cancelledByUser: acc.cancelledByUser + day.cancelledByUser,
        cancelledByAdmin: acc.cancelledByAdmin + day.cancelledByAdmin,
        earnings: acc.earnings + day.earnings,
        activeDays: acc.activeDays + (day.activeHours > 0 ? 1 : 0)
    }), { activeHours: 0, offlineHours: 0, offered: 0, accepted: 0, declined: 0, timedOut: 0, superseded: 0, completed: 0, cancelled: 0, cancelledByDriver: 0, cancelledByUser: 0, cancelledByAdmin: 0, earnings: 0, activeDays: 0 });

    // Compute acceptance rate (only meaningful when offers > 0)
    totals.acceptanceRate = totals.offered > 0
        ? Math.round((totals.accepted / totals.offered) * 1000) / 10
        : null;

    res.json({
        success: true,
        data: {
            driver: {
                _id: driver._id,
                name: driver.user ? `${driver.user.firstName} ${driver.user.lastName}` : 'Unknown',
                email: driver.user?.email,
                profileImage: driver.user?.profileImage || null,
                phone: driver.phone,
                vehicle: driver.vehicle,
                status: driver.status,
                rating: driver.rating,
                totalTrips: driver.totalTrips,
                totalEarnings: driver.totalEarnings
            },
            calendar,
            totals
        }
    });
});

// @desc    Get driver offer stats (acceptance/rejection breakdown)
// @route   GET /api/drivers/:id/offers
// @access  Private/Admin
const getDriverOfferStats = catchAsync(async (req, res, next) => {
    const driverId = req.params.id;

    const driver = await Driver.findById(driverId).select('_id').lean();
    if (!driver) {
        return next(new AppError('Driver not found', 404));
    }

    // Parse optional date range (defaults to last 30 days)
    const now = new Date();
    const since = req.query.since ? new Date(req.query.since) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [summary, recentOffers] = await Promise.all([
        RideOffer.aggregate([
            { $match: { driver: new mongoose.Types.ObjectId(driverId), offeredAt: { $gte: since } } },
            {
                $group: {
                    _id: null,
                    offered: { $sum: 1 },
                    accepted: { $sum: { $cond: [{ $eq: ['$status', 'accepted'] }, 1, 0] } },
                    declined: { $sum: { $cond: [{ $eq: ['$status', 'declined'] }, 1, 0] } },
                    timedOut: { $sum: { $cond: [{ $eq: ['$status', 'timeout'] }, 1, 0] } },
                    superseded: { $sum: { $cond: [{ $eq: ['$status', 'superseded'] }, 1, 0] } },
                    pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
                    avgResponseMs: { $avg: '$responseTimeMs' }
                }
            }
        ]),
        // Last 20 offers with ride details for drill-down
        RideOffer.find({ driver: driverId, offeredAt: { $gte: since } })
            .sort({ offeredAt: -1 })
            .limit(20)
            .populate('ride', 'pickup.address dropoff.address vehicleType quote.totalPrice status')
            .lean()
    ]);

    const s = summary[0] || { offered: 0, accepted: 0, declined: 0, timedOut: 0, superseded: 0, pending: 0, avgResponseMs: null };

    res.json({
        success: true,
        data: {
            since: since.toISOString(),
            summary: {
                offered: s.offered,
                accepted: s.accepted,
                declined: s.declined,
                timedOut: s.timedOut,
                superseded: s.superseded,
                pending: s.pending,
                acceptanceRate: s.offered > 0 ? Math.round((s.accepted / s.offered) * 1000) / 10 : null,
                avgResponseMs: s.avgResponseMs ? Math.round(s.avgResponseMs) : null
            },
            recentOffers
        }
    });
});

// @desc    Upload driver profile photo
// @route   POST /api/drivers/:id/photo
// @access  Private/Admin
const uploadDriverPhoto = catchAsync(async (req, res, next) => {
    if (!req.file) {
        return next(new AppError('Please upload an image file', 400));
    }

    const driver = await Driver.findById(req.params.id).populate('user');
    if (!driver) {
        return next(new AppError('Driver not found', 404));
    }

    if (!driver.user) {
        return next(new AppError('Driver has no associated user account', 400));
    }

    // Delete old image from Cloudinary if exists
    if (driver.user.profileImage) {
        try {
            const { cloudinary } = require('../configs/cloudinary.config');
            // Extract public_id from URL
            const parts = driver.user.profileImage.split('/');
            const uploadIdx = parts.indexOf('upload');
            if (uploadIdx !== -1) {
                // public_id is everything after upload/v{version}/ without extension
                const publicId = parts.slice(uploadIdx + 2).join('/').replace(/\.[^.]+$/, '');
                await cloudinary.uploader.destroy(publicId);
            }
        } catch (err) {
            console.error('Failed to delete old Cloudinary image:', err.message);
        }
    }

    // Update user's profileImage with Cloudinary URL
    driver.user.profileImage = req.file.secure_url || req.file.url;
    await driver.user.save();

    const updatedDriver = await Driver.findById(driver._id)
        .populate('user', 'firstName lastName email phone profileImage');

    res.json({
        success: true,
        message: 'Driver photo uploaded successfully',
        data: { driver: updatedDriver }
    });
});

// @desc    Self-register as a driver (user must already be authenticated)
// @route   POST /api/drivers/register
// @access  Private (any authenticated user without an existing driver profile)
const registerDriver = catchAsync(async (req, res, next) => {
    const userId = req.user._id || req.user.id;

    // Accept both nested `vehicle` object and flat fields from the mobile app.
    // Vehicle type is NOT set by the driver — admin assigns it after inspection.
    const vehicleMake = req.body.vehicleMake || req.body.vehicle?.make;
    const vehicleModel = req.body.vehicleModel || req.body.vehicle?.model;
    const vehicleYear = req.body.vehicleYear || req.body.vehicle?.year;
    const licensePlate = req.body.licensePlate || req.body.vehicle?.licensePlate;
    const vehicleColor = req.body.vehicleColor || req.body.vehicle?.color;

    // Phone and licenseNumber are optional — use the user's phone from their account
    const userDoc = await User.findById(userId).select('phone').lean();
    const phone = req.body.phone || userDoc?.phone || 'pending';
    const licenseNumber = req.body.licenseNumber || licensePlate || 'pending';

    if (!vehicleMake || !vehicleModel || !vehicleYear || !licensePlate || !vehicleColor) {
        return next(new AppError('Vehicle make, model, year, licensePlate, and color are required', 400));
    }

    // One driver profile per user
    const existingProfile = await Driver.findOne({ user: userId }).select('_id').lean();
    if (existingProfile) {
        return next(new AppError('You already have a driver profile', 409));
    }

    // License number uniqueness
    const existingLicense = await Driver.findOne({ licenseNumber }).select('_id').lean();
    if (existingLicense) {
        return next(new AppError('A driver with this license number already exists', 409));
    }

    // Vehicle type defaults to 'economy' — admin will assign the correct type
    // after inspecting the vehicle photos.
    const vehicle = {
        type: 'economy',
        make: vehicleMake,
        model: vehicleModel,
        year: parseInt(vehicleYear, 10),
        licensePlate: licensePlate.toUpperCase(),
        color: vehicleColor,
    };

    // Create the pending driver profile — isApproved and isActive are false by default
    const driver = await Driver.create({
        user: userId,
        phone,
        licenseNumber,
        vehicle,
        isApproved: false,
        isActive: false
    });

    // Do NOT promote to role=driver yet — they stay as 'user' until admin approves.
    // This prevents the socket reconnect loop (isDriver middleware rejects unapproved).

    const populatedDriver = await Driver.findById(driver._id)
        .populate('user', 'firstName lastName email phone');

    const { trackEvent, EVENTS } = require('../services/analytics.service');
    trackEvent(userId, EVENTS.DRIVER_REGISTERED, { licenseNumber, vehicleType: vehicle.type });

    res.status(201).json({
        success: true,
        message: 'Driver application submitted. Your profile is pending admin approval.',
        data: { driver: populatedDriver }
    });
});

// Allowed document field names in the driver.documents sub-document
// Includes original types + new car photo types for vehicle inspection
const VALID_DOCUMENT_TYPES = [
    'licenseImage', 'vehicleRegistration', 'insurance',
    'driverLicense', 'licenseFront', 'licenseBack', 'profilePhoto',
    'front', 'back', 'left', 'right', 'inside'
];

// @desc    Upload a document for the driver profile (works for unapproved drivers too)
// @route   POST /api/drivers/documents/:type
// @access  Private (must have a driver profile — approved or not)
const uploadDriverDocument = catchAsync(async (req, res, next) => {
    const { type } = req.params;

    if (!VALID_DOCUMENT_TYPES.includes(type)) {
        return next(new AppError(
            `Invalid document type. Allowed types: ${VALID_DOCUMENT_TYPES.join(', ')}`,
            400
        ));
    }

    if (!req.file) {
        return next(new AppError('Please upload a file', 400));
    }

    const userId = req.user._id || req.user.id;

    // Allow unapproved drivers to upload documents so they can complete their application
    const driver = await Driver.findOne({ user: userId });
    if (!driver) {
        return next(new AppError('Driver profile not found. Please register as a driver first.', 404));
    }

    // The Cloudinary URL is provided by multer-storage-cloudinary on req.file
    const secureUrl = req.file.secure_url || req.file.url;

    driver.documents[type] = secureUrl;
    await driver.save();

    const { trackEvent, EVENTS } = require('../services/analytics.service');
    trackEvent(userId, EVENTS.DRIVER_DOCUMENT_UPLOADED, { documentType: type });

    res.json({
        success: true,
        message: `Document '${type}' uploaded successfully`,
        data: {
            documentType: type,
            url: secureUrl,
            documents: driver.documents
        }
    });
});

// @desc    Get pending driver registrations (unapproved)
// @route   GET /api/drivers/admin/pending
// @access  Private/Admin
const getPendingDrivers = catchAsync(async (req, res) => {
    const drivers = await Driver.find({ isApproved: false })
        .populate('user', 'firstName lastName email phone profileImage createdAt')
        .sort({ createdAt: -1 });

    res.json({
        success: true,
        count: drivers.length,
        data: { drivers }
    });
});

// @desc    Approve or reject a pending driver registration
// @route   PATCH /api/drivers/admin/:id/approve
// @access  Private/Admin
// Body: { approved: true/false, vehicleType?: string, rejectionReason?: string }
const approveDriver = catchAsync(async (req, res, next) => {
    const { approved, vehicleType, rejectionReason } = req.body;

    if (approved === undefined) {
        return next(new AppError('approved field is required (true or false)', 400));
    }

    const driver = await Driver.findById(req.params.id).populate('user');
    if (!driver) {
        return next(new AppError('Driver not found', 404));
    }

    if (approved) {
        driver.isApproved = true;
        driver.isActive = true;
        // Admin assigns the vehicle type after inspecting photos
        if (vehicleType) {
            driver.vehicle.type = vehicleType;
        }
        await driver.save();

        // Promote user role to 'driver' so they can access the main app
        if (driver.user && driver.user.role !== 'driver') {
            driver.user.role = 'driver';
            await driver.user.save({ validateBeforeSave: false });
        }

        // Notify the driver via push notification
        if (driver.user) {
            pushService.sendToUser(
                driver.user._id.toString(),
                'driver_approved_title',
                'driver_approved_body',
                { type: 'driver_approved' }
            ).catch(() => {});
        }

        // Emit to admin room
        const io = req.app.get('io');
        if (io) {
            io.to('admin').emit('driver:approved', { driverId: driver._id });
            io.to(`user:${driver.user._id}`).emit('driver:approved', {
                driverId: driver._id,
                message: 'Your driver account has been approved!'
            });
        }
    } else {
        // Rejection — keep profile but mark not approved
        driver.isApproved = false;
        driver.isActive = false;
        if (rejectionReason) {
            driver.rejectionReason = rejectionReason;
        }
        await driver.save();

        if (driver.user) {
            pushService.sendToUser(
                driver.user._id.toString(),
                'driver_rejected_title',
                'driver_rejected_body',
                { type: 'driver_rejected', reason: rejectionReason || '' }
            ).catch(() => {});
        }
    }

    const updatedDriver = await Driver.findById(driver._id)
        .populate('user', 'firstName lastName email phone profileImage');

    res.json({
        success: true,
        message: approved ? 'Driver approved successfully' : 'Driver registration rejected',
        data: { driver: updatedDriver }
    });
});

// @desc    Get onboarding status for the current user (works for unapproved drivers)
// @route   GET /api/drivers/onboarding-status
// @access  Private (any authenticated user)
const getOnboardingStatus = catchAsync(async (req, res) => {
    const userId = req.user._id || req.user.id;

    const driver = await Driver.findOne({ user: userId })
        .select('isApproved isActive vehicle documents')
        .lean();

    if (!driver) {
        return res.json({
            success: true,
            data: { status: 'not_started', hasDriverProfile: false }
        });
    }

    // Check if documents have been uploaded
    const docs = driver.documents || {};
    const hasDocuments = !!(docs.driverLicense || docs.front);

    let status = 'pending'; // profile created, waiting for approval
    if (driver.isApproved) {
        status = 'approved';
    }

    res.json({
        success: true,
        data: {
            status,
            hasDriverProfile: true,
            isApproved: driver.isApproved,
            hasDocuments,
            vehicle: driver.vehicle,
        }
    });
});

module.exports = {
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
};
