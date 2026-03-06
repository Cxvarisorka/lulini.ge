/**
 * AnimatedMarkerWrapper
 *
 * Wraps react-native-maps Marker.Animated for smooth position interpolation.
 * Supports `image` prop + native `rotation` for Google Maps compatibility.
 */
import { forwardRef } from 'react';

const { Marker: RNMarker } = require('react-native-maps');
const MarkerAnimated = RNMarker.Animated || require('react-native-maps').MarkerAnimated;

export default forwardRef(function AnimatedMarkerWrapper({ ...props }, ref) {
  return <MarkerAnimated ref={ref} {...props} />;
});
