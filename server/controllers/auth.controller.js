const User = require('../models/user.model');
const { generateToken } = require('../utils/jwt.utils');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const { OAuth2Client } = require('google-auth-library');

// Cookie options
const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // 'none' for cross-origin (mobile apps)
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/'
};

// Helper to send token via cookie AND response body (for mobile clients)
const sendTokenResponse = (user, statusCode, res, message) => {
    const token = generateToken(user._id);

    res.cookie('token', token, cookieOptions);

    res.status(statusCode).json({
        success: true,
        message,
        token, // Include token in response body for mobile clients
        data: {
            user: {
                id: user._id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                phone: user.phone,
                role: user.role,
                avatar: user.avatar,
                isVerified: user.isVerified,
                createdAt: user.createdAt
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

// @desc    Handle OAuth callback success (web)
const oauthSuccess = (req, res) => {
    const token = generateToken(req.user._id);

    res.cookie('token', token, cookieOptions);
    res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}/profile`);
};

// @desc    Handle OAuth callback success (mobile)
const oauthSuccessMobile = (req, res) => {
    const token = generateToken(req.user._id);
    const redirectUri = req.query.state || req.session?.redirectUri;

    if (redirectUri) {
        // Redirect back to mobile app with token
        res.redirect(`${redirectUri}?token=${token}`);
    } else {
        // Fallback: return JSON response
        res.json({
            success: true,
            token,
            data: {
                user: {
                    id: req.user._id,
                    firstName: req.user.firstName,
                    lastName: req.user.lastName,
                    email: req.user.email,
                    phone: req.user.phone,
                    role: req.user.role,
                    avatar: req.user.avatar,
                    isVerified: req.user.isVerified,
                    createdAt: req.user.createdAt
                }
            }
        });
    }
};

// @desc    Handle OAuth callback failure
const oauthFailure = (req, res) => {
    res.redirect(`${process.env.CLIENT_URL}/login?error=oauth_failed`);
};

// @desc    Verify Google ID token from mobile app
// @route   POST /api/auth/google/token
const googleTokenAuth = catchAsync(async (req, res, next) => {
    const { idToken } = req.body;

    if (!idToken) {
        return next(new AppError('ID token is required', 400));
    }

    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

    // Verify the ID token
    const ticket = await client.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email, given_name, family_name, picture } = payload;

    // Find or create user
    let user = await User.findOne({
        $or: [
            { providerId: googleId, provider: 'google' },
            { email: email }
        ]
    });

    if (user) {
        // If user exists with email but different provider, update provider info
        if (user.provider !== 'google') {
            user.provider = 'google';
            user.providerId = googleId;
            user.avatar = picture || user.avatar;
            await user.save();
        }
    } else {
        // Create new user
        user = await User.create({
            firstName: given_name,
            lastName: family_name,
            email: email,
            provider: 'google',
            providerId: googleId,
            avatar: picture,
            isVerified: true
        });
    }

    sendTokenResponse(user, 200, res, 'Google login successful');
});

module.exports = {
    register,
    login,
    logout,
    getMe,
    oauthSuccess,
    oauthSuccessMobile,
    oauthFailure,
    googleTokenAuth
};
