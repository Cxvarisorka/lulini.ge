const mongoose = require('mongoose');

const sosAlertSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'SOS alert must belong to a user']
    },
    ride: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Ride',
        default: null
    },
    location: {
        lat: { type: Number, default: null },
        lng: { type: Number, default: null }
    },
    triggeredAt: {
        type: Date,
        default: Date.now
    },
    status: {
        type: String,
        enum: ['active', 'resolved', 'false_alarm'],
        default: 'active'
    },
    resolvedAt: {
        type: Date,
        default: null
    },
    resolvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    notes: {
        type: String,
        default: null,
        maxlength: [1000, 'Notes cannot exceed 1000 characters']
    }
}, {
    timestamps: true
});

sosAlertSchema.index({ user: 1, triggeredAt: -1 });

const SosAlert = mongoose.model('SosAlert', sosAlertSchema);

module.exports = SosAlert;
