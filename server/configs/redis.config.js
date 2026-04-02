const { createClient } = require('redis');

let redisClient = null;
let connectPromise = null;

async function getRedisClient() {
    if (redisClient && redisClient.isReady) return redisClient;

    // Prevent race: if a connect() is already in flight, wait for it
    if (connectPromise) return connectPromise;

    connectPromise = (async () => {
        const client = createClient({
            url: process.env.REDIS_URL || 'redis://localhost:6379',
            socket: {
                reconnectStrategy: (retries) => Math.min(retries * 100, 5000),
            }
        });

        client.on('error', (err) => console.error('Redis error:', err.message));
        client.on('connect', () => console.log('Redis connected'));

        await client.connect();
        redisClient = client;
        return client;
    })();

    try {
        return await connectPromise;
    } catch (err) {
        connectPromise = null; // Allow retry on failure
        throw err;
    }
}

/**
 * Return a raw connection options object for BullMQ.
 * BullMQ manages its own connections internally — passing a shared client
 * causes "move to delayed" errors. Instead we give it the parsed URL so it
 * can create the minimum connections it needs (typically 2 per Worker, 1 per Queue).
 */
function getBullMQConnection() {
    return {
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        enableOfflineQueue: false,
    };
}

module.exports = { getRedisClient, getBullMQConnection };
