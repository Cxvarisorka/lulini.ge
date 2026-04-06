'use strict';

const crypto = require('crypto');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const Payment = require('../models/payment.model');
const SavedCard = require('../models/savedCard.model');
const Ride = require('../models/ride.model');
const bogService = require('../services/bog.service');
const { emitCritical } = require('../utils/socketHelpers');
const logger = require('../utils/logger');

const LOG_TAG = 'payment';
const CALLBACK_BASE_URL = process.env.BOG_CALLBACK_URL || 'https://api.lulini.ge';
const MAX_SAVED_CARDS_PER_USER = 5;
const DUPLICATE_WINDOW_MS = 2 * 60 * 1000; // 2 minutes

// BOG response codes -> i18n keys
const BOG_RESPONSE_CODES = {
    100: 'payment.success',
    101: 'payment.errors.cardRestricted',
    102: 'payment.errors.savedCardNotFound',
    103: 'payment.errors.invalidCard',
    104: 'payment.errors.transactionLimitExceeded',
    105: 'payment.errors.cardExpired',
    106: 'payment.errors.amountLimitExceeded',
    107: 'payment.errors.insufficientFunds',
    108: 'payment.errors.authDeclined',
    109: 'payment.errors.technicalIssue',
    110: 'payment.errors.transactionExpired',
    111: 'payment.errors.authTimeout',
    112: 'payment.errors.generalError',
    199: 'payment.errors.unknownError',
    200: 'payment.preauthSuccess'
};

// ──────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────

function getUserId(req) {
    return req.user._id || req.user.id;
}

function buildCallbackUrl() {
    return `${CALLBACK_BASE_URL}/api/payments/callback`;
}

function buildRedirectUrls() {
    return {
        success: `${CALLBACK_BASE_URL}/api/payments/redirect/success`,
        fail: `${CALLBACK_BASE_URL}/api/payments/redirect/fail`
    };
}

function extractPaymentDetail(pd) {
    return {
        transferMethod: pd.transfer_method?.key,
        transactionId: pd.transaction_id,
        payerIdentifier: pd.payer_identifier,
        cardType: pd.card_type,
        cardExpiryDate: pd.card_expiry_date,
        paymentOption: pd.payment_option,
        code: pd.code,
        codeDescription: pd.code_description,
        authCode: pd.auth_code
    };
}

function isCardExpired(expiryDate) {
    if (!expiryDate || expiryDate === 'N/A') return false;
    const parts = expiryDate.split('/');
    if (parts.length !== 2) return false;
    const [mm, yy] = parts.map(Number);
    if (!mm || !yy) return false;
    const expiryEnd = new Date(2000 + yy, mm, 0, 23, 59, 59);
    return Date.now() > expiryEnd.getTime();
}

function bogCodeToErrorKey(code) {
    const bogCode = code ? parseInt(code) : null;
    return bogCode ? (BOG_RESPONSE_CODES[bogCode] || 'payment.errors.generalError') : null;
}

/**
 * Upsert a saved card record after successful card-saving payment.
 */
async function upsertSavedCard(userId, bogOrderId, paymentDetail, saveType) {
    let card = await SavedCard.findOne({ bogOrderId, isActive: true });
    if (card) return card;

    if (!paymentDetail.payer_identifier) return null;

    const cardCount = await SavedCard.countDocuments({ user: userId, isActive: true });
    if (cardCount >= MAX_SAVED_CARDS_PER_USER) {
        logger.warn(`User ${userId} at max saved cards (${MAX_SAVED_CARDS_PER_USER}), skipping save`, LOG_TAG);
        return null;
    }

    card = await SavedCard.create({
        user: userId,
        bogOrderId,
        maskedPan: paymentDetail.payer_identifier,
        cardType: paymentDetail.card_type || 'visa',
        expiryDate: paymentDetail.card_expiry_date || 'N/A',
        saveType,
        isDefault: cardCount === 0
    });

    return card;
}

/**
 * Find user's saved card by ID or default.
 */
