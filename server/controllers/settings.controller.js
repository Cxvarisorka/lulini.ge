const Settings = require('../models/settings.model');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

const VALID_CATEGORIES = ['economy', 'comfort', 'business', 'van', 'minibus'];

// GET /api/settings/pricing — public (mobile app needs this)
const getPricing = catchAsync(async (req, res) => {
    const pricing = await Settings.getPricing();
    res.json({
        success: true,
        data: {
            commissionPercent: pricing.commissionPercent,
            categories: pricing.categories
        }
    });
});

// PUT /api/settings/pricing — admin only
const updatePricing = catchAsync(async (req, res, next) => {
    const { commissionPercent, categories } = req.body;

    if (commissionPercent == null || !categories) {
        return next(new AppError('commissionPercent and categories are required', 400));
    }

    if (commissionPercent < 0 || commissionPercent > 100) {
        return next(new AppError('Commission must be between 0 and 100', 400));
    }

    for (const cat of VALID_CATEGORIES) {
        if (!categories[cat] || categories[cat].basePrice == null || categories[cat].kmPrice == null) {
            return next(new AppError(`basePrice and kmPrice are required for ${cat}`, 400));
        }
        if (categories[cat].basePrice < 0 || categories[cat].kmPrice < 0) {
            return next(new AppError(`Prices cannot be negative for ${cat}`, 400));
        }
    }

    const pricing = await Settings.findOneAndUpdate(
        { key: 'pricing' },
        { commissionPercent, categories },
        { new: true, upsert: true, runValidators: true }
    );

    res.json({
        success: true,
        data: {
            commissionPercent: pricing.commissionPercent,
            categories: pricing.categories
        }
    });
});

module.exports = { getPricing, updatePricing };
