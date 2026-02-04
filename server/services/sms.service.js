const twilio = require('twilio');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

let client = null;

// Initialize Twilio client only if credentials are configured
if (accountSid && authToken) {
    client = twilio(accountSid, authToken);
}

/**
 * Generate a random 6-digit OTP code
 * @returns {string} 6-digit OTP code
 */
const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Send OTP code via SMS
 * @param {string} phone - Phone number to send OTP to
 * @param {string} code - OTP code to send
 * @returns {Promise<object>} Twilio message response
 */
const sendOTP = async (phone, code) => {
    if (!client) {
        console.warn('Twilio not configured. OTP code:', code);
        // In development, return mock response
        return { sid: 'dev-mock-sid', status: 'sent' };
    }

    const message = await client.messages.create({
        body: `Your GoTours verification code is: ${code}. Valid for 5 minutes.`,
        from: twilioPhone,
        to: phone
    });

    return message;
};

module.exports = {
    generateOTP,
    sendOTP
};
