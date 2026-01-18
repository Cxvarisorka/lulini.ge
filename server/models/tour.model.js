const mongoose = require('mongoose');

const tourSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Tour name is required'],
        trim: true
    },
    description: {
        type: String,
        required: [true, 'Description is required']
    },
    shortDescription: {
        type: String,
        required: [true, 'Short description is required']
    },
    duration: {
        type: String,
        required: [true, 'Duration is required']
    },
    // e.g., "1 day", "2 days", "3 hours"
    category: {
        type: String,
        enum: ['cultural', 'adventure', 'nature', 'wine', 'food', 'historical', 'religious', 'mountain', 'city'],
        default: 'cultural'
    },
    price: {
        type: Number,
        required: [true, 'Price is required'],
        min: [0, 'Price cannot be negative']
    },
    priceType: {
        type: String,
        enum: ['perPerson', 'perGroup'],
        default: 'perPerson'
    },
    maxGroupSize: {
        type: Number,
        default: 15,
        min: [1, 'Group size must be at least 1']
    },
    minGroupSize: {
        type: Number,
        default: 1,
        min: [1, 'Minimum group size must be at least 1']
    },
    image: {
        type: String,
        required: [true, 'Main image is required']
    },
    images: {
        type: [String],
        default: []
    },
    // Tour inclusions
    includes: {
        type: [String],
        default: []
    },
    // What's not included
    excludes: {
        type: [String],
        default: []
    },
    // Itinerary/schedule
    itinerary: [{
        time: String,
        title: String,
        description: String
    }],
    // Meeting point
    meetingPoint: {
        type: String,
        required: [true, 'Meeting point is required']
    },
    // Location/region
    location: {
        type: String,
        required: [true, 'Location is required']
    },
    // Available days of week
    availableDays: {
        type: [String],
        enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
        default: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    },
    // Languages offered
    languages: {
        type: [String],
        default: ['English']
    },
    // Difficulty level
    difficulty: {
        type: String,
        enum: ['easy', 'moderate', 'challenging'],
        default: 'easy'
    },
    // Requirements/notes
    requirements: {
        type: String,
        default: ''
    },
    // Cancellation policy
    cancellationPolicy: {
        type: String,
        default: 'Free cancellation up to 24 hours before the tour'
    },
    available: {
        type: Boolean,
        default: true
    },
    featured: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

// Index for searching and filtering
tourSchema.index({ name: 1, location: 1 });
tourSchema.index({ category: 1 });
tourSchema.index({ available: 1 });
tourSchema.index({ featured: 1 });

module.exports = mongoose.model('Tour', tourSchema);
