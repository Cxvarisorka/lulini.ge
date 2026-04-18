/**
 * DraggablePickupMarker
 *
 * Green pickup pin that the passenger can drag to override their pickup
 * location. Drag is the one feature that requires `<Mapbox.PointAnnotation>`
 * (the slower per-marker JSX path) — `SymbolLayer` is fast but not draggable.
 *
 * Renders the green BoltPin pill with a static "Pickup / Here" label. If the
 * label ever needs to be dynamic, the JSX child is the easy place to do it.
 */
import { memo, useCallback } from 'react';
import Mapbox from '@rnmapbox/maps';

import BoltPin from './BoltPin';
import { fromLngLat } from './mapboxGeo';

const DraggablePickupMarker = memo(({ coordinate, onDragEnd }) => {
  const lat = coordinate?.latitude;
  const lng = coordinate?.longitude;
  const isValid = isFinite(lat) && isFinite(lng);

  const handleDragEnd = useCallback(
    (e) => {
      if (!onDragEnd) return;
      const coords = e?.geometry?.coordinates;
      const point = fromLngLat(coords);
      if (point) onDragEnd(point);
    },
    [onDragEnd]
  );

  if (!isValid) return null;

  return (
    <Mapbox.PointAnnotation
      id="draggable-pickup"
      coordinate={[lng, lat]}
      anchor={{ x: 0.5, y: 1 }}
      draggable
      onDragEnd={handleDragEnd}
    >
      <BoltPin color="#10B981" caption="Pickup" title="Here" />
    </Mapbox.PointAnnotation>
  );
});

DraggablePickupMarker.displayName = 'DraggablePickupMarker';
export default DraggablePickupMarker;
