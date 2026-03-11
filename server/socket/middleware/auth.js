// Socket.IO authentication middleware.
// Validates JWT from auth header (mobile) or cookies (web).
// Uses shared auth cache (60s TTL) to prevent DB storm on mass reconnect.
// Stores lean (plain JS) objects — no Mongoose document overhead in memory.

const User = require('../../models/user.model');
const { userCache, AUTH_CACHE_TTL } = require('../../utils/authCache');
const { verifyToken } = require('../../utils/jwt.utils');

// Helper to parse cookies from raw header string
function parseCookies(cookieString) {
    const cookies = {};
    if (cookieString) {
        cookieString.split(';').forEach(cookie => {
            const [name, value] = cookie.trim().split('=');
            if (name && value) {
                cookies[name] = decodeURIComponent(value);
            }
        });
    }
    return cookies;
}

function authMiddleware(io) {
    io.use(async (socket, next) => {
        try {
            let token = null;

            // Try to get token from auth header (mobile apps)
            if (socket.handshake.auth && socket.handshake.auth.token) {
                token = socket.handshake.auth.token;
            }
            // Otherwise try cookies (web app)
            else if (socket.handshake.headers.cookie) {
                const cookies = parseCookies(socket.handshake.headers.cookie);
                token = cookies.token;
            }

            if (!token) {
                return next(new Error('Authentication required'));
            }

            const decoded = verifyToken(token);
            if (!decoded) {
                return next(new Error('Invalid or expired token'));
            }

            // Check shared auth cache first (prevents thundering herd on mass reconnect)
            const cached = userCache.get(decoded.id);
            let user;
            if (cached && Date.now() - cached.ts < AUTH_CACHE_TTL) {
                user = cached.user;
            } else {
                // .lean() returns a plain JS object — lower memory, no Mongoose overhead
                user = await User.findById(decoded.id).select('-password').lean();
                if (user) {
                    // Add `id` alias for compatibility (lean objects don't have Mongoose virtuals)
                    user.id = user._id.toString();
                    userCache.set(decoded.id, { user, ts: Date.now() });
                }
            }

            if (!user) {
                return next(new Error('User not found'));
            }

            socket.user = user;
            next();
        } catch (error) {
            next(new Error('Invalid token'));
        }
    });
}

module.exports = authMiddleware;
