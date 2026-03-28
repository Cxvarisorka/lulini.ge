const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const passport = require('passport');
const compression = require('compression');
const helmet = require('helmet');
const morgan = require('morgan');
const mongoSanitize = require('express-mongo-sanitize');
const Sentry = require('@sentry/node');
const { globalLimiter } = require('./middlewares/rateLimiter');
require('dotenv').config();

// ── 1. Validate environment variables FIRST — before any other initialisation.
//       Exits the process immediately if required vars are missing.
const { validateEnv } = require('./utils/validateEnv');
validateEnv();

// ── 2. Structured logger — replaces scattered console.* calls.
const logger = require('./utils/logger');

// Sentry error tracking (must init before other middleware)
if (process.env.SENTRY_DSN) {
    Sentry.init({
        dsn: process.env.SENTRY_DSN,
        environment: process.env.NODE_ENV || 'development',
        tracesSampleRate: 0.1,
    });
}

const connectDB = require('./configs/db.config');
require('./configs/passport.config');
const globalErrorHandler = require('./middlewares/error.middleware');
const AppError = require('./utils/AppError');

// Routers
const authRouter = require('./routers/auth.router');
const driverRouter = require('./routers/driver.router');
const rideRouter = require('./routers/ride.router');
const mapsRouter = require('./routers/maps.router');
const notificationRouter = require('./routers/notification.router');
const settingsRouter = require('./routers/settings.router');
const waitlistRouter = require('./routers/waitlist.router');
const paymentRouter = require('./routers/payment.router');
const supportRouter = require('./routers/support.router');
const safetyRouter = require('./routers/safety.router');
const chatRouter = require('./routers/chat.router');
const favoritesRouter = require('./routers/favorites.router');
const receiptRouter = require('./routers/receipt.router');

const app = express();
const server = http.createServer(app);

// Connect to database
connectDB();

// Middleware
const allowedOrigins = process.env.NODE_ENV === 'production'
    ? ['https://lulini.ge', 'https://www.lulini.ge']
    : ['http://localhost:5173', 'https://lulini.ge', 'https://www.lulini.ge', 'https://api.lulini.ge', 'http://192.168.100.3:3000'];

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

// ── Socket.IO initialization ──
// Redis adapter setup is awaited BEFORE server.listen() to prevent split-brain
// where early connections use the in-memory adapter while Redis is still connecting.
const initSocket = require('./socket');

async function setupRedisAdapter() {
    if (process.env.REDIS_URL && process.env.NODE_ENV === 'production') {
        const { createAdapter } = require('@socket.io/redis-adapter');
        const { getRedisClient } = require('./configs/redis.config');

        try {
            const pubClient = await getRedisClient();
            const subClient = pubClient.duplicate();
            await subClient.connect();
            io.adapter(createAdapter(pubClient, subClient));
            logger.info('Socket.io Redis adapter enabled', 'redis');
        } catch (err) {
            logger.error('Redis adapter setup failed, running in single-process mode', 'redis', err);
        }
    }
}

// Make io accessible to routes (handlers registered in startServer after Redis adapter)
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

