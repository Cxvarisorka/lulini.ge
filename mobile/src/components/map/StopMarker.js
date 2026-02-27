/**
 * StopMarker
 *
 * Orange stop pin with number label.
 * Uses a custom view (not pinColor) to avoid Apple Maps hiding native
 * annotations when the user zooms out.
 */
import React, { memo } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Marker } from 'react-native-maps';

const StopMarker = memo(({ coordinate, index, title, description }) => (
  <Marker
    coordinate={coordinate}
    anchor={{ x: 0.5, y: 0.5 }}
    tracksViewChanges={false}
    zIndex={9}
    title={title}
    description={description}
  >
    <View style={styles.container}>
      <View style={styles.pin}>
        <Text style={styles.label}>{index + 1}</Text>
      </View>
    </View>
  </Marker>
));

StopMarker.displayName = 'StopMarker';

const styles = StyleSheet.create({
  container: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      android: { backgroundColor: 'rgba(255,255,255,0.01)' },
      ios: {},
    }),
  },
  pin: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f97316',
    borderWidth: 3,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
      },
      android: {},
    }),
  },
  label: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
});

export default StopMarker;
