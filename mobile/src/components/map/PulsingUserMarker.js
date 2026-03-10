/**
 * PulsingUserMarker
 *
 * Blue dot with pulsing ring animation for user's location.
 *   - iOS: Animated JSX with pulsing ring (native rendering, no clipping)
 *   - Android: Static PNG image (Google Maps clips JSX bitmap animations)
 *
 * Stability: Uses a lastValidCoord ref so the marker never disappears
 * if the parent briefly passes null/undefined during rapid state changes
 * (e.g. when a driver accepts a ride and 7+ setState calls fire at once).
 */
import { memo, useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing, Platform } from 'react-native';
import Marker from './MarkerWrapper';
import { markerImages } from './markerImages';

const isIOS = Platform.OS === 'ios';

const DOT_SIZE = 22;
const PULSE_MAX = 72;
const PULSE_DURATION = 2000;

const PulsingUserMarker = memo(({ coordinate, tappable = true }) => {
  const lat = coordinate?.latitude;
  const lng = coordinate?.longitude;
  const isValid = isFinite(lat) && isFinite(lng);

  // Keep last valid coordinate so the dot never vanishes during re-render storms
  const lastValidRef = useRef(null);
  if (isValid) {
    lastValidRef.current = { latitude: lat, longitude: lng };
  }

  const stableCoord = isValid
    ? { latitude: lat, longitude: lng }
    : lastValidRef.current;

  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isIOS) return; // no animation on Android
    const loop = Animated.loop(
      Animated.timing(pulseAnim, {
        toValue: 1,
        duration: PULSE_DURATION,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, []);

  // No valid coordinate ever received — nothing to show
  if (!stableCoord) return null;

  // Android: static PNG — avoids Google Maps JSX-to-bitmap clipping
  if (!isIOS) {
    return (
      <Marker
        coordinate={stableCoord}
        image={markerImages.user}
        anchor={{ x: 0.5, y: 0.5 }}
        tappable={tappable}
        tracksViewChanges={false}
        zIndex={5}
      />
    );
  }

  // iOS: animated JSX pulsing ring
  const pulseScale = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 1],
  });

  const pulseOpacity = pulseAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.6, 0.25, 0],
  });

  return (
    <Marker
      coordinate={stableCoord}
      anchor={{ x: 0.5, y: 0.5 }}
      tappable={tappable}
      tracksViewChanges={true}
      zIndex={5}
      style={styles.marker}
    >
      <View style={styles.container}>
        <Animated.View
          style={[
            styles.pulse,
            {
              transform: [{ scale: pulseScale }],
              opacity: pulseOpacity,
            },
          ]}
        />
        <View style={styles.dot} />
      </View>
    </Marker>
  );
}, (prev, next) => {
  // Always re-render if tappable changed
  if (prev.tappable !== next.tappable) return false;

  const pLat = prev.coordinate?.latitude;
  const pLng = prev.coordinate?.longitude;
  const nLat = next.coordinate?.latitude;
  const nLng = next.coordinate?.longitude;

  // If next coordinate is invalid, skip re-render — the ref keeps the dot visible
  if (!isFinite(nLat) || !isFinite(nLng)) return true;

  // If previous was invalid but next is valid, re-render to show the dot
  if (!isFinite(pLat) || !isFinite(pLng)) return false;

  return Math.abs(nLat - pLat) < 0.0001 && Math.abs(nLng - pLng) < 0.0001;
});

PulsingUserMarker.displayName = 'PulsingUserMarker';

export default PulsingUserMarker;

const styles = StyleSheet.create({
  marker: {
    width: PULSE_MAX,
    height: PULSE_MAX,
  },
  container: {
    width: PULSE_MAX,
    height: PULSE_MAX,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulse: {
    position: 'absolute',
    width: PULSE_MAX,
    height: PULSE_MAX,
    borderRadius: PULSE_MAX / 2,
    backgroundColor: 'rgba(66, 133, 244, 0.3)',
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: '#4285F4',
    borderWidth: 3,
    borderColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
  },
});
