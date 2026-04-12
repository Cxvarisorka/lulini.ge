'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const emailOtpSchema = new mongoose.Schema({
    email: {
        type: String,
        required: [true, 'Email is required'],
        lowercase: true,
        trim: true,
        index: true,
    },
    code: {
        type: String,
        required: [true, 'OTP code is required'],
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
    },
    purpose: {
        type: String,
        enum: ['verification', 'update'],
        default: 'verification',
    },
    attempts: {
        type: Number,
        default: 0,
    },
    // Set to true once the user has successfully entered the code. For the
    // registration flow this lets /auth/register confirm that the email was
    // actually verified before creating the local account (the OTP row lives
    // for a short grace window after verification so the next call succeeds).
    verified: {
        type: Boolean,
        default: false,
    },
    expiresAt: {
        type: Date,
        required: true,
        index: { expires: 0 },
    },
}, {
    timestamps: true,
});

emailOtpSchema.pre('save', async function () {
    if (!this.isModified('code')) return;
    this.code = await bcrypt.hash(this.code, 6);
});

emailOtpSchema.methods.compareCode = async function (candidateCode) {
    return bcrypt.compare(candidateCode, this.code);
};

emailOtpSchema.index({ email: 1, purpose: 1 });

module.exports = mongoose.model('EmailOTP', emailOtpSchema);
