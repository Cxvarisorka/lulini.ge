const { Expo } = require('expo-server-sdk');
const User = require('../models/user.model');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

// @desc    Register device push token
// @route   POST /api/notifications/register-token
// @access  Private
const registerToken = catchAsync(async (req, res, next) => {
    const { token, platform, language } = req.body;

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
    if (language && ['en', 'es', 'ru', 'ka'].includes(language)) {
        updateFields.preferredLanguage = language;
    }

    // Remove existing entry for this token (if switching devices/re-registering)
    // then add the new one — atomic upsert
    await User.updateOne(
        { _id: req.user.id },
        {
            $pull: { deviceTokens: { token } },
            ...Object.keys(updateFields).length > 0 ? { $set: updateFields } : {}
        }
    );

    await User.updateOne(
        { _id: req.user.id },
        { $push: { deviceTokens: { token, platform } } }
    );

    // Also remove this token from any other user (device changed owner)
    await User.updateMany(
        { _id: { $ne: req.user.id }, 'deviceTokens.token': token },
        { $pull: { deviceTokens: { token } } }
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
