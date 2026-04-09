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
    },
    // ── Precision layers (Phase 4 — all optional, backward-compatible) ──
    // Original coordinates from geocoder before user moved the pin
    originalCoords: {
        lat: Number,
        lng: Number,
        _id: false,
    },
    // Coordinates after user adjusted the pin on the map
    adjustedCoords: {
        lat: Number,
        lng: Number,
        _id: false,
    },
    // Server-side road-snapped coordinates (populated async after ride creation)
    snappedRoadCoords: {
        lat: Number,
        lng: Number,
        _id: false,
    },
    // Reference to canonical Location document (Phase 1.4)
    locationRef: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Location',
    },
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
    stops: {
        type: [locationSchema],
        default: [],
        validate: {
            validator: function(v) { return v.length <= 2; },
            message: 'Maximum 2 additional stops allowed'
        }
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
        enum: ['pending', 'accepted', 'driver_arrived', 'in_progress', 'completed', 'cancelled'],
        default: 'pending'
    },
    paymentMethod: {
        type: String,
        enum: ['cash'],
        default: 'cash'
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
    arrivalTime: {
        type: Date,
        default: null
    },
    waitingExpiresAt: {
        type: Date,
        default: null
    },
    // Auto-cancel accepted rides if driver doesn't arrive within this deadline
    acceptedExpiresAt: {
        type: Date,
        default: null
    },
    waitingFee: {
        type: Number,
        default: 0
    },
    commission: {
        type: Number,
        default: 0
    },
    commissionPercent: {
        type: Number,
        default: 0
    },
    cancelledBy: {
        type: String,
        enum: ['user', 'driver', 'admin'],
        default: null
    },
    cancellationReason: {
        type: String,
        enum: [
            'waiting_time_too_long',
            'driver_not_moving',
            'wrong_pickup_location',
            'changed_my_mind',
            'found_alternative',
            'price_too_high',
            'driver_requested_cancel',
            'passenger_not_responding',
            'passenger_not_at_pickup',
            'emergency',
            'waiting_timeout',
            'other'
        ],
        default: null
    },
    cancellationNote: {
        type: String,
        default: null
    },
    cancellationFee: {
        type: Number,
        default: 0
    },
    rating: {
        type: Number,
        min: 1,
        max: 5,
        default: null
    },
    review: {
        type: String,
        default: null
    },
    reviewedAt: {
        type: Date,
        default: null
    },
    // Driver's rating of the passenger (Task 4: two-way rating)
    driverRating: {
        type: Number,
        min: 1,
        max: 5,
        default: null
    },
    driverReview: {
        type: String,
        default: null
    },
    driverReviewedAt: {
        type: Date,
        default: null
    },
    // Scheduled ride fields (Task 6)
    scheduledFor: {
        type: Date,
        default: null
    },
    isScheduled: {
        type: Boolean,
        default: false
    },
    expiresAt: {
        type: Date,
        default: null
    },
    createdByAdmin: {
        type: Boolean,
        default: false
    },
    pickupApproachNotified: {
        type: Boolean,
        default: false
    },
    dropoffApproachNotified: {
        type: Boolean,
        default: false
    },
    // Tracks when this scheduled ride was last broadcast to drivers.
    // Used to prevent duplicate broadcasts when the cron fires every minute.
    lastBroadcastAt: {
        type: Date,
        default: null
    },
    // Route points recorded during in_progress phase (for ride reconstruction)
    // Capped at 2000 points (~2.8h at 5s interval). Older points are downsampled when cap is hit.
    routePoints: [{
        lat: Number,
        lng: Number,
        heading: Number,
        speed: Number,
        accuracy: Number,
        ts: Date,
        _id: false,
    }]
}, {
    timestamps: true
});

// Cap routePoints to prevent unbounded document growth.
// When over limit, downsample by keeping every 2nd point from the older half.
// Note: Mongoose 9 does NOT pass `next` to pre-save hooks — just return.
const MAX_ROUTE_POINTS = 2000;
rideSchema.pre('save', function () {
    if (this.routePoints && this.routePoints.length > MAX_ROUTE_POINTS) {
        const half = Math.floor(this.routePoints.length / 2);
        const downsampled = this.routePoints.slice(0, half).filter((_, i) => i % 2 === 0);
        const recent = this.routePoints.slice(half);
        this.routePoints = [...downsampled, ...recent];
    }
});

// Indexes for faster queries
rideSchema.index({ user: 1, createdAt: -1 });
rideSchema.index({ driver: 1, status: 1 });
rideSchema.index({ status: 1 });
rideSchema.index({ createdAt: -1 });
rideSchema.index({ status: 1, expiresAt: 1 }); // For querying non-expired pending rides
rideSchema.index({ status: 1, waitingExpiresAt: 1 }); // For querying waiting timeout rides
rideSchema.index({ status: 1, acceptedExpiresAt: 1 }); // For expiring stale accepted rides
rideSchema.index({ status: 1, vehicleType: 1, expiresAt: 1 }); // getAvailableRides filtered by vehicle type
rideSchema.index({ driver: 1, status: 1, endTime: -1 }); // Driver ride history sorted by completion
rideSchema.index({ user: 1, isScheduled: 1, scheduledFor: 1 }); // Scheduled ride queries per user

// Prevent race condition: only one active ride per user at database level
// This catches the case where two createRide requests arrive simultaneously
rideSchema.index(
    { user: 1 },
    {
        unique: true,
        partialFilterExpression: {
            status: { $in: ['pending', 'accepted', 'driver_arrived', 'in_progress'] }
        },
        name: 'unique_active_ride_per_user'
    }
);

const Ride = mongoose.model('Ride', rideSchema);

module.exports = Ride;
