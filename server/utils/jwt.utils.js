const jwt = require('jsonwebtoken');

const JWT_OPTIONS = {
    issuer: 'lulini',
    audience: 'lulini-api',
};

const generateToken = (userId) => {
    return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN || '7d',
        ...JWT_OPTIONS,
    });
};

const verifyToken = (token) => {
    try {
        return jwt.verify(token, process.env.JWT_SECRET, JWT_OPTIONS);
    } catch (err) {
        // Graceful migration: accept tokens without iss/aud from before this change
        if (err.message === 'jwt issuer invalid' || err.message === 'jwt audience invalid') {
            try {
                return jwt.verify(token, process.env.JWT_SECRET);
            } catch {
                return null;
            }
        }
        return null;
    }
};

module.exports = { generateToken, verifyToken };
