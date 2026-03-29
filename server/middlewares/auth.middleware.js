const { verifyToken } = require('../utils/jwt.utils');
const User = require('../models/user.model');
const Driver = require('../models/driver.model');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const { userCache, driverCache, AUTH_CACHE_TTL } = require('../utils/authCache');
const { isTokenBlocked, isUserTokensRevoked } = require('../utils/tokenBlocklist');

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
    if (!decoded) {
        return next(new AppError('Invalid or expired token', 401));
    }

    // Check token blocklist (revoked on logout, password change, account deletion)
    if (decoded.jti && await isTokenBlocked(decoded.jti)) {
        return next(new AppError('Token has been revoked', 401));
    }

    // Check if all user tokens were bulk-revoked (e.g. password change)
    if (decoded.iat && await isUserTokensRevoked(decoded.id, decoded.iat)) {
        return next(new AppError('Token has been revoked', 401));
    }

    // Check cache first (60s TTL)
    const cached = userCache.get(decoded.id);
    if (cached && Date.now() - cached.ts < AUTH_CACHE_TTL) {
        req.user = cached.user;
        return next();
    }

    // .lean() returns a plain JS object — lower memory, no Mongoose document overhead
    const user = await User.findById(decoded.id).select('-password').lean();

    if (!user) {
        return next(new AppError('User not found', 401));
    }

    // Reject accounts that have been soft-deleted during the grace period.
    // Exception: allow the cancel-deletion endpoint through so users can
    // recover their account before the hard-delete job runs.
    if (user.isDeleted && req.path !== '/account/cancel') {
        return next(new AppError('This account has been scheduled for deletion and is no longer accessible', 403));
    }

    // Add `id` alias for compatibility (lean objects don't have Mongoose virtuals)
    user.id = user._id.toString();

    userCache.set(decoded.id, { user, ts: Date.now() });
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
    const cacheKey = req.user._id?.toString() || req.user.id;

    // Check cache first (60s TTL)
    const cached = driverCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < AUTH_CACHE_TTL) {
        if (!cached.driver) {
            return next(new AppError('Driver profile not found or not approved', 403));
        }
        req.driver = cached.driver;
        return next();
    }

    const driver = await Driver.findOne({ user: cacheKey, isActive: true, isApproved: true });

    // Cache even negative results to avoid repeated queries for non-drivers
    driverCache.set(cacheKey, { driver: driver || null, ts: Date.now() });

    if (!driver) {
        return next(new AppError('Driver profile not found or not approved', 403));
    }

    req.driver = driver;
    next();
});

module.exports = { protect, authorize, isDriver };
