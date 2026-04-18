/**
 * DestinationMarker
 *
 * Black "Drop off" pill with optional ETA text overlay (e.g. "12 min").
 * Mapbox SymbolLayer with `iconTextFit: 'both'` stretches the boltpin
 * background PNG around the dynamic text — pixel-equivalent to the prior
 * BoltPin JSX at a fraction of the cost.
 *
 * Anchor is `bottom`: the dot at the base of the pill sits exactly on the
 * geographic coordinate.
 *
 * Note: the previous implementation supported `draggable`; that was unused at
 * call sites (only `DraggablePickupMarker` is dragged in production). If a
 * dropoff ever needs drag, switch this back to a `<MarkerWrapper>` with JSX
 * children (the slow but flexible PointAnnotation path).
 */
import { memo, useMemo } from 'react';
import Mapbox from '@rnmapbox/maps';

import { imageIdFor, markerImages } from './markerImages';

let __idSeed = 0;

const DestinationMarker = memo(({ coordinate, etaMinutes }) => {
  const lat = coordinate?.latitude;
  const lng = coordinate?.longitude;
  const isValid = isFinite(lat) && isFinite(lng);

  const ids = useMemo(() => {
    const n = ++__idSeed;
    return { sourceId: `dest-src-${n}`, layerId: `dest-lyr-${n}` };
  }, []);

  const label = etaMinutes != null ? `${etaMinutes} min` : 'Drop off';

  const shape = useMemo(() => {
    if (!isValid) return null;
    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: { label },
    };
  }, [lat, lng, label, isValid]);

  if (!shape) return null;

  const bgImageId = imageIdFor(markerImages.boltpinBgDark);
  if (!bgImageId) return null;

  return (
    <Mapbox.ShapeSource id={ids.sourceId} shape={shape}>
      <Mapbox.SymbolLayer
        id={ids.layerId}
        style={{
          iconImage: bgImageId,
          iconAnchor: 'bottom',
          iconAllowOverlap: true,
          iconIgnorePlacement: true,
          // Pill stretches around the text; padding keeps a little white space.
          iconTextFit: 'both',
          iconTextFitPadding: [4, 10, 4, 10],
          textField: ['get', 'label'],
          textColor: '#FFFFFF',
          textSize: 13,
          textFont: ['Open Sans Bold', 'Arial Unicode MS Bold'],
          textAnchor: 'bottom',
          // Offset the text up so it sits inside the pill, not over the tail.
          textOffset: [0, -1.6],
          textIgnorePlacement: true,
          textAllowOverlap: true,
          symbolSortKey: 10,
        }}
      />
    </Mapbox.ShapeSource>
  );
});

DestinationMarker.displayName = 'DestinationMarker';

export default DestinationMarker;
