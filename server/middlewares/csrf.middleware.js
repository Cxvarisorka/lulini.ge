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

// Paths exempt from CSRF checks (public callbacks, OAuth redirects)
const CSRF_EXEMPT_PATHS = [
    '/api/payments/callback',      // BOG payment callback (signature-verified separately)
    '/api/payments/redirect/',     // BOG redirect endpoints (GET-like)
    '/api/auth/google/callback',   // OAuth callback
    '/api/auth/google/mobile/callback',
    '/api/auth/failure',
    '/api/auth/apple/token',       // Mobile Apple Sign-In (no cookie auth)
    '/api/auth/google/token',      // Mobile Google Sign-In (no cookie auth)
    '/api/auth/phone/send-otp',    // Phone OTP send (unauthenticated)
    '/api/auth/phone/verify-otp',  // Phone OTP verify (unauthenticated)
    '/api/auth/phone/send-registration-otp',   // Driver registration phone OTP send
    '/api/auth/phone/verify-registration-otp', // Driver registration phone OTP verify
    '/api/auth/login',             // Traditional login (unauthenticated)
    '/api/auth/register',          // Registration (unauthenticated)
    '/api/auth/email/send-verification',  // Email verification for registration
    '/api/auth/email/verify-registration', // Email verification for registration
];

const allowedOrigins = process.env.NODE_ENV === 'production'
    ? ['https://lulini.ge', 'https://www.lulini.ge', 'https://api.lulini.ge']
    : ['http://localhost:5173', 'https://lulini.ge', 'https://www.lulini.ge', 'https://api.lulini.ge'];

function csrfProtection(req, res, next) {
    // Only check state-changing methods
    if (!STATE_CHANGING_METHODS.has(req.method)) {
        return next();
    }

    // Skip exempt paths (payment callbacks, OAuth redirects)
    if (CSRF_EXEMPT_PATHS.some(path => req.path.startsWith(path))) {
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
