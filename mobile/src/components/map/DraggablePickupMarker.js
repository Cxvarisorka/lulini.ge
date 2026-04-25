/**
 * DraggablePickupMarker
 *
 * Green pickup pin. Split into three pieces so iOS renders text reliably
 * in @rnmapbox/maps 10.x AND taps can trigger the pan-to-adjust flow:
 *   - `Mapbox.MarkerView` hosts the JSX `BoltPin` — real UIView overlay,
 *     text re-renders on prop change (unlike PointAnnotation's one-shot
 *     rasterisation on iOS). The BoltPin is wrapped in a `Pressable` so
 *     tapping it fires `onPress` (used to enter adjust-pin mode).
 *   - A transparent `Mapbox.PointAnnotation` at the same coord captures
 *     drag gestures — the only draggable primitive in rnmapbox.
 *
 * Live drag mirrors parent → local state so the MarkerView follows the
 * finger at native frame rate instead of snapping on release.
 */
import { memo, useCallback, useEffect, useState } from 'react';
import { View, Pressable } from 'react-native';
import Mapbox from '@rnmapbox/maps';

import BoltPin from './BoltPin';
import { fromLngLat } from './mapboxGeo';

const PICKUP_COLOR = '#10B981';
const ANCHOR_BOTTOM = { x: 0.5, y: 1 };

const HITBOX_SIZE = 56;
const hitboxStyle = {
  width: HITBOX_SIZE,
  height: HITBOX_SIZE,
  backgroundColor: 'transparent',
};

const DraggablePickupMarker = memo(({ coordinate, onDragEnd, onPress }) => {
  const parentLat = coordinate?.latitude;
  const parentLng = coordinate?.longitude;
  const isValid = isFinite(parentLat) && isFinite(parentLng);

  const [dragCoord, setDragCoord] = useState(null);

  useEffect(() => {
    setDragCoord(null);
  }, [parentLat, parentLng]);

  const handleDragStart = useCallback((e) => {
    const point = fromLngLat(e?.geometry?.coordinates);
    if (point) setDragCoord(point);
  }, []);

  const handleDrag = useCallback((e) => {
    const point = fromLngLat(e?.geometry?.coordinates);
    if (point) setDragCoord(point);
  }, []);

  const handleDragEnd = useCallback(
    (e) => {
      const point = fromLngLat(e?.geometry?.coordinates);
      if (point && onDragEnd) onDragEnd(point);
    },
    [onDragEnd]
  );

  if (!isValid) return null;

  const displayLat = dragCoord?.latitude ?? parentLat;
  const displayLng = dragCoord?.longitude ?? parentLng;

  return (
    <>
      <Mapbox.MarkerView
        coordinate={[displayLng, displayLat]}
        anchor={ANCHOR_BOTTOM}
        allowOverlap
      >
        <Pressable onPress={onPress} hitSlop={8}>
          <BoltPin color={PICKUP_COLOR} caption="Pickup" title="Here" />
        </Pressable>
      </Mapbox.MarkerView>
      <Mapbox.PointAnnotation
        id="pickup-drag-hitbox"
        coordinate={[parentLng, parentLat]}
        anchor={ANCHOR_BOTTOM}
        draggable
        onDragStart={handleDragStart}
        onDrag={handleDrag}
        onDragEnd={handleDragEnd}
      >
        <View style={hitboxStyle} collapsable={false} />
      </Mapbox.PointAnnotation>
    </>
  );
});

DraggablePickupMarker.displayName = 'DraggablePickupMarker';
export default DraggablePickupMarker;
