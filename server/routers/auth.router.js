const express = require('express');
const router = express.Router();

const {
    login,
    logout,
    getMe,
    sendPhoneOtp,
    verifyPhoneOtp,
    completeOnboarding,
    sendPhoneUpdateOtp,
    verifyPhoneUpdateOtp,
    sendEmailCode,
    verifyEmailCode,
    updateProfile,
    deleteAccount,
    cancelAccountDeletion
} = require('../controllers/auth.controller');
const { protect } = require('../middlewares/auth.middleware');
const { authLimiter, otpSendLimiter, otpVerifyLimiter } = require('../middlewares/rateLimiter');
const { validateLogin, validateSendPhoneOtp } = require('../middlewares/validators');

// Health check / test route
router.get('/test', (req, res) => {
    res.json({ success: true, message: 'Auth API is running' });
});

// Core auth routes
router.post('/login', authLimiter, validateLogin, login);
router.post('/logout', logout);
router.get('/me', protect, getMe);

// Phone OTP authentication routes
router.post('/phone/send-otp', validateSendPhoneOtp, sendPhoneOtp);
router.post('/phone/verify-otp', verifyPhoneOtp);

// Phone update routes (authenticated)
router.post('/phone/update-send-otp', protect, validateSendPhoneOtp, sendPhoneUpdateOtp);
router.post('/phone/update-verify-otp', protect, verifyPhoneUpdateOtp);

// Complete onboarding
router.post('/complete-onboarding', protect, completeOnboarding);

// Update profile (firstName, lastName)
router.patch('/profile', protect, updateProfile);

// Email verification (authenticated — add/update email)
router.post('/email/send-code', protect, sendEmailCode);
router.post('/email/verify-code', protect, verifyEmailCode);

// Account deletion (Apple App Store requirement)
// DELETE /account        - schedule deletion (30-day grace period)
// DELETE /account/cancel - cancel a pending deletion within the grace period
//
// The /cancel sub-route MUST be registered before /account so Express matches
// the more-specific path first.
router.delete('/account/cancel', protect, cancelAccountDeletion);
router.delete('/account', protect, deleteAccount);

module.exports = router;
