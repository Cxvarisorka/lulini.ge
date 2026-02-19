const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const passport = require('passport');
const jwt = require('jsonwebtoken');
const compression = require('compression');
const helmet = require('helmet');
const morgan = require('morgan');
const mongoSanitize = require('express-mongo-sanitize');
const Sentry = require('@sentry/node');
const { globalLimiter } = require('./middlewares/rateLimiter');
require('dotenv').config();

// Sentry error tracking (must init before other middleware)
if (process.env.SENTRY_DSN) {
    Sentry.init({
        dsn: process.env.SENTRY_DSN,
        environment: process.env.NODE_ENV || 'development',
        tracesSampleRate: 0.1,
    });
}

// Validate critical environment variables at startup
const requiredEnvVars = {
    JWT_SECRET: { minLength: 32 },
    MONGODB_URI: {},
};
// These are required in production only
const productionEnvVars = {
    GOOGLE_MAPS_API_KEY: {},
    TWILIO_ACCOUNT_SID: {},
    TWILIO_AUTH_TOKEN: {},
    TWILIO_VERIFY_SERVICE_SID: {},
};

const missingVars = [];
const allRequired = process.env.NODE_ENV === 'production'
    ? { ...requiredEnvVars, ...productionEnvVars }
    : requiredEnvVars;

for (const [name, opts] of Object.entries(allRequired)) {
    if (!process.env[name]) {
        missingVars.push(name);
    } else if (opts.minLength && process.env[name].length < opts.minLength) {
        missingVars.push(`${name} (too short, min ${opts.minLength} chars)`);
    }
}
if (missingVars.length > 0) {
    console.error(`FATAL: Missing or invalid environment variables:\n  - ${missingVars.join('\n  - ')}`);
    process.exit(1);
}

const connectDB = require('./configs/db.config');
require('./configs/passport.config');
const globalErrorHandler = require('./middlewares/error.middleware');
const AppError = require('./utils/AppError');
const User = require('./models/user.model');

// Routers
const authRouter = require('./routers/auth.router');
const transferRouter = require('./routers/transfer.router');
const rentalRouter = require('./routers/rental.router');
const tourRouter = require('./routers/tour.router');
const driverRouter = require('./routers/driver.router');
const rideRouter = require('./routers/ride.router');
const mapsRouter = require('./routers/maps.router');
const notificationRouter = require('./routers/notification.router');

const app = express();
const server = http.createServer(app);

// Connect to database
connectDB();

// Middleware
const allowedOrigins = process.env.NODE_ENV === 'production'
    ? ['https://gotours.ge', 'https://www.gotours.ge']
    : ['http://localhost:5173', 'https://gotours.ge', 'https://www.gotours.ge', 'https://api.gotours.ge', 'http://192.168.100.3:3000'];

// Socket.io setup with CORS
const io = new Server(server, {
    cors: {
        origin: function (origin, callback) {
            if (!origin) return callback(null, true);
            if (allowedOrigins.indexOf(origin) !== -1) {
                callback(null, true);
            } else if (process.env.NODE_ENV !== 'production') {
                callback(null, true);
            } else {
                callback(new Error('Not allowed by CORS'));
            }
        },
        credentials: true
    },
    // Mobile-friendly ping settings (generous timeouts for Android mobile networks)
    pingInterval: 25000,  // Ping every 25s (default - less aggressive, saves battery)
    pingTimeout: 30000,   // Wait 30s for pong (Android on mobile networks can be slow)
});

// Helper to parse cookies from string
const parseCookies = (cookieString) => {
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
};

// Socket.io authentication middleware
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

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select('-password');

        if (!user) {
            return next(new Error('User not found'));
        }

        socket.user = user;
        next();
    } catch (error) {
        next(new Error('Invalid token'));
    }
});

// Socket event rate limiter: tracks event counts per socket per event name
function createSocketRateLimiter() {
    // Returns middleware that checks per-event limits
    return (socket, next) => {
        const eventCounts = new Map(); // eventName -> { count, windowStart }
        const limits = {
            'driver:rejoin': { max: 5, windowMs: 10000 },    // 5 per 10s
            'user:locationUpdate': { max: 10, windowMs: 10000 }, // 10 per 10s
        };
        const defaultLimit = { max: 20, windowMs: 10000 }; // 20 per 10s for unlisted events

        const originalEmit = socket.onevent;
        socket.onevent = function (packet) {
            const eventName = packet.data?.[0];
            if (eventName && typeof eventName === 'string') {
                const limit = limits[eventName] || defaultLimit;
                const now = Date.now();
                let entry = eventCounts.get(eventName);
                if (!entry || now - entry.windowStart > limit.windowMs) {
                    entry = { count: 0, windowStart: now };
                    eventCounts.set(eventName, entry);
                }
                entry.count++;
                if (entry.count > limit.max) {
                    // Drop the event silently — don't crash the socket
                    return;
                }
            }
            originalEmit.call(socket, packet);
        };

        next();
    };
}

