const mongoose = require('mongoose');

const tourOrderSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    tour: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Tour',
        required: true
    },
    // Snapshot of tour details at time of booking
    tourSnapshot: {
        name: String,
        duration: String,
        image: String,
        price: Number,
        priceType: String
    },
    // Tour date and time
    date: {
        type: String,
        required: [true, 'Tour date is required']
    },
    time: {
        type: String,
        default: '10:00'
    },
    // Number of participants
    participants: {
        type: Number,
        required: [true, 'Number of participants is required'],
        min: [1, 'At least 1 participant is required']
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
    // Language preference
    language: {
        type: String,
        default: 'English'
    },
    // Pricing
    pricePerPerson: {
        type: Number,
        required: true
    },
    totalPrice: {
        type: Number,
        required: true
    },
    // Optional: Car rental for tour
    carRental: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'RentalOrder',
        default: null
    },
    carRentalDetails: {
        brand: String,
        model: String,
        pickupDate: String,
        returnDate: String,
        totalPrice: Number
    },
    // Optional: Transfer for tour
    transfer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Transfer',
        default: null
    },
    transferDetails: {
        tripType: String,
        pickupAddress: String,
        dropoffAddress: String,
        date: String,
        totalPrice: Number
    },
    // Notes from customer
    notes: {
        type: String,
        default: ''
    },
    // Special requirements
    specialRequirements: {
        type: String,
        default: ''
    },
    // Status
    status: {
        type: String,
        enum: ['pending', 'confirmed', 'completed', 'cancelled'],
        default: 'pending'
    }
}, {
    timestamps: true
});

// Index for querying user orders
tourOrderSchema.index({ user: 1, createdAt: -1 });
tourOrderSchema.index({ status: 1 });
tourOrderSchema.index({ date: 1 });

module.exports = mongoose.model('TourOrder', tourOrderSchema);
