/**
 * In-App Chat Controller
 *
 * Allows passengers and drivers to exchange text messages within the context
 * of an active (or recently completed) ride. Messages are persisted to MongoDB
 * and delivered in real-time via Socket.io to the other party's room.
 */

'use strict';

const Message = require('../models/message.model');
const Ride = require('../models/ride.model');
const Driver = require('../models/driver.model');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const analytics = require('../services/analytics.service');
const pushNotification = require('../services/pushNotification.service');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve whether the authenticated user is a participant of the given ride
 * and return their role ('passenger' | 'driver').
 *
 * Returns null if the user is neither passenger nor driver on this ride.
 *
 * @param {Object} ride     Mongoose Ride document (not lean)
 * @param {Object} reqUser  req.user (plain object from protect middleware)
 * @returns {Promise<{role: string, otherRoom: string}|null>}
 */
async function resolveParticipant(ride, reqUser) {
    const userId = (reqUser._id || reqUser.id).toString();

    // Passenger check
    if (ride.user.toString() === userId) {
        // Determine the other party's socket room
        let otherRoom = 'admin'; // fallback if no driver yet
        let otherUserId = null;
        if (ride.driver) {
            const driverDoc = await Driver.findById(ride.driver).select('user').lean();
            if (driverDoc) {
                otherRoom = `driver:${driverDoc.user}`;
                otherUserId = driverDoc.user.toString();
            }
        }
        return { role: 'passenger', otherRoom, otherUserId };
    }

    // Driver check — look up driver profile linked to this user
    if (ride.driver) {
        const driverDoc = await Driver.findOne({ user: userId, _id: ride.driver }).select('_id').lean();
        if (driverDoc) {
            return {
                role: 'driver',
                otherRoom: `user:${ride.user}`,
                otherUserId: ride.user.toString(),
            };
        }
    }

    return null;
}

// ---------------------------------------------------------------------------
// Controllers
// ---------------------------------------------------------------------------

// @desc    Send a message for a ride
// @route   POST /api/chat/rides/:rideId/messages
// @access  Private (passenger or assigned driver)
const sendMessage = catchAsync(async (req, res, next) => {
    const { content } = req.body;

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
        return next(new AppError('Message content is required', 400));
    }

    if (content.trim().length > 1000) {
        return next(new AppError('Message cannot exceed 1000 characters', 400));
    }

    const ride = await Ride.findById(req.params.rideId).select('user driver status endTime').lean();
    if (!ride) {
        return next(new AppError('Ride not found', 404));
    }

    // Only allow messaging on active or recently completed rides (prevent historical spam)
    const allowedStatuses = ['accepted', 'driver_arrived', 'in_progress', 'completed'];
    if (!allowedStatuses.includes(ride.status)) {
        return next(new AppError('Chat is only available for accepted or active rides', 400));
    }

    // For completed rides, enforce a 24-hour messaging window after completion.
    // This prevents old rides from being used as a persistent chat channel while
    // still letting passengers and drivers sort out any immediate post-trip issues.
    if (ride.status === 'completed' && ride.endTime) {
        const cutoff = new Date(ride.endTime).getTime() + 24 * 60 * 60 * 1000;
        if (Date.now() > cutoff) {
            return next(new AppError('Chat is no longer available — this ride completed more than 24 hours ago', 403));
        }
    }

    const userId = (req.user._id || req.user.id).toString();
    const participant = await resolveParticipant(ride, req.user);
    if (!participant) {
        return next(new AppError('You are not a participant of this ride', 403));
    }

    const message = await Message.create({
        ride: ride._id,
        sender: userId,
        senderRole: participant.role,
        content: content.trim()
    });

    const populatedMessage = await Message.findById(message._id)
        .populate('sender', 'firstName lastName profileImage')
        .lean();

    // Real-time delivery to the other party
    const io = req.app.get('io');
    if (io && participant.otherRoom) {
        io.to(participant.otherRoom).emit('chat:message', {
            rideId: ride._id,
            message: populatedMessage
        });
    }

    // Push notification only when the other party is NOT connected via socket
    // (i.e. app is in background / closed). If connected, they get real-time
    // delivery + in-app sound — no need for a push.
    if (participant.otherUserId && io && participant.otherRoom) {
        const room = io.sockets.adapter.rooms.get(participant.otherRoom);
        const isOnline = room && room.size > 0;
        if (!isOnline) {
            const senderName = populatedMessage.sender
                ? `${populatedMessage.sender.firstName || ''} ${populatedMessage.sender.lastName || ''}`.trim()
                : '';
            const preview = content.trim().length > 80
                ? content.trim().substring(0, 80) + '…'
                : content.trim();
            pushNotification.sendToUser(
                participant.otherUserId,
                'chat_message_title',
                'chat_message_body',
                { rideId: ride._id.toString(), type: 'chat_message', channelId: 'chat' },
                { senderName: senderName || (participant.role === 'passenger' ? 'Passenger' : 'Driver'), content: preview }
            ).catch(() => {}); // best-effort, don't block response
        }
    }

    analytics.trackEvent(userId, analytics.EVENTS.MESSAGE_SENT, {
        rideId: ride._id.toString(),
        senderRole: participant.role,
        contentLength: content.trim().length
    });

    res.status(201).json({
        success: true,
        message: 'Message sent',
        data: { message: populatedMessage }
    });
});