async function findUserCard(userId, cardId) {
    if (cardId) {
        return SavedCard.findOne({ _id: cardId, user: userId, isActive: true });
    }
    return SavedCard.findOne({ user: userId, isActive: true, isDefault: true })
        || SavedCard.findOne({ user: userId, isActive: true });
}

/**
 * Guard against duplicate payment creation within a short window.
 * Returns the existing pending payment if one exists.
 */
async function findRecentPendingPayment(userId, types) {
    return Payment.findOne({
        user: userId,
        status: { $in: ['created', 'processing'] },
        type: { $in: types },
        createdAt: { $gt: new Date(Date.now() - DUPLICATE_WINDOW_MS) }
    });
}

// ──────────────────────────────────────────────────────
// Card Management
// ──────────────────────────────────────────────────────

// POST /api/payments/cards/register
const registerCard = catchAsync(async (req, res) => {
    const userId = getUserId(req);
    const { lang } = req.body;

    const cardCount = await SavedCard.countDocuments({ user: userId, isActive: true });
    if (cardCount >= MAX_SAVED_CARDS_PER_USER) {
        return res.status(400).json({ success: false, error: 'Maximum saved cards reached' });
    }

    const externalOrderId = `card_reg_${userId}_${Date.now()}`;
    const idempotencyKey = crypto.randomUUID();
    const redirects = buildRedirectUrls();

    const order = await bogService.createOrder({
        amount: 0.01,
        currency: 'GEL',
        externalOrderId,
        callbackUrl: buildCallbackUrl(),
        redirectSuccess: redirects.success,
        redirectFail: redirects.fail,
        description: 'Card Registration - Lulini',
        lang: lang || 'ka',
        ttl: 15,
        idempotencyKey
    });

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
        data: { orderId: order.id, redirectUrl: order.redirectUrl }
    });
});

// POST /api/payments/cards/verify/:orderId
const verifyCardRegistration = catchAsync(async (req, res, next) => {
    const userId = getUserId(req);

    const payment = await Payment.findOne({
        bogOrderId: req.params.orderId,
        user: userId,
        type: 'card_registration'
    });

    if (!payment) {
        return next(new AppError('Payment not found', 404));
    }

    // If callback already confirmed, trust it
    if (payment.callbackReceived) {
        const card = payment.status === 'completed'
            ? await SavedCard.findOne({ bogOrderId: payment.bogOrderId, isActive: true })
            : null;
        return res.json({ success: true, data: { status: payment.status, card } });
    }

    // Terminal state already set (by previous poll)
    if (['completed', 'rejected'].includes(payment.status) && !payment.callbackReceived) {
        // Already polled before — return what we have, wait for callback to finalize
        const card = payment.status === 'completed'
            ? await SavedCard.findOne({ bogOrderId: payment.bogOrderId, isActive: true })
            : null;
        return res.json({ success: true, data: { status: payment.status, card } });
    }

    // Fallback: poll BOG
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
        logger.error(`Verify card poll error: ${err.message}`, LOG_TAG);
        return res.json({ success: true, data: { status: payment.status } });
    }
});

// GET /api/payments/cards
const getSavedCards = catchAsync(async (req, res) => {
    const userId = getUserId(req);

    const cards = await SavedCard.find({ user: userId, isActive: true })
        .select('maskedPan cardType expiryDate isDefault createdAt')
        .sort({ isDefault: -1, createdAt: -1 });

    res.json({ success: true, data: { cards } });
});

// DELETE /api/payments/cards/:cardId
const deleteCard = catchAsync(async (req, res, next) => {
    const userId = getUserId(req);

    const card = await SavedCard.findOne({
        _id: req.params.cardId,
        user: userId,
        isActive: true
    });

    if (!card) {
        return next(new AppError('Card not found', 404));
    }

    // Deactivate locally first (ensures user can't charge it anymore)
    card.isActive = false;
    await card.save();

    // Best-effort delete from BOG
    try {
        await bogService.deleteSavedCard(card.bogOrderId);
    } catch (err) {
        logger.error(`BOG delete card error for ${card.bogOrderId}: ${err.message}`, LOG_TAG);
    }

    res.json({ success: true, message: 'Card removed' });
});

