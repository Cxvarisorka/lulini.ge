const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

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

// Hash OTP code before saving (prevent plaintext exposure if DB is compromised)
otpSchema.pre('save', async function () {
    if (!this.isModified('code') || this.code === 'verified') return;
    this.code = await bcrypt.hash(this.code, 6);
});

// Compare a candidate code against the stored hash
otpSchema.methods.compareCode = async function (candidateCode) {
    if (this.code === 'verified') return false;
    return bcrypt.compare(candidateCode, this.code);
};

// Compound index for efficient lookups
otpSchema.index({ phone: 1, purpose: 1 });

const OTP = mongoose.model('OTP', otpSchema);

module.exports = OTP;