io.use(createSocketRateLimiter());

// Socket.io connection handling
// IMPORTANT: All socket.on() listeners MUST be registered synchronously (before any await)
// to avoid race conditions where the client sends events before handlers are set up.
const Driver = require('./models/driver.model');

io.on('connection', async (socket) => {
    if (process.env.NODE_ENV !== 'production') {
        console.log(`User connected: ${socket.user.role} - socket: ${socket.id}`);
    }

    const driverRoom = `driver:${socket.user.id}`;
    const userRoom = `user:${socket.user.id}`;

    // Join user to their personal room (always - this is the fallback for event delivery)
    socket.join(userRoom);

    // Join admins to admin room for real-time updates
    if (socket.user.role === 'admin') {
        socket.join('admin');
    }

    // Fast-path: if role is 'driver', join driver rooms immediately (no DB needed)
    if (socket.user.role === 'driver') {
        socket.join(driverRoom);
        socket.join('drivers:all');
        io.in(userRoom).socketsJoin(driverRoom);
    }

    // ── Register ALL event listeners synchronously (before any await) ──

    // Allow drivers to rejoin their room (e.g., after reconnection)
    // Rate-limited: max 1 rejoin with DB query per 10 seconds per socket.
    // Intermediate rejoins use the fast path (room join only, no DB query).
    let lastRejoinWithDb = 0;
    socket.on('driver:rejoin', async () => {
        const now = Date.now();

        // Fast path: always rejoin rooms (cheap, no DB)
        if (socket.user.role === 'driver') {
            socket.join(driverRoom);
            socket.join('drivers:all');
            io.in(userRoom).socketsJoin(driverRoom);
        }

        // Slow path: verify driver profile in DB (rate-limited)
        if (now - lastRejoinWithDb < 10000) {
            socket.emit('driver:rejoined', { success: true });
            return;
        }
        lastRejoinWithDb = now;

        try {
            const profile = await Driver.findOne({ user: socket.user.id, isActive: true, isApproved: true });
            if (socket.user.role === 'driver' || profile) {
                socket.join(driverRoom);
                socket.join('drivers:all');
                io.in(userRoom).socketsJoin(driverRoom);
            }
            // Always ACK to prevent client timeout loops
            socket.emit('driver:rejoined', { success: !!(socket.user.role === 'driver' || profile) });
        } catch (err) {
            console.error(`Error during driver:rejoin for user ${socket.user.id}:`, err.message);
            // Always ACK even on error to prevent client timeout loops
            socket.emit('driver:rejoined', { success: false, error: true });
        }
    });

    socket.on('disconnect', (reason) => {
        if (process.env.NODE_ENV !== 'production') {
            console.log(`User disconnected: socket ${socket.id}, reason: ${reason}`);
        }
    });

    // ── Async work: verify driver profile in DB (non-blocking) ──
    // This runs AFTER listeners are registered, so no events are missed.
    if (socket.user.role !== 'driver') {
        try {
            const driverProfile = await Driver.findOne({ user: socket.user.id, isActive: true, isApproved: true });
            if (driverProfile) {
                socket.join(driverRoom);
                socket.join('drivers:all');
                io.in(userRoom).socketsJoin(driverRoom);
            }
        } catch (err) {
            // DB lookup failed — role-based join already handled above
        }
    }
});

// Make io accessible to routes
app.set('io', io);

// Trust proxy for accurate IP-based rate limiting behind reverse proxy
app.set('trust proxy', 1);

// Security headers (HSTS, X-Content-Type-Options, X-Frame-Options, etc.)
app.use(helmet({
    contentSecurityPolicy: false, // API server — no HTML content to protect
    crossOriginEmbedderPolicy: false,
}));

// Response compression
app.use(compression());

// HTTP request logging
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// CORS — fails closed in production (only explicit origins allowed)
app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else if (process.env.NODE_ENV !== 'production') {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    exposedHeaders: ['set-cookie']
}));

// Global rate limiter: 200 req / 15 min per IP
app.use(globalLimiter);

