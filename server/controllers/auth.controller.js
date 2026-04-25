const User = require('../models/user.model');
const Driver = require('../models/driver.model');
const Ride = require('../models/ride.model');
const RideOffer = require('../models/rideOffer.model');
const OTP = require('../models/otp.model');
const { generateToken, verifyToken } = require('../utils/jwt.utils');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const { sendVerification, generateOTP } = require('../services/sms.service');
const { invalidateUser, invalidateDriver } = require('../utils/authCache');
const analytics = require('../services/analytics.service');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const EmailOTP = require('../models/emailOtp.model');
const emailService = require('../services/email.service');
const { normalizePhone, isE164 } = require('../utils/phone');

// Build a find-query that matches either the normalized (E.164) phone or the
// raw input the client sent. This lets us transparently recover users whose
// phone was stored in a non-E.164 format before normalization was added.
function phoneMatchQuery(normalized, raw) {
    const values = [];
    if (normalized) values.push(normalized);
    if (raw && raw !== normalized) values.push(raw);
    if (values.length === 0) return null;
    if (values.length === 1) return values[0];
    return { $in: values };
}

function generateEmailCode() {
    return String(crypto.randomInt(100000, 1000000));
}

// Cookie options
const isProduction = process.env.NODE_ENV === 'production';
const cookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/',
    ...(process.env.COOKIE_DOMAIN && { domain: process.env.COOKIE_DOMAIN }),
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

// @desc    Login user (admin dashboard — email/password)
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

    analytics.trackEvent(user._id, analytics.EVENTS.ACCOUNT_LOGGED_IN, { provider: 'local' });

    sendTokenResponse(user, 200, res, 'Login successful');
});

