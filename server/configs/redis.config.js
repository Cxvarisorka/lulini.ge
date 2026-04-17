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

/**
 * Create an independent Redis client for subscriber use (Socket.io adapter,
 * pub/sub listeners, etc.).
 *
 * Why not `.duplicate()`: @redis/client@5.11 has a decoder bug where
 * `#getTypeMapping` accesses `#waitingForReply.head.value` without a null
 * check. When a pub/sub push message arrives on an empty command queue the
 * decoder throws a TypeError that escapes as an uncaughtException. Using a
 * fresh `createClient` call (identical to duplicate, but with an explicit
 * error handler and reconnect strategy) keeps each subscriber isolated and
 * lets us log the error instead of crashing.
 */
async function createSubscriberClient(label = 'subscriber') {
    const sub = createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        socket: {
            reconnectStrategy: (retries) => Math.min(retries * 100, 5000),
        },
    });
    sub.on('error', (err) => {
        console.error(`Redis ${label} error:`, err.message);
    });
    await sub.connect();
    return sub;
}

module.exports = { getRedisClient, getBullMQConnection, createSubscriberClient };
