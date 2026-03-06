const express = require('express');
const Waitlist = require('../models/waitlist.model');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const rateLimit = require('express-rate-limit');

const router = express.Router();

// Rate limiter: 5 submissions per hour per IP
const waitlistLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many submissions, please try again later' }
});

// Email format validation
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// POST /api/waitlist - Join the waiting list
router.post('/', waitlistLimiter, catchAsync(async (req, res, next) => {
    const { email, name } = req.body;

    if (!email) {
        return next(new AppError('Email is required', 400));
    }

    if (!EMAIL_REGEX.test(email)) {
        return next(new AppError('Please provide a valid email address', 400));
    }

    const existing = await Waitlist.findOne({ email: email.toLowerCase() });
    if (existing) {
        return next(new AppError('This email is already on the waiting list', 409));
    }

    await Waitlist.create({ email, name });

    const count = await Waitlist.countDocuments();
    res.status(201).json({ success: true, message: 'Successfully joined the waiting list', count });
}));

// GET /api/waitlist/count - Get waiting list count (public)
router.get('/count', catchAsync(async (req, res) => {
    const count = await Waitlist.countDocuments();
    res.json({ success: true, count });
}));

module.exports = router;
