const twilio = require('twilio');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

let client = null;

// Initialize Twilio client only if all credentials are configured
if (accountSid && authToken && verifyServiceSid) {
    client = twilio(accountSid, authToken);
}

/**
 * Generate a random 6-digit OTP code (dev mode only)
 * @returns {string} 6-digit OTP code
 */
const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Send phone verification via Twilio Verify API
 * @param {string} phone - Phone number to verify (E.164 format)
 * @returns {Promise<object>} { devCode } in dev mode, { sent: true } in production
 */
const sendVerification = async (phone) => {
    if (!client) {
        const code = generateOTP();
        console.warn('Twilio not configured. OTP code:', code);
        return { devCode: code };
    }

    const verification = await client.verify.v2
        .services(verifyServiceSid)
        .verifications.create({ to: phone, channel: 'sms' });

    return { sent: true, sid: verification.sid };
};

/**
 * Check phone verification via Twilio Verify API
 * @param {string} phone - Phone number to check
 * @param {string} code - OTP code to verify
 * @returns {Promise<boolean|null>} true/false in production, null if Twilio not configured
 */
const checkVerification = async (phone, code) => {
    if (!client) {
        return null; // Caller should check local OTP DB
    }

    try {
        const check = await client.verify.v2
            .services(verifyServiceSid)
            .verificationChecks.create({ to: phone, code });

        console.log('Twilio verify check result:', check.status, 'for phone:', phone);
        return check.status === 'approved';
    } catch (error) {
        console.error('Twilio verify check error:', error.code, error.message, 'for phone:', phone);
        // 20404 = verification not found (expired or already consumed)
        if (error.code === 20404) {
            return { error: 'expired' };
        }
        // 60202 = max check attempts reached
        if (error.code === 60202) {
            return { error: 'max_attempts' };
        }
        return { error: 'failed', message: error.message };
    }
};

module.exports = {
    generateOTP,
    sendVerification,
    checkVerification
};
