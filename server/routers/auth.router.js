const express = require('express');
const passport = require('passport');
const router = express.Router();

const {
    register,
    login,
    logout,
    getMe,
    oauthSuccess,
    oauthSuccessMobile,
    oauthFailure,
    googleTokenAuth,
    sendPhoneOtp,
    verifyPhoneOtp,
    appleTokenAuth,
    completeOnboarding,
    sendPhoneUpdateOtp,
    verifyPhoneUpdateOtp,
    updateEmail
} = require('../controllers/auth.controller');
const { protect } = require('../middlewares/auth.middleware');

// Health check / test route
router.get('/test', (req, res) => {
    res.json({ success: true, message: 'Auth API is running' });
});

// Traditional auth routes
router.post('/register', register);
router.post('/login', login);
router.post('/logout', logout);
router.get('/me', protect, getMe);

// Google OAuth routes
router.get('/google',
    passport.authenticate('google', {
        scope: ['profile', 'email'],
        session: false
    })
);

router.get('/google/callback',
    passport.authenticate('google', {
        session: false,
        failureRedirect: '/api/auth/failure'
    }),
    oauthSuccess
);

// Google OAuth for mobile - verify ID token from native Google Sign-In SDK
router.post('/google/token', googleTokenAuth);

// Phone OTP authentication routes
router.post('/phone/send-otp', sendPhoneOtp);
router.post('/phone/verify-otp', verifyPhoneOtp);

// Phone update routes (authenticated)
router.post('/phone/update-send-otp', protect, sendPhoneUpdateOtp);
router.post('/phone/update-verify-otp', protect, verifyPhoneUpdateOtp);

// Apple Sign-In route
router.post('/apple/token', appleTokenAuth);

// Complete onboarding
router.post('/complete-onboarding', protect, completeOnboarding);

// Update email (authenticated)
router.patch('/email', protect, updateEmail);

// Google OAuth for mobile (web browser flow - legacy) - starts OAuth flow and passes redirect_uri as state
router.get('/google/mobile', (req, res, next) => {
    const redirectUri = req.query.redirect_uri;
    // Determine the callback URL for mobile based on current request
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const callbackURL = `${protocol}://${host}/api/auth/google/mobile/callback`;

    passport.authenticate('google', {
        scope: ['profile', 'email'],
        session: false,
        state: redirectUri, // Pass redirect_uri as state to retrieve after callback
        callbackURL: callbackURL // Override callback URL for mobile
    })(req, res, next);
});

router.get('/google/mobile/callback', (req, res, next) => {
    // Build the same callback URL that was used in the initial request
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const callbackURL = `${protocol}://${host}/api/auth/google/mobile/callback`;

    passport.authenticate('google', {
        session: false,
        failureRedirect: '/api/auth/failure',
        callbackURL: callbackURL // Must match the URL used in /google/mobile
    })(req, res, next);
}, oauthSuccessMobile);

// Facebook OAuth routes (commented out for now)
// router.get('/facebook',
//     passport.authenticate('facebook', {
//         scope: ['email'],
//         session: false
//     })
// );

// router.get('/facebook/callback',
//     passport.authenticate('facebook', {
//         session: false,
//         failureRedirect: '/api/auth/failure'
//     }),
//     oauthSuccess
// );

// OAuth failure route
router.get('/failure', oauthFailure);

module.exports = router;
