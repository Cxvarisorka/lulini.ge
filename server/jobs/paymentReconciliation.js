'use strict';

/**
 * Payment Reconciliation Job
 *
 * Resolves payments stuck in non-terminal states by polling BOG for actual status.
 * Runs periodically (recommended: every 5-10 minutes) on the primary worker.
 *
 * Handles:
 *   1. Payments stuck in 'created'/'processing' past their TTL (callback never arrived)
 *   2. Payments stuck in 'capture_requested' (approve sent, callback not received)
 *   3. Payments stuck in 'refund_requested' (refund sent, callback not received)
 */

const Payment = require('../models/payment.model');
const Ride = require('../models/ride.model');
const bogService = require('../services/bog.service');
const logger = require('../utils/logger');

const LOG_TAG = 'reconciliation';

// Thresholds
const STALE_PAYMENT_AGE_MS = 30 * 60 * 1000;       // 30 min for created/processing
const STALE_ACTION_AGE_MS = 15 * 60 * 1000;         // 15 min for capture/refund requests
const BATCH_SIZE = 30;

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

/**
 * Reconcile a single payment by polling BOG.
 * @returns {string|null} New status or null if unchanged
 */
async function reconcileOne(payment) {
    const details = await bogService.getOrderDetails(payment.bogOrderId);
    const orderStatus = details.order_status?.key;
    const paymentDetail = details.payment_detail || {};

    if (!orderStatus) return null;

    const previousStatus = payment.status;
    let changed = false;

    switch (orderStatus) {
        case 'completed':
            if (!['completed', 'refund_requested', 'refunded', 'refunded_partially'].includes(previousStatus)) {
                payment.status = 'completed';
                payment.paymentDetail = extractPaymentDetail(paymentDetail);
                changed = true;
            }
            break;

        case 'blocked':
            if (previousStatus !== 'blocked') {
                payment.status = 'blocked';
                payment.paymentDetail = extractPaymentDetail(paymentDetail);
                changed = true;
            }
            break;

        case 'rejected':
            if (!Payment.isTerminal(previousStatus)) {
                payment.status = 'rejected';
                payment.rejectReason = details.reject_reason || 'expiration';
                changed = true;
            }
            break;

        case 'refunded':
            payment.status = 'refunded';
            payment.refundedTotal = parseFloat(details.purchase_units?.refund_amount) || 0;
            changed = true;
            break;

        case 'refunded_partially':
            payment.status = 'refunded_partially';
            payment.refundedTotal = parseFloat(details.purchase_units?.refund_amount) || 0;
            changed = true;
            break;

        case 'created':
            // Still created at BOG after 30+ min = TTL expired, mark rejected
            if (previousStatus === 'created') {
                payment.status = 'rejected';
                payment.rejectReason = 'expiration';
                changed = true;
            }
            break;
    }

    if (changed) {
        await payment.save();

        // Update linked ride
        if (payment.ride) {
            const rideStatusMap = {
                'completed': 'completed',
                'rejected': 'failed',
                'refunded': 'refunded',
                'refunded_partially': 'refunded'
            };
            const rideStatus = rideStatusMap[payment.status];
            if (rideStatus) {
                await Ride.updateOne({ _id: payment.ride }, { paymentStatus: rideStatus });
            }
        }

        logger.info(`Reconciled ${payment.bogOrderId}: ${previousStatus} -> ${payment.status}`, LOG_TAG);
    }

    return changed ? payment.status : null;
}

/**
 * Run the full reconciliation pass.
 * @returns {{ reconciled: number, errors: number }}
 */
async function runReconciliation() {
    const stalePaymentCutoff = new Date(Date.now() - STALE_PAYMENT_AGE_MS);
    const staleActionCutoff = new Date(Date.now() - STALE_ACTION_AGE_MS);

    // Find all payments that need reconciliation
    const stuckPayments = await Payment.find({
        $or: [
            // Payments stuck in initial states past TTL
            {
                status: { $in: ['created', 'processing'] },
                createdAt: { $lt: stalePaymentCutoff }
            },
            // Capture requests that haven't been confirmed
            {
                status: 'capture_requested',
                updatedAt: { $lt: staleActionCutoff }
            },
            // Refund requests that haven't been confirmed
            {
                status: 'refund_requested',
                updatedAt: { $lt: staleActionCutoff }
            }
        ]
    }).limit(BATCH_SIZE);

    let reconciled = 0;
    let errors = 0;

    for (const payment of stuckPayments) {
        try {
            const newStatus = await reconcileOne(payment);
            if (newStatus) reconciled++;
        } catch (err) {
            errors++;
            logger.error(`Reconcile error for ${payment.bogOrderId}: ${err.message}`, LOG_TAG);
        }
    }

    if (reconciled > 0 || errors > 0) {
        logger.info(`Reconciliation complete: reconciled=${reconciled}, errors=${errors}, checked=${stuckPayments.length}`, LOG_TAG);
    }

    return { reconciled, errors, checked: stuckPayments.length };
}

module.exports = { runReconciliation };
