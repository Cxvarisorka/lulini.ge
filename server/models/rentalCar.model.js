const mongoose = require('mongoose');

const rentalCarSchema = new mongoose.Schema({
    brand: {
        type: String,
        required: [true, 'Brand is required'],
        trim: true
    },
    model: {
        type: String,
        required: [true, 'Model is required'],
        trim: true
    },
    year: {
        type: Number,
        required: [true, 'Year is required'],
        min: 1990,
        max: new Date().getFullYear() + 1
    },
    category: {
        type: String,
        required: [true, 'Category is required'],
        enum: ['economy', 'business', 'luxury', 'suv', 'sports']
    },
    locationId: {
        type: String,
        required: [true, 'Location is required']
    },
    pricePerDay: {
        type: Number,
        required: [true, 'Price per day is required'],
        min: 0
    },
    deposit: {
        type: Number,
        default: 0,
        min: 0
    },
    mileageLimit: {
        type: String,
        default: 'unlimited'
    },
    minAge: {
        type: Number,
        default: 21,
        min: 18
    },
    passengers: {
        type: Number,
        required: true,
        min: 1,
        max: 20
    },
    luggage: {
        type: Number,
        default: 2,
        min: 0
    },
    doors: {
        type: Number,
        default: 4,
        min: 2
    },
    transmission: {
        type: String,
        required: true,
        enum: ['automatic', 'manual']
    },
    fuelType: {
        type: String,
        required: true,
        enum: ['petrol', 'diesel', 'hybrid', 'electric']
    },
    airConditioning: {
        type: Boolean,
        default: true
    },
    image: {
        type: String,
        required: [true, 'Main image is required']
    },
    images: [{
        type: String
    }],
    features: [{
        type: String
    }],
    description: {
        type: String,
        default: ''
    },
    available: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

// Index for searching
rentalCarSchema.index({ brand: 'text', model: 'text', category: 'text' });

module.exports = mongoose.model('RentalCar', rentalCarSchema);
