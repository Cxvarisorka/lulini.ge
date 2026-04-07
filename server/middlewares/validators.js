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
    validateSendPhoneOtp,
    validateCreateRide,
    validateUpdateDriverLocation
};