// @desc    Logout user
// @route   POST /api/auth/logout
const logout = async (req, res) => {
    // Revoke the token so it can't be reused even if the client retains it
    const token = req.cookies.token
        || (req.headers.authorization && req.headers.authorization.split(' ')[1]);
    if (token) {
        const { decodeToken } = require('../utils/jwt.utils');
        const { blockToken } = require('../utils/tokenBlocklist');
        const decoded = decodeToken(token);
        if (decoded && decoded.jti && decoded.exp) {
            const ttl = decoded.exp - Math.floor(Date.now() / 1000);
            if (ttl > 0) {
                await blockToken(decoded.jti, ttl).catch(() => {});
            }
        }
    }

    res.cookie('token', '', {
        ...cookieOptions,
        expires: new Date(0),
        maxAge: 0,
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

    const hasName = !!(user.firstName && user.firstName.trim().length >= 2
        && user.lastName && user.lastName.trim().length >= 2);

    res.json({
        success: true,
        requiresName: !hasName,
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

// @desc    Send OTP to phone number
// @route   POST /api/auth/phone/send-otp
const sendPhoneOtp = catchAsync(async (req, res, next) => {
    const { phone: rawPhone } = req.body;

    if (!rawPhone) {
        return next(new AppError('Phone number is required', 400));
    }

    const phone = normalizePhone(rawPhone);
    if (!phone) {
        return next(new AppError('Please provide a valid phone number', 400));
    }

    // Check if user already exists with this phone (either normalized or legacy raw form)
    const existingUser = await User.findOne({ phone: phoneMatchQuery(phone, rawPhone) });

    // Delete any existing login OTP for this phone (both forms, to clean up legacy rows).
    // Scoped to 'login' purpose so we don't wipe a pending registration or password-reset OTP.
    await OTP.deleteMany({ phone: phoneMatchQuery(phone, rawPhone), purpose: 'login' });

    // Persist the OTP row BEFORE attempting SMS delivery so a hang or failure
    // in the SMS provider can be rolled back cleanly and the user can retry.
    const otpCode = generateOTP();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    const otpRow = await OTP.create({ phone, code: otpCode, purpose: 'login', expiresAt });

    try {
        await sendVerification(phone, otpCode);
    } catch (smsErr) {
        await OTP.deleteOne({ _id: otpRow._id }).catch(() => {});
        console.error('sendPhoneOtp: SMS delivery failed', smsErr);
        return next(new AppError('Unable to send verification code right now. Please try again in a moment.', 503));
    }

    res.status(200).json({
        success: true,
        message: 'OTP sent successfully'
    });
});

// @desc    Verify OTP and login/register user
// @route   POST /api/auth/phone/verify-otp
const verifyPhoneOtp = catchAsync(async (req, res, next) => {
    const { phone: rawPhone, code, firstName, lastName } = req.body;

    if (!rawPhone) {
        return next(new AppError('Phone number is required', 400));
    }

    const phone = normalizePhone(rawPhone);
    if (!phone) {
        return next(new AppError('Please provide a valid phone number', 400));
    }

    const phoneQuery = phoneMatchQuery(phone, rawPhone);

    // Registration completion flow (phone already verified, no code needed)
    if (!code && firstName) {
        const { verificationToken } = req.body;
        if (!verificationToken) {
            return next(new AppError('Phone not verified. Please verify your phone first', 400));
        }
        const decoded = verifyToken(verificationToken);
        if (!decoded || decoded.purpose !== 'phone-registration' || decoded.phone !== phone) {
            return next(new AppError('Phone not verified. Please verify your phone first', 400));
        }

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

    // Phone-level lockout: if user exists and is locked, reject early
    const existingUser = await User.findOne({ phone: phoneQuery });
    if (existingUser && existingUser.lockUntil && existingUser.lockUntil > new Date()) {
        const minutesLeft = Math.ceil((existingUser.lockUntil - new Date()) / 60000);
        return next(new AppError(`Too many failed attempts. Try again in ${minutesLeft} minutes`, 423));
    }

    // Verify OTP against local DB
    const otpRecord = await OTP.findOne({ phone: phoneQuery, verified: false });

    if (!otpRecord) {
        return next(new AppError('OTP not found. Please request a new code', 400));
    }
    if (otpRecord.expiresAt < new Date()) {
        await OTP.deleteOne({ _id: otpRecord._id });
        return next(new AppError('OTP has expired. Please request a new code', 400));
    }
    if (otpRecord.attempts >= 3) {
        await OTP.deleteOne({ _id: otpRecord._id });
        // Lock the account for 30 min if the user exists
        if (existingUser) {
            existingUser.failedLoginAttempts = (existingUser.failedLoginAttempts || 0) + 3;
            existingUser.lockUntil = new Date(Date.now() + 30 * 60 * 1000);
            await existingUser.save({ validateBeforeSave: false });
        }
        return next(new AppError('Too many failed attempts. Please request a new code', 400));
    }
    const codeMatches = await otpRecord.compareCode(code);
    if (!codeMatches) {
        otpRecord.attempts += 1;
        await otpRecord.save();
        // Track failed attempts on the user record too
        if (existingUser) {
            existingUser.failedLoginAttempts = (existingUser.failedLoginAttempts || 0) + 1;
            if (existingUser.failedLoginAttempts >= 5) {
                existingUser.lockUntil = new Date(Date.now() + 30 * 60 * 1000);
            }
            await existingUser.save({ validateBeforeSave: false });
        }
        return next(new AppError('Invalid OTP code', 400));
    }

    await OTP.deleteOne({ _id: otpRecord._id });

    // OTP verified - find or create user
    let user = await User.findOne({ phone: phoneQuery });
    let isNewUser = false;

    if (!user) {
        if (!firstName) {
            // Issue a short-lived JWT as proof of phone verification (stateless — no DB record needed)
            const verificationToken = jwt.sign(
                { phone, purpose: 'phone-registration' },
                process.env.JWT_SECRET,
                { expiresIn: '10m', issuer: 'lulini', audience: 'lulini-api' }
            );
            return res.status(200).json({
                success: true,
                isNewUser: true,
                requiresRegistration: true,
                verificationToken,
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
        user.isVerified = true;
        // Migrate legacy phone to E.164 so future saves pass validation
        if (!isE164(user.phone)) {
            user.phone = phone;
        }
        // Reset lockout counters on successful verification
        if (user.failedLoginAttempts > 0 || user.lockUntil) {
            user.failedLoginAttempts = 0;
            user.lockUntil = null;
        }
        await user.save();
    }

    sendTokenResponse(user, 200, res, 'Phone verification successful', isNewUser);
});

// @desc    Update user profile (firstName, lastName)
// @route   PATCH /api/auth/profile
const updateProfile = catchAsync(async (req, res, next) => {
    const { firstName, lastName } = req.body;
    const userId = req.user.id;

    if (!firstName || !lastName) {
        return next(new AppError('First name and last name are required', 400));
    }

    if (firstName.trim().length < 2 || lastName.trim().length < 2) {
        return next(new AppError('First name and last name must be at least 2 characters each', 400));
    }

    const user = await User.findById(userId);
    if (!user) {
        return next(new AppError('User not found', 404));
    }

    user.firstName = firstName.trim();
    user.lastName = lastName.trim();
    // Clear legacy fullName if it was a placeholder
    if (user.fullName === 'Apple User') {
        user.fullName = undefined;
    }
    await user.save();

    invalidateUser(userId);

    res.status(200).json({
        success: true,
        message: 'Profile updated successfully',
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
    const { phone: rawPhone } = req.body;
    const userId = req.user.id;

    if (!rawPhone) {
        return next(new AppError('Phone number is required', 400));
    }

    const phone = normalizePhone(rawPhone);
    if (!phone) {
        return next(new AppError('Please provide a valid phone number', 400));
    }

    // Check if phone is already used by another user (either normalized or legacy raw form).
    // Privacy: return a generic OTP-sent response instead of a specific error so this
    // endpoint can't be used to enumerate whether a phone belongs to another account.
    const existingUser = await User.findOne({
        phone: phoneMatchQuery(phone, rawPhone),
        _id: { $ne: userId }
    });
    if (existingUser) {
        return res.status(200).json({
            success: true,
            message: 'If the number is eligible, an OTP has been sent'
        });
    }

    // Delete any existing phone-update OTP for this phone. Scoped to its own
    // purpose so that a login-OTP flood on this phone cannot wipe a legitimate
    // update attempt (or vice-versa).
    await OTP.deleteMany({ phone: phoneMatchQuery(phone, rawPhone), purpose: 'phone_update' });

    // Persist the OTP row BEFORE attempting SMS delivery so a hang or failure
    // in the SMS provider can be rolled back cleanly and the user can retry.
    const otpCode = generateOTP();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    const otpRow = await OTP.create({ phone, code: otpCode, purpose: 'phone_update', expiresAt });

    try {
        await sendVerification(phone, otpCode);
    } catch (smsErr) {
        await OTP.deleteOne({ _id: otpRow._id }).catch(() => {});
        console.error('sendPhoneUpdateOtp: SMS delivery failed', smsErr);
        return next(new AppError('Unable to send verification code right now. Please try again in a moment.', 503));
    }

    res.status(200).json({
        success: true,
        message: 'If the number is eligible, an OTP has been sent'
    });
});

// @desc    Verify OTP and update phone number (authenticated user)
// @route   POST /api/auth/phone/update-verify-otp
const verifyPhoneUpdateOtp = catchAsync(async (req, res, next) => {
    const { phone: rawPhone, code } = req.body;
    const userId = req.user.id;

    if (!rawPhone || !code) {
        return next(new AppError('Phone number and OTP code are required', 400));
    }

    const phone = normalizePhone(rawPhone);
    if (!phone) {
        return next(new AppError('Please provide a valid phone number', 400));
    }

    // Verify OTP against local DB (scope to phone_update purpose + unverified)
    const otpRecord = await OTP.findOne({ phone: phoneMatchQuery(phone, rawPhone), purpose: 'phone_update', verified: false });

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

    await OTP.deleteOne({ _id: otpRecord._id });

    // Update user's phone number (always store in E.164)
    const user = await User.findById(userId);
    if (!user) {
        return next(new AppError('User not found', 404));
    }

    user.phone = phone;
    user.isPhoneVerified = true;
    user.isVerified = true;
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

// @desc    Send email verification code (authenticated — for adding/updating email)
// @route   POST /api/auth/email/send-code
const sendEmailCode = catchAsync(async (req, res, next) => {
    const { email } = req.body;
    const userId = req.user.id;

    if (!email) {
        return next(new AppError('Email is required', 400));
    }

    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(email)) {
        return next(new AppError('Please provide a valid email address', 400));
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if email is already used by another user
    const existingUser = await User.findOne({ email: normalizedEmail, _id: { $ne: userId } });
    if (existingUser) {
        return next(new AppError('This email is already registered to another account', 400));
    }

    // Block re-verification if user already has this email verified
    const currentUser = await User.findById(userId).select('email isVerified firstName preferredLanguage').lean();
    if (currentUser && currentUser.email === normalizedEmail && currentUser.isVerified) {
        return next(new AppError('This email is already verified', 400));
    }

    // Delete any existing codes for this email + user
    await EmailOTP.deleteMany({ email: normalizedEmail, userId });

    const code = generateEmailCode();
    await EmailOTP.create({
        email: normalizedEmail,
        code,
        userId,
        purpose: 'update',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
    });

    const lang = currentUser?.preferredLanguage || 'en';
    await emailService.sendVerificationEmail(normalizedEmail, currentUser?.firstName, code, lang);

    res.status(200).json({
        success: true,
        message: 'Verification code sent to your email',
    });
});

// @desc    Verify email code and update email (authenticated)
// @route   POST /api/auth/email/verify-code
const verifyEmailCode = catchAsync(async (req, res, next) => {
    const { email, code } = req.body;
    const userId = req.user.id;

    if (!email || !code) {
        return next(new AppError('Email and verification code are required', 400));
    }

    const normalizedEmail = email.toLowerCase().trim();

    const record = await EmailOTP.findOne({ email: normalizedEmail, userId, purpose: 'update' });

    if (!record) {
        return next(new AppError('Verification code not found. Please request a new one', 400));
    }
    if (record.expiresAt < new Date()) {
        await EmailOTP.deleteOne({ _id: record._id });
        return next(new AppError('Verification code has expired. Please request a new one', 400));
    }
    if (record.attempts >= 5) {
        await EmailOTP.deleteOne({ _id: record._id });
        return next(new AppError('Too many failed attempts. Please request a new code', 400));
    }

    const codeMatches = await record.compareCode(code);
    if (!codeMatches) {
        record.attempts += 1;
        await record.save();
        return next(new AppError('Invalid verification code', 400));
    }

    await EmailOTP.deleteOne({ _id: record._id });

    // Re-check uniqueness (race-condition guard)
    const existingUser = await User.findOne({ email: normalizedEmail, _id: { $ne: userId } });
    if (existingUser) {
        return next(new AppError('This email is already registered to another account', 400));
    }

    const user = await User.findById(userId);
    if (!user) {
        return next(new AppError('User not found', 404));
    }

    user.email = normalizedEmail;
    user.isVerified = true;
    await user.save();

    res.status(200).json({
        success: true,
        message: 'Email verified and updated successfully',
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
                createdAt: user.createdAt,
            },
        },
    });
});

// @desc    Send email verification code for a brand-new registration
//         (unauthenticated — called before the user exists in the DB)
// @route   POST /api/auth/email/send-verification
const sendEmailVerification = catchAsync(async (req, res, next) => {
    const { email, language } = req.body;

    if (!email) {
        return next(new AppError('Email is required', 400));
    }

    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(email)) {
        return next(new AppError('Please provide a valid email address', 400));
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Reject if a local account already exists for this email. OAuth accounts
    // (google/apple/phone) are allowed to re-verify and link a password later.
    const existingLocal = await User.findOne({ email: normalizedEmail, provider: 'local' })
        .select('_id')
        .lean();
    if (existingLocal) {
        return next(new AppError('This email is already registered', 400));
    }

    // Clear any prior pre-registration OTPs for this email
    await EmailOTP.deleteMany({ email: normalizedEmail, userId: null, purpose: 'verification' });

    const code = generateEmailCode();
    await EmailOTP.create({
        email: normalizedEmail,
        code,
        userId: null,
        purpose: 'verification',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
    });

    const lang = (language === 'ka' || language === 'en') ? language : 'en';
    await emailService.sendVerificationEmail(normalizedEmail, null, code, lang);

    res.status(200).json({
        success: true,
        message: 'Verification code sent to your email',
    });
});

// @desc    Verify email code for a pending registration. Marks the OTP row
//          as `verified=true` and keeps it alive for a short grace window so
//          the subsequent /auth/register call can confirm the email was
//          verified (without having to re-send a code).
// @route   POST /api/auth/email/verify-registration
const verifyEmailForRegistration = catchAsync(async (req, res, next) => {
    const { email, code } = req.body;

    if (!email || !code) {
        return next(new AppError('Email and verification code are required', 400));
    }

    const normalizedEmail = email.toLowerCase().trim();

    const record = await EmailOTP.findOne({
        email: normalizedEmail,
        userId: null,
        purpose: 'verification',
    });

    if (!record) {
        return next(new AppError('Verification code not found. Please request a new one', 400));
    }
    if (record.expiresAt < new Date()) {
        await EmailOTP.deleteOne({ _id: record._id });
        return next(new AppError('Verification code has expired. Please request a new one', 400));
    }
    if (record.attempts >= 5) {
        await EmailOTP.deleteOne({ _id: record._id });
        return next(new AppError('Too many failed attempts. Please request a new code', 400));
    }

    const codeMatches = await record.compareCode(code);
    if (!codeMatches) {
        record.attempts += 1;
        await record.save();
        return next(new AppError('Invalid verification code', 400));
    }

    // Mark verified and extend lifetime to 30 minutes so the follow-up
    // /auth/register call has enough time to complete the form.
    record.verified = true;
    record.expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    await record.save();

    res.status(200).json({
        success: true,
        message: 'Email verified successfully',
    });
});

// @desc    Send phone OTP for a brand-new registration (unauthenticated).
//          Separate from /auth/phone/send-otp (which is the passenger login
//          flow and would create a user on verify) — this one only verifies
//          ownership of the phone so the subsequent /auth/register call can
//          create the user atomically with isPhoneVerified=true.
// @route   POST /api/auth/phone/send-registration-otp
const sendRegistrationPhoneOtp = catchAsync(async (req, res, next) => {
    const { phone: rawPhone } = req.body;

    if (!rawPhone) {
        return next(new AppError('Phone number is required', 400));
    }

    const phone = normalizePhone(rawPhone);
    if (!phone) {
        return next(new AppError('Please provide a valid phone number', 400));
    }

    // Role-aware duplicate check: reject only if another driver already owns
    // this phone. A plain passenger with the same phone is allowed (same real
    // person is signing up for the driver app — see commit 1a176d4).
    //
    // Privacy: when we reject, we return a generic OTP-sent response instead
    // of "already registered to another driver". Revealing the phone→driver
    // mapping would let an attacker enumerate the driver fleet via this
    // endpoint. The downstream /register call still rejects the duplicate
    // phone, so UX is preserved for legitimate users who don't try to reuse
    // someone else's number.
    const phoneQuery = phoneMatchQuery(phone, rawPhone);
    const usersWithPhone = await User.find({ phone: phoneQuery }).select('_id').lean();
    let phoneAlreadyOwnedByDriver = false;
    if (usersWithPhone.length > 0) {
        const existingDriver = await Driver.findOne({
            user: { $in: usersWithPhone.map(u => u._id) },
        }).select('_id').lean();
        phoneAlreadyOwnedByDriver = !!existingDriver;
    }
    if (phoneAlreadyOwnedByDriver) {
        return res.status(200).json({
            success: true,
            message: 'If the number is eligible, an OTP has been sent'
        });
    }

    // Clear any prior pre-registration OTPs for this phone
    await OTP.deleteMany({ phone: phoneQuery, purpose: 'registration' });

    const otpCode = generateOTP();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    const otpRow = await OTP.create({ phone, code: otpCode, purpose: 'registration', expiresAt });

    try {
        await sendVerification(phone, otpCode);
    } catch (smsErr) {
        await OTP.deleteOne({ _id: otpRow._id }).catch(() => {});
        console.error('sendRegistrationPhoneOtp: SMS delivery failed', smsErr);
        return next(new AppError('Unable to send verification code right now. Please try again in a moment.', 503));
    }

    res.status(200).json({
        success: true,
        message: 'If the number is eligible, an OTP has been sent'
    });
});

// @desc    Verify phone OTP for a pending registration. Marks the OTP row as
//          verified and extends its lifetime to 30 minutes so the follow-up
//          /auth/register call can confirm the phone was verified.
// @route   POST /api/auth/phone/verify-registration-otp
const verifyRegistrationPhoneOtp = catchAsync(async (req, res, next) => {
    const { phone: rawPhone, code } = req.body;

    if (!rawPhone || !code) {
        return next(new AppError('Phone number and OTP code are required', 400));
    }

    const phone = normalizePhone(rawPhone);
    if (!phone) {
        return next(new AppError('Please provide a valid phone number', 400));
    }

    const phoneQuery = phoneMatchQuery(phone, rawPhone);

    const otpRecord = await OTP.findOne({
        phone: phoneQuery,
        purpose: 'registration',
        verified: false,
    });

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

    // Mark verified and extend lifetime to 30 minutes so the follow-up
    // /auth/register call has enough time to complete.
    otpRecord.verified = true;
    otpRecord.expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    await otpRecord.save();

    res.status(200).json({
        success: true,
        message: 'Phone verified successfully',
    });
});

// @desc    Register a new local (email/password) account. Requires that both
//          the email and the phone were previously verified via the
//          /auth/email/verify-registration and /auth/phone/verify-registration-otp
//          endpoints. The user is only written to the DB after BOTH are
//          verified, so a failed phone verification leaves no orphan records.
// @route   POST /api/auth/register
const register = catchAsync(async (req, res, next) => {
    const { email, password, firstName, lastName, phone: rawPhone } = req.body;

    if (!email || !password || !firstName || !lastName || !rawPhone) {
        return next(new AppError('Email, password, first name, last name, and phone are required', 400));
    }

    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(email)) {
        return next(new AppError('Please provide a valid email address', 400));
    }
    if (password.length < 8) {
        return next(new AppError('Password must be at least 8 characters', 400));
    }
    if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
        return next(new AppError('Password must contain at least one uppercase letter, one lowercase letter, and one number', 400));
    }

    const normalizedEmail = email.toLowerCase().trim();
    const phone = normalizePhone(rawPhone);
    if (!phone) {
        return next(new AppError('Please provide a valid phone number', 400));
    }

    // Require a verified, unexpired pre-registration OTP for this email
    const otpRecord = await EmailOTP.findOne({
        email: normalizedEmail,
        userId: null,
        purpose: 'verification',
        verified: true,
    });
    if (!otpRecord || otpRecord.expiresAt < new Date()) {
        if (otpRecord) await EmailOTP.deleteOne({ _id: otpRecord._id });
        return next(new AppError('Email not verified. Please verify your email before registering', 400));
    }

    // Race-condition guard: reject if a local account was created in the
    // interim (e.g. between verification and register).
    const existingLocal = await User.findOne({ email: normalizedEmail, provider: 'local' })
        .select('_id')
        .lean();
    if (existingLocal) {
        await EmailOTP.deleteOne({ _id: otpRecord._id });
        return next(new AppError('This email is already registered', 400));
    }

    // Require a verified, unexpired pre-registration phone OTP. This is the
    // atomic guarantee that the phone belongs to the caller — we only write
    // the user to the DB once BOTH email and phone are proven. A failed phone
    // verification at the previous step therefore leaves no orphan user.
    const phoneQuery = phoneMatchQuery(phone, rawPhone);
    const phoneOtpRecord = await OTP.findOne({
        phone: phoneQuery,
        purpose: 'registration',
        verified: true,
    });
    if (!phoneOtpRecord || phoneOtpRecord.expiresAt < new Date()) {
        if (phoneOtpRecord) await OTP.deleteOne({ _id: phoneOtpRecord._id });
        return next(new AppError('Phone not verified. Please verify your phone before registering', 400));
    }

    // Phone duplicate policy: a driver signing up is allowed to reuse a phone
    // that already belongs to a plain passenger account (same real person who
    // previously signed up via phone OTP). They must NOT reuse a phone that
    // already has a Driver profile linked to it — that would let someone take
    // over another driver's identity. See commit 1a176d4.
    const usersWithPhone = await User.find({ phone: phoneQuery }).select('_id').lean();
    if (usersWithPhone.length > 0) {
        const existingDriver = await Driver.findOne({
            user: { $in: usersWithPhone.map(u => u._id) },
        }).select('_id').lean();
        if (existingDriver) {
            await EmailOTP.deleteOne({ _id: otpRecord._id });
            await OTP.deleteOne({ _id: phoneOtpRecord._id });
            return next(new AppError('This phone number is already registered to another driver', 400));
        }
    }

    const user = await User.create({
        email: normalizedEmail,
        password,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone,
        provider: 'local',
        isVerified: true,        // email verified via OTP
        isPhoneVerified: true,   // phone verified via OTP in the same flow
        role: 'user',            // driver role only granted after admin approval
    });

    await EmailOTP.deleteOne({ _id: otpRecord._id });
    await OTP.deleteOne({ _id: phoneOtpRecord._id });

    analytics.trackEvent(user._id, analytics.EVENTS.ACCOUNT_LOGGED_IN, { provider: 'local', registered: true });

    sendTokenResponse(user, 201, res, 'Registration successful', true);
});

// @desc    Schedule account deletion (30-day grace period)
// @route   DELETE /api/auth/account
//
// For local-auth accounts the caller must supply their current password so the
// action cannot be triggered by a stolen JWT alone.
// OAuth/phone accounts only need the authenticated session (token is enough).
//
// What happens immediately (grace period, NOT hard-delete):
//   1. Active/pending rides are cancelled and drivers are notified via socket.
//   2. Completed rides are anonymised (PII removed, kept for analytics).
//   3. If the user is a driver: driver marked inactive + offline.
//   4. Push-notification device tokens are cleared.
//   5. User is marked isDeleted=true + deletionScheduledAt=now+30days.
//   6. Auth cache is invalidated so future requests are rejected immediately.
//   7. A socket event forces any connected clients to sign out.
//
// Hard-delete happens when a scheduled job (or admin tooling) finds records
// where deletionScheduledAt <= now. That job should delete the User document
// and the Driver document (if any).  A cancel endpoint lets users reverse the
// decision during the grace period.
const deleteAccount = catchAsync(async (req, res, next) => {
    const userId = req.user.id;
    const { password } = req.body;

    // Fetch the full document (not lean) so we can call .save() and comparePassword()
    const user = await User.findById(userId);
    if (!user) {
        return next(new AppError('User not found', 404));
    }

    // Local accounts require password confirmation to prevent account takeover
    // via a stolen JWT.
    if (user.provider === 'local') {
        if (!password) {
            return next(new AppError('Password confirmation is required to delete a local account', 400));
        }
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return next(new AppError('Incorrect password', 401));
        }
    }

    const io = req.app.get('io');

    // --- 1. Cancel active / pending rides ---
    // Statuses that represent an in-flight ride the passenger still has open.
    const activeStatuses = ['pending', 'accepted', 'driver_arrived', 'in_progress'];
    const activeRides = await Ride.find({ user: userId, status: { $in: activeStatuses } });

    for (const ride of activeRides) {
        ride.status = 'cancelled';
        ride.cancelledBy = 'user';
        ride.cancellationReason = 'other';
        ride.cancellationNote = 'Account deleted by user';
        await ride.save({ validateBeforeSave: false });

        // Cancel any pending offers for this ride so drivers aren't shown ghost rides
        await RideOffer.updateMany(
            { ride: ride._id, status: 'pending' },
            { status: 'superseded', respondedAt: new Date() }
        );

        // Notify the assigned driver (if any) that the ride is gone
        if (ride.driver && io) {
            // driver.user is the User ID; ride.driver is the Driver document ID.
            // We use the Driver model to resolve the user ID for the socket room.
            const driverDoc = await Driver.findById(ride.driver).select('user').lean();
            if (driverDoc) {
                io.to(`driver:${driverDoc.user}`).emit('ride:cancelled', {
                    rideId: ride._id,
                    reason: 'Passenger account deleted'
                });
            }
        }
    }

    // --- 2. Anonymise completed rides (keep for analytics) ---
    await Ride.updateMany(
        { user: userId, status: 'completed' },
        {
            $set: {
                passengerName: 'Deleted User',
                passengerPhone: ''
            }
        }
    );

    // --- 3. Deactivate driver profile (if user is also a driver) ---
    const driverDoc = await Driver.findOne({ user: userId });
    if (driverDoc) {
        driverDoc.isActive = false;
        driverDoc.status = 'offline';
        await driverDoc.save({ validateBeforeSave: false });
        invalidateDriver(userId);

        if (io) {
            // Remove the driver from the online pool visible to the admin dashboard
            io.to('admin').emit('driver:statusChanged', {
                driverId: driverDoc._id,
                status: 'offline',
                isActive: false
            });
        }
    }

    // --- 4. Clear device tokens (stop push notifications during grace period) ---
    user.deviceTokens = [];

    // --- 5. Soft-delete: mark for deletion, disable account immediately ---
    const GRACE_PERIOD_DAYS = 30;
    user.isDeleted = true;
    user.deletionScheduledAt = new Date(Date.now() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);
    await user.save({ validateBeforeSave: false });

    // --- 6. Invalidate auth cache + revoke all tokens ---
    invalidateUser(userId);
    const { revokeAllUserTokens } = require('../utils/tokenBlocklist');
    await revokeAllUserTokens(userId).catch(() => {});

    // --- 7. Force-disconnect connected socket clients ---
    if (io) {
        io.to(`user:${userId}`).emit('account:deleted', {
            message: 'Your account has been scheduled for deletion. You have been signed out.',
            deletionScheduledAt: user.deletionScheduledAt
        });
    }

    // Clear the auth cookie so the browser session ends immediately
    res.cookie('token', '', {
        ...cookieOptions,
        expires: new Date(0),
        maxAge: 0
    });

    analytics.trackEvent(userId, analytics.EVENTS.ACCOUNT_DELETED, { gracePeriodDays: GRACE_PERIOD_DAYS });

    res.status(200).json({
        success: true,
        message: `Your account has been scheduled for deletion. You have ${GRACE_PERIOD_DAYS} days to cancel this request. All active rides have been cancelled.`,
        deletionScheduledAt: user.deletionScheduledAt
    });
});

// @desc    Cancel a scheduled account deletion (within the 30-day grace period)
// @route   DELETE /api/auth/account/cancel
//
// Note: The protect middleware rejects isDeleted accounts, so the user must
// supply their token BEFORE the grace period expires.  We re-enable the account
// only when deletionScheduledAt is still in the future.
const cancelAccountDeletion = catchAsync(async (req, res, next) => {
    const userId = req.user.id;
    const { password } = req.body;

    // protect middleware already rejects isDeleted users, but we look up the raw
    // document here in case someone bypasses cache (belt-and-suspenders).
    const user = await User.findById(userId);
    if (!user) {
        return next(new AppError('User not found', 404));
    }

    if (!user.isDeleted || !user.deletionScheduledAt) {
        return next(new AppError('No pending account deletion found for this account', 400));
    }

    if (user.deletionScheduledAt <= new Date()) {
        return next(new AppError('The deletion grace period has expired. This account can no longer be recovered.', 410));
    }

    // Symmetry with deleteAccount: local-auth accounts require password to
    // un-delete. Without this check, a stolen JWT issued before the deletion
    // request could quietly revert a legitimate deletion.
    if (user.provider === 'local') {
        if (!password) {
            return next(new AppError('Password confirmation is required to cancel deletion', 400));
        }
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return next(new AppError('Incorrect password', 401));
        }
    }

    // Restore the account
    user.isDeleted = false;
    user.deletionScheduledAt = null;
    await user.save({ validateBeforeSave: false });

    // Re-activate driver profile if one exists
    const driverDoc = await Driver.findOne({ user: userId });
    if (driverDoc) {
        driverDoc.isActive = true;
        await driverDoc.save({ validateBeforeSave: false });
        invalidateDriver(userId);
    }

    // Invalidate the stale cache entry so the restored user can log in immediately
    invalidateUser(userId);

    res.status(200).json({
        success: true,
        message: 'Account deletion has been cancelled. Your account has been fully restored.'
    });
});

// @desc    Send OTP for password reset (unauthenticated — by phone number)
// @route   POST /api/auth/forgot-password/send-otp
const forgotPasswordSendOtp = catchAsync(async (req, res, next) => {
    const { phone: rawPhone } = req.body;

    if (!rawPhone) {
        return next(new AppError('Phone number is required', 400));
    }

    const phone = normalizePhone(rawPhone);
    if (!phone) {
        return next(new AppError('Please provide a valid phone number', 400));
    }

    // Check that a user with this phone exists and has a password (local provider).
    // Filter by provider in the query itself — otherwise, if a passenger account
    // (provider: 'phone') shares the same phone number as a driver (provider:
    // 'local'), findOne may return the passenger and we silently no-op.
    const user = await User.findOne({ phone: phoneMatchQuery(phone, rawPhone), provider: 'local' });
    if (!user) {
        // Don't reveal whether the phone exists — always return success
        return res.status(200).json({
            success: true,
            message: 'If an account exists with this phone number, an OTP has been sent'
        });
    }

    // Account lockout check
    if (user.lockUntil && user.lockUntil > new Date()) {
        const minutesLeft = Math.ceil((user.lockUntil - new Date()) / 60000);
        return next(new AppError(`Account locked. Try again in ${minutesLeft} minutes`, 423));
    }

    // Delete any existing password-reset OTP for this phone
    await OTP.deleteMany({ phone: phoneMatchQuery(phone, rawPhone), purpose: 'password_reset' });

    // Persist the OTP row BEFORE attempting SMS delivery. If the SMS send hangs,
    // times out, or fails, we roll back the row so the user can retry cleanly
    // and never ends up with a stored code they never received.
    const otpCode = generateOTP();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    const otpRow = await OTP.create({ phone, code: otpCode, purpose: 'password_reset', expiresAt });

    try {
        await sendVerification(phone, otpCode);
    } catch (smsErr) {
        await OTP.deleteOne({ _id: otpRow._id }).catch(() => {});
        console.error('forgotPasswordSendOtp: SMS delivery failed', smsErr);
        return next(new AppError('Unable to send verification code right now. Please try again in a moment.', 503));
    }

    res.status(200).json({
        success: true,
        message: 'If an account exists with this phone number, an OTP has been sent'
    });
});

// @desc    Verify OTP and reset password (unauthenticated)
// @route   POST /api/auth/forgot-password/reset
const forgotPasswordReset = catchAsync(async (req, res, next) => {
    const { phone: rawPhone, code, newPassword } = req.body;

    if (!rawPhone || !code || !newPassword) {
        return next(new AppError('Phone, OTP code, and new password are required', 400));
    }

    if (newPassword.length < 8) {
        return next(new AppError('Password must be at least 8 characters', 400));
    }
    if (!/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword) || !/\d/.test(newPassword)) {
        return next(new AppError('Password must contain at least one uppercase letter, one lowercase letter, and one number', 400));
    }

    const phone = normalizePhone(rawPhone);
    if (!phone) {
        return next(new AppError('Please provide a valid phone number', 400));
    }

    const phoneQuery = phoneMatchQuery(phone, rawPhone);

    // Look up user by normalized or legacy raw phone form
    const user = await User.findOne({ phone: phoneQuery, provider: 'local' });
    if (!user) {
        // Don't reveal whether the phone exists — use the same generic error
        return next(new AppError('Invalid OTP or phone number', 400));
    }

    if (user.lockUntil && user.lockUntil > new Date()) {
        const minutesLeft = Math.ceil((user.lockUntil - new Date()) / 60000);
        return next(new AppError(`Account locked. Try again in ${minutesLeft} minutes`, 423));
    }

    const otpRecord = await OTP.findOne({ phone: phoneQuery, purpose: 'password_reset', verified: false });
    if (!otpRecord) {
        return next(new AppError('OTP not found. Please request a new code', 400));
    }
    if (otpRecord.expiresAt < new Date()) {
        await OTP.deleteOne({ _id: otpRecord._id });
        return next(new AppError('OTP has expired. Please request a new code', 400));
    }
    if (otpRecord.attempts >= 3) {
        await OTP.deleteOne({ _id: otpRecord._id });
        user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 3;
        user.lockUntil = new Date(Date.now() + 30 * 60 * 1000);
        await user.save({ validateBeforeSave: false });
        return next(new AppError('Too many failed attempts. Please request a new code', 400));
    }

    const codeMatches = await otpRecord.compareCode(code);
    if (!codeMatches) {
        otpRecord.attempts += 1;
        await otpRecord.save();
        return next(new AppError('Invalid OTP code', 400));
    }

    await OTP.deleteOne({ _id: otpRecord._id });

    // Migrate legacy non-E.164 phone to canonical form so full-document
    // validation on save() doesn't reject the stored value.
    if (!isE164(user.phone)) {
        user.phone = phone;
    }

    // Update password
    user.password = newPassword;
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    await user.save();

    // Revoke all existing tokens so user must log in with the new password
    const { revokeAllUserTokens } = require('../utils/tokenBlocklist');
    await revokeAllUserTokens(user._id).catch(() => {});
    invalidateUser(user._id);

    res.status(200).json({
        success: true,
        message: 'Password reset successful. Please login with your new password'
    });
});

module.exports = {
    login,
    logout,
    getMe,
    sendPhoneOtp,
    verifyPhoneOtp,
    completeOnboarding,
    sendPhoneUpdateOtp,
    verifyPhoneUpdateOtp,
    sendEmailCode,
    verifyEmailCode,
    sendEmailVerification,
    verifyEmailForRegistration,
    sendRegistrationPhoneOtp,
    verifyRegistrationPhoneOtp,
    register,
    updateProfile,
    deleteAccount,
    cancelAccountDeletion,
    forgotPasswordSendOtp,
    forgotPasswordReset
};
