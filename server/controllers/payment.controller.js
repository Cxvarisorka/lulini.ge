const crypto = require('crypto');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const Payment = require('../models/payment.model');
const SavedCard = require('../models/savedCard.model');
const Ride = require('../models/ride.model');
const bogService = require('../services/bog.service');

const CALLBACK_BASE_URL = process.env.BOG_CALLBACK_URL || 'https://api.lulini.ge';

// ──────────────────────────────────────────────────────
// Card Management
// ──────────────────────────────────────────────────────

// @desc    Initiate card registration (add new card)
// @route   POST /api/payments/cards/register
// @access  Private
const registerCard = catchAsync(async (req, res) => {
    const { lang } = req.body;
    const userId = req.user._id || req.user.id;

    const externalOrderId = `card_reg_${userId}_${Date.now()}`;

    // Create a 0.01 GEL order for card verification
    const order = await bogService.createOrder({
        amount: 0.01,
        currency: 'GEL',
        externalOrderId,
        callbackUrl: `${CALLBACK_BASE_URL}/api/payments/callback`,
        description: 'Card Registration - Lulini',
        lang: lang || 'ka',
        ttl: 15,
        idempotencyKey: crypto.randomUUID()
    });

    // Mark this order for card saving (non-fatal if sandbox doesn't support it)
    try {
        await bogService.saveCardForFuturePayments(order.id);
    } catch (err) {
        console.warn('BOG save card flag failed (may not be supported in sandbox):', err.message);
    }

    await Payment.create({
        user: userId,
        bogOrderId: order.id,
        externalOrderId,
        type: 'card_registration',
        amount: 0.01,
        currency: 'GEL',
        status: 'created'
    });

    res.status(201).json({
        success: true,
        data: {
            orderId: order.id,
            redirectUrl: order.redirectUrl
        }
    });
});

// @desc    Verify card registration after user returns from BOG payment page
// @route   POST /api/payments/cards/verify/:orderId
// @access  Private
const verifyCardRegistration = catchAsync(async (req, res, next) => {
    const userId = req.user._id || req.user.id;

    const payment = await Payment.findOne({
        bogOrderId: req.params.orderId,
        user: userId,
        type: 'card_registration'
    });

    if (!payment) {
        return next(new AppError('Payment not found', 404));
    }

    if (payment.status === 'completed') {
        const card = await SavedCard.findOne({ bogOrderId: payment.bogOrderId, isActive: true });
        return res.json({ success: true, data: { status: 'completed', card } });
    }

    if (payment.status === 'rejected') {
        return res.json({ success: true, data: { status: 'rejected' } });
    }

    // Poll BOG for the actual order status
    try {
        const details = await bogService.getOrderDetails(payment.bogOrderId);
        const orderStatus = details.order_status?.key;
        const paymentDetail = details.payment_detail || {};

        if (orderStatus === 'completed') {
            payment.status = 'completed';
            payment.paymentDetail = {
                transferMethod: paymentDetail.transfer_method?.key,
                transactionId: paymentDetail.transaction_id,
                payerIdentifier: paymentDetail.payer_identifier,
                cardType: paymentDetail.card_type,
                cardExpiryDate: paymentDetail.card_expiry_date,
                paymentOption: paymentDetail.payment_option
            };
            await payment.save();

            // Save the card if not already saved
            let card = await SavedCard.findOne({ bogOrderId: payment.bogOrderId, isActive: true });
            if (!card && paymentDetail.payer_identifier) {
                const cardCount = await SavedCard.countDocuments({ user: userId, isActive: true });
                card = await SavedCard.create({
                    user: userId,
                    bogOrderId: payment.bogOrderId,
                    maskedPan: paymentDetail.payer_identifier,
                    cardType: paymentDetail.card_type || 'visa',
                    expiryDate: paymentDetail.card_expiry_date || 'N/A',
                    isDefault: cardCount === 0
                });
            }

            return res.json({ success: true, data: { status: 'completed', card } });
        }

        if (orderStatus === 'rejected') {
            payment.status = 'rejected';
            await payment.save();
            return res.json({ success: true, data: { status: 'rejected' } });
        }

        return res.json({ success: true, data: { status: orderStatus || payment.status } });
    } catch (err) {
        console.error('BOG verify card error:', err.message);
        return res.json({ success: true, data: { status: payment.status } });
    }
});

