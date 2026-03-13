const User = require('../models/user.model');
const OTP = require('../models/otp.model');
const { generateToken } = require('../utils/jwt.utils');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const { OAuth2Client } = require('google-auth-library');
const { generateOTP, sendVerification, checkVerification } = require('../services/sms.service');
const appleSignin = require('apple-signin-auth');

// Cookie options
const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/',
    ...(process.env.NODE_ENV === 'production' && { domain: '.lulini.ge' }),
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

    // Account lockout check (30 min lockout after 5 failed attempts)
    if (user.lockUntil && user.lockUntil > new Date()) {
        const minutesLeft = Math.ceil((user.lockUntil - new Date()) / 60000);
        return next(new AppError(`Account locked due to too many failed attempts. Try again in ${minutesLeft} minutes`, 423));
    }

    if (user.provider !== 'local') {
        return next(new AppError(`Please login with ${user.provider}`, 400));
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
        // Increment failed attempts, lock after 5
        user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
        if (user.failedLoginAttempts >= 5) {
            user.lockUntil = new Date(Date.now() + 30 * 60 * 1000);
        }
        await user.save({ validateBeforeSave: false });
        return next(new AppError('Invalid credentials', 401));
    }

    // Reset lockout counters on successful login
    if (user.failedLoginAttempts > 0 || user.lockUntil) {
        user.failedLoginAttempts = 0;
        user.lockUntil = null;
        await user.save({ validateBeforeSave: false });
    }

    sendTokenResponse(user, 200, res, 'Login successful');
});

