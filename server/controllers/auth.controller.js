const User = require('../models/user.model');
const { generateToken } = require('../utils/jwt.utils');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');

// Cookie options
const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/'
};

// Helper to send token via cookie
const sendTokenResponse = (user, statusCode, res, message) => {
    const token = generateToken(user._id);

    res.cookie('token', token, cookieOptions);

    res.status(statusCode).json({
        success: true,
        message,
        data: {
            user: {
                id: user._id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                role: user.role,
                avatar: user.avatar
            }
        }
    });
};

// @desc    Register user (traditional)
// @route   POST /api/auth/register
const register = catchAsync(async (req, res, next) => {
    const { firstName, lastName, email, password, phone } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
        return next(new AppError('User already exists with this email', 400));
    }

    const user = await User.create({
        firstName,
        lastName,
        email,
        password,
        phone,
        provider: 'local'
    });

    sendTokenResponse(user, 201, res, 'User registered successfully');
});

// @desc    Login user (traditional)
// @route   POST /api/auth/login
const login = catchAsync(async (req, res, next) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return next(new AppError('Please provide email and password', 400));
    }

    const user = await User.findOne({ email });
    if (!user) {
        return next(new AppError('Invalid credentials', 401));
    }

    if (user.provider !== 'local') {
        return next(new AppError(`Please login with ${user.provider}`, 400));
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
        return next(new AppError('Invalid credentials', 401));
    }

    sendTokenResponse(user, 200, res, 'Login successful');
});

// @desc    Logout user
// @route   POST /api/auth/logout
const logout = (req, res) => {
    res.cookie('token', '', {
        httpOnly: true,
        expires: new Date(0)
    });

    res.json({
        success: true,
        message: 'Logged out successfully'
    });
};

// @desc    Get current user
// @route   GET /api/auth/me
const getMe = catchAsync(async (req, res, next) => {
    const user = await User.findById(req.user.id).select('-password');

    if (!user) {
        return next(new AppError('User not found', 404));
    }

    res.json({
        success: true,
        data: {
            user: {
                id: user._id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                phone: user.phone,
                role: user.role,
                avatar: user.avatar,
                createdAt: user.createdAt
            }
        }
    });
});

// @desc    Handle OAuth callback success
const oauthSuccess = (req, res) => {
    const token = generateToken(req.user._id);

    res.cookie('token', token, cookieOptions);
    res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}/profile`);
};

// @desc    Handle OAuth callback failure
const oauthFailure = (req, res) => {
    res.redirect(`${process.env.CLIENT_URL}/login?error=oauth_failed`);
};

module.exports = {
    register,
    login,
    logout,
    getMe,
    oauthSuccess,
    oauthFailure
};
