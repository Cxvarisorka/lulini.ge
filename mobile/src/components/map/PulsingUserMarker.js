/**
 * PulsingUserMarker
 *
 * Blue dot + directional arrow + pulsing ring marking the passenger's
 * location, rendered via two Mapbox layers:
 *   - `CircleLayer` — the expanding ring, animated via Mapbox's native paint
 *     transition (the native thread interpolates; React re-renders at ~0.5 Hz).
 *   - `SymbolLayer` — the user icon with directional arrow. Rotates with
 *     `coordinate.heading` so the user can see which way they're facing.
 *
 * Heading is in compass degrees (0 = north, 90 = east). With
 * `iconRotationAlignment: 'map'` the arrow rotates with the world coordinate
 * system, so the bearing stays geographically correct when the map is rotated.
 *
 * Stability: lastValidRef preserves the last known-good coordinate (and the
 * last-known heading) so the dot doesn't disappear or spin to north when GPS
 * briefly drops.
 */
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import Mapbox from '@rnmapbox/maps';

import { imageIdFor, markerImages } from './markerImages';

let __idSeed = 0;

// Pulse timing. PULSE_DURATION is the expand+fade phase; RESET_GAP is a tiny
// pause before the next cycle so the instant snap-back is visually distinct.
const PULSE_DURATION_MS = 1600;
const RESET_GAP_MS = 80;

// Pulse geometry. Tuned to match the user dot (~12px icon) without overwhelming it.
const PULSE_COLOR = '#2196F3';
const PULSE_RADIUS_MIN = 10;
const PULSE_RADIUS_MAX = 38;
const PULSE_OPACITY_MIN = 0;
const PULSE_OPACITY_MAX = 0.35;

function isUsableHeading(h) {
  return typeof h === 'number' && isFinite(h) && h >= 0;
}

const PulsingUserMarker = memo(
  ({ coordinate, visible = true }) => {
    const lat = coordinate?.latitude;
    const lng = coordinate?.longitude;
    const heading = coordinate?.heading;
    const isValid = isFinite(lat) && isFinite(lng);

    const lastValidRef = useRef(null);
    const lastHeadingRef = useRef(0);
    if (isValid) {
      lastValidRef.current = { latitude: lat, longitude: lng };
    }
    if (isUsableHeading(heading)) {
      lastHeadingRef.current = heading;
    }

    const ids = useMemo(() => {
      const n = ++__idSeed;
      return {
        pulseSourceId: `puser-pulse-src-${n}`,
        pulseLayerId: `puser-pulse-lyr-${n}`,
        iconSourceId: `puser-icon-src-${n}`,
        iconLayerId: `puser-icon-lyr-${n}`,
      };
    }, []);

    const stableCoord = isValid
      ? { latitude: lat, longitude: lng }
      : lastValidRef.current;
    const effectiveHeading = isUsableHeading(heading) ? heading : lastHeadingRef.current;

    // Two-phase pulse driven by Mapbox native transitions:
    //   phase=false → instant snap to small+opaque (transition 0ms)
    //   phase=true  → animate to large+transparent (transition PULSE_DURATION_MS)
    // React re-renders ~1.2 times per second; the native thread does the tween.
    const [pulsePhase, setPulsePhase] = useState(false);
    useEffect(() => {
      if (!visible) return;
      let cancelled = false;
      let timer;
      const loop = () => {
        if (cancelled) return;
        setPulsePhase(false);
        timer = setTimeout(() => {
          if (cancelled) return;
          setPulsePhase(true);
          timer = setTimeout(loop, PULSE_DURATION_MS);
        }, RESET_GAP_MS);
      };
      loop();
      return () => {
        cancelled = true;
        if (timer) clearTimeout(timer);
      };
    }, [visible]);

    const pulseShape = useMemo(() => {
      if (!stableCoord) return null;
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [stableCoord.longitude, stableCoord.latitude] },
        properties: {},
      };
    }, [stableCoord?.latitude, stableCoord?.longitude]);

    const iconShape = useMemo(() => {
      if (!stableCoord) return null;
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [stableCoord.longitude, stableCoord.latitude] },
        properties: { bearing: effectiveHeading },
      };
    }, [stableCoord?.latitude, stableCoord?.longitude, effectiveHeading]);

    if (!pulseShape || !iconShape) return null;
    if (!visible) return null;

    const iconImageId = imageIdFor(markerImages.user);
    if (!iconImageId) return null;

    return (
      <>
        <Mapbox.ShapeSource id={ids.pulseSourceId} shape={pulseShape}>
          <Mapbox.CircleLayer
            id={ids.pulseLayerId}
            style={{
              circleRadius: pulsePhase ? PULSE_RADIUS_MAX : PULSE_RADIUS_MIN,
              circleColor: PULSE_COLOR,
              circleOpacity: pulsePhase ? PULSE_OPACITY_MIN : PULSE_OPACITY_MAX,
              circleStrokeWidth: 0,
              circlePitchAlignment: 'map',
              // Native thread interpolates between the two phases.
              circleRadiusTransition: { duration: pulsePhase ? PULSE_DURATION_MS : 0, delay: 0 },
              circleOpacityTransition: { duration: pulsePhase ? PULSE_DURATION_MS : 0, delay: 0 },
            }}
          />
        </Mapbox.ShapeSource>
        <Mapbox.ShapeSource id={ids.iconSourceId} shape={iconShape}>
          <Mapbox.SymbolLayer
            id={ids.iconLayerId}
            style={{
              iconImage: iconImageId,
              iconAnchor: 'center',
              iconAllowOverlap: true,
              iconIgnorePlacement: true,
              // Read bearing from the feature so heading updates only touch
              // the source shape — not the whole layer style.
              iconRotate: ['get', 'bearing'],
              iconRotationAlignment: 'map',
              iconPitchAlignment: 'map',
              symbolSortKey: 20,
            }}
          />
        </Mapbox.ShapeSource>
      </>
    );
  },
  (prev, next) => {
    if (prev.visible !== next.visible) return false;
    const pLat = prev.coordinate?.latitude;
    const pLng = prev.coordinate?.longitude;
    const pHd = prev.coordinate?.heading;
    const nLat = next.coordinate?.latitude;
    const nLng = next.coordinate?.longitude;
    const nHd = next.coordinate?.heading;
    if (!isFinite(nLat) || !isFinite(nLng)) return true;
    if (!isFinite(pLat) || !isFinite(pLng)) return false;
    if (Math.abs(nLat - pLat) >= 0.0001 || Math.abs(nLng - pLng) >= 0.0001) return false;
    if (isUsableHeading(pHd) !== isUsableHeading(nHd)) return false;
    if (isUsableHeading(pHd) && isUsableHeading(nHd) && Math.abs(nHd - pHd) >= 2) return false;
    return true;
  }
);

PulsingUserMarker.displayName = 'PulsingUserMarker';

export default PulsingUserMarker;
