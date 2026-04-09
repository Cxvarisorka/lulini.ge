const mongoose = require('mongoose');
const Ride = require('../models/ride.model');
const Driver = require('../models/driver.model');
const User = require('../models/user.model');
const Settings = require('../models/settings.model');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const pushService = require('../services/pushNotification.service');
const { haversineKm } = require('../utils/distance');
const RideOffer = require('../models/rideOffer.model');
const { pushIfOffline, emitCritical } = require('../utils/socketHelpers');
const { isUserOnlineAsync } = require('../socket/presence');
const analytics = require('../services/analytics.service');
const { maskPhone } = require('../utils/phoneMask');
const RideShare = require('../models/rideShare.model');
const emailService = require('../services/email.service');
const { publishRideEvent } = require('../queues/rideEvents');
const { isEnabled } = require('../utils/featureFlags');
const { findDriversByETA } = require('../services/etaDispatch.service');
const { snapRidePickup } = require('../services/roadSnap.service');
const { recordRecentLocation } = require('../services/recentLocations.service');
const logger = require('../utils/logger');
const { createOffer, sendOfferToDriver, OFFER_TIMEOUT_MS, getEligibleDriverTypes } = require('../services/driverDispatch.service');

// ── Redis pub/sub for ETA dispatch (replaces DB polling) ──
// When a ride is accepted or cancelled, we publish to a Redis channel so the
// dispatch loop is notified instantly instead of polling the DB every 2 seconds.
const RIDE_DISPATCH_CHANNEL = 'ride:dispatch:response';

/**
 * Notify the ETA dispatch loop that a ride's status changed.
 * Called from acceptRide and cancelRide.
 */
async function notifyRideResponse(rideId, action) {
    try {
        const redis = process.env.REDIS_URL ? await getRedis() : null;
        if (redis) {
            await redis.publish(RIDE_DISPATCH_CHANNEL, JSON.stringify({ rideId, action }));
        }
    } catch { /* best-effort */ }
}

/**
 * Wait for a ride response (accepted/cancelled) via Redis pub/sub with timeout fallback.
 * Falls back to a single DB check on timeout if Redis is unavailable.
 */
async function waitForRideResponse(rideId, timeoutMs) {
    let redis;
    try {
        redis = process.env.REDIS_URL ? await getRedis() : null;
    } catch { redis = null; }

    if (redis) {
        // Use Redis pub/sub — zero DB queries during the wait
        const subClient = redis.duplicate();
        try {
            await subClient.connect();
        } catch {
            // If subscribe fails, fall back to timeout-only approach
            return new Promise(resolve => setTimeout(() => resolve('timeout'), timeoutMs));
        }

        return new Promise((resolve) => {
            let settled = false;
            const cleanup = () => {
                if (!settled) {
                    settled = true;
                    subClient.unsubscribe(RIDE_DISPATCH_CHANNEL).catch(() => {});
                    subClient.disconnect().catch(() => {});
                }
            };

            const timeout = setTimeout(() => {
                cleanup();
                resolve('timeout');
            }, timeoutMs);

            subClient.subscribe(RIDE_DISPATCH_CHANNEL, (message) => {
                try {
                    const data = JSON.parse(message);
                    if (data.rideId === rideId) {
                        clearTimeout(timeout);
                        cleanup();
                        resolve(data.action); // 'accepted' or 'cancelled'
                    }
                } catch { /* ignore malformed messages */ }
            }).catch(() => {
                clearTimeout(timeout);
                cleanup();
                // Fallback: just wait the full timeout
                setTimeout(() => resolve('timeout'), timeoutMs);
            });
        });
    }

    // No Redis: fall back to simple timeout + single DB check
    return new Promise((resolve) => {
        setTimeout(async () => {
            try {
                const check = await Ride.findById(rideId).select('status driver').lean();
                if (!check || check.status === 'cancelled') resolve('cancelled');
                else if (check.driver) resolve('accepted');
                else resolve('timeout');
            } catch { resolve('timeout'); }
        }, timeoutMs);
    });
}

// Proximity threshold: driver must be within this distance to confirm arrival/completion
const ARRIVAL_PROXIMITY_KM = 0.5; // 500 meters

// Inverse: which ride types can a driver of a given type accept?
function getEligibleRideTypes(driverVehicleType) {
    switch (driverVehicleType) {
        case 'business': return ['economy', 'comfort', 'business'];
        case 'comfort': return ['economy', 'comfort'];
        case 'economy': return ['economy'];
        default: return [driverVehicleType];
    }
}

// ── Idempotency store ──
// Uses Redis when available (shared across instances), falls back to in-memory Map.
// Prevents duplicate ride creation when the client retries on flaky networks.
const idempotencyStore = new Map();
const IDEMPOTENCY_TTL = 5 * 60 * 1000;

let _redisClient = null;
async function getRedis() {
    if (_redisClient) return _redisClient;
    try {
        const { getRedisClient } = require('../configs/redis.config');
        _redisClient = await getRedisClient();
        return _redisClient;
    } catch {
        return null; // Redis not available, use in-memory fallback
    }
}

async function getIdempotentResponse(key) {
    try {
        const redis = process.env.REDIS_URL ? await getRedis() : null;
        if (redis) {
            const data = await redis.get(`idem:${key}`);
            return data ? JSON.parse(data) : null;
        }
    } catch { /* fall through to in-memory */ }
    const cached = idempotencyStore.get(key);
    if (cached && Date.now() - cached.timestamp < IDEMPOTENCY_TTL) return cached;
    idempotencyStore.delete(key);
    return null;
}

async function setIdempotentResponse(key, statusCode, body) {
    try {
        const redis = process.env.REDIS_URL ? await getRedis() : null;
        if (redis) {
            await redis.set(`idem:${key}`, JSON.stringify({ statusCode, body }), { EX: 300 });
            return;
        }
    } catch { /* fall through to in-memory */ }
    idempotencyStore.set(key, { statusCode, body, timestamp: Date.now() });
}

// In-memory cleanup (only needed when Redis is not available)
const _idempotencyCleanupInterval = setInterval(() => {
    if (process.env.REDIS_URL) return; // Redis handles TTL automatically
    const now = Date.now();
    for (const [key, entry] of idempotencyStore) {
        if (now - entry.timestamp > IDEMPOTENCY_TTL) {
            idempotencyStore.delete(key);
        }
    }
}, 60 * 1000);
_idempotencyCleanupInterval.unref(); // Don't keep process alive for cleanup

