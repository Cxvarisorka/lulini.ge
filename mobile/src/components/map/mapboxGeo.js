/**
 * mapboxGeo — small coordinate / region / zoom helpers for the Mapbox wrappers.
 *
 * Mapbox uses GeoJSON conventions: coordinates are `[longitude, latitude]`,
 * which is the opposite order of `react-native-maps` `{ latitude, longitude }`.
 * Wrappers use these helpers to translate at the boundary so consumer code
 * (screens, marker components) keeps using `{ latitude, longitude }`.
 */

/**
 * Convert `{ latitude, longitude }` → `[longitude, latitude]` (Mapbox order).
 * Returns null if the input is missing or non-finite.
 */
export function toLngLat(coord) {
  if (!coord) return null;
  const lat = coord.latitude;
  const lng = coord.longitude;
  if (!isFinite(lat) || !isFinite(lng)) return null;
  return [lng, lat];
}

/**
 * Convert `[longitude, latitude]` → `{ latitude, longitude }`.
 */
export function fromLngLat(coord) {
  if (!coord || coord.length < 2) return null;
  return { latitude: coord[1], longitude: coord[0] };
}

/**
 * Build a GeoJSON Point Feature from a coordinate + properties bag.
 */
export function pointFeature(coord, properties = {}) {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: toLngLat(coord) || [0, 0] },
    properties,
  };
}

/**
 * Build a GeoJSON LineString Feature from an array of coordinates.
 */
export function lineFeature(coords, properties = {}) {
  const lineCoords = [];
  for (let i = 0; i < coords.length; i++) {
    const c = toLngLat(coords[i]);
    if (c) lineCoords.push(c);
  }
  return {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: lineCoords },
    properties,
  };
}

/**
 * Approximate `latitudeDelta` → Mapbox `zoomLevel`.
 *
 * Standard Mercator relation: `zoom ≈ log2(360 / latitudeDelta) - 1`.
 * Ballpark mapping (for sanity-checking call sites):
 *   latitudeDelta 0.01  → zoom ~14.1
 *   latitudeDelta 0.015 → zoom ~13.5
 *   latitudeDelta 0.05  → zoom ~11.7
 *   latitudeDelta 0.1   → zoom ~10.7
 */
export function deltaToZoom(latitudeDelta) {
  if (!isFinite(latitudeDelta) || latitudeDelta <= 0) return 14;
  return Math.log2(360 / latitudeDelta) - 1;
}

/**
 * Approximate Mapbox `zoomLevel` → `latitudeDelta` (for reverse-translating
 * `onCameraChanged` payloads back into the `region` shape that `react-native-maps`
 * consumers expect from `onRegionChangeComplete`).
 */
export function zoomToDelta(zoomLevel) {
  if (!isFinite(zoomLevel)) return 0.05;
  return 360 / Math.pow(2, zoomLevel + 1);
}

/**
 * Compute SW + NE bounding-box corners (each as `[lng, lat]`) from an array
 * of `{ latitude, longitude }` coordinates. Returns `null` if fewer than two
 * valid points were supplied — the caller should fall back to a single-point
 * camera animation in that case.
 */
export function bboxFromCoords(coords) {
  if (!Array.isArray(coords) || coords.length < 1) return null;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  let n = 0;
  for (const c of coords) {
    if (!c || !isFinite(c.latitude) || !isFinite(c.longitude)) continue;
    if (c.latitude < minLat) minLat = c.latitude;
    if (c.latitude > maxLat) maxLat = c.latitude;
    if (c.longitude < minLng) minLng = c.longitude;
    if (c.longitude > maxLng) maxLng = c.longitude;
    n++;
  }
  if (n === 0) return null;
  // Pad zero-area bboxes by ~100 m so Mapbox doesn't NaN out when fitting a
  // single duplicated point. Matches the same defensive behaviour in
  // `mapSafety.safeFitToCoordinates`.
  if (maxLat - minLat < 0.0001) {
    minLat -= 0.0005;
    maxLat += 0.0005;
  }
  if (maxLng - minLng < 0.0001) {
    minLng -= 0.0005;
    maxLng += 0.0005;
  }
  return {
    sw: [minLng, minLat],
    ne: [maxLng, maxLat],
  };
}

/**
 * Map react-native-maps `anchor` `{ x, y }` (origin = top-left) to a Mapbox
 * `iconAnchor` keyword. Mapbox supports the nine standard hot-spots only,
 * so fractional anchors are bucketed to the nearest keyword.
 */
export function anchorToIconAnchor(anchor) {
  if (!anchor) return 'center';
  const x = anchor.x ?? 0.5;
  const y = anchor.y ?? 0.5;
  // Vertical first
  if (y >= 0.85) {
    if (x <= 0.25) return 'bottom-left';
    if (x >= 0.75) return 'bottom-right';
    return 'bottom';
  }
  if (y <= 0.15) {
    if (x <= 0.25) return 'top-left';
    if (x >= 0.75) return 'top-right';
    return 'top';
  }
  if (x <= 0.25) return 'left';
  if (x >= 0.75) return 'right';
  return 'center';
}

/**
 * Mapbox preset style URLs keyed by colour scheme.
 * `streets-v12` is Mapbox's flagship light style (full Latin + Georgian glyphs).
 * `dark-v11` is the matching dark variant.
 */
export const STYLE_URLS = {
  light: 'mapbox://styles/mapbox/streets-v12',
  dark: 'mapbox://styles/mapbox/dark-v11',
};

export function resolveStyleURL({ styleURL, colorScheme }) {
  if (styleURL) return styleURL;
  if (colorScheme === 'dark') return STYLE_URLS.dark;
  return STYLE_URLS.light;
}
