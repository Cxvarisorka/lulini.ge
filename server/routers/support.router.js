const express = require('express');
const SupportTicket = require('../models/supportTicket.model');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const rateLimit = require('express-rate-limit');

const router = express.Router();

// Rate limiter: 5 tickets per hour per IP
const supportLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many submissions, please try again later' }
});

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const VALID_CATEGORIES = ['ride_issue', 'payment', 'account', 'driver_feedback', 'app_bug', 'suggestion', 'other'];

// POST /api/support - Submit a support ticket
router.post('/', supportLimiter, catchAsync(async (req, res, next) => {
    const { name, email, category, subject, message } = req.body;

    if (!name || !email || !category || !subject || !message) {
        return next(new AppError('All fields are required', 400));
    }

    if (!EMAIL_REGEX.test(email)) {
        return next(new AppError('Please provide a valid email address', 400));
    }

    if (!VALID_CATEGORIES.includes(category)) {
        return next(new AppError('Invalid category', 400));
    }

    if (subject.length > 200) {
        return next(new AppError('Subject must be under 200 characters', 400));
    }

    if (message.length > 5000) {
        return next(new AppError('Message must be under 5000 characters', 400));
    }

    await SupportTicket.create({ name, email, category, subject, message });

    res.status(201).json({ success: true, message: 'Support ticket submitted successfully' });
}));

module.exports = router;
