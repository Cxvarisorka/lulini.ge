const mongoose = require('mongoose');

const emergencyContactSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Emergency contact must belong to a user']
    },
    name: {
        type: String,
        required: [true, 'Contact name is required'],
        trim: true,
        maxlength: [100, 'Name cannot exceed 100 characters']
    },
    phone: {
        type: String,
        required: [true, 'Contact phone number is required'],
        match: [/^\+?[\d\s()\-]{7,20}$/, 'Please provide a valid phone number'],
        trim: true
    },
    relationship: {
        type: String,
        trim: true,
        maxlength: [50, 'Relationship cannot exceed 50 characters'],
        default: null
    }
}, {
    timestamps: true
});

// Each user may have at most 5 emergency contacts — enforced at the controller layer
emergencyContactSchema.index({ user: 1 });

const EmergencyContact = mongoose.model('EmergencyContact', emergencyContactSchema);

module.exports = EmergencyContact;