// @desc    Logout user
// @route   POST /api/auth/logout
const logout = (req, res) => {
    res.cookie('token', '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        ...(process.env.NODE_ENV === 'production' && { domain: '.lulini.ge' }),
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
                hasCompletedOnboarding: user.hasCompletedOnboarding,
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

// Allowlist of valid redirect URI schemes for OAuth mobile flow
const ALLOWED_REDIRECT_SCHEMES = ['lulini://', 'lulinidriver://', 'exp://'];

const isAllowedRedirectUri = (uri) => {
    if (!uri || typeof uri !== 'string') return false;
    return ALLOWED_REDIRECT_SCHEMES.some(scheme => uri.startsWith(scheme));
};

// @desc    Handle OAuth callback success (mobile)
const oauthSuccessMobile = (req, res) => {
    const token = generateToken(req.user._id);
    const redirectUri = req.query.state || req.session?.redirectUri;

    if (redirectUri && isAllowedRedirectUri(redirectUri)) {
        // Redirect back to mobile app with token (validated against allowlist)
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

    // Accept tokens from web, Android, and iOS Google OAuth clients
    const validAudiences = [
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_ANDROID_CLIENT_ID,
        process.env.GOOGLE_IOS_CLIENT_ID,
    ].filter(Boolean);

    // Verify the ID token
    const ticket = await client.verifyIdToken({
        idToken,
        audience: validAudiences,
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email, given_name, family_name, picture } = payload;

    // Find user by Google provider ID first (exact match)
    let user = await User.findOne({ providerId: googleId, provider: 'google' });

    if (!user && email) {
        // Check if email exists under a different provider
        const existingByEmail = await User.findOne({ email });
        if (existingByEmail) {
            // Do NOT silently merge — require the user to log in with their original provider
            return next(new AppError(
                `An account with this email already exists. Please log in with ${existingByEmail.provider}`,
                409
            ));
        }
    }

    if (user) {
        // Update avatar if changed
        if (picture && picture !== user.avatar) {
            user.avatar = picture;
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

    // Validate phone format (E.164)
    const phoneRegex = /^\+?[\d\s()-]{7,20}$/;
    if (!phoneRegex.test(phone)) {
        return next(new AppError('Please provide a valid phone number', 400));
    }

    // Check if user already exists with this phone
    const existingUser = await User.findOne({ phone });

    // Delete any existing OTP for this phone
    await OTP.deleteMany({ phone });

    // Send verification via Twilio Verify (or dev fallback)
    const result = await sendVerification(phone);

    // In dev mode (Twilio not configured), save OTP locally
    if (result.devCode) {
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
        await OTP.create({ phone, code: result.devCode, expiresAt });
    }

    res.status(200).json({
        success: true,
        message: 'OTP sent successfully'
    });
});

// @desc    Verify OTP and login/register user
// @route   POST /api/auth/phone/verify-otp
const verifyPhoneOtp = catchAsync(async (req, res, next) => {
    const { phone, code, firstName, lastName } = req.body;

    if (!phone) {
        return next(new AppError('Phone number is required', 400));
    }

    // Registration completion flow (phone already verified, no code needed)
    if (!code && firstName) {
        const verifiedRecord = await OTP.findOne({ phone, verified: true });
        if (!verifiedRecord) {
            return next(new AppError('Phone not verified. Please verify your phone first', 400));
        }
        await OTP.deleteOne({ _id: verifiedRecord._id });

        const user = await User.create({
            firstName,
            lastName,
            phone,
            provider: 'phone',
            isPhoneVerified: true,
            isVerified: true
        });
        return sendTokenResponse(user, 201, res, 'Registration successful', true);
    }

    if (!code) {
        return next(new AppError('OTP code is required', 400));
    }

    // Try Twilio Verify first (returns null if not configured)
    let isValid = await checkVerification(phone, code);

    // Handle Twilio error responses
    if (isValid && typeof isValid === 'object' && isValid.error) {
        if (isValid.error === 'expired') {
            return next(new AppError('OTP has expired. Please request a new code', 400));
        }
        if (isValid.error === 'max_attempts') {
            return next(new AppError('Too many failed attempts. Please request a new code', 400));
        }
        return next(new AppError('Verification failed. Please request a new code', 400));
    }

    if (isValid === null) {
        // Dev mode - check local OTP DB
        const otpRecord = await OTP.findOne({ phone, verified: false });

        if (!otpRecord) {
            return next(new AppError('OTP not found. Please request a new code', 400));
        }
        if (otpRecord.expiresAt < new Date()) {
            await OTP.deleteOne({ _id: otpRecord._id });
            return next(new AppError('OTP has expired. Please request a new code', 400));
        }
        if (otpRecord.attempts >= 3) {
            await OTP.deleteOne({ _id: otpRecord._id });
            return next(new AppError('Too many failed attempts. Please request a new code', 400));
        }
        const codeMatches = await otpRecord.compareCode(code);
        if (!codeMatches) {
            otpRecord.attempts += 1;
            await otpRecord.save();
            return next(new AppError('Invalid OTP code', 400));
        }

        isValid = true;
        await OTP.deleteOne({ _id: otpRecord._id });
    }

    if (!isValid) {
        return next(new AppError('Invalid OTP code', 400));
    }

    // OTP verified - find or create user
    let user = await User.findOne({ phone });
    let isNewUser = false;

    if (!user) {
        if (!firstName) {
            // Save a verified record so registration can complete without re-verifying
            await OTP.create({
                phone,
                code: 'verified',
                verified: true,
                expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 min to complete registration
            });
            return res.status(200).json({
                success: true,
                isNewUser: true,
                requiresRegistration: true,
                message: 'Phone verified. Please complete registration'
            });
        }

        user = await User.create({
            firstName,
            lastName,
            phone,
            provider: 'phone',
            isPhoneVerified: true,
            isVerified: true
        });
        isNewUser = true;
    } else {
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

    // Find user by Apple provider ID first (exact match)
    let user = await User.findOne({ providerId: appleId, provider: 'apple' });

    if (!user && email) {
        // Check if email exists under a different provider
        const existingByEmail = await User.findOne({ email });
        if (existingByEmail) {
            return next(new AppError(
                `An account with this email already exists. Please log in with ${existingByEmail.provider}`,
                409
            ));
        }
    }

    let isNewUser = false;

    if (user) {
        // Existing Apple user — no merge needed
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

    // Send verification via Twilio Verify (or dev fallback)
    const result = await sendVerification(phone);

    // In dev mode, save OTP locally
    if (result.devCode) {
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
        await OTP.create({ phone, code: result.devCode, expiresAt });
    }

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

    // Try Twilio Verify first
    let isValid = await checkVerification(phone, code);

    // Handle Twilio error responses
    if (isValid && typeof isValid === 'object' && isValid.error) {
        if (isValid.error === 'expired') {
            return next(new AppError('OTP has expired. Please request a new code', 400));
        }
        if (isValid.error === 'max_attempts') {
            return next(new AppError('Too many failed attempts. Please request a new code', 400));
        }
        return next(new AppError('Verification failed. Please request a new code', 400));
    }

    if (isValid === null) {
        // Dev mode - check local OTP DB
        const otpRecord = await OTP.findOne({ phone });

        if (!otpRecord) {
            return next(new AppError('OTP not found. Please request a new code', 400));
        }
        if (otpRecord.expiresAt < new Date()) {
            await OTP.deleteOne({ _id: otpRecord._id });
            return next(new AppError('OTP has expired. Please request a new code', 400));
        }
        if (otpRecord.attempts >= 3) {
            await OTP.deleteOne({ _id: otpRecord._id });
            return next(new AppError('Too many failed attempts. Please request a new code', 400));
        }
        const codeMatches = await otpRecord.compareCode(code);
        if (!codeMatches) {
            otpRecord.attempts += 1;
            await otpRecord.save();
            return next(new AppError('Invalid OTP code', 400));
        }

        isValid = true;
        await OTP.deleteOne({ _id: otpRecord._id });
    }

    if (!isValid) {
        return next(new AppError('Invalid OTP code', 400));
    }

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

// @desc    Update user email
// @route   PATCH /api/auth/email
const updateEmail = catchAsync(async (req, res, next) => {
    const { email } = req.body;
    const userId = req.user.id;

    if (!email) {
        return next(new AppError('Email is required', 400));
    }

    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(email)) {
        return next(new AppError('Please provide a valid email address', 400));
    }

    // Check if email is already used by another user
    const existingUser = await User.findOne({ email, _id: { $ne: userId } });
    if (existingUser) {
        return next(new AppError('This email is already registered to another account', 400));
    }

    const user = await User.findById(userId);
    if (!user) {
        return next(new AppError('User not found', 404));
    }

    user.email = email.toLowerCase().trim();
    await user.save();

    res.status(200).json({
        success: true,
        message: 'Email updated successfully',
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
    verifyPhoneUpdateOtp,
    updateEmail
};
