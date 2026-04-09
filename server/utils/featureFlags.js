'use strict';

/**
 * Feature flags for incremental rollout of location optimization upgrades.
 *
 * Flags are read from environment variables so they can be toggled per-deploy
 * without code changes. All flags default to OFF (false) for safety.
 *
 * Usage:
 *   const flags = require('./utils/featureFlags');
 *   if (flags.isEnabled('REDIS_DRIVER_LOCATIONS')) { ... }
 */

const FLAGS = {
    // Phase 3: Write driver locations to Redis GEO in addition to MongoDB
    REDIS_DRIVER_LOCATIONS: parseBool(process.env.FF_REDIS_DRIVER_LOCATIONS),

    // Phase 3: Read nearby drivers from Redis GEO instead of MongoDB $near
    REDIS_NEARBY_QUERY: parseBool(process.env.FF_REDIS_NEARBY_QUERY),

    // Phase 1.2 + 8: Use ETA-based dispatch ranking instead of broadcast
    ETA_DISPATCH: parseBool(process.env.FF_ETA_DISPATCH),

    // Phase 1.3: Cache geocoding results in Redis
    GEOCODING_CACHE: parseBool(process.env.FF_GEOCODING_CACHE),

    // Phase 1.4: Store canonical location references in Location collection
    CANONICAL_LOCATIONS: parseBool(process.env.FF_CANONICAL_LOCATIONS),

    // Phase 4: Snap pickup coordinates to nearest road after ride creation
    PICKUP_ROAD_SNAP: parseBool(process.env.FF_PICKUP_ROAD_SNAP),

    // Phase 7: Run routePoints retention cleanup job
    LOCATION_RETENTION: parseBool(process.env.FF_LOCATION_RETENTION),
};

function parseBool(value) {
    if (!value) return false;
    return value === '1' || value.toLowerCase() === 'true';
}

/**
 * Check if a feature flag is enabled.
 * @param {string} flagName - One of the keys in FLAGS
 * @returns {boolean}
 */
function isEnabled(flagName) {
    return FLAGS[flagName] === true;
}

/**
 * Get all flag states (for health/debug endpoints).
 */
function getAllFlags() {
    return { ...FLAGS };
}

module.exports = { isEnabled, getAllFlags, FLAGS };
