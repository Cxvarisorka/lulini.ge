const https = require('https');
const crypto = require('crypto');

const apiKey = process.env.SMS_API;
const SMS_SENDER = process.env.SMS_SENDER || 'Lulini';

/**
 * Generate a cryptographically secure random 6-digit OTP code
 * @returns {string} 6-digit OTP code
 */
const generateOTP = () => {
    return String(crypto.randomInt(100000, 1000000));
};

/**
 * Format phone number for SMSOffice (international format without + or 00)
 * e.g. "+995577123456" -> "995577123456"
 * @param {string} phone
 * @returns {string}
 */
const formatPhone = (phone) => {
    return phone.replace(/[\s()\-+]/g, '').replace(/^00/, '');
};

// Timeout for a single SMSOffice HTTP request (ms).
const SMS_REQUEST_TIMEOUT_MS = 10000;
// Number of retries on transient network/timeout errors (1 retry = up to 2 attempts).
const SMS_MAX_RETRIES = 1;

/**
 * Perform a single HTTP request to SMSOffice with an explicit socket timeout.
 * Rejects on network errors, timeout, non-2xx responses, or invalid JSON.
 */
const sendSmsOnce = (phone, content) => {
    return new Promise((resolve, reject) => {
        const destination = formatPhone(phone);
        const params = new URLSearchParams({
            key: apiKey,
            destination,
            sender: SMS_SENDER,
            content,
            urgent: 'true',
        });

        const url = `https://smsoffice.ge/api/v2/send/?${params.toString()}`;

        const req = https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
                    const err = new Error(`SMS API HTTP ${res.statusCode}: ${data}`);
                    err.transient = res.statusCode >= 500;
                    return reject(err);
                }
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error(`SMS API returned invalid JSON: ${data}`));
                }
            });
        });

        req.setTimeout(SMS_REQUEST_TIMEOUT_MS, () => {
            const err = new Error(`SMS API request timed out after ${SMS_REQUEST_TIMEOUT_MS}ms`);
            err.transient = true;
            req.destroy(err);
        });

        req.on('error', (err) => {
            // Network-level errors (ECONNRESET, ETIMEDOUT, ENOTFOUND, ...) are transient.
            if (!('transient' in err)) err.transient = true;
            reject(err);
        });
    });
};

/**
 * Send SMS via smsoffice.ge API with a bounded retry on transient errors.
 * @param {string} phone - Phone number
 * @param {string} content - Message text
 * @returns {Promise<object>} API response
 */
const sendSms = async (phone, content) => {
    let lastErr;
    for (let attempt = 0; attempt <= SMS_MAX_RETRIES; attempt++) {
        try {
            return await sendSmsOnce(phone, content);
        } catch (err) {
            lastErr = err;
            if (!err.transient || attempt === SMS_MAX_RETRIES) throw err;
            console.warn(`SMSOffice transient error (attempt ${attempt + 1}/${SMS_MAX_RETRIES + 1}): ${err.message}. Retrying...`);
            // Small backoff before retrying.
            await new Promise(r => setTimeout(r, 500));
        }
    }
    throw lastErr;
};

/**
 * Send phone verification OTP
 * @param {string} phone - Phone number to verify
 * @param {string} [providedCode] - Optional pre-generated OTP code. When the
 *   caller persists the OTP before sending, it must pass the same code it stored.
 * @returns {Promise<object>} { devCode } in dev/no-key mode, { sent: true } in production
 */
const sendVerification = async (phone, providedCode) => {
    const code = providedCode || generateOTP();

    if (!apiKey) {
        // Never silently drop SMS in production — validateEnv already requires
        // SMS_API in prod, but this is belt-and-suspenders: if someone bypasses
        // that check or runs with an empty key, fail loudly rather than log the
        // OTP and return a fake success.
        if (process.env.NODE_ENV === 'production') {
            throw new Error('SMS_API is not configured — cannot send verification code in production');
        }
        console.warn('SMS_API not configured. OTP code:', code);
        return { devCode: code };
    }

    const message = `Your Lulini verification code: ${code}`;

    try {
        const result = await sendSms(phone, message);

        if (!result.Success) {
            console.error('SMSOffice send failed:', result.ErrorCode, result.Message);
            // Fall back to dev mode so the flow doesn't break
            if (process.env.NODE_ENV !== 'production') {
                console.warn('Falling back to dev mode. OTP code:', code);
                return { devCode: code };
            }
            throw new Error(`SMS send failed: ${result.Message} (code ${result.ErrorCode})`);
        }

        return { sent: true, code };
    } catch (error) {
        if (process.env.NODE_ENV !== 'production') {
            console.warn('SMS send error, falling back to dev mode. OTP code:', code);
            return { devCode: code };
        }
        throw error;
    }
};

/**
 * Send a custom SMS message to a phone number.
 * In development (or when SMS_API is not configured) the message is logged
 * instead of being delivered, so the caller never throws in non-production.
 * @param {string} phone - Recipient phone number
 * @param {string} message - Message text to send
 * @returns {Promise<{ sent: boolean } | { devLog: true }>}
 */
const sendSMS = async (phone, message) => {
    if (!apiKey) {
        console.warn(`SMS_API not configured. Would send to ${phone}: ${message}`);
        return { devLog: true };
    }

    try {
        const result = await sendSms(phone, message);

        if (!result.Success) {
            console.error('SMSOffice sendSMS failed:', result.ErrorCode, result.Message);
            if (process.env.NODE_ENV !== 'production') {
                console.warn(`Falling back to dev log. Message to ${phone}: ${message}`);
                return { devLog: true };
            }
            throw new Error(`SMS send failed: ${result.Message} (code ${result.ErrorCode})`);
        }

        return { sent: true };
    } catch (error) {
        if (process.env.NODE_ENV !== 'production') {
            console.warn(`SMS send error, falling back to dev log. Message to ${phone}: ${message}`);
            return { devLog: true };
        }
        throw error;
    }
};

module.exports = {
    generateOTP,
    sendVerification,
    sendSMS,
};
