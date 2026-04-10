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
    getRideShareStatus,
    resolveTrackLink
} = require('../controllers/safety.controller');
const { protect, authorize } = require('../middlewares/auth.middleware');

// NOTE: Rate limiters temporarily removed.

// ── Public routes (no auth required) ──────────────────────────────────────────
// IMPORTANT: these must be registered BEFORE router.use(protect)
router.get('/rides/shared/:token', getRideShareStatus);
router.get('/rides/track/:rideId', resolveTrackLink);

// All remaining safety routes require authentication
router.use(protect);

// Emergency contact routes
router.post('/emergency-contacts', addEmergencyContact);
router.get('/emergency-contacts', getEmergencyContacts);
router.patch('/emergency-contacts/:id', updateEmergencyContact);
router.delete('/emergency-contacts/:id', deleteEmergencyContact);

// SOS routes
router.post('/sos', triggerSOS);
// Users resolve their own; admins can resolve any (enforced inside controller)
router.patch('/sos/:id/resolve', resolveSOSAlert);

// Ride sharing routes (authenticated)
router.post('/rides/:rideId/share', shareRide);

module.exports = router;
