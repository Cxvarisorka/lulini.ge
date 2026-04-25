'use strict';

/**
 * Place model — persistent cache for autocomplete-resolved places.
 *
 * Purpose: short-circuit repeated queries for the same destination across users
 * without paying Google. This is the WARM cache layer behind Redis (HOT) and
 * in front of Nominatim/Google (COLD). Hits here are FREE and survive Redis
 * flushes, restarts, and TTL expiry.
 *
 * Write paths (fire-and-forget):
 *   1. autocomplete.service.resolvePrediction → on Google details success
 *   2. ride.controller.createRide → upsert pickup + dropoff
 *
 * Read paths:
 *   1. autocomplete.service.getPredictions → text search for top results
 *   2. autocomplete.service.resolvePrediction → by canonicalId
 *   3. /api/locations/nearby-popular → 2dsphere $near
 */

const mongoose = require('mongoose');

const placeSchema = new mongoose.Schema({
    canonicalId:       { type: String, required: true, unique: true },
    provider:          { type: String, enum: ['google', 'nominatim', 'manual'], required: true },
    address:           { type: String, required: true },
    // Normalized form for text search — NFC + lowercase, trimmed.
    normalizedAddress: { type: String, required: true },
    name:              { type: String, default: null },
    components:        { type: Object, default: null },
    coords: {
        type:        { type: String, enum: ['Point'], default: 'Point' },
        coordinates: { type: [Number], required: true }, // [lng, lat]
    },
    usageCount:  { type: Number, default: 1 },
    lastUsedAt:  { type: Date, default: Date.now },
    createdAt:   { type: Date, default: Date.now },
    verifiedAt:  { type: Date, default: null },
}, { versionKey: false });

// canonicalId index already created by `unique: true`
placeSchema.index({ normalizedAddress: 'text' });
placeSchema.index({ coords: '2dsphere' });
placeSchema.index({ usageCount: -1, lastUsedAt: -1 });

const Place = mongoose.model('Place', placeSchema);

module.exports = Place;
