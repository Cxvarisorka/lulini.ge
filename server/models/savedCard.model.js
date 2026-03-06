const mongoose = require('mongoose');

const savedCardSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    // BOG order ID used for card registration (parent_order_id for future charges)
    bogOrderId: {
        type: String,
        required: true
    },
    // Masked card number (e.g., "548888xxxxxx9893")
    maskedPan: {
        type: String,
        required: true
    },
    cardType: {
        type: String,
        enum: ['visa', 'mc', 'amex'],
        default: 'visa'
    },
    expiryDate: {
        type: String, // "MM/YY"
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    isDefault: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

savedCardSchema.index({ user: 1, isActive: 1 });
savedCardSchema.index({ bogOrderId: 1 });

const SavedCard = mongoose.model('SavedCard', savedCardSchema);

module.exports = SavedCard;
