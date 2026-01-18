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
    }
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
    console.log(`User connected: ${socket.user.email} (${socket.user.role})`);

    // Join user to their personal room
    socket.join(`user:${socket.user.id}`);

    // Join admins to admin room for real-time updates
    if (socket.user.role === 'admin') {
        socket.join('admin');
        console.log(`Admin ${socket.user.email} joined admin room`);
    }

    // Join drivers to driver room for ride requests
    // Check both role and driver profile
    const Driver = require('./models/driver.model');
    const driverProfile = await Driver.findOne({ user: socket.user.id, isActive: true, isApproved: true });

    if (socket.user.role === 'driver' || driverProfile) {
        socket.join(`driver:${socket.user.id}`);
        console.log(`Driver ${socket.user.email} joined driver room driver:${socket.user.id}`);
    }

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.user.email}`);
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

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

module.exports = { app, io };
