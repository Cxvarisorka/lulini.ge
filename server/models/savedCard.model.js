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
    // How the card was saved — determines which charge method to use
    // 'recurrent' = user sees BOG page (no card re-entry), variable amounts
    // 'subscription' = fully automatic, fixed amount only
    saveType: {
        type: String,
        enum: ['recurrent', 'subscription'],
        default: 'recurrent'
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
