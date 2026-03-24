/**
 * AnimatedMarkerWrapper
 *
 * Wraps react-native-maps Marker.Animated for smooth position interpolation.
 * Supports `image` prop + native `rotation` for Google Maps compatibility.
 *
 * Defensive: validates coordinate before passing to native.
 */
import { forwardRef } from 'react';

const { Marker: RNMarker } = require('react-native-maps');
const MarkerAnimated = RNMarker.Animated || require('react-native-maps').MarkerAnimated;

function isValidCoord(coord) {
  if (!coord) return false;
  const lat = coord.latitude;
  const lng = coord.longitude;
  return (
    typeof lat === 'number' && isFinite(lat) && lat >= -90 && lat <= 90 &&
    typeof lng === 'number' && isFinite(lng) && lng >= -180 && lng <= 180
  );
}

export default forwardRef(function AnimatedMarkerWrapper({ coordinate, ...props }, ref) {
  if (!isValidCoord(coordinate)) return null;
  return <MarkerAnimated ref={ref} coordinate={coordinate} {...props} />;
});