// @desc    Create a new ride request
// @route   POST /api/rides
// @access  Private
const createRide = catchAsync(async (req, res, next) => {
    // ── Idempotency: return cached response for duplicate requests ──
    const idempotencyKey = req.headers['x-idempotency-key'];
    if (idempotencyKey) {
        const cached = await getIdempotentResponse(idempotencyKey);
        if (cached) {
            return res.status(cached.statusCode).json(cached.body);
        }
    }

    const {
        pickup,
        dropoff,
        stops,
        vehicleType,
        quote,
        passengerName,
        passengerPhone,
        notes,
        scheduledFor
    } = req.body;

    // Validate required fields
    if (!pickup || !dropoff || !vehicleType || !passengerName) {
        return next(new AppError('All required fields must be provided', 400));
    }

    // ── Server-side quote validation ──
    // Prevent fare manipulation: recalculate distance and validate price range
    const pricingConfig = await Settings.getPricing();

    if (quote && quote.totalPrice != null) {
        const price = parseFloat(quote.totalPrice);
        if (isNaN(price) || price < 0) {
            return next(new AppError('Invalid quote price', 400));
        }

        // Validate distance if provided — Haversine sanity check
        if (pickup.lat && pickup.lng && dropoff.lat && dropoff.lng) {
            const R = 6371;
            const dLat = ((dropoff.lat - pickup.lat) * Math.PI) / 180;
            const dLon = ((dropoff.lng - pickup.lng) * Math.PI) / 180;
            const a = Math.sin(dLat / 2) ** 2 +
                Math.cos((pickup.lat * Math.PI) / 180) * Math.cos((dropoff.lat * Math.PI) / 180) *
                Math.sin(dLon / 2) ** 2;
            const straightLineDist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            // Road distance is typically 1.2-1.8x straight-line; use 2.5x as generous upper bound
            const maxRoadDist = straightLineDist * 2.5;

            // Use per-category pricing config for validation bounds
            const catPricing = pricingConfig.categories?.[vehicleType] || pricingConfig.categories?.economy;
            const catBase = catPricing?.basePrice ?? 5;
            const catKm = catPricing?.kmPrice ?? 1.5;
            const minFare = Math.max(catBase * 0.5, 1);
            const maxFare = catBase + (maxRoadDist * catKm * 4);

            if (price < minFare) {
                return next(new AppError('Quote price is below minimum fare', 400));
            }
            if (price > maxFare && price > 100) {
                return next(new AppError('Quote price is unreasonably high for this distance', 400));
            }
        }
    }

    // ── Duplicate ride guard: one active ride per user ──
    const existingActiveRide = await Ride.findOne({
        user: req.user.id,
        status: { $in: ['pending', 'accepted', 'driver_arrived', 'in_progress'] },
    });
    if (existingActiveRide) {
        return next(new AppError('You already have an active ride', 409));
    }

    // Set ride expiration time (1 hour from now)
    const RIDE_EXPIRATION_MINUTES = 60;
    const expiresAt = new Date(Date.now() + RIDE_EXPIRATION_MINUTES * 60 * 1000);

    // Validate stops (max 2)
    const validStops = Array.isArray(stops)
        ? stops.filter(s => s && s.lat && s.lng && s.address).slice(0, 2)
        : [];

    // Validate scheduledFor if provided (must be in the future, max 7 days ahead)
    let scheduledForDate = null;
    let isScheduledRide = false;
    if (scheduledFor) {
        scheduledForDate = new Date(scheduledFor);
        if (isNaN(scheduledForDate.getTime())) {
            return next(new AppError('scheduledFor must be a valid date', 400));
        }
        if (scheduledForDate <= new Date()) {
            return next(new AppError('scheduledFor must be a future date and time', 400));
        }
        const maxSchedule = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        if (scheduledForDate > maxSchedule) {
            return next(new AppError('Rides can only be scheduled up to 7 days in advance', 400));
        }
        isScheduledRide = true;
    }

    // Create the ride
    // The unique_active_ride_per_user partial index prevents duplicate active rides
    // at the database level (catches race conditions the app-level check misses).
    let ride;
    try {
        ride = await Ride.create({
            user: req.user.id,
            pickup,
            dropoff,
            stops: validStops,
            vehicleType,
            quote,
            passengerName,
            passengerPhone,
            paymentMethod: 'cash',
            notes,
            status: 'pending',
            expiresAt,
            scheduledFor: scheduledForDate,
            isScheduled: isScheduledRide
        });
    } catch (err) {
        if (err.code === 11000 && err.message?.includes('unique_active_ride_per_user')) {
            return next(new AppError('You already have an active ride', 409));
        }
        throw err;
    }

    // Populate user in-place (avoids re-fetching the ride from DB)
    await ride.populate('user', 'firstName lastName email phone');

    // ── Phase 4: Snap pickup to nearest road (async, non-blocking) ──
    if (isEnabled('PICKUP_ROAD_SNAP')) {
        snapRidePickup(ride._id).catch(err =>
            logger.error('Pickup snap error: ' + err.message, 'ride')
        );
    }

    // ── Phase 5: Record dropoff as recent location for user ──
    recordRecentLocation(req.user.id, dropoff).catch(() => {});

    // Build enriched ride data with commission info for driver display
    const rideData = ride.toObject();
    const commissionPercent = pricingConfig.commissionPercent || 15;
    const totalPrice = rideData.quote?.totalPrice || 0;
    const commissionAmount = Math.round(totalPrice * (commissionPercent / 100) * 100) / 100;
    rideData.commissionPercent = commissionPercent;
    rideData.commissionAmount = commissionAmount;
    rideData.driverEarnings = Math.round((totalPrice - commissionAmount) * 100) / 100;

    // Scheduled rides are NOT broadcast to drivers immediately —
    // the scheduler will broadcast them when scheduledFor is within 10 minutes.
    const io = req.app.get('io');
    if (io && !isScheduledRide) {
        // ── Phase 8: ETA-first dispatch (feature-flagged) ──
        if (isEnabled('ETA_DISPATCH')) {
            // ETA dispatch runs in the background after responding to the user.
            // It finds drivers by real ETA, offers sequentially, and uses Redis pub/sub
            // to detect acceptance/cancellation instead of DB polling.
            setImmediate(async () => {
                // Track drivers who were already offered this ride (by user ID)
                // so we can exclude them from the fallback broadcast
                const offeredDriverUserIds = [];

                try {
                    const ranked = await findDriversByETA(pickup, vehicleType, [], 5);
                    let dispatched = false;
                    let cancelled = false;

                    for (const candidate of ranked) {
                        // Check if ride was cancelled before offering to next driver
                        const rideCheck = await Ride.findById(ride._id).select('status').lean();
                        if (!rideCheck || rideCheck.status === 'cancelled') {
                            cancelled = true;
                            break;
                        }

                        await createOffer(ride._id, candidate.driverId);
                        const driver = await Driver.findById(candidate.driverId).select('user').lean();
                        if (!driver) continue;

                        // Track this driver's user ID for broadcast exclusion
                        offeredDriverUserIds.push(driver.user.toString());

                        const enrichedData = {
                            ...rideData,
                            etaSeconds: candidate.etaSeconds,
                            etaSource: candidate.etaSource,
                            offerTimeoutMs: OFFER_TIMEOUT_MS,
                        };

                        await sendOfferToDriver(io, driver, enrichedData);

                        // Wait for response using Redis pub/sub (no DB polling)
                        const result = await waitForRideResponse(ride._id.toString(), OFFER_TIMEOUT_MS);

                        if (result === 'accepted') { dispatched = true; break; }
                        if (result === 'cancelled') { cancelled = true; break; }

                        // Mark offer as timed out
                        await RideOffer.updateOne(
                            { ride: ride._id, driver: candidate.driverId, status: 'pending' },
                            { status: 'timeout', respondedAt: new Date() }
                        );
                    }

                    // Fallback: if no driver accepted and ride not cancelled, broadcast
                    // to remaining eligible drivers (excluding those already offered)
                    if (!dispatched && !cancelled) {
                        const eligibleTypes = getEligibleDriverTypes(vehicleType);
                        let broadcast = io.to('admin');
                        for (const type of eligibleTypes) {
                            broadcast = broadcast.to(`drivers:${type}`);
                        }
                        // Exclude drivers who already saw and timed out on this ride
                        for (const userId of offeredDriverUserIds) {
                            broadcast = broadcast.except(`driver:${userId}`);
                        }
                        broadcast.emit('ride:request', rideData);
                    }
                } catch (err) {
                    logger.error('ETA dispatch failed, falling back to broadcast: ' + err.message, 'dispatch');
                    // Fallback: broadcast to all drivers
                    const eligibleTypes = getEligibleDriverTypes(vehicleType);
                    let broadcast = io.to('admin');
                    for (const type of eligibleTypes) {
                        broadcast = broadcast.to(`drivers:${type}`);
                    }
                    broadcast.emit('ride:request', rideData);
                }
            });
        } else {
            // ── Existing broadcast behavior (default) ──
            const eligibleTypes = getEligibleDriverTypes(vehicleType);
            let broadcast = io.to('admin');
            for (const type of eligibleTypes) {
                broadcast = broadcast.to(`drivers:${type}`);
            }
            broadcast.emit('ride:request', rideData);
        }
    }

    const responseBody = {
        success: true,
        message: isScheduledRide ? 'Ride scheduled successfully' : 'Ride requested successfully',
        data: { ride }
    };

    // Cache response for idempotency replay (Redis or in-memory)
    if (idempotencyKey) {
        setIdempotentResponse(idempotencyKey, 201, responseBody)
            .catch(err => logger.error('Idempotency cache error: ' + err.message, 'ride'));
    }

    // Return response immediately — don't wait for push notifications or ETA dispatch
    res.status(201).json(responseBody);

    // Analytics
    analytics.trackEvent(req.user.id, isScheduledRide ? analytics.EVENTS.RIDE_SCHEDULED : analytics.EVENTS.RIDE_REQUESTED, {
        rideId: ride._id.toString(),
        vehicleType,
        fare: ride.quote?.totalPrice,
        scheduledFor: scheduledForDate ? scheduledForDate.toISOString() : null
    });

    // Fire-and-forget: push notifications — skip for scheduled rides (drivers notified later)
    // Use BullMQ queue if available (guarantees delivery with retries), otherwise inline fallback.
    if (!isScheduledRide) {
        let queued = null;
        try {
            queued = await publishRideEvent('ride:request', {
                rideId: ride._id.toString(),
                vehicleType,
                pickupAddress: pickup?.address || '',
            }, {
                broadcastDrivers: true,
                pushTitleKey: 'ride_request_title',
                pushBodyKey: 'ride_request_body',
            });
        } catch { /* queue unavailable, use inline fallback */ }

        // Fallback: inline push if queue not available
        if (!queued) {
            setImmediate(async () => {
                try {
                    const onlineDrivers = await Driver.find({
                        status: 'online',
                        isActive: true,
                        isApproved: true,
                        'vehicle.type': { $in: getEligibleDriverTypes(vehicleType) }
                    }).select('user').lean();

                    const driverUserIds = onlineDrivers.map(d => d.user.toString());
                    if (driverUserIds.length > 0) {
                        await pushService.sendToUsers(
                            driverUserIds,
                            'ride_request_title',
                            'ride_request_body',
                            { rideId: ride._id.toString(), channelId: 'ride-requests' },
                            { address: pickup?.address || '' }
                        );
                    }
                } catch (err) {
                    logger.error('Push error (createRide):', err.message);
                }
            });
        }
    }
});

