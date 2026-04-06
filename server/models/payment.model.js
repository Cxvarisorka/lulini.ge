'use strict';

const mongoose = require('mongoose');

/**
 * Payment State Machine
 * =====================
 *
 * STANDARD PAYMENT (capture: automatic):
 *   created -> processing -> completed -> refund_requested -> refunded | refunded_partially
 *                         -> rejected
 *
 * PREAUTHORIZATION (capture: manual):
 *   created -> processing -> blocked -> capture_requested -> completed -> refund_requested -> refunded
 *                                    -> cancelled
 *                         -> rejected
 *
 * VALID TRANSITIONS (enforced by controller, verified by callback):
 *   created           -> processing, completed, blocked, rejected
 *   processing        -> completed, blocked, rejected
 *   blocked           -> capture_requested, cancelled
 *   capture_requested -> completed, rejected (if BOG declines capture)
 *   completed         -> refund_requested
 *   refund_requested  -> refunded, refunded_partially, completed (if refund rejected by BOG)
 *   cancelled         -> (terminal)
 *   rejected          -> (terminal)
 *   refunded          -> (terminal)
 */

const PAYMENT_STATUSES = [
    'created',              // Order created, awaiting user action
    'processing',           // Payment in progress at BOG
    'completed',            // Payment successful (funds debited / capture confirmed)
    'rejected',             // Payment declined by BOG or card issuer
    'blocked',              // Preauth: funds held on card
    'capture_requested',    // Preauth: approve sent to BOG, awaiting callback
    'cancelled',            // Preauth: hold released
    'refund_requested',     // Refund sent to BOG, awaiting callback
    'refunded',             // Fully refunded (confirmed by callback)
    'refunded_partially'    // Partially refunded (confirmed by callback)
];

const TERMINAL_STATUSES = ['rejected', 'cancelled', 'refunded'];

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
    bogOrderId: {
        type: String,
        required: true,
        unique: true
    },
    externalOrderId: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ['card_registration', 'ride_preauth', 'ride_payment'],
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    capturedAmount: {
        type: Number,
        default: null
    },
    currency: {
        type: String,
        default: 'GEL'
    },
    status: {
        type: String,
        enum: PAYMENT_STATUSES,
        default: 'created'
    },
    captureMode: {
        type: String,
        enum: ['automatic', 'manual'],
        default: 'automatic'
    },
    paymentDetail: {
        transferMethod: String,     // card, google_pay, apple_pay, etc.
        transactionId: String,
        payerIdentifier: String,    // masked card PAN
        cardType: String,           // visa, mc, amex
        cardExpiryDate: String,     // MM/YY
        paymentOption: String,      // direct_debit, recurrent, subscription
        code: String,               // BOG response code
        codeDescription: String,
        authCode: String
    },
    savedCard: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SavedCard',
        default: null
    },
    // Callback tracking
    callbackReceived: {
        type: Boolean,
        default: false
    },
    callbackData: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },
    // Failure info
    rejectReason: {
        type: String,
        default: null
    },
    // Refund tracking — supports multiple partial refunds
    refundedTotal: {
        type: Number,
        default: 0
    },
    refundReason: {
        type: String,
        default: null
    },
    refundHistory: [{
        amount: Number,
        reason: String,
        actionId: String,
        requestedAt: Date,
        confirmedAt: Date
    }]
}, {
    timestamps: true
});

// Query indexes
paymentSchema.index({ user: 1, createdAt: -1 });
paymentSchema.index({ ride: 1 });
paymentSchema.index({ externalOrderId: 1 });
// Reconciliation: find stuck payments
paymentSchema.index({ status: 1, createdAt: 1 });
// Duplicate prevention: recent pending payments per user
paymentSchema.index({ user: 1, status: 1, type: 1, createdAt: -1 });

// Static helper: check if status is terminal
paymentSchema.statics.isTerminal = function (status) {
    return TERMINAL_STATUSES.includes(status);
};

paymentSchema.statics.TERMINAL_STATUSES = TERMINAL_STATUSES;

const Payment = mongoose.model('Payment', paymentSchema);

module.exports = Payment;
