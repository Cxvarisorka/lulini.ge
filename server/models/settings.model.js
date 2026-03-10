const mongoose = require('mongoose');

const categoryPricingSchema = new mongoose.Schema({
    basePrice: { type: Number, required: true, min: 0 },
    kmPrice: { type: Number, required: true, min: 0 }
}, { _id: false });

const DEFAULT_CATEGORIES = {
    economy: { basePrice: 5, kmPrice: 1.5 },
    comfort: { basePrice: 7.5, kmPrice: 2.25 },
    business: { basePrice: 10, kmPrice: 3 },
    van: { basePrice: 7.5, kmPrice: 2.25 },
    minibus: { basePrice: 10, kmPrice: 3 }
};

const settingsSchema = new mongoose.Schema({
    key: {
        type: String,
        required: true,
        unique: true,
        enum: ['pricing']
    },
    commissionPercent: {
        type: Number,
        required: true,
        default: 15,
        min: 0,
        max: 100
    },
    categories: {
        economy: { type: categoryPricingSchema, default: () => DEFAULT_CATEGORIES.economy },
        comfort: { type: categoryPricingSchema, default: () => DEFAULT_CATEGORIES.comfort },
        business: { type: categoryPricingSchema, default: () => DEFAULT_CATEGORIES.business },
        van: { type: categoryPricingSchema, default: () => DEFAULT_CATEGORIES.van },
        minibus: { type: categoryPricingSchema, default: () => DEFAULT_CATEGORIES.minibus }
    }
}, {
    timestamps: true
});

// Static helper to get pricing config (with defaults fallback)
settingsSchema.statics.getPricing = async function () {
    let pricing = await this.findOne({ key: 'pricing' });
    if (!pricing) {
        pricing = await this.create({
            key: 'pricing',
            commissionPercent: 15,
            categories: DEFAULT_CATEGORIES
        });
    }
    return pricing;
};

const Settings = mongoose.model('Settings', settingsSchema);

module.exports = Settings;
