/**
 * DestinationMarker
 *
 * Red destination pin — uses PNG image on both iOS and Android
 * for consistent appearance across platforms.
 */
import { memo } from 'react';
import Marker from './MarkerWrapper';
import { markerImages } from './markerImages';

const DestinationMarker = memo(({ coordinate }) => (
  <Marker
    coordinate={coordinate}
    image={markerImages.destination}
    anchor={{ x: 0.5, y: 1 }}
    tracksViewChanges={false}
    zIndex={10}
  />
));

DestinationMarker.displayName = 'DestinationMarker';

export default DestinationMarker;