// @desc    Get user's saved cards
// @route   GET /api/payments/cards
// @access  Private
const getSavedCards = catchAsync(async (req, res) => {
    const userId = req.user._id || req.user.id;

    const cards = await SavedCard.find({ user: userId, isActive: true })
        .select('maskedPan cardType expiryDate isDefault createdAt')
        .sort({ isDefault: -1, createdAt: -1 });

    res.json({ success: true, data: { cards } });
});

// @desc    Delete a saved card
// @route   DELETE /api/payments/cards/:cardId
// @access  Private
const deleteCard = catchAsync(async (req, res, next) => {
    const userId = req.user._id || req.user.id;

    const card = await SavedCard.findOne({
        _id: req.params.cardId,
        user: userId,
        isActive: true
    });

    if (!card) {
        return next(new AppError('Card not found', 404));
    }

    try {
        await bogService.deleteSavedCard(card.bogOrderId);
    } catch (err) {
        console.error('BOG delete card error:', err.message);
    }

    card.isActive = false;
    await card.save();

    res.json({ success: true, message: 'Card removed successfully' });
});

// @desc    Set default card
// @route   PATCH /api/payments/cards/:cardId/default
// @access  Private
const setDefaultCard = catchAsync(async (req, res, next) => {
    const userId = req.user._id || req.user.id;

    const card = await SavedCard.findOne({
        _id: req.params.cardId,
        user: userId,
        isActive: true
    });

    if (!card) {
        return next(new AppError('Card not found', 404));
    }

    await SavedCard.updateMany(
        { user: userId, isActive: true },
        { isDefault: false }
    );

    card.isDefault = true;
    await card.save();

    res.json({ success: true, data: { card } });
});

// ──────────────────────────────────────────────────────
// Pre-ride Payment (charge card BEFORE requesting driver)
// ──────────────────────────────────────────────────────

// @desc    Charge a saved card for a ride (before requesting drivers)
// @route   POST /api/payments/ride/pre-charge
// @access  Private
const preChargeRide = catchAsync(async (req, res, next) => {
    const userId = req.user._id || req.user.id;
    const { cardId, amount, lang } = req.body;

    if (!amount || amount <= 0) {
        return next(new AppError('Invalid payment amount', 400));
    }

    // Find the card to charge
    let card;
    if (cardId) {
        card = await SavedCard.findOne({ _id: cardId, user: userId, isActive: true });
    } else {
        card = await SavedCard.findOne({ user: userId, isActive: true, isDefault: true })
            || await SavedCard.findOne({ user: userId, isActive: true });
    }

    if (!card) {
        return next(new AppError('No saved card found. Please add a card first.', 400));
    }

    const externalOrderId = `precharge_${userId}_${Date.now()}`;

    // Charge saved card via BOG recurrent payment
    const order = await bogService.chargeWithSavedCard(card.bogOrderId, {
        amount,
        currency: 'GEL',
        externalOrderId,
        callbackUrl: `${CALLBACK_BASE_URL}/api/payments/callback`,
        description: 'Lulini Ride Payment',
        lang: lang || 'ka',
        idempotencyKey: crypto.randomUUID()
    });

    // Create payment record (no ride linked yet — will be linked after ride creation)
    const payment = await Payment.create({
        user: userId,
        bogOrderId: order.id,
        externalOrderId,
        type: 'ride_payment',
        amount,
        currency: 'GEL',
        status: 'created',
        savedCard: card._id
    });

    res.status(201).json({
        success: true,
        data: {
            paymentId: payment._id,
            orderId: order.id,
            redirectUrl: order.redirectUrl,
            amount
        }
    });
});

