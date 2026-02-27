/**
 * AnimatedCarMarker
 *
 * Smooth Uber-like car marker with:
 *   - Native position interpolation via animateMarkerToCoordinate()
 *   - GPS noise filtering (ignores < 2m movements)
 *   - Heading rotation only on significant movement (> 8m)
 *   - Adaptive animation duration based on update interval
 *   - tracksViewChanges managed to avoid Android bitmap re-rasterization
 *
 * Props:
 *   coordinate  { latitude, longitude }  — target position
 *   isAssigned  boolean                  — true = assigned driver (larger)
 */
import { useRef, useEffect, useState, memo } from 'react';
import { View, Animated as RNAnimated, StyleSheet, Platform, Easing } from 'react-native';
import { Marker } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';

// --- Tuning constants ---
const ROTATION_DURATION = 400;
// How long to keep tracksViewChanges=true after a heading update.
// Must be long enough for the native bitmap snapshot, then turn off
// to avoid constant re-rasterization (the #1 Android map perf killer).
const TRACKS_CHANGES_WINDOW_MS = 600;
// GPS noise thresholds
const MIN_MOVE_KM = 0.002;    // 2m — below this, ignore (GPS jitter)
const MIN_HEADING_KM = 0.008; // 8m — below this, don't recalculate heading
// Position animation bounds
const MIN_ANIMATION_MS = 500;
const MAX_ANIMATION_MS = 3000;

// Fast approximate distance in km — avoids expensive trig, good for < 10km
function quickDistance(lat1, lng1, lat2, lng2) {
  const dlat = (lat2 - lat1) * 111.32;
  const dlng = (lng2 - lng1) * 111.32 * Math.cos(lat1 * 0.01745329);
  return Math.sqrt(dlat * dlat + dlng * dlng);
}

// Bearing from point A → B in degrees (0 = north, clockwise)
function calcBearing(from, to) {
  const toRad = (d) => d * 0.01745329;
  const dLng = toRad(to.longitude - from.longitude);
  const lat1 = toRad(from.latitude);
  const lat2 = toRad(to.latitude);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (Math.atan2(y, x) * 57.29577951 + 360) % 360;
}

// Shortest rotation direction between two angles (avoids 360 spin)
function shortestRotation(from, to) {
  return from + (((to - from + 540) % 360) - 180);
}

