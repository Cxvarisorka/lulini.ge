const Settings = require('../models/settings.model');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

// GET /api/settings/pricing — public (mobile app needs this)
const getPricing = catchAsync(async (req, res) => {
    const pricing = await Settings.getPricing();
    res.json({
        success: true,
        data: {
            basePrice: pricing.basePrice,
            kmPrice: pricing.kmPrice,
            commissionPercent: pricing.commissionPercent
        }
    });
});

// PUT /api/settings/pricing — admin only
const updatePricing = catchAsync(async (req, res, next) => {
    const { basePrice, kmPrice, commissionPercent } = req.body;

    if (basePrice == null || kmPrice == null || commissionPercent == null) {
        return next(new AppError('basePrice, kmPrice, and commissionPercent are required', 400));
    }

    if (basePrice < 0 || kmPrice < 0) {
        return next(new AppError('Prices cannot be negative', 400));
    }

    if (commissionPercent < 0 || commissionPercent > 100) {
        return next(new AppError('Commission must be between 0 and 100', 400));
    }

    const pricing = await Settings.findOneAndUpdate(
        { key: 'pricing' },
        { basePrice, kmPrice, commissionPercent },
        { new: true, upsert: true, runValidators: true }
    );

    res.json({
        success: true,
        data: {
            basePrice: pricing.basePrice,
            kmPrice: pricing.kmPrice,
            commissionPercent: pricing.commissionPercent
        }
    });
});

module.exports = { getPricing, updatePricing };
