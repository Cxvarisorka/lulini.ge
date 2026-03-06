/**
 * MarkerWrapper
 *
 * Thin wrapper around react-native-maps Marker.
 * Supports the `image` prop for native PNG rendering on Google Maps
 * (bypasses bitmap-snapshotting of JSX children).
 */
import { forwardRef } from 'react';

const { Marker } = require('react-native-maps');

export default forwardRef(function MarkerWrapper({ image, children, ...props }, ref) {
  return (
    <Marker ref={ref} image={image} {...props}>
      {!image ? children : null}
    </Marker>
  );
});
