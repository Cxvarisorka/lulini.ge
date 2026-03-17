/**
 * MarkerWrapper
 *
 * Thin wrapper around react-native-maps Marker.
 * Supports the `image` prop for native PNG rendering on Google Maps
 * (bypasses bitmap-snapshotting of JSX children).
 *
 * Defensive: validates coordinate prop before passing to native.
 */
import { forwardRef } from 'react';

const { Marker } = require('react-native-maps');

function isValidCoord(coord) {
  if (!coord) return false;
  const lat = coord.latitude;
  const lng = coord.longitude;
  return (
    typeof lat === 'number' && isFinite(lat) && lat >= -90 && lat <= 90 &&
    typeof lng === 'number' && isFinite(lng) && lng >= -180 && lng <= 180
  );
}

export default forwardRef(function MarkerWrapper({ id, image, children, coordinate, ...props }, ref) {
  if (!isValidCoord(coordinate)) return null;

  return (
    <Marker ref={ref} image={image} coordinate={coordinate} {...props}>
      {!image ? children : null}
    </Marker>
  );
});
