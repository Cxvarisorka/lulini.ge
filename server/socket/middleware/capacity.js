// Capacity-based admission control: reject new connections BEFORE auth (fail fast).
// Prevents overload by refusing connections when the server is at capacity.

const MAX_SOCKET_CONNECTIONS = parseInt(process.env.MAX_SOCKET_CONNECTIONS || '5000');

function capacityMiddleware(io) {
    io.use((socket, next) => {
        const currentConnections = io.engine.clientsCount;
        if (currentConnections >= MAX_SOCKET_CONNECTIONS) {
            return next(new Error('Server at capacity. Please retry.'));
        }
        next();
    });
}

module.exports = capacityMiddleware;
