const { verifyToken } = require('../utils/jwt.utils');
const User = require('../models/user.model');
const Driver = require('../models/driver.model');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');

const protect = catchAsync(async (req, res, next) => {
    let token;

    // Check cookie first, then Authorization header
    if (req.cookies.token) {
        token = req.cookies.token;
    } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
        return next(new AppError('Not authorized, no token provided', 401));
    }

    const decoded = verifyToken(token);
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
        return next(new AppError('User not found', 401));
    }

    req.user = user;
    next();
});

const authorize = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return next(new AppError('Not authorized to access this route', 403));
        }
        next();
    };
};

// Middleware to check if user is a driver (has driver profile)
const isDriver = catchAsync(async (req, res, next) => {
    const driver = await Driver.findOne({ user: req.user.id, isActive: true, isApproved: true });

    if (!driver) {
        return next(new AppError('Driver profile not found or not approved', 403));
    }

    req.driver = driver;
    next();
});

module.exports = { protect, authorize, isDriver };
