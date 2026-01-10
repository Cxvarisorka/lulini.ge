const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const passport = require('passport');
require('dotenv').config();

const connectDB = require('./configs/db.config');
require('./configs/passport.config');
const globalErrorHandler = require('./middlewares/error.middleware');
const AppError = require('./utils/AppError');

// Routers
const authRouter = require('./routers/auth.router');

const app = express();

// Connect to database
connectDB();

// Middleware
const allowedOrigins = ['http://localhost:5173', 'https://gotours.ge'];
app.use(cors({
    origin: allowedOrigins,
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(passport.initialize());

// Routes
app.use('/api/auth', authRouter);

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

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

module.exports = app;
