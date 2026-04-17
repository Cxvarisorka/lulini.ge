'use strict';

/**
 * Pricing Service — fare calculation and quote validation.
 *
 * Pure function layer over routing.service output. No direct external calls.
 * Wraps the existing fareCalculation.service logic with a single entry point
 * that takes a route result (from routing.service.getRoute) and a vehicle type.
 *
 * Contract:
 *   quote({ route, vehicleType, waitingMinutes?, surge? }) →
 *     { fare, breakdown: { base, perKm, waiting, surge }, commission, driverEarnings }
 */

const Settings = require('../models/settings.model');

const PRICING_CACHE_TTL_MS = 5 * 60 * 1000;
let _pricingCache = null;
let _pricingCacheAt = 0;

async function getPricing() {
    if (_pricingCache && Date.now() - _pricingCacheAt < PRICING_CACHE_TTL_MS) {
        return _pricingCache;
    }
    _pricingCache = await Settings.getPricing();
    _pricingCacheAt = Date.now();
    return _pricingCache;
}

function roundMoney(n) {
    return Math.round(n * 100) / 100;
}

/**
 * Compute a fare from an authoritative route result.
 *
 * @param {object} params
 * @param {object} params.route         - { distanceMeters, durationSeconds } from routing.service
 * @param {string} params.vehicleType   - 'economy' | 'comfort' | 'business'
 * @param {number} [params.waitingMinutes=0]
 * @param {number} [params.surgeMultiplier=1]
 */
async function quote({ route, vehicleType = 'economy', waitingMinutes = 0, surgeMultiplier = 1 }) {
    if (!route || typeof route.distanceMeters !== 'number') {
        throw new Error('route.distanceMeters is required');
    }

    const cfg = await getPricing();
    const cat = cfg.categories?.[vehicleType] || cfg.categories?.economy || {};
    const basePrice = cat.basePrice ?? 5;
    const kmPrice   = cat.kmPrice   ?? 1.5;
    const minFare   = cat.minFare   ?? Math.max(basePrice * 0.5, 1);

    const distanceKm = route.distanceMeters / 1000;

    const base    = roundMoney(basePrice);
    const perKm   = roundMoney(distanceKm * kmPrice);
    const waiting = roundMoney(calculateWaitingFee(waitingMinutes));

    const subtotal = base + perKm + waiting;
    const surge    = roundMoney(subtotal * (surgeMultiplier - 1));
    let fare       = roundMoney(subtotal + surge);

    if (fare < minFare) fare = roundMoney(minFare);

    const commissionPct = cfg.commissionPercent ?? 15;
    const commission    = roundMoney(fare * (commissionPct / 100));
    const driverEarnings = roundMoney(fare - commission);

    return {
        fare,
        breakdown: { base, perKm, waiting, surge },
        commission,
        driverEarnings,
        distanceKm: roundMoney(distanceKm),
        durationMinutes: Math.round((route.durationSeconds || 0) / 60),
        vehicleType,
    };
}

/**
 * Waiting fee policy: 1 free minute, then 0.50 GEL/min, capped at +2 minutes.
 */
function calculateWaitingFee(waitingMinutes) {
    if (!waitingMinutes || waitingMinutes <= 0) return 0;
    const chargeable = Math.max(0, Math.min(waitingMinutes - 1, 2));
    return chargeable * 0.5;
}

/**
 * Validate a client-submitted quote against server pricing.
 * Kept for transition: controllers currently call this synchronously.
 */
async function validateClientQuote({ route, vehicleType, clientPrice }) {
    if (clientPrice == null) return { valid: true };

    const price = parseFloat(clientPrice);
    if (isNaN(price) || price < 0) return { valid: false, error: 'Invalid quote price' };

    const server = await quote({ route, vehicleType });
    const tolerance = 0.15;
    const min = server.fare * (1 - tolerance);
    const max = server.fare * (1 + tolerance);

    if (price < min || price > max) {
        return {
            valid: false,
            error: `Quote ${price} outside allowed range ${min.toFixed(2)}–${max.toFixed(2)} (server ${server.fare})`,
        };
    }
    return { valid: true, serverFare: server.fare };
}

/**
 * Validate driver's final submitted fare vs the quoted price.
 */
function validateFinalFare(submittedFare, quotedPrice) {
    if (submittedFare == null || !quotedPrice || quotedPrice <= 0) return { valid: true };
    const min = quotedPrice * 0.85;
    const max = quotedPrice * 1.15;
    if (submittedFare < min || submittedFare > max) {
        return {
            valid: false,
            error: `Fare ${submittedFare} must be within 15% of quoted ${quotedPrice} (${min.toFixed(2)}–${max.toFixed(2)})`,
        };
    }
    return { valid: true };
}

function calculateCommission(fare, commissionPercent) {
    const commission = roundMoney(fare * (commissionPercent / 100));
    return { commission, driverEarnings: roundMoney(fare - commission) };
}

module.exports = {
    quote,
    validateClientQuote,
    validateFinalFare,
    calculateCommission,
    calculateWaitingFee,
    getPricing,
};
