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
    sendEmailVerification,
    verifyEmailForRegistration,
    sendRegistrationPhoneOtp,
    verifyRegistrationPhoneOtp,
    register,
    updateProfile,
    deleteAccount,
    cancelAccountDeletion,
    forgotPasswordSendOtp,
    forgotPasswordReset
} = require('../controllers/auth.controller');
const { protect } = require('../middlewares/auth.middleware');
const { validateLogin, validateSendPhoneOtp } = require('../middlewares/validators');

// NOTE: Rate limiters temporarily removed.

// Health check / test route
router.get('/test', (req, res) => {
    res.json({ success: true, message: 'Auth API is running' });
});

// Core auth routes
router.post('/login', validateLogin, login);
router.post('/logout', logout);
router.get('/me', protect, getMe);

// Local (email/password) registration — driver mobile app self-signup.
// Requires a prior /email/send-verification + /email/verify-registration pair
// AND a /phone/send-registration-otp + /phone/verify-registration-otp pair, so
// the user is only written to the DB after both email and phone are proven.
router.post('/register', register);
router.post('/email/send-verification', sendEmailVerification);
router.post('/email/verify-registration', verifyEmailForRegistration);
router.post('/phone/send-registration-otp', validateSendPhoneOtp, sendRegistrationPhoneOtp);
router.post('/phone/verify-registration-otp', verifyRegistrationPhoneOtp);

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

// Forgot password (phone OTP verification)
router.post('/forgot-password/send-otp', validateSendPhoneOtp, forgotPasswordSendOtp);
router.post('/forgot-password/reset', forgotPasswordReset);

// Account deletion (Apple App Store requirement)
// DELETE /account        - schedule deletion (30-day grace period)
// DELETE /account/cancel - cancel a pending deletion within the grace period
//
// The /cancel sub-route MUST be registered before /account so Express matches
// the more-specific path first.
router.delete('/account/cancel', protect, cancelAccountDeletion);
router.delete('/account', protect, deleteAccount);

module.exports = router;
