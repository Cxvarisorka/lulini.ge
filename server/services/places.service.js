'use strict';

/**
 * Places Service — write-through + read-through facade over the Place model.
 *
 * All writes are fire-and-forget by convention — never block a request on a
 * Mongo upsert. Callers should treat upsertPlace().catch(noop) as standard.
 *
 * Read helpers return plain objects suitable for direct return as predictions.
 */

const Place = require('../models/place.model');
const logger = require('../utils/logger');

function normalize(s) {
    if (!s) return '';
    return s.trim().normalize('NFC').toLowerCase();
}

function isCoord(c) {
    return c && Number.isFinite(c.lat) && Number.isFinite(c.lng);
}

/**
 * Upsert a place by canonicalId. Increments usageCount + bumps lastUsedAt.
 * Returns the doc (unused by most callers — this is fire-and-forget).
 */
async function upsertPlace(input) {
    if (!input?.canonicalId || !isCoord(input.coords)) return null;

    const provider = input.provider
        || (input.canonicalId.startsWith('goog:') ? 'google'
            : input.canonicalId.startsWith('osm:') ? 'nominatim'
            : input.canonicalId.startsWith('manual:') ? 'manual'
            : null);
    if (!provider) return null;

    const address = input.address || '';
    return Place.findOneAndUpdate(
        { canonicalId: input.canonicalId },
        {
            $setOnInsert: {
                canonicalId: input.canonicalId,
                provider,
                createdAt: new Date(),
            },
            $set: {
                address,
                normalizedAddress: normalize(address),
                name: input.name || null,
                components: input.components || null,
                coords: { type: 'Point', coordinates: [input.coords.lng, input.coords.lat] },
                lastUsedAt: new Date(),
            },
            $inc: { usageCount: 1 },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
}

/**
 * Search by free-text query. Returns top N by usageCount among text matches.
 * Falls back to a regex prefix scan if Mongo's text index has no matches —
 * useful for short queries Mongo's stemmer collapses ("tbil" → no token hits).
 */
async function searchPlaces(query, limit = 4) {
    const q = normalize(query);
    if (!q || q.length < 3) return [];

    try {
        const textHits = await Place.find(
            { $text: { $search: q } },
            { score: { $meta: 'textScore' } }
        )
            .sort({ score: { $meta: 'textScore' }, usageCount: -1 })
            .limit(limit)
            .lean();

        if (textHits.length > 0) return textHits;

        // Prefix fallback (escape regex specials)
        const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return await Place.find({ normalizedAddress: { $regex: `^${safe}` } })
            .sort({ usageCount: -1 })
            .limit(limit)
            .lean();
    } catch (err) {
        logger.warn(`Place text search failed: ${err.message}`, 'places.service');
        return [];
    }
}

/**
 * Find by canonicalId (used by resolvePrediction to short-circuit Google).
 */
async function findByCanonicalId(canonicalId) {
    if (!canonicalId) return null;
    try {
        const doc = await Place.findOne({ canonicalId }).lean();
        if (!doc) return null;
        // Bump lastUsedAt + usageCount (fire-and-forget so reads stay fast).
        Place.updateOne(
            { canonicalId },
            { $inc: { usageCount: 1 }, $set: { lastUsedAt: new Date() } }
        ).catch(() => {});
        return doc;
    } catch (err) {
        logger.warn(`Place lookup failed: ${err.message}`, 'places.service');
        return null;
    }
}

/**
 * Geo-nearest popular places — used by the empty state of the search sheet
 * (zero API cost for the most common "where to today" clicks).
 */
async function nearbyPopular({ lat, lng, limit = 5, maxDistanceMeters = 5000 }) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
    try {
        return await Place.find({
            coords: {
                $near: {
                    $geometry: { type: 'Point', coordinates: [lng, lat] },
                    $maxDistance: maxDistanceMeters,
                },
            },
        })
            .sort({ usageCount: -1 })
            .limit(limit)
            .lean();
    } catch (err) {
        logger.warn(`Place nearby query failed: ${err.message}`, 'places.service');
        return [];
    }
}

/**
 * Adapter: turn a Place doc into the autocomplete prediction shape.
 */
function toPrediction(doc) {
    if (!doc) return null;
    const [mainText, ...rest] = (doc.address || '').split(',');
    return {
        placeId: doc.canonicalId,
        description: doc.address,
        mainText: (mainText || '').trim() || doc.address,
        secondaryText: rest.slice(0, 2).join(',').trim(),
        coords: doc.coords?.coordinates
            ? { lat: doc.coords.coordinates[1], lng: doc.coords.coordinates[0] }
            : null,
        provider: doc.provider,
        kind: 'known',
    };
}

/**
 * Adapter: turn a Place doc into the placeDetails shape (matches google.placeDetails).
 */
function toDetails(doc) {
    if (!doc) return null;
    return {
        coords: doc.coords?.coordinates
            ? { lat: doc.coords.coordinates[1], lng: doc.coords.coordinates[0] }
            : null,
        address: doc.address,
        name: doc.name || null,
        components: doc.components || null,
        canonicalId: doc.canonicalId,
        provider: doc.provider,
        types: [],
    };
}

module.exports = {
    upsertPlace,
    searchPlaces,
    findByCanonicalId,
    nearbyPopular,
    toPrediction,
    toDetails,
};
