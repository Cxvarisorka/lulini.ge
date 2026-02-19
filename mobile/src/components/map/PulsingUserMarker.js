/**
 * PulsingUserMarker
 *
 * Google Maps-style blue dot with animated pulsing rings.
 *
 * tracksViewChanges is always true — this is a single marker so the
 * performance cost is negligible, and it prevents the Android bitmap
 * freeze issue (where the marker becomes invisible if the bitmap is
 * captured while animation opacity is near 0).
 *
 * Android fix: elevation is removed from marker children — Android's
 * react-native-maps renders markers as bitmaps and elevation shadows
 * extend outside the root view bounds, causing clipping.
 */
import { useRef, useEffect, memo } from 'react';
import { View, Animated, StyleSheet, Platform } from 'react-native';
import { Marker } from 'react-native-maps';

const ANIM_DURATION = 2000;
const STAGGER_DELAY = 700;

const PulsingUserMarker = memo(
  ({ coordinate }) => {
    const lat = coordinate?.latitude;
    const lng = coordinate?.longitude;
    const isValid = isFinite(lat) && isFinite(lng);

    // All hooks MUST be called before any conditional return
    const pulse1 = useRef(new Animated.Value(0)).current;
    const pulse2 = useRef(new Animated.Value(0)).current;

    useEffect(() => {
      if (!isValid) return;

      const a1 = Animated.loop(
        Animated.timing(pulse1, {
          toValue: 1,
          duration: ANIM_DURATION,
          useNativeDriver: true,
        })
      );
      a1.start();

      const timer = setTimeout(() => {
        Animated.loop(
          Animated.timing(pulse2, {
            toValue: 1,
            duration: ANIM_DURATION,
            useNativeDriver: true,
          })
        ).start();
      }, STAGGER_DELAY);

      return () => {
        a1.stop();
        clearTimeout(timer);
      };
    }, [isValid, pulse1, pulse2]);

    // Conditional return AFTER all hooks
    if (!isValid) return null;

    const ring = (anim) => ({
      transform: [
        {
          scale: anim.interpolate({
            inputRange: [0, 1],
            outputRange: [0.3, 1],
          }),
        },
      ],
      opacity: anim.interpolate({
        inputRange: [0, 0.15, 1],
        outputRange: [0, 0.7, 0],
      }),
    });

    return (
      <Marker
        coordinate={{ latitude: lat, longitude: lng }}
        anchor={{ x: 0.5, y: 0.5 }}
        tracksViewChanges={true}
        zIndex={5}
      >
        <View style={styles.container}>
          <Animated.View style={[styles.ringOuter, ring(pulse2)]} />
          <Animated.View style={[styles.ringInner, ring(pulse1)]} />
          <View style={styles.dot} />
        </View>
      </Marker>
    );
  },
  (prev, next) => {
    const pLat = prev.coordinate?.latitude;
    const pLng = prev.coordinate?.longitude;
    const nLat = next.coordinate?.latitude;
    const nLng = next.coordinate?.longitude;

    // Always re-render if either coordinate is invalid
    if (!isFinite(pLat) || !isFinite(pLng) || !isFinite(nLat) || !isFinite(nLng))
      return false;

    // Skip re-render if moved less than ~11 meters
    return Math.abs(nLat - pLat) < 0.0001 && Math.abs(nLng - pLng) < 0.0001;
  }
);

PulsingUserMarker.displayName = 'PulsingUserMarker';

const styles = StyleSheet.create({
  container: {
    width: 100,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      android: { backgroundColor: 'rgba(255,255,255,0.01)' },
      ios: {},
    }),
  },
  ringOuter: {
    position: 'absolute',
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: 'rgba(66, 133, 244, 0.16)',
  },
  ringInner: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(66, 133, 244, 0.32)',
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
      android: {},
    }),
  },
});

export default PulsingUserMarker;
