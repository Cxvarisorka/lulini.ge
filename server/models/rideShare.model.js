const mongoose = require('mongoose');
const crypto = require('crypto');

const sharedWithSchema = new mongoose.Schema({
    name: { type: String, default: '' },
    phone: { type: String, default: '' }
}, { _id: false });

const rideShareSchema = new mongoose.Schema({
    ride: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Ride',
        required: true
    },
    shareToken: {
        type: String,
        unique: true,
        index: true,
        default: () => crypto.randomBytes(32).toString('hex')
    },
    sharedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    sharedWith: {
        type: [sharedWithSchema],
        default: []
    },
    // expiresAt is set by the controller once the ride completes (ride end + 1 hour).
    // During an active ride it is left null and evaluated at read time.
    expiresAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

// TTL index: MongoDB automatically deletes documents after expiresAt
rideShareSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, sparse: true });

const RideShare = mongoose.model('RideShare', rideShareSchema);

module.exports = RideShare;
