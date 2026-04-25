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
import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
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

  // Style-swap state machine.
  //
  // Problem: on theme toggle, rnmapbox processes `styleURL` updates and child
  // layer removes on the same native tick. The style swap often wins, leaving
  // child layers orphaned in the new style — they fail to re-insert (polyline
  // anchored `aboveLayerID="road-label"` → `unmetPositionDependency`), then
  // their unmount logs `Layer X does not exist`.
  //
  // Fix: split the transition into three distinct React commits, each a pure
  // operation for Mapbox:
  //   ready      → children mounted, MapView.styleURL = appliedStyle
  //   unmounting → children null, MapView.styleURL = old applied (unchanged)
  //                → a single commit that ONLY removes child layers; no style
  //                  swap in flight, so removes always succeed.
  //   loading    → children null, MapView.styleURL = new applied
  //                → a single commit that ONLY swaps the style; no children
  //                  to orphan. Waits for `onDidFinishLoadingStyle`.
  //
  // Each transition is driven by an effect so the previous commit's native
  // work has flushed before the next begins.
  const [phase, setPhase] = useState('ready');
  const [appliedStyle, setAppliedStyle] = useState(resolvedStyle);

  // ready → unmounting: the parent is requesting a different style.
  useEffect(() => {
    if (phase === 'ready' && appliedStyle !== resolvedStyle) {
      setPhase('unmounting');
    }
  }, [phase, appliedStyle, resolvedStyle]);

  // unmounting → loading: children have unmounted in the previous commit, now
  // swap the style in isolation.
  useEffect(() => {
    if (phase === 'unmounting') {
      setAppliedStyle(resolvedStyle);
      setPhase('loading');
    }
  }, [phase, resolvedStyle]);

  // loading → ready: new style finished loading; safe to remount children.
  const handleDidFinishLoadingStyle = useCallback(() => {
    setPhase((p) => (p === 'loading' ? 'ready' : p));
  }, []);

  // Safety fallback — don't hang children forever if the load event misses.
  useEffect(() => {
    if (phase !== 'loading') return;
    const timer = setTimeout(() => {
      setPhase((p) => (p === 'loading' ? 'ready' : p));
    }, 3000);
    return () => clearTimeout(timer);
  }, [phase]);

  const childrenMounted = phase === 'ready';

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
      styleURL={appliedStyle}
      pitchEnabled={pitchEnabled}
      rotateEnabled={rotateEnabled}
      scrollEnabled={scrollEnabled}
      zoomEnabled={zoomEnabled}
      compassEnabled={showsCompass}
      attributionEnabled={false}
      logoEnabled={false}
      scaleBarEnabled={false}
      onPress={onPress ? handlePress : undefined}
      onLongPress={onLongPress ? handleLongPress : undefined}
      onCameraChanged={handleCameraChanged}
      onDidFinishLoadingMap={onMapReady}
      onDidFinishLoadingStyle={handleDidFinishLoadingStyle}
      {...rest}
    >
      <Mapbox.Camera ref={cameraRef} defaultSettings={defaultCamera} animationMode="none" />
      <Mapbox.Images images={IMAGE_MAP} />
      {showsUserLocation ? <Mapbox.UserLocation visible={true} animated={true} /> : null}
      {childrenMounted ? children : null}
    </Mapbox.MapView>
  );
}

export default memo(forwardRef(MapViewWrapper));