// @desc    Create a ride request on behalf of a caller (admin/dispatcher)
// @route   POST /api/rides/admin
// @access  Private/Admin
const adminCreateRide = catchAsync(async (req, res, next) => {
    const {
        pickup,
        dropoff,
        stops,
        vehicleType,
        passengerName,
        passengerPhone,
        notes,
        price,
        routeInfo
    } = req.body;

    if (!pickup || !dropoff || !vehicleType || !passengerName) {
        return next(new AppError('Pickup, dropoff, vehicle type, and passenger name are required', 400));
    }

    if (!price || price <= 0) {
        return next(new AppError('Price is required', 400));
    }

    // Use real route info from Google Directions API if provided, otherwise estimate
    let distance, distanceText, duration, durationText;
    if (routeInfo && routeInfo.distance) {
        distance = Math.round(routeInfo.distance * 1000); // km to meters
        distanceText = routeInfo.distanceText;
        duration = routeInfo.duration * 60; // minutes to seconds
        durationText = routeInfo.durationText;
    } else {
        const R = 6371;
        const dLat = ((dropoff.lat - pickup.lat) * Math.PI) / 180;
        const dLon = ((dropoff.lng - pickup.lng) * Math.PI) / 180;
        const a = Math.sin(dLat / 2) ** 2 +
            Math.cos((pickup.lat * Math.PI) / 180) * Math.cos((dropoff.lat * Math.PI) / 180) *
            Math.sin(dLon / 2) ** 2;
        const straightLineDist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        distance = Math.round(straightLineDist * 1.4 * 1000);
        distanceText = `${(distance / 1000).toFixed(1)} km`;
        duration = Math.round(distance / 500 * 60);
        durationText = `${Math.round(distance / 500)} min`;
    }

    const quote = {
        distance,
        distanceText,
        duration,
        durationText,
        basePrice: price,
        totalPrice: price
    };

    const validStops = Array.isArray(stops)
        ? stops.filter(s => s && s.lat && s.lng && s.address).slice(0, 2)
        : [];

    const RIDE_EXPIRATION_MINUTES = 60;
    const expiresAt = new Date(Date.now() + RIDE_EXPIRATION_MINUTES * 60 * 1000);

    const ride = await Ride.create({
        user: req.user.id,
        pickup,
        dropoff,
        stops: validStops,
        vehicleType,
        quote,
        passengerName,
        passengerPhone: passengerPhone || '',
        paymentMethod: 'cash',
        notes: notes || null,
        status: 'pending',
        expiresAt,
        createdByAdmin: true
    });

    await ride.populate('user', 'firstName lastName email phone');

    // Broadcast to eligible driver rooms
    const io = req.app.get('io');
    if (io) {
        const eligibleTypes = getEligibleDriverTypes(vehicleType);
        let broadcast = io.to('admin');
        for (const type of eligibleTypes) {
            broadcast = broadcast.to(`drivers:${type}`);
        }
        // Attach commission info so drivers see their earnings breakdown
        const rideData = ride.toObject();
        const pricingConfig = await Settings.getPricing();
        const commissionPercent = pricingConfig.commissionPercent || 15;
        const totalPrice = rideData.quote?.totalPrice || 0;
        const commissionAmount = Math.round(totalPrice * (commissionPercent / 100) * 100) / 100;
        rideData.commissionPercent = commissionPercent;
        rideData.commissionAmount = commissionAmount;
        rideData.driverEarnings = Math.round((totalPrice - commissionAmount) * 100) / 100;
        broadcast.emit('ride:request', rideData);
    }

    res.status(201).json({
        success: true,
        message: 'Ride created by admin',
        data: { ride }
    });

    // Fire-and-forget push notifications
    setImmediate(async () => {
        try {
            const onlineDrivers = await Driver.find({
                status: 'online',
                isActive: true,
                isApproved: true,
                'vehicle.type': { $in: getEligibleDriverTypes(vehicleType) }
            }).select('user').lean();

            const driverUserIds = onlineDrivers.map(d => d.user.toString());
            if (driverUserIds.length > 0) {
                await pushService.sendToUsers(
                    driverUserIds,
                    'ride_request_title',
                    'ride_request_body',
                    { rideId: ride._id.toString(), channelId: 'ride-requests' },
                    { address: pickup?.address || '' }
                );
            }
        } catch (err) {
            logger.error('Push error (adminCreateRide):', err.message);
        }
    });
});

// @desc    Accept a ride request (driver)
// @route   PATCH /api/rides/:id/accept
// @access  Private/Driver
const acceptRide = catchAsync(async (req, res, next) => {
    // Get driver profile
    const driver = await Driver.findOne({ user: req.user.id });
    if (!driver) {
        return next(new AppError('Driver profile not found', 404));
    }

    // Check if driver is online
    if (driver.status !== 'online') {
        return next(new AppError('Driver must be online to accept rides', 400));
    }

    // Guard: prevent double-assignment — driver must not have another active ride
    const existingDriverRide = await Ride.findOne({
        driver: driver._id,
        status: { $in: ['accepted', 'driver_arrived', 'in_progress'] }
    }).select('_id').lean();
    if (existingDriverRide) {
        return next(new AppError('You already have an active ride', 409));
    }

    // Transaction: atomically assign ride + set driver busy
    // Prevents inconsistent state if either operation fails
    const session = await mongoose.startSession();
    let ride;
    try {
        session.startTransaction();

        // Atomic update: only transitions pending → accepted AND assigns this driver
        // This is the most race-critical transition (multiple drivers competing)
        // acceptedExpiresAt: auto-cancel if driver doesn't arrive within 10 minutes
        const ACCEPTED_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
        ride = await Ride.findOneAndUpdate(
            {
                _id: req.params.id,
                status: 'pending',
                $or: [
                    { expiresAt: { $gt: new Date() } },
                    { expiresAt: null },
                ],
            },
            {
                $set: {
                    status: 'accepted',
                    driver: driver._id,
                    acceptedExpiresAt: new Date(Date.now() + ACCEPTED_TIMEOUT_MS),
                },
            },
            { new: true, session }
        );

        if (!ride) {
            await session.abortTransaction();
            const existingRide = await Ride.findById(req.params.id);
            if (!existingRide) return next(new AppError('Ride not found', 404));
            if (existingRide.expiresAt && new Date() > existingRide.expiresAt) {
                return next(new AppError('This ride request has expired', 400));
            }
            return next(new AppError('This ride is no longer available', 400));
        }

        // Update driver status to busy within the same transaction
        await Driver.updateOne(
            { _id: driver._id, status: 'online' },
            { $set: { status: 'busy' } },
            { session }
        );

        await session.commitTransaction();
    } catch (err) {
        await session.abortTransaction();
        throw err;
    } finally {
        session.endSession();
    }

    // Notify ETA dispatch loop that this ride was accepted (Redis pub/sub)
    notifyRideResponse(ride._id.toString(), 'accepted').catch(() => {});

    const populatedRide = await Ride.findById(ride._id)
        .populate('user', 'firstName lastName email phone')
        .populate({
            path: 'driver',
            populate: {
                path: 'user',
                select: 'firstName lastName fullName phone profileImage'
            }
        });

    // Emit socket events (critical — delivery guarantee via emitCritical)
    const io = req.app.get('io');
    if (io) {
        const driverName = populatedRide.driver?.user
            ? `${populatedRide.driver.user.firstName || ''} ${populatedRide.driver.user.lastName || ''}`.trim()
            : '';

        // Notify user + admin with push fallback for passenger.
        // Passenger receives the full ride object (their own phone is not masked).
        emitCritical(
            io,
            `user:${ride.user}`,
            'ride:accepted',
            populatedRide,
            !ride.createdByAdmin ? {
                userId: ride.user.toString(),
                titleKey: 'ride_accepted_title',
                bodyKey: 'ride_accepted_body',
                data: { rideId: ride._id.toString() },
                params: { driverName }
            } : undefined
        );
        // Exclude the ride user's room to prevent double-delivery if user is also admin
        io.to('admin').except(`user:${ride.user}`).emit('ride:accepted', populatedRide);

        // Send a copy to the accepting driver with passenger phone masked
        const rideForDriver = populatedRide.toObject();
        if (rideForDriver.user) {
            rideForDriver.user.phone = maskPhone(rideForDriver.user.phone);
        }
        io.to(`driver:${req.user.id}`).emit('ride:accepted', rideForDriver);

        // Broadcast ride:unavailable to ALL other connected drivers
        io.to('drivers:all').except(`driver:${req.user.id}`).emit('ride:unavailable', { rideId: ride._id });
    }

    // Return a masked copy of the ride to the driver making the HTTP request
    const rideResponseForDriver = populatedRide.toObject();
    if (rideResponseForDriver.user) {
        rideResponseForDriver.user.phone = maskPhone(rideResponseForDriver.user.phone);
    }

    res.json({
        success: true,
        message: 'Ride accepted successfully',
        data: { ride: rideResponseForDriver }
    });
});

// @desc    Decline a ride offer (driver)
// @route   PATCH /api/rides/:id/decline
// @access  Private/Driver
const declineRide = catchAsync(async (req, res, next) => {
    const driver = await Driver.findOne({ user: req.user.id }).select('_id').lean();
    if (!driver) {
        return next(new AppError('Driver profile not found', 404));
    }

    // Atomically mark only a pending offer as declined
    const offer = await RideOffer.findOneAndUpdate(
        { ride: req.params.id, driver: driver._id, status: 'pending' },
        { status: 'declined', respondedAt: new Date() },
        { new: true }
    );

    if (!offer) {
        return next(new AppError('No pending offer found for this ride', 400));
    }

    // Calculate response time from when the offer was sent
    offer.responseTimeMs = offer.respondedAt - offer.offeredAt;
    await offer.save();

    res.json({
        success: true,
        message: 'Ride declined'
    });
});

