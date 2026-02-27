const mongoose = require('mongoose');

// Pre-computed driver statistics for fast lookups.
// Updated incrementally on ride completion instead of aggregation on every request.
// A daily reconciliation job should recalculate from source to correct any drift.

const driverStatsSchema = new mongoose.Schema({
    driver: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Driver',
        required: true,
        unique: true
    },
    today: {
        earnings: { type: Number, default: 0 },
        trips: { type: Number, default: 0 },
        date: { type: Date, default: () => new Date(new Date().setHours(0, 0, 0, 0)) }
    },
    week: {
        earnings: { type: Number, default: 0 },
        trips: { type: Number, default: 0 },
    },
    month: {
        earnings: { type: Number, default: 0 },
        trips: { type: Number, default: 0 },
    },
    total: {
        earnings: { type: Number, default: 0 },
        trips: { type: Number, default: 0 },
    },
    lastUpdated: { type: Date, default: Date.now }
}, { timestamps: true });

// Note: { driver: 1 } unique index is auto-created by the `unique: true` field option

/**
 * Increment stats atomically on ride completion.
 * Resets today stats if the date has changed.
 */
driverStatsSchema.statics.incrementOnCompletion = async function (driverId, fare) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // First try: increment assuming today's date matches
    const result = await this.findOneAndUpdate(
        { driver: driverId, 'today.date': today },
        {
            $inc: {
                'today.earnings': fare,
                'today.trips': 1,
                'week.earnings': fare,
                'week.trips': 1,
                'month.earnings': fare,
                'month.trips': 1,
                'total.earnings': fare,
                'total.trips': 1,
            },
            $set: { lastUpdated: new Date() }
        },
        { upsert: false, new: true }
    );

    if (result) return result;

    // Date changed or doc doesn't exist — reset today, increment rest
    return this.findOneAndUpdate(
        { driver: driverId },
        {
            $set: {
                'today.earnings': fare,
                'today.trips': 1,
                'today.date': today,
                lastUpdated: new Date()
            },
            $inc: {
                'week.earnings': fare,
                'week.trips': 1,
                'month.earnings': fare,
                'month.trips': 1,
                'total.earnings': fare,
                'total.trips': 1,
            }
        },
        { upsert: true, new: true }
    );
};

const DriverStats = mongoose.model('DriverStats', driverStatsSchema);

module.exports = DriverStats;
