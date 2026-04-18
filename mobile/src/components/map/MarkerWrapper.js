/**
 * MarkerWrapper
 *
 * Mapbox-backed marker that preserves the `react-native-maps` external API.
 *
 * Two paths:
 *   - When `image` is supplied (the common case across the codebase) the
 *     wrapper renders `<Mapbox.ShapeSource>` + `<Mapbox.SymbolLayer>` keyed
 *     to the icon registered in `markerImages.js` via the wrapper's
 *     `<Mapbox.Images>` registry. This is the fast, native bitmap path.
 *   - When `children` is supplied (no `image`) the wrapper falls through to
 *     `<Mapbox.PointAnnotation>` so JSX views still render. This path also
 *     enables `draggable` + `onDragEnd`.
 *
 * Defensive: invalid coordinates (NaN, Infinity, out-of-range) are dropped
 * silently — matches the previous behaviour and prevents native bridge
 * crashes on iOS / Android.
 */
import { forwardRef, useCallback, useId, useMemo } from 'react';
import Mapbox from '@rnmapbox/maps';

import { anchorToIconAnchor, fromLngLat, pointFeature } from './mapboxGeo';
import { imageIdFor } from './markerImages';

function isValidCoord(coord) {
  if (!coord) return false;
  const lat = coord.latitude;
  const lng = coord.longitude;
  return (
    typeof lat === 'number' && isFinite(lat) && lat >= -90 && lat <= 90 &&
    typeof lng === 'number' && isFinite(lng) && lng >= -180 && lng <= 180
  );
}

function MarkerWrapper(
  {
    image,
    coordinate,
    anchor,
    flat,
    rotation,
    zIndex,
    onPress,
    // Drag support — only meaningful on the PointAnnotation (JSX) path.
    draggable,
    onDragEnd,
    children,
    // Silently-dropped legacy props (preserved for API compatibility).
    /* eslint-disable no-unused-vars */
    tracksViewChanges,
    tappable,
    stopPropagation,
    style,
    /* eslint-enable no-unused-vars */
  },
  ref
) {
  const reactId = useId();
  // Stable IDs for the source / layer pair.
  const sourceId = useMemo(() => `mwrap-src-${reactId}`, [reactId]);
  const layerId = useMemo(() => `mwrap-lyr-${reactId}`, [reactId]);
  const annotationId = useMemo(() => `mwrap-ann-${reactId}`, [reactId]);

  // Build the GeoJSON feature for the SymbolLayer path. Recomputed only when
  // coordinate or rotation actually changes — preserves shallow identity so
  // ShapeSource doesn't re-diff on every parent render.
  const lat = coordinate?.latitude;
  const lng = coordinate?.longitude;
  const rotProp = typeof rotation === 'number' ? rotation : 0;
  const shape = useMemo(
    () => pointFeature({ latitude: lat, longitude: lng }, { bearing: rotProp }),
    [lat, lng, rotProp]
  );

  const handleDragEnd = useCallback(
    (e) => {
      if (!onDragEnd) return;
      const coords = e?.geometry?.coordinates;
      onDragEnd({ nativeEvent: { coordinate: fromLngLat(coords) } });
    },
    [onDragEnd]
  );

  if (!isValidCoord(coordinate)) return null;

  // ── Image path: the high-performance native-bitmap render ──────────────
  if (image) {
    const iconImageId = imageIdFor(image);
    if (!iconImageId) {
      // Image isn't in the registry — silently skip (vs crash). Surface in dev.
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.warn('[MarkerWrapper] image is not registered in markerImages.js');
      }
      return null;
    }
    const iconAnchor = anchorToIconAnchor(anchor);
    return (
      <Mapbox.ShapeSource id={sourceId} ref={ref} shape={shape} onPress={onPress}>
        <Mapbox.SymbolLayer
          id={layerId}
          style={{
            iconImage: iconImageId,
            iconAnchor,
            iconAllowOverlap: true,
            iconIgnorePlacement: true,
            iconRotate: rotProp,
            // `flat={true}` ↔ icon stays parallel to the map (rotates with it).
            iconRotationAlignment: flat ? 'map' : 'viewport',
            iconPitchAlignment: flat ? 'map' : 'viewport',
            // Mapbox ordering: higher symbolSortKey draws ON TOP of lower.
            // (Same direction as react-native-maps' `zIndex`.)
            symbolSortKey: typeof zIndex === 'number' ? zIndex : 0,
          }}
        />
      </Mapbox.ShapeSource>
    );
  }

  // ── JSX path: PointAnnotation supports children + drag ────────────────
  return (
    <Mapbox.PointAnnotation
      ref={ref}
      id={annotationId}
      coordinate={[lng, lat]}
      anchor={anchor ? { x: anchor.x ?? 0.5, y: anchor.y ?? 0.5 } : undefined}
      draggable={!!draggable}
      onSelected={onPress}
      onDragEnd={draggable ? handleDragEnd : undefined}
    >
      {children}
    </Mapbox.PointAnnotation>
  );
}

export default forwardRef(MarkerWrapper);