// @desc    Notify customer of driver arrival
// @route   PATCH /api/rides/:id/arrive
// @access  Private/Driver
const notifyArrival = catchAsync(async (req, res, next) => {
    // Get driver profile
    const driver = await Driver.findOne({ user: req.user.id });
    if (!driver) {
        return next(new AppError('Driver profile not found', 404));
    }

    // Proximity check: driver must be near pickup location
    const rideForCheck = await Ride.findOne({ _id: req.params.id, driver: driver._id }).select('pickup').lean();
    if (rideForCheck && rideForCheck.pickup && driver.location && driver.location.coordinates) {
        const [driverLng, driverLat] = driver.location.coordinates;
        const distKm = haversineKm(driverLat, driverLng, rideForCheck.pickup.lat, rideForCheck.pickup.lng);
        if (distKm > ARRIVAL_PROXIMITY_KM) {
            const distMeters = Math.round(distKm * 1000);
            return next(new AppError(
                `You are ${distMeters}m from the pickup location. Please get closer (within ${ARRIVAL_PROXIMITY_KM * 1000}m) before confirming arrival.`,
                400
            ));
        }
    }

    // Atomic update: only transitions accepted → driver_arrived for the assigned driver
    // Prevents race conditions from duplicate taps / retries
    const TOTAL_WAITING_MINUTES = 3;
    const now = new Date();

    const ride = await Ride.findOneAndUpdate(
        {
            _id: req.params.id,
            status: 'accepted',
            driver: driver._id,
        },
        {
            $set: {
                status: 'driver_arrived',
                arrivalTime: now,
                waitingExpiresAt: new Date(now.getTime() + TOTAL_WAITING_MINUTES * 60 * 1000),
                acceptedExpiresAt: null, // Clear — waiting timeout takes over
            },
        },
        { new: true }
    );

    if (!ride) {
        // Either ride not found, wrong status, or wrong driver
        const existingRide = await Ride.findById(req.params.id);
        if (!existingRide) return next(new AppError('Ride not found', 404));
        if (!existingRide.driver || existingRide.driver.toString() !== driver._id.toString()) {
            return next(new AppError('You are not assigned to this ride', 403));
        }
        return next(new AppError('Ride must be in accepted status to notify arrival', 400));
    }

    const populatedRide = await Ride.findById(ride._id)
        .populate('user', 'firstName lastName email phone')
        .populate({
            path: 'driver',
            populate: {
                path: 'user',
                select: 'firstName lastName fullName phone profileImage'
            }
        });

    // Emit socket event to user + admin with push fallback (critical event)
    const io = req.app.get('io');
    if (io) {
        emitCritical(
            io,
            `user:${ride.user}`,
            'ride:arrived',
            populatedRide,
            !ride.createdByAdmin ? {
                userId: ride.user.toString(),
                titleKey: 'ride_arrived_title',
                bodyKey: 'ride_arrived_body',
                data: { rideId: ride._id.toString() }
            } : undefined
        );
        io.to('admin').except(`user:${ride.user}`).emit('ride:arrived', populatedRide);
    }

    res.json({
        success: true,
        message: 'Customer notified of arrival',
        data: { ride: populatedRide }
    });
});

// @desc    Start a ride (driver) — idempotent
// @route   PATCH /api/rides/:id/start
// @access  Private/Driver
const startRide = catchAsync(async (req, res, next) => {
    const { idempotencyKey } = req.body;

    // Idempotency check — return cached response for duplicate start requests
    if (idempotencyKey) {
        const cached = await getIdempotentResponse(`start:${idempotencyKey}`);
        if (cached) {
            return res.status(cached.statusCode).json(cached.body);
        }
    }

    // Get driver profile
    const driver = await Driver.findOne({ user: req.user.id });
    if (!driver) {
        return next(new AppError('Driver profile not found', 404));
    }

    // First read the ride to calculate waiting fee (needs arrivalTime)
    const existingRide = await Ride.findOne({
        _id: req.params.id,
        status: { $in: ['accepted', 'driver_arrived', 'in_progress'] },
        driver: driver._id,
    });

    if (!existingRide) {
        const anyRide = await Ride.findById(req.params.id);
        if (!anyRide) return next(new AppError('Ride not found', 404));
        if (!anyRide.driver || anyRide.driver.toString() !== driver._id.toString()) {
            return next(new AppError('You are not assigned to this ride', 403));
        }
        if (anyRide.status === 'cancelled') {
            return next(new AppError('This ride was cancelled due to waiting timeout', 410));
        }
        return next(new AppError('Ride must be in accepted or driver_arrived status to start', 400));
    }

    // Idempotent: if ride is already in_progress, return success (409 for client to detect)
    if (existingRide.status === 'in_progress') {
        const populatedRide = await Ride.findById(existingRide._id)
            .populate('user', 'firstName lastName email phone')
            .populate({
                path: 'driver',
                populate: { path: 'user', select: 'firstName lastName fullName phone profileImage' }
            });
        const body = { success: true, message: 'Ride already in progress', data: { ride: populatedRide } };
        if (idempotencyKey) {
            setIdempotentResponse(`start:${idempotencyKey}`, 200, body)
                .catch(err => logger.error('Idempotency cache error: ' + err.message, 'ride'));
        }
        return res.status(200).json(body);
    }

    // Calculate waiting fee if driver had arrived and waited
    const FREE_WAITING_MINUTES = 1;
    const WAITING_FEE_PER_MINUTE = 0.50;
    let waitingFee = 0;

    if (existingRide.arrivalTime) {
        const now = new Date();
        const waitingMinutes = (now.getTime() - existingRide.arrivalTime.getTime()) / (60 * 1000);
        if (waitingMinutes > FREE_WAITING_MINUTES) {
            const paidMinutes = Math.min(waitingMinutes - FREE_WAITING_MINUTES, 2);
            waitingFee = Math.round(paidMinutes * WAITING_FEE_PER_MINUTE * 100) / 100;
        }
    }

    // Atomic update: only transitions accepted/driver_arrived → in_progress
    const ride = await Ride.findOneAndUpdate(
        {
            _id: req.params.id,
            status: { $in: ['accepted', 'driver_arrived'] },
            driver: driver._id,
        },
        {
            $set: {
                status: 'in_progress',
                startTime: new Date(),
                waitingFee,
                waitingExpiresAt: null,
            },
        },
        { new: true }
    );

    if (!ride) {
        return next(new AppError('Ride transition failed — status may have changed', 409));
    }

    const populatedRide = await Ride.findById(ride._id)
        .populate('user', 'firstName lastName email phone')
        .populate({
            path: 'driver',
            populate: {
                path: 'user',
                select: 'firstName lastName fullName phone profileImage'
            }
        });

    // Emit socket event to user + admin with push fallback (critical event)
    const io = req.app.get('io');
    if (io) {
        emitCritical(
            io,
            `user:${ride.user}`,
            'ride:started',
            populatedRide,
            !ride.createdByAdmin ? {
                userId: ride.user.toString(),
                titleKey: 'ride_started_title',
                bodyKey: 'ride_started_body',
                data: { rideId: ride._id.toString() }
            } : undefined
        );
        io.to('admin').except(`user:${ride.user}`).emit('ride:started', populatedRide);
    }

    const responseBody = {
        success: true,
        message: 'Ride started successfully',
        data: { ride: populatedRide }
    };

    // Cache response for idempotency replay
    if (idempotencyKey) {
        setIdempotentResponse(`start:${idempotencyKey}`, 200, responseBody)
            .catch(err => logger.error('Idempotency cache error: ' + err.message, 'ride'));
    }

    res.json(responseBody);
});

