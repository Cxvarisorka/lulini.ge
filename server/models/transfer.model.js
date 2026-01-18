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

const transferSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Transfer must belong to a user']
    },
    tripType: {
        type: String,
        enum: ['oneWay', 'roundTrip'],
        default: 'oneWay'
    },
    pickup: {
        type: locationSchema,
        required: [true, 'Pickup location is required']
    },
    dropoff: {
        type: locationSchema,
        required: [true, 'Dropoff location is required']
    },
    pickupAddress: {
        type: String,
        required: [true, 'Pickup address is required']
    },
    dropoffAddress: {
        type: String,
        required: [true, 'Dropoff address is required']
    },
    date: {
        type: String,
        required: [true, 'Date is required']
    },
    time: {
        type: String,
        required: [true, 'Time is required']
    },
    returnDate: {
        type: String,
        default: null
    },
    returnTime: {
        type: String,
        default: null
    },
    passengers: {
        type: Number,
        required: true,
        min: [1, 'At least 1 passenger is required'],
        max: [16, 'Maximum 16 passengers allowed']
    },
    luggage: {
        type: Number,
        default: 0,
        min: 0,
        max: 20
    },
    vehicle: {
        type: String,
        enum: ['economy', 'business', 'firstClass', 'van', 'minibus'],
        default: 'economy'
    },
    flightNumber: {
        type: String,
        default: null
    },
    name: {
        type: String,
        required: [true, 'Customer name is required']
    },
    email: {
        type: String,
        required: [true, 'Customer email is required'],
        match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email']
    },
    phone: {
        type: String,
        required: [true, 'Customer phone is required']
    },
    notes: {
        type: String,
        default: null
    },
    quote: {
        type: quoteSchema,
        required: [true, 'Quote information is required']
    },
    status: {
        type: String,
        enum: ['pending', 'confirmed', 'completed', 'cancelled'],
        default: 'pending'
    }
}, {
    timestamps: true
});

// Index for faster queries
transferSchema.index({ user: 1, createdAt: -1 });
transferSchema.index({ status: 1 });

const Transfer = mongoose.model('Transfer', transferSchema);

module.exports = Transfer;