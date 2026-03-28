const express = require('express');
const router = express.Router();
const {
    addEmergencyContact,
    getEmergencyContacts,
    updateEmergencyContact,
    deleteEmergencyContact,
    triggerSOS,
    resolveSOSAlert,
    shareRide,
    getRideShareStatus
} = require('../controllers/safety.controller');
const { protect, authorize } = require('../middlewares/auth.middleware');
const rateLimit = require('express-rate-limit');

// Rate limit SOS triggers: at most 10 per 15 minutes per user.
const sosLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    // Use user ID when authenticated — no custom keyGenerator needed for this
    // since protect middleware runs before this limiter
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many SOS requests, please try again later' }
});

// Rate limit public share status lookups: 60 per minute per IP.
const shareStatusLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    // Use default keyGenerator (req.ip) — no custom one needed
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests, please try again later' }
});

// ── Public routes (no auth required) ──────────────────────────────────────────
// IMPORTANT: these must be registered BEFORE router.use(protect)
router.get('/rides/shared/:token', shareStatusLimiter, getRideShareStatus);

// All remaining safety routes require authentication
router.use(protect);

// Emergency contact routes
router.post('/emergency-contacts', addEmergencyContact);
router.get('/emergency-contacts', getEmergencyContacts);
router.patch('/emergency-contacts/:id', updateEmergencyContact);
router.delete('/emergency-contacts/:id', deleteEmergencyContact);

// SOS routes
router.post('/sos', sosLimiter, triggerSOS);
// Users resolve their own; admins can resolve any (enforced inside controller)
router.patch('/sos/:id/resolve', resolveSOSAlert);

// Ride sharing routes (authenticated)
router.post('/rides/:rideId/share', shareRide);

module.exports = router;
