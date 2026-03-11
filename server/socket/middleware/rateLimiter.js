// Per-socket event rate limiter.
// Tracks event counts per socket per event name with sliding window.
// Fixes memory leak: caps tracked event names to prevent unbounded Map growth
// from malicious clients sending unique event names.

const MAX_TRACKED_EVENTS = 50; // Max unique event names tracked per socket

const EVENT_LIMITS = {
    'driver:rejoin': { max: 5, windowMs: 10000 },       // 5 per 10s
    'user:locationUpdate': { max: 10, windowMs: 10000 }, // 10 per 10s
};
const DEFAULT_LIMIT = { max: 20, windowMs: 10000 };     // 20 per 10s for unlisted events

function rateLimiterMiddleware(io) {
    io.use((socket, next) => {
        const eventCounts = new Map(); // eventName -> { count, windowStart }

        const originalOnevent = socket.onevent;
        socket.onevent = function (packet) {
            const eventName = packet.data?.[0];
            if (eventName && typeof eventName === 'string') {
                const limit = EVENT_LIMITS[eventName] || DEFAULT_LIMIT;
                const now = Date.now();
                let entry = eventCounts.get(eventName);

                if (!entry || now - entry.windowStart > limit.windowMs) {
                    // New window — but first check if we've hit the tracking cap.
                    // This prevents a malicious client from sending unique event names
                    // to cause unbounded Map growth for the socket's lifetime.
                    if (!entry && eventCounts.size >= MAX_TRACKED_EVENTS) {
                        // Evict oldest entries to make room
                        let oldest = Infinity;
                        let oldestKey = null;
                        for (const [key, val] of eventCounts) {
                            if (val.windowStart < oldest) {
                                oldest = val.windowStart;
                                oldestKey = key;
                            }
                        }
                        if (oldestKey) eventCounts.delete(oldestKey);
                    }
                    entry = { count: 0, windowStart: now };
                    eventCounts.set(eventName, entry);
                }

                entry.count++;
                if (entry.count > limit.max) {
                    return; // Drop the event silently — don't crash the socket
                }
            }
            originalOnevent.call(socket, packet);
        };

        next();
    });
}

module.exports = rateLimiterMiddleware;
