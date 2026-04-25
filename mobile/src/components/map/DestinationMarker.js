/**
 * DestinationMarker
 *
 * Dark pill pin for the dropoff. Same split as DraggablePickupMarker:
 *   - `Mapbox.MarkerView` hosts the JSX `BoltPin`, wrapped in a
 *     `Pressable` so tapping triggers the pan-to-adjust flow via
 *     `onPress`.
 *   - Transparent `Mapbox.PointAnnotation` drag hitbox, mounted only
 *     when `draggable` is true. Live onDrag updates a local coord so
 *     the MarkerView follows the finger at native frame rate.
 */
import { memo, useCallback, useEffect, useState } from 'react';
import { View, Pressable } from 'react-native';
import Mapbox from '@rnmapbox/maps';

import BoltPin from './BoltPin';
import { fromLngLat } from './mapboxGeo';

const DROPOFF_COLOR = '#111827';
const ANCHOR_BOTTOM = { x: 0.5, y: 1 };

const HITBOX_SIZE = 56;
const hitboxStyle = {
  width: HITBOX_SIZE,
  height: HITBOX_SIZE,
  backgroundColor: 'transparent',
};

const DestinationMarker = memo(({ coordinate, etaMinutes, draggable, onDragEnd, onPress }) => {
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
  const title = etaMinutes != null ? `${etaMinutes} min` : 'Here';

  return (
    <>
      <Mapbox.MarkerView
        coordinate={[displayLng, displayLat]}
        anchor={ANCHOR_BOTTOM}
        allowOverlap
      >
        <Pressable onPress={onPress} hitSlop={8}>
          <BoltPin color={DROPOFF_COLOR} caption="Drop off" title={title} />
        </Pressable>
      </Mapbox.MarkerView>
      {draggable && (
        <Mapbox.PointAnnotation
          id="dropoff-drag-hitbox"
          coordinate={[parentLng, parentLat]}
          anchor={ANCHOR_BOTTOM}
          draggable
          onDragStart={handleDragStart}
          onDrag={handleDrag}
          onDragEnd={handleDragEnd}
        >
          <View style={hitboxStyle} collapsable={false} />
        </Mapbox.PointAnnotation>
      )}
    </>
  );
});

DestinationMarker.displayName = 'DestinationMarker';
export default DestinationMarker;
