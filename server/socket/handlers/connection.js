// Socket.IO connection handler — manages room joins, driver rejoin, and disconnect.
//
// IMPORTANT: All socket.on() listeners MUST be registered synchronously (before any await)
// to avoid race conditions where the client sends events before handlers are set up.

const Driver = require('../../models/driver.model');
const { trackConnection, untrackConnection, getConnectionCount } = require('../presence');
const { validated } = require('../validate');

// Driver profile query — shared between connection setup and rejoin handler.
// Returns lean object with only the fields needed for room management.
const DRIVER_QUERY_FIELDS = 'status vehicle.type';
function findDriverProfile(userId) {
    return Driver.findOne({ user: userId, isActive: true, isApproved: true })
        .select(DRIVER_QUERY_FIELDS).lean();
}

/**
 * Join broadcast rooms (drivers:all, drivers:{type}) based on driver profile status.
 * Only joins if driver status is 'online' or 'busy'.
 *
 * @param {Socket} socket - The socket to join rooms
 * @param {object} profile - Driver profile from DB (lean)
 * @param {function} joinSameAppSockets - Helper to sync other same-appType sockets
 */
async function joinBroadcastRooms(socket, profile, joinSameAppSockets) {
    if (!profile) return;
    if (profile.status !== 'online' && profile.status !== 'busy') return;

    socket.join('drivers:all');
    await joinSameAppSockets('drivers:all');
    if (profile.vehicle?.type) {
        const typeRoom = `drivers:${profile.vehicle.type}`;
        socket.join(typeRoom);
        await joinSameAppSockets(typeRoom);
    }
}

