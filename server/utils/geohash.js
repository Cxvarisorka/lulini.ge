'use strict';

/**
 * Lightweight geohash encoder — zero dependencies.
 *
 * Encodes lat/lng to a Base32 geohash string.
 * Precision 7 ≈ 153m × 153m cells (good for deduplication/grouping).
 * Precision 9 ≈ 4.8m × 4.8m cells (good for exact-match).
 *
 * Based on the standard geohash algorithm (Gustavo Niemeyer, 2008).
 */

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

/**
 * Encode latitude/longitude to a geohash string.
 * @param {number} lat - Latitude (-90 to 90)
 * @param {number} lng - Longitude (-180 to 180)
 * @param {number} [precision=7] - Number of characters (1-12)
 * @returns {string} Geohash string
 */
function encode(lat, lng, precision = 7) {
    let latRange = [-90, 90];
    let lngRange = [-180, 180];
    let isLng = true;
    let bit = 0;
    let charIndex = 0;
    let hash = '';

    while (hash.length < precision) {
        const range = isLng ? lngRange : latRange;
        const val = isLng ? lng : lat;
        const mid = (range[0] + range[1]) / 2;

        if (val >= mid) {
            charIndex = (charIndex << 1) | 1;
            range[0] = mid;
        } else {
            charIndex = charIndex << 1;
            range[1] = mid;
        }

        isLng = !isLng;
        bit++;

        if (bit === 5) {
            hash += BASE32[charIndex];
            bit = 0;
            charIndex = 0;
        }
    }

    return hash;
}

/**
 * Get the 8 neighboring geohash cells for a given hash.
 * Useful for proximity queries across cell boundaries.
 * @param {string} hash - Center geohash
 * @returns {string[]} Array of 8 neighbor hashes
 */
function neighbors(hash) {
    const { lat, lng } = decode(hash);
    const precision = hash.length;

    // Approximate cell dimensions at this precision
    const latErr = 180 / Math.pow(2, Math.floor(precision * 5 / 2));
    const lngErr = 360 / Math.pow(2, Math.ceil(precision * 5 / 2));

    const offsets = [
        [-1, -1], [-1, 0], [-1, 1],
        [0, -1],           [0, 1],
        [1, -1],  [1, 0],  [1, 1],
    ];

    return offsets.map(([dLat, dLng]) =>
        encode(lat + dLat * latErr, lng + dLng * lngErr, precision)
    );
}

/**
 * Decode a geohash to approximate center coordinates.
 * @param {string} hash
 * @returns {{ lat: number, lng: number }}
 */
function decode(hash) {
    let latRange = [-90, 90];
    let lngRange = [-180, 180];
    let isLng = true;

    for (const char of hash) {
        const idx = BASE32.indexOf(char);
        for (let bit = 4; bit >= 0; bit--) {
            const range = isLng ? lngRange : latRange;
            const mid = (range[0] + range[1]) / 2;
            if ((idx >> bit) & 1) {
                range[0] = mid;
            } else {
                range[1] = mid;
            }
            isLng = !isLng;
        }
    }

    return {
        lat: (latRange[0] + latRange[1]) / 2,
        lng: (lngRange[0] + lngRange[1]) / 2,
    };
}

module.exports = { encode, decode, neighbors };
