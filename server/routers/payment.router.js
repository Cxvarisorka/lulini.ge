'use strict';

const express = require('express');
const router = express.Router();
const {
    registerCard,
    verifyCardRegistration,
    getSavedCards,
    deleteCard,
    setDefaultCard,
    preauthRide,
    chargeRide,
    payRide,
    approveRidePayment,
    rejectRidePayment,
    verifyRidePayment,
    linkPaymentToRide,
    refundPayment,
    handleCallback,
    getPaymentStatus,
    getPaymentHistory,
    getPendingPayments,
    handleRedirectSuccess,
    handleRedirectFail
} = require('../controllers/payment.controller');
const { protect } = require('../middlewares/auth.middleware');

// Card management (authenticated)
router.post('/cards/register', protect, registerCard);
router.post('/cards/verify/:orderId', protect, verifyCardRegistration);
router.get('/cards', protect, getSavedCards);
router.delete('/cards/:cardId', protect, deleteCard);
router.patch('/cards/:cardId/default', protect, setDefaultCard);

// Ride payments (authenticated)
router.post('/ride/preauth', protect, preauthRide);
router.post('/ride/charge', protect, chargeRide);
router.post('/ride/pay', protect, payRide);
router.post('/ride/approve/:paymentId', protect, approveRidePayment);
router.post('/ride/reject/:paymentId', protect, rejectRidePayment);
router.post('/ride/verify/:orderId', protect, verifyRidePayment);
router.patch('/:paymentId/link-ride', protect, linkPaymentToRide);

// Refund (authenticated)
router.post('/:paymentId/refund', protect, refundPayment);

// Payment status & history (authenticated)
router.get('/pending', protect, getPendingPayments);
router.get('/history', protect, getPaymentHistory);
router.get('/:paymentId/status', protect, getPaymentStatus);

// BOG callback (public — signature-verified in handler)
router.post('/callback', handleCallback);

// BOG redirect handlers (public — user returns from payment page)
router.get('/redirect/success', handleRedirectSuccess);
router.get('/redirect/fail', handleRedirectFail);

module.exports = router;
