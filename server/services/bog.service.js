'use strict';

const crypto = require('crypto');
const logger = require('../utils/logger');

const LOG_TAG = 'bog';

function getAuthUrl() {
    return process.env.BOG_AUTH_URL || 'https://oauth2.bog.ge/auth/realms/bog/protocol/openid-connect/token';
}
function getApiUrl() {
    return process.env.BOG_API_URL || 'https://api.bog.ge/payments/v1';
}

// BOG public key for callback signature verification (RSA SHA256)
const BOG_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAu4RUyAw3+CdkS3ZNILQh
zHI9Hemo+vKB9U2BSabppkKjzjjkf+0Sm76hSMiu/HFtYhqWOESryoCDJoqffY0Q
1VNt25aTxbj068QNUtnxQ7KQVLA+pG0smf+EBWlS1vBEAFbIas9d8c9b9sSEkTrr
TYQ90WIM8bGB6S/KLVoT1a7SnzabjoLc5Qf/SLDG5fu8dH8zckyeYKdRKSBJKvhx
tcBuHV4f7qsynQT+f2UYbESX/TLHwT5qFWZDHZ0YUOUIvb8n7JujVSGZO9/+ll/g
4ZIWhC1MlJgPObDwRkRd8NFOopgxMcMsDIZIoLbWKhHVq67hdbwpAq9K9WMmEhPn
PwIDAQAB
-----END PUBLIC KEY-----`;

// ──────────────────────────────────────────────────────
// Token Management
// ──────────────────────────────────────────────────────

let cachedToken = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
    // Return cached token if still valid (30s buffer for clock skew / network latency)
    if (cachedToken && Date.now() < tokenExpiresAt - 30_000) {
        return cachedToken;
    }

    const clientId = process.env.BOG_CLIENT_ID;
    const clientSecret = process.env.BOG_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        throw new Error('BOG_CLIENT_ID and BOG_CLIENT_SECRET must be set');
    }

    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const response = await fetch(getAuthUrl(), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${credentials}`
        },
        body: 'grant_type=client_credentials'
    });

    if (!response.ok) {
        const errorText = await response.text();
        logger.error(`Auth failed (${response.status}): ${errorText}`, LOG_TAG);
        throw new Error(`BOG auth failed (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    cachedToken = data.access_token;

    // BOG expires_in can be epoch-ms or relative seconds — handle both
    if (data.expires_in > 1e12) {
        tokenExpiresAt = data.expires_in;
    } else {
        tokenExpiresAt = Date.now() + (data.expires_in * 1000);
    }

    return cachedToken;
}

// ──────────────────────────────────────────────────────
// Order Creation
// ──────────────────────────────────────────────────────

/**
 * Create a BOG payment order.
 * @returns {{ id: string, redirectUrl: string, detailsUrl: string }}
 */
async function createOrder(options) {
    const token = await getAccessToken();

    const paymentMethods = options.paymentMethods || ['card'];

    const body = {
        callback_url: options.callbackUrl,
        external_order_id: options.externalOrderId,
        purchase_units: {
            currency: options.currency || 'GEL',
            total_amount: options.amount,
            basket: [{
                quantity: 1,
                unit_price: options.amount,
                product_id: options.externalOrderId,
                description: options.description || 'Lulini Ride Payment'
            }]
        },
        payment_method: paymentMethods,
        capture: options.capture || 'automatic',
        ttl: options.ttl || 15,
        application_type: 'mobile'
    };

    if (paymentMethods.includes('apple_pay') || paymentMethods.includes('google_pay')) {
        body.config = {};
        if (paymentMethods.includes('apple_pay')) {
            body.config.apple_pay = { external: false };
        }
        if (paymentMethods.includes('google_pay')) {
            body.config.google_pay = { external: false };
        }
    }

    if (options.redirectSuccess || options.redirectFail) {
        body.redirect_urls = {};
        if (options.redirectSuccess) body.redirect_urls.success = options.redirectSuccess;
        if (options.redirectFail) body.redirect_urls.fail = options.redirectFail;
    }

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Accept-Language': options.lang || 'ka'
    };

    if (options.idempotencyKey) {
        headers['Idempotency-Key'] = options.idempotencyKey;
    }

    const response = await fetch(`${getApiUrl()}/ecommerce/orders`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const errorText = await response.text();
        logger.error(`Create order failed (${response.status}): ${errorText}`, LOG_TAG);
        throw new Error(`BOG create order failed (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    return {
        id: data.id,
        redirectUrl: data._links.redirect.href,
        detailsUrl: data._links.details.href
    };
}

// ──────────────────────────────────────────────────────
// Card Saving
// ──────────────────────────────────────────────────────

/**
 * Save card for recurrent payments (variable amounts, user confirms on BOG page).
 * Must be called AFTER createOrder, BEFORE redirecting user.
 */
async function saveCardForRecurrent(orderId, idempotencyKey) {
    const token = await getAccessToken();

    const headers = { 'Authorization': `Bearer ${token}` };
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

    const response = await fetch(`${getApiUrl()}/orders/${orderId}/cards`, {
        method: 'PUT',
        headers
    });

    if (response.ok || response.status === 202) {
        return true;
    }

    const errorText = await response.text();
    logger.error(`Save card (recurrent) failed (${response.status}): ${errorText}`, LOG_TAG);
    throw new Error(`BOG save card (recurrent) failed (${response.status}): ${errorText}`);
}

/**
 * Save card for subscription/offline payments (fixed amount, fully automatic).
 * Must be called AFTER createOrder, BEFORE redirecting user.
 */
async function saveCardForSubscription(orderId, idempotencyKey) {
    const token = await getAccessToken();

    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

    const response = await fetch(`${getApiUrl()}/orders/${orderId}/subscriptions`, {
        method: 'PUT',
        headers
    });

    if (response.ok || response.status === 202) {
        return true;
    }

    const errorText = await response.text();
    logger.error(`Save card (subscription) failed (${response.status}): ${errorText}`, LOG_TAG);
    throw new Error(`BOG save card (subscription) failed (${response.status}): ${errorText}`);
}

// ──────────────────────────────────────────────────────
// Charging Saved Cards
// ──────────────────────────────────────────────────────

/**
 * Recurrent payment: charge a saved card with a new amount.
 * User may need to confirm on BOG page (card pre-filled, no re-entry).
 * Returns a redirect URL for user confirmation.
 *
 * @param {string} parentOrderId - Order ID where card was saved
 * @returns {{ id: string, redirectUrl: string|null, detailsUrl: string|null }}
 */
async function chargeRecurrent(parentOrderId, options) {
    const token = await getAccessToken();

    const body = {
        callback_url: options.callbackUrl,
        purchase_units: {
            total_amount: options.amount,
            basket: [{
                quantity: 1,
                unit_price: options.amount,
                product_id: options.externalOrderId || `ride_${Date.now()}`,
                description: options.description || 'Lulini Ride Payment'
            }]
        }
    };

    if (options.capture) body.capture = options.capture;
    if (options.externalOrderId) body.external_order_id = options.externalOrderId;

    if (options.redirectSuccess || options.redirectFail) {
        body.redirect_urls = {};
        if (options.redirectSuccess) body.redirect_urls.success = options.redirectSuccess;
        if (options.redirectFail) body.redirect_urls.fail = options.redirectFail;
    }

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Accept-Language': options.lang || 'ka'
    };

    if (options.idempotencyKey) {
        headers['Idempotency-Key'] = options.idempotencyKey;
    }

    const response = await fetch(`${getApiUrl()}/ecommerce/orders/${parentOrderId}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const errorText = await response.text();
        logger.error(`Recurrent charge failed (${response.status}): ${errorText}`, LOG_TAG);
        throw new Error(`BOG recurrent charge failed (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    return {
        id: data.id,
        redirectUrl: data._links?.redirect?.href || null,
        detailsUrl: data._links?.details?.href || null
    };
}

/**
 * Subscription/offline payment: auto-charge without user interaction.
 * Charges the SAME amount as the original parent order.
 */
async function chargeSubscription(parentOrderId, options = {}) {
    const token = await getAccessToken();

    const body = {};
    if (options.callbackUrl) body.callback_url = options.callbackUrl;
    if (options.externalOrderId) body.external_order_id = options.externalOrderId;

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };

    if (options.idempotencyKey) {
        headers['Idempotency-Key'] = options.idempotencyKey;
    }

    const response = await fetch(`${getApiUrl()}/ecommerce/orders/${parentOrderId}/subscribe`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const errorText = await response.text();
        logger.error(`Subscription charge failed (${response.status}): ${errorText}`, LOG_TAG);
        throw new Error(`BOG subscription charge failed (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    return {
        id: data.id,
        detailsUrl: data._links?.details?.href || null
    };
}

// ──────────────────────────────────────────────────────
// Order Details & Card Deletion
// ──────────────────────────────────────────────────────

/**
 * Get order/payment details from BOG.
 * @param {string} orderId - BOG order ID
 * @returns {Object} Full order details including order_status, payment_detail, etc.
 */
async function getOrderDetails(orderId) {
    const token = await getAccessToken();

    const response = await fetch(`${getApiUrl()}/receipt/${orderId}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`BOG get order failed (${response.status}): ${errorText}`);
    }

    return response.json();
}

/**
 * Delete a saved card from BOG.
 * @param {string} orderId - The parent order ID where card was saved
 */
async function deleteSavedCard(orderId) {
    const token = await getAccessToken();

    const response = await fetch(`${getApiUrl()}/charges/card/${orderId}`, {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    });

    if (!response.ok && response.status !== 202) {
        const errorText = await response.text();
        logger.error(`Delete card failed (${response.status}): ${errorText}`, LOG_TAG);
        throw new Error(`BOG delete card failed (${response.status}): ${errorText}`);
    }

    return true;
}

// ──────────────────────────────────────────────────────
// Preauthorization
// ──────────────────────────────────────────────────────

/**
 * Approve (capture) preauthorized funds. Full or partial capture.
 * BOG processes this asynchronously — response is only acknowledgement.
 * Final confirmation arrives via callback.
 *
 * @returns {{ key: string, message: string, actionId: string }}
 */
async function approvePreauth(orderId, options = {}) {
    const token = await getAccessToken();

    const body = {};
    if (options.amount !== undefined) body.amount = options.amount;
    if (options.description) body.description = options.description;

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };

    if (options.idempotencyKey) {
        headers['Idempotency-Key'] = options.idempotencyKey;
    }

    const response = await fetch(`${getApiUrl()}/payment/authorization/approve/${orderId}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const errorText = await response.text();
        logger.error(`Preauth approve failed (${response.status}): ${errorText}`, LOG_TAG);
        throw new Error(`BOG preauth approve failed (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    return {
        key: data.key,
        message: data.message,
        actionId: data.action_id
    };
}

/**
 * Reject (cancel) a preauthorized payment, releasing held funds.
 * BOG processes this asynchronously.
 *
 * @returns {{ key: string, message: string, actionId: string }}
 */
async function rejectPreauth(orderId, options = {}) {
    const token = await getAccessToken();

    const body = {};
    if (options.description) body.description = options.description;

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };

    if (options.idempotencyKey) {
        headers['Idempotency-Key'] = options.idempotencyKey;
    }

    const response = await fetch(`${getApiUrl()}/payment/authorization/cancel/${orderId}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const errorText = await response.text();
        logger.error(`Preauth reject failed (${response.status}): ${errorText}`, LOG_TAG);
        throw new Error(`BOG preauth reject failed (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    return {
        key: data.key,
        message: data.message,
        actionId: data.action_id
    };
}

// ──────────────────────────────────────────────────────
// Refund
// ─────────���────────────────────────────────────────────

/**
 * Refund a completed payment (full or partial).
 * BOG processes this asynchronously — response is only acknowledgement.
 * Final confirmation arrives via callback.
 *
 * @returns {{ key: string, message: string, actionId: string }}
 */
async function refundPayment(orderId, options = {}) {
    const token = await getAccessToken();

    const body = {};
    if (options.amount !== undefined) body.amount = options.amount;

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };

    if (options.idempotencyKey) {
        headers['Idempotency-Key'] = options.idempotencyKey;
    }

    const response = await fetch(`${getApiUrl()}/payment/refund/${orderId}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const errorText = await response.text();
        logger.error(`Refund failed (${response.status}): ${errorText}`, LOG_TAG);
        throw new Error(`BOG refund failed (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    return {
        key: data.key,
        message: data.message,
        actionId: data.action_id
    };
}

// ──────────────────────────────────────────────────────
// Callback Signature Verification
// ──────────────────────────────────────────────────────

/**
 * Verify BOG callback signature (RSA SHA256).
 * MUST be called before processing any callback data.
 */
function verifyCallbackSignature(rawBody, signature) {
    if (!signature || !rawBody) return false;

    try {
        const verify = crypto.createVerify('SHA256');
        verify.update(rawBody);
        verify.end();
        return verify.verify(BOG_PUBLIC_KEY, signature, 'base64');
    } catch (err) {
        logger.error(`Callback signature verification error: ${err.message}`, LOG_TAG);
        return false;
    }
}

module.exports = {
    getAccessToken,
    createOrder,
    saveCardForRecurrent,
    saveCardForSubscription,
    chargeRecurrent,
    chargeSubscription,
    getOrderDetails,
    deleteSavedCard,
    approvePreauth,
    rejectPreauth,
    refundPayment,
    verifyCallbackSignature
};
