const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    ride: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Ride',
        required: [true, 'Message must belong to a ride']
    },
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Message must have a sender']
    },
    senderRole: {
        type: String,
        enum: ['passenger', 'driver'],
        required: [true, 'Sender role is required']
    },
    content: {
        type: String,
        required: [true, 'Message content is required'],
        maxlength: [1000, 'Message cannot exceed 1000 characters'],
        trim: true
    },
    readAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true // adds createdAt + updatedAt
});

// Compound index for efficient per-ride message retrieval sorted by time
messageSchema.index({ ride: 1, createdAt: 1 });

const Message = mongoose.model('Message', messageSchema);

module.exports = Message;
