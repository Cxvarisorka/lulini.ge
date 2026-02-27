// Dedicated background worker process for ride expiration jobs.
// Runs independently from the API server to avoid competing for the same
// event loop and DB connection pool.
//
// Usage:
//   node worker.js                    (standalone)
//   pm2 start ecosystem.config.js     (managed alongside API)

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./configs/db.config');

async function startWorker() {
    await connectDB();

    // Set up Socket.io instance for emitting events via Redis adapter
    let io = null;
    if (process.env.REDIS_URL) {
        const { Server } = require('socket.io');
        const { createAdapter } = require('@socket.io/redis-adapter');
        const { getRedisClient } = require('./configs/redis.config');

        try {
            io = new Server();
            const pubClient = await getRedisClient();
            const subClient = pubClient.duplicate();
            await subClient.connect();
            io.adapter(createAdapter(pubClient, subClient));
            console.log('Worker: Socket.io Redis adapter enabled');
        } catch (err) {
            console.error('Worker: Redis adapter failed, socket events will not propagate:', err.message);
            io = null;
        }
    } else {
        console.warn('Worker: REDIS_URL not set — socket events will not propagate to API instances');
    }

    const { expireOldRides, expireWaitingRides } = require('./controllers/ride.controller');

    // Run initial checks
    const initialExpire = await expireOldRides(io);
    if (initialExpire.expired > 0) {
        console.log(`Worker: Expired ${initialExpire.expired} old ride requests on startup`);
    }

    const initialWaiting = await expireWaitingRides(io);
    if (initialWaiting.cancelled > 0) {
        console.log(`Worker: Cancelled ${initialWaiting.cancelled} rides due to waiting timeout on startup`);
    }

    // Schedule periodic checks
    setInterval(async () => {
        const result = await expireOldRides(io);
        if (result.expired > 0) {
            console.log(`Worker: Expired ${result.expired} old ride requests`);
        }
    }, 60 * 1000);

    setInterval(async () => {
        const result = await expireWaitingRides(io);
        if (result.cancelled > 0) {
            console.log(`Worker: Cancelled ${result.cancelled} rides due to waiting timeout`);
        }
    }, 15 * 1000);

    console.log('Background worker started');
}

// Graceful shutdown
function gracefulShutdown(signal) {
    console.log(`\nWorker: ${signal} received. Shutting down...`);
    mongoose.connection.close().then(() => {
        console.log('Worker: MongoDB connection closed');
        process.exit(0);
    }).catch(() => {
        process.exit(1);
    });

    setTimeout(() => {
        console.error('Worker: Graceful shutdown timed out, forcing exit');
        process.exit(1);
    }, 5000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

startWorker().catch(err => {
    console.error('Worker failed to start:', err);
    process.exit(1);
});
