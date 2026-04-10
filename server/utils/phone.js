/**
 * Phone number normalization to E.164 format.
 *
 * Accepts input in any common format (with or without country code, with
 * spaces / dashes / parentheses) and returns a normalized E.164 string.
 * When the input lacks an explicit country code, Georgian (+995) is assumed
 * since that is the primary market for this app.
 *
 * Examples:
 *   "+995555277335"     -> "+995555277335"
 *   "995555277335"      -> "+995555277335"
 *   "555277335"         -> "+995555277335"  (9-digit Georgian mobile)
 *   "0555277335"        -> "+995555277335"  (strips leading trunk zero)
 *   "+995 555 27 73 35" -> "+995555277335"
 *   "+1 (555) 867-5309" -> "+15558675309"
 *
 * Returns null if the input cannot be confidently normalized.
 */
const GEORGIA_CC = '995';
const E164_REGEX = /^\+\d{7,15}$/;

function normalizePhone(input) {
    if (input === null || input === undefined) return null;
    if (typeof input !== 'string') return null;

    const trimmed = input.trim();
    if (!trimmed) return null;

    const hasPlus = trimmed.startsWith('+');
    const digits = trimmed.replace(/\D/g, '');
    if (!digits) return null;

    // If the caller provided a `+` prefix, trust their country code as given.
    if (hasPlus) {
        const candidate = `+${digits}`;
        return E164_REGEX.test(candidate) ? candidate : null;
    }

    // No `+` — apply Georgian-market defaults.

    // 9-digit Georgian mobile (starts with 5): "555277335" -> "+995555277335"
    if (digits.length === 9 && digits.startsWith('5')) {
        return `+${GEORGIA_CC}${digits}`;
    }

    // Local trunk form "0XXXXXXXXX" (10 digits, leading 0) -> strip the 0
    if (digits.length === 10 && digits.startsWith('0')) {
        return `+${GEORGIA_CC}${digits.slice(1)}`;
    }

    // Full country code without `+`: "995555277335" -> "+995555277335"
    if (digits.length === 12 && digits.startsWith(GEORGIA_CC)) {
        return `+${digits}`;
    }

    // Fall back to treating the digits as already containing a country code.
    const candidate = `+${digits}`;
    return E164_REGEX.test(candidate) ? candidate : null;
}

/**
 * True if the given value is already in canonical E.164 format.
 */
function isE164(value) {
    return typeof value === 'string' && E164_REGEX.test(value);
}

module.exports = { normalizePhone, isE164 };
