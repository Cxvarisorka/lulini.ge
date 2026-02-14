const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const passport = require('passport');
const jwt = require('jsonwebtoken');
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
require('dotenv').config();

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

const app = express();
const server = http.createServer(app);

// Connect to database
connectDB();

// Middleware
const allowedOrigins = [
    'http://localhost:5173',
    'https://gotours.ge',
    'https://www.gotours.ge',
    'https://api.gotours.ge',
    'http://192.168.100.3:3000'
];

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

// Socket.io connection handling
io.on('connection', async (socket) => {
    console.log(`User connected: ${socket.user.email} (${socket.user.role}) - socket: ${socket.id}`);

    // Join user to their personal room (always - this is the fallback for event delivery)
    socket.join(`user:${socket.user.id}`);

    // Join admins to admin room for real-time updates
    if (socket.user.role === 'admin') {
        socket.join('admin');
        console.log(`Admin ${socket.user.email} joined admin room`);
    }

    // Join drivers to driver room for ride requests
    const Driver = require('./models/driver.model');
    try {
        const driverProfile = await Driver.findOne({ user: socket.user.id, isActive: true, isApproved: true });

        if (socket.user.role === 'driver' || driverProfile) {
            const driverRoom = `driver:${socket.user.id}`;
            const userRoom = `user:${socket.user.id}`;
            socket.join(driverRoom);
            // Ensure ALL sockets for this user are in the driver room
            // This handles Android edge cases where transport upgrade loses room membership
            io.in(userRoom).socketsJoin(driverRoom);
            console.log(`Driver ${socket.user.email} joined driver room ${driverRoom} (socket: ${socket.id})`);
        }
    } catch (err) {
        // If DB lookup fails, still try to join by role so driver doesn't miss events
        console.error(`Error looking up driver profile for ${socket.user.email}:`, err.message);
        if (socket.user.role === 'driver') {
            const driverRoom = `driver:${socket.user.id}`;
            const userRoom = `user:${socket.user.id}`;
            socket.join(driverRoom);
            io.in(userRoom).socketsJoin(driverRoom);
            console.log(`Driver ${socket.user.email} joined driver room by role fallback`);
        }
    }

    // Allow drivers to rejoin their room (e.g., after reconnection)
    socket.on('driver:rejoin', async () => {
        try {
            const profile = await Driver.findOne({ user: socket.user.id, isActive: true, isApproved: true });
            if (socket.user.role === 'driver' || profile) {
                const driverRoom = `driver:${socket.user.id}`;
                const userRoom = `user:${socket.user.id}`;
                socket.join(driverRoom);
                // Ensure ALL sockets for this user are in the driver room
                io.in(userRoom).socketsJoin(driverRoom);
                console.log(`Driver ${socket.user.email} rejoined driver room ${driverRoom}`);
                socket.emit('driver:rejoined', { success: true });
            }
        } catch (err) {
            console.error(`Error during driver:rejoin for ${socket.user.email}:`, err.message);
            if (socket.user.role === 'driver') {
                const driverRoom = `driver:${socket.user.id}`;
                const userRoom = `user:${socket.user.id}`;
                socket.join(driverRoom);
                io.in(userRoom).socketsJoin(driverRoom);
                socket.emit('driver:rejoined', { success: true });
            }
        }
    });

    socket.on('disconnect', (reason) => {
        console.log(`User disconnected: ${socket.user.email} (socket: ${socket.id}, reason: ${reason})`);
    });
});

// Make io accessible to routes
app.set('io', io);

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (mobile apps, Postman, etc.)
        if (!origin) return callback(null, true);

        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else if (process.env.NODE_ENV !== 'production') {
            // In development, allow all origins
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    // Expose headers needed for mobile cookie handling
    exposedHeaders: ['set-cookie']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(passport.initialize());

// Routes
app.use('/api/auth', authRouter);
app.use('/api/transfers', transferRouter);
app.use('/api/drivers', driverRouter);
app.use('/api/rides', rideRouter);
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

// Global error handler
app.use(globalErrorHandler);

const PORT = process.env.PORT || 3000;

// Import the ride expiration functions
const { expireOldRides, expireWaitingRides } = require('./controllers/ride.controller');

// Schedule ride expiration check every minute
const EXPIRATION_CHECK_INTERVAL = 60 * 1000; // 1 minute
// Schedule waiting expiration check every 15 seconds (for 3-minute timeout accuracy)
const WAITING_CHECK_INTERVAL = 15 * 1000; // 15 seconds

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
    setInterval(() => {
        expireOldRides(io).then(result => {
            if (result.expired > 0) {
                console.log(`Expired ${result.expired} old ride requests`);
            }
        });
    }, EXPIRATION_CHECK_INTERVAL);

    // Schedule periodic waiting expiration checks (3-minute timeout)
    setInterval(() => {
        expireWaitingRides(io).then(result => {
            if (result.cancelled > 0) {
                console.log(`Cancelled ${result.cancelled} rides due to waiting timeout`);
            }
        });
    }, WAITING_CHECK_INTERVAL);
});

module.exports = { app, io };
