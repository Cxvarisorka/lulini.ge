/**
 * AnimatedCarMarker
 *
 * Smooth Uber-like car marker:
 *   - iOS: Top-down car SVG-style shape with smooth rotation
 *   - Android: Pre-rendered PNG + animateMarkerToCoordinate()
 *   - GPS noise filtering (ignores < 2m movements)
 *   - Heading rotation only on significant movement (> 8m)
 *
 * Props:
 *   coordinate  { latitude, longitude }  — target position
 *   isAssigned  boolean                  — true = assigned driver (larger)
 */
import { useRef, useEffect, useState, memo } from 'react';
import { View, StyleSheet, Platform, Animated } from 'react-native';
import AnimatedMarker from './AnimatedMarkerWrapper';
import Marker from './MarkerWrapper';
import { markerImages } from './markerImages';

const isIOS = Platform.OS === 'ios';

const MIN_MOVE_KM = 0.002;
const MIN_HEADING_KM = 0.008;
const MIN_ANIMATION_MS = 500;
const MAX_ANIMATION_MS = 3000;

function quickDistance(lat1, lng1, lat2, lng2) {
  const dlat = (lat2 - lat1) * 111.32;
  const dlng = (lng2 - lng1) * 111.32 * Math.cos(lat1 * 0.01745329);
  return Math.sqrt(dlat * dlat + dlng * dlng);
}

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

function shortestRotation(from, to) {
  let diff = ((to - from + 540) % 360) - 180;
  return from + diff;
}

/** Top-down car shape for iOS */
const TopDownCar = memo(({ isAssigned, rotation }) => {
  const s = isAssigned ? 1.3 : 1;
  return (
    <View style={[styles.carWrapper, { width: 32 * s, height: 32 * s }]}>
      <View style={[styles.carOuter, {
        width: 16 * s,
        height: 28 * s,
        borderRadius: 5 * s,
        transform: [{ rotate: `${rotation}deg` }],
      }]}>
        {/* Windshield */}
        <View style={[styles.windshield, {
          width: 12 * s,
          height: 6 * s,
          borderRadius: 3 * s,
          top: 3 * s,
        }]} />
        {/* Rear window */}
        <View style={[styles.rearWindow, {
          width: 10 * s,
          height: 4 * s,
          borderRadius: 2 * s,
          bottom: 4 * s,
        }]} />
      </View>
    </View>
  );
});
TopDownCar.displayName = 'TopDownCar';

const ROTATION_DURATION = 300; // ms for smooth rotation animation

const AnimatedCarMarker = memo(
  ({ coordinate, isAssigned = false }) => {
    const lat = coordinate?.latitude;
    const lng = coordinate?.longitude;
    const serverHeading = coordinate?.heading; // from server GPS data
    const isValid = isFinite(lat) && isFinite(lng);

    const markerRef = useRef(null);
    const prevCoord = useRef(null);
    const lastUpdateTime = useRef(Date.now());
    const headingTarget = useRef(0);

    // iOS: plain state rotation (used in JSX transform)
    const [iosRotation, setIosRotation] = useState(0);

    // Android: Animated.Value for smooth rotation interpolation
    const androidRotation = useRef(new Animated.Value(0)).current;
    const androidRotationValue = useRef(0); // tracks current numeric value

    if (!prevCoord.current && isValid) {
      prevCoord.current = { latitude: lat, longitude: lng };
    }

    useEffect(() => {
      if (!isValid) return;

      const prev = prevCoord.current;
      if (!prev) {
        prevCoord.current = { latitude: lat, longitude: lng };
        return;
      }

      if (prev.latitude === lat && prev.longitude === lng) return;

      const distKm = quickDistance(prev.latitude, prev.longitude, lat, lng);
      if (distKm < MIN_MOVE_KM) return;

      const now = Date.now();
      const elapsed = now - lastUpdateTime.current;
      const duration = Math.max(
        MIN_ANIMATION_MS,
        Math.min(elapsed * 0.8, MAX_ANIMATION_MS)
      );
      lastUpdateTime.current = now;

      if (!isIOS) {
        try {
          markerRef.current?.animateMarkerToCoordinate?.(
            { latitude: lat, longitude: lng },
            duration
          );
        } catch {
          // Fallback: coordinate prop update
        }
      }

      // Use GPS-derived bearing for significant movement, fall back to server heading
      let newBearing = null;
      if (distKm >= MIN_HEADING_KM) {
        newBearing = calcBearing(prev, { latitude: lat, longitude: lng });
      } else if (serverHeading != null && isFinite(serverHeading) && serverHeading >= 0) {
        // Server GPS heading available — use it for short movements
        newBearing = serverHeading;
      }

      if (newBearing !== null) {
        const smoothTarget = shortestRotation(headingTarget.current, newBearing);
        headingTarget.current = smoothTarget;

        if (isIOS) {
          setIosRotation(smoothTarget);
        } else {
          androidRotationValue.current = smoothTarget;
          Animated.timing(androidRotation, {
            toValue: smoothTarget,
            duration: ROTATION_DURATION,
            useNativeDriver: false,
          }).start();
        }
      }

      prevCoord.current = { latitude: lat, longitude: lng };
    }, [lat, lng, isValid]);

    if (!isValid) return null;

    const coord = prevCoord.current || { latitude: lat, longitude: lng };

    if (!isIOS) {
      return (
        <AnimatedMarker
          ref={markerRef}
          coordinate={coord}
          image={isAssigned ? markerImages.carAssigned : markerImages.car}
          anchor={{ x: 0.5, y: 0.5 }}
          flat={true}
          rotation={androidRotation}
          tracksViewChanges={false}
          zIndex={isAssigned ? 8 : 4}
        />
      );
    }

    // iOS: keep existing JSX-based rendering untouched
    return (
      <Marker
        coordinate={coord}
        anchor={{ x: 0.5, y: 0.5 }}
        flat={true}
        rotation={iosRotation}
        tracksViewChanges={false}
        image={isAssigned ? markerImages.carAssigned : markerImages.car}
        zIndex={isAssigned ? 8 : 4}
      />
    );
  },
  (prev, next) =>
    prev.coordinate?.latitude === next.coordinate?.latitude &&
    prev.coordinate?.longitude === next.coordinate?.longitude &&
    prev.coordinate?.heading === next.coordinate?.heading &&
    prev.isAssigned === next.isAssigned
);

AnimatedCarMarker.displayName = 'AnimatedCarMarker';

export default AnimatedCarMarker;

const styles = StyleSheet.create({
  carWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  carOuter: {
    backgroundColor: '#1A1A2E',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 3,
  },
  windshield: {
    position: 'absolute',
    backgroundColor: 'rgba(135,206,250,0.6)',
  },
  rearWindow: {
    position: 'absolute',
    backgroundColor: 'rgba(135,206,250,0.4)',
  },
});
