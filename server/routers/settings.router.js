const express = require('express');
const { protect, authorize } = require('../middlewares/auth.middleware');
const { getPricing, updatePricing } = require('../controllers/settings.controller');

const router = express.Router();

// Public — mobile app fetches pricing config
router.get('/pricing', protect, getPricing);

// Admin only — update pricing
router.put('/pricing', protect, authorize('admin'), updatePricing);

module.exports = router;
