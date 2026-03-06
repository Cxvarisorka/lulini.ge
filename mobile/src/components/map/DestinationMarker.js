/**
 * DestinationMarker
 *
 * Red destination pin — JSX on iOS, PNG image on Android.
 */
import { memo } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import Marker from './MarkerWrapper';
import { markerImages } from './markerImages';

const isIOS = Platform.OS === 'ios';

const DestinationPin = () => (
  <View style={styles.wrapper}>
    <View style={styles.pin}>
      <View style={styles.pinInner} />
    </View>
    <View style={styles.pinTail} />
  </View>
);

const DestinationMarker = memo(({ coordinate }) => {
  if (!isIOS) {
    return (
      <Marker
        coordinate={coordinate}
        image={markerImages.destination}
        anchor={{ x: 0.5, y: 1 }}
        tracksViewChanges={false}
        zIndex={10}
      />
    );
  }

  return (
    <Marker
      coordinate={coordinate}
      anchor={{ x: 0.5, y: 1 }}
      tracksViewChanges={false}
      style={styles.markerFixed}
      zIndex={10}
    >
      <DestinationPin />
    </Marker>
  );
});

DestinationMarker.displayName = 'DestinationMarker';

export default DestinationMarker;

const PIN_SIZE = 30;

const styles = StyleSheet.create({
  markerFixed: {
    width: 34,
    height: 42,
  },
  wrapper: {
    width: 34,
    height: 42,
    alignItems: 'center',
  },
  pin: {
    width: PIN_SIZE,
    height: PIN_SIZE,
    borderRadius: PIN_SIZE / 2,
    backgroundColor: '#E53E3E',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  pinInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
  },
  pinTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#E53E3E',
    marginTop: -2,
  },
});
