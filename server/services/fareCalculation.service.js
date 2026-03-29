/**
 * Fare Calculation Service
 *
 * Centralizes all fare-related logic: quote validation, pricing lookup,
 * waiting fee calculation, and commission computation.
 * Extracted from ride.controller.js for testability and reuse.
 */

const Settings = require('../models/settings.model');

/**
 * Haversine straight-line distance in km between two coordinates.
 */
function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Validate a client-submitted quote price against server-side pricing.
 *
 * @param {object} params
 * @param {object} params.pickup - { lat, lng }
 * @param {object} params.dropoff - { lat, lng }
 * @param {string} params.vehicleType
 * @param {number} params.clientPrice - Price submitted by the client
 * @param {object} params.pricingConfig - From Settings.getPricing()
 * @returns {{ valid: boolean, error?: string }}
 */
function validateQuotePrice({ pickup, dropoff, vehicleType, clientPrice, pricingConfig }) {
    if (clientPrice == null) return { valid: true };

    const price = parseFloat(clientPrice);
    if (isNaN(price) || price < 0) {
        return { valid: false, error: 'Invalid quote price' };
    }

    if (pickup.lat && pickup.lng && dropoff.lat && dropoff.lng) {
        const straightLineDist = haversineKm(pickup.lat, pickup.lng, dropoff.lat, dropoff.lng);
        const maxRoadDist = straightLineDist * 2.5;

        const catPricing = pricingConfig.categories?.[vehicleType] || pricingConfig.categories?.economy;
        const catBase = catPricing?.basePrice ?? 5;
        const catKm = catPricing?.kmPrice ?? 1.5;
        const minFare = Math.max(catBase * 0.5, 1);
        const maxFare = catBase + (maxRoadDist * catKm * 4);

        if (price < minFare) {
            return { valid: false, error: 'Quote price is below minimum fare' };
        }
        if (price > maxFare && price > 100) {
            return { valid: false, error: 'Quote price is unreasonably high for this distance' };
        }
    }

    return { valid: true };
}

/**
 * Calculate platform commission for a given fare.
 *
 * @param {number} fare - Total fare amount
 * @param {number} commissionPercent - Commission percentage (0-100)
 * @returns {{ commission: number, driverEarnings: number }}
 */
function calculateCommission(fare, commissionPercent) {
    const commission = Math.round(fare * (commissionPercent / 100) * 100) / 100;
    const driverEarnings = Math.round((fare - commission) * 100) / 100;
    return { commission, driverEarnings };
}

/**
 * Calculate waiting fee based on time since driver arrival.
 *
 * Policy: 1 free minute, then 0.50 GEL/min, max 2 additional minutes.
 *
 * @param {Date} arrivalTime - When driver arrived
 * @param {Date} startTime - When ride started
 * @returns {number} Waiting fee in GEL
 */
function calculateWaitingFee(arrivalTime, startTime) {
    if (!arrivalTime || !startTime) return 0;

    const waitMinutes = (startTime - arrivalTime) / 60000;
    const chargeableMinutes = Math.max(0, Math.min(waitMinutes - 1, 2)); // 1 free, max 2 extra
    return Math.round(chargeableMinutes * 0.5 * 100) / 100;
}

/**
 * Validate driver-submitted fare against the server quote.
 * Must be within 15% of quoted price.
 *
 * @param {number} submittedFare
 * @param {number} quotedPrice
 * @returns {{ valid: boolean, error?: string }}
 */
function validateFinalFare(submittedFare, quotedPrice) {
    if (submittedFare == null || !quotedPrice || quotedPrice <= 0) {
        return { valid: true };
    }

    const maxAllowed = quotedPrice * 1.15;
    const minAllowed = quotedPrice * 0.85;

    if (submittedFare < minAllowed || submittedFare > maxAllowed) {
        return {
            valid: false,
            error: `Fare (${submittedFare}) must be within 15% of quoted price (${quotedPrice}). Allowed: ${minAllowed.toFixed(2)} - ${maxAllowed.toFixed(2)}`
        };
    }

    return { valid: true };
}

/**
 * Get pricing configuration with caching (pricing changes are rare).
 */
let _pricingCache = null;
let _pricingCacheTime = 0;
const PRICING_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getPricingCached() {
    if (_pricingCache && Date.now() - _pricingCacheTime < PRICING_CACHE_TTL) {
        return _pricingCache;
    }
    _pricingCache = await Settings.getPricing();
    _pricingCacheTime = Date.now();
    return _pricingCache;
}

module.exports = {
    haversineKm,
    validateQuotePrice,
    calculateCommission,
    calculateWaitingFee,
    validateFinalFare,
    getPricingCached,
};
