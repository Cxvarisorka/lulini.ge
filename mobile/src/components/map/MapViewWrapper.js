/**
 * MapViewWrapper
 *
 * Thin wrapper around react-native-maps MapView.
 * Uses Google Maps provider on Android.
 */
import { forwardRef } from 'react';
import { Platform } from 'react-native';

const RNMaps = require('react-native-maps');
const RNMapView = RNMaps.default;
const PROVIDER_GOOGLE = RNMaps.PROVIDER_GOOGLE;

const isAndroid = Platform.OS === 'android';

export default forwardRef(function MapViewWrapper({ provider, ...props }, ref) {
  return (
    <RNMapView
      ref={ref}
      provider={isAndroid ? PROVIDER_GOOGLE : undefined}
      {...props}
    />
  );
});
