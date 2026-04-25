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
import { memo, useMemo, useRef } from 'react';
import Mapbox from '@rnmapbox/maps';

import { lineFeature } from './mapboxGeo';
import { simplifyPolyline } from '../../utils/polylineSimplify';

const DEFAULT_TOLERANCE = 0.00005; // ≈ 5 m at equator
const SIMPLIFY_THRESHOLD = 80;

// Module-level counter for stable, side-effect-free Mapbox source/layer IDs.
// `useId()` returns React-internal strings like `«r4»` that Mapbox treats as
// invalid style identifiers, causing "Layer ... is not in style" errors on
// updates. Plain alphanumeric IDs avoid that.
let __idSeed = 0;

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

// Anchor the polyline to a base layer from the active Mapbox style. Without
// this, a route polyline that mounts *after* markers (the common case — markers
// render immediately, the OSRM route arrives seconds later) is appended to the
// top of the style and ends up drawn OVER the markers. Pinning the LineLayer
// above "road-label" (present in both streets-v12 and dark-v11) forces it
// into a slot below everything added dynamically afterwards, so markers
// consistently sit on top regardless of mount timing.
const DEFAULT_ABOVE_LAYER_ID = 'road-label';

function PolylineWrapper({
  coordinates,
  simplify = true,
  tolerance = DEFAULT_TOLERANCE,
  strokeColor = '#1A73E8',
  strokeWidth = 4,
  lineCap = 'round',
  lineJoin = 'round',
  aboveLayerID = DEFAULT_ABOVE_LAYER_ID,
  belowLayerID,
  lineDashPattern,
  /* eslint-disable no-unused-vars */
  geodesic, // Mapbox no-op
  zIndex,   // Mapbox uses layer ordering, not zIndex; ignored
  /* eslint-enable no-unused-vars */
}) {
  const ids = useMemo(() => {
    const n = ++__idSeed;
    return { sourceId: `pwrap-src-${n}`, layerId: `pwrap-lyr-${n}` };
  }, []);

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
    <Mapbox.ShapeSource id={ids.sourceId} shape={shape} lineMetrics>
      <Mapbox.LineLayer
        id={ids.layerId}
        aboveLayerID={belowLayerID ? undefined : aboveLayerID}
        belowLayerID={belowLayerID}
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