// Body parsing with size limits (prevents payload bombs)
app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ extended: true, limit: '16kb' }));

// NoSQL injection prevention (must come after body parsing)
// Sanitize body, query, and params to block MongoDB $-operator injection
app.use((req, res, next) => {
    if (req.body) req.body = mongoSanitize.sanitize(req.body);
    if (req.params) req.params = mongoSanitize.sanitize(req.params);
    // Sanitize query params — strip any keys/values containing $ operators
    if (req.query && typeof req.query === 'object') {
        const clean = mongoSanitize.sanitize({ ...req.query });
        for (const key of Object.keys(req.query)) {
            if (clean[key] !== undefined) {
                req.query[key] = clean[key];
            }
        }
        // Remove keys that were stripped by sanitization
        for (const key of Object.keys(req.query)) {
            if (!(key in clean)) {
                delete req.query[key];
            }
        }
    }
    next();
});

app.use(cookieParser());
app.use(passport.initialize());

// Routes
app.use('/api/auth', authRouter);
app.use('/api/transfers', transferRouter);
app.use('/api/drivers', driverRouter);
app.use('/api/rides', rideRouter);
app.use('/api/maps', mapsRouter);
app.use('/api/notifications', notificationRouter);
app.use('/api', rentalRouter);
app.use('/api', tourRouter);

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'Server is running' });
});

// Handle undefined routes
app.all('*path', (req, res, next) => {
    next(new AppError(`Can't find ${req.originalUrl} on this server`, 404));
});

// Sentry error handler (must be before globalErrorHandler)
if (process.env.SENTRY_DSN) {
    Sentry.setupExpressErrorHandler(app);
}

// Global error handler
app.use(globalErrorHandler);

const PORT = process.env.PORT || 3000;

// Import the ride expiration functions
const { expireOldRides, expireWaitingRides } = require('./controllers/ride.controller');

// Schedule ride expiration check every minute
const EXPIRATION_CHECK_INTERVAL = 60 * 1000; // 1 minute
// Schedule waiting expiration check every 15 seconds (for 3-minute timeout accuracy)
const WAITING_CHECK_INTERVAL = 15 * 1000; // 15 seconds

// Track interval IDs for graceful shutdown cleanup
let expirationIntervalId = null;
let waitingIntervalId = null;

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);

    // Run initial expiration check on startup
    expireOldRides(io).then(result => {
        if (result.expired > 0) {
            console.log(`Expired ${result.expired} old ride requests on startup`);
        }
    });

    // Run initial waiting expiration check on startup
    expireWaitingRides(io).then(result => {
        if (result.cancelled > 0) {
            console.log(`Cancelled ${result.cancelled} rides due to waiting timeout on startup`);
        }
    });

    // Schedule periodic ride request expiration checks (1 hour timeout)
    expirationIntervalId = setInterval(() => {
        expireOldRides(io).then(result => {
            if (result.expired > 0) {
                console.log(`Expired ${result.expired} old ride requests`);
            }
        });
    }, EXPIRATION_CHECK_INTERVAL);

    // Schedule periodic waiting expiration checks (3-minute timeout)
    waitingIntervalId = setInterval(() => {
        expireWaitingRides(io).then(result => {
            if (result.cancelled > 0) {
                console.log(`Cancelled ${result.cancelled} rides due to waiting timeout`);
            }
        });
    }, WAITING_CHECK_INTERVAL);
});

// Graceful shutdown handler
let isShuttingDown = false;

function gracefulShutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`\n${signal} received. Starting graceful shutdown...`);

    // Stop accepting new connections
    server.close(() => {
        console.log('HTTP server closed');
    });

    // Clear scheduled intervals
    if (expirationIntervalId) clearInterval(expirationIntervalId);
    if (waitingIntervalId) clearInterval(waitingIntervalId);

    // Disconnect all sockets gracefully
    io.emit('server:shutdown', { message: 'Server is restarting' });
    io.close(() => {
        console.log('Socket.io server closed');
    });

    // Close MongoDB connection
    const mongoose = require('mongoose');
    mongoose.connection.close().then(() => {
        console.log('MongoDB connection closed');
        process.exit(0);
    }).catch((err) => {
        console.error('Error closing MongoDB connection:', err.message);
        process.exit(1);
    });

    // Force exit after 10s if graceful shutdown hangs
    setTimeout(() => {
        console.error('Graceful shutdown timed out, forcing exit');
        process.exit(1);
    }, 10000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = { app, io };
