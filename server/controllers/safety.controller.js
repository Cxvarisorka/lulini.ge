const EmergencyContact = require('../models/emergencyContact.model');
const SosAlert = require('../models/sosAlert.model');
const User = require('../models/user.model');
const Ride = require('../models/ride.model');
const RideShare = require('../models/rideShare.model');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const pushService = require('../services/pushNotification.service');
const smsService = require('../services/sms.service');
const analytics = require('../services/analytics.service');

// Georgia national emergency number
const EMERGENCY_NUMBER = '112';
const MAX_EMERGENCY_CONTACTS = 5;

// ─── Emergency Contact CRUD ────────────────────────────────────────────────

/**
 * POST /api/safety/emergency-contacts
 * Add an emergency contact for the authenticated user (max 5).
 */
const addEmergencyContact = catchAsync(async (req, res, next) => {
    const userId = req.user._id || req.user.id;
    const { name, phone, relationship } = req.body;

    if (!name || !phone) {
        return next(new AppError('Name and phone are required', 400));
    }

    const existingCount = await EmergencyContact.countDocuments({ user: userId });
    if (existingCount >= MAX_EMERGENCY_CONTACTS) {
        return next(new AppError(`You can only have up to ${MAX_EMERGENCY_CONTACTS} emergency contacts`, 400));
    }

    const contact = await EmergencyContact.create({
        user: userId,
        name: name.trim(),
        phone: phone.trim(),
        relationship: relationship ? relationship.trim() : null
    });

    res.status(201).json({
        success: true,
        data: contact
    });
});

/**
 * GET /api/safety/emergency-contacts
 * List all emergency contacts for the authenticated user.
 */
const getEmergencyContacts = catchAsync(async (req, res) => {
    const userId = req.user._id || req.user.id;

    const contacts = await EmergencyContact.find({ user: userId }).sort({ createdAt: 1 }).lean();

    res.json({
        success: true,
        data: contacts
    });
});

/**
 * PATCH /api/safety/emergency-contacts/:id
 * Update a specific emergency contact (owner only).
 */
const updateEmergencyContact = catchAsync(async (req, res, next) => {
    const userId = req.user._id || req.user.id;
    const { id } = req.params;
    const { name, phone, relationship } = req.body;

    const contact = await EmergencyContact.findOne({ _id: id, user: userId });
    if (!contact) {
        return next(new AppError('Emergency contact not found', 404));
    }

    if (name !== undefined) contact.name = name.trim();
    if (phone !== undefined) contact.phone = phone.trim();
    if (relationship !== undefined) contact.relationship = relationship ? relationship.trim() : null;

    await contact.save();

    res.json({
        success: true,
        data: contact
    });
});

/**
 * DELETE /api/safety/emergency-contacts/:id
 * Delete a specific emergency contact (owner only).
 */
const deleteEmergencyContact = catchAsync(async (req, res, next) => {
    const userId = req.user._id || req.user.id;
    const { id } = req.params;

    const contact = await EmergencyContact.findOneAndDelete({ _id: id, user: userId });
    if (!contact) {
        return next(new AppError('Emergency contact not found', 404));
    }

    res.json({
        success: true,
        message: 'Emergency contact removed'
    });
});

// ─── SOS ──────────────────────────────────────────────────────────────────

/**
 * POST /api/safety/sos
 * Trigger an SOS alert. Creates a record, notifies emergency contacts via
 * push + SMS, and broadcasts a ride:sos event to the admin Socket.io room
 * when the user is currently in a ride.
 *
 * Body: { lat, lng, rideId? }
 */
