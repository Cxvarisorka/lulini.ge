/**
 * AnimatedCarMarker
 *
 * Smooth Uber-like driver-car marker rendered via Mapbox ShapeSource +
 * setNativeProps (Mode A from `spike/DriverCarSpike`). Position interpolates
 * between server packets at 60 fps without going through React render.
 *
 * Behaviour preserved from the previous react-native-maps implementation:
 *   - GPS noise filter: ignore movements smaller than ~2 m
 *   - Bearing computed from GPS only when movement ≥ ~8 m, else fall
 *     back to the server-supplied heading
 *   - Shortest-rotation smoothing across the 0/360 wrap
 *   - Interpolation duration adapts to the time between updates
 *     (clamped 500–3000 ms)
 *
 * Props:
 *   coordinate  { latitude, longitude, heading? }  — target server position
 *   isAssigned  boolean                            — true → larger / blue car
 */
import { memo, useEffect, useMemo, useRef } from 'react';
import Mapbox from '@rnmapbox/maps';

import { pointFeature } from './mapboxGeo';
import { imageIdFor, markerImages } from './markerImages';

const MIN_MOVE_KM = 0.002;
const MIN_HEADING_KM = 0.008;
const MIN_ANIMATION_MS = 500;
const MAX_ANIMATION_MS = 3000;

function quickDistance(lat1, lng1, lat2, lng2) {
  const dlat = (lat2 - lat1) * 111.32;
  const dlng = (lng2 - lng1) * 111.32 * Math.cos(lat1 * 0.01745329);
  return Math.sqrt(dlat * dlat + dlng * dlng);
}

function calcBearing(from, to) {
  const toRad = (d) => d * 0.01745329;
  const dLng = toRad(to.longitude - from.longitude);
  const lat1 = toRad(from.latitude);
  const lat2 = toRad(to.latitude);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (Math.atan2(y, x) * 57.29577951 + 360) % 360;
}

// Choose the equivalent target on the unwrapped bearing axis to avoid the
// 359° → 0° spin. Returns a value possibly outside [0, 360) — that is fine
// for visualisation since the icon-rotate style is mod 360.
function shortestRotation(from, to) {
  const diff = ((to - from + 540) % 360) - 180;
  return from + diff;
}

let __idSeed = 0;

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

const AnimatedCarMarker = memo(
  ({ coordinate, isAssigned = false }) => {
    const lat = coordinate?.latitude;
    const lng = coordinate?.longitude;
    const serverHeading = coordinate?.heading;
    const isValid = isFinite(lat) && isFinite(lng);

    const sourceRef = useRef(null);
    const ids = useMemo(() => {
      const n = ++__idSeed;
      return { sourceId: `acar-src-${n}`, layerId: `acar-lyr-${n}` };
    }, []);

    // Animator state — never triggers a React render.
    const state = useRef({
      from: null, // { latitude, longitude }
      to: null,
      bearing: 0,
      lastUpdateAt: 0,
      durationMs: 0,
      startedAt: 0,
      rafId: 0,
      hasSeed: false,
    });

    // Initial shape — applied once on mount.
    const initialShape = useMemo(() => {
      if (!isValid) return null;
      return pointFeature({ latitude: lat, longitude: lng }, { bearing: 0 });
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Seed the state ref the first time we see a valid coordinate.
    if (isValid && !state.current.hasSeed) {
      state.current.from = { latitude: lat, longitude: lng };
      state.current.to = { latitude: lat, longitude: lng };
      state.current.lastUpdateAt = Date.now();
      state.current.hasSeed = true;
    }

    useEffect(() => {
      if (!isValid) return undefined;
      const s = state.current;

      // First valid coord — already seeded above; just push the initial shape.
      if (s.from === s.to) {
        pushShape(sourceRef, lat, lng, s.bearing);
        s.lastUpdateAt = Date.now();
        return undefined;
      }

      // Filter out GPS jitter
      const distKm = quickDistance(s.to.latitude, s.to.longitude, lat, lng);
      if (distKm < MIN_MOVE_KM) return undefined;

      // Compute bearing — prefer GPS-derived when there's enough movement
      let newBearing = null;
      if (distKm >= MIN_HEADING_KM) {
        newBearing = calcBearing(s.to, { latitude: lat, longitude: lng });
      } else if (
        serverHeading != null &&
        isFinite(serverHeading) &&
        serverHeading >= 0
      ) {
        newBearing = serverHeading;
      }
      if (newBearing !== null) {
        s.bearing = shortestRotation(s.bearing, newBearing);
      }

      // Adaptive duration (matches old AnimatedCarMarker behaviour)
      const now = Date.now();
      const elapsed = now - s.lastUpdateAt;
      const duration = Math.max(
        MIN_ANIMATION_MS,
        Math.min(elapsed * 0.8, MAX_ANIMATION_MS)
      );
      s.lastUpdateAt = now;

      // Kick off interpolation
      s.from = s.to;
      s.to = { latitude: lat, longitude: lng };
      s.startedAt = performance.now();
      s.durationMs = duration;

      cancelAnimationFrame(s.rafId);
      const tick = (frameNow) => {
        const t = Math.min(1, (frameNow - s.startedAt) / s.durationMs);
        const k = 1 - Math.pow(1 - t, 3); // ease-out cubic
        const interpLat = s.from.latitude + (s.to.latitude - s.from.latitude) * k;
        const interpLng = s.from.longitude + (s.to.longitude - s.from.longitude) * k;
        pushShape(sourceRef, interpLat, interpLng, s.bearing);
        if (t < 1) s.rafId = requestAnimationFrame(tick);
      };
      s.rafId = requestAnimationFrame(tick);
      return undefined;
    }, [lat, lng, serverHeading, isValid]);

    useEffect(() => () => cancelAnimationFrame(state.current.rafId), []);

    if (!isValid || !initialShape) return null;

    const iconImageId = imageIdFor(
      isAssigned ? markerImages.carAssigned : markerImages.car
    );
    if (!iconImageId) return null;

    return (
      <Mapbox.ShapeSource id={ids.sourceId} ref={sourceRef} shape={initialShape}>
        <Mapbox.SymbolLayer
          id={ids.layerId}
          style={{
            iconImage: iconImageId,
            iconAnchor: 'center',
            iconAllowOverlap: true,
            iconIgnorePlacement: true,
            iconRotate: ['get', 'bearing'],
            iconRotationAlignment: 'map',
            iconPitchAlignment: 'map',
            symbolSortKey: isAssigned ? 8 : 4,
          }}
        />
      </Mapbox.ShapeSource>
    );
  },
  (prev, next) =>
    prev.coordinate?.latitude === next.coordinate?.latitude &&
    prev.coordinate?.longitude === next.coordinate?.longitude &&
    prev.coordinate?.heading === next.coordinate?.heading &&
    prev.isAssigned === next.isAssigned
);

AnimatedCarMarker.displayName = 'AnimatedCarMarker';

export default AnimatedCarMarker;
