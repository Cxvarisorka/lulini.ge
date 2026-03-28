const { Expo } = require('expo-server-sdk');
const User = require('../models/user.model');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

// @desc    Register device push token
// @route   POST /api/notifications/register-token
// @access  Private
const registerToken = catchAsync(async (req, res, next) => {
    const { token, platform, language, app } = req.body;

    if (!token || !platform) {
        return next(new AppError('Token and platform are required', 400));
    }

    if (!['ios', 'android'].includes(platform)) {
        return next(new AppError('Platform must be ios or android', 400));
    }

    if (!Expo.isExpoPushToken(token)) {
        return next(new AppError('Invalid Expo push token', 400));
    }

    const updateFields = {};

    // Update preferred language if provided
    if (language && ['en', 'ka'].includes(language)) {
        updateFields.preferredLanguage = language;
    }

    // Step 1: Remove token from this user + all other users in parallel
    // (different documents, no conflict)
    await Promise.all([
        User.updateOne(
            { _id: req.user.id },
            {
                $pull: { deviceTokens: { token } },
                ...Object.keys(updateFields).length > 0 ? { $set: updateFields } : {}
            }
        ),
        User.updateMany(
            { _id: { $ne: req.user.id }, 'deviceTokens.token': token },
            { $pull: { deviceTokens: { token } } }
        )
    ]);

    // Step 2: Add new token (must wait for $pull to complete on same doc)
    await User.updateOne(
        { _id: req.user.id },
        { $push: { deviceTokens: { token, platform, app: app || 'passenger' } } }
    );

    res.status(200).json({
        success: true,
        message: 'Push token registered successfully'
    });
});

// @desc    Unregister device push token (on logout)
// @route   POST /api/notifications/unregister-token
// @access  Private
const unregisterToken = catchAsync(async (req, res, next) => {
    const { token } = req.body;

    if (!token) {
        return next(new AppError('Token is required', 400));
    }

    await User.updateOne(
        { _id: req.user.id },
        { $pull: { deviceTokens: { token } } }
    );

    res.status(200).json({
        success: true,
        message: 'Push token unregistered successfully'
    });
});

module.exports = { registerToken, unregisterToken };