// @desc    Verify pre-ride payment status (poll BOG after user returns from payment page)
// @route   POST /api/payments/ride/verify/:orderId
// @access  Private
const verifyRidePayment = catchAsync(async (req, res, next) => {
    const userId = req.user._id || req.user.id;

    const payment = await Payment.findOne({
        bogOrderId: req.params.orderId,
        user: userId,
        type: 'ride_payment'
    });

    if (!payment) {
        return next(new AppError('Payment not found', 404));
    }

    if (payment.status === 'completed') {
        return res.json({ success: true, data: { status: 'completed', paymentId: payment._id } });
    }

    if (payment.status === 'rejected') {
        return res.json({ success: true, data: { status: 'rejected' } });
    }

    // Poll BOG for the actual order status
    try {
        const details = await bogService.getOrderDetails(payment.bogOrderId);
        const orderStatus = details.order_status?.key;
        const paymentDetail = details.payment_detail || {};

        if (orderStatus === 'completed') {
            payment.status = 'completed';
            payment.paymentDetail = {
                transferMethod: paymentDetail.transfer_method?.key,
                transactionId: paymentDetail.transaction_id,
                payerIdentifier: paymentDetail.payer_identifier,
                cardType: paymentDetail.card_type,
                cardExpiryDate: paymentDetail.card_expiry_date,
                paymentOption: paymentDetail.payment_option,
                code: paymentDetail.code,
                codeDescription: paymentDetail.code_description
            };
            await payment.save();
            return res.json({ success: true, data: { status: 'completed', paymentId: payment._id } });
        }

        if (orderStatus === 'rejected') {
            payment.status = 'rejected';
            payment.rejectReason = details.reject_reason;
            await payment.save();
            return res.json({ success: true, data: { status: 'rejected' } });
        }

        return res.json({ success: true, data: { status: orderStatus || payment.status } });
    } catch (err) {
        console.error('BOG verify ride payment error:', err.message);
        return res.json({ success: true, data: { status: payment.status } });
    }
});

// @desc    Link a confirmed payment to a newly created ride
// @route   PATCH /api/payments/:paymentId/link-ride
// @access  Private
const linkPaymentToRide = catchAsync(async (req, res, next) => {
    const userId = req.user._id || req.user.id;
    const { rideId } = req.body;

    if (!rideId) {
        return next(new AppError('rideId is required', 400));
    }

    const payment = await Payment.findOne({
        _id: req.params.paymentId,
        user: userId,
        type: 'ride_payment',
        status: 'completed'
    });

    if (!payment) {
        return next(new AppError('Completed payment not found', 404));
    }

    if (payment.ride) {
        return next(new AppError('Payment already linked to a ride', 400));
    }

    // Verify ride belongs to user
    const ride = await Ride.findOne({ _id: rideId, user: userId });
    if (!ride) {
        return next(new AppError('Ride not found', 404));
    }

    payment.ride = rideId;
    await payment.save();

    // Mark ride as paid
    await Ride.updateOne({ _id: rideId }, { paymentStatus: 'completed' });

    res.json({ success: true, message: 'Payment linked to ride' });
});

// ──────────────────────────────────────────────────────
// BOG Callback & Status
// ──────────────────────────────────────────────────────

