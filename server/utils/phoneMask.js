/**
 * Phone number masking utility.
 *
 * Masks a phone number for display to the other party in a ride, so drivers and
 * passengers never see each other's real phone numbers.
 *
 * Examples:
 *   "+995599123456" → "+995 *** ** 56"
 *   "+1 (555) 867-5309" → "+1 *** ** 09"
 *   "0599123456"       → "*** ** 56"
 *
 * Only the last 2 digits of the local number are preserved. The country code prefix
 * (leading "+" sequence) is kept to indicate the country without revealing the number.
 */
function maskPhone(phone) {
    if (!phone || typeof phone !== 'string') return '';

    const cleaned = phone.replace(/\s/g, '');

    if (cleaned.startsWith('+')) {
        // Extract country code: consume digits until they stop (1–3 digits after "+")
        const afterPlus = cleaned.slice(1);
        const ccMatch = afterPlus.match(/^(\d{1,3})/);
        if (!ccMatch) return '*** ** ??';
        const cc = ccMatch[1];
        const local = afterPlus.slice(cc.length).replace(/\D/g, '');
        const last2 = local.slice(-2) || '??';
        return `+${cc} *** ** ${last2}`;
    }

    // No country code prefix — just mask everything except last 2 digits
    const digits = cleaned.replace(/\D/g, '');
    const last2 = digits.slice(-2) || '??';
    return `*** ** ${last2}`;
}

module.exports = { maskPhone };
