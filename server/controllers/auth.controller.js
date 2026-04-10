const User = require('../models/user.model');
const Driver = require('../models/driver.model');
const Ride = require('../models/ride.model');
const RideOffer = require('../models/rideOffer.model');
const OTP = require('../models/otp.model');
const { generateToken, verifyToken } = require('../utils/jwt.utils');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const { sendVerification } = require('../services/sms.service');
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

    // Delete any existing OTP for this phone (both forms, to clean up legacy rows)
    await OTP.deleteMany({ phone: phoneMatchQuery(phone, rawPhone) });

    // Send OTP via SMSOffice (or dev fallback)
    const result = await sendVerification(phone);

    // Store OTP locally (code comes back from sendVerification in all modes)
    const otpCode = result.devCode || result.code;
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    await OTP.create({ phone, code: otpCode, expiresAt });

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

    // Check if phone is already used by another user (either normalized or legacy raw form)
    const existingUser = await User.findOne({
        phone: phoneMatchQuery(phone, rawPhone),
        _id: { $ne: userId }
    });
    if (existingUser) {
        return next(new AppError('This phone number is already registered to another account', 400));
    }

    // Delete any existing OTP for this phone
    await OTP.deleteMany({ phone: phoneMatchQuery(phone, rawPhone) });

    // Send OTP via SMSOffice (or dev fallback)
    const result = await sendVerification(phone);

    // Store OTP locally
    const otpCode = result.devCode || result.code;
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    await OTP.create({ phone, code: otpCode, expiresAt });

    res.status(200).json({
        success: true,
        message: 'OTP sent successfully'
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

    // Verify OTP against local DB
    const otpRecord = await OTP.findOne({ phone: phoneMatchQuery(phone, rawPhone) });

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

    // Check that a user with this phone exists and has a password (local provider)
    // Look up both normalized and raw form to handle legacy records.
    const user = await User.findOne({ phone: phoneMatchQuery(phone, rawPhone) });
    if (!user || user.provider !== 'local') {
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

    const result = await sendVerification(phone);
    const otpCode = result.devCode || result.code;
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    await OTP.create({ phone, code: otpCode, purpose: 'password_reset', expiresAt });

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
        return next(new AppError('Invalid phone number', 400));
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
    updateProfile,
    deleteAccount,
    cancelAccountDeletion,
    forgotPasswordSendOtp,
    forgotPasswordReset
};
