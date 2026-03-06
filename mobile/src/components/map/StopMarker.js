/**
 * StopMarker
 *
 * Orange numbered stop pin — JSX on iOS, PNG image on Android.
 * Supports stop indices 1–9.
 */
import { memo } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import Marker from './MarkerWrapper';
import { markerImages } from './markerImages';

const isIOS = Platform.OS === 'ios';

const StopPin = memo(({ number }) => (
  <View style={styles.wrapper} pointerEvents="none">
    <View style={styles.pin}>
      <Text style={styles.pinText} allowFontScaling={false}>{number}</Text>
    </View>
    <View style={styles.pinTail} />
  </View>
));
StopPin.displayName = 'StopPin';

const StopMarker = memo(({ coordinate, index }) => {
  const stopNumber = index + 1;

  if (!isIOS) {
    return (
      <Marker
        coordinate={coordinate}
        image={markerImages.stop[stopNumber] || markerImages.stop[1]}
        anchor={{ x: 0.5, y: 1 }}
        tracksViewChanges={false}
        zIndex={9}
      />
    );
  }

  return (
    <Marker
      coordinate={coordinate}
      anchor={{ x: 0.5, y: 1 }}
      tracksViewChanges={false}
      style={styles.markerFixed}
      zIndex={9}
      tappable={false}
    >
      <StopPin number={stopNumber} />
    </Marker>
  );
});

StopMarker.displayName = 'StopMarker';

export default StopMarker;

const PIN_SIZE = 26;

const styles = StyleSheet.create({
  markerFixed: {
    width: 30,
    height: 38,
  },
  wrapper: {
    width: 30,
    height: 38,
    alignItems: 'center',
  },
  pin: {
    width: PIN_SIZE,
    height: PIN_SIZE,
    borderRadius: PIN_SIZE / 2,
    backgroundColor: '#F6A623',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
  },
  pinText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  pinTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#F6A623',
    marginTop: -2,
  },
});
