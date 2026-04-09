'use strict';

/**
 * Unified Location Service — multi-provider geocoding with automatic fallback.
 *
 * Provider chain: Nominatim (free, primary) → Google (paid, fallback).
 * Each provider handles its own caching via the shared geocodingCache service.
 *
 * Usage:
 *   const locationService = require('./services/locationService');
 *   const results = await locationService.search('Rustaveli Ave');
 *   const reverse = await locationService.reverseGeocode(41.69, 44.80);
 */

const nominatim = require('./locationProviders/nominatim.provider');
const google = require('./locationProviders/google.provider');
const logger = require('../utils/logger');

// Ordered by priority — first provider that returns results wins
const providers = [nominatim, google];

// ── Provider health tracking (for monitoring/debugging) ──

const providerStats = {};

function recordOutcome(providerName, success, latencyMs) {
    if (!providerStats[providerName]) {
        providerStats[providerName] = { success: 0, failure: 0, totalMs: 0, calls: 0 };
    }
    const stats = providerStats[providerName];
    stats[success ? 'success' : 'failure']++;
    stats.totalMs += latencyMs;
    stats.calls++;
}

/**
 * Forward geocode with automatic provider fallback.
 * Tries each provider in priority order; returns first non-empty result.
 *
 * @param {string} query - Search text
 * @param {object} [options] - { countryCode, language, viewbox, limit }
 * @returns {Promise<Array>} Normalized location results
 */
async function search(query, options = {}) {
    for (const provider of providers) {
        const start = Date.now();
        try {
            const results = await provider.search(query, options);
            recordOutcome(provider.name, true, Date.now() - start);
            if (results && results.length > 0) return results;
        } catch (err) {
            recordOutcome(provider.name, false, Date.now() - start);
            logger.warn(`${provider.name} search failed, trying next provider`, 'locationService', err);
        }
    }
    return []; // all providers failed or returned empty
}

/**
 * Reverse geocode with automatic provider fallback.
 *
 * @param {number} lat
 * @param {number} lng
 * @param {object} [options] - { language }
 * @returns {Promise<object|null>} Normalized location result
 */
async function reverseGeocode(lat, lng, options = {}) {
    for (const provider of providers) {
        const start = Date.now();
        try {
            const result = await provider.reverseGeocode(lat, lng, options);
            recordOutcome(provider.name, true, Date.now() - start);
            if (result) return result;
        } catch (err) {
            recordOutcome(provider.name, false, Date.now() - start);
            logger.warn(`${provider.name} reverse geocode failed, trying next`, 'locationService', err);
        }
    }
    return null;
}

/**
 * Get provider health statistics (for admin/monitoring endpoints).
 */
function getProviderStats() {
    const result = {};
    for (const [name, stats] of Object.entries(providerStats)) {
        result[name] = {
            ...stats,
            avgLatencyMs: stats.calls > 0 ? Math.round(stats.totalMs / stats.calls) : 0,
            successRate: stats.calls > 0 ? Math.round((stats.success / stats.calls) * 1000) / 10 : 0,
        };
    }
    return result;
}

module.exports = { search, reverseGeocode, getProviderStats };