const triggerSOS = catchAsync(async (req, res, next) => {
    const userId = req.user._id || req.user.id;
    const { lat, lng, rideId } = req.body;

    // Validate coordinates when provided
    if ((lat != null || lng != null) && (lat == null || lng == null)) {
        return next(new AppError('Both lat and lng are required when providing location', 400));
    }

    // Resolve active ride — prefer explicit rideId, otherwise find the current in-progress ride
    let activeRide = null;
    if (rideId) {
        activeRide = await Ride.findOne({ _id: rideId, user: userId }).lean();
    } else {
        activeRide = await Ride.findOne({
            user: userId,
            status: { $in: ['accepted', 'driver_arrived', 'in_progress'] }
        }).sort({ createdAt: -1 }).lean();
    }

    // Create the SOS record
    const alert = await SosAlert.create({
        user: userId,
        ride: activeRide ? activeRide._id : null,
        location: { lat: lat ?? null, lng: lng ?? null },
        status: 'active'
    });

    // Fetch emergency contacts
    const contacts = await EmergencyContact.find({ user: userId }).lean();

    // Build a Google Maps link for the SMS when coordinates are available
    const locationText = (lat != null && lng != null)
        ? `https://maps.google.com/?q=${lat},${lng}`
        : 'Location unavailable';

    const userName = req.user.fullName || req.user.firstName || 'Your contact';
    const smsBody = `EMERGENCY: ${userName} has triggered an SOS alert on Lulini. Their location: ${locationText}. Call ${EMERGENCY_NUMBER} if needed.`;

    // Notify emergency contacts — fire-and-forget; a failure here must not
    // block the SOS response returned to the user.
    const notifyContacts = async () => {
        for (const contact of contacts) {
            // SMS to every emergency contact
            try {
                await smsService.sendSMS(contact.phone, smsBody);
            } catch (err) {
                console.error(`SOS SMS failed for contact ${contact._id}:`, err.message);
            }

            // Push notification only if the contact is also a Lulini user
            try {
                const contactUser = await User.findOne({ phone: contact.phone }).lean();
                if (contactUser && contactUser.deviceTokens && contactUser.deviceTokens.length > 0) {
                    await pushService.sendToUser(
                        contactUser._id.toString(),
                        'sos_alert_title',
                        'sos_alert_body',
                        { type: 'sos', alertId: alert._id.toString(), lat: lat ?? null, lng: lng ?? null },
                        { userName }
                    );
                }
            } catch (err) {
                console.error(`SOS push notification failed for contact ${contact._id}:`, err.message);
            }
        }
    };

    // Emit ride:sos to admin socket room when there is an active ride
    const emitToAdmin = () => {
        try {
            const io = req.app.get('io');
            if (io && activeRide) {
                io.to('admin').emit('ride:sos', {
                    alertId: alert._id,
                    userId,
                    userName,
                    rideId: activeRide._id,
                    pickup: activeRide.pickup,
                    dropoff: activeRide.dropoff,
                    location: { lat, lng },
                    triggeredAt: alert.triggeredAt
                });
            }
        } catch (err) {
            console.error('SOS admin socket emit failed:', err.message);
        }
    };

    analytics.trackEvent(userId, analytics.EVENTS.SOS_TRIGGERED, {
        alertId: alert._id.toString(),
        rideId: rideId || null,
        hasLocation: lat != null && lng != null
    });

    // Run notifications and admin broadcast concurrently, without blocking the response
    emitToAdmin();
    notifyContacts().catch(err => console.error('SOS notify contacts error:', err.message));

    res.status(201).json({
        success: true,
        data: {
            alertId: alert._id,
            status: alert.status,
            emergencyNumber: EMERGENCY_NUMBER,
            contactsNotified: contacts.length
        }
    });
});

/**
 * PATCH /api/safety/sos/:id/resolve
 * Mark an SOS alert as resolved or false alarm.
 *
 * Body: { status: 'resolved' | 'false_alarm', notes? }
 */
const resolveSOSAlert = catchAsync(async (req, res, next) => {
    const resolvedById = req.user._id || req.user.id;
    const { id } = req.params;
    const { status, notes } = req.body;

    const VALID_RESOLUTION_STATUSES = ['resolved', 'false_alarm'];
    if (status && !VALID_RESOLUTION_STATUSES.includes(status)) {
        return next(new AppError(`Status must be one of: ${VALID_RESOLUTION_STATUSES.join(', ')}`, 400));
    }

    // Users can only resolve their own alerts; admins can resolve any alert
    const query = req.user.role === 'admin'
        ? { _id: id }
        : { _id: id, user: resolvedById };

    const alert = await SosAlert.findOne(query);
    if (!alert) {
        return next(new AppError('SOS alert not found', 404));
    }

    if (alert.status !== 'active') {
        return next(new AppError('This SOS alert is already resolved', 400));
    }

    alert.status = status || 'resolved';
    alert.resolvedAt = new Date();
    alert.resolvedBy = resolvedById;
    if (notes !== undefined) alert.notes = notes;

    await alert.save();

    res.json({
        success: true,
        data: alert
    });
});

// ─── Ride Sharing ─────────────────────────────────────────────────────────────

