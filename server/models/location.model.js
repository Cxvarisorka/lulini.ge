const mongoose = require('mongoose');

/**
 * Canonical Location model — normalized, deduplicated location storage.
 *
 * Supports multiple geocoding providers (Nominatim, Google, manual pin-drop).
 * Each location is uniquely identified by its canonicalId, which is derived
 * from the source provider's stable identifier.
 *
 * Canonical ID format:
 *   Nominatim:  "osm:{osm_type}:{osm_id}"   e.g. "osm:node:123456"
 *   Google:     "goog:{place_id}"             e.g. "goog:ChIJx7..."
 *   Manual:     "manual:{lat4},{lng4}"         e.g. "manual:41.6938,44.8015"
 *
 * Rides can optionally reference this collection via pickupLocationRef / dropoffLocationRef
 * while keeping the existing embedded {lat, lng, address} fields for backward compatibility.
 */

const locationSchema = new mongoose.Schema({
    // Coordinates (primary — what gets used for queries)
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },

    // Display
    displayName: { type: String, required: true },
    rawQuery: { type: String, default: null },

    // Normalized address components
    formattedAddress: { type: String, default: null },
    street: { type: String, default: null },
    city: { type: String, default: null },
    country: { type: String, default: 'GE' },

    // Provider-specific identity
    sourceProvider: {
        type: String,
        enum: ['nominatim', 'google', 'manual'],
        required: true,
    },
    osmType: { type: String, default: null },   // 'node', 'way', 'relation'
    osmId: { type: Number, default: null },      // Nominatim OSM ID (stable)
    googlePlaceId: { type: String, default: null },

    // Canonical unique key — composite of provider + provider-specific ID
    canonicalId: {
        type: String,
        required: true,
        unique: true,
    },

    // GeoJSON point for spatial queries
    point: {
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: { type: [Number] }, // [lng, lat]
    },

    // Geohash for proximity grouping (precision 7 ≈ 153m)
    geohash: { type: String, default: null },

    // Bounding box from geocoder [south, north, west, east]
    boundingBox: { type: [Number], default: undefined },

    // Usage frequency — incremented each time this location is used in a ride
    useCount: { type: Number, default: 1 },

}, { timestamps: true });

// Indexes
locationSchema.index({ point: '2dsphere' });
// canonicalId index is already created by `unique: true` on the field definition
locationSchema.index({ osmType: 1, osmId: 1 }, { sparse: true });
locationSchema.index({ googlePlaceId: 1 }, { sparse: true });
locationSchema.index({ useCount: -1 });
locationSchema.index({ geohash: 1 });

/**
 * Build a stable canonicalId from provider identity fields.
 */
locationSchema.statics.buildCanonicalId = function ({ sourceProvider, osmType, osmId, googlePlaceId, lat, lng }) {
    if (sourceProvider === 'nominatim' && osmType && osmId) {
        return `osm:${osmType}:${osmId}`;
    }
    if (sourceProvider === 'google' && googlePlaceId) {
        return `goog:${googlePlaceId}`;
    }
    // Manual pin-drop: round to 4 decimals (~11m)
    return `manual:${parseFloat(lat).toFixed(4)},${parseFloat(lng).toFixed(4)}`;
};

/**
 * Find an existing location or create a new one, incrementing useCount.
 * Uses MongoDB upsert for atomic find-or-create.
 *
 * @param {object} data - Location data including sourceProvider, lat, lng, displayName, etc.
 * @returns {Promise<object>} The location document
 */
locationSchema.statics.findOrUpsert = async function (data) {
    const geohash = require('../utils/geohash');
    const canonicalId = this.buildCanonicalId(data);
    const hash = geohash.encode(data.lat, data.lng, 7);

    return this.findOneAndUpdate(
        { canonicalId },
        {
            $setOnInsert: {
                lat: data.lat,
                lng: data.lng,
                displayName: data.displayName,
                rawQuery: data.rawQuery || null,
                formattedAddress: data.formattedAddress || null,
                street: data.street || null,
                city: data.city || null,
                country: data.country || 'GE',
                sourceProvider: data.sourceProvider,
                osmType: data.osmType || null,
                osmId: data.osmId || null,
                googlePlaceId: data.googlePlaceId || null,
                canonicalId,
                point: { type: 'Point', coordinates: [data.lng, data.lat] },
                geohash: hash,
                boundingBox: data.boundingBox || undefined,
            },
            $inc: { useCount: 1 },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
};

const Location = mongoose.model('Location', locationSchema);

module.exports = Location;
