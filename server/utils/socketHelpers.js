// Shared socket helper utilities — used by ride, driver, and payment controllers.
// Eliminates duplicate pushIfOffline implementations and adds ACK support for critical events.

const pushService = require('../services/pushNotification.service');
const { isUserOnline, isUserOnlineAsync } = require('../socket/presence');

/**
 * Send push notification only if the user has NO active socket connection.
 * Uses the presence system (O(1) local + async Redis fallback) instead of
 * fetchSockets() (O(nodes) in cluster).
 *
 * When the app is foregrounded the socket event already triggers an in-app alert;
 * sending a push as well causes duplicate/triple notifications.
 */
async function pushIfOffline(io, userId, titleKey, bodyKey, data = {}, params = {}) {
    try {
        const uid = String(userId);
        // Fast path: local check (covers same-process sockets)
        if (isUserOnline(uid)) return;
        // Slow path: cross-process Redis check (covers multi-process deployments)
        if (await isUserOnlineAsync(uid)) return;
    } catch {
        // If presence check fails, fall through and send the push as a safety net
    }
    return pushService.sendToUser(userId, titleKey, bodyKey, data, params);
}

/**
 * Emit a critical event with delivery guarantee attempt.
 *
 * For critical ride lifecycle events (accepted, completed, cancelled) and payment events,
 * this helper emits the event AND sends a push notification as a backup if the user
 * appears to be offline. This ensures the user receives the notification even if their
 * socket is momentarily disconnected during the emit.
 *
 * @param {object} io - Socket.IO server instance
 * @param {string} room - Target room (e.g., `user:${userId}`)
 * @param {string} event - Event name (e.g., 'ride:accepted')
 * @param {object} data - Event payload
 * @param {object} [pushOpts] - Optional push notification config
 * @param {string} pushOpts.userId - User ID for push fallback
 * @param {string} pushOpts.titleKey - Push notification title key
 * @param {string} pushOpts.bodyKey - Push notification body key
 * @param {object} pushOpts.data - Push notification data payload
 * @param {object} pushOpts.params - Push notification template params
 */
async function emitCritical(io, room, event, data, pushOpts) {
    if (!io) return;

    // Check presence BEFORE emitting so we know the user's online state at decision time.
    // This avoids the race where a user disconnects between emit and presence check
    // (causing a duplicate push) or connects after check but before emit (missing both).
    let shouldPush = false;
    if (pushOpts && pushOpts.userId) {
        try {
            const uid = String(pushOpts.userId);
            const localOnline = isUserOnline(uid);
            if (!localOnline) {
                const remoteOnline = await isUserOnlineAsync(uid);
                shouldPush = !remoteOnline;
            }
        } catch {
            // If presence check fails, send push as safety net
            shouldPush = true;
        }
    }

    io.to(room).emit(event, data);

    if (shouldPush) {
        pushService.sendToUser(
            pushOpts.userId,
            pushOpts.titleKey,
            pushOpts.bodyKey,
            pushOpts.data || {},
            pushOpts.params || {}
        ).catch(err => console.error(`Push error (${event}):`, err.message));
    }
}

module.exports = { pushIfOffline, emitCritical };
