/**
 * Ride dispatch pub/sub — singleton Redis subscriber.
 *
 * Used by the ETA dispatch loop to wait for a driver accept/cancel response
 * without polling the database.
 *
 * Why a singleton: previously `waitForRideResponse` spun up a fresh
 * `redis.duplicate()` connection per candidate driver (up to 5 per ride
 * request). That pattern triggered a decoder race in @redis/client@5.11 —
 * a push message arriving while the client was disconnecting dereferenced
 * an empty `#waitingForReply` queue and crashed the process with
 *   TypeError: Cannot read properties of undefined (reading 'value')
 * which escaped as uncaughtException → process.exit(1).
 *
 * This module keeps ONE persistent subscriber for the whole process and
 * routes each incoming message to waiting resolvers through an in-memory
 * EventEmitter keyed by rideId. No per-request connect/disconnect churn.
 */

const { EventEmitter } = require('events');
const { getRedisClient } = require('../configs/redis.config');
const logger = require('../utils/logger');

const RIDE_DISPATCH_CHANNEL = 'ride:dispatch:response';

// Internal event bus. We deliberately allow many listeners because each
// in-flight ride registers one listener for the duration of a single offer.
const emitter = new EventEmitter();
emitter.setMaxListeners(0);

let subscriberClient = null;
let initPromise = null;

async function initSubscriber() {
    if (subscriberClient) return subscriberClient;
    if (initPromise) return initPromise;

    initPromise = (async () => {
        try {
            const main = await getRedisClient();
            // One dedicated pub/sub connection for the lifetime of the process.
            const sub = main.duplicate();
            sub.on('error', (err) => {
                logger.error('rideDispatchPubsub subscriber error: ' + err.message, 'pubsub');
            });
            await sub.connect();
            await sub.subscribe(RIDE_DISPATCH_CHANNEL, (message) => {
                try {
                    const data = JSON.parse(message);
                    if (data && data.rideId) {
                        emitter.emit(data.rideId, data.action);
                    }
                } catch {
                    /* ignore malformed messages */
                }
            });
            subscriberClient = sub;
            return sub;
        } catch (err) {
            // Reset so a later call can retry (e.g. once Redis is back).
            initPromise = null;
            throw err;
        }
    })();

    return initPromise;
}

/**
 * Publish a ride response. Best-effort — swallowed errors are logged.
 */
async function notifyRideResponse(rideId, action) {
    try {
        const main = await getRedisClient();
        await main.publish(RIDE_DISPATCH_CHANNEL, JSON.stringify({ rideId, action }));
    } catch (err) {
        logger.error('notifyRideResponse failed: ' + err.message, 'pubsub');
    }
}

/**
 * Wait for the given rideId to receive a response, or time out.
 * Resolves to 'accepted', 'cancelled', or 'timeout'.
 *
 * Never rejects — any Redis failure falls back to the timeout path so the
 * dispatch loop continues to the next candidate driver.
 */
async function waitForRideResponse(rideId, timeoutMs) {
    try {
        await initSubscriber();
    } catch {
        // Redis unavailable — simulate a timeout so the caller can continue.
        return new Promise((resolve) => setTimeout(() => resolve('timeout'), timeoutMs));
    }

    return new Promise((resolve) => {
        let settled = false;
        const onAction = (action) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            emitter.off(rideId, onAction);
            resolve(action);
        };
        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            emitter.off(rideId, onAction);
            resolve('timeout');
        }, timeoutMs);

        emitter.on(rideId, onAction);
    });
}

module.exports = {
    notifyRideResponse,
    waitForRideResponse,
    RIDE_DISPATCH_CHANNEL,
};
