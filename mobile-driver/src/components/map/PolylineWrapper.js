/**
 * PolylineWrapper
 *
 * Production-grade polyline with:
 *   - Auto Douglas-Peucker simplification (500+ pts → ~100 pts)
 *   - Deep coordinate memoization (skips re-render if coords unchanged)
 *   - Geodesic rendering for smoother curves on long routes
 *   - lineCap/lineJoin defaults for anti-aliased edges
 */
import { memo, useMemo, useRef } from 'react';
const { Polyline } = require('react-native-maps');
import { simplifyPolyline } from '../../utils/polylineSimplify';

const DEFAULT_TOLERANCE = 0.00005;
const SIMPLIFY_THRESHOLD = 80;

function coordsEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  const checks = [0, a.length - 1, (a.length >> 1)];
  for (const i of checks) {
    if (
      a[i].latitude !== b[i].latitude ||
      a[i].longitude !== b[i].longitude
    ) return false;
  }
  return true;
}

export default memo(function PolylineWrapper({
  id,
  coordinates,
  simplify = true,
  tolerance = DEFAULT_TOLERANCE,
  geodesic = true,
  lineCap = 'round',
  lineJoin = 'round',
  ...props
}) {
  const prevCoordsRef = useRef(null);
  const prevSimplifiedRef = useRef(null);

  const simplified = useMemo(() => {
    if (!coordinates || coordinates.length < 2) return coordinates;
    if (!simplify || coordinates.length <= SIMPLIFY_THRESHOLD) return coordinates;

    if (coordsEqual(coordinates, prevCoordsRef.current)) {
      return prevSimplifiedRef.current;
    }

    const result = simplifyPolyline(coordinates, tolerance);
    prevCoordsRef.current = coordinates;
    prevSimplifiedRef.current = result;
    return result;
  }, [coordinates, simplify, tolerance]);

  if (!simplified || simplified.length < 2) return null;

  return (
    <Polyline
      coordinates={simplified}
      geodesic={geodesic}
      lineCap={lineCap}
      lineJoin={lineJoin}
      {...props}
    />
  );
}, (prev, next) => {
  if (prev.strokeColor !== next.strokeColor) return false;
  if (prev.strokeWidth !== next.strokeWidth) return false;
  if (prev.id !== next.id) return false;
  return coordsEqual(prev.coordinates, next.coordinates);
});
