// Socket.IO initialization — modular entry point.
// Registers middleware and connection handlers in the correct order.
//
// Middleware execution order:
//   1. Capacity check (fail-fast before auth)
//   2. Authentication (JWT validation + user cache)
//   3. Rate limiting (per-event throttling)
//   4. Connection handler (room management + event listeners)

const capacityMiddleware = require('./middleware/capacity');
const authMiddleware = require('./middleware/auth');
const rateLimiterMiddleware = require('./middleware/rateLimiter');
const connectionHandler = require('./handlers/connection');

function initSocket(io) {
    // 1. Reject connections when server is at capacity (before any auth work)
    capacityMiddleware(io);

    // 2. Authenticate socket connections (JWT from auth header or cookies)
    authMiddleware(io);

    // 3. Rate-limit incoming events per socket
    rateLimiterMiddleware(io);

    // 4. Handle connection events (room joins, driver rejoin, disconnect)
    connectionHandler(io);
}

module.exports = initSocket;
