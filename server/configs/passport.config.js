const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
// const FacebookStrategy = require('passport-facebook').Strategy;
const User = require('../models/user.model');

// Google Strategy
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL
}, async (accessToken, refreshToken, profile, done) => {
    try {
        // Check if user already exists
        let user = await User.findOne({ 
            $or: [
                { providerId: profile.id, provider: 'google' },
                { email: profile.emails[0].value }
            ]
        });

        if (user) {
            // If user exists with email but different provider, reject (prevent account takeover)
            if (user.provider !== 'google') {
                return done(null, false, {
                    message: `An account with this email already exists. Please log in with ${user.provider}`
                });
            }
            return done(null, user);
        }

        // Create new user
        user = await User.create({
            firstName: profile.name.givenName,
            lastName: profile.name.familyName,
            email: profile.emails[0].value,
            provider: 'google',
            providerId: profile.id,
            avatar: profile.photos[0]?.value,
            isVerified: true
        });

        done(null, user);
    } catch (error) {
        done(error, null);
    }
}));

// Facebook Strategy (commented out for now)
// passport.use(new FacebookStrategy({
//     clientID: process.env.FACEBOOK_APP_ID,
//     clientSecret: process.env.FACEBOOK_APP_SECRET,
//     callbackURL: process.env.FACEBOOK_CALLBACK_URL,
//     profileFields: ['id', 'emails', 'name', 'picture.type(large)']
// }, async (accessToken, refreshToken, profile, done) => {
//     try {
//         const email = profile.emails?.[0]?.value;
//
//         // Check if user already exists
//         let user = await User.findOne({
//             $or: [
//                 { providerId: profile.id, provider: 'facebook' },
//                 ...(email ? [{ email }] : [])
//             ]
//         });

//         if (user) {
//             if (user.provider !== 'facebook') {
//                 user.provider = 'facebook';
//                 user.providerId = profile.id;
//                 user.avatar = profile.photos[0]?.value || user.avatar;
//                 await user.save();
//             }
//             return done(null, user);
//         }

//         // Create new user
//         user = await User.create({
//             firstName: profile.name.givenName,
//             lastName: profile.name.familyName,
//             email: email || `${profile.id}@facebook.com`,
//             provider: 'facebook',
//             providerId: profile.id,
//             avatar: profile.photos[0]?.value,
//             isVerified: true
//         });

//         done(null, user);
//     } catch (error) {
//         done(error, null);
//     }
// }));

module.exports = passport;
