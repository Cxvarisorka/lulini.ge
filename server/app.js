const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const helmet = require('helmet');
const morgan = require('morgan');
const mongoSanitize = require('express-mongo-sanitize');
const Sentry = require('@sentry/node');
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
const supportRouter = require('./routers/support.router');
const safetyRouter = require('./routers/safety.router');
const chatRouter = require('./routers/chat.router');
const favoritesRouter = require('./routers/favorites.router');
const receiptRouter = require('./routers/receipt.router');
const locationsRouter = require('./routers/locations.router');

const app = express();
const server = http.createServer(app);

// Connect to database
connectDB();

// Middleware
const allowedOrigins = process.env.NODE_ENV === 'production'
    ? ['https://lulini.ge', 'https://www.lulini.ge', 'https://api.lulini.ge']
    : ['http://localhost:5173', 'http://localhost:3000', 'https://lulini.ge', 'https://www.lulini.ge', 'https://api.lulini.ge', 'http://192.168.100.3:3000'];

// CORS origin checker — used by both Socket.io and Express CORS middleware.
// Allows null origin (mobile apps, curl, server-to-server) and explicit allowlist.
// NEVER allows arbitrary origins, even in development.
function checkOrigin(origin, callback) {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
    } else {
        callback(new Error('Not allowed by CORS'));
    }
}


