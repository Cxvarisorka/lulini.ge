import { memo, useCallback, useEffect, useState } from 'react';
import Marker from './MarkerWrapper';
import BoltPin from './BoltPin';

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

  // Capture the JSX bitmap briefly on mount, then stop tracking so map
  // inertia isn't jittered by per-frame marker re-rasterization.
  const [tracksView, setTracksView] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setTracksView(false), 400);
    return () => clearTimeout(t);
  }, []);

  if (!isValid) return null;

  return (
    <Marker
      coordinate={{ latitude: lat, longitude: lng }}
      anchor={{ x: 0.5, y: 1 }}
      draggable
      onDragEnd={handleDragEnd}
      tracksViewChanges={tracksView}
      zIndex={10}
      stopPropagation
    >
      <BoltPin color="#10B981" caption="Pickup" title="Here" />
    </Marker>
  );
});

DraggablePickupMarker.displayName = 'DraggablePickupMarker';
export default DraggablePickupMarker;