// @desc    BOG payment callback (webhook)
// @route   POST /api/payments/callback
// @access  Public (BOG server-to-server)
const handleCallback = catchAsync(async (req, res) => {
    const signature = req.headers['callback-signature'];
    const rawBody = req.rawBody;

    // Verify signature
    if (rawBody && signature) {
        const isValid = bogService.verifyCallbackSignature(rawBody, signature);
        if (!isValid) {
            console.error('BOG callback: invalid signature');
            return res.status(400).json({ error: 'Invalid signature' });
        }
    }

    const { event, body } = req.body;

    if (event !== 'order_payment') {
        return res.status(200).json({ received: true });
    }

    const bogOrderId = body.order_id;
    const orderStatus = body.order_status?.key;
    const paymentDetail = body.payment_detail || {};

    const payment = await Payment.findOne({ bogOrderId });
    if (!payment) {
        console.error(`BOG callback: payment not found for order ${bogOrderId}`);
        return res.status(200).json({ received: true });
    }

    // Update payment record
    payment.callbackReceived = true;
    payment.callbackData = body;
    payment.paymentDetail = {
        transferMethod: paymentDetail.transfer_method?.key,
        transactionId: paymentDetail.transaction_id,
        payerIdentifier: paymentDetail.payer_identifier,
        cardType: paymentDetail.card_type,
        cardExpiryDate: paymentDetail.card_expiry_date,
        paymentOption: paymentDetail.payment_option,
        code: paymentDetail.code,
        codeDescription: paymentDetail.code_description
    };

    const io = req.app.get('io');

    if (orderStatus === 'completed') {
        payment.status = 'completed';

        // Card registration: save the card
        if (payment.type === 'card_registration') {
            const existingCard = await SavedCard.findOne({
                bogOrderId: payment.bogOrderId,
                isActive: true
            });

            if (!existingCard && paymentDetail.payer_identifier) {
                const cardCount = await SavedCard.countDocuments({
                    user: payment.user,
                    isActive: true
                });

                await SavedCard.create({
                    user: payment.user,
                    bogOrderId: payment.bogOrderId,
                    maskedPan: paymentDetail.payer_identifier,
                    cardType: paymentDetail.card_type || 'visa',
                    expiryDate: paymentDetail.card_expiry_date || 'N/A',
                    isDefault: cardCount === 0
                });
            }
        }

        // Ride payment: update ride and notify user
        if (payment.type === 'ride_payment') {
            if (payment.ride) {
                await Ride.updateOne({ _id: payment.ride }, { paymentStatus: 'completed' });
            }

            if (io) {
                io.to(`user:${payment.user}`).emit('payment:completed', {
                    paymentId: payment._id,
                    orderId: payment.bogOrderId,
                    rideId: payment.ride,
                    amount: payment.amount
                });
            }
        }
    } else if (orderStatus === 'rejected') {
        payment.status = 'rejected';
        payment.rejectReason = body.reject_reason;

        if (io) {
            io.to(`user:${payment.user}`).emit('payment:failed', {
                paymentId: payment._id,
                orderId: payment.bogOrderId,
                rideId: payment.ride,
                reason: body.reject_reason
            });
        }
    } else {
        const statusMap = {
            'processing': 'processing',
            'refunded': 'refunded',
            'refunded_partially': 'refunded'
        };
        payment.status = statusMap[orderStatus] || payment.status;
    }

    await payment.save();
    res.status(200).json({ received: true });
});

// @desc    Check payment status
// @route   GET /api/payments/:paymentId/status
// @access  Private
const getPaymentStatus = catchAsync(async (req, res, next) => {
    const userId = req.user._id || req.user.id;

    const payment = await Payment.findOne({
        _id: req.params.paymentId,
        user: userId
    }).select('status amount currency type bogOrderId createdAt');

    if (!payment) {
        return next(new AppError('Payment not found', 404));
    }

    // If still pending, poll BOG
    if (payment.status === 'created' || payment.status === 'processing') {
        try {
            const details = await bogService.getOrderDetails(payment.bogOrderId);
            if (details.order_status?.key === 'completed') {
                payment.status = 'completed';
                await payment.save();
            } else if (details.order_status?.key === 'rejected') {
                payment.status = 'rejected';
                await payment.save();
            }
        } catch (err) {
            console.error('BOG status check error:', err.message);
        }
    }

    res.json({ success: true, data: { payment } });
});

// @desc    Redirect handlers (user returns from BOG payment page)
// @route   GET /api/payments/redirect/success
// @route   GET /api/payments/redirect/fail
// @access  Public
const handleRedirectSuccess = (req, res) => {
    res.redirect('lulini://payment/success');
};

const handleRedirectFail = (req, res) => {
    res.redirect('lulini://payment/fail');
};

module.exports = {
    registerCard,
    verifyCardRegistration,
    getSavedCards,
    deleteCard,
    setDefaultCard,
    preChargeRide,
    verifyRidePayment,
    linkPaymentToRide,
    handleCallback,
    getPaymentStatus,
    handleRedirectSuccess,
    handleRedirectFail
};
