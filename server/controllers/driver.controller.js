const Driver = require('../models/driver.model');
const User = require('../models/user.model');
const Ride = require('../models/ride.model');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const { haversineKm } = require('../utils/distance');

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

    try {
        // Create user account for driver
        const user = await User.create({
            email,
            password,
            firstName,
            lastName,
            phone,
            role: 'driver',
            provider: 'local',
            isVerified: true
        });

        // Create driver profile
        const driver = await Driver.create({
            user: user._id,
            phone,
            licenseNumber,
            vehicle,
            isApproved: true
        });

        const populatedDriver = await Driver.findById(driver._id).populate('user', 'firstName lastName email');

        res.status(201).json({
            success: true,
            message: 'Driver created successfully',
            data: { driver: populatedDriver }
        });
    } catch (error) {
        console.error('Error creating driver:', error);
        // If user was created but driver creation failed, clean up the user
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
        .populate('user', 'firstName lastName email phone')
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
        .populate('user', 'firstName lastName email phone');

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
        .populate('user', 'firstName lastName email phone');

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
        .populate('user', 'firstName lastName email phone');

    if (!driver) {
        return next(new AppError('Driver profile not found', 404));
    }

    res.json({
        success: true,
        data: { driver }
    });
});

// @desc    Update driver status (online/offline/busy)
// @route   PATCH /api/drivers/status
// @access  Private/Driver
const updateDriverStatus = catchAsync(async (req, res, next) => {
    const { status } = req.body;

    if (!['online', 'offline', 'busy'].includes(status)) {
        return next(new AppError('Invalid status', 400));
    }

    const driver = await Driver.findOne({ user: req.user.id });
    if (!driver) {
        return next(new AppError('Driver profile not found', 404));
    }

    driver.status = status;
    await driver.save();

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
            // Ensure sockets join driver rooms when going online
            const rooms = [driverRoom, 'drivers:all'];
            if (typeRoom) rooms.push(typeRoom);
            io.in(userRoom).socketsJoin(rooms);
        } else if (status === 'offline') {
            // Remove from broadcast rooms when going offline
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
    const { latitude, longitude } = req.body;

    if (!latitude || !longitude) {
        return next(new AppError('Latitude and longitude are required', 400));
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

    // Parallelize: update location + check for active ride simultaneously
    const [, activeRide] = await Promise.all([
        Driver.updateOne(
            { _id: driver._id },
            { $set: { location: { type: 'Point', coordinates: [longitude, latitude] } } }
        ),
        Ride.findOne({
            driver: driver._id,
            status: { $in: ['accepted', 'driver_arrived'] }
        }).select('_id user').lean()
    ]);

    if (activeRide) {
        const io = req.app.get('io');
        if (io) {
            io.to(`user:${activeRide.user}`).emit('driver:locationUpdate', {
                rideId: activeRide._id,
                location: { latitude, longitude }
            });
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
        .select('_id totalEarnings totalTrips rating totalReviews status').lean();
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
                status: driver.status
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
        .populate('user', 'firstName lastName email')
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

    // Single aggregation for ALL drivers — replaces N separate queries
    const rideStats = await Ride.aggregate([
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
    ]).read('secondaryPreferred');

    // Index by driver ID for O(1) lookup
    const statsMap = new Map(rideStats.map(s => [s._id.toString(), s]));

    const statistics = drivers
        .filter(d => d.user)
        .map(driver => {
            const s = statsMap.get(driver._id.toString()) || {};
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

    const query = {
        status: 'online',
        isActive: true,
        isApproved: true,
        location: {
            $near: {
                $geometry: {
                    type: 'Point',
                    coordinates: [parseFloat(lng), parseFloat(lat)]
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

    // Parallelize: update location + check for active ride simultaneously
    const [, activeRide] = await Promise.all([
        Driver.updateOne(
            { _id: driver._id },
            { $set: { location: { type: 'Point', coordinates: [accepted.longitude, accepted.latitude] } } }
        ),
        Ride.findOne({
            driver: driver._id,
            status: { $in: ['accepted', 'driver_arrived'] },
        }).select('_id user').lean()
    ]);

    if (activeRide) {
        const io = req.app.get('io');
        if (io) {
            io.to(`user:${activeRide.user}`).emit('driver:locationUpdate', {
                rideId: activeRide._id,
                location: {
                    latitude: accepted.latitude,
                    longitude: accepted.longitude,
                },
            });
        }
    }

    res.json({ success: true, message: 'Batch location updated', accepted: 1 });
});

module.exports = {
    createDriver,
    getAllDrivers,
    getDriver,
    updateDriver,
    deleteDriver,
    getDriverProfile,
    updateDriverStatus,
    updateDriverLocation,
    batchUpdateDriverLocation,
    getDriverStats,
    getDriverEarnings,
    getDriverReviews,
    getAllDriverStatistics,
    getNearbyDrivers
};
