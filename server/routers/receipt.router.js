const express = require('express');
const { protect } = require('../middlewares/auth.middleware');
const { getReceipt } = require('../controllers/receipt.controller');

const router = express.Router();

router.use(protect);

// GET /api/receipts/rides/:rideId/receipt
router.get('/rides/:rideId/receipt', getReceipt);

module.exports = router;