// @desc    Complete a ride (driver)
// @route   PATCH /api/rides/:id/complete
// @access  Private/Driver
const completeRide = catchAsync(async (req, res, next) => {
    const { fare } = req.body;

    // Get driver profile
    const driver = await Driver.findOne({ user: req.user.id });
    if (!driver) {
        return next(new AppError('Driver profile not found', 404));
    }

    // Proximity check: driver must be near dropoff location
    const rideForCheck = await Ride.findOne({ _id: req.params.id, driver: driver._id }).select('dropoff').lean();
    if (rideForCheck && rideForCheck.dropoff && driver.location && driver.location.coordinates) {
        const [driverLng, driverLat] = driver.location.coordinates;
        const distKm = haversineKm(driverLat, driverLng, rideForCheck.dropoff.lat, rideForCheck.dropoff.lng);
        if (distKm > ARRIVAL_PROXIMITY_KM) {
            const distMeters = Math.round(distKm * 1000);
            return next(new AppError(
                `You are ${distMeters}m from the dropoff location. Please get closer (within ${ARRIVAL_PROXIMITY_KM * 1000}m) before completing the ride.`,
                400
            ));
        }
    }

    // Pre-read the ride for fare validation (needs quote data before atomic update)
    const existingRide = await Ride.findOne({
        _id: req.params.id,
        status: 'in_progress',
        driver: driver._id,
    });

    if (!existingRide) {
        const anyRide = await Ride.findById(req.params.id);
        if (!anyRide) return next(new AppError('Ride not found', 404));
        if (!anyRide.driver || anyRide.driver.toString() !== driver._id.toString()) {
            return next(new AppError('You are not assigned to this ride', 403));
        }
        return next(new AppError('Ride must be in progress to complete', 400));
    }

    // Fare validation: driver-submitted fare must be within 15% of server quote
    if (fare !== undefined && fare !== null && existingRide.quote && existingRide.quote.totalPrice > 0) {
        const quotedPrice = existingRide.quote.totalPrice;
        const maxAllowed = quotedPrice * 1.15;
        const minAllowed = quotedPrice * 0.85;
        if (fare < minAllowed || fare > maxAllowed) {
            return next(new AppError(
                `Fare (${fare}) must be within 15% of quoted price (${quotedPrice}). Allowed: ${minAllowed.toFixed(2)} - ${maxAllowed.toFixed(2)}`,
                400
            ));
        }
    }

    const finalFare = fare ?? existingRide.quote?.totalPrice ?? 0;

    // Calculate platform commission
    const pricing = await Settings.getPricing();
    const commissionPercent = pricing.commissionPercent;
    const commission = Math.round(finalFare * (commissionPercent / 100) * 100) / 100;

    // Transaction: atomically complete ride + update driver stats
    // Prevents inconsistent state (e.g. completed ride but driver still busy)
    const session = await mongoose.startSession();
    let ride;
    try {
        session.startTransaction();

        // Atomic update: only transitions in_progress → completed
        ride = await Ride.findOneAndUpdate(
            {
                _id: req.params.id,
                status: 'in_progress',
                driver: driver._id,
            },
            {
                $set: {
                    status: 'completed',
                    endTime: new Date(),
                    fare: finalFare,
                    commission,
                    commissionPercent,
                },
            },
            { new: true, session }
        );

        if (!ride) {
            await session.abortTransaction();
            return next(new AppError('Ride transition failed — status may have changed', 409));
        }

        // Update driver stats within the same transaction
        await Driver.updateOne(
            { _id: driver._id },
            {
                $set: { status: 'online' },
                $inc: { totalTrips: 1, totalEarnings: ride.fare }
            },
            { session }
        );

        await session.commitTransaction();
    } catch (err) {
        await session.abortTransaction();
        throw err;
    } finally {
        session.endSession();
    }

    // Expire any live ride-share documents for this ride — set TTL to endTime + 1 hour
    // so the MongoDB TTL index cleans them up automatically.
    const rideShareExpiry = new Date(ride.endTime.getTime() + 60 * 60 * 1000);
    RideShare.updateMany(
        { ride: ride._id },
        { $set: { expiresAt: rideShareExpiry } }
    ).catch(err => logger.error('[completeRide] RideShare expiry update failed: ' + err.message, 'ride'));

    const populatedRide = await Ride.findById(ride._id)
        .populate('user', 'firstName lastName email phone preferredLanguage')
        .populate({
            path: 'driver',
            populate: {
                path: 'user',
                select: 'firstName lastName fullName phone profileImage'
            }
        });

    // Emit socket events (critical — delivery guarantee via emitCritical)
    const io = req.app.get('io');
    if (io) {
        const completedPayload = {
            ...populatedRide.toObject(),
            canReview: true,
            reviewPrompt: 'How was your ride? Rate your driver!'
        };

        // Notify user with push fallback
        emitCritical(
            io,
            `user:${ride.user}`,
            'ride:completed',
            completedPayload,
            !ride.createdByAdmin ? {
                userId: ride.user.toString(),
                titleKey: 'ride_completed_title',
                bodyKey: 'ride_completed_body',
                data: { rideId: ride._id.toString() },
                params: { fare: String(finalFare) }
            } : undefined
        );
        // Exclude the ride user's room to prevent double-delivery if user is also admin
        io.to('admin').except(`user:${ride.user}`).emit('ride:completed', completedPayload);

        // Notify the driver with updated stats (use post-$inc values, not stale pre-update)
        io.to(`driver:${driver.user}`).emit('ride:completed', {
            rideId: ride._id,
            updatedStats: {
                totalTrips: driver.totalTrips + 1,
                totalEarnings: driver.totalEarnings + ride.fare,
                status: 'online'
            }
        });

        // Notify admin about driver stats update
        io.to('admin').emit('driver:updated', populatedRide.driver);
    }

    // Push notification to driver (always — they may have backgrounded the app)
    pushService.sendToUser(
        driver.user.toString(),
        'ride_completed_driver_title',
        'ride_completed_driver_body',
        { rideId: ride._id.toString() },
        { fare: String(finalFare) }
    ).catch(err => logger.error('Push error (completeRide/driver):', err.message));

    analytics.trackEvent(req.user.id, analytics.EVENTS.RIDE_COMPLETED, {
        rideId: ride._id.toString(),
        fare: finalFare,
        vehicleType: ride.vehicleType,
        durationSeconds: ride.endTime && ride.startTime
            ? Math.round((new Date(ride.endTime) - new Date(ride.startTime)) / 1000)
            : null
    });

    // Send receipt email to passenger (fire-and-forget)
    if (populatedRide.user?.email) {
        const baseFare = ride.quote?.basePrice ?? 0;
        const distanceCharge = Math.max(0, finalFare - baseFare - (ride.waitingFee || 0));
        let durationSeconds = null;
        if (ride.startTime && ride.endTime) {
            durationSeconds = Math.round((new Date(ride.endTime) - new Date(ride.startTime)) / 1000);
        }
        const fmtDuration = (s) => {
            if (!s || s <= 0) return null;
            const h = Math.floor(s / 3600);
            const m = Math.floor((s % 3600) / 60);
            return h > 0 ? `${h}h ${m}m` : `${m}m`;
        };
        const fmtDistance = (meters) => {
            if (!meters || meters <= 0) return null;
            if (meters < 1000) return `${Math.round(meters)}m`;
            return `${(meters / 1000).toFixed(1)} km`;
        };

        const receiptData = {
            receiptId: ride._id,
            ride: {
                vehicleType: ride.vehicleType,
                pickup: ride.pickup,
                dropoff: ride.dropoff,
                stops: ride.stops || [],
                distance: {
                    formatted: ride.quote?.distanceText || fmtDistance(ride.quote?.distance),
                },
                duration: {
                    formatted: durationSeconds ? fmtDuration(durationSeconds) : (ride.quote?.durationText || null),
                },
            },
            driver: populatedRide.driver ? {
                name: `${populatedRide.driver.user?.firstName || ''} ${populatedRide.driver.user?.lastName || ''}`.trim(),
                vehicle: populatedRide.driver.vehicle || null,
            } : null,
            passenger: {
                name: `${populatedRide.user.firstName || ''} ${populatedRide.user.lastName || ''}`.trim(),
            },
            fare: {
                total: finalFare,
                breakdown: {
                    baseFare,
                    distanceCharge: Math.round(distanceCharge * 100) / 100,
                    waitingFee: ride.waitingFee || 0,
                },
                paymentMethod: ride.paymentMethod,
            },
            timestamps: {
                requested: ride.createdAt,
                rideCompleted: ride.endTime,
            },
        };

        const receiptLang = populatedRide.user.preferredLanguage || 'en';
        emailService.sendReceiptEmail(populatedRide.user.email, receiptData, receiptLang)
            .catch(err => logger.error('[completeRide] Receipt email failed: ' + err.message, 'ride'));
    }

    res.json({
        success: true,
        message: 'Ride completed successfully',
        data: {
            ride: populatedRide,
            canReview: true,
            reviewPrompt: 'How was your ride? Rate your driver!'
        }
    });
});

// @desc    Cancel a ride
// @route   PATCH /api/rides/:id/cancel
// @access  Private
const cancelRide = catchAsync(async (req, res, next) => {
    const { reason, note } = req.body;

    const ride = await Ride.findById(req.params.id);

    if (!ride) {
        return next(new AppError('Ride not found', 404));
    }

    // Check if ride can be cancelled
    if (ride.status === 'completed') {
        return next(new AppError('Cannot cancel a completed ride', 400));
    }
    if (ride.status === 'cancelled') {
        return next(new AppError('This ride is already cancelled', 400));
    }

    // Store original state before atomic update
    const wasPending = ride.status === 'pending';
    const hadNoDriver = !ride.driver;

    // Check if user has permission to cancel
    const isUser = ride.user.toString() === req.user.id;
    const isDriver = ride.driver && await Driver.findOne({
        _id: ride.driver,
        user: req.user.id
    }).select('_id user').lean();
    const isAdmin = req.user.role === 'admin';

    if (!isUser && !isDriver && !isAdmin) {
        return next(new AppError('You do not have permission to cancel this ride', 403));
    }

    // Determine who cancelled
    let cancelledBy = 'user';
    if (isDriver) cancelledBy = 'driver';
    if (isAdmin) cancelledBy = 'admin';

    // Validate cancellation reason (required for passengers)
    if (cancelledBy === 'user' && !reason) {
        return next(new AppError('Cancellation reason is required', 400));
    }

    // Validate reason is from allowed enum values
    const validReasons = [
        'waiting_time_too_long',
        'driver_not_moving',
        'wrong_pickup_location',
        'changed_my_mind',
        'found_alternative',
        'price_too_high',
        'driver_requested_cancel',
        'passenger_not_responding',
        'passenger_not_at_pickup',
        'emergency',
        'other'
    ];

    if (reason && !validReasons.includes(reason)) {
        return next(new AppError('Invalid cancellation reason', 400));
    }

    // Calculate cancellation fee:
    // - Pending rides (no driver yet): free cancellation
    // - After driver accepted: 2 GEL fee for passenger cancellation
    // - After driver arrived: 3 GEL fee for passenger cancellation
    // - In progress: 5 GEL fee for passenger cancellation
    // - Driver/admin cancellation: no fee
    let cancellationFee = 0;
    if (cancelledBy === 'user' && ride.driver) {
        switch (ride.status) {
            case 'accepted': cancellationFee = 2; break;
            case 'driver_arrived': cancellationFee = 3; break;
            case 'in_progress': cancellationFee = 5; break;
        }
    }

    // Transaction: atomically cancel ride + release driver back to online
    const session = await mongoose.startSession();
    let cancelledRide;
    try {
        session.startTransaction();

        cancelledRide = await Ride.findOneAndUpdate(
            {
                _id: req.params.id,
                status: { $nin: ['completed', 'cancelled'] },
            },
            {
                $set: {
                    status: 'cancelled',
                    cancelledBy,
                    cancellationReason: reason || null,
                    cancellationNote: note || null,
                    cancellationFee,
                },
            },
            { new: true, session }
        );

        if (!cancelledRide) {
            await session.abortTransaction();
            return next(new AppError('Ride could not be cancelled — status may have changed', 409));
        }

        // If driver was assigned, set them back to online within the same transaction
        if (cancelledRide.driver) {
            await Driver.updateOne(
                { _id: cancelledRide.driver, status: 'busy' },
                { $set: { status: 'online' } },
                { session }
            );
        }

        await session.commitTransaction();

        // Notify ETA dispatch loop that this ride was cancelled (Redis pub/sub)
        notifyRideResponse(cancelledRide._id.toString(), 'cancelled').catch(() => {});
    } catch (err) {
        await session.abortTransaction();
        throw err;
    } finally {
        session.endSession();
    }

    const populatedRide = await Ride.findById(cancelledRide._id)
        .populate('user', 'firstName lastName email phone')
        .populate({
            path: 'driver',
            populate: {
                path: 'user',
                select: 'firstName lastName fullName phone profileImage'
            }
        });

    // Emit socket events (critical — delivery guarantee via emitCritical)
    const io = req.app.get('io');
    if (io) {
        // Notify user with push fallback (only if cancelled by someone else)
        emitCritical(
            io,
            `user:${cancelledRide.user}`,
            'ride:cancelled',
            populatedRide,
            (cancelledBy !== 'user' && !cancelledRide.createdByAdmin) ? {
                userId: cancelledRide.user.toString(),
                titleKey: 'ride_cancelled_title',
                bodyKey: 'ride_cancelled_body',
                data: { rideId: cancelledRide._id.toString() }
            } : undefined
        );
        // Exclude the ride user's room to prevent double-delivery if user is also admin
        io.to('admin').except(`user:${cancelledRide.user}`).emit('ride:cancelled', populatedRide);

        // Notify driver if assigned
        if (populatedRide.driver && populatedRide.driver.user) {
            io.to(`driver:${populatedRide.driver.user._id}`).emit('ride:cancelled', populatedRide);
        }

        // If ride was pending, notify only eligible drivers so they can clear the request modal
        if (wasPending && hadNoDriver) {
            const eligibleTypes = getEligibleDriverTypes(cancelledRide.vehicleType);
            let broadcast = io;
            for (const type of eligibleTypes) {
                broadcast = broadcast.to(`drivers:${type}`);
            }
            broadcast.emit('ride:cancelled', populatedRide);
        }
    }

    // Push notification to driver if assigned (only if cancelled by someone else)
    if (populatedRide.driver && populatedRide.driver.user && cancelledBy !== 'driver') {
        pushService.sendToUser(
            populatedRide.driver.user._id.toString(),
            'ride_cancelled_driver_title',
            'ride_cancelled_driver_body',
            { rideId: cancelledRide._id.toString() }
        ).catch(err => logger.error('Push error (cancelRide/driver):', err.message));
    }

    analytics.trackEvent(req.user.id, analytics.EVENTS.RIDE_CANCELLED, {
        rideId: cancelledRide._id.toString(),
        cancelledBy,
        reason: reason || null
    });

    res.json({
        success: true,
        message: 'Ride cancelled successfully',
        data: { ride: populatedRide }
    });
});

