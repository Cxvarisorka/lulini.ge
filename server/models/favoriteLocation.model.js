const mongoose = require('mongoose');

const MAX_FAVORITES = 10;

const favoriteLocationSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Favorite must belong to a user']
    },
    label: {
        type: String,
        required: [true, 'Label is required'],
        trim: true,
        maxlength: [50, 'Label cannot exceed 50 characters']
    },
    address: {
        type: String,
        required: [true, 'Address is required'],
        trim: true,
        maxlength: [300, 'Address cannot exceed 300 characters']
    },
    lat: {
        type: Number,
        required: [true, 'Latitude is required'],
        min: [-90, 'Latitude must be >= -90'],
        max: [90, 'Latitude must be <= 90']
    },
    lng: {
        type: Number,
        required: [true, 'Longitude is required'],
        min: [-180, 'Longitude must be >= -180'],
        max: [180, 'Longitude must be <= 180']
    },
    icon: {
        type: String,
        default: 'star',
        trim: true,
        maxlength: [30, 'Icon name cannot exceed 30 characters']
    }
}, {
    timestamps: true
});

// Fast lookup of a user's favorites
favoriteLocationSchema.index({ user: 1, createdAt: -1 });

const FavoriteLocation = mongoose.model('FavoriteLocation', favoriteLocationSchema);

module.exports = FavoriteLocation;
module.exports.MAX_FAVORITES = MAX_FAVORITES;
