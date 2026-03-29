const { body, validationResult } = require('express-validator');
const AppError = require('../utils/AppError');

// Middleware to check validation results
const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        const messages = errors.array().map(e => e.msg).join('. ');
        return next(new AppError(messages, 400));
    }
    next();
};

// Georgian + Latin + accented characters for names
const nameRegex = /^[a-zA-ZÀ-ÿ\u10A0-\u10FF\u2D00-\u2D2F\s'-]+$/;

const validateRegister = [
    body('firstName').trim().notEmpty().withMessage('First name is required')
        .isLength({ min: 2, max: 50 }).withMessage('First name must be 2-50 characters')
        .matches(nameRegex).withMessage('First name contains invalid characters'),
    body('lastName').trim().notEmpty().withMessage('Last name is required')
        .isLength({ min: 2, max: 50 }).withMessage('Last name must be 2-50 characters')
        .matches(nameRegex).withMessage('Last name contains invalid characters'),
    body('email').trim().isEmail().withMessage('Valid email is required').normalizeEmail(),
    body('password').isLength({ min: 8, max: 128 }).withMessage('Password must be 8-128 characters')
        .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter')
        .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
        .matches(/\d/).withMessage('Password must contain at least one number'),
    body('phone').optional().matches(/^\+?[\d\s()-]{7,20}$/).withMessage('Invalid phone number'),
    validate
];

const validateLogin = [
    body('email').trim().isEmail().withMessage('Valid email is required').normalizeEmail(),
    body('password').notEmpty().withMessage('Password is required')
        .isLength({ max: 128 }).withMessage('Password too long'),
    validate
];

const validateSendPhoneOtp = [
    body('phone').trim().notEmpty().withMessage('Phone number is required')
        .matches(/^\+?[\d\s()-]{7,20}$/).withMessage('Invalid phone number format'),
    validate
];

const validateCreateRide = [
    body('pickup.lat').isFloat({ min: -90, max: 90 }).withMessage('Invalid pickup latitude'),
    body('pickup.lng').isFloat({ min: -180, max: 180 }).withMessage('Invalid pickup longitude'),
    body('pickup.address').trim().notEmpty().withMessage('Pickup address is required')
        .isLength({ max: 500 }).withMessage('Pickup address too long'),
    body('dropoff.lat').isFloat({ min: -90, max: 90 }).withMessage('Invalid dropoff latitude'),
    body('dropoff.lng').isFloat({ min: -180, max: 180 }).withMessage('Invalid dropoff longitude'),
    body('dropoff.address').trim().notEmpty().withMessage('Dropoff address is required')
        .isLength({ max: 500 }).withMessage('Dropoff address too long'),
    body('vehicleType').isIn(['economy', 'comfort', 'business', 'van', 'minibus'])
        .withMessage('Invalid vehicle type'),
    body('passengerName').trim().notEmpty().withMessage('Passenger name is required')
        .isLength({ max: 100 }).withMessage('Passenger name too long'),
    body('passengerPhone').optional().matches(/^\+?[\d\s()-]{7,20}$/).withMessage('Invalid phone number'),
    body('paymentMethod').optional()
        .isIn(['cash', 'card', 'apple_pay', 'google_pay', 'saved_card'])
        .withMessage('Invalid payment method'),
    body('notes').optional().isLength({ max: 500 }).withMessage('Notes too long'),
    body('quote.totalPrice').optional().isFloat({ min: 0, max: 50000 }).withMessage('Invalid quote price'),
    validate
];

const validateUpdateDriverLocation = [
    body('latitude').isFloat({ min: -90, max: 90 }).withMessage('Invalid latitude'),
    body('longitude').isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude'),
    validate
];

module.exports = {
    validateRegister,
    validateLogin,
    validateSendPhoneOtp,
    validateCreateRide,
    validateUpdateDriverLocation
};
