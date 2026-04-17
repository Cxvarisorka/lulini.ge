import { memo, useCallback, useEffect, useState } from 'react';
import Marker from './MarkerWrapper';
import BoltPin from './BoltPin';

const DestinationMarker = memo(({
  coordinate,
  draggable = false,
  onDragEnd,
  etaMinutes,
}) => {
  const handleDragEnd = useCallback((e) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    onDragEnd?.({ latitude, longitude });
  }, [onDragEnd]);

  const title = etaMinutes != null ? `${etaMinutes} min` : 'Drop off';

  // Briefly enable tracksViewChanges so the marker bitmap captures the
  // current title, then turn it off so map inertia isn't jittered by
  // per-frame re-rasterization. Re-enables whenever the title changes.
  const [tracksView, setTracksView] = useState(true);
  useEffect(() => {
    setTracksView(true);
    const t = setTimeout(() => setTracksView(false), 400);
    return () => clearTimeout(t);
  }, [title]);

  return (
    <Marker
      coordinate={coordinate}
      anchor={{ x: 0.5, y: 1 }}
      draggable={draggable}
      onDragEnd={draggable ? handleDragEnd : undefined}
      tracksViewChanges={draggable || tracksView}
      zIndex={10}
      stopPropagation={draggable}
    >
      <BoltPin color="#111827" caption="Dropoff" title={title} icon="car" />
    </Marker>
  );
});

DestinationMarker.displayName = 'DestinationMarker';

export default DestinationMarker;
