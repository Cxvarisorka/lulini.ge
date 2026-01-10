const express = require('express');
const passport = require('passport');
const router = express.Router();

const {
    register,
    login,
    logout,
    getMe,
    oauthSuccess,
    oauthFailure
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
