const crypto = require('crypto');

/**
 * Attach a unique request ID to every incoming request.
 * The ID is available as req.id and returned in the X-Request-Id response header.
 * Clients can also send their own X-Request-Id header which will be preserved.
 */
function requestId(req, res, next) {
    const id = req.headers['x-request-id'] || crypto.randomUUID();
    req.id = id;
    res.setHeader('X-Request-Id', id);
    next();
}

module.exports = { requestId };
