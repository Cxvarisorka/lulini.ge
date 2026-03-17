/**
 * Douglas-Peucker polyline simplification.
 *
 * Reduces a high-resolution polyline (e.g. 500+ points from OSRM) to ~100 points
 * while preserving visual shape. This significantly improves map rendering performance
 * on iOS Apple Maps which draws polylines on CPU (not GPU).
 *
 * @param {Array<{latitude: number, longitude: number}>} points
 * @param {number} [tolerance=0.00005] - ~5 meters at equator. Visually indistinguishable.
 * @returns {Array<{latitude: number, longitude: number}>}
 */
export function simplifyPolyline(points, tolerance = 0.00005) {
  if (!points || points.length <= 2) return points;

  // Find the point with the maximum distance from the line (first, last)
  const first = 0;
  const last = points.length - 1;

  const result = [points[first]];
  _simplifySection(points, first, last, tolerance, result);
  result.push(points[last]);

  return result;
}

function _simplifySection(points, first, last, tolerance, result) {
  if (last - first <= 1) return;

  let maxDist = 0;
  let maxIndex = first;

  for (let i = first + 1; i < last; i++) {
    const dist = _perpendicularDistance(points[i], points[first], points[last]);
    if (dist > maxDist) {
      maxDist = dist;
      maxIndex = i;
    }
  }

  if (maxDist > tolerance) {
    _simplifySection(points, first, maxIndex, tolerance, result);
    result.push(points[maxIndex]);
    _simplifySection(points, maxIndex, last, tolerance, result);
  }
}

function _perpendicularDistance(point, lineStart, lineEnd) {
  const dx = lineEnd.longitude - lineStart.longitude;
  const dy = lineEnd.latitude - lineStart.latitude;

  if (dx === 0 && dy === 0) {
    // lineStart and lineEnd are the same point
    const pdx = point.longitude - lineStart.longitude;
    const pdy = point.latitude - lineStart.latitude;
    return Math.sqrt(pdx * pdx + pdy * pdy);
  }

  const t = Math.max(0, Math.min(1,
    ((point.longitude - lineStart.longitude) * dx + (point.latitude - lineStart.latitude) * dy) /
    (dx * dx + dy * dy)
  ));

  const projX = lineStart.longitude + t * dx;
  const projY = lineStart.latitude + t * dy;

  const distX = point.longitude - projX;
  const distY = point.latitude - projY;

  return Math.sqrt(distX * distX + distY * distY);
}
