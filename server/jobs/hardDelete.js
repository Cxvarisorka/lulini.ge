/**
 * Hard-Delete Job
 *
 * Permanently removes user accounts that have been in the soft-deleted state
 * (isDeleted=true) for more than 30 days. The 30-day grace period gives users
 * a window to cancel their deletion request via POST /api/auth/account/cancel.
 *
 * Associated data deleted alongside each user:
 *   - Driver profile (if any)
 *   - Ride records where the user is the passenger
 *   - Emergency contacts
 *   - Favorite locations
 *   - SOS alerts
 *   - Message records
 *
 * This job is registered in app.js and runs once per day on the primary worker.
 */

'use strict';

const User = require('../models/user.model');

const GRACE_PERIOD_DAYS = 30;
const GRACE_PERIOD_MS = GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;

/**
 * Perform hard deletion of all users whose grace period has elapsed.
 * Returns a summary object: { deleted, errors }.
 */
async function runHardDeleteJob() {
    const cutoff = new Date(Date.now() - GRACE_PERIOD_MS);

    // Find users eligible for hard deletion
    const eligibleUsers = await User.find({
        isDeleted: true,
        deletionScheduledAt: { $lte: cutoff }
    }).select('_id').lean();

    if (eligibleUsers.length === 0) {
        return { deleted: 0, errors: 0 };
    }

    const userIds = eligibleUsers.map(u => u._id);
    let deleted = 0;
    let errors = 0;

    for (const userId of userIds) {
        try {
            await hardDeleteUser(userId);
            deleted++;
        } catch (err) {
            errors++;
            console.error(`[hardDelete] Failed to hard-delete user ${userId}:`, err.message);
        }
    }

    return { deleted, errors };
}

/**
 * Delete a single user and all associated data.
 * Each model is required lazily to avoid circular dependencies.
 */
async function hardDeleteUser(userId) {
    // Lazy-require models that may not always be loaded (e.g. in tests)
    const Driver = require('../models/driver.model');
    const Ride = require('../models/ride.model');

    // Attempt to load optional models — ignore if they don't exist yet
    let EmergencyContact, FavoriteLocation, SosAlert, Message;
    try { EmergencyContact = require('../models/emergencyContact.model'); } catch (_) {}
    try { FavoriteLocation = require('../models/favoriteLocation.model'); } catch (_) {}
    try { SosAlert = require('../models/sosAlert.model'); } catch (_) {}
    try { Message = require('../models/message.model'); } catch (_) {}

    // Run deletions concurrently where possible (independent collections)
    await Promise.all([
        Driver.deleteOne({ user: userId }),
        Ride.deleteMany({ user: userId }),
        EmergencyContact ? EmergencyContact.deleteMany({ user: userId }) : Promise.resolve(),
        FavoriteLocation ? FavoriteLocation.deleteMany({ user: userId }) : Promise.resolve(),
        SosAlert ? SosAlert.deleteMany({ user: userId }) : Promise.resolve(),
        Message ? Message.deleteMany({ sender: userId }) : Promise.resolve(),
    ]);

    // Hard-delete the user document last
    await User.deleteOne({ _id: userId });
}

module.exports = { runHardDeleteJob };
