const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
    phone: {
        type: String,
        required: [true, 'Phone number is required'],
        index: true
    },
    code: {
        type: String,
        required: [true, 'OTP code is required']
    },
    purpose: {
        type: String,
        enum: ['registration', 'login'],
        default: 'login'
    },
    verified: {
        type: Boolean,
        default: false
    },
    attempts: {
        type: Number,
        default: 0
    },
    expiresAt: {
        type: Date,
        required: true,
        index: { expires: 0 }
    }
}, {
    timestamps: true
});

// Compound index for efficient lookups
otpSchema.index({ phone: 1, purpose: 1 });

const OTP = mongoose.model('OTP', otpSchema);

module.exports = OTP;
