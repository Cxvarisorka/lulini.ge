const crypto = require('crypto');

// Lazy getters — env vars are read at call time (after dotenv has loaded)
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

// Token cache
let cachedToken = null;
let tokenExpiresAt = 0;

/**
 * Get BOG OAuth2 access token (cached until expiry).
 * Uses client_credentials grant with Basic auth.
 */
async function getAccessToken() {
    if (cachedToken && Date.now() < tokenExpiresAt - 30000) {
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
        throw new Error(`BOG auth failed (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    cachedToken = data.access_token;

    // BOG expires_in can be epoch-ms or seconds — handle both
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
 * @param {Object} options
 * @param {number} options.amount - Total amount
 * @param {string} [options.currency] - Currency code (GEL, USD, EUR). Default: GEL
 * @param {string} options.externalOrderId - Our internal order ID
 * @param {string} options.callbackUrl - Callback URL for payment notifications
 * @param {string} [options.redirectSuccess] - Success redirect URL
 * @param {string} [options.redirectFail] - Fail redirect URL
 * @param {string} [options.description] - Product description
 * @param {string} [options.lang] - Language (ka/en)
 * @param {number} [options.ttl] - Order lifetime in minutes (2-1440, default: 15)
 * @param {string} [options.capture] - 'automatic' (default) or 'manual' (preauth)
 * @param {string} [options.idempotencyKey] - UUID v4 for deduplication
 * @param {string[]} [options.paymentMethods] - Allowed methods: card, apple_pay, google_pay, etc. Default: ['card']
 * @returns {Object} { id, redirectUrl, detailsUrl }
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
        application_type: options.applicationType || 'mobile'
    };

    // Apple Pay / Google Pay: BOG handles on their payment page (external: false)
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
 * Save card for recurrent payments (user sees BOG page on future charges, no card re-entry).
 * Call AFTER createOrder, BEFORE redirecting user to payment page.
 * Endpoint: PUT /orders/:order_id/cards
 *
 * Use this when you need to charge variable amounts (e.g., ride fares).
 * @param {string} orderId - BOG order ID
 * @param {string} [idempotencyKey] - UUID v4
 */
async function saveCardForRecurrent(orderId, idempotencyKey) {
    const token = await getAccessToken();

    const headers = { 'Authorization': `Bearer ${token}` };
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

    const url = `${getApiUrl()}/orders/${orderId}/cards`;

    // PUT is the correct method per BOG docs.
    // BOG sandbox CDN (Akamai) may block PUT — in that case, skip card saving
    // in sandbox and proceed (card will still be saved if user completes payment
    // on BOG's payment page, just won't be flagged for recurrent reuse).
    const response = await fetch(url, { method: 'PUT', headers });

    if (response.ok || response.status === 202) {
        return true;
    }

    // CDN blocking PUT — sandbox-only issue, not a real API error
    if (response.status === 501) {
        console.warn(`BOG saveCardForRecurrent: sandbox CDN blocked PUT (501) — skipping card save flag. Card saving may still work via payment page.`);
        return true;
    }

    const errorText = await response.text();
    throw new Error(`BOG save card (recurrent) failed (${response.status}): ${errorText}`);
}

/**
 * Save card for offline/subscription payments (fully automatic, no user interaction on charge).
 * Call AFTER createOrder, BEFORE redirecting user to payment page.
 * Endpoint: PUT /orders/:order_id/subscriptions
 *
 * WARNING: Offline charges reuse the original order's amount. Only use if amount is fixed.
 * @param {string} orderId - BOG order ID
 * @param {string} [idempotencyKey] - UUID v4
 */
async function saveCardForSubscription(orderId, idempotencyKey) {
    const token = await getAccessToken();

    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

    const url = `${getApiUrl()}/orders/${orderId}/subscriptions`;

    const response = await fetch(url, { method: 'PUT', headers });

    if (response.ok || response.status === 202) {
        return true;
    }

    if (response.status === 501) {
        console.warn(`BOG saveCardForSubscription: sandbox CDN blocked PUT (501) — skipping.`);
        return true;
    }

    const errorText = await response.text();
    throw new Error(`BOG save card (subscription) failed (${response.status}): ${errorText}`);
}

// ──────────────────────────────────────────────────────
// Charging Saved Cards
// ──────────────────────────────────────────────────────

/**
 * Recurrent payment: charge a saved card with a NEW amount.
 * User sees BOG payment page (pre-filled card, no re-entry needed).
 * Returns a redirect URL — user must visit it to confirm.
 *
 * Endpoint: POST /ecommerce/orders/:parent_order_id
 *
 * @param {string} parentOrderId - Order ID where card was saved via saveCardForRecurrent
 * @param {Object} options
 * @param {number} options.amount - Amount to charge
 * @param {string} options.callbackUrl - Callback URL
 * @param {string} [options.externalOrderId] - Our internal order ID
 * @param {string} [options.description] - Description
 * @param {string} [options.lang] - Language
 * @param {string} [options.capture] - 'automatic' (default) or 'manual' (preauth)
 * @param {string} [options.idempotencyKey] - UUID v4
 * @returns {Object} { id, redirectUrl, detailsUrl }
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

    if (options.capture) {
        body.capture = options.capture;
    }

    if (options.externalOrderId) {
        body.external_order_id = options.externalOrderId;
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
 * Subscription/offline payment: auto-charge a saved card WITHOUT user interaction.
 * Charges the SAME amount as the original order. No redirect URL returned.
 *
 * Endpoint: POST /ecommerce/orders/:parent_order_id/subscribe
 *
 * @param {string} parentOrderId - Order ID where card was saved via saveCardForSubscription
 * @param {Object} [options]
 * @param {string} [options.callbackUrl] - Callback URL
 * @param {string} [options.externalOrderId] - Our internal order ID
 * @param {string} [options.idempotencyKey] - UUID v4
 * @returns {Object} { id, detailsUrl }
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
 * Endpoint: GET /receipt/:order_id
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
 * Endpoint: DELETE /charges/card/:order_id
 * @param {string} orderId - The order ID where card was saved
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
        throw new Error(`BOG delete card failed (${response.status}): ${errorText}`);
    }

    return true;
}

// ──────────────────────────────────────────────────────
// Preauthorization
// ──────────────────────────────────────────────────────

/**
 * Approve (capture) a preauthorized payment.
 * Endpoint: POST /payment/authorization/approve/:order_id
 *
 * @param {string} orderId - BOG order ID of the preauthorized order
 * @param {Object} [options]
 * @param {number} [options.amount] - Amount to capture (omit for full amount, or partial)
 * @param {string} [options.description] - Reason for confirmation
 * @param {string} [options.idempotencyKey] - UUID v4
 * @returns {Object} { key, message, actionId }
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
 * Endpoint: POST /payment/authorization/cancel/:order_id
 *
 * @param {string} orderId - BOG order ID of the preauthorized order
 * @param {Object} [options]
 * @param {string} [options.description] - Reason for rejection
 * @param {string} [options.idempotencyKey] - UUID v4
 * @returns {Object} { key, message, actionId }
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
// ──────────────────────────────────────────────────────

/**
 * Refund a completed payment (full or partial).
 * Endpoint: POST /payment/refund/:order_id
 *
 * Full refund: omit amount. Partial refund: pass amount < total.
 * Supported for card, Apple Pay, Google Pay payments.
 * BOG authorization (bog_p2p) supports full refund only.
 *
 * @param {string} orderId - BOG order ID
 * @param {Object} [options]
 * @param {number} [options.amount] - Partial refund amount (omit for full refund)
 * @param {string} [options.idempotencyKey] - UUID v4
 * @returns {Object} { key, message, actionId }
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
 * Verify BOG callback signature (RSA SHA256 with BOG's public key).
 * MUST be verified before processing any callback data.
 * @param {string} rawBody - Raw request body as string
 * @param {string} signature - Callback-Signature header value (base64)
 * @returns {boolean}
 */
function verifyCallbackSignature(rawBody, signature) {
    if (!signature || !rawBody) return false;

    try {
        const verify = crypto.createVerify('SHA256');
        verify.update(rawBody);
        verify.end();
        return verify.verify(BOG_PUBLIC_KEY, signature, 'base64');
    } catch (err) {
        console.error('BOG callback signature verification error:', err.message);
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