// @desc    Get user's rides
// @route   GET /api/rides/my
// @access  Private
const getMyRides = catchAsync(async (req, res, next) => {
    const { status, page = 1, limit = 20 } = req.query;

    const query = { user: req.user.id };
    if (status && status !== 'all') query.status = status;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const [rides, total] = await Promise.all([
        Ride.find(query)
            .populate({
                path: 'driver',
                populate: {
                    path: 'user',
                    select: 'firstName lastName fullName phone profileImage'
                }
            })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNum),
        Ride.countDocuments(query)
    ]);

    // Mask driver phone numbers before returning to passenger
    const maskedRides = rides.map(ride => {
        const rideData = ride.toObject();
        if (rideData.driver && rideData.driver.user) {
            rideData.driver.user.phone = maskPhone(rideData.driver.user.phone);
        }
        return rideData;
    });

    res.json({
        success: true,
        count: maskedRides.length,
        total,
        page: pageNum,
        pages: Math.ceil(total / limitNum),
        data: { rides: maskedRides }
    });
});

// @desc    Get driver's rides
// @route   GET /api/rides/driver/my
// @access  Private/Driver
const getDriverRides = catchAsync(async (req, res, next) => {
    const { status, page = 1, limit = 20 } = req.query;

    const driver = await Driver.findOne({ user: req.user.id }).select('_id').lean();
    if (!driver) {
        return next(new AppError('Driver profile not found', 404));
    }

    const query = { driver: driver._id };
    if (status && status !== 'all') query.status = status;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const [rides, total] = await Promise.all([
        Ride.find(query)
            .populate('user', 'firstName lastName email phone')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNum),
        Ride.countDocuments(query)
    ]);

    // Mask passenger phone numbers before returning to driver
    const maskedRides = rides.map(ride => {
        const rideData = ride.toObject();
        if (rideData.user) {
            rideData.user.phone = maskPhone(rideData.user.phone);
        }
        return rideData;
    });

    res.json({
        success: true,
        count: maskedRides.length,
        total,
        page: pageNum,
        pages: Math.ceil(total / limitNum),
        data: { rides: maskedRides }
    });
});

// @desc    Get single ride
// @route   GET /api/rides/:id
// @access  Private
const getRide = catchAsync(async (req, res, next) => {
    const ride = await Ride.findById(req.params.id)
        .populate('user', 'firstName lastName email phone')
        .populate({
            path: 'driver',
            populate: {
                path: 'user',
                select: 'firstName lastName fullName phone profileImage'
            }
        });

    if (!ride) {
        return next(new AppError('Ride not found', 404));
    }

    // Check if user has permission to view this ride
    const isUser = ride.user._id.toString() === req.user.id;
    const isDriver = ride.driver && ride.driver.user._id.toString() === req.user.id;
    const isAdmin = req.user.role === 'admin';

    if (!isUser && !isDriver && !isAdmin) {
        return next(new AppError('You do not have permission to view this ride', 403));
    }

    // Build a sanitised copy so we never mutate the Mongoose document
    const rideData = ride.toObject();

    // Passengers see a masked driver phone; drivers see a masked passenger phone.
    // Admins receive full unmasked data.
    if (!isAdmin) {
        if (isUser && rideData.driver && rideData.driver.user) {
            rideData.driver.user.phone = maskPhone(rideData.driver.user.phone);
        }
        if (isDriver && rideData.user) {
            rideData.user.phone = maskPhone(rideData.user.phone);
        }
    }

    res.json({
        success: true,
        data: { ride: rideData }
    });
});

// @desc    Get available pending rides for driver
// @route   GET /api/rides/driver/available
// @access  Private/Driver
const getAvailableRides = catchAsync(async (req, res, next) => {
    // Get driver profile to check vehicle type
    const driver = await Driver.findOne({ user: req.user.id });
    if (!driver) {
        return next(new AppError('Driver profile not found', 404));
    }

    // Check if driver has vehicle info
    if (!driver.vehicle || !driver.vehicle.type) {
        return res.json({
            success: true,
            count: 0,
            data: { rides: [] }
        });
    }

    // Find all pending rides that this driver's tier can serve
    const now = new Date();
    const eligibleRideTypes = getEligibleRideTypes(driver.vehicle.type);
    const availableRides = await Ride.find({
        status: 'pending',
        vehicleType: { $in: eligibleRideTypes },
        $or: [
            { expiresAt: { $gt: now } },  // Not expired yet
            { expiresAt: null }            // Legacy rides without expiration (will be handled by cleanup)
        ]
    })
        .populate('user', 'firstName lastName email phone')
        .sort({ createdAt: -1 })
        .read('secondaryPreferred');

    // Attach commission info so drivers see earnings breakdown (same as socket broadcast)
    const pricingConfig = await Settings.getPricing();
    const commissionPercent = pricingConfig.commissionPercent || 15;
    const ridesWithCommission = availableRides.map(ride => {
        const rideData = ride.toObject();
        const totalPrice = rideData.quote?.totalPrice || 0;
        const commissionAmount = Math.round(totalPrice * (commissionPercent / 100) * 100) / 100;
        rideData.commissionPercent = commissionPercent;
        rideData.commissionAmount = commissionAmount;
        rideData.driverEarnings = Math.round((totalPrice - commissionAmount) * 100) / 100;
        return rideData;
    });

    res.json({
        success: true,
        count: ridesWithCommission.length,
        data: { rides: ridesWithCommission }
    });
});

// @desc    Get all rides (admin)
// @route   GET /api/rides
// @access  Private/Admin
const getAllRides = catchAsync(async (req, res, next) => {
    const { status, startDate, endDate, driver, vehicleType, page = 1, limit = 10 } = req.query;

    const query = {};
    if (status && status !== 'all') query.status = status;
    if (driver) query.driver = driver;
    if (vehicleType && vehicleType !== 'all') query.vehicleType = vehicleType;
    if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            query.createdAt.$lte = end;
        }
    }

    // Convert to numbers with bounds (prevent unbounded queries)
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
    const skip = (pageNum - 1) * limitNum;

    // Get total count for pagination
    const totalRides = await Ride.countDocuments(query);

    const rides = await Ride.find(query)
        .populate('user', 'firstName lastName email phone')
        .populate({
            path: 'driver',
            populate: {
                path: 'user',
                select: 'firstName lastName fullName phone profileImage'
            }
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum);

    res.json({
        success: true,
        count: rides.length,
        total: totalRides,
        page: pageNum,
        pages: Math.ceil(totalRides / limitNum),
        data: { rides }
    });
});

