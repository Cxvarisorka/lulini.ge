/**
 * PulsingUserMarker
 *
 * Static blue user location dot using pre-rendered PNG image.
 * Uses image prop on both iOS and Android for performance (no tracksViewChanges).
 */
import { memo } from 'react';
import Marker from './MarkerWrapper';
import { markerImages } from './markerImages';

const PulsingUserMarker = memo(({ coordinate }) => {
  const lat = coordinate?.latitude;
  const lng = coordinate?.longitude;
  const isValid = isFinite(lat) && isFinite(lng);

  if (!isValid) return null;

  return (
    <Marker
      coordinate={{ latitude: lat, longitude: lng }}
      image={markerImages.user}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={false}
      zIndex={5}
    />
  );
}, (prev, next) => {
  const pLat = prev.coordinate?.latitude;
  const pLng = prev.coordinate?.longitude;
  const nLat = next.coordinate?.latitude;
  const nLng = next.coordinate?.longitude;

  if (!isFinite(pLat) || !isFinite(pLng) || !isFinite(nLat) || !isFinite(nLng))
    return false;

  return Math.abs(nLat - pLat) < 0.0001 && Math.abs(nLng - pLng) < 0.0001;
});

PulsingUserMarker.displayName = 'PulsingUserMarker';

export default PulsingUserMarker;
