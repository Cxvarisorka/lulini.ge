const express = require('express');
const { protect } = require('../middlewares/auth.middleware');
const { chatMessageLimiter } = require('../middlewares/rateLimiter');
const { sendMessage, getMessages, markAsRead } = require('../controllers/chat.controller');

const router = express.Router();

// All chat routes require authentication
router.use(protect);

// Nested under ride context
router.post('/rides/:rideId/messages', chatMessageLimiter, sendMessage);
router.get('/rides/:rideId/messages', getMessages);
router.patch('/rides/:rideId/messages/read', markAsRead);

module.exports = router;
