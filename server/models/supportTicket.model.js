const mongoose = require('mongoose');

const supportTicketSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
    },
    email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
    },
    category: {
        type: String,
        required: true,
        enum: ['ride_issue', 'payment', 'account', 'driver_feedback', 'app_bug', 'suggestion', 'other'],
    },
    subject: {
        type: String,
        required: true,
        trim: true,
    },
    message: {
        type: String,
        required: true,
        trim: true,
    },
    status: {
        type: String,
        enum: ['open', 'in_progress', 'resolved', 'closed'],
        default: 'open',
    },
}, {
    timestamps: true,
});

module.exports = mongoose.model('SupportTicket', supportTicketSchema);