function connectionHandler(io) {
    io.on('connection', async (socket) => {
        // Store and validate app type from handshake query (passenger | driver | undefined)
        const rawAppType = socket.handshake.query?.appType || null;
        // C2: Validate appType matches user role — reject driver-app connections from non-driver users
        if (rawAppType === 'driver' && socket.user.role !== 'driver' && socket.user.role !== 'admin') {
            const hasDriverProfile = await findDriverProfile(socket.user.id);
            if (!hasDriverProfile) {
                console.log(`[Socket] Rejecting driver-app connection: userId=${socket.user.id}, role=${socket.user.role}, no approved driver profile found`);
                socket.emit('error', { message: 'Not authorized as driver' });
                socket.disconnect(true);
                return;
            }
        }
        socket.appType = rawAppType;

        if (process.env.NODE_ENV !== 'production') {
            console.log(`User connected: ${socket.user.role} (${socket.appType || 'unknown'}) - socket: ${socket.id}`);
        }

        const driverRoom = `driver:${socket.user.id}`;
        const userRoom = `user:${socket.user.id}`;
        const isDriverRole = socket.user.role === 'driver';
        const isDriverApp = socket.appType === 'driver';

        // Track this connection in the presence system
        trackConnection(socket.user.id);

        // Helper: join a room for all sockets of this user that share the same appType.
        // Prevents passenger-app sockets from being added to driver broadcast rooms.
        const joinSameAppSockets = async (room) => {
            try {
                const sockets = await io.in(userRoom).fetchSockets();
                for (const s of sockets) {
                    if (s.appType === socket.appType) {
                        s.join(room);
                    }
                }
            } catch { /* ignore fetch errors */ }
        };

        // Limit to 3 concurrent connections per user (disconnect oldest on overflow)
        const currentCount = getConnectionCount(socket.user.id);
        if (currentCount > 3) {
            try {
                const existingSockets = await io.in(userRoom).fetchSockets();
                if (existingSockets.length > 3) {
                    existingSockets[0].disconnect(true);
                }
            } catch { /* ignore fetch errors */ }
        }

        // Join user to their personal room (always — this is the fallback for event delivery)
        socket.join(userRoom);

        // Join admins to admin room for real-time updates
        if (socket.user.role === 'admin') {
            socket.join('admin');
        }

        // Fast-path: if role is 'driver', join personal driver room immediately (no DB needed)
        // Broadcast rooms (drivers:all, drivers:{type}) are joined only after DB confirms status is online/busy
        if (isDriverRole) {
            socket.join(driverRoom);
        }

        // ── Per-socket driver profile cache ──
        // Prevents duplicate DB lookups between connection setup and driver:rejoin handler.
        // Populated once during connection setup (async section below).
        // driver:rejoin uses this cache on the fast path, and refreshes it on the slow path.
        let cachedDriverProfile = null;
        let profileFetchedAt = 0;

        // ── Register ALL event listeners synchronously (before any await) ──

        // Allow drivers to rejoin their room (e.g., after reconnection)
        // Rate-limited: max 1 rejoin with DB query per 10 seconds per socket.
        // Payload: { force?: boolean } — force=true skips the 10s rate limit (still DB-limited)
        let lastRejoinWithDb = 0;
        socket.on('driver:rejoin', validated({
            force: { type: 'boolean', required: false },
        }, async (data) => {
            const now = Date.now();

            // Fast path: always rejoin personal driver room (cheap, no DB)
            if (isDriverRole) {
                socket.join(driverRoom);
                await joinSameAppSockets(driverRoom);
            }

            // Slow path: verify driver profile AND status in DB (rate-limited)
            if (now - lastRejoinWithDb < 10000) {
                // Use cached profile for broadcast room joins (avoids duplicate DB query)
                if (cachedDriverProfile) {
                    await joinBroadcastRooms(socket, cachedDriverProfile, joinSameAppSockets);
                }
                socket.emit('driver:rejoined', { success: true });
                return;
            }
            lastRejoinWithDb = now;

            try {
                const profile = await findDriverProfile(socket.user.id);
                // Update cache with fresh data
                cachedDriverProfile = profile;
                profileFetchedAt = now;

                if (isDriverRole || profile) {
                    socket.join(driverRoom);
                    await joinSameAppSockets(driverRoom);
                    await joinBroadcastRooms(socket, profile, joinSameAppSockets);
                }
                // Always ACK to prevent client timeout loops
                socket.emit('driver:rejoined', { success: !!(isDriverRole || profile) });
            } catch (err) {
                console.error(`Error during driver:rejoin for user ${socket.user.id}:`, err.message);
                // Always ACK even on error to prevent client timeout loops
                socket.emit('driver:rejoined', { success: false, error: true });
            }
        }));

        socket.on('disconnect', (reason) => {
            // Untrack from presence system
            untrackConnection(socket.user.id);

            if (process.env.NODE_ENV !== 'production') {
                console.log(`User disconnected: socket ${socket.id}, reason: ${reason}`);
            }
        });

        // ── Async work (AFTER listeners are registered, so no events are missed) ──

        // Sync other same-appType sockets into the driver room (deferred from above)
        if (isDriverRole) {
            await joinSameAppSockets(driverRoom);
        }

        // Single DB lookup for driver profile — used by both connection setup and rejoin cache.
        // Covers both cases: role=driver users AND non-driver-role users on the driver app.
        if (isDriverRole || isDriverApp) {
            try {
                const driverProfile = await findDriverProfile(socket.user.id);
                // Populate the per-socket cache so driver:rejoin can reuse it
                cachedDriverProfile = driverProfile;
                profileFetchedAt = Date.now();

                if (driverProfile) {
                    // For driver-app users who don't have role=driver, join personal driver room
                    if (!isDriverRole) {
                        socket.join(driverRoom);
                        await joinSameAppSockets(driverRoom);
                    }
                    // Join broadcast rooms if online/busy
                    await joinBroadcastRooms(socket, driverProfile, joinSameAppSockets);
                }
            } catch (err) {
                // DB lookup failed — broadcast rooms will be joined on rejoin or goOnline
            }
        }
    });
}

module.exports = connectionHandler;
