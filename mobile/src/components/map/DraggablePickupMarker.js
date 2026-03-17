/**
 * DraggablePickupMarker
 *
 * Blue draggable pin for custom pickup location.
 * Only shown when user selects a pickup different from GPS.
 * Uses markerImages.pickup (PNG) on both platforms for consistency.
 */
import { memo, useCallback } from 'react';
import Marker from './MarkerWrapper';
import { markerImages } from './markerImages';

const DraggablePickupMarker = memo(({
  coordinate,
  onDragEnd,
}) => {
  const lat = coordinate?.latitude;
  const lng = coordinate?.longitude;
  const isValid = isFinite(lat) && isFinite(lng);

  const handleDragEnd = useCallback((e) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    onDragEnd?.({ latitude, longitude });
  }, [onDragEnd]);

  if (!isValid) return null;

  return (
    <Marker
      coordinate={{ latitude: lat, longitude: lng }}
      image={markerImages.pickup}
      anchor={{ x: 0.5, y: 1 }}
      draggable
      onDragEnd={handleDragEnd}
      tracksViewChanges={false}
      zIndex={10}
      stopPropagation
    />
  );
});

DraggablePickupMarker.displayName = 'DraggablePickupMarker';
export default DraggablePickupMarker;
