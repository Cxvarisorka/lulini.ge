// Ride event worker — processes ride lifecycle events from the BullMQ queue.
// Handles socket emissions and push notifications asynchronously.
//
// Usage:
//   node workers/rideEventWorker.js    (standalone)
//   Add to ecosystem.config.js         (managed by PM2)

require('dotenv').config();

const { Worker } = require('bullmq');
const mongoose = require('mongoose');
const connectDB = require('../configs/db.config');

async function startRideEventWorker() {
    await connectDB();

    // Set up Socket.io for emitting events via Redis adapter
    let io = null;
    if (process.env.REDIS_URL) {
        const { Server } = require('socket.io');
        const { createAdapter } = require('@socket.io/redis-adapter');
        const { getRedisClient } = require('../configs/redis.config');

        try {
            io = new Server();
            const pubClient = await getRedisClient();
            const subClient = pubClient.duplicate();
            await subClient.connect();
            io.adapter(createAdapter(pubClient, subClient));
            console.log('RideEventWorker: Socket.io Redis adapter enabled');
        } catch (err) {
            console.error('RideEventWorker: Redis adapter failed:', err.message);
        }
    }

    const pushService = require('../services/pushNotification.service');

    const worker = new Worker('ride-events', async (job) => {
        const { eventType, rideData, recipients } = job.data;

        // Emit socket events
        if (io && recipients.userId) {
            io.to(`user:${recipients.userId}`).emit(eventType, rideData);
        }
        if (io && recipients.driverUserId) {
            io.to(`driver:${recipients.driverUserId}`).emit(eventType, rideData);
        }
        if (io && recipients.broadcastDrivers) {
            io.to('drivers:all').emit(eventType, rideData);
        }
        if (io) {
            io.to('admin').emit(eventType, rideData);
        }

        // Send push notifications (cross-process presence check via Redis)
        if (recipients.pushToUser && recipients.userId) {
            try {
                const { isUserOnlineAsync } = require('../socket/presence');
                if (!(await isUserOnlineAsync(recipients.userId))) {
                    await pushService.sendToUser(
                        recipients.userId,
                        recipients.pushTitleKey || `${eventType}_title`,
                        recipients.pushBodyKey || `${eventType}_body`,
                        { rideId: rideData.rideId || '' }
                    );
                }
            } catch (err) {
                console.error(`RideEventWorker push error (${eventType}):`, err.message);
            }
        }

        if (recipients.pushToDriver && recipients.driverUserId) {
            try {
                await pushService.sendToUser(
                    recipients.driverUserId,
                    recipients.driverPushTitleKey || `${eventType}_driver_title`,
                    recipients.driverPushBodyKey || `${eventType}_driver_body`,
                    { rideId: rideData.rideId || '' }
                );
            } catch (err) {
                console.error(`RideEventWorker push error (${eventType}/driver):`, err.message);
            }
        }

    }, {
        connection: { url: process.env.REDIS_URL },
        concurrency: 10,
    });

    worker.on('completed', (job) => {
        if (process.env.NODE_ENV !== 'production') {
            console.log(`RideEventWorker: Processed ${job.name}`);
        }
    });

    worker.on('failed', (job, err) => {
        console.error(`RideEventWorker: Failed ${job?.name}:`, err.message);
    });

    console.log('Ride event worker started');
    return worker;
}

// Store worker reference for graceful shutdown
let _workerInstance = null;

// Graceful shutdown — close worker first, then DB
async function gracefulShutdown(signal) {
    console.log(`\nRideEventWorker: ${signal} received. Shutting down...`);

    try {
        // Close the BullMQ worker first (stops accepting new jobs, waits for active ones)
        if (_workerInstance) {
            await _workerInstance.close();
            console.log('RideEventWorker: Worker closed');
        }
    } catch (err) {
        console.error('RideEventWorker: Error closing worker:', err.message);
    }

    try {
        await mongoose.connection.close();
        console.log('RideEventWorker: MongoDB connection closed');
        process.exit(0);
    } catch {
        process.exit(1);
    }

    setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

startRideEventWorker().then(worker => {
    _workerInstance = worker;
}).catch(err => {
    console.error('Ride event worker failed to start:', err);
    process.exit(1);
});
