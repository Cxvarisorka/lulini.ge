const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    fullName: {
        type: String,
        trim: true,
        minlength: [2, 'Full name must be at least 2 characters'],
        maxlength: [100, 'Full name cannot exceed 100 characters']
    },
    firstName: {
        type: String,
        trim: true,
        minlength: [2, 'First name must be at least 2 characters'],
        maxlength: [50, 'First name cannot exceed 50 characters']
    },
    lastName: {
        type: String,
        trim: true,
        minlength: [2, 'Last name must be at least 2 characters'],
        maxlength: [50, 'Last name cannot exceed 50 characters']
    },
    email: {
        type: String,
        unique: true,
        sparse: true,
        lowercase: true,
        trim: true,
        match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email']
    },
    password: {
        type: String,
        required: function() {
            return this.provider === 'local';
        },
        minlength: [6, 'Password must be at least 6 characters']
    },
    phone: {
        type: String,
        unique: true,
        sparse: true,
        match: [/^\+?[\d\s()-]{7,20}$/, 'Please provide a valid phone number']
    },
    isPhoneVerified: {
        type: Boolean,
        default: false
    },
    role: {
        type: String,
        enum: {
            values: ['user', 'admin', 'driver'],
            message: 'Role must be user, admin, or driver'
        },
        default: 'user'
    },
    provider: {
        type: String,
        enum: ['local', 'google', 'facebook', 'apple', 'phone'],
        default: 'local'
    },
    providerId: {
        type: String,
        default: null
    },
    avatar: {
        type: String,
        default: null
    },
    profileImage: {
        type: String,
        default: null
    },
    isVerified: {
        type: Boolean,
        default: false
    },
    hasCompletedOnboarding: {
        type: Boolean,
        default: false
    },
    failedLoginAttempts: {
        type: Number,
        default: 0
    },
    lockUntil: {
        type: Date,
        default: null
    },
    deviceTokens: [{
        token: { type: String, required: true },
        platform: { type: String, enum: ['ios', 'android'], required: true },
        app: { type: String, enum: ['passenger', 'driver'], default: 'passenger' },
        _id: false
    }],
    preferredLanguage: {
        type: String,
        enum: ['en', 'es', 'ru', 'ka'],
        default: 'ka'
    }
}, {
    timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function() {
    if (!this.isModified('password') || !this.password) {
        return;
    }
    this.password = await bcrypt.hash(this.password, 12);
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
    if (!this.password) return false;
    return await bcrypt.compare(candidatePassword, this.password);
};

// Compound index for OAuth login lookups (Google/Apple/Phone provider + providerId)
userSchema.index({ provider: 1, providerId: 1 });

// Index for device token lookups (registerToken cross-user cleanup)
userSchema.index({ 'deviceTokens.token': 1 });

const User = mongoose.model('User', userSchema);

module.exports = User;
