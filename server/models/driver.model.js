const mongoose = require('mongoose');

const locationSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
    },
    coordinates: {
        type: [Number], // [longitude, latitude]
        required: true
    }
}, { _id: false });

const vehicleSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['economy', 'comfort', 'business', 'van', 'minibus'],
        required: true
    },
    make: {
        type: String,
        required: true
    },
    model: {
        type: String,
        required: true
    },
    year: {
        type: Number,
        required: true
    },
    licensePlate: {
        type: String,
        required: true,
        uppercase: true
    },
    color: {
        type: String,
        required: true
    }
}, { _id: false });

const driverSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Driver must be linked to a user account']
    },
    phone: {
        type: String,
        required: [true, 'Phone number is required'],
        match: [/^[\d\s+()-]{7,20}$/, 'Please provide a valid phone number']
    },
    licenseNumber: {
        type: String,
        required: [true, 'License number is required'],
        unique: true
    },
    vehicle: {
        type: vehicleSchema,
        required: [true, 'Vehicle information is required']
    },
    status: {
        type: String,
        enum: ['online', 'offline', 'busy'],
        default: 'offline'
    },
    location: {
        type: locationSchema,
        default: null
    },
    rating: {
        type: Number,
        default: 0,
        min: 0,
        max: 5
    },
    totalReviews: {
        type: Number,
        default: 0
    },
    totalTrips: {
        type: Number,
        default: 0
    },
    totalEarnings: {
        type: Number,
        default: 0
    },
    isActive: {
        type: Boolean,
        default: true
    },
    isApproved: {
        type: Boolean,
        default: false
    },
    documents: {
        licenseImage: { type: String, default: null },
        vehicleRegistration: { type: String, default: null },
        insurance: { type: String, default: null },
        // Driver license photo
        driverLicense: { type: String, default: null },
        // Vehicle inspection photos (front, back, left, right, inside)
        front: { type: String, default: null },
        back: { type: String, default: null },
        left: { type: String, default: null },
        right: { type: String, default: null },
        inside: { type: String, default: null }
    }
}, {
    timestamps: true
});

// Index for geospatial queries
driverSchema.index({ location: '2dsphere' });
driverSchema.index({ user: 1 });
driverSchema.index({ status: 1, isActive: 1, isApproved: 1 });
driverSchema.index({ status: 1, isActive: 1, isApproved: 1, 'vehicle.type': 1 }); // Vehicle-filtered driver search

// Note: Cascade deletion is now handled in the controller for better error handling
// These middlewares are kept as a backup but deletion is primarily handled in the controller

const Driver = mongoose.model('Driver', driverSchema);

module.exports = Driver;
