/**
 * MapViewWrapper
 *
 * Mapbox-backed wrapper that preserves the `react-native-maps` external API.
 * Consumers continue to call `mapRef.current.fitToCoordinates(...)`,
 * `animateToRegion(...)`, and `animateCamera(...)` as before; the wrapper
 * routes them to the underlying `<Mapbox.Camera>` ref via
 * `useImperativeHandle`.
 *
 * Children render unchanged — `MarkerWrapper`, `PolylineWrapper`,
 * `AnimatedCarMarker`, etc. each emit Mapbox primitives (`ShapeSource` +
 * `SymbolLayer` / `LineLayer`) and live as direct children of `<Mapbox.MapView>`.
 *
 * Map style: pass `styleURL` directly, or `colorScheme: 'light' | 'dark'` for
 * the standard Mapbox light/dark presets. The legacy `customMapStyle` (Google
 * Maps JSON) prop is silently dropped — Mapbox uses GL-style URLs instead.
 */
import { forwardRef, memo, useCallback, useImperativeHandle, useMemo, useRef } from 'react';
import Mapbox from '@rnmapbox/maps';

import {
  bboxFromCoords,
  deltaToZoom,
  fromLngLat,
  resolveStyleURL,
  toLngLat,
  zoomToDelta,
} from './mapboxGeo';
import { buildMapboxImageMap } from './markerImages';

// One module-level snapshot — every map mounts the same image registry.
// Mapbox 10 treats `<Mapbox.Images>` as additive across mounts, so this is safe
// even with multiple maps on the screen tree.
const IMAGE_MAP = buildMapboxImageMap();