// PATCH /api/payments/cards/:cardId/default
const setDefaultCard = catchAsync(async (req, res, next) => {
    const userId = getUserId(req);

    const card = await SavedCard.findOne({
        _id: req.params.cardId,
        user: userId,
        isActive: true
    });

    if (!card) {
        return next(new AppError('Card not found', 404));
    }

    await SavedCard.updateMany({ user: userId, isActive: true }, { isDefault: false });
    card.isDefault = true;
    await card.save();

    res.json({ success: true, data: { card } });
});

// ──────────────────────────────────────────────────────
// Ride Payments
// ──────────────────────────────────────────────────────

// POST /api/payments/ride/preauth — Hold funds on saved card before ride
const preauthRide = catchAsync(async (req, res, next) => {
    const userId = getUserId(req);
    const { cardId, amount, lang } = req.body;

    if (!amount || amount <= 0) {
        return next(new AppError('Invalid payment amount', 400));
    }

    // Duplicate-submit guard
    const existing = await findRecentPendingPayment(userId, ['ride_preauth']);
    if (existing) {
        return res.status(409).json({
            success: false,
            error: 'A preauthorization is already in progress',
            data: { paymentId: existing._id, orderId: existing.bogOrderId }
        });
    }

    const card = await findUserCard(userId, cardId);
    if (!card) {
        return next(new AppError('No saved card found. Please add a card first.', 400));
    }
    if (isCardExpired(card.expiryDate)) {
        return next(new AppError('Card has expired. Please add a new card.', 400));
    }

    const externalOrderId = `preauth_${userId}_${Date.now()}`;
    const redirects = buildRedirectUrls();

    const order = await bogService.chargeRecurrent(card.bogOrderId, {
        amount,
        capture: 'manual',
        externalOrderId,
        callbackUrl: buildCallbackUrl(),
        redirectSuccess: redirects.success,
        redirectFail: redirects.fail,
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

// POST /api/payments/ride/charge — Charge saved card directly (automatic capture)
const chargeRide = catchAsync(async (req, res, next) => {
    const userId = getUserId(req);
    const { cardId, amount, rideId, lang } = req.body;

    if (!amount || amount <= 0) {
        return next(new AppError('Invalid payment amount', 400));
    }

    // Duplicate-submit guard
    const existing = await findRecentPendingPayment(userId, ['ride_payment']);
    if (existing) {
        return res.status(409).json({
            success: false,
            error: 'A payment is already in progress',
            data: { paymentId: existing._id, orderId: existing.bogOrderId }
        });
    }

    const card = await findUserCard(userId, cardId);
    if (!card) {
        return next(new AppError('No saved card found. Please add a card first.', 400));
    }
    if (isCardExpired(card.expiryDate)) {
        return next(new AppError('Card has expired. Please add a new card.', 400));
    }

    const externalOrderId = `ride_${rideId || userId}_${Date.now()}`;
    const redirects = buildRedirectUrls();

    const order = await bogService.chargeRecurrent(card.bogOrderId, {
        amount,
        externalOrderId,
        callbackUrl: buildCallbackUrl(),
        redirectSuccess: redirects.success,
        redirectFail: redirects.fail,
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

    // Return redirectUrl so mobile can open browser if polling times out (3DS required)
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

// POST /api/payments/ride/pay — One-time payment (no saved card)
const payRide = catchAsync(async (req, res, next) => {
    const userId = getUserId(req);
    const { amount, rideId, paymentMethods, lang, capture } = req.body;

    if (!amount || amount <= 0) {
        return next(new AppError('Invalid payment amount', 400));
    }

    // Duplicate-submit guard
    const existing = await findRecentPendingPayment(userId, ['ride_payment', 'ride_preauth']);
    if (existing) {
        return res.status(409).json({
            success: false,
            error: 'A payment is already in progress',
            data: { paymentId: existing._id, orderId: existing.bogOrderId }
        });
    }

    const methods = Array.isArray(paymentMethods) && paymentMethods.length > 0
        ? paymentMethods
        : ['card'];
    const captureMode = capture || 'automatic';
    const isPreauth = captureMode === 'manual';
    const externalOrderId = `${isPreauth ? 'preauth' : 'pay'}_${rideId || userId}_${Date.now()}`;
    const redirects = buildRedirectUrls();

    const order = await bogService.createOrder({
        amount,
        currency: 'GEL',
        externalOrderId,
        callbackUrl: buildCallbackUrl(),
        redirectSuccess: redirects.success,
        redirectFail: redirects.fail,
        description: isPreauth ? 'Lulini Ride - Hold' : 'Lulini Ride Payment',
        lang: lang || 'ka',
        ttl: 30,
        capture: captureMode,
        paymentMethods: methods,
        idempotencyKey: crypto.randomUUID()
    });

    const payment = await Payment.create({
        user: userId,
        bogOrderId: order.id,
        externalOrderId,
        type: isPreauth ? 'ride_preauth' : 'ride_payment',
        amount,
        currency: 'GEL',
        status: 'created',
        captureMode,
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

// ──────────────────────────────────────────────────────
// Preauthorization Approve / Reject
// ──────────────────────────────────────────────────────

// POST /api/payments/ride/approve/:paymentId — Capture held funds
const approveRidePayment = catchAsync(async (req, res, next) => {
    const userId = getUserId(req);
    const { amount, rideId } = req.body;

    const payment = await Payment.findOne({
        _id: req.params.paymentId,
        user: userId,
        type: 'ride_preauth',
        captureMode: 'manual',
        status: 'blocked'
    });

    if (!payment) {
        return next(new AppError('Preauthorized payment not found or not in held state', 404));
    }

    const captureAmount = amount || payment.amount;

    if (captureAmount > payment.amount) {
        return next(new AppError('Capture amount exceeds held amount', 400));
    }

    const result = await bogService.approvePreauth(payment.bogOrderId, {
        amount: captureAmount,
        description: `Ride fare${rideId ? ` for ride ${rideId}` : ''}`,
        idempotencyKey: crypto.randomUUID()
    });

    // Set intermediate status — callback will confirm with 'completed'
    payment.capturedAmount = captureAmount;
    payment.status = 'capture_requested';
    if (rideId) payment.ride = rideId;
    await payment.save();

    logger.info(`Preauth approve requested: ${payment.bogOrderId} amount=${captureAmount} actionId=${result.actionId}`, LOG_TAG);

    res.json({
        success: true,
        data: { actionId: result.actionId, capturedAmount: captureAmount, status: 'capture_requested' }
    });
});

// POST /api/payments/ride/reject/:paymentId — Release held funds
const rejectRidePayment = catchAsync(async (req, res, next) => {
    const userId = getUserId(req);
    const { reason } = req.body;

    const payment = await Payment.findOne({
        _id: req.params.paymentId,
        user: userId,
        type: 'ride_preauth',
        captureMode: 'manual',
        status: 'blocked'
    });

    if (!payment) {
        return next(new AppError('Preauthorized payment not found or not in held state', 404));
    }

    const result = await bogService.rejectPreauth(payment.bogOrderId, {
        description: reason || 'Ride cancelled',
        idempotencyKey: crypto.randomUUID()
    });

    // BOG docs don't guarantee a callback for cancellations, so set terminal status directly.
    // If a callback does come, the handler will see 'cancelled' (terminal) and skip.
    payment.status = 'cancelled';
    await payment.save();

    if (payment.ride) {
        await Ride.updateOne({ _id: payment.ride }, { paymentStatus: 'failed' });
    }

    logger.info(`Preauth reject: ${payment.bogOrderId} actionId=${result.actionId}`, LOG_TAG);

    const io = req.app.get('io');
    emitCritical(io, `user:${payment.user}`, 'payment:cancelled', {
        paymentId: payment._id,
        orderId: payment.bogOrderId,
        rideId: payment.ride
    });

    res.json({ success: true, data: { actionId: result.actionId, status: 'cancelled' } });
});

// ──────────────────────────────────────────────────────
// Payment Verification (polling fallback)
// ──────────────────────────────────────────────────────

// POST /api/payments/ride/verify/:orderId
const verifyRidePayment = catchAsync(async (req, res, next) => {
    const userId = getUserId(req);

    const payment = await Payment.findOne({
        bogOrderId: req.params.orderId,
        user: userId,
        type: { $in: ['ride_payment', 'ride_preauth'] }
    });

    if (!payment) {
        return next(new AppError('Payment not found', 404));
    }

    // If callback already arrived, trust it — callback is source of truth
    if (payment.callbackReceived) {
        return res.json({
            success: true,
            data: { status: payment.status, paymentId: payment._id }
        });
    }

    // Already in a resolved state from a prior poll
    if (['completed', 'rejected', 'cancelled', 'blocked', 'capture_requested'].includes(payment.status)) {
        return res.json({
            success: true,
            data: { status: payment.status, paymentId: payment._id }
        });
    }

    // Still pending — poll BOG as fallback
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

            const errorKey = bogCodeToErrorKey(paymentDetail.code);
            return res.json({ success: true, data: { status: 'rejected', errorKey } });
        }

        return res.json({ success: true, data: { status: orderStatus || payment.status } });
    } catch (err) {
        logger.error(`Verify ride poll error: ${err.message}`, LOG_TAG);
        return res.json({ success: true, data: { status: payment.status } });
    }
});

// PATCH /api/payments/:paymentId/link-ride
const linkPaymentToRide = catchAsync(async (req, res, next) => {
    const userId = getUserId(req);
    const { rideId } = req.body;

    if (!rideId) {
        return next(new AppError('rideId is required', 400));
    }

    const payment = await Payment.findOne({
        _id: req.params.paymentId,
        user: userId,
        type: { $in: ['ride_payment', 'ride_preauth'] },
        status: { $in: ['completed', 'blocked', 'capture_requested'] }
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

    if (payment.status === 'completed') {
        await Ride.updateOne({ _id: rideId }, { paymentStatus: 'completed' });
    } else if (payment.status === 'blocked') {
        await Ride.updateOne({ _id: rideId }, { paymentStatus: 'held' });
    }

    res.json({ success: true, message: 'Payment linked to ride' });
});

// ──────────────────────────────────────────────────────
// Refund
// ──────────────────────────────────────────────────────

// POST /api/payments/:paymentId/refund
const refundPayment = catchAsync(async (req, res, next) => {
    const userId = getUserId(req);
    const { amount, reason } = req.body;

    const payment = await Payment.findOne({
        _id: req.params.paymentId,
        user: userId,
        status: { $in: ['completed', 'refunded_partially'] }
    });

    if (!payment) {
        return next(new AppError('Payment not found or not in refundable state', 404));
    }

    const effectiveTotal = payment.capturedAmount || payment.amount;
    const alreadyRefunded = payment.refundedTotal || 0;
    const refundableRemaining = effectiveTotal - alreadyRefunded;

    const refundAmount = amount || refundableRemaining;

    if (refundAmount <= 0 || refundAmount > refundableRemaining) {
        return next(new AppError(`Refund amount must be between 0.01 and ${refundableRemaining}`, 400));
    }

    const result = await bogService.refundPayment(payment.bogOrderId, {
        amount: amount || undefined, // undefined = full refund
        idempotencyKey: crypto.randomUUID()
    });

    // Set intermediate status — callback will confirm the actual refund
    payment.status = 'refund_requested';
    payment.refundReason = reason || null;
    payment.refundHistory.push({
        amount: refundAmount,
        reason: reason || null,
        actionId: result.actionId,
        requestedAt: new Date()
    });
    await payment.save();

    logger.info(`Refund requested: ${payment.bogOrderId} amount=${refundAmount} actionId=${result.actionId}`, LOG_TAG);

    res.json({
        success: true,
        data: { actionId: result.actionId, refundAmount, status: 'refund_requested' }
    });
});

// ──────────────────────────────────────────────────────
// BOG Callback (Webhook)
// ──────────────────────────────────────────────────────

// POST /api/payments/callback — Public, signature-verified
const handleCallback = catchAsync(async (req, res) => {
    const signature = req.headers['callback-signature'];
    const rawBody = req.rawBody;

    if (!rawBody || !signature) {
        logger.error('Callback: missing signature or body', LOG_TAG);
        return res.status(400).json({ error: 'Missing signature' });
    }

    const isValid = bogService.verifyCallbackSignature(rawBody, signature);
    if (!isValid) {
        logger.error('Callback: invalid signature', LOG_TAG);
        return res.status(400).json({ error: 'Invalid signature' });
    }

    const { event, body } = req.body;

    if (event !== 'order_payment') {
        return res.status(200).json({ received: true });
    }

    const bogOrderId = body.order_id;
    const orderStatus = body.order_status?.key;
    const paymentDetail = body.payment_detail || {};
    const transferAmount = parseFloat(body.purchase_units?.transfer_amount);

    const payment = await Payment.findOne({ bogOrderId });
    if (!payment) {
        logger.error(`Callback: payment not found for order ${bogOrderId}`, LOG_TAG);
        return res.status(200).json({ received: true });
    }

    // Amount validation (log mismatch, don't reject — BOG is authoritative)
    if (transferAmount && payment.type !== 'card_registration') {
        if (Math.abs(transferAmount - payment.amount) > 0.01) {
            logger.warn(
                `Callback amount mismatch for ${bogOrderId}: expected=${payment.amount} received=${transferAmount}`,
                LOG_TAG
            );
        }
    }

    // State transition validation: determine if this callback should be processed.
    // Callbacks can arrive for: payment completion, preauth block, rejection, refund.
    const previousStatus = payment.status;

    // Already processed and in a true terminal state with callback received
    if (Payment.isTerminal(previousStatus) && payment.callbackReceived) {
        return res.status(200).json({ received: true });
    }

    // Update callback tracking
    payment.callbackReceived = true;
    payment.callbackData = body;
    payment.paymentDetail = extractPaymentDetail(paymentDetail);

    const io = req.app.get('io');

    switch (orderStatus) {
        case 'completed': {
            // Could be: initial payment completion, OR preauth capture confirmation
            payment.status = 'completed';

            if (payment.type === 'card_registration') {
                await upsertSavedCard(payment.user, payment.bogOrderId, paymentDetail, 'recurrent');
                // NOTE: Do NOT auto-refund the 0.01 GEL registration charge.
                // The bogOrderId serves as parent_order_id for future recurrent charges.
                // Refunding it may invalidate the saved card reference at BOG.
            }

            if (payment.type === 'ride_payment' || (payment.type === 'ride_preauth' && previousStatus === 'capture_requested')) {
                if (payment.ride) {
                    await Ride.updateOne({ _id: payment.ride }, { paymentStatus: 'completed' });
                }
                emitCritical(io, `user:${payment.user}`, 'payment:completed', {
                    paymentId: payment._id,
                    orderId: payment.bogOrderId,
                    rideId: payment.ride,
                    amount: payment.capturedAmount || payment.amount
                });
            }
            break;
        }

        case 'blocked': {
            // Preauth: funds held successfully
            payment.status = 'blocked';

            emitCritical(io, `user:${payment.user}`, 'payment:held', {
                paymentId: payment._id,
                orderId: payment.bogOrderId,
                amount: payment.amount
            });
            break;
        }

        case 'rejected': {
            payment.status = 'rejected';
            payment.rejectReason = body.reject_reason;

            const errorKey = bogCodeToErrorKey(paymentDetail.code);

            emitCritical(io, `user:${payment.user}`, 'payment:failed', {
                paymentId: payment._id,
                orderId: payment.bogOrderId,
                rideId: payment.ride,
                reason: body.reject_reason,
                errorKey
            });
            break;
        }

        case 'refunded': {
            payment.status = 'refunded';
            const refundAmt = parseFloat(body.purchase_units?.refund_amount) || 0;
            payment.refundedTotal = refundAmt;

            // Confirm the pending refund in history
            const pendingRefund = payment.refundHistory.find(r => !r.confirmedAt);
            if (pendingRefund) pendingRefund.confirmedAt = new Date();

            if (payment.ride) {
                await Ride.updateOne({ _id: payment.ride }, { paymentStatus: 'refunded' });
            }

            emitCritical(io, `user:${payment.user}`, 'payment:refunded', {
                paymentId: payment._id,
                orderId: payment.bogOrderId,
                rideId: payment.ride,
                refundAmount: refundAmt,
                isPartial: false
            });
            break;
        }

        case 'refunded_partially': {
            payment.status = 'refunded_partially';
            const partialRefundAmt = parseFloat(body.purchase_units?.refund_amount) || 0;
            payment.refundedTotal = partialRefundAmt;

            const pendingPartialRefund = payment.refundHistory.find(r => !r.confirmedAt);
            if (pendingPartialRefund) pendingPartialRefund.confirmedAt = new Date();

            emitCritical(io, `user:${payment.user}`, 'payment:refunded', {
                paymentId: payment._id,
                orderId: payment.bogOrderId,
                rideId: payment.ride,
                refundAmount: partialRefundAmt,
                isPartial: true
            });
            break;
        }

        default: {
            // Map remaining BOG statuses
            const statusMap = {
                'processing': 'processing',
                'created': 'created',
                'partial_completed': 'completed'
            };
            if (statusMap[orderStatus]) {
                payment.status = statusMap[orderStatus];
            }
            break;
        }
    }

    await payment.save();

    logger.info(`Callback processed: ${bogOrderId} ${previousStatus}->${payment.status}`, LOG_TAG);

    res.status(200).json({ received: true });
});

// ──────────────────────────────────────────────────────
// Payment Status & History
// ──────────────────────────────────────────────────────

// GET /api/payments/:paymentId/status
const getPaymentStatus = catchAsync(async (req, res, next) => {
    const userId = getUserId(req);

    const payment = await Payment.findOne({
        _id: req.params.paymentId,
        user: userId
    }).select('status amount capturedAmount currency type bogOrderId captureMode callbackReceived createdAt');

    if (!payment) {
        return next(new AppError('Payment not found', 404));
    }

    // If still pending and callback hasn't arrived, poll BOG
    if (['created', 'processing'].includes(payment.status) && !payment.callbackReceived) {
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
            logger.error(`Status poll error: ${err.message}`, LOG_TAG);
        }
    }

    res.json({ success: true, data: { payment } });
});

// GET /api/payments/history
const getPaymentHistory = catchAsync(async (req, res) => {
    const userId = getUserId(req);
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const skip = (page - 1) * limit;

    const filter = {
        user: userId,
        type: { $in: ['ride_payment', 'ride_preauth'] }
    };

    const [payments, total] = await Promise.all([
        Payment.find(filter)
            .select('amount currency status type bogOrderId ride createdAt paymentDetail.transferMethod paymentDetail.cardType')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('ride', 'pickup.address dropoff.address'),
        Payment.countDocuments(filter)
    ]);

    res.json({
        success: true,
        data: {
            payments,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) }
        }
    });
});

// GET /api/payments/pending — For app restart recovery
const getPendingPayments = catchAsync(async (req, res) => {
    const userId = getUserId(req);

    const payments = await Payment.find({
        user: userId,
        status: { $in: ['created', 'processing', 'blocked', 'capture_requested', 'refund_requested'] },
        type: { $in: ['ride_payment', 'ride_preauth'] }
    })
        .select('amount currency status type bogOrderId ride captureMode createdAt')
        .sort({ createdAt: -1 })
        .limit(5);

    res.json({ success: true, data: { payments } });
});

// ──────────────────────────────────────────────────────
// Redirect Handlers
// ──────────────────────────────────────────────────────

const handleRedirectSuccess = (req, res) => {
    res.redirect('lulini://payment/success');
};

const handleRedirectFail = (req, res) => {
    res.redirect('lulini://payment/fail');
};

// ──────────────────────────────────────────────────────
// Exports
// ──────────────────────────────────────────────────────

module.exports = {
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
};
