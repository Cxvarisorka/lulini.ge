const mongoose = require('mongoose');

const locationSchema = new mongoose.Schema({
    lat: {
        type: Number,
        required: true
    },
    lng: {
        type: Number,
        required: true
    },
    address: {
        type: String,
        required: true
    }
}, { _id: false });

const quoteSchema = new mongoose.Schema({
    distance: {
        type: Number,
        required: true
    },
    distanceText: {
        type: String,
        required: true
    },
    duration: {
        type: Number,
        required: true
    },
    durationText: {
        type: String,
        required: true
    },
    basePrice: {
        type: Number,
        required: true
    },
    totalPrice: {
        type: Number,
        required: true
    }
}, { _id: false });

const rideSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Ride must belong to a user']
    },
    driver: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Driver',
        default: null
    },
    pickup: {
        type: locationSchema,
        required: [true, 'Pickup location is required']
    },
    dropoff: {
        type: locationSchema,
        required: [true, 'Dropoff location is required']
    },
    vehicleType: {
        type: String,
        enum: ['economy', 'comfort', 'business', 'van', 'minibus'],
        default: 'economy'
    },
    quote: {
        type: quoteSchema,
        required: [true, 'Quote information is required']
    },
    status: {
        type: String,
        enum: ['pending', 'accepted', 'in_progress', 'completed', 'cancelled'],
        default: 'pending'
    },
    paymentMethod: {
        type: String,
        enum: ['cash', 'card'],
        default: 'cash'
    },
    paymentStatus: {
        type: String,
        enum: ['pending', 'completed'],
        default: 'pending'
    },
    fare: {
        type: Number,
        default: 0
    },
    passengerName: {
        type: String,
        required: [true, 'Passenger name is required']
    },
    passengerPhone: {
        type: String,
        default: ''
    },
    notes: {
        type: String,
        default: null
    },
    startTime: {
        type: Date,
        default: null
    },
    endTime: {
        type: Date,
        default: null
    },
    cancelledBy: {
        type: String,
        enum: ['user', 'driver', 'admin'],
        default: null
    },
    cancellationReason: {
        type: String,
        default: null
    }
}, {
    timestamps: true
});

// Indexes for faster queries
rideSchema.index({ user: 1, createdAt: -1 });
rideSchema.index({ driver: 1, status: 1 });
rideSchema.index({ status: 1 });
rideSchema.index({ createdAt: -1 });

const Ride = mongoose.model('Ride', rideSchema);

module.exports = Ride;
