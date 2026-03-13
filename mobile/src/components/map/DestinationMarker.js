/**
 * DestinationMarker
 *
 * Red destination pin — uses PNG image on both iOS and Android
 * for consistent appearance across platforms.
 * Optionally draggable (during ride options step) to adjust destination.
 */
import { memo, useCallback } from 'react';
import { Marker } from 'react-native-maps';
import { markerImages } from './markerImages';

const DestinationMarker = memo(({
  coordinate,
  draggable = false,
  onDragEnd,
}) => {
  const handleDragEnd = useCallback((e) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    onDragEnd?.({ latitude, longitude });
  }, [onDragEnd]);

  return (
    <Marker
      coordinate={coordinate}
      image={markerImages.destination}
      anchor={{ x: 0.5, y: 1 }}
      draggable={draggable}
      onDragEnd={draggable ? handleDragEnd : undefined}
      tracksViewChanges={false}
      zIndex={10}
      stopPropagation={draggable}
    />
  );
});

DestinationMarker.displayName = 'DestinationMarker';

export default DestinationMarker;
