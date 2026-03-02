const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
    key: {
        type: String,
        required: true,
        unique: true,
        enum: ['pricing']
    },
    basePrice: {
        type: Number,
        required: true,
        default: 5
    },
    kmPrice: {
        type: Number,
        required: true,
        default: 1.5
    },
    commissionPercent: {
        type: Number,
        required: true,
        default: 15,
        min: 0,
        max: 100
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
            basePrice: 5,
            kmPrice: 1.5,
            commissionPercent: 15
        });
    }
    return pricing;
};

const Settings = mongoose.model('Settings', settingsSchema);

module.exports = Settings;
