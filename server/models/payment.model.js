const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    ride: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Ride',
        default: null
    },
    // BOG order ID returned from order creation
    bogOrderId: {
        type: String,
        required: true,
        unique: true
    },
    // Our external order ID sent to BOG
    externalOrderId: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ['ride_payment', 'card_registration'],
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    currency: {
        type: String,
        default: 'GEL'
    },
    status: {
        type: String,
        enum: ['created', 'processing', 'completed', 'rejected', 'refunded'],
        default: 'created'
    },
    // BOG payment details from callback
    paymentDetail: {
        transferMethod: String,
        transactionId: String,
        payerIdentifier: String, // masked card number
        cardType: String, // visa, mc, amex
        cardExpiryDate: String,
        paymentOption: String, // direct_debit, recurrent, subscription
        code: String,
        codeDescription: String
    },
    // If this payment was made with a saved card
    savedCard: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SavedCard',
        default: null
    },
    callbackReceived: {
        type: Boolean,
        default: false
    },
    callbackData: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },
    rejectReason: {
        type: String,
        default: null
    }
}, {
    timestamps: true
});

paymentSchema.index({ user: 1, createdAt: -1 });
paymentSchema.index({ ride: 1 });
paymentSchema.index({ status: 1 });

const Payment = mongoose.model('Payment', paymentSchema);

module.exports = Payment;
