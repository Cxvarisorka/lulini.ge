/**
 * Analytics Event Tracking Service
 *
 * Logs structured events for key user/driver actions. Currently writes to
 * console (JSON) in all environments. Swap the `_dispatch` function to
 * integrate with Mixpanel, Amplitude, Segment, or any other provider without
 * touching call-sites.
 *
 * Usage:
 *   const analytics = require('./analytics.service');
 *   analytics.trackEvent(userId, 'ride_requested', { vehicleType, fare });
 */

'use strict';

// ---------------------------------------------------------------------------
// Canonical event names — add new ones here as the product grows
// ---------------------------------------------------------------------------
const EVENTS = {
    // Rides
    RIDE_REQUESTED: 'ride_requested',
    RIDE_COMPLETED: 'ride_completed',
    RIDE_CANCELLED: 'ride_cancelled',
    RIDE_SCHEDULED: 'ride_scheduled',
    // Driver
    DRIVER_WENT_ONLINE: 'driver_went_online',
    DRIVER_WENT_OFFLINE: 'driver_went_offline',
    DRIVER_REGISTERED: 'driver_registered',
    DRIVER_DOCUMENT_UPLOADED: 'driver_document_uploaded',
    // Auth
    ACCOUNT_REGISTERED: 'account_registered',
    ACCOUNT_LOGGED_IN: 'account_logged_in',
    ACCOUNT_DELETED: 'account_deleted',
    // Safety
    SOS_TRIGGERED: 'sos_triggered',
    // Chat
    MESSAGE_SENT: 'message_sent',
    // Favourites
    FAVOURITE_ADDED: 'favourite_added',
};

// ---------------------------------------------------------------------------
// Internal dispatch — replace body to integrate a real provider
// ---------------------------------------------------------------------------
function _dispatch(userId, event, properties) {
    const payload = {
        event,
        userId: userId ? String(userId) : null,
        properties: properties || {},
        timestamp: new Date().toISOString(),
        env: process.env.NODE_ENV || 'development',
    };

    // Structured JSON line — easy to pipe into log aggregators (Datadog, Loki, etc.)
    console.log('[analytics]', JSON.stringify(payload));

    // Future: await mixpanel.track(event, { distinct_id: userId, ...properties });
    // Future: await segment.track({ userId, event, properties });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Track an analytics event.
 *
 * @param {string|ObjectId|null} userId     The acting user's ID (or null for anonymous)
 * @param {string}               event      Event name — use EVENTS constants for consistency
 * @param {Object}               [properties={}]  Arbitrary key/value pairs (no PII like passwords)
 */
function trackEvent(userId, event, properties = {}) {
    try {
        _dispatch(userId, event, properties);
    } catch (err) {
        // Analytics must never crash the application
        console.error('[analytics] dispatch error:', err.message);
    }
}

module.exports = { trackEvent, EVENTS };
