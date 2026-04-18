/**
 * PulsingUserMarker
 *
 * Static blue dot marking the passenger's location. Renders as a Mapbox
 * SymbolLayer (no JSX), which means no per-frame bitmap snapshotting and no
 * disappearing-marker race during state-update bursts.
 *
 * The previous JSX-pulse animation was already gated off behind
 * `USE_NATIVE_IMAGE_MARKER = true` after stability issues; that code is
 * removed here.
 *
 * Stability: lastValidRef preserves the last known-good coordinate so the
 * dot never vanishes while parent state is in flux.
 */
import { memo, useMemo, useRef } from 'react';
import Mapbox from '@rnmapbox/maps';

import { imageIdFor, markerImages } from './markerImages';

let __idSeed = 0;

const PulsingUserMarker = memo(
  ({ coordinate, visible = true }) => {
    const lat = coordinate?.latitude;
    const lng = coordinate?.longitude;
    const isValid = isFinite(lat) && isFinite(lng);

    const lastValidRef = useRef(null);
    if (isValid) {
      lastValidRef.current = { latitude: lat, longitude: lng };
    }

    const ids = useMemo(() => {
      const n = ++__idSeed;
      return { sourceId: `puser-src-${n}`, layerId: `puser-lyr-${n}` };
    }, []);

    const stableCoord = isValid
      ? { latitude: lat, longitude: lng }
      : lastValidRef.current;

    const shape = useMemo(() => {
      if (!stableCoord) return null;
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [stableCoord.longitude, stableCoord.latitude] },
        properties: {},
      };
    }, [stableCoord?.latitude, stableCoord?.longitude]);

    if (!shape) return null;
    if (!visible) return null;

    const iconImageId = imageIdFor(markerImages.user);
    if (!iconImageId) return null;

    return (
      <Mapbox.ShapeSource id={ids.sourceId} shape={shape}>
        <Mapbox.SymbolLayer
          id={ids.layerId}
          style={{
            iconImage: iconImageId,
            iconAnchor: 'center',
            iconAllowOverlap: true,
            iconIgnorePlacement: true,
            iconRotationAlignment: 'viewport',
            symbolSortKey: 20,
          }}
        />
      </Mapbox.ShapeSource>
    );
  },
  (prev, next) => {
    if (prev.visible !== next.visible) return false;
    const pLat = prev.coordinate?.latitude;
    const pLng = prev.coordinate?.longitude;
    const nLat = next.coordinate?.latitude;
    const nLng = next.coordinate?.longitude;
    // If next coordinate is invalid, skip re-render — the ref keeps the dot visible.
    if (!isFinite(nLat) || !isFinite(nLng)) return true;
    if (!isFinite(pLat) || !isFinite(pLng)) return false;
    return Math.abs(nLat - pLat) < 0.0001 && Math.abs(nLng - pLng) < 0.0001;
  }
);

PulsingUserMarker.displayName = 'PulsingUserMarker';

export default PulsingUserMarker;
