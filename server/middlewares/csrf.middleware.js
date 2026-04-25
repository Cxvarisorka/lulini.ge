/**
 * CSRF Protection Middleware
 *
 * Mobile clients authenticate via the Authorization header, which is inherently
 * CSRF-safe (browsers never auto-attach it to cross-origin requests).
 *
 * Web clients use cookies (sameSite=none + httpOnly). When auth comes from a
 * cookie on a state-changing request (POST/PATCH/PUT/DELETE), we verify the
 * Origin/Referer header matches an allowed origin — browsers always send these
 * headers on cross-origin requests and they cannot be spoofed by JavaScript.
 *
 * This is the "Double-Submit Origin" pattern recommended by OWASP.
 */

const AppError = require('../utils/AppError');

const STATE_CHANGING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

// Paths exempt from CSRF checks (public callbacks, OAuth redirects).
//
// Use EXACT match for single endpoints and explicit `prefix: true` for the
// few routes that are actually sub-trees (payment redirect URLs built by the
// provider). A naive startsWith match on all entries silently exempts any
// future route that shares a prefix with an entry here — e.g. an accidental
// `/api/auth/login-v2` would inherit exemption.
const CSRF_EXEMPT_PATHS = [
    { path: '/api/payments/callback', prefix: false }, // BOG callback (signature-verified separately)
    { path: '/api/payments/redirect/', prefix: true }, // BOG redirect endpoints (provider appends token)
    { path: '/api/auth/google/callback', prefix: false },
    { path: '/api/auth/google/mobile/callback', prefix: false },
    { path: '/api/auth/failure', prefix: false },
    { path: '/api/auth/apple/token', prefix: false },       // Mobile Apple Sign-In (no cookie auth)
    { path: '/api/auth/google/token', prefix: false },      // Mobile Google Sign-In (no cookie auth)
    { path: '/api/auth/phone/send-otp', prefix: false },    // Phone OTP send (unauthenticated)
    { path: '/api/auth/phone/verify-otp', prefix: false },  // Phone OTP verify (unauthenticated)
    { path: '/api/auth/phone/send-registration-otp', prefix: false },
    { path: '/api/auth/phone/verify-registration-otp', prefix: false },
    { path: '/api/auth/login', prefix: false },             // Traditional login (unauthenticated)
    { path: '/api/auth/register', prefix: false },          // Registration (unauthenticated)
    { path: '/api/auth/email/send-verification', prefix: false },
    { path: '/api/auth/email/verify-registration', prefix: false },
];

const allowedOrigins = process.env.NODE_ENV === 'production'
    ? ['https://lulini.ge', 'https://www.lulini.ge', 'https://api.lulini.ge']
    : ['http://localhost:5173', 'https://lulini.ge', 'https://www.lulini.ge', 'https://api.lulini.ge'];

function csrfProtection(req, res, next) {
    // Only check state-changing methods
    if (!STATE_CHANGING_METHODS.has(req.method)) {
        return next();
    }

    // Skip exempt paths (payment callbacks, OAuth redirects). Exact match by
    // default; prefix match only when explicitly flagged.
    const isExempt = CSRF_EXEMPT_PATHS.some(entry =>
        entry.prefix ? req.path.startsWith(entry.path) : req.path === entry.path
    );
    if (isExempt) {
        return next();
    }

    // If request uses Authorization header → CSRF-safe (browser never auto-attaches it)
    if (req.headers.authorization) {
        return next();
    }

    // If no cookie token present → not an authenticated request, skip CSRF
    if (!req.cookies || !req.cookies.token) {
        return next();
    }

    // Cookie-based auth on a state-changing request → validate Origin/Referer
    const origin = req.headers.origin || '';
    const referer = req.headers.referer || '';

    // Extract origin from referer if Origin header is missing
    let requestOrigin = origin;
    if (!requestOrigin && referer) {
        try {
            const url = new URL(referer);
            requestOrigin = url.origin;
        } catch {
            // Invalid referer — block
        }
    }

    // Server-to-server or same-origin requests without Origin header (e.g. curl, Postman)
    // In production, these should also have no cookie, so this path is rare.
    if (!requestOrigin) {
        // No origin info at all — block in production, allow in dev
        if (process.env.NODE_ENV === 'production') {
            return next(new AppError('CSRF validation failed: missing Origin header', 403));
        }
        return next();
    }

    if (allowedOrigins.includes(requestOrigin)) {
        return next();
    }

    return next(new AppError('CSRF validation failed: origin not allowed', 403));
}

module.exports = { csrfProtection };
