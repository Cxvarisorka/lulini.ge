const { createClient } = require('redis');

let redisClient = null;

async function getRedisClient() {
    if (redisClient && redisClient.isReady) return redisClient;

    redisClient = createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        socket: {
            reconnectStrategy: (retries) => Math.min(retries * 100, 5000),
        }
    });

    redisClient.on('error', (err) => console.error('Redis error:', err.message));
    redisClient.on('connect', () => console.log('Redis connected'));

    await redisClient.connect();
    return redisClient;
}

module.exports = { getRedisClient };
