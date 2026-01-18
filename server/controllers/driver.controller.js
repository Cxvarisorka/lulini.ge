const Driver = require('../models/driver.model');
const User = require('../models/user.model');
const Ride = require('../models/ride.model');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');

// @desc    Create new driver
// @route   POST /api/drivers
// @access  Private/Admin
const createDriver = catchAsync(async (req, res, next) => {
    const { email, password, firstName, lastName, phone, licenseNumber, vehicle } = req.body;

    console.log('Creating driver with data:', { email, firstName, lastName, phone, licenseNumber, vehicle });

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

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
        io.emit('driver:statusChanged', {
            driverId: driver._id,
            status: status
        });
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

    const driver = await Driver.findOne({ user: req.user.id });
    if (!driver) {
        return next(new AppError('Driver profile not found', 404));
    }

    driver.location = {
        type: 'Point',
        coordinates: [longitude, latitude]
    };
    await driver.save();

    res.json({
        success: true,
        message: 'Location updated successfully'
    });
});

// @desc    Get driver stats
// @route   GET /api/drivers/stats
// @access  Private/Driver
const getDriverStats = catchAsync(async (req, res, next) => {
    const driver = await Driver.findOne({ user: req.user.id });
    if (!driver) {
        return next(new AppError('Driver profile not found', 404));
    }

    const Ride = require('../models/ride.model');

    // Get today's stats (midnight to now)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get last 24 hours stats
    const last24Hours = new Date();
    last24Hours.setHours(last24Hours.getHours() - 24);

    // Get this week's stats
    const thisWeek = new Date();
    thisWeek.setDate(thisWeek.getDate() - 7);

    // Get this month's stats
    const thisMonth = new Date();
    thisMonth.setMonth(thisMonth.getMonth() - 1);

    // Today's rides
    const todayRides = await Ride.find({
        driver: driver._id,
        status: 'completed',
        endTime: { $gte: today }
    });

    // Last 24 hours rides
    const last24HoursRides = await Ride.find({
        driver: driver._id,
        status: 'completed',
        endTime: { $gte: last24Hours }
    });

    // This week's rides
    const weekRides = await Ride.find({
        driver: driver._id,
        status: 'completed',
        endTime: { $gte: thisWeek }
    });

    // This month's rides
    const monthRides = await Ride.find({
        driver: driver._id,
        status: 'completed',
        endTime: { $gte: thisMonth }
    });

    // Pending rides count
    const pendingRides = await Ride.countDocuments({
        driver: driver._id,
        status: { $in: ['accepted', 'in_progress'] }
    });

    const todayEarnings = todayRides.reduce((sum, ride) => sum + ride.fare, 0);
    const last24HoursEarnings = last24HoursRides.reduce((sum, ride) => sum + ride.fare, 0);
    const weekEarnings = weekRides.reduce((sum, ride) => sum + ride.fare, 0);
    const monthEarnings = monthRides.reduce((sum, ride) => sum + ride.fare, 0);

    res.json({
        success: true,
        data: {
            stats: {
                today: {
                    earnings: todayEarnings,
                    trips: todayRides.length
                },
                last24Hours: {
                    earnings: last24HoursEarnings,
                    trips: last24HoursRides.length
                },
                week: {
                    earnings: weekEarnings,
                    trips: weekRides.length
                },
                month: {
                    earnings: monthEarnings,
                    trips: monthRides.length
                },
                total: {
                    earnings: driver.totalEarnings,
                    trips: driver.totalTrips
                },
                rating: driver.rating,
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

    const driver = await Driver.findOne({ user: req.user.id });
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

    const rides = await Ride.find({
        driver: driver._id,
        status: 'completed',
        endTime: { $gte: startDate }
    });

    const total = rides.reduce((sum, ride) => sum + ride.fare, 0);
    const average = rides.length > 0 ? total / rides.length : 0;

    res.json({
        success: true,
        data: {
            earnings: {
                total,
                trips: rides.length,
                average
            }
        }
    });
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
    getDriverStats,
    getDriverEarnings
};