// @desc    Review driver after ride completion
// @route   POST /api/rides/:id/review
// @access  Private
const reviewDriver = catchAsync(async (req, res, next) => {
    const { rating, review } = req.body;

    // Validate rating
    if (!rating || rating < 1 || rating > 5) {
        return next(new AppError('Rating must be between 1 and 5', 400));
    }

    const ride = await Ride.findById(req.params.id);

    if (!ride) {
        return next(new AppError('Ride not found', 404));
    }

    // Check if user is the passenger of this ride
    if (ride.user.toString() !== req.user.id) {
        return next(new AppError('You can only review rides you were a passenger on', 403));
    }

    // Check if ride is completed
    if (ride.status !== 'completed') {
        return next(new AppError('You can only review completed rides', 400));
    }

    // Check if ride has already been reviewed
    if (ride.rating) {
        return next(new AppError('You have already reviewed this ride', 400));
    }

    // Check if ride has a driver assigned
    if (!ride.driver) {
        return next(new AppError('This ride has no assigned driver to review', 400));
    }

    // Update ride with review
    ride.rating = rating;
    ride.review = review || null;
    ride.reviewedAt = new Date();
    await ride.save();

    // Update driver's rating atomically (prevents race condition on concurrent reviews)
    const driver = await Driver.findOneAndUpdate(
        { _id: ride.driver },
        [
            {
                $set: {
                    totalReviews: { $add: ['$totalReviews', 1] },
                    rating: {
                        $round: [
                            { $divide: [
                                { $add: [{ $multiply: ['$rating', '$totalReviews'] }, rating] },
                                { $add: ['$totalReviews', 1] }
                            ] },
                            1
                        ]
                    }
                }
            }
        ],
        { new: true }
    );

    const populatedRide = await Ride.findById(ride._id)
        .populate('user', 'firstName lastName email phone')
        .populate({
            path: 'driver',
            populate: {
                path: 'user',
                select: 'firstName lastName fullName phone profileImage'
            }
        });

    // Emit socket event to driver about the new review
    const io = req.app.get('io');
    if (io && driver) {
        io.to(`driver:${driver.user}`).emit('ride:reviewed', {
            rideId: ride._id,
            rating,
            review,
            updatedStats: {
                rating: driver.rating,
                totalReviews: driver.totalReviews
            }
        });

        // Notify admin about the new review
        io.to('admin').emit('ride:reviewed', populatedRide);

        // Notify admin about driver stats update
        io.to('admin').emit('driver:updated', populatedRide.driver);
    }

    res.json({
        success: true,
        message: 'Driver reviewed successfully',
        data: { ride: populatedRide }
    });
});

// @desc    Receive batched ride route locations (from driver app buffer flush)
// @route   POST /api/rides/:id/locations/batch
// @access  Private/Driver
const receiveLocationBatch = catchAsync(async (req, res, next) => {
    const { points } = req.body;

    if (!Array.isArray(points) || points.length === 0) {
        return next(new AppError('points array is required', 400));
    }
    if (points.length > 50) {
        return next(new AppError('Maximum 50 points per batch', 400));
    }

    // Verify ride exists and belongs to this driver
    const driver = await Driver.findOne({ user: req.user.id }).select('_id').lean();
    if (!driver) {
        return next(new AppError('Driver profile not found', 404));
    }

    const ride = await Ride.findOne({
        _id: req.params.id,
        driver: driver._id,
        status: { $in: ['in_progress', 'completed'] },
    }).select('_id status').lean();

    if (!ride) {
        return next(new AppError('Ride not found or not assigned to you', 404));
    }

    // Validate and filter points
    const validPoints = points.filter(p =>
        p && typeof p.lat === 'number' && typeof p.lng === 'number' &&
        p.lat >= -90 && p.lat <= 90 && p.lng >= -180 && p.lng <= 180 &&
        typeof p.ts === 'number'
    );

    if (validPoints.length === 0) {
        return res.json({ success: true, received: points.length, inserted: 0 });
    }

    // Store route points in ride document (append to routePoints array)
    // Using $push with $each for atomic append; $slice prevents unbounded growth
    await Ride.updateOne(
        { _id: ride._id },
        {
            $push: {
                routePoints: {
                    $each: validPoints.map(p => ({
                        lat: p.lat,
                        lng: p.lng,
                        heading: p.heading ?? null,
                        speed: p.speed ?? null,
                        accuracy: p.accuracy ?? null,
                        ts: new Date(p.ts),
                    })),
                    $slice: -5000, // Keep last 5000 points max (~4+ hours of ride)
                }
            }
        }
    );

    res.json({
        success: true,
        received: points.length,
        inserted: validPoints.length,
    });
});

// @desc    Auto-expire old pending rides
// @access  Internal (called by scheduler or on server startup)
const expireOldRides = async (io) => {
    try {
        const now = new Date();

        // Find all expired pending rides (only fields needed for notifications)
        const expiredRides = await Ride.find({
            status: 'pending',
            expiresAt: { $lte: now }
        }).select('_id user').lean();

        if (expiredRides.length === 0) {
            return { expired: 0 };
        }

        logger.info(`Found ${expiredRides.length} expired rides to cancel`);

        // Update all expired rides to cancelled status
        await Ride.updateMany(
            {
                status: 'pending',
                expiresAt: { $lte: now }
            },
            {
                $set: {
                    status: 'cancelled',
                    cancelledBy: 'admin',
                    cancellationReason: 'other',
                    cancellationNote: 'Ride request expired'
                }
            }
        );

        // Emit socket events and send pushes to offline users (uses presence system — no fetchSockets)
        for (const ride of expiredRides) {
            if (io) {
                io.to(`user:${ride.user}`).emit('ride:expired', { rideId: ride._id });
                io.to('drivers:all').emit('ride:unavailable', { rideId: ride._id });
            }

            // O(1) presence check instead of O(nodes) fetchSockets()
            if (!(await isUserOnlineAsync(ride.user.toString()))) {
                pushService.sendToUser(
                    ride.user.toString(),
                    'ride_expired_title',
                    'ride_expired_body',
                    { rideId: ride._id.toString() }
                ).catch(err => logger.error('Push error (expireOldRides):', err.message));
            }
        }

        return { expired: expiredRides.length };
    } catch (error) {
        logger.error('Error expiring old rides', 'scheduler', error);
        return { expired: 0, error: error.message };
    }
};

// @desc    Auto-cancel rides where driver waited too long (3 minutes)
// @access  Internal (called by scheduler)
const expireWaitingRides = async (io) => {
    try {
        const now = new Date();

        // Find all rides where driver is waiting and time has expired
        const waitingExpiredRides = await Ride.find({
            status: 'driver_arrived',
            waitingExpiresAt: { $lte: now }
        }).populate({
            path: 'driver',
            select: '_id user',
            populate: {
                path: 'user',
                select: '_id'
            }
        }).lean();

        if (waitingExpiredRides.length === 0) {
            return { cancelled: 0 };
        }

        logger.info(`Found ${waitingExpiredRides.length} rides with expired waiting time`);

        // Update all waiting-expired rides to cancelled status
        await Ride.updateMany(
            {
                status: 'driver_arrived',
                waitingExpiresAt: { $lte: now }
            },
            {
                $set: {
                    status: 'cancelled',
                    cancelledBy: 'admin',
                    cancellationReason: 'waiting_timeout',
                    cancellationNote: 'Passenger did not show up within 3 minutes'
                }
            }
        );

        // Bulk reset all drivers to online in one operation (replaces sequential loop)
        const driverIds = waitingExpiredRides
            .filter(r => r.driver && r.driver._id)
            .map(r => r.driver._id);

        if (driverIds.length > 0) {
            await Driver.updateMany(
                { _id: { $in: driverIds }, status: 'busy' },
                { $set: { status: 'online' } }
            );
        }

        // Notify via socket + push (uses presence system — no fetchSockets)
        for (const ride of waitingExpiredRides) {
            if (io) {
                io.to(`user:${ride.user}`).to('admin').emit('ride:waitingTimeout', {
                    rideId: ride._id,
                    message: 'Ride cancelled - you did not arrive within 3 minutes'
                });

                if (ride.driver && ride.driver.user) {
                    io.to(`driver:${ride.driver.user._id}`).emit('ride:waitingTimeout', {
                        rideId: ride._id,
                        message: 'Ride cancelled - passenger did not show up'
                    });
                }
            }

            // O(1) presence check instead of O(nodes) fetchSockets()
            if (!(await isUserOnlineAsync(ride.user.toString()))) {
                pushService.sendToUser(
                    ride.user.toString(),
                    'waiting_timeout_passenger_title',
                    'waiting_timeout_passenger_body',
                    { rideId: ride._id.toString() }
                ).catch(err => logger.error('Push error (waitingTimeout/passenger):', err.message));
            }

            // Push to driver (always — they may have backgrounded the app)
            if (ride.driver && ride.driver.user) {
                pushService.sendToUser(
                    ride.driver.user._id.toString(),
                    'waiting_timeout_title',
                    'waiting_timeout_body',
                    { rideId: ride._id.toString(), channelId: 'ride-requests' }
                ).catch(err => logger.error('Push error (waitingTimeout/driver):', err.message));
            }
        }

        return { cancelled: waitingExpiredRides.length };
    } catch (error) {
        logger.error('Error expiring waiting rides', 'scheduler', error);
        return { cancelled: 0, error: error.message };
    }
};

// @desc    Auto-cancel rides where driver accepted but didn't arrive within 10 minutes
// @access  Internal (called by scheduler)
const expireAcceptedRides = async (io) => {
    try {
        const now = new Date();

        const staleRides = await Ride.find({
            status: 'accepted',
            acceptedExpiresAt: { $lte: now }
        }).populate({
            path: 'driver',
            select: '_id user',
            populate: {
                path: 'user',
                select: '_id'
            }
        }).lean();

        if (staleRides.length === 0) {
            return { cancelled: 0 };
        }

        logger.info(`Found ${staleRides.length} accepted rides where driver didn't arrive in time`);

        // Cancel all stale accepted rides
        await Ride.updateMany(
            {
                status: 'accepted',
                acceptedExpiresAt: { $lte: now }
            },
            {
                $set: {
                    status: 'cancelled',
                    driver: null,
                    cancelledBy: 'admin',
                    cancellationReason: 'driver_not_moving',
                    cancellationNote: 'Driver did not arrive within 10 minutes',
                    acceptedExpiresAt: null,
                }
            }
        );

        // Reset drivers back to online
        const driverIds = staleRides
            .filter(r => r.driver && r.driver._id)
            .map(r => r.driver._id);

        if (driverIds.length > 0) {
            await Driver.updateMany(
                { _id: { $in: driverIds }, status: 'busy' },
                { $set: { status: 'online' } }
            );
        }

        // Notify passengers and drivers
        for (const ride of staleRides) {
            if (io) {
                io.to(`user:${ride.user}`).to('admin').emit('ride:acceptedTimeout', {
                    rideId: ride._id,
                    message: 'Ride cancelled - driver did not arrive in time'
                });

                if (ride.driver && ride.driver.user) {
                    io.to(`driver:${ride.driver.user._id}`).emit('ride:acceptedTimeout', {
                        rideId: ride._id,
                        message: 'Ride cancelled - you did not arrive within the time limit'
                    });
                }
            }

            // Push to passenger
            if (!(await isUserOnlineAsync(ride.user.toString()))) {
                pushService.sendToUser(
                    ride.user.toString(),
                    'accepted_timeout_passenger_title',
                    'accepted_timeout_passenger_body',
                    { rideId: ride._id.toString() }
                ).catch(err => logger.error('Push error (acceptedTimeout/passenger):', err.message));
            }

            // Push to driver
            if (ride.driver && ride.driver.user) {
                pushService.sendToUser(
                    ride.driver.user._id.toString(),
                    'accepted_timeout_driver_title',
                    'accepted_timeout_driver_body',
                    { rideId: ride._id.toString(), channelId: 'ride-requests' }
                ).catch(err => logger.error('Push error (acceptedTimeout/driver):', err.message));
            }
        }

        return { cancelled: staleRides.length };
    } catch (error) {
        logger.error('Error expiring accepted rides', 'scheduler', error);
        return { cancelled: 0, error: error.message };
    }
};

