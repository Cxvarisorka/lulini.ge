const User = require('../models/user.model');
const OTP = require('../models/otp.model');
const { generateToken } = require('../utils/jwt.utils');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const { OAuth2Client } = require('google-auth-library');
const { generateOTP, sendOTP } = require('../services/sms.service');
const appleSignin = require('apple-signin-auth');

// Cookie options
const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // 'none' for cross-origin (mobile apps)
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/'
};

// Helper to send token via cookie AND response body (for mobile clients)
const sendTokenResponse = (user, statusCode, res, message, isNewUser = false) => {
    const token = generateToken(user._id);

    res.cookie('token', token, cookieOptions);

    res.status(statusCode).json({
        success: true,
        message,
        token, // Include token in response body for mobile clients
        isNewUser,
        data: {
            user: {
                id: user._id,
                fullName: user.fullName,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                phone: user.phone,
                role: user.role,
                avatar: user.avatar,
                isVerified: user.isVerified,
                isPhoneVerified: user.isPhoneVerified,
                hasCompletedOnboarding: user.hasCompletedOnboarding,
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

// @desc    Send OTP to phone number
// @route   POST /api/auth/phone/send-otp
const sendPhoneOtp = catchAsync(async (req, res, next) => {
    const { phone } = req.body;

    if (!phone) {
        return next(new AppError('Phone number is required', 400));
    }

    // Validate phone format
    const phoneRegex = /^\+?[\d\s()-]{7,20}$/;
    if (!phoneRegex.test(phone)) {
        return next(new AppError('Please provide a valid phone number', 400));
    }

    // Delete any existing OTP for this phone
    await OTP.deleteMany({ phone });

    // Generate and save OTP
    const code = generateOTP();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    await OTP.create({
        phone,
        code,
        expiresAt
    });

    // Send OTP via SMS
    await sendOTP(phone, code);

    res.status(200).json({
        success: true,
        message: 'OTP sent successfully'
    });
});

// @desc    Verify OTP and login/register user
// @route   POST /api/auth/phone/verify-otp
const verifyPhoneOtp = catchAsync(async (req, res, next) => {
    const { phone, code, fullName, email } = req.body;

    if (!phone || !code) {
        return next(new AppError('Phone number and OTP code are required', 400));
    }

    // Find the OTP record
    const otpRecord = await OTP.findOne({ phone });

    if (!otpRecord) {
        return next(new AppError('OTP not found. Please request a new code', 400));
    }

    // Check if OTP is expired
    if (otpRecord.expiresAt < new Date()) {
        await OTP.deleteOne({ _id: otpRecord._id });
        return next(new AppError('OTP has expired. Please request a new code', 400));
    }

    // Check attempts
    if (otpRecord.attempts >= 3) {
        await OTP.deleteOne({ _id: otpRecord._id });
        return next(new AppError('Too many failed attempts. Please request a new code', 400));
    }

    // Verify OTP code
    if (otpRecord.code !== code) {
        otpRecord.attempts += 1;
        await otpRecord.save();
        return next(new AppError('Invalid OTP code', 400));
    }

    // OTP is valid - delete it
    await OTP.deleteOne({ _id: otpRecord._id });

    // Find or create user
    let user = await User.findOne({ phone });
    let isNewUser = false;

    if (!user) {
        // New user - fullName is required
        if (!fullName) {
            return res.status(200).json({
                success: true,
                isNewUser: true,
                requiresRegistration: true,
                message: 'Phone verified. Please complete registration'
            });
        }

        user = await User.create({
            fullName,
            phone,
            email: email || undefined,
            provider: 'phone',
            isPhoneVerified: true,
            isVerified: true
        });
        isNewUser = true;
    } else {
        // Existing user - update phone verification status
        user.isPhoneVerified = true;
        await user.save();
    }

    sendTokenResponse(user, 200, res, 'Phone verification successful', isNewUser);
});

// @desc    Verify Apple ID token from mobile app
// @route   POST /api/auth/apple/token
const appleTokenAuth = catchAsync(async (req, res, next) => {
    const { identityToken, fullName, email: providedEmail } = req.body;

    if (!identityToken) {
        return next(new AppError('Identity token is required', 400));
    }

    // Verify the Apple identity token
    let appleUser;
    try {
        appleUser = await appleSignin.verifyIdToken(identityToken, {
            audience: process.env.APPLE_CLIENT_ID,
            ignoreExpiration: false
        });
    } catch (error) {
        return next(new AppError('Invalid Apple identity token', 401));
    }

    const { sub: appleId, email: tokenEmail } = appleUser;
    const email = providedEmail || tokenEmail;

    // Find or create user
    let user = await User.findOne({
        $or: [
            { providerId: appleId, provider: 'apple' },
            ...(email ? [{ email }] : [])
        ]
    });

    let isNewUser = false;

    if (user) {
        // If user exists with email but different provider, update provider info
        if (user.provider !== 'apple') {
            user.provider = 'apple';
            user.providerId = appleId;
            await user.save();
        }
    } else {
        // Create new user
        user = await User.create({
            fullName: fullName || 'Apple User',
            email: email || undefined,
            provider: 'apple',
            providerId: appleId,
            isVerified: true
        });
        isNewUser = true;
    }

    sendTokenResponse(user, 200, res, 'Apple login successful', isNewUser);
});

// @desc    Complete onboarding
// @route   POST /api/auth/complete-onboarding
const completeOnboarding = catchAsync(async (req, res, next) => {
    const user = await User.findById(req.user.id);

    if (!user) {
        return next(new AppError('User not found', 404));
    }

    user.hasCompletedOnboarding = true;
    await user.save();

    res.status(200).json({
        success: true,
        message: 'Onboarding completed'
    });
});

// @desc    Send OTP for phone number update (authenticated user)
// @route   POST /api/auth/phone/update-send-otp
const sendPhoneUpdateOtp = catchAsync(async (req, res, next) => {
    const { phone } = req.body;
    const userId = req.user.id;

    if (!phone) {
        return next(new AppError('Phone number is required', 400));
    }

    // Validate phone format
    const phoneRegex = /^\+?[\d\s()-]{7,20}$/;
    if (!phoneRegex.test(phone)) {
        return next(new AppError('Please provide a valid phone number', 400));
    }

    // Check if phone is already used by another user
    const existingUser = await User.findOne({ phone, _id: { $ne: userId } });
    if (existingUser) {
        return next(new AppError('This phone number is already registered to another account', 400));
    }

    // Delete any existing OTP for this phone
    await OTP.deleteMany({ phone });

    // Generate and save OTP
    const code = generateOTP();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    await OTP.create({
        phone,
        code,
        expiresAt,
        userId // Link OTP to user for extra security
    });

    // Send OTP via SMS
    await sendOTP(phone, code);

    res.status(200).json({
        success: true,
        message: 'OTP sent successfully'
    });
});

// @desc    Verify OTP and update phone number (authenticated user)
// @route   POST /api/auth/phone/update-verify-otp
const verifyPhoneUpdateOtp = catchAsync(async (req, res, next) => {
    const { phone, code } = req.body;
    const userId = req.user.id;

    if (!phone || !code) {
        return next(new AppError('Phone number and OTP code are required', 400));
    }

    // Find the OTP record
    const otpRecord = await OTP.findOne({ phone });

    if (!otpRecord) {
        return next(new AppError('OTP not found. Please request a new code', 400));
    }

    // Check if OTP is expired
    if (otpRecord.expiresAt < new Date()) {
        await OTP.deleteOne({ _id: otpRecord._id });
        return next(new AppError('OTP has expired. Please request a new code', 400));
    }

    // Check attempts
    if (otpRecord.attempts >= 3) {
        await OTP.deleteOne({ _id: otpRecord._id });
        return next(new AppError('Too many failed attempts. Please request a new code', 400));
    }

    // Verify OTP code
    if (otpRecord.code !== code) {
        otpRecord.attempts += 1;
        await otpRecord.save();
        return next(new AppError('Invalid OTP code', 400));
    }

    // OTP is valid - delete it
    await OTP.deleteOne({ _id: otpRecord._id });

    // Update user's phone number
    const user = await User.findById(userId);
    if (!user) {
        return next(new AppError('User not found', 404));
    }

    user.phone = phone;
    user.isPhoneVerified = true;
    await user.save();

    res.status(200).json({
        success: true,
        message: 'Phone number updated successfully',
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
                isPhoneVerified: user.isPhoneVerified,
                hasCompletedOnboarding: user.hasCompletedOnboarding,
                createdAt: user.createdAt
            }
        }
    });
});

module.exports = {
    register,
    login,
    logout,
    getMe,
    oauthSuccess,
    oauthSuccessMobile,
    oauthFailure,
    googleTokenAuth,
    sendPhoneOtp,
    verifyPhoneOtp,
    appleTokenAuth,
    completeOnboarding,
    sendPhoneUpdateOtp,
    verifyPhoneUpdateOtp
};
