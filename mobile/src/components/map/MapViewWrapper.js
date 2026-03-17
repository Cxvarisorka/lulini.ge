/**
 * MapViewWrapper
 *
 * Thin wrapper around react-native-maps MapView.
 * Uses Google Maps provider on both platforms.
 */
import { forwardRef } from 'react';

const RNMaps = require('react-native-maps');
const RNMapView = RNMaps.default;
const PROVIDER_GOOGLE = RNMaps.PROVIDER_GOOGLE;

export default forwardRef(function MapViewWrapper({ provider, ...props }, ref) {
  return (
    <RNMapView
      ref={ref}
      provider={provider || PROVIDER_GOOGLE}
      {...props}
    />
  );
});
