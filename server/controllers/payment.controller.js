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
    const idempotencyKey = crypto.randomUUID();

    // Step 1: Create a small order for card verification
    const order = await bogService.createOrder({
        amount: 0.01,
        currency: 'GEL',
        externalOrderId,
        callbackUrl: `${CALLBACK_BASE_URL}/api/payments/callback`,
        redirectSuccess: `${CALLBACK_BASE_URL}/api/payments/redirect/success`,
        redirectFail: `${CALLBACK_BASE_URL}/api/payments/redirect/fail`,
        description: 'Card Registration - Lulini',
        lang: lang || 'ka',
        ttl: 15,
        idempotencyKey
    });

    // Step 2: Mark for recurrent card saving (variable amounts for ride fares)
    // Must be called BEFORE user is redirected to payment page
    await bogService.saveCardForRecurrent(order.id);

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
            payment.paymentDetail = extractPaymentDetail(paymentDetail);
            await payment.save();

            const card = await upsertSavedCard(userId, payment.bogOrderId, paymentDetail, 'recurrent');
            return res.json({ success: true, data: { status: 'completed', card } });
        }

        if (orderStatus === 'rejected') {
            payment.status = 'rejected';
            payment.rejectReason = details.reject_reason;
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

    // Delete from BOG (best-effort — deactivate locally regardless)
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
// Ride Payment with Preauthorization
// ──────────────────────────────────────────────────────
// Flow:
//   1. Before ride: preauthorize estimated fare (hold funds on card)
//   2. User requests ride, driver accepts, ride happens
//   3. After ride: approve preauth with actual fare (or reject if ride cancelled)

// @desc    Preauthorize a ride payment (hold funds on saved card)
// @route   POST /api/payments/ride/preauth
// @access  Private
const preauthRide = catchAsync(async (req, res, next) => {
    const userId = req.user._id || req.user.id;
    const { cardId, amount, lang } = req.body;

    if (!amount || amount <= 0) {
        return next(new AppError('Invalid payment amount', 400));
    }

    // Find the saved card
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

    const externalOrderId = `preauth_${userId}_${Date.now()}`;

    // Create a recurrent order with manual capture (preauthorization)
    // This charges the saved card's parent order, user sees BOG page briefly
    const order = await bogService.chargeRecurrent(card.bogOrderId, {
        amount,
        externalOrderId,
        callbackUrl: `${CALLBACK_BASE_URL}/api/payments/callback`,
        description: 'Lulini Ride - Hold',
        lang: lang || 'ka',
        idempotencyKey: crypto.randomUUID()
    });

    const payment = await Payment.create({
        user: userId,
        bogOrderId: order.id,
        externalOrderId,
        type: 'ride_preauth',
        amount,
        currency: 'GEL',
        status: 'created',
        captureMode: 'manual',
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

// @desc    Charge a saved card for a ride (standard recurrent, no preauth)
// @route   POST /api/payments/ride/charge
// @access  Private
const chargeRide = catchAsync(async (req, res, next) => {
    const userId = req.user._id || req.user.id;
    const { cardId, amount, rideId, lang } = req.body;

    if (!amount || amount <= 0) {
        return next(new AppError('Invalid payment amount', 400));
    }

    // Find the saved card
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

    const externalOrderId = `ride_${rideId || userId}_${Date.now()}`;

    const order = await bogService.chargeRecurrent(card.bogOrderId, {
        amount,
        externalOrderId,
        callbackUrl: `${CALLBACK_BASE_URL}/api/payments/callback`,
        description: 'Lulini Ride Payment',
        lang: lang || 'ka',
        idempotencyKey: crypto.randomUUID()
    });

    const payment = await Payment.create({
        user: userId,
        bogOrderId: order.id,
        externalOrderId,
        type: 'ride_payment',
        amount,
        currency: 'GEL',
        status: 'created',
        savedCard: card._id,
        ride: rideId || null
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

// @desc    Approve (capture) a preauthorized ride payment after ride completion
// @route   POST /api/payments/ride/approve/:paymentId
// @access  Private (or internal server call)
const approveRidePayment = catchAsync(async (req, res, next) => {
    const { amount, rideId } = req.body;

    const payment = await Payment.findOne({
        _id: req.params.paymentId,
        type: 'ride_preauth',
        captureMode: 'manual',
        status: { $in: ['blocked', 'completed'] }
    });

    if (!payment) {
        return next(new AppError('Preauthorized payment not found', 404));
    }

    const captureAmount = amount || payment.amount;

    const result = await bogService.approvePreauth(payment.bogOrderId, {
        amount: captureAmount,
        description: `Ride fare${rideId ? ` for ride ${rideId}` : ''}`,
        idempotencyKey: crypto.randomUUID()
    });

    payment.capturedAmount = captureAmount;
    payment.status = 'captured';
    if (rideId) payment.ride = rideId;
    await payment.save();

    if (rideId) {
        await Ride.updateOne({ _id: rideId }, { paymentStatus: 'completed' });
    }

    const io = req.app.get('io');
    if (io) {
        io.to(`user:${payment.user}`).emit('payment:captured', {
            paymentId: payment._id,
            orderId: payment.bogOrderId,
            rideId: payment.ride,
            amount: captureAmount
        });
    }

    res.json({ success: true, data: { actionId: result.actionId, capturedAmount: captureAmount } });
});

// @desc    Reject (cancel) a preauthorized ride payment
// @route   POST /api/payments/ride/reject/:paymentId
// @access  Private
const rejectRidePayment = catchAsync(async (req, res, next) => {
    const { reason } = req.body;

    const payment = await Payment.findOne({
        _id: req.params.paymentId,
        type: 'ride_preauth',
        captureMode: 'manual',
        status: { $in: ['blocked', 'completed'] }
    });

    if (!payment) {
        return next(new AppError('Preauthorized payment not found', 404));
    }

    const result = await bogService.rejectPreauth(payment.bogOrderId, {
        description: reason || 'Ride cancelled',
        idempotencyKey: crypto.randomUUID()
    });

    payment.status = 'cancelled';
    await payment.save();

    const io = req.app.get('io');
    if (io) {
        io.to(`user:${payment.user}`).emit('payment:cancelled', {
            paymentId: payment._id,
            orderId: payment.bogOrderId,
            rideId: payment.ride
        });
    }

    res.json({ success: true, data: { actionId: result.actionId } });
});

// @desc    Verify ride payment status (poll BOG)
// @route   POST /api/payments/ride/verify/:orderId
// @access  Private
const verifyRidePayment = catchAsync(async (req, res, next) => {
    const userId = req.user._id || req.user.id;

    const payment = await Payment.findOne({
        bogOrderId: req.params.orderId,
        user: userId,
        type: { $in: ['ride_payment', 'ride_preauth'] }
    });

    if (!payment) {
        return next(new AppError('Payment not found', 404));
    }

    if (['completed', 'captured', 'rejected', 'cancelled'].includes(payment.status)) {
        return res.json({ success: true, data: { status: payment.status, paymentId: payment._id } });
    }

    try {
        const details = await bogService.getOrderDetails(payment.bogOrderId);
        const orderStatus = details.order_status?.key;
        const paymentDetail = details.payment_detail || {};

        if (orderStatus === 'completed') {
            payment.status = 'completed';
            payment.paymentDetail = extractPaymentDetail(paymentDetail);
            await payment.save();
            return res.json({ success: true, data: { status: 'completed', paymentId: payment._id } });
        }

        if (orderStatus === 'blocked') {
            payment.status = 'blocked';
            payment.paymentDetail = extractPaymentDetail(paymentDetail);
            await payment.save();
            return res.json({ success: true, data: { status: 'blocked', paymentId: payment._id } });
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

// @desc    Link a confirmed payment to a ride
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
        type: { $in: ['ride_payment', 'ride_preauth'] },
        status: { $in: ['completed', 'blocked', 'captured'] }
    });

    if (!payment) {
        return next(new AppError('Payment not found or not in valid state', 404));
    }

    if (payment.ride) {
        return next(new AppError('Payment already linked to a ride', 400));
    }

    const ride = await Ride.findOne({ _id: rideId, user: userId });
    if (!ride) {
        return next(new AppError('Ride not found', 404));
    }

    payment.ride = rideId;
    await payment.save();

    if (payment.status === 'completed' || payment.status === 'captured') {
        await Ride.updateOne({ _id: rideId }, { paymentStatus: 'completed' });
    }

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

    // ALWAYS verify signature — reject unsigned or invalid callbacks
    if (!rawBody || !signature) {
        console.error('BOG callback: missing signature or body');
        return res.status(400).json({ error: 'Missing signature' });
    }

    const isValid = bogService.verifyCallbackSignature(rawBody, signature);
    if (!isValid) {
        console.error('BOG callback: invalid signature');
        return res.status(400).json({ error: 'Invalid signature' });
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

    // Idempotency: don't re-process if already in a terminal state
    if (['completed', 'captured', 'rejected', 'refunded', 'cancelled'].includes(payment.status)
        && payment.callbackReceived) {
        return res.status(200).json({ received: true });
    }

    // Update payment record with callback data
    payment.callbackReceived = true;
    payment.callbackData = body;
    payment.paymentDetail = extractPaymentDetail(paymentDetail);

    const io = req.app.get('io');

    if (orderStatus === 'completed') {
        payment.status = 'completed';

        // Card registration: save the card
        if (payment.type === 'card_registration') {
            await upsertSavedCard(payment.user, payment.bogOrderId, paymentDetail, 'recurrent');
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
    } else if (orderStatus === 'blocked') {
        // Preauth: funds held successfully
        payment.status = 'blocked';

        if (io) {
            io.to(`user:${payment.user}`).emit('payment:held', {
                paymentId: payment._id,
                orderId: payment.bogOrderId,
                amount: payment.amount
            });
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
            'refunded_partially': 'refunded',
            'partial_completed': 'completed'
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
    }).select('status amount capturedAmount currency type bogOrderId captureMode createdAt');

    if (!payment) {
        return next(new AppError('Payment not found', 404));
    }

    // If still pending, poll BOG as fallback
    if (['created', 'processing'].includes(payment.status)) {
        try {
            const details = await bogService.getOrderDetails(payment.bogOrderId);
            const newStatus = details.order_status?.key;
            if (newStatus === 'completed') {
                payment.status = 'completed';
                await payment.save();
            } else if (newStatus === 'blocked') {
                payment.status = 'blocked';
                await payment.save();
            } else if (newStatus === 'rejected') {
                payment.status = 'rejected';
                payment.rejectReason = details.reject_reason;
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
    // 302 redirect to custom scheme — openAuthSessionAsync intercepts this
    // and auto-closes the browser before Safari tries to open the URL
    res.redirect('lulini://payment/success');
};

const handleRedirectFail = (req, res) => {
    res.redirect('lulini://payment/fail');
};

// ──────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────

function extractPaymentDetail(paymentDetail) {
    return {
        transferMethod: paymentDetail.transfer_method?.key,
        transactionId: paymentDetail.transaction_id,
        payerIdentifier: paymentDetail.payer_identifier,
        cardType: paymentDetail.card_type,
        cardExpiryDate: paymentDetail.card_expiry_date,
        paymentOption: paymentDetail.payment_option,
        code: paymentDetail.code,
        codeDescription: paymentDetail.code_description,
        authCode: paymentDetail.auth_code
    };
}

async function upsertSavedCard(userId, bogOrderId, paymentDetail, saveType) {
    let card = await SavedCard.findOne({ bogOrderId, isActive: true });
    if (!card && paymentDetail.payer_identifier) {
        const cardCount = await SavedCard.countDocuments({ user: userId, isActive: true });
        card = await SavedCard.create({
            user: userId,
            bogOrderId,
            maskedPan: paymentDetail.payer_identifier,
            cardType: paymentDetail.card_type || 'visa',
            expiryDate: paymentDetail.card_expiry_date || 'N/A',
            saveType,
            isDefault: cardCount === 0
        });
    }
    return card;
}

module.exports = {
    registerCard,
    verifyCardRegistration,
    getSavedCards,
    deleteCard,
    setDefaultCard,
    preauthRide,
    chargeRide,
    approveRidePayment,
    rejectRidePayment,
    verifyRidePayment,
    linkPaymentToRide,
    handleCallback,
    getPaymentStatus,
    handleRedirectSuccess,
    handleRedirectFail
};
