// Ride event queue using BullMQ (backed by Redis).
// Decouples ride processing from notification delivery.
// Events are published to the queue and consumed by the rideEventWorker.

const { Queue } = require('bullmq');

let rideEventQueue = null;

function getRideEventQueue() {
    if (rideEventQueue) return rideEventQueue;
    if (!process.env.REDIS_URL) return null;

    rideEventQueue = new Queue('ride-events', {
        connection: { url: process.env.REDIS_URL },
        defaultJobOptions: {
            attempts: 3,
            backoff: { type: 'exponential', delay: 1000 },
            removeOnComplete: { count: 1000 },
            removeOnFail: { count: 5000 },
        }
    });

    return rideEventQueue;
}

/**
 * Publish a ride lifecycle event to the queue.
 *
 * @param {string} eventType - e.g. 'ride:accepted', 'ride:completed', 'ride:cancelled'
 * @param {object} rideData - ride data to include in notifications
 * @param {object} recipients - { userId, driverUserId, broadcastDrivers }
 */
async function publishRideEvent(eventType, rideData, recipients = {}) {
    const queue = getRideEventQueue();
    if (!queue) return null; // Redis not available, caller handles inline

    return queue.add(eventType, {
        eventType,
        rideData,
        recipients,
        timestamp: Date.now()
    });
}

module.exports = { getRideEventQueue, publishRideEvent };