const AnimatedCarMarker = memo(
  ({ coordinate, isAssigned = false }) => {
    const lat = coordinate?.latitude;
    const lng = coordinate?.longitude;
    const isValid = isFinite(lat) && isFinite(lng);

    const markerRef = useRef(null);
    const prevCoord = useRef(null);
    const lastUpdateTime = useRef(Date.now());
    const headingTarget = useRef(0);
    const heading = useRef(new RNAnimated.Value(0)).current;

    // tracksViewChanges strategy:
    // - Assigned driver (single marker): always true — negligible perf cost,
    //   guarantees rotation animation is always visible on Android.
    // - Non-assigned/nearby (bulk markers): toggle on briefly for bitmap
    //   snapshot, then off to avoid re-rasterization of 50+ markers.
    const [tracksChanges, setTracksChanges] = useState(true);
    const tracksTimerRef = useRef(null);

    // Set initial coordinate on first valid render (before effects run)
    if (!prevCoord.current && isValid) {
      prevCoord.current = { latitude: lat, longitude: lng };
    }

    useEffect(() => {
      if (!isValid) return;

      const prev = prevCoord.current;
      if (!prev) {
        prevCoord.current = { latitude: lat, longitude: lng };
        // For non-assigned (bulk) markers: snapshot bitmap then disable tracking.
        // For assigned (single) marker: stay true always for reliable display.
        if (!isAssigned) {
          tracksTimerRef.current = setTimeout(
            () => setTracksChanges(false),
            TRACKS_CHANGES_WINDOW_MS
          );
        }
        return;
      }

      // Same position — nothing to do
      if (prev.latitude === lat && prev.longitude === lng) return;

      const distKm = quickDistance(prev.latitude, prev.longitude, lat, lng);

      // Filter GPS noise — ignore movements under 2 meters
      if (distKm < MIN_MOVE_KM) return;

      // === SMOOTH POSITION INTERPOLATION ===
      // Use native marker animation for Uber-like gliding movement.
      // Duration adapts to update interval: if updates come every 3s,
      // animation takes ~2.4s (80%), creating continuous motion.
      const now = Date.now();
      const elapsed = now - lastUpdateTime.current;
      const duration = Math.max(
        MIN_ANIMATION_MS,
        Math.min(elapsed * 0.8, MAX_ANIMATION_MS)
      );
      lastUpdateTime.current = now;

      // animateMarkerToCoordinate is only available on Android (Google Maps).
      // On iOS (Apple Maps) it throws a native bridge error, so skip it entirely.
      if (Platform.OS === 'android') {
        try {
          markerRef.current?.animateMarkerToCoordinate?.(
            { latitude: lat, longitude: lng },
            duration
          );
        } catch {
          // Fallback: coordinate prop updates on next render via prevCoord
        }
      }

      // === HEADING / ROTATION ===
      // Only recalculate heading for significant movement (> 8m).
      // This prevents erratic rotation from GPS jitter.
      if (distKm >= MIN_HEADING_KM) {
        const newBearing = calcBearing(prev, { latitude: lat, longitude: lng });
        const smoothTarget = shortestRotation(headingTarget.current, newBearing);
        headingTarget.current = smoothTarget;

        // For non-assigned markers: briefly enable tracksViewChanges so
        // Android re-snapshots the rotated bitmap, then disable again.
        // Assigned markers always have it enabled, so skip the toggle.
        if (!isAssigned) {
          setTracksChanges(true);
          if (tracksTimerRef.current) clearTimeout(tracksTimerRef.current);
          tracksTimerRef.current = setTimeout(
            () => setTracksChanges(false),
            TRACKS_CHANGES_WINDOW_MS
          );
        }

        RNAnimated.timing(heading, {
          toValue: smoothTarget,
          duration: ROTATION_DURATION,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }).start();
      }

      prevCoord.current = { latitude: lat, longitude: lng };
    }, [lat, lng, isValid, heading]);

    // Cleanup timer on unmount
    useEffect(() => {
      return () => {
        if (tracksTimerRef.current) clearTimeout(tracksTimerRef.current);
      };
    }, []);

    if (!isValid) return null;

    // Extended range supports many full rotations from shortestRotation accumulation
    const rotation = heading.interpolate({
      inputRange: [-3600, 0, 3600],
      outputRange: ['-3600deg', '0deg', '3600deg'],
    });

    const size = isAssigned ? 38 : 30;
    // Extra padding prevents Android bitmap clipping. Android rasterizes
    // the marker View into a bitmap cropped to the root view bounds —
    // tight padding causes borders/shadows to get sliced off.
    // 28px extra (14px/side) gives room for border + rotation transform.
    const wrapperSize = size + 28;

    return (
      <Marker
        ref={markerRef}
        // Use prevCoord (previous position) as the prop value.
        // The native animateMarkerToCoordinate() handles smooth
        // movement from here to the actual target position.
        coordinate={prevCoord.current || { latitude: lat, longitude: lng }}
        anchor={{ x: 0.5, y: 0.5 }}
        flat={true}
        tracksViewChanges={isAssigned || tracksChanges}
        zIndex={isAssigned ? 8 : 4}
      >
        <View
          style={[styles.wrapper, { width: wrapperSize, height: wrapperSize }]}
        >
          <RNAnimated.View
            style={[
              styles.circle,
              {
                width: size,
                height: size,
                borderRadius: size / 2,
                transform: [{ rotate: rotation }],
              },
              isAssigned && styles.assigned,
            ]}
          >
            <Ionicons
              name="car-sport"
              size={isAssigned ? 20 : 15}
              color="#fff"
            />
          </RNAnimated.View>
        </View>
      </Marker>
    );
  },
  (prev, next) =>
    prev.coordinate?.latitude === next.coordinate?.latitude &&
    prev.coordinate?.longitude === next.coordinate?.longitude &&
    prev.isAssigned === next.isAssigned
);

AnimatedCarMarker.displayName = 'AnimatedCarMarker';

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    // Android collapses Views with no visual properties during bitmap capture,
    // causing the marker to be clipped. A near-invisible background forces
    // Android to respect the full wrapper dimensions in the bitmap.
    ...Platform.select({
      android: { backgroundColor: 'rgba(255,255,255,0.01)' },
      ios: {},
    }),
  },
  circle: {
    backgroundColor: '#374151',
    borderWidth: 2.5,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
      },
      android: {},
    }),
  },
  assigned: {
    backgroundColor: '#171717',
    borderWidth: 3,
    ...Platform.select({
      ios: {
        shadowOpacity: 0.45,
      },
      android: {},
    }),
  },
});

export default AnimatedCarMarker;
