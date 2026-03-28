/**
 * Favorite Locations Controller
 *
 * Users can save up to 10 frequently-used locations (home, work, custom).
 * These are surfaced in the booking flow for one-tap address selection.
 */

'use strict';

const FavoriteLocation = require('../models/favoriteLocation.model');
const { MAX_FAVORITES } = require('../models/favoriteLocation.model');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const analytics = require('../services/analytics.service');

// ---------------------------------------------------------------------------
// Controllers
// ---------------------------------------------------------------------------

// @desc    Add a favorite location
// @route   POST /api/favorites
// @access  Private
const addFavorite = catchAsync(async (req, res, next) => {
    const userId = req.user._id || req.user.id;
    const { label, address, lat, lng, icon } = req.body;

    if (!label || !address || lat == null || lng == null) {
        return next(new AppError('label, address, lat, and lng are required', 400));
    }

    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);

    if (isNaN(latNum) || latNum < -90 || latNum > 90) {
        return next(new AppError('lat must be a number between -90 and 90', 400));
    }
    if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
        return next(new AppError('lng must be a number between -180 and 180', 400));
    }

    const existingCount = await FavoriteLocation.countDocuments({ user: userId });
    if (existingCount >= MAX_FAVORITES) {
        return next(new AppError(`You can only save up to ${MAX_FAVORITES} favorite locations`, 400));
    }

    const favorite = await FavoriteLocation.create({
        user: userId,
        label: label.trim(),
        address: address.trim(),
        lat: latNum,
        lng: lngNum,
        icon: icon ? icon.trim() : 'star'
    });

    analytics.trackEvent(userId, analytics.EVENTS.FAVOURITE_ADDED, { label: favorite.label });

    res.status(201).json({
        success: true,
        data: { favorite }
    });
});

// @desc    List the authenticated user's favorite locations
// @route   GET /api/favorites
// @access  Private
const getFavorites = catchAsync(async (req, res) => {
    const userId = req.user._id || req.user.id;

    const favorites = await FavoriteLocation.find({ user: userId })
        .sort({ createdAt: -1 })
        .lean();

    res.json({
        success: true,
        count: favorites.length,
        data: { favorites }
    });
});

// @desc    Update a favorite location
// @route   PATCH /api/favorites/:id
// @access  Private
const updateFavorite = catchAsync(async (req, res, next) => {
    const userId = req.user._id || req.user.id;

    const favorite = await FavoriteLocation.findOne({ _id: req.params.id, user: userId });
    if (!favorite) {
        return next(new AppError('Favorite location not found', 404));
    }

    const { label, address, lat, lng, icon } = req.body;

    if (label !== undefined) favorite.label = label.trim();
    if (address !== undefined) favorite.address = address.trim();
    if (icon !== undefined) favorite.icon = icon.trim();

    if (lat !== undefined) {
        const latNum = parseFloat(lat);
        if (isNaN(latNum) || latNum < -90 || latNum > 90) {
            return next(new AppError('lat must be a number between -90 and 90', 400));
        }
        favorite.lat = latNum;
    }

    if (lng !== undefined) {
        const lngNum = parseFloat(lng);
        if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
            return next(new AppError('lng must be a number between -180 and 180', 400));
        }
        favorite.lng = lngNum;
    }

    await favorite.save();

    res.json({
        success: true,
        data: { favorite }
    });
});

// @desc    Delete a favorite location
// @route   DELETE /api/favorites/:id
// @access  Private
const deleteFavorite = catchAsync(async (req, res, next) => {
    const userId = req.user._id || req.user.id;

    const favorite = await FavoriteLocation.findOneAndDelete({ _id: req.params.id, user: userId });
    if (!favorite) {
        return next(new AppError('Favorite location not found', 404));
    }

    res.json({
        success: true,
        message: 'Favorite location deleted'
    });
});

module.exports = { addFavorite, getFavorites, updateFavorite, deleteFavorite };
