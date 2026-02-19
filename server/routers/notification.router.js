const express = require('express');
const router = express.Router();
const { registerToken, unregisterToken } = require('../controllers/notification.controller');
const { protect } = require('../middlewares/auth.middleware');

router.post('/register-token', protect, registerToken);
router.post('/unregister-token', protect, unregisterToken);

module.exports = router;
