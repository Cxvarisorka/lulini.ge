const mongoose = require('mongoose');

const rideOfferSchema = new mongoose.Schema({
    ride: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Ride',
        required: true
    },
    driver: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Driver',
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'accepted', 'declined', 'timeout', 'superseded'],
        default: 'pending'
    },
    offeredAt: {
        type: Date,
        default: Date.now
    },
    respondedAt: {
        type: Date,
        default: null
    },
    responseTimeMs: {
        type: Number,
        default: null
    }
}, {
    timestamps: false
});

// What offers does this driver have? (stats queries, per-driver dashboards)
rideOfferSchema.index({ driver: 1, status: 1 });
rideOfferSchema.index({ driver: 1, offeredAt: -1 });

// What offers exist for this ride? (supersede on accept)
rideOfferSchema.index({ ride: 1, status: 1 });

// Pending offers for timeout cleanup
rideOfferSchema.index({ status: 1, ride: 1 });

const RideOffer = mongoose.model('RideOffer', rideOfferSchema);

module.exports = RideOffer;