const ACTIVE_RIDE_STATUSES = ['pending', 'accepted', 'driver_arrived', 'in_progress'];

/**
 * POST /api/safety/rides/:rideId/share
 * Create a shareable link for an active ride. Idempotent — returns the same
 * token if a share document already exists for this ride.
 */
const shareRide = catchAsync(async (req, res, next) => {
    const userId = req.user._id || req.user.id;
    const { rideId } = req.params;

    // Verify the ride belongs to the user and is in an active status
    const ride = await Ride.findOne({
        _id: rideId,
        user: userId,
        status: { $in: ACTIVE_RIDE_STATUSES }
    }).lean();

    if (!ride) {
        return next(new AppError('Active ride not found', 404));
    }

    // Idempotent: return existing share token if one already exists
    const existing = await RideShare.findOne({ ride: rideId }).lean();
    if (existing) {
        return res.json({
            success: true,
            data: {
                shareToken: existing.shareToken,
                shareUrl: `https://lulini.ge/ride/shared/${existing.shareToken}`
            }
        });
    }

    // Set expiresAt 24 hours from now so the TTL index can auto-clean the document.
    // This is an upper bound; the document may become stale sooner if the ride
    // completes (in which case completeRide will shorten the expiry to endTime + 1 hour).
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const share = await RideShare.create({
        ride: rideId,
        sharedBy: userId,
        expiresAt
    });

    res.status(201).json({
        success: true,
        data: {
            shareToken: share.shareToken,
            shareUrl: `https://lulini.ge/ride/shared/${share.shareToken}`
        }
    });
});

/**
 * GET /api/safety/rides/shared/:token
 * Public endpoint — look up a ride by share token and return sanitised data.
 * Sensitive fields are redacted: coordinates rounded to 2 dp, phone numbers
 * omitted, driver first name only.
 * Returns 410 Gone when the ride completed more than 1 hour ago.
 */
const getRideShareStatus = catchAsync(async (req, res, next) => {
    const { token } = req.params;

    const share = await RideShare.findOne({ shareToken: token })
        .populate({
            path: 'ride',
            populate: [
                {
                    path: 'user',
                    select: 'firstName'
                },
                {
                    path: 'driver',
                    populate: {
                        path: 'user',
                        select: 'firstName profileImage'
                    }
                }
            ]
        })
        .lean();

    if (!share || !share.ride) {
        return next(new AppError('Shared ride not found', 404));
    }

    const ride = share.ride;

    // Return 410 Gone if the ride completed more than 1 hour ago
    if (ride.status === 'completed' && ride.endTime) {
        const hourAfterCompletion = new Date(ride.endTime).getTime() + 60 * 60 * 1000;
        if (Date.now() > hourAfterCompletion) {
            return res.status(410).json({
                success: false,
                message: 'This ride share link has expired'
            });
        }
    }

    // Round coordinates to 2 decimal places (~1.1 km precision) for privacy
    const roundCoord = (val) => (val != null ? Math.round(val * 100) / 100 : null);

    const sanitised = {
        status: ride.status,
        vehicleType: ride.vehicleType,
        pickup: ride.pickup ? {
            address: ride.pickup.address,
            lat: roundCoord(ride.pickup.lat),
            lng: roundCoord(ride.pickup.lng)
        } : null,
        dropoff: ride.dropoff ? {
            address: ride.dropoff.address,
            lat: roundCoord(ride.dropoff.lat),
            lng: roundCoord(ride.dropoff.lng)
        } : null,
        driver: ride.driver ? {
            firstName: ride.driver.user ? ride.driver.user.firstName : null,
            profileImage: ride.driver.user ? ride.driver.user.profileImage : null,
            vehicle: ride.driver.vehicle ? {
                make: ride.driver.vehicle.make,
                model: ride.driver.vehicle.model,
                color: ride.driver.vehicle.color,
                licensePlate: ride.driver.vehicle.licensePlate
            } : null,
            rating: ride.driver.rating || null
        } : null,
        createdAt: ride.createdAt,
        startTime: ride.startTime || null,
        endTime: ride.endTime || null
    };

    res.json({
        success: true,
        data: sanitised
    });
});

module.exports = {
    addEmergencyContact,
    getEmergencyContacts,
    updateEmergencyContact,
    deleteEmergencyContact,
    triggerSOS,
    resolveSOSAlert,
    shareRide,
    getRideShareStatus
};
