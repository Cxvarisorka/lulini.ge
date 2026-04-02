const mongoose = require('mongoose');

const driverActivitySchema = new mongoose.Schema({
    driver: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Driver',
        required: true
    },
    type: {
        type: String,
        enum: ['online', 'offline', 'resting', 'rest_end'],
        required: true
    },
    timestamp: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: false
});

driverActivitySchema.index({ driver: 1, timestamp: -1 });
driverActivitySchema.index({ driver: 1, type: 1, timestamp: -1 });

const DriverActivity = mongoose.model('DriverActivity', driverActivitySchema);

module.exports = DriverActivity;
