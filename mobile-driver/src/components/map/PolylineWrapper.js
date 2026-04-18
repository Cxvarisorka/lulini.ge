/**
 * PolylineWrapper
 *
 * Mapbox-backed polyline that preserves the `react-native-maps` external API.
 *
 * Internally renders `<Mapbox.ShapeSource>` + `<Mapbox.LineLayer>`. The
 * Douglas-Peucker simplification, deep coord memoization, and custom equality
 * comparator are reused verbatim — they're SDK-agnostic and well-tuned.
 *
 * Mapbox notes:
 *   - `geodesic` is a no-op (Mapbox uses projected straight segments — fine
 *     at city scale).
 *   - `lineDashPattern` mirrors react-native-maps semantics if the consumer
 *     passes one (e.g. driver-route style).
 */
import { memo, useId, useMemo, useRef } from 'react';
import Mapbox from '@rnmapbox/maps';

import { lineFeature } from './mapboxGeo';
import { simplifyPolyline } from '../../utils/polylineSimplify';

const DEFAULT_TOLERANCE = 0.00005; // ≈ 5 m at equator
const SIMPLIFY_THRESHOLD = 80;

function coordsEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  // Sample check: first, last, and middle point.
  const checks = [0, a.length - 1, a.length >> 1];
  for (const i of checks) {
    if (a[i].latitude !== b[i].latitude || a[i].longitude !== b[i].longitude) return false;
  }
  return true;
}

function PolylineWrapper({
  coordinates,
  simplify = true,
  tolerance = DEFAULT_TOLERANCE,
  strokeColor = '#1A73E8',
  strokeWidth = 4,
  lineCap = 'round',
  lineJoin = 'round',
  lineDashPattern,
  /* eslint-disable no-unused-vars */
  geodesic, // Mapbox no-op
  zIndex,   // Mapbox uses layer ordering, not zIndex; ignored
  /* eslint-enable no-unused-vars */
}) {
  const reactId = useId();
  const sourceId = useMemo(() => `pwrap-src-${reactId}`, [reactId]);
  const layerId = useMemo(() => `pwrap-lyr-${reactId}`, [reactId]);

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

  const shape = useMemo(() => {
    if (!simplified || simplified.length < 2) return null;
    return lineFeature(simplified);
  }, [simplified]);

  if (!shape) return null;

  return (
    <Mapbox.ShapeSource id={sourceId} shape={shape} lineMetrics>
      <Mapbox.LineLayer
        id={layerId}
        style={{
          lineColor: strokeColor,
          lineWidth: strokeWidth,
          lineCap,
          lineJoin,
          ...(Array.isArray(lineDashPattern) && lineDashPattern.length > 0
            ? { lineDasharray: lineDashPattern }
            : {}),
        }}
      />
    </Mapbox.ShapeSource>
  );
}

export default memo(PolylineWrapper, (prev, next) => {
  if (prev.strokeColor !== next.strokeColor) return false;
  if (prev.strokeWidth !== next.strokeWidth) return false;
  return coordsEqual(prev.coordinates, next.coordinates);
});
