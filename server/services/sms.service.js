const https = require('https');

const apiKey = process.env.SMS_API;
const SMS_SENDER = process.env.SMS_SENDER || 'Lulini';

/**
 * Generate a random 6-digit OTP code
 * @returns {string} 6-digit OTP code
 */
const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
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

/**
 * Send SMS via smsoffice.ge API
 * @param {string} phone - Phone number
 * @param {string} content - Message text
 * @returns {Promise<object>} API response
 */
const sendSms = (phone, content) => {
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

        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve(parsed);
                } catch (e) {
                    reject(new Error(`SMS API returned invalid JSON: ${data}`));
                }
            });
        }).on('error', reject);
    });
};

/**
 * Send phone verification OTP
 * @param {string} phone - Phone number to verify
 * @returns {Promise<object>} { devCode } in dev/no-key mode, { sent: true } in production
 */
const sendVerification = async (phone) => {
    const code = generateOTP();

    if (!apiKey) {
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

module.exports = {
    generateOTP,
    sendVerification,
};
