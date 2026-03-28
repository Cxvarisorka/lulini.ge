'use strict';

/**
 * Structured console logger.
 *
 * Design goals:
 *   - Zero new dependencies — built on top of Node's console methods.
 *   - Consistent format: ISO timestamp + severity level + optional context tag.
 *   - debug() is suppressed in production to keep logs clean.
 *   - Each method accepts an optional `context` string (e.g. 'scheduler',
 *     'socket', 'auth') that is printed as a bracketed prefix so log lines are
 *     easily grep-able.
 *
 * Usage:
 *   const logger = require('./utils/logger');
 *
 *   logger.info('Server started', 'startup');
 *   logger.warn('Redis not configured', 'redis');
 *   logger.error('DB connection failed', 'database', err);
 *   logger.debug('Socket handshake', 'socket', { userId: '...' });
 *
 * Output format (production):
 *   2026-03-27T10:23:45.123Z [INFO ] [startup] Server started
 *   2026-03-27T10:23:45.456Z [WARN ] [redis] Redis not configured
 *   2026-03-27T10:23:45.789Z [ERROR] [database] DB connection failed
 *
 * Output format (development — same, but debug lines also appear):
 *   2026-03-27T10:23:45.000Z [DEBUG] [socket] Socket handshake { userId: '...' }
 */

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

/**
 * Format a single log line.
 *
 * @param {string} level   - 'INFO', 'WARN', 'ERROR', 'DEBUG'
 * @param {string} message - Human-readable message string.
 * @param {string} [ctx]   - Optional context/subsystem label (e.g. 'auth').
 * @param {*}      [extra] - Optional extra data (object, Error, etc.).
 * @returns {string}
 */
function format(level, message, ctx, extra) {
    const ts = new Date().toISOString();
    const lvl = level.padEnd(5); // Align 5-char field: INFO , WARN , ERROR, DEBUG
    const prefix = ctx ? `[${ctx}] ` : '';
    let line = `${ts} [${lvl}] ${prefix}${message}`;

    if (extra !== undefined && extra !== null) {
        if (extra instanceof Error) {
            line += `\n  ${extra.stack || extra.message}`;
        } else if (typeof extra === 'object') {
            try {
                line += `  ${JSON.stringify(extra)}`;
            } catch {
                line += `  [unserializable object]`;
            }
        } else {
            line += `  ${extra}`;
        }
    }

    return line;
}

const logger = {
    /**
     * Informational messages — normal operational events.
     * Maps to console.log (stdout).
     *
     * @param {string} message
     * @param {string} [context]
     * @param {*}      [extra]
     */
    info(message, context, extra) {
        console.log(format('INFO', message, context, extra));
    },

    /**
     * Warning messages — something is unexpected but the server can continue.
     * Maps to console.warn (stderr).
     *
     * @param {string} message
     * @param {string} [context]
     * @param {*}      [extra]
     */
    warn(message, context, extra) {
        console.warn(format('WARN', message, context, extra));
    },

    /**
     * Error messages — an operation failed; investigate immediately.
     * Maps to console.error (stderr).
     *
     * @param {string} message
     * @param {string} [context]
     * @param {*}      [extra]   - Typically an Error instance.
     */
    error(message, context, extra) {
        console.error(format('ERROR', message, context, extra));
    },

    /**
     * Debug messages — verbose, only emitted outside production.
     * Suppressed entirely when NODE_ENV=production.
     * Maps to console.debug (stdout).
     *
     * @param {string} message
     * @param {string} [context]
     * @param {*}      [extra]
     */
    debug(message, context, extra) {
        if (IS_PRODUCTION) return;
        console.debug(format('DEBUG', message, context, extra));
    },
};

module.exports = logger;
