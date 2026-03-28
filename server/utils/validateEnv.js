'use strict';

/**
 * Centralized environment variable validation.
 *
 * Call this ONCE at the very top of app.js, before any DB connections or route
 * registration.  The function:
 *   - Throws (and exits) immediately for REQUIRED variables that are absent or
 *     too short — there is no safe default for these.
 *   - Prints a WARNING for OPTIONAL variables that are absent so operators can
 *     spot misconfigurations without crashing a partially-valid deployment.
 *
 * Add new variables to the appropriate group below — do not scatter validation
 * logic across individual service files.
 */

// ── Required in ALL environments ──────────────────────────────────────────────
// If any of these are missing the server cannot operate safely.
const REQUIRED = [
    {
        name: 'MONGODB_URI',
        group: 'database',
        description: 'MongoDB connection string',
    },
    {
        name: 'JWT_SECRET',
        group: 'auth',
        description: 'Secret key used to sign JWTs',
        minLength: 32, // Shorter secrets are trivially brute-forced
    },
];

// ── Required in PRODUCTION only ───────────────────────────────────────────────
// Missing in dev is acceptable; missing in prod is a misconfiguration.
const REQUIRED_IN_PRODUCTION = [
    {
        name: 'GOOGLE_MAPS_API_KEY',
        group: 'maps',
        description: 'Server-side Google Maps API key (Directions, Distance Matrix, Geocoding)',
    },
    {
        name: 'SMS_API',
        group: 'sms',
        description: 'SMSOffice.ge API key for phone-number verification',
    },
];

// ── Optional — warn but do not fail ───────────────────────────────────────────
// These enable specific features.  Deployments without them will degrade
// gracefully (e.g. no Cloudinary → no image uploads; no Redis → single-instance
// mode), but operators should know they are absent.
const OPTIONAL = [
    // Cloudinary (driver/passenger profile images)
    { name: 'CLOUDINARY_CLOUD_NAME', group: 'cloudinary', description: 'Cloudinary cloud name for image storage' },
    { name: 'CLOUDINARY_API_KEY',    group: 'cloudinary', description: 'Cloudinary API key' },
    { name: 'CLOUDINARY_API_SECRET', group: 'cloudinary', description: 'Cloudinary API secret' },

    // OAuth
    { name: 'GOOGLE_CLIENT_ID',      group: 'oauth', description: 'Google OAuth web client ID' },
    { name: 'APPLE_CLIENT_ID',       group: 'oauth', description: 'Apple Sign-In client ID' },
    { name: 'FACEBOOK_APP_ID',       group: 'oauth', description: 'Facebook OAuth app ID' },
    { name: 'FACEBOOK_APP_SECRET',   group: 'oauth', description: 'Facebook OAuth app secret' },

    // Redis (horizontal scaling / shared caching)
    { name: 'REDIS_URL',             group: 'redis', description: 'Redis connection URL — enables Socket.io Redis adapter and shared caching' },

    // Error tracking
    { name: 'SENTRY_DSN',            group: 'monitoring', description: 'Sentry DSN for error tracking' },

    // Misc
    { name: 'CLIENT_URL',            group: 'server', description: 'Allowed client origin URL for OAuth redirects' },
    { name: 'COOKIE_DOMAIN',         group: 'server', description: 'Cookie domain for cross-subdomain session sharing' },
];

/**
 * Validate all environment variable groups.
 *
 * @throws {Error} if any required variable is absent or fails its constraint.
 *                 The process will exit(1) after the message is printed so the
 *                 error surfaces clearly in PM2/Docker logs.
 */
function validateEnv() {
    const isProduction = process.env.NODE_ENV === 'production';
    const errors = [];
    const warnings = [];

    // ── Check required vars ──
    for (const spec of REQUIRED) {
        const value = process.env[spec.name];
        if (!value) {
            errors.push(`[${spec.group}] ${spec.name} — ${spec.description}`);
        } else if (spec.minLength && value.length < spec.minLength) {
            errors.push(
                `[${spec.group}] ${spec.name} is too short (${value.length} chars, minimum ${spec.minLength}) — ${spec.description}`
            );
        }
    }

    // ── Check production-only required vars ──
    if (isProduction) {
        for (const spec of REQUIRED_IN_PRODUCTION) {
            if (!process.env[spec.name]) {
                errors.push(`[${spec.group}] ${spec.name} — ${spec.description} (required in production)`);
            }
        }
    }

    // ── Check optional vars ──
    for (const spec of OPTIONAL) {
        if (!process.env[spec.name]) {
            warnings.push(`[${spec.group}] ${spec.name} — ${spec.description}`);
        }
    }

    // ── Report ──
    if (warnings.length > 0) {
        // Group warnings by category for readability
        const byGroup = {};
        for (const w of warnings) {
            const group = w.match(/^\[(\w+)\]/)?.[1] || 'other';
            (byGroup[group] = byGroup[group] || []).push(w.replace(/^\[\w+\]\s*/, ''));
        }
        console.warn('[validateEnv] Optional environment variables not set:');
        for (const [group, items] of Object.entries(byGroup)) {
            console.warn(`  ${group}:`);
            for (const item of items) {
                console.warn(`    - ${item}`);
            }
        }
    }

    if (errors.length > 0) {
        // Print all errors before exiting so the operator sees the full list
        console.error('[validateEnv] FATAL — missing or invalid required environment variables:');
        for (const err of errors) {
            console.error(`  ✗ ${err}`);
        }
        console.error('[validateEnv] Server cannot start safely. Set the variables above and restart.');
        process.exit(1);
    }

    const totalVarsChecked = REQUIRED.length + (isProduction ? REQUIRED_IN_PRODUCTION.length : 0) + OPTIONAL.length;
    console.info(
        `[validateEnv] Environment validation passed (${totalVarsChecked} vars checked, ` +
        `${warnings.length} optional missing, NODE_ENV=${process.env.NODE_ENV || 'development'})`
    );
}

module.exports = { validateEnv };
