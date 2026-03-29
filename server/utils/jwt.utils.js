const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const JWT_OPTIONS = {
    issuer: 'lulini',
    audience: 'lulini-api',
};

const generateToken = (userId) => {
    return jwt.sign(
        { id: userId, jti: crypto.randomUUID() },
        process.env.JWT_SECRET,
        {
            expiresIn: process.env.JWT_EXPIRES_IN || '7d',
            ...JWT_OPTIONS,
        }
    );
};

const verifyToken = (token) => {
    try {
        return jwt.verify(token, process.env.JWT_SECRET, JWT_OPTIONS);
    } catch {
        return null;
    }
};

/**
 * Decode a token without verification (for extracting jti/exp on logout).
 */
const decodeToken = (token) => {
    try {
        return jwt.decode(token);
    } catch {
        return null;
    }
};

module.exports = { generateToken, verifyToken, decodeToken };
