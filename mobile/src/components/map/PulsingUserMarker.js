import { useRef, useEffect, memo } from 'react';
import { View, Animated, StyleSheet, Platform } from 'react-native';
import { Marker } from 'react-native-maps';

const ANIM_DURATION = 2000;
const STAGGER_DELAY = 700;

const PulsingUserMarker = memo(({ coordinate }) => {
  const lat = coordinate?.latitude;
  const lng = coordinate?.longitude;
  const isValid = isFinite(lat) && isFinite(lng);

  const pulse1 = useRef(new Animated.Value(0)).current;
  const pulse2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isValid) return;

    const startAnimation = (anim, delay = 0) => {
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, {
            toValue: 1,
            duration: ANIM_DURATION,
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ])
      ).start();
    };

    startAnimation(pulse1);
    startAnimation(pulse2, STAGGER_DELAY);

    return () => {
      pulse1.stopAnimation();
      pulse2.stopAnimation();
    };
  }, [isValid, pulse1, pulse2]);

  if (!isValid) return null;

  const ringStyle = (anim, size, color) => ({
    width: size,
    height: size,
    borderRadius: size / 2,
    backgroundColor: color,
    position: 'absolute',
    transform: [
      {
        scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
      },
    ],
    opacity: anim.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.7, 0] }),
  });

  // tracksViewChanges must stay true for the pulse animation to be visible
  // on Android (bitmap re-capture picks up animated scale/opacity each frame).
  // Acceptable since there is only ONE user marker — not a bulk-marker perf issue.
  return (
    <Marker
      coordinate={{ latitude: lat, longitude: lng }}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={true}
      zIndex={5}
    >
      <View style={styles.container}>
        <Animated.View style={ringStyle(pulse2, 120, 'rgba(66,133,244,0.16)')} />
        <Animated.View style={ringStyle(pulse1, 90, 'rgba(66,133,244,0.32)')} />
        <View style={styles.dot} />
      </View>
    </Marker>
  );
}, (prev, next) => {
  const pLat = prev.coordinate?.latitude;
  const pLng = prev.coordinate?.longitude;
  const nLat = next.coordinate?.latitude;
  const nLng = next.coordinate?.longitude;

  if (!isFinite(pLat) || !isFinite(pLng) || !isFinite(nLat) || !isFinite(nLng))
    return false;

  return Math.abs(nLat - pLat) < 0.0001 && Math.abs(nLng - pLng) < 0.0001;
});

PulsingUserMarker.displayName = 'PulsingUserMarker';

const styles = StyleSheet.create({
  container: {
    // 150px for 120px max ring = 15px padding per side.
    // Generous padding prevents Android bitmap clipping at ring edges.
    width: 150,
    height: 150,
    alignItems: 'center',
    justifyContent: 'center',
    // Android rasterizes marker children into a Bitmap — a transparent
    // background lets Android optimize away the "empty" space, producing
    // a smaller bitmap that clips the rings. A near-invisible background
    // forces the full 150px allocation in the bitmap.
    ...Platform.select({
      android: { backgroundColor: 'rgba(255,255,255,0.01)' },
      ios: { backgroundColor: 'transparent' },
    }),
  },
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#4285F4',
    borderWidth: 3,
    borderColor: '#ffffff',
    ...Platform.select({
      ios: {
        shadowColor: '#4285F4',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.4,
        shadowRadius: 4,
      },
    }),
  },
});

export default PulsingUserMarker;