// @desc    Driver rates a passenger after ride completion (Task 4: two-way rating)
// @route   POST /api/rides/:id/review-passenger
// @access  Private/Driver
const reviewPassenger = catchAsync(async (req, res, next) => {
    const { rating, review } = req.body;

    if (!rating || rating < 1 || rating > 5) {
        return next(new AppError('Rating must be between 1 and 5', 400));
    }

    // Verify caller has an approved driver profile
    const driver = await Driver.findOne({ user: req.user.id, isApproved: true }).select('_id').lean();
    if (!driver) {
        return next(new AppError('Driver profile not found or not approved', 403));
    }

    const ride = await Ride.findById(req.params.id);

    if (!ride) {
        return next(new AppError('Ride not found', 404));
    }

    // Only the driver assigned to this ride can rate the passenger
    if (!ride.driver || ride.driver.toString() !== driver._id.toString()) {
        return next(new AppError('You are not the assigned driver for this ride', 403));
    }

    if (ride.status !== 'completed') {
        return next(new AppError('You can only rate passengers on completed rides', 400));
    }

    if (ride.driverRating) {
        return next(new AppError('You have already rated the passenger for this ride', 400));
    }

    ride.driverRating = rating;
    ride.driverReview = review || null;
    ride.driverReviewedAt = new Date();
    await ride.save();

    res.json({
        success: true,
        message: 'Passenger rated successfully',
        data: {
            rideId: ride._id,
            driverRating: ride.driverRating,
            driverReview: ride.driverReview,
            driverReviewedAt: ride.driverReviewedAt
        }
    });
});

// @desc    List upcoming scheduled rides for the authenticated user (Task 6)
// @route   GET /api/rides/scheduled
// @access  Private
const getScheduledRides = catchAsync(async (req, res) => {
    const { page = 1, limit = 20 } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const query = {
        user: req.user.id,
        isScheduled: true,
        scheduledFor: { $gte: new Date() },
        status: { $in: ['pending', 'accepted'] }
    };

    const [rides, total] = await Promise.all([
        Ride.find(query)
            .populate({
                path: 'driver',
                populate: {
                    path: 'user',
                    select: 'firstName lastName fullName phone profileImage'
                }
            })
            .sort({ scheduledFor: 1 })
            .skip(skip)
            .limit(limitNum),
        Ride.countDocuments(query)
    ]);

    res.json({
        success: true,
        count: rides.length,
        total,
        page: pageNum,
        pages: Math.ceil(total / limitNum),
        data: { rides }
    });
});

// Broadcast scheduled rides that are starting within the next 10 minutes.
// Called on a periodic interval from app.js so drivers get notified in time to accept.
const SCHEDULED_BROADCAST_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
// Minimum gap between re-broadcasts of the same ride (prevents duplicate blasts
// when the cron fires every 60 seconds but the ride stays in the window).
const SCHEDULED_BROADCAST_DEDUP_MS = 10 * 60 * 1000; // 10 minutes

// ── Scheduler concurrency lock ─────────────────────────────────────────────────
//
// Problem: broadcastScheduledRides() runs on a setInterval. If the DB query
// or the per-ride updateOne calls take longer than the interval (1 minute) the
// next tick will start a second concurrent run, leading to duplicate broadcasts.
//
// Current approach — in-process boolean lock:
//   Works correctly for single-process and PM2-cluster deployments where
//   background jobs are restricted to instance 0 (see isPrimaryWorker in app.js).
//   If a run is still in progress when the next interval fires the new tick is
//   skipped and a warning is emitted — no duplicate broadcasts.
//
// TODO (multi-instance / Redis): Replace with a Redis SET NX EX lock:
//   const acquired = await redis.set('lock:scheduledBroadcast', '1', { NX: true, EX: 50 });
//   if (!acquired) return;   // another instance is running — skip
//   try { ... } finally { await redis.del('lock:scheduledBroadcast'); }
//
// Note: the `lastBroadcastAt` dedup stamp (written atomically via updateOne before
// any broadcast) already provides a second line of defence. Even if two instances
// both pass the lock simultaneously, the first one to stamp a ride will exclude it
// from the second instance's query window, preventing a double-broadcast for the
// same ride.
// ──────────────────────────────────────────────────────────────────────────────
let _scheduledBroadcastRunning = false;

const broadcastScheduledRides = async (io) => {
    // In-process lock — skips the tick if a previous run hasn't finished yet.
    if (_scheduledBroadcastRunning) {
        logger.warn('[scheduler] broadcastScheduledRides skipped — previous run still in progress', 'scheduler');
        return;
    }
    _scheduledBroadcastRunning = true;

    try {
        if (!io) return;

        const now = new Date();
        const windowEnd = new Date(now.getTime() + SCHEDULED_BROADCAST_WINDOW_MS);
        // Only fetch rides that have never been broadcast OR whose last broadcast
        // was more than SCHEDULED_BROADCAST_DEDUP_MS ago.
        const dedupCutoff = new Date(now.getTime() - SCHEDULED_BROADCAST_DEDUP_MS);

        // Find pending scheduled rides within the broadcast window that haven't
        // been broadcast recently.
        //
        // The `lastBroadcastAt` field is the primary dedup mechanism for multi-instance
        // deployments: once any instance stamps a ride, all instances will skip it for
        // the next SCHEDULED_BROADCAST_DEDUP_MS (10 min), regardless of which instance
        // held the lock. This means the worst-case duplicate window equals the time
        // between two instances reading the same un-stamped ride and the first stamp
        // being written — a very small window under normal DB latencies.
        const upcomingRides = await Ride.find({
            isScheduled: true,
            status: 'pending',
            scheduledFor: { $gte: now, $lte: windowEnd },
            $or: [
                { lastBroadcastAt: null },
                { lastBroadcastAt: { $lte: dedupCutoff } }
            ]
        }).populate('user', 'firstName lastName email phone').lean();

        if (upcomingRides.length === 0) return;

        const pricingConfig = await Settings.getPricing();
        const commissionPercent = pricingConfig.commissionPercent || 15;

        for (const ride of upcomingRides) {
            // Stamp BEFORE broadcasting: this minimises the multi-instance race window.
            // If the stamp write fails we skip the broadcast for this tick to avoid a
            // potential duplicate on the next tick.
            const stampResult = await Ride.updateOne(
                {
                    _id: ride._id,
                    // Only stamp if it still hasn't been broadcast by another instance
                    // since we fetched the list above (optimistic concurrency guard).
                    $or: [
                        { lastBroadcastAt: null },
                        { lastBroadcastAt: { $lte: dedupCutoff } }
                    ]
                },
                { $set: { lastBroadcastAt: now } }
            );

            // If modifiedCount is 0, another instance already stamped this ride —
            // skip broadcasting it from this instance.
            if (stampResult.modifiedCount === 0) {
                logger.warn(`[scheduler] Skipping ride ${ride._id} — already stamped by another instance`, 'scheduler');
                continue;
            }

            const eligibleTypes = getEligibleDriverTypes(ride.vehicleType);
            let broadcast = io.to('admin');
            for (const type of eligibleTypes) {
                broadcast = broadcast.to(`drivers:${type}`);
            }

            const totalPrice = ride.quote?.totalPrice || 0;
            const commissionAmount = Math.round(totalPrice * (commissionPercent / 100) * 100) / 100;
            const rideData = {
                ...ride,
                commissionPercent,
                commissionAmount,
                driverEarnings: Math.round((totalPrice - commissionAmount) * 100) / 100,
                isScheduledBroadcast: true
            };

            broadcast.emit('ride:request', rideData);

            logger.info(`[scheduler] Broadcast scheduled ride ${ride._id} (scheduledFor: ${ride.scheduledFor})`, 'scheduler');
        }
    } catch (err) {
        logger.error('[scheduler] Error broadcasting scheduled rides: ' + err.message, 'scheduler');
    } finally {
        // Always release the lock, even if an error is thrown.
        _scheduledBroadcastRunning = false;
    }
};

module.exports = {
    createRide,
    adminCreateRide,
    acceptRide,
    declineRide,
    notifyArrival,
    startRide,
    completeRide,
    cancelRide,
    getMyRides,
    getDriverRides,
    getRide,
    getAllRides,
    getAvailableRides,
    reviewDriver,
    reviewPassenger,
    getScheduledRides,
    receiveLocationBatch,
    expireOldRides,
    expireWaitingRides,
    expireAcceptedRides,
    getEligibleDriverTypes,
    broadcastScheduledRides
};