// Socket.io setup with CORS
const io = new Server(server, {
    cors: {
        origin: checkOrigin,
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
    if (process.env.REDIS_URL) {
        const { createAdapter } = require('@socket.io/redis-adapter');
        const { getRedisClient } = require('./configs/redis.config');

        try {
            const { createSubscriberClient } = require('./configs/redis.config');
            const pubClient = await getRedisClient();
            const subClient = await createSubscriberClient('socketio-adapter');
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

// Request ID — unique ID per request for log correlation and debugging
const { requestId } = require('./middlewares/requestId.middleware');
app.use(requestId);

// Security headers (HSTS, X-Content-Type-Options, X-Frame-Options, etc.)
app.use(helmet({
    contentSecurityPolicy: false, // API server — no HTML content to protect
    crossOriginEmbedderPolicy: false,
}));

// Response compression
app.use(compression());

// HTTP request logging
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// CORS — fails closed in ALL environments (only explicit origins allowed)
app.use(cors({
    origin: checkOrigin,
    credentials: true,
    exposedHeaders: ['set-cookie']
}));

// Global rate limiter — per-IP cap that applies to every request that isn't
// already covered by a stricter per-route limiter. Driver location endpoints
// are exempted inside the limiter itself because they have their own limiter.
const { globalLimiter } = require('./middlewares/rateLimiter');
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

// CSRF protection — validates Origin header on cookie-authenticated state-changing requests.
// Mobile clients use Authorization header and are inherently CSRF-safe.
const { csrfProtection } = require('./middlewares/csrf.middleware');
app.use(csrfProtection);

// Routes — versioned API (v1)
// All routes are mounted under /api/v1/ with /api/ as backward-compatible alias.
// When v2 is needed, add new routers under /api/v2/ without breaking existing clients.
const v1Router = express.Router();
v1Router.use('/auth', authRouter);
v1Router.use('/drivers', driverRouter);
v1Router.use('/rides', rideRouter);
v1Router.use('/maps', mapsRouter);
v1Router.use('/notifications', notificationRouter);
v1Router.use('/settings', settingsRouter);
v1Router.use('/waitlist', waitlistRouter);
v1Router.use('/support', supportRouter);
v1Router.use('/safety', safetyRouter);
v1Router.use('/chat', chatRouter);
v1Router.use('/favorites', favoritesRouter);
v1Router.use('/receipts', receiptRouter);
v1Router.use('/locations', locationsRouter);

app.use('/api/v1', v1Router);
app.use('/api', v1Router); // Backward-compatible alias (clients can migrate to /api/v1 gradually)

// Health check (verifies DB connectivity for load balancer routing)
app.get('/health', async (req, res) => {
    const mongoose = require('mongoose');
    const checks = {};

    // MongoDB
    const dbState = mongoose.connection.readyState;
    checks.mongodb = dbState === 1 ? 'connected' : 'disconnected';

    // Redis (optional — only checked if configured)
    if (process.env.REDIS_URL) {
        try {
            const { getRedisClient } = require('./configs/redis.config');
            const redis = await getRedisClient();
            await redis.ping();
            checks.redis = 'connected';
        } catch {
            checks.redis = 'disconnected';
        }
    }

    // Memory usage
    const mem = process.memoryUsage();
    checks.memory = {
        heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
        rssMB: Math.round(mem.rss / 1024 / 1024),
    };

    // Socket.io connections
    if (io) {
        checks.sockets = io.engine ? io.engine.clientsCount : 0;
    }

    const isHealthy = checks.mongodb === 'connected'
        && (!process.env.REDIS_URL || checks.redis === 'connected');
    const status = isHealthy ? 'ok' : 'degraded';

    // Include feature flags in health check for ops visibility
    const { getAllFlags } = require('./utils/featureFlags');
    checks.featureFlags = getAllFlags();

    res.status(isHealthy ? 200 : 503).json({
        status,
        uptime: Math.floor(process.uptime()),
        checks,
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
const { expireOldRides, expireWaitingRides, expireAcceptedRides, broadcastScheduledRides } = require('./controllers/ride.controller');
const { startWatchdog } = require('./services/rideWatchdog.service');
const { runHardDeleteJob } = require('./jobs/hardDelete');

// Location optimization background jobs (Phase 3, 7)
const { flushToMongo, cleanupStaleDrivers } = require('./services/driverLocation.service');
const { cleanupRoutePoints } = require('./jobs/locationRetention.job');
const { isEnabled } = require('./utils/featureFlags');

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
let acceptedExpirationIntervalId = null;
let driverLocFlushIntervalId = null;
let staleDriverCleanupIntervalId = null;
let locationRetentionIntervalId = null;


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

            // Schedule periodic accepted ride expiration checks (10-minute timeout)
            // Runs every 30s for reasonable detection latency
            const ACCEPTED_CHECK_INTERVAL = 30 * 1000;
            expireAcceptedRides(io).then(result => {
                if (result.cancelled > 0) {
                    logger.info(`Cancelled ${result.cancelled} rides due to accepted timeout on startup`, 'scheduler');
                }
            });
            acceptedExpirationIntervalId = setInterval(() => {
                expireAcceptedRides(io).then(result => {
                    if (result.cancelled > 0) {
                        logger.info(`Cancelled ${result.cancelled} rides due to accepted timeout`, 'scheduler');
                    }
                });
            }, ACCEPTED_CHECK_INTERVAL);

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

            // ── Location optimization background jobs (Phase 3, 7) ──

            // Redis → MongoDB driver location sync (every 30s)
            // Only runs when FF_REDIS_DRIVER_LOCATIONS is enabled
            if (isEnabled('REDIS_DRIVER_LOCATIONS')) {
                const DRIVER_LOC_FLUSH_INTERVAL = 30 * 1000;
                driverLocFlushIntervalId = setInterval(() => {
                    flushToMongo().catch(err =>
                        logger.error('Driver location flush failed', 'driverLoc', err)
                    );
                }, DRIVER_LOC_FLUSH_INTERVAL);

                // Stale driver cleanup from Redis GEO (every 60s)
                const STALE_CLEANUP_INTERVAL = 60 * 1000;
                staleDriverCleanupIntervalId = setInterval(() => {
                    cleanupStaleDrivers().catch(err =>
                        logger.error('Stale driver cleanup failed', 'driverLoc', err)
                    );
                }, STALE_CLEANUP_INTERVAL);

                logger.info('Redis driver location background jobs enabled', 'driverLoc');
            }

            // routePoints retention cleanup (daily at startup, then every 24h)
            // Only runs when FF_LOCATION_RETENTION is enabled
            if (isEnabled('LOCATION_RETENTION')) {
                const LOCATION_RETENTION_INTERVAL = 24 * 60 * 60 * 1000;
                cleanupRoutePoints().catch(err =>
                    logger.error('Initial routePoints cleanup failed', 'locationRetention', err)
                );
                locationRetentionIntervalId = setInterval(() => {
                    cleanupRoutePoints().catch(err =>
                        logger.error('routePoints cleanup failed', 'locationRetention', err)
                    );
                }, LOCATION_RETENTION_INTERVAL);

                logger.info('Location retention cleanup job enabled', 'locationRetention');
            }
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
    if (acceptedExpirationIntervalId) clearInterval(acceptedExpirationIntervalId);
    if (scheduledRideIntervalId) clearInterval(scheduledRideIntervalId);
    if (hardDeleteIntervalId) clearInterval(hardDeleteIntervalId);
    if (driverLocFlushIntervalId) clearInterval(driverLocFlushIntervalId);
    if (staleDriverCleanupIntervalId) clearInterval(staleDriverCleanupIntervalId);
    if (locationRetentionIntervalId) clearInterval(locationRetentionIntervalId);

    // Final flush of driver locations to MongoDB before shutdown
    if (isEnabled('REDIS_DRIVER_LOCATIONS')) {
        flushToMongo().catch(() => {});
    }

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
    // Known @redis/client@5.11 decoder bug: #getTypeMapping accesses
    // #waitingForReply.head.value without null-checking head. When a pub/sub
    // push message arrives on an empty command queue the decoder throws a
    // TypeError. The decoder recovers on its own — don't crash the process.
    const isRedisDecoderBug =
        error instanceof TypeError &&
        error.message === "Cannot read properties of undefined (reading 'value')" &&
        error.stack && error.stack.includes('commands-queue');
    if (isRedisDecoderBug) {
        logger.error('Redis decoder bug (non-fatal, suppressed): ' + error.message, 'redis');
        return; // swallow — decoder state is recoverable
    }

    logger.error('Uncaught Exception', 'process', error);
    try {
        const Sentry = require('@sentry/node');
        Sentry.captureException(error);
    } catch (_) {}
    // Give Sentry time to flush, then exit
    setTimeout(() => process.exit(1), 2000).unref();
});

module.exports = { app, io };