// Capture raw body for BOG callback signature verification
app.use('/api/payments/callback', express.json({
    limit: '16kb',
    verify: (req, _res, buf) => { req.rawBody = buf.toString(); }
}));

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
app.use('/api/drivers', driverRouter);
app.use('/api/rides', rideRouter);
app.use('/api/maps', mapsRouter);
app.use('/api/notifications', notificationRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/waitlist', waitlistRouter);
app.use('/api/payments', paymentRouter);
app.use('/api/support', supportRouter);
app.use('/api/safety', safetyRouter);
app.use('/api/chat', chatRouter);
app.use('/api/favorites', favoritesRouter);
app.use('/api/receipts', receiptRouter);

// Health check (verifies DB connectivity for load balancer routing)
app.get('/health', (req, res) => {
    const mongoose = require('mongoose');
    const dbState = mongoose.connection.readyState; // 0=disconnected, 1=connected, 2=connecting, 3=disconnecting
    const isDbHealthy = dbState === 1;

    const status = isDbHealthy ? 'ok' : 'degraded';
    const httpStatus = isDbHealthy ? 200 : 503;

    res.status(httpStatus).json({
        status,
        db: isDbHealthy ? 'connected' : 'disconnected',
        uptime: Math.floor(process.uptime()),
    });
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
const { expireOldRides, expireWaitingRides, broadcastScheduledRides } = require('./controllers/ride.controller');
const { startWatchdog } = require('./services/rideWatchdog.service');
const { runHardDeleteJob } = require('./jobs/hardDelete');

// Schedule ride expiration check every minute
const EXPIRATION_CHECK_INTERVAL = 60 * 1000; // 1 minute
// Schedule waiting expiration check every 15 seconds (for 3-minute timeout accuracy)
const WAITING_CHECK_INTERVAL = 15 * 1000; // 15 seconds
// Check for scheduled rides ready to broadcast every minute
const SCHEDULED_RIDE_CHECK_INTERVAL = 60 * 1000; // 1 minute

// Track interval IDs for graceful shutdown cleanup
let expirationIntervalId = null;
let waitingIntervalId = null;
let scheduledRideIntervalId = null;
let hardDeleteIntervalId = null;


// In PM2 cluster mode, only run background jobs on instance 0 to avoid duplicate work.
// When using the separate worker.js process, set DISABLE_BACKGROUND_JOBS=true.
const isPrimaryWorker = !process.env.NODE_APP_INSTANCE || process.env.NODE_APP_INSTANCE === '0';
const backgroundJobsEnabled = isPrimaryWorker && !process.env.DISABLE_BACKGROUND_JOBS;

// ── Startup sequence ──
// Await Redis adapter setup BEFORE server.listen() to prevent split-brain.
// Early connections would otherwise use the in-memory adapter while Redis is still connecting.
async function startServer() {
    await setupRedisAdapter();

    // Register socket middleware and handlers AFTER Redis adapter is ready
    // to prevent split-brain where early connections use the in-memory adapter.
    initSocket(io);

    server.listen(PORT, () => {
        logger.info(
            `Server is running on port ${PORT}${process.env.NODE_APP_INSTANCE ? ` (instance ${process.env.NODE_APP_INSTANCE})` : ''}`,
            'startup'
        );

        if (backgroundJobsEnabled) {
            // Run initial expiration check on startup
            expireOldRides(io).then(result => {
                if (result.expired > 0) {
                    logger.info(`Expired ${result.expired} old ride requests on startup`, 'scheduler');
                }
            });

            // Run initial waiting expiration check on startup
            expireWaitingRides(io).then(result => {
                if (result.cancelled > 0) {
                    logger.info(`Cancelled ${result.cancelled} rides due to waiting timeout on startup`, 'scheduler');
                }
            });

            // Schedule periodic ride request expiration checks (1 hour timeout)
            expirationIntervalId = setInterval(() => {
                expireOldRides(io).then(result => {
                    if (result.expired > 0) {
                        logger.info(`Expired ${result.expired} old ride requests`, 'scheduler');
                    }
                });
            }, EXPIRATION_CHECK_INTERVAL);

            // Schedule periodic waiting expiration checks (3-minute timeout)
            waitingIntervalId = setInterval(() => {
                expireWaitingRides(io).then(result => {
                    if (result.cancelled > 0) {
                        logger.info(`Cancelled ${result.cancelled} rides due to waiting timeout`, 'scheduler');
                    }
                });
            }, WAITING_CHECK_INTERVAL);

            // Broadcast scheduled rides approaching their start time (every minute)
            broadcastScheduledRides(io).catch(() => {});
            scheduledRideIntervalId = setInterval(() => {
                broadcastScheduledRides(io).catch(() => {});
            }, SCHEDULED_RIDE_CHECK_INTERVAL);

            // Start ride tracking watchdog (30s interval — detects stale driver locations)
            startWatchdog(io);

            // Hard-delete accounts whose 30-day grace period has elapsed (daily)
            const HARD_DELETE_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
            runHardDeleteJob().then(result => {
                if (result.deleted > 0 || result.errors > 0) {
                    logger.info(`Startup run: deleted=${result.deleted}, errors=${result.errors}`, 'hardDelete');
                }
            }).catch(err => logger.error('Startup run failed', 'hardDelete', err));
            hardDeleteIntervalId = setInterval(() => {
                runHardDeleteJob().then(result => {
                    if (result.deleted > 0 || result.errors > 0) {
                        logger.info(`Daily run: deleted=${result.deleted}, errors=${result.errors}`, 'hardDelete');
                    }
                }).catch(err => logger.error('Daily run failed', 'hardDelete', err));
            }, HARD_DELETE_INTERVAL);
        }
    });
}

startServer().catch(err => {
    logger.error('Failed to start server', 'startup', err);
    process.exit(1);
});

// Graceful shutdown handler
let isShuttingDown = false;

function gracefulShutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info(`${signal} received. Starting graceful shutdown...`, 'shutdown');

    // Stop accepting new connections
    server.close(() => {
        logger.info('HTTP server closed', 'shutdown');
    });

    // Clear scheduled intervals
    if (expirationIntervalId) clearInterval(expirationIntervalId);
    if (waitingIntervalId) clearInterval(waitingIntervalId);
    if (scheduledRideIntervalId) clearInterval(scheduledRideIntervalId);
    if (hardDeleteIntervalId) clearInterval(hardDeleteIntervalId);

    // Disconnect all sockets gracefully
    io.emit('server:shutdown', { message: 'Server is restarting' });
    io.close(() => {
        logger.info('Socket.io server closed', 'shutdown');
    });

    // Close MongoDB connection
    const mongoose = require('mongoose');
    mongoose.connection.close().then(() => {
        logger.info('MongoDB connection closed', 'shutdown');
        process.exit(0);
    }).catch((err) => {
        logger.error('Error closing MongoDB connection', 'shutdown', err);
        process.exit(1);
    });

    // Force exit after 10s if graceful shutdown hangs
    setTimeout(() => {
        logger.error('Graceful shutdown timed out, forcing exit', 'shutdown');
        process.exit(1);
    }, 10000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Catch unhandled promise rejections and uncaught exceptions
process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled Rejection', 'process', reason);
    try {
        const Sentry = require('@sentry/node');
        Sentry.captureException(reason);
    } catch (_) {}
});

process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception', 'process', error);
    try {
        const Sentry = require('@sentry/node');
        Sentry.captureException(error);
    } catch (_) {}
    // Give Sentry time to flush, then exit
    setTimeout(() => process.exit(1), 2000).unref();
});

module.exports = { app, io };