const DEFAULT_INITIAL_REGION = {
  latitude: 42.25,
  longitude: 42.7,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

// Edge padding default — matches the old wrapper's pre-render-one-tile heuristic.
const DEFAULT_FIT_PADDING = { top: 80, right: 50, bottom: 250, left: 50 };

function MapViewWrapper(
  {
    style,
    // Mapbox style — pass either of these (`styleURL` wins if both supplied).
    styleURL,
    colorScheme = 'light',
    // initialRegion mirrors react-native-maps; used as the Camera's defaultSettings.
    initialRegion,
    // Gesture toggles (Mapbox supports these natively).
    pitchEnabled = true,
    rotateEnabled = true,
    scrollEnabled = true,
    zoomEnabled = true,
    showsCompass = false,
    // showsUserLocation mounts <Mapbox.UserLocation>.
    showsUserLocation = false,
    // Lifecycle callbacks (translated to Mapbox event names).
    onMapReady,
    onRegionChangeComplete,
    onPanDrag,
    onPress,
    onLongPress,
    children,
    // ─── Silently-dropped legacy props ─────────────────────────────────
    // (Accepted to avoid breaking screens; logged in __DEV__ only.)
    /* eslint-disable no-unused-vars */
    provider,
    customMapStyle,
    showsBuildings,
    showsIndoors,
    showsTraffic,
    loadingEnabled,
    loadingIndicatorColor,
    loadingBackgroundColor,
    showsMyLocationButton,
    toolbarEnabled,
    moveOnMarkerPress,
    mapPadding,
    /* eslint-enable no-unused-vars */
    ...rest
  },
  ref
) {
  const mapRef = useRef(null);
  const cameraRef = useRef(null);

  const resolvedStyle = useMemo(
    () => resolveStyleURL({ styleURL, colorScheme }),
    [styleURL, colorScheme]
  );

  // Default camera settings — applied once on first mount, ignored on prop change.
  const defaultCamera = useMemo(() => {
    const region = initialRegion || DEFAULT_INITIAL_REGION;
    return {
      centerCoordinate: [region.longitude, region.latitude],
      zoomLevel: deltaToZoom(region.latitudeDelta),
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Imperative API surface (matches react-native-maps) ──────────────
  useImperativeHandle(
    ref,
    () => ({
      // react-native-maps signature: fitToCoordinates(coords, { edgePadding, animated })
      fitToCoordinates(coords, opts = {}) {
        const cam = cameraRef.current;
        if (!cam) return;
        const bbox = bboxFromCoords(coords);
        if (!bbox) return;
        const pad = opts.edgePadding || DEFAULT_FIT_PADDING;
        const animated = opts.animated !== false;
        cam.fitBounds(bbox.ne, bbox.sw, [pad.top, pad.right, pad.bottom, pad.left], animated ? 500 : 0);
      },
      // react-native-maps signature: animateToRegion(region, duration?)
      animateToRegion(region, duration = 300) {
        const cam = cameraRef.current;
        if (!cam || !region) return;
        cam.setCamera({
          centerCoordinate: [region.longitude, region.latitude],
          zoomLevel: deltaToZoom(region.latitudeDelta),
          animationDuration: duration,
          animationMode: duration > 0 ? 'easeTo' : 'none',
        });
      },
      // react-native-maps signature: animateCamera({ center, zoom, pitch, heading }, { duration })
      animateCamera(camera = {}, opts = {}) {
        const cam = cameraRef.current;
        if (!cam) return;
        const center = camera.center;
        cam.setCamera({
          centerCoordinate: center ? [center.longitude, center.latitude] : undefined,
          zoomLevel: typeof camera.zoom === 'number' ? camera.zoom : undefined,
          pitch: typeof camera.pitch === 'number' ? camera.pitch : undefined,
          heading: typeof camera.heading === 'number' ? camera.heading : undefined,
          animationDuration: opts.duration ?? 500,
          animationMode: 'easeTo',
        });
      },
      // Escape hatch for advanced consumers — rarely used.
      getMapboxRef() {
        return mapRef.current;
      },
      getCameraRef() {
        return cameraRef.current;
      },
    }),
    []
  );

  // ─── Translate onCameraChanged → onRegionChangeComplete + onPanDrag ──
  // The old `onPanDrag` event fired on user-driven pan gestures only. Mapbox
  // exposes `state.gestures.isGestureActive` on the camera-changed payload —
  // we use that as a proxy for the same intent.
  const lastWasGesture = useRef(false);
  const handleCameraChanged = useCallback(
    (e) => {
      const props = e?.properties || {};
      const center = props.center || props.centerCoordinate;
      const zoom = props.zoom ?? props.zoomLevel;
      const isUserGesture = !!(props.gestures && props.gestures.isGestureActive);

      if (isUserGesture && !lastWasGesture.current && onPanDrag) {
        // Edge-trigger: fire once on gesture start
        onPanDrag({ nativeEvent: { coordinate: center ? fromLngLat(center) : null } });
      }
      lastWasGesture.current = isUserGesture;

      if (onRegionChangeComplete && !isUserGesture && center) {
        const delta = zoomToDelta(zoom);
        onRegionChangeComplete({
          latitude: center[1],
          longitude: center[0],
          latitudeDelta: delta,
          longitudeDelta: delta,
        });
      }
    },
    [onPanDrag, onRegionChangeComplete]
  );

  // ─── onPress / onLongPress translation ────────────────────────────────
  // Mapbox's event payload uses GeoJSON [lng, lat]; map back to {latitude, longitude}.
  const handlePress = useCallback(
    (feature) => {
      if (!onPress) return;
      const coords = feature?.geometry?.coordinates;
      const point = toLngLat
        ? fromLngLat(coords)
        : null;
      onPress({ nativeEvent: { coordinate: point } });
    },
    [onPress]
  );
  const handleLongPress = useCallback(
    (feature) => {
      if (!onLongPress) return;
      const coords = feature?.geometry?.coordinates;
      onLongPress({ nativeEvent: { coordinate: fromLngLat(coords) } });
    },
    [onLongPress]
  );

  return (
    <Mapbox.MapView
      ref={mapRef}
      style={style}
      styleURL={resolvedStyle}
      pitchEnabled={pitchEnabled}
      rotateEnabled={rotateEnabled}
      scrollEnabled={scrollEnabled}
      zoomEnabled={zoomEnabled}
      compassEnabled={showsCompass}
      attributionEnabled={false}
      logoEnabled={false}
      onPress={onPress ? handlePress : undefined}
      onLongPress={onLongPress ? handleLongPress : undefined}
      onCameraChanged={handleCameraChanged}
      onDidFinishLoadingMap={onMapReady}
      {...rest}
    >
      <Mapbox.Camera ref={cameraRef} defaultSettings={defaultCamera} animationMode="none" />
      <Mapbox.Images images={IMAGE_MAP} />
      {showsUserLocation ? <Mapbox.UserLocation visible={true} animated={true} /> : null}
      {children}
    </Mapbox.MapView>
  );
}

export default memo(forwardRef(MapViewWrapper));
