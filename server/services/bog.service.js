const crypto = require('crypto');

// Lazy getters — env vars are read at call time (after dotenv has loaded)
function getAuthUrl() {
    return process.env.BOG_AUTH_URL || 'https://oauth2.bog.ge/auth/realms/bog/protocol/openid-connect/token';
}
function getApiUrl() {
    return process.env.BOG_API_URL || 'https://api.bog.ge/payments/v1';
}

// BOG public key for callback signature verification
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
 * Get BOG OAuth2 access token (cached until expiry)
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

    const authUrl = getAuthUrl();

    const response = await fetch(authUrl, {
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
    // expires_in is in seconds
    tokenExpiresAt = Date.now() + (data.expires_in * 1000);

    return cachedToken;
}

/**
 * Create a BOG payment order
 * @param {Object} options
 * @param {number} options.amount - Total amount
 * @param {string} options.currency - Currency code (GEL, USD, EUR)
 * @param {string} options.externalOrderId - Our internal order ID
 * @param {string} options.callbackUrl - Callback URL for payment status
 * @param {string} [options.redirectSuccess] - Success redirect URL
 * @param {string} [options.redirectFail] - Fail redirect URL
 * @param {string} [options.description] - Product description
 * @param {string} [options.lang] - Language (ka/en)
 * @returns {Object} { id, redirectUrl, detailsUrl }
 */
async function createOrder(options) {
    const token = await getAccessToken();

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
        payment_method: ['card'],
        capture: 'automatic'
    };

    if (options.redirectSuccess || options.redirectFail) {
        body.redirect_urls = {};
        if (options.redirectSuccess) body.redirect_urls.success = options.redirectSuccess;
        if (options.redirectFail) body.redirect_urls.fail = options.redirectFail;
    }

    // Short TTL for ride payments, longer for card registration
    body.ttl = options.ttl || 15;

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Accept-Language': options.lang || 'ka'
    };

    // Add idempotency key if provided
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

/**
 * Save card for future payments on an order
 * Must be called after createOrder, before redirecting user to payment page
 * @param {string} orderId - BOG order ID
 */
async function saveCardForFuturePayments(orderId) {
    const token = await getAccessToken();

    const response = await fetch(`${getApiUrl()}/orders/${orderId}/cards`, {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    if (!response.ok && response.status !== 202) {
        const errorText = await response.text();
        throw new Error(`BOG save card failed (${response.status}): ${errorText}`);
    }

    return true;
}

/**
 * Charge a saved card (recurrent payment - user sees BOG page without entering card details)
 * @param {string} parentOrderId - The order ID where card was originally saved
 * @param {Object} options - Same as createOrder options
 * @returns {Object} { id, redirectUrl, detailsUrl }
 */
async function chargeWithSavedCard(parentOrderId, options) {
    const token = await getAccessToken();

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
        }
    };

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
        throw new Error(`BOG saved card charge failed (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    return {
        id: data.id,
        redirectUrl: data._links?.redirect?.href || null,
        detailsUrl: data._links?.details?.href || null
    };
}

/**
 * Auto-charge a subscription card (no user interaction needed)
 * @param {string} parentOrderId - The order ID where card was originally saved for subscriptions
 * @param {Object} options
 * @returns {Object} { id, detailsUrl }
 */
async function autoChargeSubscription(parentOrderId, options) {
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
        throw new Error(`BOG auto-charge failed (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    return {
        id: data.id,
        detailsUrl: data._links?.details?.href || null
    };
}

/**
 * Get order details from BOG
 * @param {string} orderId - BOG order ID
 * @returns {Object} Full order details
 */
async function getOrderDetails(orderId) {
    const token = await getAccessToken();

    const response = await fetch(`${getApiUrl()}/receipt/${orderId}`, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`BOG get order failed (${response.status}): ${errorText}`);
    }

    return response.json();
}

/**
 * Delete a saved card from BOG
 * @param {string} orderId - The order ID where card was saved
 */
async function deleteSavedCard(orderId) {
    const token = await getAccessToken();

    const response = await fetch(`${getApiUrl()}/charges/card/${orderId}`, {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    if (!response.ok && response.status !== 202) {
        const errorText = await response.text();
        throw new Error(`BOG delete card failed (${response.status}): ${errorText}`);
    }

    return true;
}

/**
 * Verify BOG callback signature
 * @param {string} rawBody - Raw request body as string
 * @param {string} signature - Callback-Signature header value
 * @returns {boolean}
 */
function verifyCallbackSignature(rawBody, signature) {
    if (!signature) return false;

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
    saveCardForFuturePayments,
    chargeWithSavedCard,
    autoChargeSubscription,
    getOrderDetails,
    deleteSavedCard,
    verifyCallbackSignature
};