// @desc    Get all messages for a ride (paginated, oldest first)
// @route   GET /api/chat/rides/:rideId/messages
// @access  Private (passenger or assigned driver)
const getMessages = catchAsync(async (req, res, next) => {
    const ride = await Ride.findById(req.params.rideId).select('user driver status').lean();
    if (!ride) {
        return next(new AppError('Ride not found', 404));
    }

    const participant = await resolveParticipant(ride, req.user);
    if (!participant) {
        return next(new AppError('You are not a participant of this ride', 403));
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const skip = (page - 1) * limit;

    const [messages, total] = await Promise.all([
        Message.find({ ride: ride._id })
            .populate('sender', 'firstName lastName profileImage')
            .sort({ createdAt: 1 }) // chronological order
            .skip(skip)
            .limit(limit)
            .lean(),
        Message.countDocuments({ ride: ride._id })
    ]);

    res.json({
        success: true,
        count: messages.length,
        total,
        page,
        pages: Math.ceil(total / limit),
        data: { messages }
    });
});

// @desc    Mark messages as read up to (and including) a given messageId
// @route   PATCH /api/chat/rides/:rideId/messages/read
// @access  Private (passenger or assigned driver)
const markAsRead = catchAsync(async (req, res, next) => {
    const { messageId } = req.body;

    if (!messageId) {
        return next(new AppError('messageId is required', 400));
    }

    const ride = await Ride.findById(req.params.rideId).select('user driver').lean();
    if (!ride) {
        return next(new AppError('Ride not found', 404));
    }

    const participant = await resolveParticipant(ride, req.user);
    if (!participant) {
        return next(new AppError('You are not a participant of this ride', 403));
    }

    // Find the reference message to get its timestamp
    const refMessage = await Message.findOne({
        _id: messageId,
        ride: ride._id
    }).select('createdAt').lean();

    if (!refMessage) {
        return next(new AppError('Message not found in this ride', 404));
    }

    // Mark all messages up to this timestamp as read — but only messages sent
    // by the OTHER party (you don't read your own messages)
    const oppositeRole = participant.role === 'passenger' ? 'driver' : 'passenger';

    const result = await Message.updateMany(
        {
            ride: ride._id,
            senderRole: oppositeRole,
            readAt: null,
            createdAt: { $lte: refMessage.createdAt }
        },
        { $set: { readAt: new Date() } }
    );

    res.json({
        success: true,
        message: 'Messages marked as read',
        data: { markedCount: result.modifiedCount }
    });
});

module.exports = { sendMessage, getMessages, markAsRead };
