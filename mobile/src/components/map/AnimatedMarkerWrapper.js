/**
 * AnimatedMarkerWrapper
 *
 * Mapbox-backed smooth animated marker that preserves the
 * `react-native-maps` external API:
 *
 *   <AnimatedMarker
 *     ref={r}
 *     coordinate={{ latitude, longitude }}
 *     image={markerImages.carAssigned}
 *     anchor={{ x: 0.5, y: 0.5 }}
 *     flat
 *     rotation={animatedValueOrNumber}
 *     zIndex={10}
 *   />
 *
 *   r.current.animateMarkerToCoordinate({ latitude, longitude }, durationMs)
 *
 * Internally uses the Mode A pattern from `spike/DriverCarSpike` —
 * `ShapeSource.setNativeProps({ shape })` driven by `requestAnimationFrame`
 * so position updates bypass the React render cycle entirely. This is the
 * lowest-latency path Mapbox exposes for live driver-position rendering.
 *
 * `rotation` accepts either a number or an `Animated.Value`; the wrapper
 * subscribes to value changes and pushes them into the bearing property of
 * the next frame's shape.
 */
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { Platform } from 'react-native';
import Mapbox from '@rnmapbox/maps';

import { anchorToIconAnchor, pointFeature } from './mapboxGeo';
import { imageIdFor } from './markerImages';

function isValidCoord(coord) {
  if (!coord) return false;
  const { latitude: lat, longitude: lng } = coord;
  return (
    typeof lat === 'number' && isFinite(lat) && lat >= -90 && lat <= 90 &&
    typeof lng === 'number' && isFinite(lng) && lng >= -180 && lng <= 180
  );
}

function pushShape(sourceRef, lat, lng, bearing) {
  const src = sourceRef.current;
  if (!src) return;
  src.setNativeProps({
    shape: {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: { bearing },
    },
  });
}

let __idSeed = 0;

