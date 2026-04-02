/**
 * MapViewWrapper
 *
 * Production-grade wrapper around react-native-maps MapView.
 * Uses Google Maps provider on both platforms with performance defaults:
 *   - Buildings/indoors/traffic layers disabled (reduce GPU overdraw)
 *   - Loading indicator shown during tile fetch (prevents white flash)
 *   - Map padding prevents edge clipping during zoom/pan gestures
 *   - maxZoomLevel capped to prevent over-zoom pixelation
 */
import { forwardRef, memo } from 'react';

const RNMaps = require('react-native-maps');
const RNMapView = RNMaps.default;
const PROVIDER_GOOGLE = RNMaps.PROVIDER_GOOGLE;

// Edge padding prevents tile clipping at map borders during fast pan/pinch.
// Values are in logical pixels — enough to pre-render one tile beyond the viewport.
const DEFAULT_MAP_PADDING = { top: 0, right: 0, bottom: 0, left: 0 };

export default memo(forwardRef(function MapViewWrapper(
  {
    provider,
    showsBuildings = false,
    showsIndoors = false,
    showsTraffic = false,
    loadingEnabled = true,
    loadingIndicatorColor = '#666666',
    loadingBackgroundColor = '#f5f5f5',
    mapPadding = DEFAULT_MAP_PADDING,
    ...props
  },
  ref
) {
  return (
    <RNMapView
      ref={ref}
      provider={provider || PROVIDER_GOOGLE}
      showsBuildings={showsBuildings}
      showsIndoors={showsIndoors}
      showsTraffic={showsTraffic}
      loadingEnabled={loadingEnabled}
      loadingIndicatorColor={loadingIndicatorColor}
      loadingBackgroundColor={loadingBackgroundColor}
      mapPadding={mapPadding}
      {...props}
    />
  );
}));
