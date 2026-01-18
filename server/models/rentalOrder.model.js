const mongoose = require('mongoose');

const rentalOrderSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    car: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'RentalCar',
        required: true
    },
    // Snapshot of car details at time of booking
    carSnapshot: {
        brand: String,
        model: String,
        year: Number,
        image: String,
        pricePerDay: Number
    },
    // Rental period
    startDate: {
        type: String,
        required: [true, 'Start date is required']
    },
    endDate: {
        type: String,
        required: [true, 'End date is required']
    },
    pickupTime: {
        type: String,
        default: '10:00'
    },
    returnTime: {
        type: String,
        default: '10:00'
    },
    // Location
    pickupLocation: {
        type: String,
        required: [true, 'Pickup location is required']
    },
    returnLocation: {
        type: String
    },
    // Customer info
    name: {
        type: String,
        required: [true, 'Name is required']
    },
    email: {
        type: String,
        required: [true, 'Email is required']
    },
    phone: {
        type: String,
        required: [true, 'Phone is required']
    },
    // Pricing
    days: {
        type: Number,
        required: true,
        min: 1
    },
    pricePerDay: {
        type: Number,
        required: true
    },
    totalPrice: {
        type: Number,
        required: true
    },
    deposit: {
        type: Number,
        default: 0
    },
    // Additional options
    extras: {
        insurance: { type: Boolean, default: false },
        gps: { type: Boolean, default: false },
        childSeat: { type: Boolean, default: false },
        additionalDriver: { type: Boolean, default: false }
    },
    // Notes
    notes: {
        type: String,
        default: ''
    },
    // Status
    status: {
        type: String,
        enum: ['pending', 'confirmed', 'active', 'completed', 'cancelled'],
        default: 'pending'
    }
}, {
    timestamps: true
});

// Index for querying user orders
rentalOrderSchema.index({ user: 1, createdAt: -1 });
rentalOrderSchema.index({ status: 1 });

module.exports = mongoose.model('RentalOrder', rentalOrderSchema);