function AnimatedMarkerWrapper(
  {
    coordinate,
    image,
    anchor,
    flat,
    rotation,
    zIndex,
    /* eslint-disable no-unused-vars */
    tracksViewChanges,
    style,
    /* eslint-enable no-unused-vars */
  },
  ref
) {
  // Stable IDs across re-renders (avoid useId so SSR/concurrent-mode don't change them).
  const ids = useMemo(() => {
    const n = ++__idSeed;
    return { sourceId: `amwrap-src-${n}`, layerId: `amwrap-lyr-${n}` };
  }, []);

  const sourceRef = useRef(null);
  const animState = useRef({
    fromLat: null,
    fromLng: null,
    toLat: null,
    toLng: null,
    bearing: 0,
    startedAt: 0,
    durationMs: 0,
    rafId: 0,
  });

  // Initial coordinate → primes the animator + the initial shape prop.
  const initialCoord = useMemo(() => {
    if (isValidCoord(coordinate)) {
      return { latitude: coordinate.latitude, longitude: coordinate.longitude };
    }
    return null;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Seed the state ref once on mount.
  if (
    initialCoord &&
    animState.current.toLat === null
  ) {
    animState.current.toLat = initialCoord.latitude;
    animState.current.toLng = initialCoord.longitude;
    animState.current.fromLat = initialCoord.latitude;
    animState.current.fromLng = initialCoord.longitude;
  }

  // ─── Coordinate prop change → trigger a soft 500ms interp ───────────
  // Caller can override duration via the imperative animateMarkerToCoordinate.
  useEffect(() => {
    if (!isValidCoord(coordinate)) return undefined;
    const target = { latitude: coordinate.latitude, longitude: coordinate.longitude };
    startInterp(animState, sourceRef, target, 500);
    // No cleanup — the next call cancels the previous RAF inside startInterp.
    return undefined;
  }, [coordinate?.latitude, coordinate?.longitude]);

  // ─── Rotation prop subscription ─────────────────────────────────────
  // Either a static number or an Animated.Value with addListener(...).
  useEffect(() => {
    const s = animState.current;
    if (rotation && typeof rotation === 'object' && typeof rotation.addListener === 'function') {
      // Animated.Value path — read the initial value, then subscribe.
      if (typeof rotation.__getValue === 'function') {
        const v = rotation.__getValue();
        if (typeof v === 'number' && isFinite(v)) {
          s.bearing = v;
          if (s.toLat !== null) pushShape(sourceRef, s.toLat, s.toLng, v);
        }
      }
      const id = rotation.addListener(({ value }) => {
        if (typeof value === 'number' && isFinite(value)) {
          s.bearing = value;
          // Push only the bearing (using the latest position).
          if (s.toLat !== null) pushShape(sourceRef, s.toLat, s.toLng, value);
        }
      });
      return () => rotation.removeListener(id);
    }
    if (typeof rotation === 'number' && isFinite(rotation)) {
      s.bearing = rotation;
      if (s.toLat !== null) pushShape(sourceRef, s.toLat, s.toLng, rotation);
    }
    return undefined;
  }, [rotation]);

  // ─── Imperative API ─────────────────────────────────────────────────
  useImperativeHandle(
    ref,
    () => ({
      animateMarkerToCoordinate(target, duration = 500) {
        if (!isValidCoord(target)) return;
        startInterp(animState, sourceRef, target, duration);
      },
    }),
    []
  );

  // Cleanup any in-flight RAF on unmount.
  useEffect(() => () => cancelAnimationFrame(animState.current.rafId), []);

  if (!initialCoord) return null;
  if (!image) return null;

  const iconImageId = imageIdFor(image);
  if (!iconImageId) return null;

  const initialShape = pointFeature(initialCoord, {
    bearing: typeof rotation === 'number' ? rotation : 0,
  });
  const iconAnchor = anchorToIconAnchor(anchor);

  return (
    <Mapbox.ShapeSource id={ids.sourceId} ref={sourceRef} shape={initialShape}>
      <Mapbox.SymbolLayer
        id={ids.layerId}
        style={{
          iconImage: iconImageId,
          iconAnchor,
          iconAllowOverlap: true,
          iconIgnorePlacement: true,
          iconRotate: ['get', 'bearing'],
          iconRotationAlignment: flat ? 'map' : 'viewport',
          iconPitchAlignment: flat ? 'map' : 'viewport',
          symbolSortKey: typeof zIndex === 'number' ? zIndex : 0,
        }}
      />
    </Mapbox.ShapeSource>
  );
}

function startInterp(stateRef, sourceRef, target, durationMs) {
  const s = stateRef.current;
  if (s.toLat == null) {
    // First seeding — snap immediately.
    s.toLat = target.latitude;
    s.toLng = target.longitude;
    s.fromLat = target.latitude;
    s.fromLng = target.longitude;
    pushShape(sourceRef, target.latitude, target.longitude, s.bearing);
    return;
  }
  s.fromLat = s.toLat;
  s.fromLng = s.toLng;
  s.toLat = target.latitude;
  s.toLng = target.longitude;
  s.startedAt = Platform.OS === 'web' ? Date.now() : performance.now();
  s.durationMs = Math.max(1, durationMs);

  cancelAnimationFrame(s.rafId);

  const tick = (now) => {
    const t = Math.min(1, (now - s.startedAt) / s.durationMs);
    // Ease-out cubic — matches the spike's Mode A curve.
    const k = 1 - Math.pow(1 - t, 3);
    const lat = s.fromLat + (s.toLat - s.fromLat) * k;
    const lng = s.fromLng + (s.toLng - s.fromLng) * k;
    pushShape(sourceRef, lat, lng, s.bearing);
    if (t < 1) s.rafId = requestAnimationFrame(tick);
  };
  s.rafId = requestAnimationFrame(tick);
}

export default forwardRef(AnimatedMarkerWrapper);
