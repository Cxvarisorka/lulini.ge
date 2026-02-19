const { Expo } = require('expo-server-sdk');
const User = require('../models/user.model');
const { getMessage } = require('../i18n/pushMessages');

const expo = new Expo();

const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000]; // Exponential backoff

/**
 * Remove invalid tokens from a user's deviceTokens array
 */
async function removeInvalidTokens(userId, invalidTokens) {
    if (!invalidTokens.length) return;
    try {
        await User.updateOne(
            { _id: userId },
            { $pull: { deviceTokens: { token: { $in: invalidTokens } } } }
        );
        console.log(`Removed ${invalidTokens.length} invalid token(s) for user ${userId}`);
    } catch (err) {
        console.error(`Failed to remove invalid tokens for user ${userId}:`, err.message);
    }
}

/**
 * Send push notifications with retry logic
 */
async function sendWithRetry(chunks, attempt = 0) {
    const failedMessages = [];

    for (const chunk of chunks) {
        try {
            const ticketChunk = await expo.sendPushNotificationsAsync(chunk);

            for (let i = 0; i < ticketChunk.length; i++) {
                const ticket = ticketChunk[i];
                if (ticket.status === 'error') {
                    if (ticket.details && ticket.details.error === 'DeviceNotRegistered') {
                        // Token is invalid — will be cleaned up by caller
                        failedMessages.push({ message: chunk[i], error: 'DeviceNotRegistered' });
                    } else if (attempt < MAX_RETRIES - 1) {
                        failedMessages.push({ message: chunk[i], error: ticket.message, retryable: true });
                    } else {
                        console.error(`Push failed after ${MAX_RETRIES} retries:`, ticket.message);
                    }
                }
            }
        } catch (err) {
            // Network/server error — retry entire chunk
            if (attempt < MAX_RETRIES - 1) {
                for (const msg of chunk) {
                    failedMessages.push({ message: msg, error: err.message, retryable: true });
                }
            } else {
                console.error(`Push chunk failed after ${MAX_RETRIES} retries:`, err.message);
            }
        }
    }

    // Collect invalid tokens for cleanup
    const invalidTokens = failedMessages
        .filter(f => f.error === 'DeviceNotRegistered')
        .map(f => f.message.to);

    // Retry retryable failures
    const retryableMessages = failedMessages
        .filter(f => f.retryable)
        .map(f => f.message);

    if (retryableMessages.length > 0 && attempt < MAX_RETRIES - 1) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[attempt]));
        const retryChunks = expo.chunkPushNotifications(retryableMessages);
        const retryInvalid = await sendWithRetry(retryChunks, attempt + 1);
        invalidTokens.push(...retryInvalid);
    }

    return invalidTokens;
}

/**
 * Send push notification to a single user
 * @param {string} userId - User's MongoDB _id
 * @param {string} titleKey - Message key for title (e.g. 'ride_accepted_title')
 * @param {string} bodyKey - Message key for body (e.g. 'ride_accepted_body')
 * @param {object} data - Extra data payload for the notification
 * @param {object} params - Template parameters (e.g. { driverName: 'John' })
 */
async function sendToUser(userId, titleKey, bodyKey, data = {}, params = {}) {
    try {
        const user = await User.findById(userId).select('deviceTokens preferredLanguage').lean();
        if (!user || !user.deviceTokens || user.deviceTokens.length === 0) return;

        const lang = user.preferredLanguage || 'ka';
        const title = getMessage(lang, titleKey, params);
        const body = getMessage(lang, bodyKey, params);

        const messages = user.deviceTokens
            .filter(dt => Expo.isExpoPushToken(dt.token))
            .map(dt => ({
                to: dt.token,
                sound: 'default',
                title,
                body,
                data: { ...data, type: titleKey.replace('_title', '') },
                priority: 'high',
                channelId: data.channelId || 'default',
            }));

        if (messages.length === 0) return;

        const chunks = expo.chunkPushNotifications(messages);
        const invalidTokens = await sendWithRetry(chunks);

        if (invalidTokens.length > 0) {
            await removeInvalidTokens(userId, invalidTokens);
        }
    } catch (err) {
        console.error(`Push notification error for user ${userId}:`, err.message);
    }
}

/**
 * Send push notification to multiple users
 * @param {string[]} userIds - Array of user MongoDB _ids
 * @param {string} titleKey - Message key for title
 * @param {string} bodyKey - Message key for body
 * @param {object} data - Extra data payload
 * @param {object} params - Template parameters
 */
async function sendToUsers(userIds, titleKey, bodyKey, data = {}, params = {}) {
    if (!userIds || userIds.length === 0) return;

    try {
        const users = await User.find({ _id: { $in: userIds } })
            .select('deviceTokens preferredLanguage')
            .lean();

        const allMessages = [];
        const tokenToUser = new Map();

        for (const user of users) {
            if (!user.deviceTokens || user.deviceTokens.length === 0) continue;

            const lang = user.preferredLanguage || 'ka';
            const title = getMessage(lang, titleKey, params);
            const body = getMessage(lang, bodyKey, params);

            for (const dt of user.deviceTokens) {
                if (!Expo.isExpoPushToken(dt.token)) continue;
                tokenToUser.set(dt.token, user._id);
                allMessages.push({
                    to: dt.token,
                    sound: 'default',
                    title,
                    body,
                    data: { ...data, type: titleKey.replace('_title', '') },
                    priority: 'high',
                    channelId: data.channelId || 'default',
                });
            }
        }

        if (allMessages.length === 0) return;

        const chunks = expo.chunkPushNotifications(allMessages);
        const invalidTokens = await sendWithRetry(chunks);

        // Group invalid tokens by user for cleanup
        const userInvalidTokens = new Map();
        for (const token of invalidTokens) {
            const uid = tokenToUser.get(token);
            if (!uid) continue;
            if (!userInvalidTokens.has(uid.toString())) {
                userInvalidTokens.set(uid.toString(), []);
            }
            userInvalidTokens.get(uid.toString()).push(token);
        }

        for (const [uid, tokens] of userInvalidTokens) {
            await removeInvalidTokens(uid, tokens);
        }
    } catch (err) {
        console.error('Batch push notification error:', err.message);
    }
}

module.exports = { sendToUser, sendToUsers };
